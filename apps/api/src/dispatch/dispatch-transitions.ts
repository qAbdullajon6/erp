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
/// THE forward chain. One line, one place (TD-011).
///
/// Everything else about R13 is derived from it: which moves are legal, how far
/// along a dispatch is, and how many steps an order-level request implies. Those
/// three used to be written out separately — ALLOWED_TRANSITIONS here,
/// DISPATCH_SEQUENCE and DISPATCH_PROGRESS in projection.policy.ts — and adding a
/// state to the chain would have needed all three edited, with the compiler saying
/// nothing if you missed one.
export const DISPATCH_SEQUENCE: DispatchStatus[] = [
  "DRAFT",
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
  "DELIVERED",
];

/// The states a dispatch may be cancelled OUT OF through the status endpoint.
///
/// DRAFT is deliberately absent, and this is not an oversight: it reproduces the
/// behaviour that has always shipped. Note POST /dispatches/:id/cancel is more
/// permissive — it cancels from any non-terminal state, DRAFT included — so a draft
/// can be cancelled through that endpoint but is not offered as a status
/// transition. See the note in TECHNICAL_DEBT.md; the asymmetry is recorded, not
/// quietly resolved.
const CANCELLABLE_VIA_STATUS: DispatchStatus[] = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
];

/// Derived from the chain above: each state may step to the next one, and the
/// non-terminal ones may also be cancelled.
export const ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = buildTransitions();

function buildTransitions(): Record<DispatchStatus, DispatchStatus[]> {
  const table = {} as Record<DispatchStatus, DispatchStatus[]>;

  for (const [index, status] of DISPATCH_SEQUENCE.entries()) {
    const next = DISPATCH_SEQUENCE[index + 1];
    table[status] = [
      ...(next ? [next] : []),
      ...(CANCELLABLE_VIA_STATUS.includes(status) ? (["CANCELLED"] as DispatchStatus[]) : []),
    ];
  }
  // Terminal: nothing leaves it, and it is not on the forward chain.
  table.CANCELLED = [];

  return table;
}

/// How far along a dispatch is, derived from the same chain. CANCELLED ranks below
/// everything: a live dispatch always governs its order over a dead one (R2).
export const DISPATCH_PROGRESS: Record<DispatchStatus, number> = {
  ...(Object.fromEntries(
    DISPATCH_SEQUENCE.map((status, index) => [status, index + 1]),
  ) as Record<DispatchStatus, number>),
  CANCELLED: 0,
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
