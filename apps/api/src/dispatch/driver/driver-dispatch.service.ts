import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { OrderWriter } from "../../order-state/order-writer";
import { PrismaService } from "../../prisma/prisma.service";
import { TrackingService } from "../../telematics/tracking/tracking.service";
import { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import { DispatchesService } from "../dispatches.service";
import { allowedDispatchTransitions, DRIVER_DISPATCH_STATUSES } from "../dispatch-transitions";
import { UpdateDispatchStatusDto } from "../dto/update-dispatch-status.dto";
import { DriverActionEventsService } from "./driver-action-events.service";
import { DriverWorkspaceService } from "./driver-workspace.service";
import type { RejectDispatchDto } from "./dto/reject-dispatch.dto";
import type { ArrivalLocationDto } from "./dto/driver-workspace.dto";
import type { ReportDeliveryFailureDto } from "./dto/report-delivery-failure.dto";
import type { ReportIntermediateStopFailureDto } from "./dto/report-intermediate-stop-failure.dto";

@Injectable()
export class DriverDispatchService {
  private readonly logger = new Logger(DriverDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatches: DispatchesService,
    private readonly orderWriter: OrderWriter,
    private readonly auditService: AuditService,
    private readonly tracking: TrackingService,
    private readonly events: DriverActionEventsService,
    private readonly workspace: DriverWorkspaceService,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  async listMine(organizationId: string, userId: string, includeFinished = false) {
    const driverId = await this.resolveOwnDriverId(organizationId, userId);

    const dispatches = await this.prisma.dispatch.findMany({
      where: {
        organizationId,
        driverId,
        status: includeFinished
          ? { not: "DRAFT" }
          : { in: ["ASSIGNED", ...DRIVER_DISPATCH_STATUSES.filter((s) => s !== "DELIVERED")] },
        // Rejected assignments stay on the row until dispatcher reassigns, but
        // they must not clutter the driver's active to-do list.
        ...(includeFinished ? {} : { driverAcceptanceStatus: { not: "REJECTED" } }),
      },
      include: DRIVER_INCLUDE,
      orderBy: { pickupDateScheduled: "asc" },
    });

    return dispatches.map((dispatch) => this.toDriverResponse(dispatch));
  }

  async getMine(organizationId: string, userId: string, id: string) {
    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, true);
    return this.toDriverResponse(dispatch);
  }

  async accept(organizationId: string, userId: string, id: string, actor: CurrentUserPayload) {
    const driverId = await this.resolveOwnDriverId(organizationId, userId);
    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, false);

    if (dispatch.status !== "ASSIGNED") {
      throw new BadRequestException("Only ASSIGNED dispatches can be accepted");
    }
    if (dispatch.driverAcceptanceStatus === "ACCEPTED") {
      return this.toDriverResponse(dispatch);
    }
    if (dispatch.driverAcceptanceStatus === "REJECTED") {
      throw new ConflictRejected("This assignment was already rejected");
    }

    const updated = await this.prisma.dispatch.update({
      where: { id },
      data: {
        driverAcceptanceStatus: "ACCEPTED",
        driverAcceptedAt: new Date(),
        driverRejectedAt: null,
        driverRejectReason: null,
        driverRejectNote: null,
      },
      include: DRIVER_INCLUDE,
    });

    await this.events.record(organizationId, driverId, "DRIVER_ACCEPTED", { dispatchId: id });
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.driver_accepted",
      entityType: "Dispatch",
      entityId: id,
      metadata: { dispatchNumber: dispatch.dispatchNumber },
    });
    await this.notifyDispatchers(organizationId, {
      type: "DRIVER_ASSIGNMENT_ACCEPTED",
      title: "Driver accepted assignment",
      message: `${dispatch.dispatchNumber} was accepted by the driver`,
      entityId: id,
    });

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { operationalStatus: "BUSY" },
    });

    return this.toDriverResponse(updated);
  }

  async reject(
    organizationId: string,
    userId: string,
    id: string,
    dto: RejectDispatchDto,
    actor: CurrentUserPayload,
  ) {
    const driverId = await this.resolveOwnDriverId(organizationId, userId);
    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, false);

    if (dispatch.status !== "ASSIGNED") {
      throw new BadRequestException("Only ASSIGNED dispatches can be rejected");
    }
    if (dispatch.driverAcceptanceStatus === "ACCEPTED") {
      throw new BadRequestException("Cannot reject an already accepted assignment");
    }
    if (dto.reason === "OTHER" && !dto.note?.trim()) {
      throw new BadRequestException("A note is required when reason is OTHER");
    }

    const note = dto.note?.trim() || null;

    const updated = await this.prisma.dispatch.update({
      where: { id },
      data: {
        driverAcceptanceStatus: "REJECTED",
        driverRejectedAt: new Date(),
        driverRejectReason: dto.reason,
        driverRejectNote: note,
      },
      include: DRIVER_INCLUDE,
    });

    await this.events.record(organizationId, driverId, "DRIVER_REJECTED", {
      dispatchId: id,
      payload: { reason: dto.reason, note },
    });
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.driver_rejected",
      entityType: "Dispatch",
      entityId: id,
      metadata: { reason: dto.reason, note, dispatchNumber: dispatch.dispatchNumber },
    });
    await this.notifyDispatchers(organizationId, {
      type: "DRIVER_ASSIGNMENT_REJECTED",
      title: "Driver rejected assignment",
      message: `${dispatch.dispatchNumber} rejected (${dto.reason.replace(/_/g, " ").toLowerCase()}). Reassign required.`,
      entityId: id,
    });

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { operationalStatus: "AVAILABLE" },
    });

    return this.toDriverResponse(updated);
  }

  async updateStatus(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateDispatchStatusDto,
    actor: CurrentUserPayload,
    arrival?: ArrivalLocationDto,
  ) {
    if (!DRIVER_DISPATCH_STATUSES.includes(dto.status)) {
      throw new ForbiddenException(
        `Drivers can only move a dispatch to ${DRIVER_DISPATCH_STATUSES.join(", ")}`,
      );
    }

    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, false);
    const driverId = dispatch.driverId;

    if (dto.status === "EN_ROUTE_TO_PICKUP" && dispatch.driverAcceptanceStatus !== "ACCEPTED") {
      throw new ForbiddenException("Accept the assignment before starting the trip");
    }

    if (dto.status === "DELIVERED") {
      await this.workspace.assertDeliveredChecklist(organizationId, id);
    }

    const { updated, projected } = await this.dispatches.inTransaction(async (tx) => {
      await this.dispatches.transitionInTx(
        tx,
        organizationId,
        dispatch,
        dto.status,
        actor,
        dto.note,
      );
      const projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, dto.note);

      if (dto.status === "AT_PICKUP" && arrival?.lat != null && arrival?.lng != null) {
        await tx.dispatch.update({
          where: { id },
          data: {
            arrivalLat: new Prisma.Decimal(arrival.lat),
            arrivalLng: new Prisma.Decimal(arrival.lng),
          },
        });
      }

      const ops =
        dto.status === "EN_ROUTE_TO_PICKUP" || dto.status === "IN_TRANSIT"
          ? "DRIVING"
          : dto.status === "AT_PICKUP" || dto.status === "ARRIVED_AT_DELIVERY" || dto.status === "AT_STOP"
            ? "LOADING"
            : dto.status === "DELIVERED"
              ? "AVAILABLE"
              : undefined;
      if (ops) {
        await tx.driver.update({ where: { id: driverId }, data: { operationalStatus: ops } });
      }

      await this.dispatches.updateRouteStopStatusInTx(tx, id, dto.status);

      const updated = await tx.dispatch.findUniqueOrThrow({ where: { id }, include: DRIVER_INCLUDE });
      return { updated, projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.driver_status_change",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from: dispatch.status, to: dto.status, note: dto.note },
    });

    const eventType =
      dto.status === "EN_ROUTE_TO_PICKUP"
        ? "TRIP_STARTED"
        : dto.status === "AT_PICKUP"
          ? "ARRIVED_PICKUP"
          : dto.status === "IN_TRANSIT"
            ? "IN_TRANSIT"
            : dto.status === "ARRIVED_AT_DELIVERY"
              ? "ARRIVED_DELIVERY"
              : dto.status === "DELIVERED"
                ? "DELIVERED"
                : "STATUS_CHANGED";
    await this.events.record(organizationId, driverId, eventType, {
      dispatchId: id,
      payload: {
        from: dispatch.status,
        to: dto.status,
        arrival: arrival?.lat != null && arrival?.lng != null ? { lat: arrival.lat, lng: arrival.lng } : null,
      },
    });

    if (dto.status === "DELIVERED" || dto.status === "CANCELLED") {
      await this.tracking.endSessionsForDispatch(organizationId, id).catch(() => undefined);
    }

    await this.dispatches.handleArrivalGeofenceHook(organizationId, id, dto.status).catch((err) => {
      this.logger.warn(`Arrival geofence hook failed for dispatch ${id}: ${err instanceof Error ? err.message : String(err)}`);
    });

    // This is the driver-app equivalent of DispatchesService.updateStatus() —
    // until this was added, a driver marking their own delivery complete never
    // fired dispatch.status_changed/dispatch.completed/order.status_changed at
    // all, so every workflow (including "auto-invoice on delivery") silently
    // never ran for the path real drivers actually use in the field.
    void this.workflowEvents.emit(organizationId, "dispatch.status_changed", {
      id,
      dispatchNumber: dispatch.dispatchNumber,
      orderId: dispatch.orderId,
      from: dispatch.status,
      to: dto.status,
    });
    if (dto.status === "DELIVERED") {
      void this.workflowEvents.emit(organizationId, "dispatch.completed", {
        id,
        dispatchNumber: dispatch.dispatchNumber,
        orderId: dispatch.orderId,
      });
    }
    this.dispatches.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toDriverResponse(updated);
  }

  async reportFailure(
    organizationId: string,
    userId: string,
    id: string,
    dto: ReportDeliveryFailureDto,
    actor: CurrentUserPayload,
  ) {
    if (dto.reason === "OTHER" && !dto.notes?.trim()) {
      throw new BadRequestException("A note is required when reason is OTHER");
    }

    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, false);
    const driverId = dispatch.driverId;

    if (dispatch.status !== "ARRIVED_AT_DELIVERY") {
      throw new BadRequestException(
        `Can only report a failed delivery from ARRIVED_AT_DELIVERY (current: ${dispatch.status})`,
      );
    }

    const notes = dto.notes?.trim() || null;
    const occurredAt = new Date();

    const { updated, projected } = await this.dispatches.inTransaction(async (tx) => {
      // Transition dispatch to DELIVERY_FAILED via the same compare-and-set engine.
      await this.dispatches.transitionInTx(tx, organizationId, dispatch, "DELIVERY_FAILED", actor, `Delivery failed: ${dto.reason}`);

      // Stamp the failure fields for fast access without a join.
      await tx.dispatch.update({
        where: { id },
        data: {
          failureReason: dto.reason,
          failureNotes: notes,
          failedAt: occurredAt,
        },
      });

      // Phase 5B — mirror failure fields onto the DELIVERY stop snapshot.
      // updateMany silently matches zero rows for pre-Phase-5B dispatches.
      await tx.dispatchStop.updateMany({
        where: { dispatchId: id, stopType: "DELIVERY" },
        data: {
          failedAt: occurredAt,
          failureReason: dto.reason,
          failureNotes: notes,
        },
      });

      // Driver is no longer holding a delivery — return to AVAILABLE.
      await tx.driver.update({
        where: { id: driverId },
        data: { operationalStatus: "AVAILABLE" },
      });

      // Append-only attempt record — never overwrites previous attempts.
      await tx.deliveryAttempt.create({
        data: {
          organizationId,
          dispatchId: id,
          orderId: dispatch.orderId,
          driverId,
          failureReason: dto.reason,
          notes,
          lat: dto.lat != null ? new Prisma.Decimal(dto.lat) : null,
          lng: dto.lng != null ? new Prisma.Decimal(dto.lng) : null,
          occurredAt,
        },
      });

      // Project the order: DELIVERY_FAILED is the only dispatch → allTerminal →
      // order falls back to PENDING (ready for re-dispatch).
      const projected = await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, "Delivery failed");
      const updated = await tx.dispatch.findUniqueOrThrow({ where: { id }, include: DRIVER_INCLUDE });
      return { updated, projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.delivery_failed",
      entityType: "Dispatch",
      entityId: id,
      metadata: { reason: dto.reason, notes, dispatchNumber: dispatch.dispatchNumber },
    });

    await this.events.record(organizationId, driverId, "DELIVERY_FAILED", {
      dispatchId: id,
      payload: {
        reason: dto.reason,
        notes,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
      },
    });

    // Idempotent dispatcher notification — skip if one already exists for this dispatch.
    const existingNotif = await this.prisma.notification.findFirst({
      where: { organizationId, type: "DISPATCH_DELIVERY_FAILED", entityId: id, isArchived: false },
    });
    if (!existingNotif) {
      await this.notifyDispatchers(organizationId, {
        type: "DISPATCH_DELIVERY_FAILED",
        title: "Delivery failed",
        message: `${dispatch.dispatchNumber} — ${dto.reason.replace(/_/g, " ").toLowerCase()}${notes ? `: ${notes.slice(0, 80)}` : ""}`,
        entityId: id,
      });
    }

    await this.dispatches.handleArrivalGeofenceHook(organizationId, id, "DELIVERY_FAILED").catch((err) => {
      this.logger.warn(`Geofence cleanup failed for dispatch ${id}: ${err instanceof Error ? err.message : String(err)}`);
    });

    void this.workflowEvents.emit(organizationId, "dispatch.failed", {
      id,
      dispatchNumber: dispatch.dispatchNumber,
      orderId: dispatch.orderId,
      reason: dto.reason,
      notes,
    });
    this.dispatches.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toDriverResponse(updated);
  }

  async reportIntermediateStopFailure(
    organizationId: string,
    userId: string,
    dispatchId: string,
    stopId: string,
    dto: ReportIntermediateStopFailureDto,
    actor: CurrentUserPayload,
  ) {
    if (dto.reason === "OTHER" && !dto.notes?.trim()) {
      throw new BadRequestException("A note is required when reason is OTHER");
    }

    const dispatch = await this.findOwnOrThrow(organizationId, userId, dispatchId, false);
    const driverId = dispatch.driverId;

    if (dispatch.status !== "AT_STOP") {
      throw new BadRequestException(
        `Can only report an intermediate stop failure from AT_STOP (current: ${dispatch.status})`,
      );
    }

    const stop = await this.prisma.dispatchStop.findFirst({
      where: { id: stopId, dispatchId, organizationId },
    });
    if (!stop) {
      throw new NotFoundException("Stop not found");
    }
    if (stop.stopType !== "INTERMEDIATE") {
      throw new BadRequestException(
        `Only INTERMEDIATE stops can be failed this way (stop is ${stop.stopType})`,
      );
    }
    if (stop.failedAt !== null) {
      throw new ConflictException("This stop has already been marked as failed");
    }
    if (stop.completedAt !== null) {
      throw new ConflictException("This stop has already been completed");
    }
    if (stop.arrivedAt === null) {
      throw new BadRequestException(
        "Cannot fail a stop that has not been arrived at — only the current active stop can be failed",
      );
    }

    const notes = dto.notes?.trim() || null;
    const failedAt = new Date();

    const { updated, projected } = await this.dispatches.inTransaction(async (tx) => {
      // CAS on the stop — first race detector. If a concurrent request already
      // stamped failedAt or completedAt (or cleared arrivedAt via undo), count=0.
      const stopResult = await tx.dispatchStop.updateMany({
        where: {
          id: stopId,
          failedAt: null,
          completedAt: null,
          arrivedAt: { not: null },
        },
        data: {
          failedAt,
          failureReason: dto.reason,
          failureNotes: notes,
        },
      });
      if (stopResult.count !== 1) {
        throw new ConflictException("Stop state changed concurrently — refresh and retry");
      }

      // Transition AT_STOP → IN_TRANSIT. The compare-and-set inside transitionInTx
      // (WHERE status = AT_STOP) is the second race detector. Because the stop now
      // has failedAt set, findActiveIntermediateStop returns null, so completedAt
      // is NOT stamped on the failed stop. ✓
      await this.dispatches.transitionInTx(
        tx,
        organizationId,
        dispatch,
        "IN_TRANSIT",
        actor,
        `Intermediate stop failed: ${dto.reason}`,
      );

      const projected = await this.orderWriter.project(
        tx,
        organizationId,
        dispatch.orderId,
        actor,
        "Intermediate stop failed",
      );
      const updated = await tx.dispatch.findUniqueOrThrow({
        where: { id: dispatchId },
        include: DRIVER_INCLUDE,
      });
      return { updated, projected };
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.intermediate_stop_failed",
      entityType: "Dispatch",
      entityId: dispatchId,
      metadata: {
        stopId,
        stopIndex: stop.stopIndex,
        reason: dto.reason,
        notes,
        dispatchNumber: dispatch.dispatchNumber,
      },
    });

    await this.events.record(organizationId, driverId, "INTERMEDIATE_STOP_FAILED", {
      dispatchId,
      payload: {
        stopId,
        stopIndex: stop.stopIndex,
        reason: dto.reason,
        notes,
      },
    });

    // One notification per stop failure — the stop CAS above prevents duplicate
    // calls for the same stop, so no separate deduplication query is needed.
    await this.notifyDispatchers(organizationId, {
      type: "DISPATCH_INTERMEDIATE_STOP_FAILED",
      title: "Intermediate stop could not be completed",
      message: `${dispatch.dispatchNumber} — stop ${stop.stopIndex + 1} failed (${dto.reason.replace(/_/g, " ").toLowerCase()}${notes ? `: ${notes.slice(0, 80)}` : ""}). Delivery is continuing.`,
      entityId: dispatchId,
    });

    // Reuse the existing IN_TRANSIT geofence hook: archives the failed stop's fence,
    // creates the next intermediate stop's fence (or delivery fence if none remain).
    await this.dispatches.handleArrivalGeofenceHook(organizationId, dispatchId, "IN_TRANSIT").catch((err) => {
      this.logger.warn(
        `Geofence handoff failed for dispatch ${dispatchId} after intermediate stop failure: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    void this.workflowEvents.emit(organizationId, "dispatch.status_changed", {
      id: dispatchId,
      dispatchNumber: dispatch.dispatchNumber,
      orderId: dispatch.orderId,
      from: dispatch.status,
      to: "IN_TRANSIT",
    });
    this.dispatches.emitOrderStatusChangedIfMoved(organizationId, projected);

    return this.toDriverResponse(updated);
  }

  private async notifyDispatchers(
    organizationId: string,
    input: { type: string; title: string; message: string; entityId: string },
  ) {
    await this.prisma.notification.create({
      data: {
        organizationId,
        type: input.type,
        category: "OPERATIONS",
        severity: "HIGH",
        title: input.title,
        message: input.message,
        entityType: "Dispatch",
        entityId: input.entityId,
      },
    });
  }

  private async findOwnOrThrow(
    organizationId: string,
    userId: string,
    id: string,
    withHistory: boolean,
  ) {
    const driverId = await this.resolveOwnDriverId(organizationId, userId);

    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id, organizationId, driverId, status: { not: "DRAFT" } },
      include: withHistory
        ? { ...DRIVER_INCLUDE, statusHistory: { orderBy: { createdAt: "asc" } } }
        : DRIVER_INCLUDE,
    });
    if (!dispatch) {
      throw new NotFoundException("Dispatch not found");
    }
    return dispatch;
  }

  private async resolveOwnDriverId(organizationId: string, userId: string): Promise<string> {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
    });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account yet");
    }
    return driver.id;
  }

  private toDriverResponse(dispatch: DriverDispatch) {
    const canStart =
      dispatch.status === "ASSIGNED" && dispatch.driverAcceptanceStatus === "ACCEPTED";
    let allowed = allowedDispatchTransitions(dispatch.status, DRIVER_DISPATCH_STATUSES);
    if (dispatch.status === "ASSIGNED" && !canStart) {
      allowed = [];
    }

    return {
      id: dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      status: dispatch.status,
      driverAcceptanceStatus: dispatch.driverAcceptanceStatus,
      driverAcceptedAt: dispatch.driverAcceptedAt?.toISOString() ?? null,
      driverRejectedAt: dispatch.driverRejectedAt?.toISOString() ?? null,
      driverRejectReason: dispatch.driverRejectReason,
      driverRejectNote: dispatch.driverRejectNote,
      allowedTransitions: allowed,
      pickupDateScheduled: dispatch.pickupDateScheduled,
      pickupDateActual: dispatch.pickupDateActual,
      deliveryDateScheduled: dispatch.deliveryDateScheduled,
      deliveryDateActual: dispatch.deliveryDateActual,
      notes: dispatch.notes,
      failureReason: dispatch.failureReason ?? null,
      failureNotes: dispatch.failureNotes ?? null,
      failedAt: dispatch.failedAt?.toISOString() ?? null,
      arrivalLat: dispatch.arrivalLat?.toString() ?? null,
      arrivalLng: dispatch.arrivalLng?.toString() ?? null,
      order: {
        id: dispatch.order.id,
        orderNumber: dispatch.order.orderNumber,
        pickupAddress: dispatch.order.pickupAddress,
        pickupCity: dispatch.order.pickupCity,
        pickupPlaceName: dispatch.order.pickupPlaceName,
        pickupPostalCode: dispatch.order.pickupPostalCode,
        pickupCountryCode: dispatch.order.pickupCountryCode,
        pickupContactName: dispatch.order.pickupContactName,
        pickupContactPhone: dispatch.order.pickupContactPhone,
        pickupInstructions: dispatch.order.pickupInstructions,
        pickupWindowStart: dispatch.order.pickupWindowStart?.toISOString() ?? null,
        pickupWindowEnd: dispatch.order.pickupWindowEnd?.toISOString() ?? null,
        pickupLat: dispatch.order.pickupLat?.toString() ?? null,
        pickupLng: dispatch.order.pickupLng?.toString() ?? null,
        deliveryAddress: dispatch.order.deliveryAddress,
        deliveryCity: dispatch.order.deliveryCity,
        deliveryPlaceName: dispatch.order.deliveryPlaceName,
        deliveryPostalCode: dispatch.order.deliveryPostalCode,
        deliveryCountryCode: dispatch.order.deliveryCountryCode,
        deliveryContactName: dispatch.order.deliveryContactName,
        deliveryContactPhone: dispatch.order.deliveryContactPhone,
        deliveryInstructions: dispatch.order.deliveryInstructions,
        deliveryWindowStart: dispatch.order.deliveryWindowStart?.toISOString() ?? null,
        deliveryWindowEnd: dispatch.order.deliveryWindowEnd?.toISOString() ?? null,
        deliveryLat: dispatch.order.deliveryLat?.toString() ?? null,
        deliveryLng: dispatch.order.deliveryLng?.toString() ?? null,
        cargoDescription: dispatch.order.cargoDescription,
        cargoWeightKg: dispatch.order.cargoWeightKg?.toString() ?? null,
        deliveryNotes: dispatch.order.deliveryNotes,
        status: dispatch.order.status,
      },
      customer: {
        id: dispatch.order.customer.id,
        companyName: dispatch.order.customer.companyName,
        contactName: dispatch.order.customer.contactName,
        phone: dispatch.order.customer.phone,
        deliveryNotes: dispatch.order.customer.deliveryNotes,
      },
      vehicle: {
        id: dispatch.vehicle.id,
        vehicleCode: dispatch.vehicle.vehicleCode,
        plateNumber: dispatch.vehicle.plateNumber,
        type: dispatch.vehicle.type,
      },
      stops: dispatch.stops.map((stop) => ({
        id: stop.id,
        stopType: stop.stopType,
        stopIndex: stop.stopIndex,
        address: stop.address,
        city: stop.city,
        postalCode: stop.postalCode,
        countryCode: stop.countryCode,
        placeName: stop.placeName,
        lat: stop.lat?.toString() ?? null,
        lng: stop.lng?.toString() ?? null,
        contactName: stop.contactName,
        contactPhone: stop.contactPhone,
        instructions: stop.instructions,
        windowStart: stop.windowStart?.toISOString() ?? null,
        windowEnd: stop.windowEnd?.toISOString() ?? null,
        arrivedAt: stop.arrivedAt?.toISOString() ?? null,
        completedAt: stop.completedAt?.toISOString() ?? null,
        failedAt: stop.failedAt?.toISOString() ?? null,
        failureReason: stop.failureReason,
        failureNotes: stop.failureNotes,
      })),
      statusHistory: "statusHistory" in dispatch ? dispatch.statusHistory : undefined,
      routeContext: dispatch.routeStops.length > 0
        ? {
            routeId: dispatch.routeStops[0].route.id,
            routeNumber: dispatch.routeStops[0].route.routeNumber,
            routeStatus: dispatch.routeStops[0].route.status,
            stopSequence: dispatch.routeStops[0].sequence,
          }
        : null,
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
    };
  }
}

class ConflictRejected extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

const DRIVER_INCLUDE = {
  order: { include: { customer: true } },
  vehicle: true,
  stops: { orderBy: { stopIndex: "asc" as const } },
  routeStops: {
    orderBy: { sequence: "asc" as const },
    include: {
      route: { select: { id: true, routeNumber: true, status: true } },
    },
  },
} satisfies Prisma.DispatchInclude;

type DriverDispatch = Prisma.DispatchGetPayload<{ include: typeof DRIVER_INCLUDE }> & {
  statusHistory?: { id: string; status: string; note: string | null; createdAt: Date }[];
};
