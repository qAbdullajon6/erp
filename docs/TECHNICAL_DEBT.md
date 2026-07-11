# Technical debt

Known, accepted, scheduled. An entry here is a debt someone has already decided
to take on with a named payoff point — not a wishlist and not a bug tracker.

---

## TD-012 — A DRAFT dispatch cannot be cancelled from the UI, though the API allows it

**Status:** OPEN, low severity. Behaviour, not a defect — recorded rather than
quietly changed.
**Found:** Task 8.13, while unifying the transition chain (TD-011).

`ALLOWED_TRANSITIONS.DRAFT` is `["ASSIGNED"]` — no `CANCELLED`. So a DRAFT dispatch
serves `allowedTransitions: ["ASSIGNED"]`, and the board and the detail screen both
derive "can I cancel this?" from that field. A draft therefore shows a disabled
Cancel action.

But `POST /dispatches/:id/cancel` is more permissive: it cancels from any
non-terminal state, DRAFT included. So the capability exists and is simply not
reachable from the UI.

A dispatcher who sketches a draft and changes their mind has no way to get rid of it
from the board. It is not harmful — a DRAFT reserves nothing (R1) — but it is untidy.

**The fix is one line** (add `DRAFT` to `CANCELLABLE_VIA_STATUS` in
`dispatch-transitions.ts`), and it is deliberately NOT taken here: it changes what
the API offers, and Task 8.13 is a test-alignment task. It wants its own decision.

---

## ~~TD-005 — Three legacy dispatches drifted away from their orders~~ — PAID in Task 8.6A

**Resolved:** 2026-07-11, repair run `3ef8d086` (`npm run repair:dispatches -- --apply`)

`DSP-000001` ASSIGNED → DELIVERED (taking its `deliveryDateActual` from the order's
`deliveredAt`, not from today's clock). `DSP-000018` / `DSP-000019` DRAFT →
CANCELLED — a draft that was never executed is a dead plan, not a completed trip.
One honest history row each, labelled as a repair; no intermediate journey was
fabricated. No Order row was touched. Backfill reconciliation now reports OK, and
no dispatch reserves a resource for a finished order.

The repair also exposed a latent hole in ProjectionPolicy, now closed — see below.

<details>
<summary>Original entry</summary>

**Violates:** R3 (Order is a projection of Dispatch)

### What is wrong

Three orders were driven to DELIVERED through the ORDER API while their dispatch
was left where it was. Nothing synchronised the two — this is precisely the
split-brain ADR-001 was written to kill, captured in data:

| Order | Order | Dispatch | Effect |
|---|---|---|---|
| `ORD-2026-0003` (seed/demo) | DELIVERED 2026-07-09 | `DSP-000001` **ASSIGNED** | **Phantom reservation** |
| `ORD-2026-0022` (RC e2e) | DELIVERED | `DSP-000018` DRAFT | Harmless (a DRAFT reserves nothing) |
| `ORD-2026-0023` (RC e2e) | DELIVERED | `DSP-000019` DRAFT | Harmless |

`DSP-000001` is in a RESERVING state (R1) for an order that was delivered days ago,
so it holds driver `EMP-0001` and vehicle `VEH-0019` **forever**. Since Task 8.6
made Dispatch the sole execution source, that is now the only thing availability
consults — the driver is permanently, inexplicably busy.

### Why the code does not need fixing

This cannot happen again. Since Task 8.5 an order-level status change *moves the
dispatch* and the order is projected from it, so the two cannot drift. These rows
predate that: `DSP-000001` came from the demo seed, the other two from an old
Playwright run.

### Repair options (not yet chosen)

1. **Reconcile to the order's truth** — move `DSP-000001` to DELIVERED and the two
   DRAFTs to CANCELLED. Restores agreement, releases the driver, keeps the history.
2. **Delete the three dispatches** — they are demo/test artefacts. Simplest, but
   loses `DSP-000001`, which the seed script recreates anyway.
3. **Re-seed the dev database.** 16 of 38 orders in it are already e2e artefacts.

Option 1 is the honest one for anything resembling production data. This is a DATA
repair; no code change is implied.

</details>

---

## TD-004 — Legacy dispatches have no DispatchAssignment history

**Status:** accepted, permanent for pre-existing data
**Incurred:** Task 8.5 (2026-07-11)
**Relates to:** R9

Since Task 8.7 every NEW dispatch opens an assignment row on creation, closes it on
reassignment and on cancellation, so the ledger is complete from here on.
Dispatches that predate 8.7 — the Phase 5 backfill's, and the demo seed's — have no
open row. `closeOpenAssignment` uses `updateMany` precisely so that reassigning one
of them closes zero rows and simply opens the first one, rather than failing.

The backfill creates the missing `Dispatch` rows but does NOT synthesise
`DispatchAssignment` history, because that history genuinely does not exist —
nobody ever recorded when a driver was put on a legacy job or taken off it.
Fabricating plausible rows would be inventing an audit trail.

So for orders that predate ADR-001, `dispatch_assignments` is empty and the
question "who was driving this on Tuesday?" has no recorded answer. New work
records it properly from Task 8.7 onward. This is a data-history gap, not a code
defect, and it will not be closed. (Scope decision, ADR-001 Amendment B.)

---

## Paid off

### ~~TD-008 — The RC suite drove endpoints that no longer exist~~ — PAID in Task 8.13

`rc-roles.spec.ts` RC5 called `/orders/my*`, which Task 8.12 removed. Three `P0`
failures sitting in the repo. It now drives `/dispatches/my*`, records
`EN_ROUTE_TO_PICKUP`, and asserts the order still follows its dispatch (R3, R7).

It also no longer hard-codes the status chain: it walks whatever the server offers
in `allowedTransitions`. A copy of R13 in a test file is a copy of R13, and it rots
the day the rule changes without anything going red.

### ~~TD-009 — The golden path created two dispatches for one order~~ — PAID in Task 8.13

`rc-golden-path.spec.ts` did `POST /dispatches` *and* `POST /orders/:id/assign`,
leaving a stray DRAFT alongside the real dispatch — a habit from the world where the
two were independent records. Assigning IS creating the dispatch (ADR-001). The test
now asserts exactly one dispatch exists.

### ~~TD-010 — R1's reserving set existed twice~~ — PAID in Task 8.13

`repair-drifted-dispatches.ts` declared its own `RESERVING` list, identical to
`ACTIVE_DISPATCH_STATUSES` on the day it was written and free to drift from it on
any day after. It imports the one definition now.

(The third encoding — the `WHERE status IN (...)` predicate on the database
exclusion constraints — is unavoidable: SQL cannot import TypeScript. It is
documented in the migration, and it is the *guarantee*, so it is the one that must
never be wrong.)

### ~~TD-011 — R13's chain was encoded three times~~ — PAID in Task 8.13

`ALLOWED_TRANSITIONS`, `DISPATCH_SEQUENCE` and `DISPATCH_PROGRESS` each wrote the
chain out separately. Adding a dispatch state meant editing three tables, and the
compiler would not have told you if you missed one.

There is now one `DISPATCH_SEQUENCE`, and the other two are derived from it.
`dispatch-transitions.spec.ts` pins the derived tables against the hand-written
values they replaced, so the derivation cannot silently change the rules — and a
mutation that reorders the chain turns them red.

### ~~TD-001 — OrdersService writes are not atomic (AR2)~~ — PAID in Task 8.5

`OrdersService.create`, `assign`, `updateStatus` and `cancel` now each run inside a
single transaction, and the Order, its status history and any dispatch movement
commit together or not at all. `OrderWriter` cannot be used outside a transaction —
every method takes the caller's transaction client.

### ~~TD-002 — OrdersService carries its own copy of the assignment rules (AR1)~~ — PAID in Task 8.5

`OrdersService.assertNoOverlap` and `OrdersService.assertCapacity` are deleted, and
`ACTIVE_ASSIGNMENT_STATUSES` and `ALLOWED_TRANSITIONS` are gone from the service.
`assign()` reaches the rules through `AssignmentPolicy` (via
`DispatchesService.createInTx`), and the order transition graph lives in
`TransitionPolicy`. `POST /orders/:id/assign` is no longer blind to a driver held
by a dispatch — it creates one.

Paid earlier than the Task 8.7 target, because Phase 4 made `assign()` a dispatch
operation, which deleted the duplicates as a side effect rather than as extra work.

### ~~TD-003 — AssignmentQueries still reads the Order table~~ — PAID in Task 8.6

The `prisma.order.findMany` arm of `AssignmentQueries.reservationsIn` is gone, and
`ACTIVE_ORDER_STATUSES` no longer exists. Availability, the dispatch board and
`AssignmentPolicy` now derive busy-ness from **Dispatch alone**.

A pre-flight against the live data confirmed this loses nothing: every reservation
the Order arm was carrying was already covered by an active dispatch — which is
only true because the Phase 5 backfill ran first.

`Order.driverId` / `Order.vehicleId` survive for legacy read compatibility (API
responses, list filters). No business rule reads them.
