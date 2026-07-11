import { DispatchStatus, OrderStatus } from "@prisma/client";

/// ProjectionPolicy — ADR-001 Phase 4, Amendment B.
///
/// Implements: R3 (Order is a projection of Dispatch), R6 (operational state is
/// derived, never hand-maintained), R7 (delivery completes the Order), R8 (a
/// cancelled dispatch releases the Order back to the pool).
/// Satisfies: AR3 (pure policy), AR5 (with TransitionPolicy, the only definition
/// of an Order write).
///
/// This file is PURE. It performs no query, imports no Prisma client, touches no
/// clock and mutates nothing. Given an order and the dispatches that execute it,
/// it computes what the order MUST look like. Persisting that is somebody else's
/// job (OrderWriter), which is what makes the projection testable as a plain
/// function and impossible to get subtly wrong through a stray `await`.
///
/// ## The commercial / operational split (Amendment B, Z2 + Z3)
///
/// Order has two lifecycles layered on one column:
///   - COMMERCIAL: DRAFT (not yet approved) and CANCELLED (killed). Owned solely
///     by TransitionPolicy.
///   - OPERATIONAL: PENDING -> ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED.
///     Owned solely by this policy, derived from Dispatch.
///
/// The commercial lifecycle ALWAYS wins. A DRAFT order is not promoted by a
/// dispatch existing (that would be approval-by-side-effect), and a CANCELLED
/// order is never resurrected by its dispatch being cancelled (that would undo a
/// commercial decision). Both are hard-guarded below.

/// A dispatch, reduced to only what the projection is allowed to see.
export interface DispatchSnapshot {
  status: DispatchStatus;
  driverId: string;
  vehicleId: string;
  /// Captured by DispatchesService when it moves to DELIVERED; becomes
  /// Order.deliveredAt (R7).
  deliveryDateActual: Date | null;
}

/// The order, reduced likewise.
export interface OrderSnapshot {
  status: OrderStatus;
  driverId: string | null;
  vehicleId: string | null;
  deliveredAt: Date | null;
}

/// What the order must become. `changed` is false when the order already agrees
/// with its dispatches, so the caller can skip the write entirely.
export interface OrderProjection {
  changed: boolean;
  status: OrderStatus;
  driverId: string | null;
  vehicleId: string | null;
  deliveredAt: Date | null;
  /// The OrderStatusHistory rows to append, oldest first. Empty when the status
  /// did not move. See historyPath() for why this can hold more than one row.
  historyToAppend: OrderStatus[];
}

/// Orders the projection may never move OUT of. It may still move an order INTO
/// DELIVERED — that is the projection's job (R7) — but once there, the order is
/// done and nothing derived from a dispatch may take it back.
///
///   DRAFT      not yet approved. Only TransitionPolicy approves it (Z3).
///   CANCELLED  commercial terminal. Only TransitionPolicy kills an order, and a
///              cancelled dispatch must never resurrect it (Z2).
///   DELIVERED  operational terminal (R7). The job is finished and paid for.
///
/// DELIVERED earns its place here the hard way. Without it, an order whose
/// dispatches all end up CANCELLED projects to "every dispatch cancelled ->
/// release to PENDING" (R8) — which would demote a completed, invoiced delivery
/// back into the unassigned pool and wipe its deliveredAt. The API cannot reach
/// that state (a DELIVERED dispatch is terminal, so it cannot be cancelled), but
/// the TD-005 repair produces it directly, and a rule that only holds while nobody
/// touches the data is not a rule.
const FROZEN_STATUSES: OrderStatus[] = ["DRAFT", "CANCELLED", "DELIVERED"];

/// The order's operational chain, in order. Used to expand a multi-step jump into
/// the individual history rows it implies.
const OPERATIONAL_SEQUENCE: OrderStatus[] = [
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
];

/// How far along a dispatch is. The governing dispatch of an order is the one
/// that has progressed furthest — see aggregate() for why.
const DISPATCH_PROGRESS: Record<DispatchStatus, number> = {
  CANCELLED: 0,
  DRAFT: 1,
  ASSIGNED: 2,
  EN_ROUTE_TO_PICKUP: 3,
  AT_PICKUP: 4,
  IN_TRANSIT: 5,
  DELIVERED: 6,
};

/// THE projection table (ADR-001 Amendment B, Z1).
///
/// EN_ROUTE_TO_PICKUP collapses onto ASSIGNED because the order has no notion of
/// "the truck is on its way to you" — from the customer's point of view nothing
/// has happened yet. AT_PICKUP maps to PICKED_UP, which is what preserves the
/// existing driver flow ("Mark as Picked Up") and the E2E golden path; before
/// Amendment B the table had no dispatch state that produced PICKED_UP at all.
const PROJECTION: Record<DispatchStatus, OrderStatus | null> = {
  // A draft dispatch is a plan, not a commitment (R1): it reserves nothing and
  // it projects nothing. Notably it does NOT promote a DRAFT order to PENDING —
  // that is a commercial approval and belongs to TransitionPolicy alone (Z3).
  DRAFT: null,
  ASSIGNED: "ASSIGNED",
  EN_ROUTE_TO_PICKUP: "ASSIGNED",
  AT_PICKUP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  // Handled by aggregate(), not here: one cancelled dispatch among several says
  // nothing, but ALL of them cancelled means the order is back in the pool (R8).
  CANCELLED: null,
};

/// The dispatch's own forward chain (R13), needed to work out how many steps a
/// single order-level request implies.
const DISPATCH_SEQUENCE: DispatchStatus[] = [
  "DRAFT",
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
  "DELIVERED",
];

/// The INVERSE of the projection table: the dispatch state that produces a given
/// operational order state.
///
/// This is what makes an order-level status request executable under ADR-001. The
/// caller does not write the order; it moves the dispatch to the state whose
/// projection IS the order state asked for, and the projection then writes the
/// order (R3). Note ASSIGNED maps back to ASSIGNED and not to EN_ROUTE_TO_PICKUP:
/// two dispatch states project onto ASSIGNED, and the earliest is the one an
/// order-level "make it ASSIGNED" means.
const INVERSE_PROJECTION: Record<string, DispatchStatus> = {
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "AT_PICKUP",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
};

export function dispatchStateFor(orderStatus: OrderStatus): DispatchStatus | null {
  return INVERSE_PROJECTION[orderStatus] ?? null;
}

/// The dispatch steps needed to get from `from` to `to`, in order.
///
/// One order-level step can be several dispatch steps: an order going
/// ASSIGNED -> PICKED_UP means the dispatch must walk ASSIGNED ->
/// EN_ROUTE_TO_PICKUP -> AT_PICKUP, because R13 forbids skipping. Each step is a
/// real dispatch transition with its own history row; nothing is fabricated.
export function dispatchPath(from: DispatchStatus, to: DispatchStatus): DispatchStatus[] {
  const start = DISPATCH_SEQUENCE.indexOf(from);
  const end = DISPATCH_SEQUENCE.indexOf(to);
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }
  return DISPATCH_SEQUENCE.slice(start + 1, end + 1);
}

/// Selects the dispatch that governs the order (R2).
///
/// Today an order has at most one live dispatch, so this is a formality. It is
/// written for N because reassignment (Task 8.7) closes one dispatch and opens
/// another, at which point an order legitimately has a cancelled dispatch and a
/// live one, and "which one is the order" stops being obvious. The rule: the
/// furthest-progressed dispatch wins, so a live dispatch always beats a cancelled
/// one and a DELIVERED one always beats everything.
/// Generic in the dispatch shape so callers that hold full Dispatch rows (and
/// need the id back, to drive it) can use the same aggregation as the projection,
/// rather than writing a second one (AR1).
export function aggregate<T extends { status: DispatchStatus }>(dispatches: T[]): T | null {
  if (dispatches.length === 0) return null;
  return dispatches.reduce((furthest, candidate) =>
    DISPATCH_PROGRESS[candidate.status] > DISPATCH_PROGRESS[furthest.status] ? candidate : furthest,
  );
}

/// The heart of ADR-001: what this order must be, given its dispatches.
export function projectOrderStatus(
  order: OrderSnapshot,
  dispatches: DispatchSnapshot[],
): OrderProjection {
  const unchanged: OrderProjection = {
    changed: false,
    status: order.status,
    driverId: order.driverId,
    vehicleId: order.vehicleId,
    deliveredAt: order.deliveredAt,
    historyToAppend: [],
  };

  // Z2 + Z3 + R7. A killed order stays killed, an unapproved order stays
  // unapproved, and a delivered order stays delivered — no matter what its
  // dispatches are doing afterwards.
  if (FROZEN_STATUSES.includes(order.status)) {
    return unchanged;
  }

  const governing = aggregate(dispatches);

  // "No dispatch -> the order keeps its own state." Nothing is derivable, so the
  // projection asserts nothing. This is also what makes the policy safe to run
  // over legacy orders the backfill has not reached.
  if (!governing) {
    return unchanged;
  }

  // Every dispatch is cancelled: the resources are released and the order falls
  // back into the unassigned pool (R8). Guarded by the commercial check above, so
  // this can never resurrect a CANCELLED order.
  const allCancelled = dispatches.every((d) => d.status === "CANCELLED");
  if (allCancelled) {
    return settle(order, {
      status: "PENDING",
      driverId: null,
      vehicleId: null,
      deliveredAt: null,
    });
  }

  const target = PROJECTION[governing.status];

  // The only live dispatch is a DRAFT: it commits nothing, so the order keeps
  // whatever operational state it already had.
  if (target === null) {
    return unchanged;
  }

  return settle(order, {
    status: target,
    driverId: governing.driverId,
    vehicleId: governing.vehicleId,
    // R7 — delivery time comes from the dispatch that actually delivered.
    deliveredAt: target === "DELIVERED" ? governing.deliveryDateActual : null,
  });
}

/// Assembles the result, working out which history rows the move implies and
/// whether anything moved at all.
function settle(
  order: OrderSnapshot,
  next: Omit<OrderProjection, "changed" | "historyToAppend">,
): OrderProjection {
  const changed =
    next.status !== order.status ||
    next.driverId !== order.driverId ||
    next.vehicleId !== order.vehicleId ||
    !sameInstant(next.deliveredAt, order.deliveredAt);

  return {
    ...next,
    changed,
    historyToAppend: historyPath(order.status, next.status),
  };
}

/// The history rows a move implies, oldest first.
///
/// A single dispatch step can imply more than one order step. A dispatch moving
/// AT_PICKUP -> IN_TRANSIT while the order is still ASSIGNED (because the
/// AT_PICKUP projection was never persisted — a backfilled or repaired order)
/// would otherwise record IN_TRANSIT with no PICKED_UP before it, leaving a
/// history that skips a state the order is documented to pass through. So a
/// forward jump is expanded into every step it crosses.
///
/// A backward move (the release in R8: ASSIGNED -> PENDING) is a single row: the
/// order did not "pass through" anything, it was reset.
function historyPath(from: OrderStatus, to: OrderStatus): OrderStatus[] {
  if (from === to) return [];

  const start = OPERATIONAL_SEQUENCE.indexOf(from);
  const end = OPERATIONAL_SEQUENCE.indexOf(to);

  if (start === -1 || end === -1 || end < start) {
    return [to];
  }
  return OPERATIONAL_SEQUENCE.slice(start + 1, end + 1);
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}
