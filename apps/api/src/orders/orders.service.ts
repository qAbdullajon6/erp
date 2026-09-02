import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Order, OrderStatus, Prisma, DispatchStatus, UsageMetricType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { isScheduleLate } from "../common/schedule-lateness.util";
import { AssignmentPolicy } from "../dispatch/assignment/assignment.policy";
import { notifyDriverOfAssignment } from "../dispatch/driver/driver-assignment-notify";
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
import { UsageMeteringService } from "../billing/usage-metering.service";
import { GeocodingService } from "../geocoding/geocoding.service";
import { AssignOrderDto } from "./dto/assign-order.dto";
import { CheckDuplicateOrderDto } from "./dto/check-duplicate-order.dto";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { generateUniqueOrderNumber } from "./order-number.util";

/// Each whitespace-separated token must match at least one searchable field.
function orderSearchTokenClause(term: string): Prisma.OrderWhereInput {
  return {
    OR: [
      { orderNumber: { contains: term, mode: "insensitive" } },
      { pickupCity: { contains: term, mode: "insensitive" } },
      { deliveryCity: { contains: term, mode: "insensitive" } },
      { cargoDescription: { contains: term, mode: "insensitive" } },
      { customer: { companyName: { contains: term, mode: "insensitive" } } },
      { customer: { phone: { contains: term, mode: "insensitive" } } },
      { driver: { firstName: { contains: term, mode: "insensitive" } } },
      { driver: { lastName: { contains: term, mode: "insensitive" } } },
      { vehicle: { plateNumber: { contains: term, mode: "insensitive" } } },
      {
        dispatches: {
          some: {
            OR: [
              { driver: { firstName: { contains: term, mode: "insensitive" } } },
              { driver: { lastName: { contains: term, mode: "insensitive" } } },
              { vehicle: { plateNumber: { contains: term, mode: "insensitive" } } },
            ],
          },
        },
      },
    ],
  };
}

function orderSearchWhere(search: string): Prisma.OrderWhereInput {
  const terms = search.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return {};
  if (terms.length === 1) return orderSearchTokenClause(terms[0]);
  return { AND: terms.map((term) => orderSearchTokenClause(term)) };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

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
    private readonly usageMetering: UsageMeteringService,
    private readonly geocoding: GeocodingService,
  ) {}

  async list(organizationId: string, query: ListOrdersQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.OrderWhereInput = {
      organizationId,
      ...(query.archivedOnly
        ? { archivedAt: { not: null } }
        : query.includeArchived
          ? {}
          : { archivedAt: null }),
      ...(query.statuses?.length
        ? { status: { in: query.statuses } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.driverId
        ? {
            OR: [
              { driverId: query.driverId },
              {
                dispatches: {
                  some: {
                    driverId: query.driverId,
                    status: { notIn: ["CANCELLED", "DELIVERED"] },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.vehicleId
        ? {
            OR: [
              { vehicleId: query.vehicleId },
              {
                dispatches: {
                  some: {
                    vehicleId: query.vehicleId,
                    status: { notIn: ["CANCELLED", "DELIVERED"] },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.dispatcherId
        ? {
            dispatches: {
              some: {
                createdByUserId: query.dispatcherId,
                status: { notIn: ["CANCELLED", "DELIVERED"] },
              },
            },
          }
        : {}),
      ...(query.pickupDateFrom || query.pickupDateTo
        ? {
            pickupDate: {
              ...(query.pickupDateFrom ? { gte: new Date(query.pickupDateFrom) } : {}),
              ...(query.pickupDateTo ? { lte: new Date(query.pickupDateTo) } : {}),
            },
          }
        : {}),
      ...(query.deliveryDateFrom || query.deliveryDateTo
        ? {
            deliveryDate: {
              ...(query.deliveryDateFrom ? { gte: new Date(query.deliveryDateFrom) } : {}),
              ...(query.deliveryDateTo ? { lte: new Date(query.deliveryDateTo) } : {}),
            },
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.priceMin !== undefined || query.priceMax !== undefined
        ? {
            price: {
              ...(query.priceMin !== undefined ? { gte: new Prisma.Decimal(query.priceMin) } : {}),
              ...(query.priceMax !== undefined ? { lte: new Prisma.Decimal(query.priceMax) } : {}),
            },
          }
        : {}),
      ...(query.paymentStatus === "NO_INVOICE"
        ? { invoices: { none: {} } }
        : query.paymentStatus === "PAID"
          ? { invoices: { some: { balanceDue: { lte: 0 } } } }
          : query.paymentStatus === "PARTIAL"
            ? {
                invoices: {
                  some: { paidAmount: { gt: 0 }, balanceDue: { gt: 0 } },
                },
              }
            : query.paymentStatus === "UNPAID"
              ? {
                  invoices: {
                    some: { paidAmount: { lte: 0 }, balanceDue: { gt: 0 } },
                  },
                }
              : {}),
      ...(search ? orderSearchWhere(search) : {}),
    };

    const include = {
      customer: { select: { id: true, companyName: true, phone: true } },
      driver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, type: true } },
      dispatches: {
        where: { status: { notIn: ["CANCELLED", "DELIVERED"] as DispatchStatus[] } },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, type: true } },
        },
      },
    };

    // A batched $transaction (not Promise.all) so the count and the page it
    // describes read the same snapshot — otherwise a concurrent insert/delete
    // between the two queries can make `total`/`totalPages` briefly disagree
    // with `items`.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toListResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async checkDuplicate(organizationId: string, dto: CheckDuplicateOrderDto) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pickupDate = new Date(dto.pickupDate);
    const matches = await this.prisma.order.findMany({
      where: {
        organizationId,
        archivedAt: null,
        customerId: dto.customerId,
        pickupCity: { equals: dto.pickupCity.trim(), mode: "insensitive" },
        deliveryCity: { equals: dto.deliveryCity.trim(), mode: "insensitive" },
        cargoDescription: { equals: dto.cargoDescription.trim(), mode: "insensitive" },
        pickupDate: {
          gte: new Date(pickupDate.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(pickupDate.getTime() + 24 * 60 * 60 * 1000),
        },
        createdAt: { gte: since },
        ...(dto.excludeOrderId ? { id: { not: dto.excludeOrderId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      possibleDuplicate: matches.length > 0,
      matches: matches.map((row) => this.toResponse(row)),
    };
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);
    if (order.archivedAt) {
      throw new ConflictException("Order is already archived");
    }
    if (order.status !== "DELIVERED" && order.status !== "CANCELLED") {
      throw new ConflictException("Only delivered or cancelled orders can be archived");
    }

    // Compare-and-set on archivedAt: two concurrent archive calls on the same
    // order can both pass the check above before either commits its write —
    // the guarded updateMany makes the loser a no-op 409 instead of a second,
    // duplicate audit entry for one logical action.
    const result = await this.prisma.order.updateMany({
      where: { id, organizationId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException("Order is already archived");
    }
    const updated = await this.findOrThrow(organizationId, id);

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.archive",
      entityType: "Order",
      entityId: id,
      metadata: { orderNumber: order.orderNumber },
    });

    return this.toResponse(updated);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);
    if (!order.archivedAt) {
      throw new ConflictException("Order is not archived");
    }

    const result = await this.prisma.order.updateMany({
      where: { id, organizationId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (result.count === 0) {
      throw new ConflictException("Order is not archived");
    }
    const updated = await this.findOrThrow(organizationId, id);

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.restore",
      entityType: "Order",
      entityId: id,
      metadata: { orderNumber: order.orderNumber },
    });

    return this.toResponse(updated);
  }

  async getById(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, organizationId },
      include: {
        statusHistory: { orderBy: { createdAt: "asc" } },
        orderStops: { orderBy: { stopIndex: "asc" } },
      },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return this.toResponse(order);
  }

  async create(organizationId: string, dto: CreateOrderDto, actor: CurrentUserPayload) {
    await this.usageMetering.enforceLimit(organizationId, UsageMetricType.ORDERS, 1);
    await this.assertCustomerSelectable(organizationId, dto.customerId);

    const pickupDate = new Date(dto.pickupDate);
    const deliveryDate = new Date(dto.deliveryDate);
    this.assertValidDateRange(pickupDate, deliveryDate);
    this.assertValidWindow(dto.pickupWindowStart, dto.pickupWindowEnd, "pickup");
    this.assertValidWindow(dto.deliveryWindowStart, dto.deliveryWindowEnd, "delivery");
    if (dto.orderStops) {
      for (let i = 0; i < dto.orderStops.length; i++) {
        const s = dto.orderStops[i];
        this.assertValidWindow(s.windowStart, s.windowEnd, `stop ${i + 1}`);
      }
    }

    const isAutoNumber = !dto.orderNumber;
    let orderNumber = await this.resolveOrderNumberForCreate(organizationId, dto.orderNumber, pickupDate);

    // Auto-generated numbers are assigned by reading the current max and
    // computing "next" in application code (order-number.util.ts) — a
    // classic read-then-write race under concurrent creation. The DB's
    // @@unique([organizationId, orderNumber]) constraint is the real guard
    // and throws P2002 at commit time; without this retry, that surfaced as
    // an uncaught 500 instead of a clean, self-healing retry.
    let order: Order | undefined;
    for (let attempt = 0; ; attempt += 1) {
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              organizationId,
              orderNumber,
              customerId: dto.customerId,
              pickupAddress: dto.pickupAddress,
              pickupCity: dto.pickupCity,
              pickupDate,
              pickupPostalCode: dto.pickupPostalCode,
              pickupCountryCode: dto.pickupCountryCode,
              pickupPlaceName: dto.pickupPlaceName,
              pickupContactName: dto.pickupContactName,
              pickupContactPhone: dto.pickupContactPhone,
              pickupInstructions: dto.pickupInstructions,
              pickupWindowStart: dto.pickupWindowStart ? new Date(dto.pickupWindowStart) : undefined,
              pickupWindowEnd: dto.pickupWindowEnd ? new Date(dto.pickupWindowEnd) : undefined,
              deliveryAddress: dto.deliveryAddress,
              deliveryCity: dto.deliveryCity,
              deliveryDate,
              deliveryPostalCode: dto.deliveryPostalCode,
              deliveryCountryCode: dto.deliveryCountryCode,
              deliveryPlaceName: dto.deliveryPlaceName,
              deliveryContactName: dto.deliveryContactName,
              deliveryContactPhone: dto.deliveryContactPhone,
              deliveryInstructions: dto.deliveryInstructions,
              deliveryWindowStart: dto.deliveryWindowStart ? new Date(dto.deliveryWindowStart) : undefined,
              deliveryWindowEnd: dto.deliveryWindowEnd ? new Date(dto.deliveryWindowEnd) : undefined,
              pickupLat: dto.pickupLat !== undefined ? new Prisma.Decimal(dto.pickupLat) : undefined,
              pickupLng: dto.pickupLng !== undefined ? new Prisma.Decimal(dto.pickupLng) : undefined,
              deliveryLat: dto.deliveryLat !== undefined ? new Prisma.Decimal(dto.deliveryLat) : undefined,
              deliveryLng: dto.deliveryLng !== undefined ? new Prisma.Decimal(dto.deliveryLng) : undefined,
              cargoDescription: dto.cargoDescription,
              cargoWeightKg: dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : undefined,
              cargoVolumeM3: dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : undefined,
              price: new Prisma.Decimal(dto.price),
              freightCharge: dto.freightCharge !== undefined ? new Prisma.Decimal(dto.freightCharge) : undefined,
              fuelSurcharge: dto.fuelSurcharge !== undefined ? new Prisma.Decimal(dto.fuelSurcharge) : undefined,
              otherCharges: dto.otherCharges !== undefined ? new Prisma.Decimal(dto.otherCharges) : undefined,
              currency: dto.currency ?? "USD",
              notes: dto.notes,
              deliveryNotes: dto.deliveryNotes,
            },
          });
          // The order and its opening history row are one fact (AR2). An order is
          // BORN in DRAFT — this is a creation, not a transition, so no policy governs
          // it; but the history row still goes through the single Order writer (AR5).
          await this.orderWriter.recordCreated(tx, organizationId, created.id, actor);

          if (dto.orderStops && dto.orderStops.length > 0) {
            await tx.orderStop.createMany({
              data: dto.orderStops.map((s, i) => ({
                organizationId,
                orderId: created.id,
                stopIndex: i + 1,
                address: s.address,
                city: s.city,
                postalCode: s.postalCode ?? null,
                countryCode: s.countryCode ?? null,
                placeName: s.placeName ?? null,
                contactName: s.contactName ?? null,
                contactPhone: s.contactPhone ?? null,
                instructions: s.instructions ?? null,
                windowStart: s.windowStart ? new Date(s.windowStart) : null,
                windowEnd: s.windowEnd ? new Date(s.windowEnd) : null,
                lat: s.lat !== undefined ? new Prisma.Decimal(s.lat) : null,
                lng: s.lng !== undefined ? new Prisma.Decimal(s.lng) : null,
              })),
            });
          }

          return created;
        });
        break;
      } catch (err) {
        const isOrderNumberConflict =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isOrderNumberConflict) throw err;
        if (!isAutoNumber || attempt >= 2) {
          throw new ConflictException("An order with this orderNumber already exists in this organization");
        }
        orderNumber = await generateUniqueOrderNumber(this.prisma, organizationId, pickupDate);
      }
    }

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: dto.acknowledgeDuplicate ? "order.create.duplicate_override" : "order.create",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        ...(dto.acknowledgeDuplicate ? { duplicateOverride: true } : {}),
      },
    });

    void this.workflowEvents.emit(organizationId, "order.created", { id: order.id, orderNumber: order.orderNumber, customerId: order.customerId, status: order.status });

    // Fire-and-forget geocoding — must never make order creation fail.
    void this.geocoding.geocodeOrderLocations(order.id).catch((err: unknown) => {
      this.logger.warn(`Geocoding failed for new order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
    });

    return this.toResponse(order);
  }

  async update(organizationId: string, id: string, dto: UpdateOrderDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);

    if (existing.status === "DELIVERED" || existing.status === "CANCELLED") {
      throw new ConflictException(`Cannot edit an order with status ${existing.status}`);
    }
    if (existing.archivedAt) {
      throw new ConflictException("Archived orders cannot be edited — restore first");
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
    if (dto.pickupWindowStart !== undefined || dto.pickupWindowEnd !== undefined) {
      this.assertValidWindow(dto.pickupWindowStart, dto.pickupWindowEnd, "pickup");
    }
    if (dto.deliveryWindowStart !== undefined || dto.deliveryWindowEnd !== undefined) {
      this.assertValidWindow(dto.deliveryWindowStart, dto.deliveryWindowEnd, "delivery");
    }
    if (dto.orderStops) {
      for (let i = 0; i < dto.orderStops.length; i++) {
        const s = dto.orderStops[i];
        this.assertValidWindow(s.windowStart, s.windowEnd, `stop ${i + 1}`);
      }
    }

    // Detect whether the address text changed so we can invalidate stale coords.
    const pickupAddressChanged =
      (dto.pickupAddress !== undefined && dto.pickupAddress !== existing.pickupAddress) ||
      (dto.pickupCity !== undefined && dto.pickupCity !== existing.pickupCity);
    const deliveryAddressChanged =
      (dto.deliveryAddress !== undefined && dto.deliveryAddress !== existing.deliveryAddress) ||
      (dto.deliveryCity !== undefined && dto.deliveryCity !== existing.deliveryCity);

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

    // When an assigned order's window moves, the live dispatch's scheduled
    // dates must move in the same transaction. Availability and the GiST
    // exclusion constraints read Dispatch.pickupDateScheduled /
    // deliveryDateScheduled — leaving them stale after an Order edit would
    // let two trips overlap on the new window while the reservation still
    // holds the old one (ADR-001 schedule drift).
    const updated = await this.dispatches.inTransaction(async (tx) => {
      const order = await tx.order.update({
        where: { id },
        data: {
          orderNumber: dto.orderNumber,
          customerId,
          pickupAddress: dto.pickupAddress,
          pickupCity: dto.pickupCity,
          pickupDate: dto.pickupDate ? pickupDate : undefined,
          pickupPostalCode: dto.pickupPostalCode,
          pickupCountryCode: dto.pickupCountryCode,
          pickupPlaceName: dto.pickupPlaceName,
          pickupContactName: dto.pickupContactName,
          pickupContactPhone: dto.pickupContactPhone,
          pickupInstructions: dto.pickupInstructions,
          pickupWindowStart: dto.pickupWindowStart !== undefined ? new Date(dto.pickupWindowStart) : undefined,
          pickupWindowEnd: dto.pickupWindowEnd !== undefined ? new Date(dto.pickupWindowEnd) : undefined,
          // Explicit coords from the client always win. Only clear stale coords
          // when the address text changed AND no new coords were supplied.
          pickupLat: dto.pickupLat != null ? new Prisma.Decimal(dto.pickupLat) : pickupAddressChanged ? null : undefined,
          pickupLng: dto.pickupLng != null ? new Prisma.Decimal(dto.pickupLng) : pickupAddressChanged ? null : undefined,
          pickupGeocodedAt: pickupAddressChanged ? null : undefined,
          deliveryAddress: dto.deliveryAddress,
          deliveryCity: dto.deliveryCity,
          deliveryDate: dto.deliveryDate ? deliveryDate : undefined,
          deliveryPostalCode: dto.deliveryPostalCode,
          deliveryCountryCode: dto.deliveryCountryCode,
          deliveryPlaceName: dto.deliveryPlaceName,
          deliveryContactName: dto.deliveryContactName,
          deliveryContactPhone: dto.deliveryContactPhone,
          deliveryInstructions: dto.deliveryInstructions,
          deliveryWindowStart: dto.deliveryWindowStart !== undefined ? new Date(dto.deliveryWindowStart) : undefined,
          deliveryWindowEnd: dto.deliveryWindowEnd !== undefined ? new Date(dto.deliveryWindowEnd) : undefined,
          deliveryLat: dto.deliveryLat != null ? new Prisma.Decimal(dto.deliveryLat) : deliveryAddressChanged ? null : undefined,
          deliveryLng: dto.deliveryLng != null ? new Prisma.Decimal(dto.deliveryLng) : deliveryAddressChanged ? null : undefined,
          deliveryGeocodedAt: deliveryAddressChanged ? null : undefined,
          geocodeSource: (pickupAddressChanged || deliveryAddressChanged) ? null : undefined,
          cargoDescription: dto.cargoDescription,
          cargoWeightKg: dto.cargoWeightKg !== undefined ? new Prisma.Decimal(dto.cargoWeightKg) : undefined,
          cargoVolumeM3: dto.cargoVolumeM3 !== undefined ? new Prisma.Decimal(dto.cargoVolumeM3) : undefined,
          price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
          freightCharge: dto.freightCharge !== undefined ? (dto.freightCharge !== null ? new Prisma.Decimal(dto.freightCharge) : null) : undefined,
          fuelSurcharge: dto.fuelSurcharge !== undefined ? (dto.fuelSurcharge !== null ? new Prisma.Decimal(dto.fuelSurcharge) : null) : undefined,
          otherCharges: dto.otherCharges !== undefined ? (dto.otherCharges !== null ? new Prisma.Decimal(dto.otherCharges) : null) : undefined,
          currency: dto.currency,
          notes: dto.notes,
          deliveryNotes: dto.deliveryNotes,
        },
      });

      if (windowMoved) {
        // Sync every non-terminal dispatch for this order (DRAFT included —
        // its scheduled window is what AssignmentPolicy / GiST will use once
        // it activates). Terminal rows keep their historical schedule.
        await tx.dispatch.updateMany({
          where: {
            organizationId,
            orderId: id,
            status: { notIn: ["CANCELLED", "DELIVERED"] },
          },
          data: {
            pickupDateScheduled: pickupDate,
            deliveryDateScheduled: deliveryDate,
          },
        });
      }

      // Replace intermediate stops atomically when the client sends them.
      // undefined = no change; empty array = delete all; non-empty = replace all.
      if (dto.orderStops !== undefined) {
        await tx.orderStop.deleteMany({ where: { orderId: id } });
        if (dto.orderStops.length > 0) {
          await tx.orderStop.createMany({
            data: dto.orderStops.map((s, i) => ({
              organizationId,
              orderId: id,
              stopIndex: i + 1,
              address: s.address,
              city: s.city,
              postalCode: s.postalCode ?? null,
              countryCode: s.countryCode ?? null,
              placeName: s.placeName ?? null,
              contactName: s.contactName ?? null,
              contactPhone: s.contactPhone ?? null,
              instructions: s.instructions ?? null,
              windowStart: s.windowStart ? new Date(s.windowStart) : null,
              windowEnd: s.windowEnd ? new Date(s.windowEnd) : null,
              lat: s.lat !== undefined ? new Prisma.Decimal(s.lat) : null,
              lng: s.lng !== undefined ? new Prisma.Decimal(s.lng) : null,
            })),
          });
        }
      }

      return order;
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.update",
      entityType: "Order",
      entityId: id,
      metadata: { changes: dto },
    });

    void this.workflowEvents.emit(organizationId, "order.updated", { id, orderNumber: updated.orderNumber, customerId: updated.customerId, status: updated.status, changes: dto });

    // Re-geocode if any address text changed — must never fail the update request.
    if (pickupAddressChanged || deliveryAddressChanged) {
      void this.geocoding.geocodeOrderLocations(id).catch((err: unknown) => {
        this.logger.warn(`Re-geocoding failed for order ${id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

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
    const projected = await this.dispatches.inTransaction(async (tx) => {
      // Prefer an existing non-terminal dispatch (including DRAFT). Creating a
      // second live row while a draft sits on the order hits the partial unique
      // and deadlocks the assign path until someone cancels the draft by hand.
      const existing = await this.dispatches.drivableDispatchForOrder(tx, organizationId, id);

      if (existing) {
        await this.dispatches.reassignInTx(
          tx,
          organizationId,
          existing,
          { driverId: dto.driverId, vehicleId: dto.vehicleId },
          actor,
          existing.status === "DRAFT" ? "Activated via order assign" : "Reassigned via order",
        );
        if (existing.status === "DRAFT") {
          const fresh = await tx.dispatch.findUniqueOrThrow({ where: { id: existing.id } });
          await this.dispatches.transitionInTx(
            tx,
            organizationId,
            fresh,
            "ASSIGNED",
            actor,
            "Driver and vehicle assigned",
          );
        }
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

    // Gated on the STATUS actually moving, not merely `changed` — a
    // driver/vehicle reassignment onto an already-ASSIGNED order also reports
    // `changed: true` (per OrderProjection.settle()), and firing
    // order.status_changed with from === to would misrepresent a reassignment
    // as a status transition.
    if (projected.changed && projected.previousStatus !== projected.order.status) {
      void this.workflowEvents.emit(organizationId, "order.status_changed", {
        id,
        orderNumber: projected.order.orderNumber,
        from: projected.previousStatus,
        to: projected.order.status,
      });
    }

    const live = await this.prisma.dispatch.findFirst({
      where: {
        organizationId,
        orderId: id,
        status: { notIn: ["CANCELLED", "DELIVERED"] },
      },
      select: { id: true, dispatchNumber: true, driverId: true, status: true },
    });
    if (live?.status === "ASSIGNED") {
      await notifyDriverOfAssignment(this.prisma, {
        organizationId,
        driverId: live.driverId,
        dispatchId: live.id,
        dispatchNumber: live.dispatchNumber,
        reason: wasPending ? "assigned" : "reassigned",
      }).catch(() => undefined);
    }

    return this.toResponse(projected.order);
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

    void this.workflowEvents.emit(organizationId, "order.status_changed", { id: order.id, orderNumber: order.orderNumber, from: order.status, to: dto.status });

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

    // The event for this path is already emitted, unconditionally and once, by
    // applyStatusTransition after its transaction commits — do not also emit
    // here, or a dispatch-driven order transition would fire order.status_changed
    // twice.
    return (await this.orderWriter.project(tx, organizationId, order.id, actor, dto.note)).order;
  }

  async cancel(organizationId: string, id: string, dto: CancelOrderDto, actor: CurrentUserPayload) {
    const order = await this.findOrThrow(organizationId, id);

    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConflictException(`Cannot cancel an order with status ${order.status}`);
    }

    const updated = await this.dispatches.inTransaction(async (tx) => {
      // A dead order must not keep a driver and a truck reserved — including a
      // DRAFT dispatch that has already opened an assignment but is not yet in
      // ACTIVE_DISPATCH_STATUSES. Cancel every non-terminal row for this order.
      const open = await tx.dispatch.findMany({
        where: {
          organizationId,
          orderId: id,
          status: { notIn: ["CANCELLED", "DELIVERED"] },
        },
      });
      for (const dispatch of open) {
        await this.dispatches.cancelInTx(tx, organizationId, dispatch.id, actor, "Order cancelled");
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

    void this.workflowEvents.emit(organizationId, "order.cancelled", { id, orderNumber: updated.orderNumber, note: dto.note });

    return this.toResponse(updated);
  }

  /// Same-day city delivery is ordinary work, and both dates arrive as
  /// date-only values, so requiring delivery strictly after pickup made it
  /// impossible to record. Delivering before pickup remains nonsense.
  private assertValidDateRange(pickupDate: Date, deliveryDate: Date): void {
    if (deliveryDate.getTime() < pickupDate.getTime()) {
      throw new BadRequestException("deliveryDate cannot be before pickupDate");
    }
  }

  /// If either window bound is provided, both must be provided and end >= start.
  private assertValidWindow(start: string | undefined, end: string | undefined, label: string): void {
    if (start === undefined && end === undefined) return;
    if (start !== undefined && end === undefined) {
      throw new BadRequestException(`${label}WindowEnd is required when ${label}WindowStart is set`);
    }
    if (start === undefined && end !== undefined) {
      throw new BadRequestException(`${label}WindowStart is required when ${label}WindowEnd is set`);
    }
    if (new Date(end!) < new Date(start!)) {
      throw new BadRequestException(`${label}WindowEnd must not be before ${label}WindowStart`);
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
    order: Order & {
      statusHistory?: { id: string; status: OrderStatus; changedByUserId: string | null; note: string | null; createdAt: Date }[];
      orderStops?: { id: string; stopIndex: number; address: string; city: string; postalCode: string | null; countryCode: string | null; placeName: string | null; contactName: string | null; contactPhone: string | null; instructions: string | null; windowStart: Date | null; windowEnd: Date | null; lat: Prisma.Decimal | null; lng: Prisma.Decimal | null }[];
    },
  ) {
    const isDelayed =
      order.status !== "DELIVERED" && order.status !== "CANCELLED" && isScheduleLate(order.deliveryDate);

    return {
      id: order.id,
      organizationId: order.organizationId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      pickupAddress: order.pickupAddress,
      pickupCity: order.pickupCity,
      pickupDate: order.pickupDate,
      pickupPostalCode: order.pickupPostalCode ?? null,
      pickupCountryCode: order.pickupCountryCode ?? null,
      pickupLat: order.pickupLat != null ? order.pickupLat.toNumber() : null,
      pickupLng: order.pickupLng != null ? order.pickupLng.toNumber() : null,
      pickupPlaceName: order.pickupPlaceName ?? null,
      pickupContactName: order.pickupContactName ?? null,
      pickupContactPhone: order.pickupContactPhone ?? null,
      pickupInstructions: order.pickupInstructions ?? null,
      pickupWindowStart: order.pickupWindowStart ?? null,
      pickupWindowEnd: order.pickupWindowEnd ?? null,
      pickupGeocodedAt: order.pickupGeocodedAt ?? null,
      deliveryAddress: order.deliveryAddress,
      deliveryCity: order.deliveryCity,
      deliveryDate: order.deliveryDate,
      deliveryPostalCode: order.deliveryPostalCode ?? null,
      deliveryCountryCode: order.deliveryCountryCode ?? null,
      deliveryLat: order.deliveryLat != null ? order.deliveryLat.toNumber() : null,
      deliveryLng: order.deliveryLng != null ? order.deliveryLng.toNumber() : null,
      deliveryPlaceName: order.deliveryPlaceName ?? null,
      deliveryContactName: order.deliveryContactName ?? null,
      deliveryContactPhone: order.deliveryContactPhone ?? null,
      deliveryInstructions: order.deliveryInstructions ?? null,
      deliveryWindowStart: order.deliveryWindowStart ?? null,
      deliveryWindowEnd: order.deliveryWindowEnd ?? null,
      deliveryGeocodedAt: order.deliveryGeocodedAt ?? null,
      geocodeSource: order.geocodeSource ?? null,
      cargoDescription: order.cargoDescription,
      cargoWeightKg: order.cargoWeightKg?.toString() ?? null,
      cargoVolumeM3: order.cargoVolumeM3?.toString() ?? null,
      price: order.price.toString(),
      freightCharge: order.freightCharge?.toString() ?? null,
      fuelSurcharge: order.fuelSurcharge?.toString() ?? null,
      otherCharges: order.otherCharges?.toString() ?? null,
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
      archivedAt: order.archivedAt,
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
      ...(order.orderStops
        ? {
            orderStops: order.orderStops.map((s) => ({
              id: s.id,
              stopIndex: s.stopIndex,
              address: s.address,
              city: s.city,
              postalCode: s.postalCode,
              countryCode: s.countryCode,
              placeName: s.placeName,
              contactName: s.contactName,
              contactPhone: s.contactPhone,
              instructions: s.instructions,
              windowStart: s.windowStart,
              windowEnd: s.windowEnd,
              lat: s.lat != null ? s.lat.toNumber() : null,
              lng: s.lng != null ? s.lng.toNumber() : null,
            })),
          }
        : {}),
    };
  }

  private toListResponse(
    order: Order & {
      customer?: { id: string; companyName: string; phone: string | null };
      driver?: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
      vehicle?: { id: string; plateNumber: string; vehicleCode: string } | null;
      dispatches?: Array<{
        id: string;
        status: string;
        driverId: string;
        vehicleId: string;
        driver: { id: string; firstName: string; lastName: string; employeeCode: string };
        vehicle: { id: string; plateNumber: string; vehicleCode: string };
      }>;
    },
  ) {
    const base = this.toResponse(order);
    const liveDispatch = order.dispatches?.[0];
    const plannedDriver = base.driverId ? order.driver : liveDispatch?.driver ?? null;
    const plannedVehicle = base.vehicleId ? order.vehicle : liveDispatch?.vehicle ?? null;
    return {
      ...base,
      customer: order.customer,
      plannedDriver,
      plannedVehicle,
      activeDispatch: liveDispatch
        ? {
            id: liveDispatch.id,
            status: liveDispatch.status,
            driverId: liveDispatch.driverId,
            vehicleId: liveDispatch.vehicleId,
          }
        : null,
    };
  }

}
