import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Order, OrderStatus, Prisma, Vehicle } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { PrismaService } from "../prisma/prisma.service";
import { AssignOrderDto } from "./dto/assign-order.dto";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { generateUniqueOrderNumber } from "./order-number.util";

/// Forward-only, one-step-at-a-time — see the OrderStatus enum's comment in
/// schema.prisma. ASSIGNED is reachable from here in principle, but
/// OrdersService.updateStatus additionally requires a driver+vehicle to
/// already be set (normally true only after assign()), so in practice
/// PENDING -> ASSIGNED happens via /orders/:id/assign, not this map.
/// DELIVERED and CANCELLED are terminal — nothing transitions out of them.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["ASSIGNED"],
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/// Orders whose driver/vehicle assignment is still "live" for the purposes
/// of double-booking — DRAFT/PENDING orders have no assignment yet by
/// definition, and DELIVERED/CANCELLED orders are finished, so neither
/// blocks a new assignment.
const ACTIVE_ASSIGNMENT_STATUSES: OrderStatus[] = ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

    const order = await this.prisma.order.create({
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

    await this.recordStatusChange(organizationId, order.id, "DRAFT", actor, "Order created");
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.create",
      entityType: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });

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

    if (existing.driverId && (dto.pickupDate || dto.deliveryDate)) {
      await this.assertNoOverlap(organizationId, "driverId", existing.driverId, pickupDate, deliveryDate, id);
    }
    if (existing.vehicleId && (dto.pickupDate || dto.deliveryDate)) {
      await this.assertNoOverlap(organizationId, "vehicleId", existing.vehicleId, pickupDate, deliveryDate, id);
    }

    if (existing.vehicleId && (dto.cargoWeightKg !== undefined || dto.cargoVolumeM3 !== undefined)) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: existing.vehicleId } });
      const weightKg = dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : existing.cargoWeightKg;
      const volumeM3 = dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : existing.cargoVolumeM3;
      if (vehicle) this.assertCapacity(vehicle, weightKg, volumeM3);
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

    return this.toResponse(updated);
  }

  async assign(organizationId: string, id: string, dto: AssignOrderDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);

    if (order.status !== "PENDING" && order.status !== "ASSIGNED") {
      throw new ConflictException(
        `Cannot assign a driver/vehicle to an order with status ${order.status}`,
      );
    }

    const driver = await this.prisma.driver.findFirst({ where: { id: dto.driverId, organizationId } });
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    if (driver.status !== "ACTIVE" || driver.archivedAt) {
      throw new ConflictException("Only active drivers can be assigned");
    }

    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, organizationId } });
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }
    if (vehicle.status !== "AVAILABLE" || vehicle.archivedAt) {
      throw new ConflictException("Only available vehicles can be assigned");
    }

    this.assertCapacity(vehicle, order.cargoWeightKg, order.cargoVolumeM3);

    await this.assertNoOverlap(organizationId, "driverId", dto.driverId, order.pickupDate, order.deliveryDate, id);
    await this.assertNoOverlap(organizationId, "vehicleId", dto.vehicleId, order.pickupDate, order.deliveryDate, id);

    const wasPending = order.status === "PENDING";
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        status: wasPending ? "ASSIGNED" : order.status,
      },
    });

    if (wasPending) {
      await this.recordStatusChange(organizationId, id, "ASSIGNED", actor, "Driver and vehicle assigned");
    }

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

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot transition an order from ${order.status} to ${dto.status}`);
    }

    if (dto.status === "ASSIGNED" && (!order.driverId || !order.vehicleId)) {
      throw new ConflictException("Assign a driver and vehicle (POST /orders/:id/assign) before moving to ASSIGNED");
    }

    const data: Prisma.OrderUpdateInput = { status: dto.status };
    if (dto.status === "DELIVERED") {
      data.deliveredAt = new Date();
    }

    const updated = await this.prisma.order.update({ where: { id }, data });

    await this.recordStatusChange(organizationId, id, dto.status, actor, dto.note);
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.status_change",
      entityType: "Order",
      entityId: id,
      metadata: { from: order.status, to: dto.status, note: dto.note },
    });

    return this.toResponse(updated);
  }

  async cancel(organizationId: string, id: string, dto: CancelOrderDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel an order with status ${order.status}`);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await this.recordStatusChange(organizationId, id, "CANCELLED", actor, dto.note);
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.cancel",
      entityType: "Order",
      entityId: id,
      metadata: { note: dto.note },
    });

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

  /// Capacity is only checked when BOTH the vehicle's capacity field and the
  /// order's corresponding cargo field are present — there's nothing to
  /// validate against when either is missing (see spec: "when values
  /// exist").
  private assertCapacity(
    vehicle: Vehicle,
    cargoWeightKg: Prisma.Decimal | null,
    cargoVolumeM3: Prisma.Decimal | null,
  ): void {
    if (vehicle.capacityKg && cargoWeightKg && cargoWeightKg.gt(vehicle.capacityKg)) {
      throw new BadRequestException(
        `Cargo weight (${cargoWeightKg.toString()}kg) exceeds vehicle capacity (${vehicle.capacityKg.toString()}kg)`,
      );
    }
    if (vehicle.capacityM3 && cargoVolumeM3 && cargoVolumeM3.gt(vehicle.capacityM3)) {
      throw new BadRequestException(
        `Cargo volume (${cargoVolumeM3.toString()}m3) exceeds vehicle capacity (${vehicle.capacityM3.toString()}m3)`,
      );
    }
  }

  /// Double-booking check: a driver/vehicle cannot be assigned to two
  /// orders whose [pickupDate, deliveryDate] ranges overlap, considering
  /// only orders in an "active assignment" status (ASSIGNED/PICKED_UP/
  /// IN_TRANSIT — see ACTIVE_ASSIGNMENT_STATUSES). Overlap is the standard
  /// inclusive interval test: existing.pickupDate <= new.deliveryDate AND
  /// existing.deliveryDate >= new.pickupDate. This is deliberately
  /// conservative at the boundary — an order ending exactly when another
  /// begins (e.g. a driver's drop-off and next pickup on the same calendar
  /// day) counts as overlapping and is blocked, rather than assuming the
  /// driver/vehicle is free the instant one leg ends. `excludeOrderId`
  /// leaves the order being assigned/updated out of its own check.
  private async assertNoOverlap(
    organizationId: string,
    field: "driverId" | "vehicleId",
    entityId: string,
    pickupDate: Date,
    deliveryDate: Date,
    excludeOrderId: string,
  ): Promise<void> {
    const conflict = await this.prisma.order.findFirst({
      where: {
        organizationId,
        [field]: entityId,
        id: { not: excludeOrderId },
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        pickupDate: { lte: deliveryDate },
        deliveryDate: { gte: pickupDate },
      },
    });
    if (conflict) {
      const label = field === "driverId" ? "driver" : "vehicle";
      throw new ConflictException(
        `This ${label} is already assigned to an overlapping order (${conflict.orderNumber})`,
      );
    }
  }

  private async recordStatusChange(
    organizationId: string,
    orderId: string,
    status: OrderStatus,
    actor: CurrentUserPayload,
    note?: string,
  ): Promise<void> {
    await this.prisma.orderStatusHistory.create({
      data: { organizationId, orderId, status, changedByUserId: actor.userId, note },
    });
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
