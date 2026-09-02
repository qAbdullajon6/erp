---
name: dispatch-board
description: Owns the Kanban dispatch board (components/dispatch/*) and its backend counterpart under ADR-001 — Dispatch is the single operational source of truth, Order is a projection of it. Use for any dispatch-board, dispatch-detail, reassignment, or dispatch-status-transition work.
---

# Dispatch Board

## Purpose

Owns `components/dispatch/*` (`dispatch-board.tsx`, `dispatch-card.tsx`,
`board-columns.ts`, `dispatches-list.tsx`, `dispatches-detail.tsx`,
`dispatches-create-form.tsx`, `dispatch-reassign-dialog.tsx`) and the backend's
ADR-001 dispatch architecture (`apps/api/src/order-state/*`,
`apps/api/src/dispatch/*`). The board is the most rule-sensitive screen in the
app — read this whole skill before touching it.

## When to Use

- Any change to the Kanban board, a dispatch card, or the drag-and-drop
  interaction.
- Adding/changing a dispatch status, transition, or the reassignment flow.
- Anything referencing `allowedTransitions`, `ADR-001`, or the order/dispatch
  projection relationship.

## Responsibilities

- **The board is a presentation layer and nothing else** (see the header comment
  in `dispatch-board.tsx`, Task 8.10). Every rule it appears to enforce is one
  the server already decided:
  - which column a card is in → `dispatch.status` (read, not derived).
  - where a card may be dragged → `dispatch.allowedTransitions` (R13, server-served).
  - who may take a reassignment → `GET /dispatch/availability` (AR4).
- `board-columns.ts` contains **no business rule** — `groupByStatus` only reads
  `dispatch.status`; `canDropInto` only checks `dispatch.allowedTransitions`;
  neither encodes a transition graph. If a change requires teaching this file
  what's "allowed," that rule already exists once, in the API — stop and fix it
  there instead.
- Drag-and-drop is **optimistic visually only**: the drag overlay follows the
  cursor, but the card does not actually move columns until the server confirms.
  If the API refuses, nothing needs rolling back because nothing moved. Don't
  add client-side optimistic state mutation on top of this.
- **ADR-001** (backend, `apps/api/src/order-state/*`): Dispatch is the single
  operational source of truth; Order status is a *projection* of Dispatch state
  (`projection.policy.ts`), never an independent write. `transition.policy.ts`
  owns the state graph. An order-level status change moves the dispatch, and the
  order is projected from it — the two must never be able to drift (see
  `TECHNICAL_DEBT.md`'s TD-005 for what drift looked like before this was fixed,
  and TD-004/TD-011 for how the transition chain was collapsed from three
  encodings to one derived source).

## Workflow

1. Before changing anything board-related, check whether the change belongs in
   the transition policy (backend, the actual rule) or the board (presentation
   of whatever the server said) — 90% of "the board should allow X" requests are
   really "the server should allow X," and the fix is `transition.policy.ts`.
2. For a new column/status: add it to `BOARD_COLUMNS` (title + terminal flag)
   only after the backend's `ALLOWED_TRANSITIONS`/`DISPATCH_SEQUENCE` already
   knows about it — the board must never get ahead of the server's state graph.
3. For reassignment: route through the existing `DispatchReassignDialog` +
   `GET /dispatch/availability` pattern — never compute driver/vehicle
   availability client-side.
4. For cancellation: cancellation has its own endpoint
   (`POST /dispatches/:id/cancel`), routed separately from the status-transition
   endpoint, but "is it allowed" is still the server's answer via
   `allowedTransitions`/`isCancelDrop`.
5. Keep the screen-reader announcement (`announcement` state, on drag settle) —
   this is an accessibility requirement, not incidental.
6. After any transition-graph change, run `board-columns.test.ts` and the
   dispatch e2e/RC suites — they pin the derived tables against the graph and
   will go red if a state was silently reordered or removed.

## Rules

- Never add a `canMoveTo()`-style function to the frontend — that rule lives
  once, in the API's transition policy.
- Never let a drag visually "stick" in the new column before the server
  confirms — optimism is cursor-only.
- Never write Order status directly from the frontend or from any service other
  than through the dispatch/projection path — Order is always a projection.
- Never fabricate `DispatchAssignment` history for legacy data (see TD-004) —
  a missing audit trail is an accepted gap, not something to backfill with
  guessed rows.

## Best Practices

- When board behavior seems wrong, check `allowedTransitions` on the actual
  dispatch object first — the bug is almost always server-side or a stale
  cache, not the drag logic.
- Keep `BOARD_PAGE_SIZE` (currently 200, unpaginated fetch) in mind — a board
  is not a paginated list; don't reintroduce pagination controls here.
- Use `useInvalidateOperationalState` after any mutation that affects board
  state, so the board and any other operational views stay in sync.

## Never Do

- Never duplicate `ALLOWED_TRANSITIONS`/`DISPATCH_SEQUENCE` in a second place —
  TD-011 already paid off exactly this problem once; don't reintroduce it.
- Never treat a DRAFT dispatch's disabled Cancel button as a bug to silently
  "fix" by loosening client logic — see TD-012; this is a deliberate, recorded
  decision awaiting its own scoped fix.
- Never skip `board-columns.test.ts` after touching column/transition logic.

## Checklist

- [ ] Change confirmed as presentation-only, or correctly routed to the backend
      transition policy if it's actually a rule change.
- [ ] No client-side transition/availability logic introduced.
- [ ] `board-columns.test.ts` and dispatch e2e/RC suites pass.
- [ ] Screen-reader announcement still fires on drag settle.
- [ ] Order/Dispatch projection invariant (ADR-001) untouched unless the task
      is explicitly a backend rule change.

## Expected Output

Board changes that add zero new client-side business rules, backend rule
changes made once in `transition.policy.ts`/`projection.policy.ts`, and passing
`board-columns.test.ts` plus dispatch e2e coverage.
