import { Injectable } from "@nestjs/common";
import { DispatchStatus, OrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/// AssignmentQueries — the ONE place in the codebase that knows where a
/// driver's or vehicle's busy-ness is recorded (AR1, AR4).
///
/// Before this existed the same question was answered four different ways in
/// three files, two of them reading Order and one reading Dispatch, which is how
/// the same driver could be double-booked across the two systems: dispatch-create
/// scanned only dispatches and literally could not see an order already holding
/// the driver.
///
/// ## Dispatch is the sole execution source (Task 8.6)
///
/// A resource is busy if, and only if, an active DISPATCH holds it. Nothing else
/// is consulted.
///
/// It was not always so. Until Task 8.6 this also read the Order table, because
/// assignments physically lived on Order.driverId / Order.vehicleId and barely any
/// dispatches existed — reading Dispatch alone would have reported nearly every
/// driver as free. That transitional union is now gone:
///
///   - Task 8.5 made Order a PROJECTION of Dispatch (R3). Assigning an order
///     creates and activates a dispatch; the order's driverId/vehicleId are
///     derived, and no longer a fact anyone writes.
///   - The Phase 5 backfill gave every historical assigned order the dispatch it
///     should always have had, so no commitment exists that Dispatch cannot see.
///
/// Order.driverId / Order.vehicleId therefore remain ONLY for legacy read
/// compatibility (API responses, list filters). No business rule reads them, and
/// this file — the one place that ever asked "who is busy?" — no longer does.
/// That deletion being a single arm in a single function is the whole payoff of
/// AR1.

/// The statuses in which a dispatch reserves its driver and vehicle. This is the
/// same set the database exclusion constraints (Task 8.2) are predicated on — R1.
/// If one changes, both must: the constraint is the guarantee, this is the
/// friendly pre-check.
export const ACTIVE_DISPATCH_STATUSES: DispatchStatus[] = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
];

/// The scheduled trip window a resource is being held for.
export interface TimeWindow {
  pickupDate: Date;
  deliveryDate: Date;
}

/// Leaves a record out of its own conflict check. Assigning a driver to order X
/// must not conflict with order X, nor with the dispatch that executes it.
export interface ReservationExclusions {
  orderId?: string;
  dispatchId?: string;
}

export interface TripSummary {
  id: string;
  orderNumber: string;
  pickupCity: string;
  deliveryCity: string;
  pickupDate: Date;
  deliveryDate: Date;
  status: OrderStatus;
}

/// One resource commitment: "<reference> is holding this driver and this vehicle
/// for this trip".
export interface Reservation {
  /// Human reference for error messages — "DSP-000045".
  reference: string;
  driverId: string;
  vehicleId: string;
  /// The order the dispatch is executing.
  trip: TripSummary;
}

@Injectable()
export class AssignmentQueries {
  constructor(private readonly prisma: PrismaService) {}

  /// Every resource commitment that overlaps `window`, from both sources.
  ///
  /// Omit `window` to ask "who is committed at all, right now" — that is what the
  /// dispatch board wants, and it is why the board historically ignored dates.
  ///
  /// Overlap is the inclusive interval test (existing.pickup <= candidate.delivery
  /// AND existing.delivery >= candidate.pickup), deliberately conservative at the
  /// boundary: a trip ending exactly when another begins counts as a conflict. It
  /// matches the tsrange '[]' bounds of the database constraints exactly, so the
  /// pre-check and the guarantee cannot disagree about an endpoint.
  async reservationsIn(
    organizationId: string,
    window?: TimeWindow,
    exclude: ReservationExclusions = {},
  ): Promise<Reservation[]> {
    const dispatches = await this.prisma.dispatch.findMany({
      where: {
        organizationId,
        status: { in: ACTIVE_DISPATCH_STATUSES },
        ...(exclude.dispatchId ? { id: { not: exclude.dispatchId } } : {}),
        // A dispatch executing the excluded order is that order's own commitment
        // — not a competing one.
        ...(exclude.orderId ? { orderId: { not: exclude.orderId } } : {}),
        ...(window
          ? {
              pickupDateScheduled: { lte: window.deliveryDate },
              deliveryDateScheduled: { gte: window.pickupDate },
            }
          : {}),
      },
      select: {
        dispatchNumber: true,
        driverId: true,
        vehicleId: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            pickupCity: true,
            deliveryCity: true,
            pickupDate: true,
            deliveryDate: true,
            status: true,
          },
        },
      },
    });

    return dispatches.map<Reservation>((dispatch) => ({
      reference: dispatch.dispatchNumber,
      driverId: dispatch.driverId,
      vehicleId: dispatch.vehicleId,
      trip: dispatch.order,
    }));
  }

  /// The commitment holding `resourceId`, or undefined if it is free.
  static reservationFor(
    reservations: Reservation[],
    field: "driverId" | "vehicleId",
    resourceId: string,
  ): Reservation | undefined {
    return reservations.find((r) => r[field] === resourceId);
  }

  /// Which resources are unavailable, for the callers that only need a yes/no.
  static busyResourceIds(reservations: Reservation[]): {
    driverIds: Set<string>;
    vehicleIds: Set<string>;
  } {
    const driverIds = new Set<string>();
    const vehicleIds = new Set<string>();
    for (const reservation of reservations) {
      if (reservation.driverId) driverIds.add(reservation.driverId);
      if (reservation.vehicleId) vehicleIds.add(reservation.vehicleId);
    }
    return { driverIds, vehicleIds };
  }
}
