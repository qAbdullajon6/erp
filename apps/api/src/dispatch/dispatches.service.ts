import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { Dispatch, DispatchStatus, Prisma } from "@prisma/client";
import { createReadStream } from "fs";
import { join } from "path";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { OrderWriter } from "../order-state/order-writer";
import { aggregate } from "../order-state/projection.policy";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../telematics/tracking/tracking.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { AssignmentPolicy } from "./assignment/assignment.policy";
import { ACTIVE_DISPATCH_STATUSES } from "./assignment/assignment.queries";
import { translateDispatchWriteError } from "./dispatch-constraints";
import { ALLOWED_TRANSITIONS, allowedDispatchTransitions } from "./dispatch-transitions";
import { generateUniqueDispatchNumber } from "./dispatch-number.util";
import { notifyDriverOfAssignment } from "./driver/driver-assignment-notify";
import { CreateDispatchDto } from "./dto/create-dispatch.dto";
import { ListDispatchesQueryDto } from "./dto/list-dispatches-query.dto";
import { UpdateDispatchDto } from "./dto/update-dispatch.dto";
import { UpdateDispatchStatusDto } from "./dto/update-dispatch-status.dto";
import { RescheduleDispatchDto } from "./dto/reschedule-dispatch.dto";

/// Same physical layout the driver app writes to (driver-workspace.service.ts)
/// — this service only ever reads it, org/dispatch-scoped, never writes.
const PROOF_UPLOAD_ROOT = join(process.cwd(), "uploads", "driver-proofs");

/// The relations every dispatch response carries. Defined once so the write
/// paths cannot drift from the read paths (the detail endpoint additionally
/// loads statusHistory).
const DISPATCH_INCLUDE = {
  order: { include: { customer: true } },
  driver: true,
  vehicle: true,
  createdByUser: true,
} satisfies Prisma.DispatchInclude;

const DISPATCH_DETAIL_INCLUDE = {
  ...DISPATCH_INCLUDE,
  statusHistory: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.DispatchInclude;

type DispatchDetail = Prisma.DispatchGetPayload<{ include: typeof DISPATCH_DETAIL_INCLUDE }>;
type DispatchWithRelations = Prisma.DispatchGetPayload<{ include: typeof DISPATCH_INCLUDE }> & {
  statusHistory?: DispatchDetail["statusHistory"];
};

@Injectable()
export class DispatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly assignmentPolicy: AssignmentPolicy,
    /// The only object permitted to write Order state (AR5).
    private readonly orderWriter: OrderWriter,
    private readonly workflowEvents: WorkflowEventService,
    private readonly tracking: TrackingService,
  ) {}

  /// Fires order.status_changed for a projection this write just caused, the
  /// same event orders.service.ts's own direct /orders/:id/status path already
  /// emits — so a workflow author gets one trigger that means "the order's
  /// status moved" regardless of whether the Dispatch Board, the driver app, or
  /// staff calling the order endpoint directly is what moved it.
  ///
  /// Gated on the STATUS actually differing, not OrderWriter.project()'s
  /// `changed` flag alone: a driver/vehicle reassignment with no status move
  /// also reports `changed: true` (see OrderProjection.settle()), and firing
  /// this with from === to would misrepresent a reassignment as a transition.
  /// Not private: DriverDispatchService (the driver-app status path) already
  /// injects this service and projects the order through the same
  /// OrderWriter — reusing this keeps both callers' order.status_changed
  /// semantics identical instead of maintaining two copies of the gate.
  emitOrderStatusChangedIfMoved(
    organizationId: string,
    projected: { order: { id: string; orderNumber: string; status: string }; previousStatus: string; changed: boolean },
  ): void {
    if (!projected.changed || projected.previousStatus === projected.order.status) return;
    void this.workflowEvents.emit(organizationId, "order.status_changed", {
      id: projected.order.id,
      orderNumber: projected.order.orderNumber,
      from: projected.previousStatus,
      to: projected.order.status,
    });
  }

  async list(organizationId: string, query: ListDispatchesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const where: Prisma.DispatchWhereInput = {
      organizationId,
      ...(query.statuses?.length
        ? { status: { in: query.statuses } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.customerId ? { order: { customerId: query.customerId } } : {}),
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

    const orderByMap: Record<string, Prisma.DispatchOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      pickupDateScheduled: { pickupDateScheduled: sortOrder },
      deliveryDateScheduled: { deliveryDateScheduled: sortOrder },
      status: { status: sortOrder },
    };

    // $transaction, not Promise.all: the count and the page must agree on the same
    // snapshot, or a concurrent write between the two reads can show a total that
    // does not match the rows actually returned.
    const [rows, total] = await this.prisma.$transaction([
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
    await this.findOrThrow(organizationId, id);
    const fullDispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: DISPATCH_DETAIL_INCLUDE,
    });
    return this.toResponse(fullDispatch!);
  }

  /// Admin-facing read of driver-submitted Proof of Delivery. Deliberately a
  /// separate path from DriverWorkspaceService's driver-owned equivalents
  /// (listProofs/assertDeliveredChecklist) — those are scoped to "my own
  /// dispatch", this is scoped to "any dispatch in my org" (ROLES_READ), and
  /// the two must never be allowed to converge into one ownership check.
  async getProofOfDelivery(organizationId: string, id: string) {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id, organizationId },
      include: { driver: true },
    });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }

    const proofs = await this.prisma.dispatchDeliveryProof.findMany({
      where: { organizationId, dispatchId: id },
      include: { driver: true },
      orderBy: { createdAt: "asc" },
    });

    const isMetaOnly = (p: (typeof proofs)[number]) =>
      Boolean((p.metadata as { metaOnly?: boolean } | null)?.metaOnly);
    const photos = proofs.filter((p) => p.type === "PHOTO" && !isMetaOnly(p));
    const signatures = proofs.filter((p) => p.type === "SIGNATURE" && !isMetaOnly(p));

    // Receiver info can land on any row (driver-workspace's updatePodMeta always
    // patches the *latest* proof row at the time it was called, which is not
    // necessarily the last row by createdAt now) — so scan all rows, not just
    // the newest, mirroring DriverWorkspaceService.assertDeliveredChecklist.
    const withReceiverName = proofs.find((p) => p.receiverName);
    const withReceiverPhone = proofs.find((p) => p.receiverPhone);
    const withNotes = proofs.find((p) => p.notes);
    const withOdometer = proofs.find((p) => p.odometerKm != null);
    const proofDriver = proofs.find((p) => p.driver)?.driver ?? null;
    const driver = dispatch.driver ?? proofDriver;

    const toFileMeta = (p: (typeof proofs)[number]) => ({
      id: p.id,
      fileName: p.fileName,
      mimeType: p.mimeType,
      fileSize: p.fileSizeBytes ?? 0,
      uploadedAt: p.createdAt.toISOString(),
      uploadedByUserId: p.uploadedByUserId,
    });

    return {
      dispatchId: dispatch.id,
      orderId: dispatch.orderId,
      status: dispatch.status,
      deliveryDateScheduled: dispatch.deliveryDateScheduled,
      deliveryDateActual: dispatch.deliveryDateActual,
      driver: driver
        ? {
            id: driver.id,
            employeeCode: driver.employeeCode,
            firstName: driver.firstName,
            lastName: driver.lastName,
            phone: driver.phone,
          }
        : null,
      receiverName: withReceiverName?.receiverName ?? null,
      receiverPhone: withReceiverPhone?.receiverPhone ?? null,
      notes: withNotes?.notes ?? null,
      odometerKm: withOdometer?.odometerKm?.toString() ?? null,
      // The only GPS this flow captures — written on the AT_PICKUP transition,
      // not a delivery-point reading. Labeled explicitly so the UI never implies
      // it is the drop-off location.
      arrivalLocation:
        dispatch.arrivalLat != null && dispatch.arrivalLng != null
          ? {
              label: "Arrival (pickup) location",
              lat: dispatch.arrivalLat.toString(),
              lng: dispatch.arrivalLng.toString(),
            }
          : null,
      photos: photos.map(toFileMeta),
      signatures: signatures.map(toFileMeta),
    };
  }

  /// Streams a single proof file by id, scoped to this org + this dispatch —
  /// never a bare storage path, so a caller cannot walk to another org's file
  /// by guessing an id. Meta-only marker rows (zero-byte pod-meta.json) are
  /// excluded from getProofOfDelivery's lists, so they are never reachable here
  /// through the UI, but the type/org/dispatch scoping holds regardless.
  async getProofFile(
    organizationId: string,
    id: string,
    proofId: string,
  ): Promise<{ file: StreamableFile; mimeType: string; fileName: string }> {
    const dispatch = await this.prisma.dispatch.findFirst({ where: { id, organizationId } });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }
    const proof = await this.prisma.dispatchDeliveryProof.findFirst({
      where: { id: proofId, organizationId, dispatchId: id },
    });
    if (!proof) {
      throw new NotFoundException("Proof not found");
    }
    return {
      file: new StreamableFile(createReadStream(join(PROOF_UPLOAD_ROOT, proof.storagePath))),
      mimeType: proof.mimeType,
      fileName: proof.fileName,
    };
  }

  async create(organizationId: string, dto: CreateDispatchDto, actor: CurrentUserPayload) {
    // The dispatch, its first history row AND the order projection are one fact.
    // A dispatch with no history, or an order that disagrees with the dispatch
    // that governs it, are both corrupt states. They commit together or not at
    // all (AR2).
    const { dispatch, projected } = await this.runInTransaction(async (tx) => {
      const created = await this.createInTx(tx, organizationId, dto, actor);
      // R3 — the order is a projection. A DRAFT dispatch projects nothing, so in
      // practice this is a no-op here; it runs anyway because "every dispatch
      // write re-derives its order" is the invariant, not a special case.
      const projected = await this.orderWriter.project(tx, organizationId, created.orderId, actor);
      return { dispatch: await this.loadForResponse(tx, created.id), projected };
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

    void this.workflowEvents.emit(organizationId, "dispatch.created", { id: dispatch.id, dispatchNumber: dispatch.dispatchNumber, orderId: dto.orderId, driverId: dto.driverId, vehicleId: dto.vehicleId });
    this.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toResponse(dispatch);
  }

  async update(organizationId: string, id: string, dto: UpdateDispatchDto, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "DELIVERED" || dispatch.status === "CANCELLED") {
      throw new ConflictException(`Cannot update a dispatch with status ${dispatch.status}`);
    }

    const previousVehicleId = dispatch.vehicleId;
    const previousDriverId = dispatch.driverId;

    let projected: Awaited<ReturnType<OrderWriter["project"]>> | null = null;
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
        projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor);
      }

      return change;
    });

    // In practice this never fires a real status transition — a driver/vehicle
    // swap alone never moves the dispatch's own status, so the order's
    // projected status cannot move either — but wiring it keeps this call site
    // consistent with every other path that projects the order.
    if (projected) this.emitOrderStatusChangedIfMoved(organizationId, projected);

    if (reassigned && previousVehicleId !== reassigned.vehicleId) {
      await this.tracking
        .endSessionsOnVehicleReassign(organizationId, {
          previousVehicleId,
          dispatchId: id,
          driverId: previousDriverId,
        })
        .catch(() => undefined);
    }

    if (reassigned && previousDriverId !== reassigned.driverId) {
      await notifyDriverOfAssignment(this.prisma, {
        organizationId,
        driverId: reassigned.driverId,
        dispatchId: reassigned.id,
        dispatchNumber: reassigned.dispatchNumber,
        reason: "reassigned",
      }).catch(() => undefined);
    }

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
            from: { driverId: previousDriverId, vehicleId: previousVehicleId },
            to: { driverId: reassigned.driverId, vehicleId: reassigned.vehicleId },
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

    const { updated, projected } = await this.runInTransaction(async (tx) => {
      await this.transitionInTx(tx, organizationId, dispatch, dto.status, actor, dto.note);
      // R3 — the dispatch moved, so the order it executes must be re-derived, in
      // this same transaction. This is the line that makes Order a projection.
      const projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, dto.note);
      return { updated: await this.loadForResponse(tx, id), projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.status_change",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from: dispatch.status, to: dto.status, note: dto.note },
    });

    if (dto.status === "ASSIGNED" && dispatch.status === "DRAFT") {
      await notifyDriverOfAssignment(this.prisma, {
        organizationId,
        driverId: updated.driverId,
        dispatchId: id,
        dispatchNumber: updated.dispatchNumber,
        reason: "assigned",
      }).catch(() => undefined);
    }

    void this.workflowEvents.emit(organizationId, "dispatch.status_changed", { id, dispatchNumber: dispatch.dispatchNumber, orderId: dispatch.orderId, from: dispatch.status, to: dto.status });
    if (dto.status === "DELIVERED") {
      void this.workflowEvents.emit(organizationId, "dispatch.completed", { id, dispatchNumber: dispatch.dispatchNumber, orderId: dispatch.orderId });
    }
    if (dto.status === "DELIVERED" || dto.status === "CANCELLED") {
      await this.tracking.endSessionsForDispatch(organizationId, id).catch(() => undefined);
    }
    this.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toResponse(updated);
  }

  /// Calendar drag / resize — moves the scheduled pickup (and delivery) window.
  ///
  /// Terminal trips are frozen. Overlap is re-checked through AssignmentPolicy
  /// (and the GiST exclusion constraints) so a drag onto a busy driver/vehicle
  /// surfaces the same 409 the reassign path already uses.
  async reschedule(
    organizationId: string,
    id: string,
    dto: RescheduleDispatchDto,
    actor: CurrentUserPayload,
  ) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "DELIVERED" || dispatch.status === "CANCELLED") {
      throw new ConflictException(
        `Cannot reschedule a dispatch with status ${dispatch.status}`,
      );
    }

    const nextPickup = new Date(dto.pickupDateScheduled);
    if (Number.isNaN(nextPickup.getTime())) {
      throw new BadRequestException("Invalid pickupDateScheduled");
    }

    const previousDurationMs = Math.max(
      30 * 60 * 1000,
      dispatch.deliveryDateScheduled.getTime() - dispatch.pickupDateScheduled.getTime(),
    );

    let nextDelivery: Date;
    if (dto.deliveryDateScheduled) {
      nextDelivery = new Date(dto.deliveryDateScheduled);
      if (Number.isNaN(nextDelivery.getTime())) {
        throw new BadRequestException("Invalid deliveryDateScheduled");
      }
    } else {
      nextDelivery = new Date(nextPickup.getTime() + previousDurationMs);
    }

    if (nextDelivery.getTime() <= nextPickup.getTime()) {
      throw new BadRequestException("Delivery must be after pickup");
    }

    const from = {
      pickupDateScheduled: dispatch.pickupDateScheduled.toISOString(),
      deliveryDateScheduled: dispatch.deliveryDateScheduled.toISOString(),
    };
    const to = {
      pickupDateScheduled: nextPickup.toISOString(),
      deliveryDateScheduled: nextDelivery.toISOString(),
    };

    if (
      from.pickupDateScheduled === to.pickupDateScheduled &&
      from.deliveryDateScheduled === to.deliveryDateScheduled
    ) {
      return this.toResponse(
        await this.prisma.dispatch.findUniqueOrThrow({
          where: { id },
          include: DISPATCH_INCLUDE,
        }),
      );
    }

    const order = await this.prisma.order.findFirstOrThrow({
      where: { id: dispatch.orderId, organizationId },
    });

    await this.assignmentPolicy.assertAssignable({
      organizationId,
      driverId: dispatch.driverId,
      vehicleId: dispatch.vehicleId,
      window: { pickupDate: nextPickup, deliveryDate: nextDelivery },
      cargoWeightKg: order.cargoWeightKg,
      cargoVolumeM3: order.cargoVolumeM3,
      exclude: { orderId: dispatch.orderId, dispatchId: dispatch.id },
    });

    const updated = await this.runInTransaction(async (tx) => {
      const result = await tx.dispatch.updateMany({
        where: {
          id,
          organizationId,
          status: { notIn: ["DELIVERED", "CANCELLED"] },
          pickupDateScheduled: dispatch.pickupDateScheduled,
          deliveryDateScheduled: dispatch.deliveryDateScheduled,
        },
        data: {
          pickupDateScheduled: nextPickup,
          deliveryDateScheduled: nextDelivery,
        },
      });
      if (result.count !== 1) {
        throw new ConflictException("Dispatch schedule changed again — refresh and retry");
      }

      // Keep the order's commercial dates in lockstep with the ops window so
      // list/detail screens do not show a stale plan after a calendar drag.
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          pickupDate: nextPickup,
          deliveryDate: nextDelivery,
        },
      });

      return this.loadForResponse(tx, id);
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.schedule_changed",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from, to },
    });

    return this.toResponse(updated);
  }

  /// Reverts the most recent status history step (board Undo toast).
  ///
  /// R13 is forward-only, so this is a dedicated door — not a status target.
  /// Cancelled trips are not undone here: closing the assignment ledger is not
  /// symmetric with a one-click toast, and reopening it needs an explicit reassign.
  async undoStatus(organizationId: string, id: string, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "CANCELLED") {
      throw new ConflictException("Cancelled dispatches cannot be undone from the board — reassign or recreate instead");
    }

    const history = await this.prisma.dispatchStatusHistory.findMany({
      where: { organizationId, dispatchId: id },
      orderBy: { createdAt: "desc" },
      take: 2,
    });

    if (history.length < 2) {
      throw new ConflictException("Nothing to undo — no prior status on this dispatch");
    }

    const [latest, prior] = history;
    if (latest.status !== dispatch.status) {
      throw new ConflictException("Dispatch status changed again — refresh and retry");
    }
    // One board Undo per forward step — do not chain Undo of Undo into a redo.
    if (latest.note?.startsWith("Undo:")) {
      throw new ConflictException("Nothing to undo — last change was already an undo");
    }

    const ageMs = Date.now() - latest.createdAt.getTime();
    /// Client toast is ~8s; server allows a short grace so a slow click still works.
    if (ageMs > 120_000) {
      throw new ConflictException("Undo window expired");
    }

    const from = dispatch.status;
    const to = prior.status;

    const { updated, projected } = await this.runInTransaction(async (tx) => {
      const data: Prisma.DispatchUpdateManyMutationInput = { status: to };
      // Actual timestamps were stamped on forward entry — clear them when stepping back.
      if (from === "IN_TRANSIT" || from === "DELIVERED") {
        if (to !== "IN_TRANSIT" && to !== "DELIVERED") {
          data.pickupDateActual = null;
        }
      }
      if (from === "DELIVERED") {
        data.deliveryDateActual = null;
      }

      const result = await tx.dispatch.updateMany({
        where: { id, organizationId, status: from },
        data,
      });
      if (result.count !== 1) {
        throw new ConflictException("Dispatch status changed again — refresh and retry");
      }

      await this.recordStatusChange(
        tx,
        organizationId,
        id,
        to,
        actor,
        `Undo: reverted from ${from} to ${to}`,
      );
      const projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, `Undo status to ${to}`);
      return { updated: await this.loadForResponse(tx, id), projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.status_undo",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from, to },
    });

    void this.workflowEvents.emit(organizationId, "dispatch.status_changed", {
      id,
      dispatchNumber: dispatch.dispatchNumber,
      orderId: dispatch.orderId,
      from,
      to,
    });
    this.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toResponse(updated);
  }

  async cancel(organizationId: string, id: string, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    if (dispatch.status === "DELIVERED" || dispatch.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel a dispatch with status ${dispatch.status}`);
    }

    const { cancelled, projected } = await this.runInTransaction(async (tx) => {
      await this.cancelInTx(tx, organizationId, id, actor, "Dispatch cancelled");
      // R8 — the driver and vehicle are released and the order falls back into
      // the unassigned pool. Unless the order was cancelled commercially, in
      // which case the projection leaves it alone (Amendment B, Z2).
      const projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, "Dispatch cancelled");
      return { cancelled: await this.loadForResponse(tx, id), projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.cancel",
      entityType: "Dispatch",
      entityId: id,
      metadata: { previousStatus: dispatch.status },
    });

    await this.tracking.endSessionsForDispatch(organizationId, id).catch(() => undefined);
    this.emitOrderStatusChangedIfMoved(organizationId, projected);

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
    if (order.status === "DRAFT") {
      throw new ConflictException(
        "Move the order to PENDING before creating a dispatch — a draft order cannot reserve a driver or vehicle",
      );
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot create a dispatch for an order with status ${order.status}`);
    }

    // Driver/vehicle eligibility, cargo capacity and double-booking are all one
    // question — "may these two take this trip?" — and AssignmentPolicy is the
    // only thing allowed to answer it (AR1, AR4).
    //
    // The order's own dates are the plan, not the commitment: assigning an
    // overdue order today reserves the driver/vehicle starting today, not on
    // whatever date it was originally due. Checking the conflict against the
    // stale, already-past window would miss a driver who is demonstrably busy
    // right now on a trip whose own plan happens not to overlap that old date.
    const now = new Date();
    const assignmentWindowStart = order.pickupDate > now ? order.pickupDate : now;
    const assignmentWindowEnd = order.deliveryDate > assignmentWindowStart ? order.deliveryDate : assignmentWindowStart;
    await this.assignmentPolicy.assertAssignable({
      organizationId,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      window: { pickupDate: assignmentWindowStart, deliveryDate: assignmentWindowEnd },
      cargoWeightKg: order.cargoWeightKg,
      cargoVolumeM3: order.cargoVolumeM3,
      // This order's own commitment is not a competing one.
      exclude: { orderId: order.id },
    });

    /// R2 — one live dispatch per order. DRAFT counts: two concurrent "assign"
  /// requests must not both create a draft for the same order. The partial
  /// unique index `dispatches_one_live_per_order` is the real guarantee; this
  /// pre-check only produces a clearer 409 before the DB rejects the write.
  const existing = await tx.dispatch.findFirst({
      where: {
        organizationId,
        orderId: dto.orderId,
        status: { notIn: ["CANCELLED", "DELIVERED"] },
      },
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

    await tx.dispatch.update({
      where: { id: dispatch.id },
      data: {
        driverId,
        vehicleId,
        driverAcceptanceStatus: "PENDING",
        driverAcceptedAt: null,
        driverRejectedAt: null,
        driverRejectReason: null,
        driverRejectNote: null,
      },
    });

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

  private toResponse(dispatch: DispatchWithRelations) {
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
      allowedTransitions: allowedDispatchTransitions(dispatch.status),
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
