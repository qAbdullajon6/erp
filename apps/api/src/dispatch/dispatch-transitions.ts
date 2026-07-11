import { DispatchStatus } from "@prisma/client";

/// R13 — the dispatch's forward-only progression, and the ONLY definition of it.
///
/// DRAFT -> ASSIGNED -> EN_ROUTE_TO_PICKUP -> AT_PICKUP -> IN_TRANSIT -> DELIVERED,
/// with CANCELLED reachable from any non-terminal state.
///
/// Extracted from DispatchesService in Task 8.12, when a SECOND service — the
/// driver's — needed the same answer. It is not copied: both ask this table, and
/// both serve it to their clients as `allowedTransitions` so no UI has to guess
/// (Task 8.10, TD-006).
export const ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  DRAFT: ["ASSIGNED"],
  ASSIGNED: ["EN_ROUTE_TO_PICKUP", "CANCELLED"],
  EN_ROUTE_TO_PICKUP: ["AT_PICKUP", "CANCELLED"],
  AT_PICKUP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/// What a DRIVER may do to a dispatch, and nothing else.
///
/// They execute the trip: they set off, they arrive, they load, they deliver. They
/// do NOT activate a dispatch (that is the dispatcher committing a driver to a job)
/// and they do NOT cancel one (that is an operational decision above their pay
/// grade). This is the driver-safe set, and it is enforced server-side — the phone
/// is never trusted to restrict itself.
export const DRIVER_DISPATCH_STATUSES: DispatchStatus[] = [
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
  "DELIVERED",
];

/// The legal moves from `from`, optionally narrowed to a subset.
///
/// The narrowing happens HERE, from the one table, rather than being re-derived by
/// whoever is asking — which is how the driver app ends up carrying a copy of two
/// backend rules at once, as it did before Task 8.12.
export function allowedDispatchTransitions(
  from: DispatchStatus,
  restrictTo?: DispatchStatus[],
): DispatchStatus[] {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  return restrictTo ? allowed.filter((status) => restrictTo.includes(status)) : allowed;
}
