import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Dispatch, DispatchStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { generateUniqueDispatchNumber } from "./dispatch-number.util";
import { CreateDispatchDto } from "./dto/create-dispatch.dto";
import { ListDispatchesQueryDto } from "./dto/list-dispatches-query.dto";
import { UpdateDispatchDto } from "./dto/update-dispatch.dto";
import { UpdateDispatchStatusDto } from "./dto/update-dispatch-status.dto";

/// Forward-only dispatch status progression. A dispatch moves through states
/// DRAFT -> ASSIGNED -> EN_ROUTE_TO_PICKUP -> AT_PICKUP -> IN_TRANSIT -> DELIVERED.
/// CANCELLED is reachable from any non-terminal state. Actual pickup/delivery
/// times are auto-captured when transitioning to IN_TRANSIT/DELIVERED.
const ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  DRAFT: ["ASSIGNED"],
  ASSIGNED: ["EN_ROUTE_TO_PICKUP", "CANCELLED"],
  EN_ROUTE_TO_PICKUP: ["AT_PICKUP", "CANCELLED"],
  AT_PICKUP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/// Dispatches in these statuses block a driver/vehicle from being reassigned.
/// DRAFT dispatches can be reassigned; DELIVERED/CANCELLED no longer block.
const ACTIVE_DISPATCH_STATUSES: DispatchStatus[] = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
];

@Injectable()
export class DispatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
        include: {
          order: { include: { customer: true } },
          driver: true,
          vehicle: true,
          createdByUser: true,
        },
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
      include: {
        order: { include: { customer: true } },
        driver: true,
        vehicle: true,
        createdByUser: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    return this.toResponse(fullDispatch!);
  }

  async create(organizationId: string, dto: CreateDispatchDto, actor: CurrentUserPayload) {
    // Validate order exists and is in appropriate status
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, organizationId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot create a dispatch for an order with status ${order.status}`);
    }

    // Validate driver
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, organizationId },
    });
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    if (driver.status !== "ACTIVE" || driver.archivedAt) {
      throw new ConflictException("Only active drivers can be assigned to a dispatch");
    }

    // Validate vehicle
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
    });
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }
    if (vehicle.status !== "AVAILABLE" || vehicle.archivedAt) {
      throw new ConflictException("Only available vehicles can be assigned to a dispatch");
    }

    // Check for overlapping active dispatches
    await this.assertNoOverlap(organizationId, "driverId", dto.driverId, order.pickupDate, order.deliveryDate);
    await this.assertNoOverlap(organizationId, "vehicleId", dto.vehicleId, order.pickupDate, order.deliveryDate);

    // Enforce one active dispatch per order
    const existingDispatch = await this.prisma.dispatch.findFirst({
      where: {
        organizationId,
        orderId: dto.orderId,
        status: { in: ACTIVE_DISPATCH_STATUSES },
      },
    });
    if (existingDispatch) {
      throw new ConflictException(`Order already has an active dispatch: ${existingDispatch.dispatchNumber}`);
    }

    const dispatchNumber = await generateUniqueDispatchNumber(this.prisma, organizationId);

    const dispatch = await this.prisma.dispatch.create({
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
      include: {
        order: { include: { customer: true } },
        driver: true,
        vehicle: true,
        createdByUser: true,
      },
    });

    await this.recordStatusChange(organizationId, dispatch.id, "DRAFT", actor, "Dispatch created");
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

    const updated = await this.prisma.dispatch.update({
      where: { id },
      data: {
        notes: dto.notes,
      },
      include: {
        order: { include: { customer: true } },
        driver: true,
        vehicle: true,
        createdByUser: true,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.update",
      entityType: "Dispatch",
      entityId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(updated);
  }

  async updateStatus(organizationId: string, id: string, dto: UpdateDispatchStatusDto, actor: CurrentUserPayload) {
    const dispatch = await this.findOrThrow(organizationId, id);

    const allowed = ALLOWED_TRANSITIONS[dispatch.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot transition a dispatch from ${dispatch.status} to ${dto.status}`);
    }

    const updateData: Prisma.DispatchUpdateInput = { status: dto.status };

    // Auto-capture actual pickup time when moving to IN_TRANSIT
    if (dto.status === "IN_TRANSIT" && !dispatch.pickupDateActual) {
      updateData.pickupDateActual = new Date();
    }

    // Auto-capture actual delivery time when moving to DELIVERED
    if (dto.status === "DELIVERED" && !dispatch.deliveryDateActual) {
      updateData.deliveryDateActual = new Date();
    }

    const updated = await this.prisma.dispatch.update({
      where: { id },
      data: updateData,
      include: {
        order: { include: { customer: true } },
        driver: true,
        vehicle: true,
        createdByUser: true,
      },
    });

    await this.recordStatusChange(organizationId, id, dto.status, actor, dto.note);
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

    const cancelled = await this.prisma.dispatch.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        order: { include: { customer: true } },
        driver: true,
        vehicle: true,
        createdByUser: true,
      },
    });

    await this.recordStatusChange(organizationId, id, "CANCELLED", actor, "Dispatch cancelled");
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

  private async findOrThrow(organizationId: string, id: string): Promise<Dispatch> {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id, organizationId },
    });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }
    return dispatch;
  }

  private async assertNoOverlap(
    organizationId: string,
    fieldName: "driverId" | "vehicleId",
    resourceId: string,
    pickupDate: Date,
    deliveryDate: Date,
    excludeDispatchId?: string,
  ) {
    const overlapping = await this.prisma.dispatch.findFirst({
      where: {
        organizationId,
        [fieldName]: resourceId,
        status: { in: ACTIVE_DISPATCH_STATUSES },
        pickupDateScheduled: { lte: deliveryDate },
        deliveryDateScheduled: { gte: pickupDate },
        ...(excludeDispatchId ? { NOT: { id: excludeDispatchId } } : {}),
      },
    });

    if (overlapping) {
      const resourceType = fieldName === "driverId" ? "driver" : "vehicle";
      throw new ConflictException(
        `This ${resourceType} is already assigned to dispatch ${overlapping.dispatchNumber} during the requested time range`,
      );
    }
  }

  private async recordStatusChange(
    organizationId: string,
    dispatchId: string,
    status: DispatchStatus,
    actor: CurrentUserPayload,
    note?: string,
  ) {
    await this.prisma.dispatchStatusHistory.create({
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
