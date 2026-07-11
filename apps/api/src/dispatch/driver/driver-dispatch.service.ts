import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { OrderWriter } from "../../order-state/order-writer";
import { PrismaService } from "../../prisma/prisma.service";
import { DispatchesService } from "../dispatches.service";
import { allowedDispatchTransitions, DRIVER_DISPATCH_STATUSES } from "../dispatch-transitions";
import { UpdateDispatchStatusDto } from "../dto/update-dispatch-status.dto";

/// The driver's view of the work (Task 8.12).
///
/// A driver EXECUTES a dispatch. That is the whole of what this service is: it finds
/// the dispatches assigned to the caller, and it lets them move one forward.
///
/// ## Why this is a separate service, and why it reads Dispatch
///
/// Until Task 8.12 the driver app talked to /orders/my/*, and that list was found by
/// `Order.driverId`. But since Task 8.6, Order.driverId is a PROJECTION — a copy of
/// what the dispatch says, kept only for legacy reads. The driver was therefore
/// looking at their own work through a photocopy. This reads the original.
///
/// It also means the driver can now record EN_ROUTE_TO_PICKUP. Before, they could
/// only say PICKED_UP, and the order path silently walked the dispatch through
/// EN_ROUTE_TO_PICKUP on their behalf — stamping a state they were in an hour ago
/// with the timestamp of the moment they arrived. Every stage is now recorded when
/// it actually happens.
///
/// ## What it does NOT do
///
/// It contains no business rule. Transition legality is R13's table, the write is
/// DispatchesService's transactional primitive, and the Order is re-derived by
/// ProjectionPolicy through OrderWriter — exactly as it is for a dispatcher. The
/// only thing this service adds is WHO is allowed to ask, and WHICH transitions a
/// driver may use (DRIVER_DISPATCH_STATUSES). Both are enforced here, server-side;
/// the phone is never trusted to restrict itself.
@Injectable()
export class DriverDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatches: DispatchesService,
    private readonly orderWriter: OrderWriter,
    private readonly auditService: AuditService,
  ) {}

  /// Everything currently on this driver's plate.
  ///
  /// Terminal dispatches are excluded by default: a driver's list is a to-do list,
  /// not an archive. Pass `includeFinished` to see the lot.
  async listMine(organizationId: string, userId: string, includeFinished = false) {
    const driverId = await this.resolveOwnDriverId(organizationId, userId);

    const dispatches = await this.prisma.dispatch.findMany({
      where: {
        organizationId,
        // THE scoping. Not Order.driverId — the dispatch is the operational record
        // (ADR-001), and this is the thing that actually says who is driving.
        driverId,
        // A DRAFT is a dispatcher's sketch. It commits nobody (R1) and the driver
        // must not see it as work.
        status: includeFinished
          ? { not: "DRAFT" }
          : { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] },
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

  /// The driver moves the dispatch one step; the order follows (R3).
  async updateStatus(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateDispatchStatusDto,
    actor: CurrentUserPayload,
  ) {
    // Checked before anything is loaded, so a driver probing for a cancel button
    // gets a flat refusal rather than a hint about what exists.
    if (!DRIVER_DISPATCH_STATUSES.includes(dto.status)) {
      throw new ForbiddenException(
        `Drivers can only move a dispatch to ${DRIVER_DISPATCH_STATUSES.join(", ")}`,
      );
    }

    const dispatch = await this.findOwnOrThrow(organizationId, userId, id, false);

    const updated = await this.dispatches.inTransaction(async (tx) => {
      // The same primitive a dispatcher's status change uses. R13 is enforced inside
      // it, with the compare-and-set from Task 8.3 — there is no second code path
      // for drivers, and therefore no second set of rules to drift (AR1).
      await this.dispatches.transitionInTx(
        tx,
        organizationId,
        dispatch,
        dto.status,
        actor,
        dto.note,
      );
      // R3 — the order is a projection of the dispatch, and the two commit together
      // (AR2). Nothing here writes Order state directly; OrderWriter is still the
      // only thing that may (AR5).
      await this.orderWriter.project(tx, organizationId, dispatch.orderId, actor, dto.note);

      return tx.dispatch.findUniqueOrThrow({ where: { id }, include: DRIVER_INCLUDE });
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "dispatch.driver_status_change",
      entityType: "Dispatch",
      entityId: id,
      metadata: { from: dispatch.status, to: dto.status, note: dto.note },
    });

    return this.toDriverResponse(updated);
  }

  /// A dispatch belonging to somebody else is NOT FOUND, not forbidden. A 403 would
  /// confirm that the id exists, which is a small leak a driver has no business
  /// receiving (R14, and the same rule every tenant-scoped lookup in this codebase
  /// follows).
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

  /// The caller's own Driver row, resolved from their user id — never accepted from
  /// the client. A driver cannot ask for somebody else's work by changing a
  /// parameter, because there is no parameter to change.
  private async resolveOwnDriverId(organizationId: string, userId: string): Promise<string> {
    const driver = await this.prisma.driver.findFirst({ where: { organizationId, userId } });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account yet");
    }
    return driver.id;
  }

  /// The dispatch, as a driver needs to see it: the job, where it goes, who it is
  /// for, and what they may do next.
  private toDriverResponse(dispatch: DriverDispatch) {
    return {
      id: dispatch.id,
      dispatchNumber: dispatch.dispatchNumber,
      status: dispatch.status,
      /// Already narrowed to what a DRIVER may do from here — computed from the one
      /// R13 table (TD-006). The phone does not intersect two rule sets; it reads
      /// this and renders a button per entry.
      allowedTransitions: allowedDispatchTransitions(dispatch.status, DRIVER_DISPATCH_STATUSES),
      pickupDateScheduled: dispatch.pickupDateScheduled,
      pickupDateActual: dispatch.pickupDateActual,
      deliveryDateScheduled: dispatch.deliveryDateScheduled,
      deliveryDateActual: dispatch.deliveryDateActual,
      notes: dispatch.notes,
      /// The commercial job the dispatch executes — nested, because for a driver it
      /// is context, not the thing they are working on.
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

const DRIVER_INCLUDE = {
  order: { include: { customer: true } },
  vehicle: true,
} satisfies Prisma.DispatchInclude;

type DriverDispatch = Prisma.DispatchGetPayload<{ include: typeof DRIVER_INCLUDE }> & {
  statusHistory?: { id: string; status: string; note: string | null; createdAt: Date }[];
};
