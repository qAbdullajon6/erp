import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class DriverDispatchService {
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
          : { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] },
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
          : dto.status === "AT_PICKUP"
            ? "LOADING"
            : dto.status === "DELIVERED"
              ? "AVAILABLE"
              : undefined;
      if (ops) {
        await tx.driver.update({ where: { id: driverId }, data: { operationalStatus: ops } });
      }

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
      arrivalLat: dispatch.arrivalLat?.toString() ?? null,
      arrivalLng: dispatch.arrivalLng?.toString() ?? null,
      order: {
        id: dispatch.order.id,
        orderNumber: dispatch.order.orderNumber,
        pickupAddress: dispatch.order.pickupAddress,
        pickupCity: dispatch.order.pickupCity,
        deliveryAddress: dispatch.order.deliveryAddress,
        deliveryCity: dispatch.order.deliveryCity,
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
      statusHistory: "statusHistory" in dispatch ? dispatch.statusHistory : undefined,
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
} satisfies Prisma.DispatchInclude;

type DriverDispatch = Prisma.DispatchGetPayload<{ include: typeof DRIVER_INCLUDE }> & {
  statusHistory?: { id: string; status: string; note: string | null; createdAt: Date }[];
};
