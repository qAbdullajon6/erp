import { ConflictException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";

/// TransitionPolicy — ADR-001 Phase 4, Amendment B (Z3).
///
/// Implements: R4 (the commercial lifecycle of an Order is not derived from
/// Dispatch). Satisfies: AR3 (pure policy), AR5 (with ProjectionPolicy, the only
/// definition of an Order write).
///
/// This is NOT ProjectionPolicy and must never be confused with it. It owns the
/// two transitions a human makes about the COMMERCE of an order, which no dispatch
/// can imply and no dispatch may cause:
///
///   DRAFT -> PENDING    the order is approved and enters the pool
///   * -> CANCELLED      the order is killed
///
/// No operational status is EVER written through this policy. If you find
/// yourself wanting to pass ASSIGNED or DELIVERED to it, the answer is that the
/// dispatch should move and the projection should follow (R3).
///
/// Pure: no query, no Prisma, no clock, no mutation. The caller supplies `now`.

/// Terminal: nothing leaves these.
const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED"];

/// The commercial moves, and only the commercial moves.
const COMMERCIAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["CANCELLED"],
  ASSIGNED: ["CANCELLED"],
  PICKED_UP: ["CANCELLED"],
  IN_TRANSIT: ["CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/// What PATCH /orders/:id/status accepts — forward-only, one step at a time.
///
/// This is the ORDER-level graph, and it is unchanged from what OrdersService
/// enforced before Task 8.5, deliberately: it is the API contract. CANCELLED is
/// absent because cancellation has its own endpoint (POST /orders/:id/cancel),
/// and it was absent before too.
///
/// Only the DRAFT -> PENDING row is executed by this policy. Every other row is
/// OPERATIONAL: the caller must move the dispatch and let ProjectionPolicy write
/// the order (R3). This map exists so the API can reject an illegal request with
/// the message it has always used, BEFORE any dispatch is touched.
const ORDER_STATUS_ENDPOINT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["ASSIGNED"],
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/// Throws unless the order-level status endpoint permits this move (R4/R13).
/// Lives here, not in OrdersService, because it is a business rule and rules live
/// in policies (AR3).
export function assertOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_STATUS_ENDPOINT_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`Cannot transition an order from ${from} to ${to}`);
  }
}

/// The same table, SERVED to the client as `allowedTransitions` on every order
/// (TD-006) — exactly as dispatches have done since Task 8.10.
///
/// The UI must not decide which status buttons are legal. It used to: orders-detail
/// carried a hand-copied duplicate of the map above, and the driver screen carried
/// a second one. Both are now deleted, and they cannot come back, because the answer
/// arrives with the data.
///
/// Optionally narrowed to a subset — the driver app may only move an order to a few
/// of these, and the intersection is computed HERE, from the one table, rather than
/// re-derived on a phone.
export function allowedOrderTransitions(
  from: OrderStatus,
  restrictTo?: OrderStatus[],
): OrderStatus[] {
  const allowed = ORDER_STATUS_ENDPOINT_TRANSITIONS[from] ?? [];
  return restrictTo ? allowed.filter((status) => restrictTo.includes(status)) : allowed;
}

/// The statuses ProjectionPolicy owns. Exported so callers can route a status
/// request to the right policy instead of guessing (AR5).
const OPERATIONAL_STATUSES: OrderStatus[] = [
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
];

export function isOperationalStatus(status: OrderStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status);
}

export function isCommercialStatus(status: OrderStatus): boolean {
  return !isOperationalStatus(status);
}

/// The write a commercial transition implies. Returns the exact column values;
/// persisting them is OrderWriter's job.
export interface CommercialTransition {
  status: OrderStatus;
  cancelledAt: Date | null;
  /// Order.driverId / Order.vehicleId are PROJECTION fields, not assignments the
  /// order owns. A cancelled order executes nothing, so it projects nobody: both
  /// are cleared.
  ///
  /// This is the projection contract, not a business rule — it makes the two ways
  /// of ending a job agree. Cancelling the DISPATCH already released the resources
  /// (R8); cancelling the ORDER used to leave a dead order pointing at a driver and
  /// a truck forever, which is how the legacy CANCELLED-but-still-assigned rows in
  /// production came to exist. It applies GOING FORWARD only — historical rows are
  /// deliberately left as they are.
  driverId: null | undefined;
  vehicleId: null | undefined;
}

/// Throws unless `to` is a legal commercial move from `from` (R4).
///
/// The messages deliberately match what OrdersService already returned, so the
/// API contract does not shift under a caller who is only reading error strings.
export function planCommercialTransition(
  from: OrderStatus,
  to: OrderStatus,
  now: Date,
): CommercialTransition {
  if (isOperationalStatus(to)) {
    // A caller asking this policy for an operational status has gone to the wrong
    // policy — it must move the dispatch and let the projection follow. This is a
    // programming error, not a user error, but a 409 keeps it out of a 500.
    throw new ConflictException(
      `${to} is an operational status and is derived from the dispatch, not set directly`,
    );
  }

  const allowed = COMMERCIAL_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    if (TERMINAL.includes(from) && to === "CANCELLED") {
      throw new ConflictException(`Cannot cancel an order with status ${from}`);
    }
    throw new ConflictException(`Cannot transition an order from ${from} to ${to}`);
  }

  const cancelling = to === "CANCELLED";
  return {
    status: to,
    cancelledAt: cancelling ? now : null,
    // `undefined` leaves the column alone (approval must not wipe an assignment);
    // `null` clears it.
    driverId: cancelling ? null : undefined,
    vehicleId: cancelling ? null : undefined,
  };
}
