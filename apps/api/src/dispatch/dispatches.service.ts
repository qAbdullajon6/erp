import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Dispatch, DispatchStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { OrderWriter } from "../order-state/order-writer";
import { aggregate } from "../order-state/projection.policy";
import { PrismaService } from "../prisma/prisma.service";
import { AssignmentPolicy } from "./assignment/assignment.policy";
import { ACTIVE_DISPATCH_STATUSES } from "./assignment/assignment.queries";
import { translateDispatchWriteError } from "./dispatch-constraints";
import { ALLOWED_TRANSITIONS, allowedDispatchTransitions } from "./dispatch-transitions";
import { generateUniqueDispatchNumber } from "./dispatch-number.util";
import { CreateDispatchDto } from "./dto/create-dispatch.dto";
import { ListDispatchesQueryDto } from "./dto/list-dispatches-query.dto";
import { UpdateDispatchDto } from "./dto/update-dispatch.dto";
import { UpdateDispatchStatusDto } from "./dto/update-dispatch-status.dto";

/// The relations every dispatch response carries. Defined once so the write
/// paths cannot drift from the read paths (the detail endpoint additionally
/// loads statusHistory).
const DISPATCH_INCLUDE = {
  order: { include: { customer: true } },
  driver: true,
  vehicle: true,
  createdByUser: true,
} satisfies Prisma.DispatchInclude;

@Injectable()
export class DispatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly assignmentPolicy: AssignmentPolicy,
    /// The only object permitted to write Order state (AR5).
    private readonly orderWriter: OrderWriter,
  ) {}

  async list(organizationId: string, query: ListDispatchesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const where: Prisma.DispatchWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.search
        ? {
            OR: [
              { dispatchNumber: { contains: query.search, mode: "insensitive" } },
              { order: { orderNumber: { contains: query.search, mode: "insensitive" } } },
              { order: { customer: { companyName: { contains: query.search, mode: "insensitive" } } } },
              { driver: { firstName: { contains: query.search, mode: "insensitive" } } },
              { driver: { lastName: { contains: query.search, mode: "insensitive" } } },
              { driver: { employeeCode: { contains: query.search, mode: "insensitive" } } },
              { vehicle: { vehicleCode: { contains: query.search, mode: "insensitive" } } },
              { vehicle: { plateNumber: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            pickupDateScheduled: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const orderByMap: Record<string, any> = {
      createdAt: { createdAt: sortOrder },
      pickupDateScheduled: { pickupDateScheduled: sortOrder },
      deliveryDateScheduled: { deliveryDateScheduled: sortOrder },
      status: { status: sortOrder },
    };

    const [rows, total] = await Promise.all([
      this.prisma.dispatch.findMany({
        where,
        include: DISPATCH_INCLUDE,
        orderBy: orderByMap[sortBy] || { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dispatch.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const dispatch = await this.findOrThrow(organizationId, id);
    const fullDispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: { ...DISPATCH_INCLUDE, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    return this.toResponse(fullDispatch!);
  }

  async create(organizationId: string, dto: CreateDispatchDto, actor: CurrentUserPayload) {
    // The dispatch, its first history row AND the order projection are one fact.
    // A dispatch with no history, or an order that disagrees with the dispatch
    // that governs it, are both corrupt states. They commit together or not at
    // all (AR2).
    const dispatch = await this.runInTransaction(async (tx) => {
      const created = await this.createInTx(tx, organizationId, dto, actor);
      // R3 — the order is a projection. A DRAFT dispatch projects nothing, so in
      // practice this is a no-op here; it runs anyway because "every dispatch
      // write re-derives its order" is the invariant, not a special case.
      await this.orderWriter.project(tx, organizationId, created.orderId, actor);
      return this.loadForResponse(tx, created.id);
    });

    // Audit is deliberately OUTSIDE the transaction: it is an observation of
    // what happened, not part of the fact itself, and a failure to record it
    // must not roll back a legitimate business write.
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.create",
      entityType: "Dispatch",
      entityId: dispatch.id,
      metadata: {
        dispatchNumber: dispatch.dispatchNumber,
        orderId: dto.orderId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
      },
    });

    return this.toResponse(dispatch);
  }

  async update(organizationId: string, id: string, dto: UpdateDispatchDto, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "DELIVERED" || dispatch.status === "CANCELLED") {
      throw new ConflictException(`Cannot update a dispatch with status ${dispatch.status}`);
    }

    const reassigned = await this.runInTransaction(async (tx) => {
      // Reassignment (Task 8.7). Returns null when the driver and vehicle are
      // unchanged, so a notes-only PATCH does exactly what it always did.
      const change = await this.reassignInTx(
        tx,
        organizationId,
        dispatch,
        { driverId: dto.driverId, vehicleId: dto.vehicleId },
        actor,
        dto.notes ? `Reassigned: ${dto.notes}` : "Reassigned",
      );

      if (dto.notes !== undefined) {
        await tx.dispatch.update({ where: { id }, data: { notes: dto.notes } });
      }

      if (change) {
        // R3 — the order's driverId/vehicleId are projections of the dispatch's,
        // so they must be re-derived in this same transaction (AR2, AR5).
        await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor);
      }

      return change !== null;
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      // A notes edit stays "dispatch.update", exactly as before. Reassignment is a
      // new capability, so it gets its own action rather than changing an existing
      // one.
      action: reassigned ? "dispatch.reassign" : "dispatch.update",
      entityType: "Dispatch",
      entityId: id,
      metadata: reassigned
        ? {
            from: { driverId: dispatch.driverId, vehicleId: dispatch.vehicleId },
            to: { driverId: dto.driverId ?? dispatch.driverId, vehicleId: dto.vehicleId ?? dispatch.vehicleId },
          }
        : { changes: dto },
    });

    const updated = await this.prisma.dispatch.findUniqueOrThrow({
      where: { id },
      include: DISPATCH_INCLUDE,
    });
    return this.toResponse(updated);
  }

  async updateStatus(organizationId: string, id: string, dto: UpdateDispatchStatusDto, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    const updated = await this.runInTransaction(async (tx) => {
      await this.transitionInTx(tx, organizationId, dispatch, dto.status, actor, dto.note);
      // R3 — the dispatch moved, so the order it executes must be re-derived, in
      // this same transaction. This is the line that makes Order a projection.
      await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, dto.note);
      return this.loadForResponse(tx, id);
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.status_change",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from: dispatch.status, to: dto.status, note: dto.note },
    });

    return this.toResponse(updated);
  }

  async cancel(organizationId: string, id: string, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "DELIVERED" || dispatch.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel a dispatch with status ${dispatch.status}`);
    }

    const cancelled = await this.runInTransaction(async (tx) => {
      await this.cancelInTx(tx, organizationId, id, actor, "Dispatch cancelled");
      // R8 — the driver and vehicle are released and the order falls back into
      // the unassigned pool. Unless the order was cancelled commercially, in
      // which case the projection leaves it alone (Amendment B, Z2).
      await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, "Dispatch cancelled");
      return this.loadForResponse(tx, id);
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.cancel",
      entityType: "Dispatch",
      entityId: id,
      metadata: { previousStatus: dispatch.status },
    });

    return this.toResponse(cancelled);
  }

  // ---------------------------------------------------------------------------
  // Transaction-scoped primitives.
  //
  // These are the dispatch operations OrdersService drives when it turns an order
  // request into a dispatch movement (R3). They take the CALLER'S transaction, so
  // an order-initiated dispatch change and the order projection that follows it
  // are a single atomic write (AR2). They deliberately do not audit — the public
  // method that owns the request does that, once, after the commit.
  // ---------------------------------------------------------------------------

  /// Creates a DRAFT dispatch, enforcing every rule that governs whether it may
  /// exist. Does NOT project — the caller decides when the order is re-derived,
  /// because a caller that is about to advance the dispatch further should project
  /// once at the end rather than at every step.
  async createInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: CreateDispatchDto,
    actor: CurrentUserPayload,
  ): Promise<Dispatch> {
    const order = await tx.order.findFirst({ where: { id: dto.orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot create a dispatch for an order with status ${order.status}`);
    }

    // Driver/vehicle eligibility, cargo capacity and double-booking are all one
    // question — "may these two take this trip?" — and AssignmentPolicy is the
    // only thing allowed to answer it (AR1, AR4).
    await this.assignmentPolicy.assertAssignable({
      organizationId,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      window: { pickupDate: order.pickupDate, deliveryDate: order.deliveryDate },
      cargoWeightKg: order.cargoWeightKg,
      cargoVolumeM3: order.cargoVolumeM3,
      // This order's own commitment is not a competing one.
      exclude: { orderId: order.id },
    });

    // R2 — one live dispatch per order.
    const existing = await tx.dispatch.findFirst({
      where: { organizationId, orderId: dto.orderId, status: { in: ACTIVE_DISPATCH_STATUSES } },
    });
    if (existing) {
      throw new ConflictException(`Order already has an active dispatch: ${existing.dispatchNumber}`);
    }

    const dispatchNumber = await generateUniqueDispatchNumber(tx, organizationId);

    const created = await tx.dispatch.create({
      data: {
        organizationId,
        dispatchNumber,
        orderId: dto.orderId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        createdByUserId: actor.userId,
        pickupDateScheduled: order.pickupDate,
        deliveryDateScheduled: order.deliveryDate,
        status: "DRAFT",
        notes: dto.notes,
      },
    });
    await this.recordStatusChange(tx, organizationId, created.id, "DRAFT", actor, "Dispatch created");
    // R9 — the assignment history opens here. A dispatch has a driver and a vehicle
    // from the moment it exists, so there is an open assignment from that moment.
    await this.openAssignment(
      tx,
      organizationId,
      created.id,
      dto.driverId,
      dto.vehicleId,
      actor,
      "Initial assignment",
    );

    return created;
  }

  /// Changes the driver and/or vehicle of a dispatch (R9, R5). THE reassignment,
  /// and the only one.
  ///
  /// It is append-only: the open DispatchAssignment is closed with an
  /// `unassignedAt`, then a new one is opened. Nothing is overwritten, so "who was
  /// driving this on Tuesday?" always has an answer. The partial unique index from
  /// Task 8.2 makes a second OPEN row physically impossible, and Task 8.3
  /// translates that violation into a domain conflict — so even a lost race cannot
  /// produce two current drivers.
  ///
  /// Returns null when nothing actually changed, so the caller can skip the
  /// projection and treat the request as the no-op it is.
  async reassignInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dispatch: Dispatch,
    next: { driverId?: string; vehicleId?: string },
    actor: CurrentUserPayload,
    reason: string,
  ): Promise<Dispatch | null> {
    const driverId = next.driverId ?? dispatch.driverId;
    const vehicleId = next.vehicleId ?? dispatch.vehicleId;

    if (driverId === dispatch.driverId && vehicleId === dispatch.vehicleId) {
      return null;
    }

    const order = await tx.order.findFirstOrThrow({
      where: { id: dispatch.orderId, organizationId },
    });

    // The rules that governed the original assignment govern this one too (AR1,
    // AR4). This dispatch's own order is excluded, so it does not conflict with the
    // very resources it is holding — those are the ones being replaced.
    await this.assignmentPolicy.assertAssignable({
      organizationId,
      driverId,
      vehicleId,
      window: {
        pickupDate: dispatch.pickupDateScheduled,
        deliveryDate: dispatch.deliveryDateScheduled,
      },
      cargoWeightKg: order.cargoWeightKg,
      cargoVolumeM3: order.cargoVolumeM3,
      exclude: { orderId: dispatch.orderId, dispatchId: dispatch.id },
    });

    await tx.dispatch.update({ where: { id: dispatch.id }, data: { driverId, vehicleId } });

    await this.closeOpenAssignment(tx, dispatch.id, actor, reason);
    await this.openAssignment(tx, organizationId, dispatch.id, driverId, vehicleId, actor, reason);

    return tx.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
  }

  /// Opens the assignment row that says "these two are on this job, from now" (R9).
  ///
  /// The partial unique index permits exactly one row per dispatch with
  /// `unassignedAt IS NULL`, so this can only succeed once the previous one is
  /// closed.
  private async openAssignment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dispatchId: string,
    driverId: string,
    vehicleId: string,
    actor: CurrentUserPayload,
    reason: string,
  ): Promise<void> {
    await tx.dispatchAssignment.create({
      data: {
        organizationId,
        dispatchId,
        driverId,
        vehicleId,
        changedByUserId: actor.userId,
        reason,
      },
    });
  }

  /// Closes whichever assignment is currently open, if any.
  ///
  /// `updateMany`, not `update`: a dispatch created by the Phase 5 backfill has no
  /// open row to close, because its assignment history genuinely never existed and
  /// was not invented (TD-004). Matching zero rows is a valid outcome here, not an
  /// error.
  private async closeOpenAssignment(
    tx: Prisma.TransactionClient,
    dispatchId: string,
    actor: CurrentUserPayload,
    reason: string,
  ): Promise<void> {
    await tx.dispatchAssignment.updateMany({
      where: { dispatchId, unassignedAt: null },
      data: { unassignedAt: new Date(), changedByUserId: actor.userId, reason },
    });
  }

  /// Moves a dispatch one legal step (R13), with the compare-and-set from Task 8.3.
  async transitionInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dispatch: Dispatch,
    target: DispatchStatus,
    actor: CurrentUserPayload,
    note?: string,
  ): Promise<Dispatch> {
    const allowed = ALLOWED_TRANSITIONS[dispatch.status];
    if (!allowed.includes(target)) {
      throw new ConflictException(`Cannot transition a dispatch from ${dispatch.status} to ${target}`);
    }

    const data: Prisma.DispatchUpdateManyMutationInput = { status: target };
    // Actual times are captured here and ONLY here, so the value the order's
    // deliveredAt is projected from (R7) is the very one the dispatch recorded.
    if (target === "IN_TRANSIT" && !dispatch.pickupDateActual) {
      data.pickupDateActual = new Date();
    }
    if (target === "DELIVERED" && !dispatch.deliveryDateActual) {
      data.deliveryDateActual = new Date();
    }

    // Compare-and-set on the status we just validated against (R13). Reading the
    // status and then writing is a check-then-write: two concurrent requests both
    // read IN_TRANSIT, both find their transition legal, and both write. Pinning
    // `status` in the WHERE clause means the loser matches zero rows instead of
    // applying its transition on top of the new state.
    const result = await tx.dispatch.updateMany({
      where: { id: dispatch.id, organizationId, status: dispatch.status },
      data,
    });
    if (result.count !== 1) {
      await this.raiseLostTransitionRace(tx, organizationId, dispatch.id, target);
    }

    await this.recordStatusChange(tx, organizationId, dispatch.id, target, actor, note);

    // CANCELLED is reachable through TWO doors — POST /:id/cancel and
    // POST /:id/status, because ALLOWED_TRANSITIONS lists it as a legal target from
    // every non-terminal state. Both must close the assignment ledger, or a driver
    // stays recorded as being on a job that no longer exists (R9).
    if (target === "CANCELLED") {
      await this.closeOpenAssignment(tx, dispatch.id, actor, note ?? "Dispatch cancelled");
    }

    // Returned so a caller walking several steps compares against what it just
    // wrote, and so DELIVERED carries the deliveryDateActual the projection needs.
    return tx.dispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
  }

  /// Cancels a dispatch from any non-terminal state.
  async cancelInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    actor: CurrentUserPayload,
    note: string,
  ): Promise<void> {
    // The guard is the whole non-terminal set: a dispatch may be cancelled from
    // any state except DELIVERED/CANCELLED, so it does not matter WHICH
    // non-terminal state it is in, only that a concurrent request has not already
    // made it terminal.
    const result = await tx.dispatch.updateMany({
      where: { id, organizationId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });
    if (result.count !== 1) {
      await this.raiseLostCancelRace(tx, organizationId, id);
    }

    await this.recordStatusChange(tx, organizationId, id, "CANCELLED", actor, note);
    // The job is off, so nobody is on it any more. Leaving the assignment open
    // would claim a driver is currently working a dispatch that no longer exists.
    await this.closeOpenAssignment(tx, id, actor, note);
  }

  /// The dispatch currently executing an order, if any (R2).
  async activeDispatchForOrder(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
  ): Promise<Dispatch | null> {
    return tx.dispatch.findFirst({
      where: { organizationId, orderId, status: { in: ACTIVE_DISPATCH_STATUSES } },
    });
  }

  /// The dispatch an order-level request should drive: the furthest-progressed
  /// one that has not finished. A DRAFT counts — activating a draft is exactly
  /// what "move this order to ASSIGNED" means.
  async drivableDispatchForOrder(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orderId: string,
  ): Promise<Dispatch | null> {
    const candidates = await tx.dispatch.findMany({
      where: { organizationId, orderId, status: { notIn: ["CANCELLED", "DELIVERED"] } },
    });
    return aggregate(candidates);
  }

  /// Opens a transaction for a caller outside this service (OrdersService), with
  /// the same constraint-error translation every dispatch write gets. Exposed so
  /// there is exactly one implementation of "a dispatch transaction" (AR1).
  async inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.runInTransaction(work);
  }

  /// Runs a set of dispatch writes as one atomic unit (AR2), translating any
  /// constraint violation the database raises into a domain error on the way out.
  ///
  /// Every business write goes through here, so there is exactly one place where
  /// Postgres/Prisma error shapes are allowed to exist — nothing above this line
  /// ever sees a 23P01 or a P2002.
  private async runInTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      // Rethrows anything it does not recognise (including the domain errors
      // thrown by `work` itself) untouched.
      translateDispatchWriteError(error);
    }
  }

  /// A concurrent request changed the status between our read and our write, so
  /// our compare-and-set matched nothing. Re-read inside the same transaction to
  /// find out what actually happened, and report it the way the caller would
  /// have seen it had they arrived a moment later — a 409 naming the real
  /// current status, never a 500 and never a silent no-op.
  private async raiseLostTransitionRace(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    target: DispatchStatus,
  ): Promise<never> {
    const current = await tx.dispatch.findFirst({ where: { id, organizationId } });
    if (!current) {
      throw new NotFoundException("Dispatch not found");
    }
    throw new ConflictException(`Cannot transition a dispatch from ${current.status} to ${target}`);
  }

  private async raiseLostCancelRace(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<never> {
    const current = await tx.dispatch.findFirst({ where: { id, organizationId } });
    if (!current) {
      throw new NotFoundException("Dispatch not found");
    }
    throw new ConflictException(`Cannot cancel a dispatch with status ${current.status}`);
  }

  /// Re-reads a dispatch with its relations after a compare-and-set, which (being
  /// an updateMany) cannot return the row itself.
  private async loadForResponse(tx: Prisma.TransactionClient, id: string) {
    const dispatch = await tx.dispatch.findUnique({ where: { id }, include: DISPATCH_INCLUDE });
    return dispatch!;
  }

  private async findOrThrow(organizationId: string, id: string): Promise<Dispatch> {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id, organizationId },
    });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }
    return dispatch;
  }

  /// Takes the transaction client rather than the base one: the history row is
  /// part of the status change, not a follow-up to it. Writing it on `this.prisma`
  /// would put it outside the caller's transaction, so a rollback would leave the
  /// history behind (or, worse, a crash between the two writes would leave a
  /// status change with no record of who made it).
  private async recordStatusChange(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dispatchId: string,
    status: DispatchStatus,
    actor: CurrentUserPayload,
    note?: string,
  ) {
    await tx.dispatchStatusHistory.create({
      data: {
        organizationId,
        dispatchId,
        status,
        changedByUserId: actor.userId,
        note,
      },
    });
  }

  private toResponse(dispatch: any) {
    return {
      id: dispatch.id,
      organizationId: dispatch.organizationId,
      dispatchNumber: dispatch.dispatchNumber,
      orderId: dispatch.orderId,
      order: dispatch.order
        ? {
            id: dispatch.order.id,
            orderNumber: dispatch.order.orderNumber,
            customer: dispatch.order.customer
              ? {
                  id: dispatch.order.customer.id,
                  companyName: dispatch.order.customer.companyName,
                  contactName: dispatch.order.customer.contactName,
                }
              : null,
            status: dispatch.order.status,
            // The dispatch detail screen shows where the trip starts and ends;
            // the order relation is already loaded, so this costs no extra query.
            pickupAddress: dispatch.order.pickupAddress,
            pickupCity: dispatch.order.pickupCity,
            pickupDate: dispatch.order.pickupDate,
            deliveryAddress: dispatch.order.deliveryAddress,
            deliveryCity: dispatch.order.deliveryCity,
            deliveryDate: dispatch.order.deliveryDate,
          }
        : null,
      driverId: dispatch.driverId,
      driver: dispatch.driver
        ? {
            id: dispatch.driver.id,
            employeeCode: dispatch.driver.employeeCode,
            firstName: dispatch.driver.firstName,
            lastName: dispatch.driver.lastName,
            phone: dispatch.driver.phone,
            status: dispatch.driver.status,
          }
        : null,
      vehicleId: dispatch.vehicleId,
      vehicle: dispatch.vehicle
        ? {
            id: dispatch.vehicle.id,
            vehicleCode: dispatch.vehicle.vehicleCode,
            plateNumber: dispatch.vehicle.plateNumber,
            type: dispatch.vehicle.type,
            status: dispatch.vehicle.status,
          }
        : null,
      createdByUserId: dispatch.createdByUserId,
      createdBy: dispatch.createdByUser
        ? {
            id: dispatch.createdByUser.id,
            email: dispatch.createdByUser.email,
            firstName: dispatch.createdByUser.firstName,
            lastName: dispatch.createdByUser.lastName,
          }
        : null,
      status: dispatch.status,
      /// Read-only, derived, additive (Task 8.10). Computed from the single
      /// ALLOWED_TRANSITIONS table above — so the client is not told a second
      /// version of the rule, it is told THE rule (AR1). An empty array means the
      /// dispatch is terminal.
      ///
      /// CANCELLED appears here for every non-terminal dispatch. The client may
      /// reach it through either POST /:id/status or POST /:id/cancel; both end in
      /// the same transition.
      allowedTransitions: allowedDispatchTransitions(dispatch.status as DispatchStatus),
      pickupDateScheduled: dispatch.pickupDateScheduled,
      pickupDateActual: dispatch.pickupDateActual,
      deliveryDateScheduled: dispatch.deliveryDateScheduled,
      deliveryDateActual: dispatch.deliveryDateActual,
      notes: dispatch.notes,
      statusHistory: dispatch.statusHistory,
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
    };
  }
}
