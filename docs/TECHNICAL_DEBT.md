# Technical debt

Known, accepted, scheduled. An entry here is a debt someone has already decided
to take on with a named payoff point — not a wishlist and not a bug tracker.

---

## TD-TELEMATICS-01 — `gps_positions` is an unpartitioned, unbounded hot table

**Status:** OPEN, medium severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

The raw position stream grows without bound: a 100-vehicle fleet pinging every
10 s writes ~860k rows/day. It is a single flat table, and retention pruning is
a `deleteMany` over `recordedAt < cutoff`, which on a large table takes a heavy,
long-held lock.

**Why not fixed now:** correct at current scale and the reads are all index-
covered by `(organizationId, vehicleId, recordedAt)`. The fix is declarative
PostgreSQL range partitioning by month plus `DROP PARTITION`-based retention
(instant, no lock), and batched deletes in the interim.

**Payoff point:** first org exceeding ~50M rows, or the first retention prune
that measurably impacts ingest latency.

---

## TD-TELEMATICS-02 — Trip aggregates assume serial per-vehicle ingestion

**Status:** OPEN, low severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

`TripService.saveAggregate` writes ABSOLUTE running totals (not atomic
increments), computed in memory across a batch. This keeps persistence a plain
update with no raw SQL for the running max, and is correct because one device
feeds one ordered stream. Two ingest batches for the *same vehicle* processed
concurrently on two instances could race and lose one batch's contribution.

**Why not fixed now:** a single vehicle has a single device feeding a single
ordered stream; concurrent same-vehicle ingestion across instances does not
occur in practice. The fix is a per-vehicle advisory lock around the
open→rollup→save sequence, or atomic increments + a `GREATEST` raw update for
max speed.

**Payoff point:** if positions for one vehicle ever fan in from more than one
source, or an at-least-once queue can replay a batch on another worker.

---

## TD-TELEMATICS-03 — Samsara/Geotab normalizers are documented-shape, not account-verified

**Status:** OPEN, low severity, mitigated.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

`SamsaraProvider` and `GeotabProvider` map each vendor's *documented* location
payload (`data[].gps` / MyGeotab record). They are real, unit-tested normalizers,
but the field shapes have not been confirmed against a live account's webhook
sample, and vendors version their payloads.

**Why not fixed now:** no live Samsara/Geotab account is connected in this
milestone. MANUAL, GENERIC_WEBHOOK and TRACCAR cover the paths actually
exercised. A wrong mapping fails loudly (a `ProviderNormalizationError` 400),
never silently corrupts data.

**Payoff point:** onboarding the first customer on either platform — capture a
real webhook sample and pin the normalizer to it with a fixture test.

---

## TD-TELEMATICS-04 — ETA has no address→coordinate geocoding

**Status:** OPEN, low severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

Orders store delivery *addresses* as text, not coordinates, so ETA cannot be
computed to "the order's destination" automatically. The ETA endpoint takes an
explicit destination lat/lng; the kinematic estimate itself is fully implemented
and tested.

**Why not fixed now:** geocoding is a third-party integration (and cost) of its
own. The `remainingKm` step is isolated so a routing/geocoding provider can drop
in behind it without changing callers.

**Payoff point:** when a geocoding provider is added, or when Orders gain
persisted destination coordinates.

---

## TD-TELEMATICS-05 — `ws` typed by a local ambient declaration, not `@types/ws`

**Status:** OPEN, trivial severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

The repo has `ws` but not `@types/ws`. Rather than add a dev dependency for a
handful of methods, `apps/api/src/telematics/realtime/ws.d.ts` declares exactly
the surface used. If WebSocket usage grows, replace the shim with `@types/ws`.

**Payoff point:** the first time the shim is missing a member someone needs.

---

## TD-TELEMATICS-06 — Device ingest endpoint has no per-device rate limit

**Status:** OPEN, low severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

`POST /telematics/ingest/:deviceId` opts out of the global IP throttle (a busy
fleet legitimately posts hundreds of fixes/min from one egress IP). The device
secret is the gate — an unauthenticated post is rejected before any work — but a
compromised device secret could flood ingestion.

**Why not fixed now:** the ingest path is cheap and the secret bounds who can
call it. The fix is a per-device token-bucket keyed on `deviceId` (Redis), the
same infrastructure the API-key rate limiter already uses.

**Payoff point:** first sign of abusive volume from a single device, or the SLA
that requires ingest back-pressure.

---

## TD-TELEMATICS-07 — Geofence dwell/exit does per-ping lookups for the last ENTER

**Status:** OPEN, low severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

For a vehicle sitting inside a fence with a dwell threshold, each ping queries
the most recent ENTER (and whether a DWELL already fired). Active geofences are
cached per-org, but the ENTER lookup is not.

**Why not fixed now:** fleets have a handful of depots/yards, so the cost is
negligible. It would matter only with many overlapping fences a vehicle dwells
in simultaneously. The fix is to carry current-fence membership + entry time on
`VehicleTelematicsState`.

**Payoff point:** an org with dozens of overlapping active geofences.

---

## TD-TELEMATICS-08 — Account-level multi-vehicle webhooks not fully wired

**Status:** OPEN, low severity, accepted.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

Ingestion authenticates per device (`/telematics/ingest/:deviceId`), so a
Samsara/Geotab *account* webhook that batches many vehicles in one POST is not
the primary path — each device is expected to post for its own vehicle. The
normalizers already return one position per vehicle in a batch; what is missing
is an account-scoped ingest credential that resolves each `externalDeviceId` to
its device.

**Why not fixed now:** the per-device path covers Traccar, first-party and
per-device vendor configs. Account fan-out is only needed for a specific
Samsara/Geotab deployment style.

**Payoff point:** onboarding a customer who insists on a single account-level
webhook rather than per-device posting.

---

## TD-TELEMATICS-09 — Migration authored & validated but not applied to the shared dev DB

**Status:** OPEN, informational.
**Found:** Fleet Telematics implementation milestone, 2026-07-17.

The dev database (`erp_dev`) carries a migration history from other branches
(billing, delivery-proofs, driver-mobile, …) that does not exist on this branch,
so `prisma migrate deploy` cannot be run cleanly here. The telematics migration
(`20260717100000_add_fleet_telematics`) was instead validated by executing its
full SQL against the live schema inside a transaction and rolling back — every
`CREATE TYPE/TABLE/INDEX` and `ADD CONSTRAINT` succeeded — so it is known-good
against the real schema without disturbing the drifted DB.

**Why not fixed now:** the branch drift is pre-existing and not this milestone's
to resolve; forcing the migration would risk another branch's data.

**Payoff point:** when this branch's migrations are reconciled with the shared
DB (a clean `migrate resolve`/rebaseline), apply telematics as part of that pass.

---

## TD-TELEMATICS-10 — Native PostgreSQL chosen over PostGIS for spatial operations

**Status:** OPEN, deliberate design decision, informational.
**Found:** Fleet Telematics evolution audit, 2026-07-17.

The telematics module uses native PostgreSQL with haversine distance calculation
(tested utility functions) and in-memory point-in-polygon testing (cached
per-org geofences), instead of PostGIS with `GEOMETRY` types and `ST_*` spatial
functions.

**Why not PostGIS now:**
- Current design is correct, tested, and performant at scale
- All queries are org/vehicle-scoped first; spatial filtering is secondary
- Haversine formula is tested and accurate for distance calculations
- Point-in-polygon runs in-memory with geofences cached per-org (fast)
- No spatial-range queries ("find all vehicles within 5km of point") currently needed
- Avoiding PostGIS dependency reduces deployment complexity
- PostGIS image (postgis/postgis:16-3.4) is available in docker-compose but not used

**When to add PostGIS:**
1. **Spatial-range query requirement:** "Find all vehicles within 5km of this point"
2. **Performance bottleneck:** Geofence evaluation becomes slow (not observed)
3. **Advanced spatial ops:** Buffer zones, route corridors, heatmaps, spatial indexing

**Migration path when triggered:**
1. Add PostGIS extension: `CREATE EXTENSION postgis;`
2. Add geometry columns: `ALTER TABLE gps_positions ADD COLUMN location GEOMETRY(Point, 4326);`
3. Populate from lat/lng: `UPDATE gps_positions SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);`
4. Create GIST index: `CREATE INDEX idx_gps_positions_location ON gps_positions USING GIST (location);`
5. Update geofence geometry columns similarly
6. Replace haversine with `ST_Distance`, point-in-polygon with `ST_Contains`

**Payoff point:** First requirement for a spatial-range query, or geofence
evaluation becomes a measured bottleneck at scale.

---

## TD-021 — Concurrent imports into one organization can collide on generated codes

**Status:** OPEN, low severity, accepted.
**Found:** Import Wizard implementation milestone, 2026-07-17.

`NaturalKeyService.allocate` reserves a block of codes (CUS-0001, ...) by reading
the current high-water mark from the table inside the caller's transaction. Two
imports running into the same organization at the same time can read the same max
and try to allocate the same codes.

The unique constraint (`@@unique([organizationId, customerCode])`) is the real
arbiter, so this cannot silently corrupt data: the loser's insert fails, the batch
falls back to per-row processing, and the affected rows surface as failed rows the
user can retry. The cost is a confusing failure, not a wrong record.

**Why not fixed now:** the fix is a per-(organization, entity) sequence or an
advisory lock around allocation. Both are straightforward, but the scenario needs
two admins of the *same company* importing the *same entity type* within the same
few seconds — rare enough that it did not justify adding a lock to the hot path of
every batch before anyone has hit it.

**Payoff point:** the first report of spurious duplicate-code failures, or when
imports are ever triggered by something other than a human clicking a button.

---

## TD-020 — multer is pinned below its fixed version by a transitive dependency

**Status:** OPEN, medium severity, mitigated.
**Found:** Import Wizard implementation milestone, 2026-07-17.

`@nestjs/platform-express@11.1.27` resolves `multer@2.1.1`, which carries a
published DoS advisory (deeply nested field names, GHSA; fixed in 2.2.0). The
Import Wizard's upload endpoint is the codebase's only multipart consumer, so this
is reachable in principle.

An npm `overrides` entry for `multer@^2.2.0` was tried and does **not** take —
npm 11.6.2 declines to record it in this workspace layout, leaving 2.1.1 installed.
Rather than ship a config that looks like protection and is not, the override was
removed and the risk is bounded where we do control it: `UPLOAD_LIMITS` in
`import.controller.ts` caps `fieldNameSize` (100), `fields` (8), `parts` (12) and
`fileSize`, which makes the deeply-nested-field-name attack unreachable regardless
of the version resolved.

**Why not fixed now:** the real fix is upstream — a `@nestjs/platform-express`
release that depends on multer >= 2.2.0 — or a lockfile edit that the next
`npm install` would undo.

**Payoff point:** bump `@nestjs/platform-express` when it ships with multer >=
2.2.0, then delete the mitigation comment (not the limits, which are worth having
on their own merits).

---

## TD-019 — The import engine is single-instance

**Status:** OPEN, medium severity, accepted until the API runs more than one instance.
**Found:** Import Wizard implementation milestone, 2026-07-17.

`ImportExecutionService` runs a session's batches in the process that accepted the
request (`setImmediate` after the HTTP response). With two API instances, a session
resumed on instance B while instance A is still draining it would be worked by both.

The claim is a compare-and-set on `ImportSession.status` (`updateMany` filtered on
the status the row must still have), so a *double start* is impossible — the loser's
update matches zero rows. What is not protected is a resume racing an in-flight run
on another instance, because the flag they coordinate through is a database row that
only the running instance polls.

Same shape, same fix, and the same payoff point as TD-018 (the webhook dispatcher
and the per-API-key rate limiter): a shared claim — `SELECT ... FOR UPDATE SKIP
LOCKED` over due sessions, or a real queue.

**Payoff point:** the moment a second API instance is provisioned. Worth doing
together with TD-018 rather than twice.

---

## TD-018 — The Developer Portal has two single-instance components

**Status:** OPEN, medium severity, accepted until the API runs more than one instance.
**Found:** Developer Portal implementation milestone, 2026-07-17.

Two pieces of the Developer Portal hold state in process memory and are correct only
while exactly one API instance is running:

- **`ApiKeyRateLimitGuard`** counts requests in an in-process `Map`. Across N instances a
  key effectively gets N times its `rateLimitPerMinute`, since each instance meters only
  the traffic it happens to receive.
- **`WebhookDispatcherService`** polls the `webhook_deliveries` table on a 5s interval.
  Two instances would both poll the same rows.

The dispatcher is the less severe of the two: its claim is a compare-and-set
(`updateMany` filtered on `status: 'PENDING'`), so a delivery still cannot be sent twice
— the loser's update matches zero rows. The cost of a second instance there is wasted
queries, not duplicate webhooks. The rate limiter has no such protection: its ceiling is
simply wrong under multi-instance.

**Why not fixed now:** the deployment is single-instance today, so neither is currently
incorrect. Both want the same fix — a shared store (Redis for the rate-limit counters, a
queue or `SELECT ... FOR UPDATE SKIP LOCKED` for the dispatcher) — and doing that
speculatively would add an infrastructure dependency the app does not otherwise need.

**Payoff point:** the moment a second API instance is provisioned. This is a hard
prerequisite for horizontal scaling, not a nice-to-have: shipping a second instance
without it silently multiplies every customer's rate limit.

---

## TD-017 — SSRF protection checks the URL host, not the resolved address

**Status:** OPEN, medium severity, accepted.
**Found:** Developer Portal implementation milestone, 2026-07-17.

`webhook-url.util.ts` blocks loopback/private/link-local **hostname literals**
(`127.0.0.1`, `10.x`, `169.254.169.254`, ...). A DNS name that resolves to a private
address — deliberately, as in a DNS-rebinding attack, or accidentally via a customer's
split-horizon DNS — passes the check and is then fetched by `WebhookDispatcherService`.

Mitigating factors: creating a webhook requires ADMIN/OPERATIONS_MANAGER, so this is not
reachable by an anonymous attacker; the cloud metadata endpoint is blocked
unconditionally (see `ALWAYS_BLOCKED_HOST_PATTERNS`, which the development
`WEBHOOK_ALLOW_PRIVATE_TARGETS` flag deliberately cannot open); and `redirect: "manual"`
stops a compliant redirect from bouncing a request into the private range after the check.

**Why not fixed now:** closing it properly means resolving the hostname ourselves and
pinning the socket to the checked address (a custom `lookup`/agent), so the address that
was validated is provably the address connected to. That is real work and easy to get
subtly wrong; the host-literal check already covers the realistic cases for an
admin-gated feature.

**Payoff point:** before the Developer Portal is offered to untrusted/self-serve tenants,
where "requires an admin role" stops being a meaningful barrier.

---

## TD-016 — `WorkflowEventService` is named for one of its two consumers

**Status:** OPEN, low severity (naming only), accepted.
**Found:** Developer Portal implementation milestone, 2026-07-17.

`WorkflowEventService.emit` is the single fan-out point for every domain event, and now
notifies two consumers: the workflow engine and (since this milestone) subscribed webhook
endpoints via `WebhookEventService`. Its name predates the second consumer and now
undersells what it does — a reader looking for "where do webhooks get their events" will
not find it by name.

Keeping one emit surface is deliberate and is not the debt: a parallel
`webhookEvents.emit(...)` beside each of the ~17 existing calls would double the sites a
new event must be added to, and the first one-sided update would leave the two consumers
disagreeing about which events exist. Only the *name* is wrong.

**Why not fixed now:** renaming it to `DomainEventService` touches all ~17 call sites
across 8 domain modules. That is a mechanical but wide diff, and folding it into a feature
milestone would bury the feature's real changes in rename noise.

**Payoff point:** the next time those domain services are opened for other reasons, or as
a standalone rename commit that touches nothing else.

---

## TD-015 — Customer-portal JWTs share the staff signing secret

**Status:** OPEN, low severity, accepted for now.
**Found:** Customer Portal implementation milestone, 2026-07-17.

`CustomerJwtStrategy` and the staff `JwtStrategy` both sign/verify with
`AuthConfig.jwtAccessSecret` — there is no separate customer-portal secret. The two token
types are kept apart by (a) distinct Passport strategy names (`"customer-jwt"` vs `"jwt"`)
and (b) the `sub` claim resolving against two disjoint, independently-generated UUID tables
(`CustomerPortalAccount` vs `User`) — not by cryptographic separation or an explicit
`aud`/`typ` claim in the token itself.

**Why not fixed now:** not currently exploitable — forging a working cross-type token would
require the `sub` of one principal type to collide with a real row's id in the other
principal's table, which is a UUIDv4 collision, not a realistic attack. This was a deliberate
scope decision for the provisioning/recovery milestone, not an oversight: minting and
threading a second secret through `CustomerPortalModule`'s `JwtModule.registerAsync` is a
small, well-contained follow-up whenever someone wants belt-and-suspenders separation instead
of relying on the UUID-disjointness argument above.

---

## ~~TD-014 — DeliveryProof's migration history is not registered with Prisma~~ — MOOT

**Noted moot:** 2026-07-17. The Delivery Proof module (model, service, storage, migration)
this entry was about is no longer present in the repository at all — removed sometime
between the Delivery Proof milestone and this one. Nothing to reconcile until/unless that
module is rebuilt.

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

---

## TD-NOTIF-01 — Digest mode implementation deferred

**Status:** OPEN, low severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

Preferences table includes digestMode, digestTime fields, but aggregation logic and scheduled job are not implemented. Only instant notification delivery is active.

**Why not fixed now:** Instant mode covers 90% of use cases. Digest requires aggregation logic and scheduled job. Structure ready for future implementation.

**Payoff point:** When users request daily digest emails to reduce notification volume.

---

## TD-NOTIF-02 — SMS provider implementations deferred

**Status:** OPEN, low severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

SMSProvider interface defined, but Twilio/MessageBird implementations not built. SMS channel infrastructure exists but no provider integrations.

**Why not fixed now:** Email is primary channel. SMS requires third-party account setup. Interface allows future providers without changing dispatcher.

**Payoff point:** When SMS notification channel is required.

---

## TD-NOTIF-03 — Push notification providers deferred

**Status:** OPEN, low severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

PushProvider interface defined, but Firebase/APNs implementations not built.

**Why not fixed now:** In-app and email cover current needs. Push requires mobile app.

**Payoff point:** When mobile app is built.

---

## TD-NOTIF-06 — Template management UI deferred

**Status:** OPEN, medium severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

Template CRUD backend exists, admin UI not built.

**Why not fixed now:** System templates seeded at deployment. Backend complete.

**Payoff point:** When non-technical users need template customization.

---

## TD-NOTIF-07 — Preference center UI deferred

**Status:** OPEN, medium severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

Preferences backend complete, user UI not built.

**Why not fixed now:** Admin can configure via API.

**Payoff point:** When users request granular notification control.

---

## TD-NOTIF-08 — SSE realtime updates deferred

**Status:** OPEN, medium severity, accepted.
**Found:** Notifications Center milestone, 2026-07-17.

SSE infrastructure exists, notification channel not integrated.

**Why not fixed now:** Refresh works for MVP. Infrastructure exists.

**Payoff point:** When realtime updates required.

