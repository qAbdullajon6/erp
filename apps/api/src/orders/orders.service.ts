import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Order, OrderStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { AssignmentPolicy } from "../dispatch/assignment/assignment.policy";
import { DispatchesService } from "../dispatch/dispatches.service";
import { OrderWriter } from "../order-state/order-writer";
import { dispatchPath, dispatchStateFor } from "../order-state/projection.policy";
import {
  allowedOrderTransitions,
  assertOrderStatusTransition,
  isOperationalStatus,
} from "../order-state/transition.policy";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { AssignOrderDto } from "./dto/assign-order.dto";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { generateUniqueOrderNumber } from "./order-number.util";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    /// Order state is written ONLY through these two policies (AR5).
    private readonly orderWriter: OrderWriter,
    /// Operational state is not set here — it is projected from a dispatch (R3),
    /// so an order-level request is executed by moving the dispatch.
    private readonly dispatches: DispatchesService,
    private readonly assignmentPolicy: AssignmentPolicy,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  async list(organizationId: string, query: ListOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: "insensitive" } },
              { pickupCity: { contains: query.search, mode: "insensitive" } },
              { deliveryCity: { contains: query.search, mode: "insensitive" } },
              { cargoDescription: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: { statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return this.toResponse(order);
  }

  async create(organizationId: string, dto: CreateOrderDto, actor: CurrentUserPayload) {
    await this.assertCustomerSelectable(organizationId, dto.customerId);

    const pickupDate = new Date(dto.pickupDate);
    const deliveryDate = new Date(dto.deliveryDate);
    this.assertValidDateRange(pickupDate, deliveryDate);

    const orderNumber = await this.resolveOrderNumberForCreate(organizationId, dto.orderNumber, pickupDate);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
      data: {
        organizationId,
        orderNumber,
        customerId: dto.customerId,
        pickupAddress: dto.pickupAddress,
        pickupCity: dto.pickupCity,
        pickupDate,
        deliveryAddress: dto.deliveryAddress,
        deliveryCity: dto.deliveryCity,
        deliveryDate,
        cargoDescription: dto.cargoDescription,
        cargoWeightKg: dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : undefined,
        cargoVolumeM3: dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : undefined,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency ?? "USD",
        notes: dto.notes,
        deliveryNotes: dto.deliveryNotes,
      },
      });
      // The order and its opening history row are one fact (AR2). An order is
      // BORN in DRAFT — this is a creation, not a transition, so no policy governs
      // it; but the history row still goes through the single Order writer (AR5).
      await this.orderWriter.recordCreated(tx, organizationId, created.id, actor);
      return created;
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.create",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });

    this.workflowEvents.emit(organizationId, "order.created", { id: order.id, orderNumber: order.orderNumber, customerId: order.customerId, status: order.status });

    return this.toResponse(order);
  }

  async update(organizationId: string, id: string, dto: UpdateOrderDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);

    if (existing.status === "DELIVERED" || existing.status === "CANCELLED") {
      throw new ConflictException(`Cannot edit an order with status ${existing.status}`);
    }

    if (dto.orderNumber && dto.orderNumber !== existing.orderNumber) {
      await this.assertOrderNumberAvailable(organizationId, dto.orderNumber);
    }

    let customerId = existing.customerId;
    if (dto.customerId && dto.customerId !== existing.customerId) {
      await this.assertCustomerSelectable(organizationId, dto.customerId);
      customerId = dto.customerId;
    }

    const pickupDate = dto.pickupDate ? new Date(dto.pickupDate) : existing.pickupDate;
    const deliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : existing.deliveryDate;
    this.assertValidDateRange(pickupDate, deliveryDate);

    // Moving the dates or the cargo of an ALREADY-ASSIGNED order can invalidate
    // the assignment: the driver may now clash with another trip, or the cargo may
    // no longer fit. That is the same question AssignmentPolicy answers everywhere
    // else, so it is asked here too rather than re-implemented (AR1, AR4).
    const windowMoved = Boolean(dto.pickupDate || dto.deliveryDate);
    const cargoChanged = dto.cargoWeightKg !== undefined || dto.cargoVolumeM3 !== undefined;
    if (existing.driverId && existing.vehicleId && (windowMoved || cargoChanged)) {
      await this.assignmentPolicy.assertAssignable({
        organizationId,
        driverId: existing.driverId,
        vehicleId: existing.vehicleId,
        window: { pickupDate, deliveryDate },
        cargoWeightKg: dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : existing.cargoWeightKg,
        cargoVolumeM3: dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : existing.cargoVolumeM3,
        // The order's own commitment (and its dispatch) is not a competing one.
        exclude: { orderId: id },
      });
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        orderNumber: dto.orderNumber,
        customerId,
        pickupAddress: dto.pickupAddress,
        pickupCity: dto.pickupCity,
        pickupDate: dto.pickupDate ? pickupDate : undefined,
        deliveryAddress: dto.deliveryAddress,
        deliveryCity: dto.deliveryCity,
        deliveryDate: dto.deliveryDate ? deliveryDate : undefined,
        cargoDescription: dto.cargoDescription,
        cargoWeightKg: dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : undefined,
        cargoVolumeM3: dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : undefined,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        currency: dto.currency,
        notes: dto.notes,
        deliveryNotes: dto.deliveryNotes,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.update",
      entityType: "Order",
      entityId: id,
      metadata: { changes: dto },
    });

    this.workflowEvents.emit(organizationId, "order.updated", { id, orderNumber: updated.orderNumber, customerId: updated.customerId, status: updated.status, changes: dto });

    return this.toResponse(updated);
  }

  async assign(organizationId: string, id: string, dto: AssignOrderDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);

    if (order.status !== "PENDING" && order.status !== "ASSIGNED") {
      throw new ConflictException(
        `Cannot assign a driver/vehicle to an order with status ${order.status}`,
      );
    }

    const wasPending = order.status === "PENDING";

    // Assigning an order IS creating a dispatch and committing it (R3). Nothing
    // here writes Order.driverId, Order.vehicleId or Order.status: the dispatch is
    // created and activated, and ProjectionPolicy derives the order from it. Every
    // rule that governs whether this assignment may happen — eligibility, capacity,
    // double-booking — is AssignmentPolicy's, reached through createInTx (AR1, AR4).
    //
    // This is the shape Task 8.7 will lift wholesale into a wrapper; the only thing
    // left in this method is the commercial precondition and the audit line.
    const updated = await this.dispatches.inTransaction(async (tx) => {
      const live = await this.dispatches.activeDispatchForOrder(tx, organizationId, id);

      if (live) {
        // The order already has a dispatch, so this is a REASSIGNMENT — and there
        // is exactly one implementation of that (AR1). It closes the open
        // DispatchAssignment and opens a new one, keeping the dispatch itself and
        // its whole status history intact.
        await this.dispatches.reassignInTx(
          tx,
          organizationId,
          live,
          { driverId: dto.driverId, vehicleId: dto.vehicleId },
          actor,
          "Reassigned via order",
        );
      } else {
        // First assignment: create the dispatch and commit it. ASSIGNED is what
        // "this order has a driver" MEANS under ADR-001 (R3).
        const created = await this.dispatches.createInTx(
          tx,
          organizationId,
          { orderId: id, driverId: dto.driverId, vehicleId: dto.vehicleId },
          actor,
        );
        await this.dispatches.transitionInTx(
          tx,
          organizationId,
          created,
          "ASSIGNED",
          actor,
          "Driver and vehicle assigned",
        );
      }

      return this.orderWriter.project(
        tx,
        organizationId,
        id,
        actor,
        "Driver and vehicle assigned",
      );
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: wasPending ? "order.assign" : "order.reassign",
      entityType: "Order",
      entityId: id,
      metadata: { driverId: dto.driverId, vehicleId: dto.vehicleId },
    });

    return this.toResponse(updated);
  }

  async updateStatus(organizationId: string, id: string, dto: UpdateOrderStatusDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);
    return this.applyStatusTransition(organizationId, order, dto, actor);
  }

  private async applyStatusTransition(
    organizationId: string,
    order: Order,
    dto: UpdateOrderStatusDto,
    actor: CurrentUserPayload,
  ) {
    // Rejected up front, before any dispatch is touched, with the message this
    // endpoint has always used. The rule lives in the policy, not here (AR3).
    assertOrderStatusTransition(order.status, dto.status);

    const updated = await this.dispatches.inTransaction(async (tx) =>
      isOperationalStatus(dto.status)
        ? this.advanceThroughDispatch(tx, organizationId, order, dto, actor)
        : this.orderWriter.applyCommercial(tx, organizationId, order, dto.status, actor, dto.note),
    );

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.status_change",
      entityType: "Order",
      entityId: order.id,
      metadata: { from: order.status, to: dto.status, note: dto.note },
    });

    this.workflowEvents.emit(organizationId, "order.status_changed", { id: order.id, orderNumber: order.orderNumber, from: order.status, to: dto.status });

    return this.toResponse(updated);
  }

  /// Executes an OPERATIONAL order request by moving the dispatch that governs the
  /// order, then re-deriving the order from it (R3).
  ///
  /// One order step can be several dispatch steps: an order going ASSIGNED ->
  /// PICKED_UP means the dispatch must walk ASSIGNED -> EN_ROUTE_TO_PICKUP ->
  /// AT_PICKUP, because R13 forbids the dispatch from skipping a state. Every one
  /// of those steps is a real transition with its own dispatch history row — the
  /// intermediate states are traversed, not faked.
  private async advanceThroughDispatch(
    tx: Prisma.TransactionClient,
    organizationId: string,
    order: Order,
    dto: UpdateOrderStatusDto,
    actor: CurrentUserPayload,
  ): Promise<Order> {
    const target = dispatchStateFor(dto.status);
    if (!target) {
      // Unreachable: isOperationalStatus() gated this. Belt and braces.
      throw new ConflictException(`${dto.status} is not an operational status`);
    }

    let dispatch = await this.dispatches.drivableDispatchForOrder(tx, organizationId, order.id);
    if (!dispatch) {
      // Without a dispatch there is nothing to derive the order from. This is the
      // same 409 the endpoint returned before, for the same reason: an order with
      // no driver and vehicle cannot become ASSIGNED.
      throw new ConflictException(
        "Assign a driver and vehicle (POST /orders/:id/assign) before moving to ASSIGNED",
      );
    }

    for (const step of dispatchPath(dispatch.status, target)) {
      // Each step returns the dispatch it just wrote, so the next step's
      // compare-and-set compares against reality rather than a stale read.
      dispatch = await this.dispatches.transitionInTx(
        tx,
        organizationId,
        dispatch,
        step,
        actor,
        dto.note,
      );
    }

    return this.orderWriter.project(tx, organizationId, order.id, actor, dto.note);
  }

  async cancel(organizationId: string, id: string, dto: CancelOrderDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel an order with status ${order.status}`);
    }

    const updated = await this.dispatches.inTransaction(async (tx) => {
      // A dead order must not keep a driver and a truck reserved, so its dispatch
      // dies with it. Note this does NOT project afterwards: projecting a
      // fully-cancelled order would read "all dispatches cancelled -> PENDING" and
      // resurrect the very order we are killing. The commercial write is the last
      // word, and ProjectionPolicy refuses to overwrite CANCELLED anyway — belt
      // and braces, in the two places that each independently prevent it.
      const live = await this.dispatches.activeDispatchForOrder(tx, organizationId, id);
      if (live) {
        await this.dispatches.cancelInTx(tx, organizationId, live.id, actor, "Order cancelled");
      }

      return this.orderWriter.applyCommercial(tx, organizationId, order, "CANCELLED", actor, dto.note);
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.cancel",
      entityType: "Order",
      entityId: id,
      metadata: { note: dto.note },
    });

    this.workflowEvents.emit(organizationId, "order.cancelled", { id, orderNumber: updated.orderNumber, note: dto.note });

    return this.toResponse(updated);
  }

  private assertValidDateRange(pickupDate: Date, deliveryDate: Date): void {
    if (deliveryDate.getTime() < pickupDate.getTime()) {
      throw new BadRequestException("deliveryDate cannot be before pickupDate");
    }
  }

  private async assertCustomerSelectable(organizationId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    // Literal reading of the phase spec: "Only non-archived, active
    // customers can be selected" — CustomerStatus has no separate
    // "non-archived" state distinct from ACTIVE/AT_RISK/INACTIVE/ARCHIVED,
    // so this means status === ACTIVE specifically, not merely !== ARCHIVED.
    if (customer.status !== "ACTIVE") {
      throw new ConflictException("Only active customers can be selected for a new order");
    }
  }

  private async resolveOrderNumberForCreate(
    organizationId: string,
    requestedNumber: string | undefined,
    referenceDate: Date,
  ): Promise<string> {
    if (!requestedNumber) {
      return generateUniqueOrderNumber(this.prisma, organizationId, referenceDate);
    }
    await this.assertOrderNumberAvailable(organizationId, requestedNumber);
    return requestedNumber;
  }

  private async assertOrderNumberAvailable(organizationId: string, orderNumber: string): Promise<void> {
    if (!isValidEntityCode(orderNumber)) {
      throw new BadRequestException("orderNumber may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.order.findUnique({
      where: { organizationId_orderNumber: { organizationId, orderNumber } },
    });
    if (conflict) {
      throw new ConflictException("An order with this orderNumber already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself, so an order id from
  /// another organization returns 404.
  private async findOrThrow(organizationId: string, id: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  private toResponse(
    order: Order & { statusHistory?: { id: string; status: OrderStatus; changedByUserId: string | null; note: string | null; createdAt: Date }[] },
  ) {
    const isDelayed =
      order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.deliveryDate.getTime() < Date.now();

    return {
      id: order.id,
      organizationId: order.organizationId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      pickupAddress: order.pickupAddress,
      pickupCity: order.pickupCity,
      pickupDate: order.pickupDate,
      deliveryAddress: order.deliveryAddress,
      deliveryCity: order.deliveryCity,
      deliveryDate: order.deliveryDate,
      cargoDescription: order.cargoDescription,
      cargoWeightKg: order.cargoWeightKg?.toString() ?? null,
      cargoVolumeM3: order.cargoVolumeM3?.toString() ?? null,
      price: order.price.toString(),
      currency: order.currency,
      status: order.status,
      /// Read-only, derived, additive (TD-006). Computed from the single order
      /// transition table in TransitionPolicy — so the client is told THE rule, not
      /// a second version of it (AR1). Empty means terminal.
      ///
      /// This is the dispatcher's view. A DRIVER no longer reads orders at all —
      /// they execute a dispatch (Task 8.12), and get their own narrowed list from
      /// DriverDispatchService.
      allowedTransitions: allowedOrderTransitions(order.status),
      isDelayed,
      driverId: order.driverId,
      vehicleId: order.vehicleId,
      notes: order.notes,
      deliveryNotes: order.deliveryNotes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      cancelledAt: order.cancelledAt,
      deliveredAt: order.deliveredAt,
      ...(order.statusHistory
        ? {
            statusHistory: order.statusHistory.map((h) => ({
              id: h.id,
              status: h.status,
              changedByUserId: h.changedByUserId,
              note: h.note,
              createdAt: h.createdAt,
            })),
          }
        : {}),
    };
  }

}
