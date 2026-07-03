# Orders + Dispatch API

The second and third ERP business modules (Drivers, Vehicles) and the fourth and fifth
(Orders, Dispatch) now exist as real, tested, multi-tenant APIs in `apps/api`, continuing
the pattern started by [Customers](CUSTOMERS_API.md). Connected Mode now additionally
covers `/orders` and `/dispatch` in `apps/web`; Drivers and Vehicles are API-ready but
intentionally have no Connected Mode UI yet (see "Frontend Connected Mode" below).

**Product direction note:** this project is moving from a permanent-demo posture to a real
product. The localStorage demo (Orders, Dispatch, Drivers, Vehicles, Finance, Reports,
Notifications, AI Assistant) stays in place until each module has migrated to this API —
removing it is an explicit future step, not part of this phase.

## Migration

`20260704004515_add_operations_drivers_vehicles_orders` — adds `Driver`, `Vehicle`,
`Order`, `OrderStatusHistory` plus the `DriverStatus`, `VehicleStatus`, `OrderStatus`
enums. Every table carries `organizationId`; every query in every service below is scoped
by it, and a record id from another organization always returns 404.

## Data model

- **Driver**: `employeeCode` (unique per organization, auto-generated `EMP-0001`-style or
  set explicitly — same pattern as `Customer.customerCode`), `status`
  (`ACTIVE`/`INACTIVE`/`ON_LEAVE`), `licenseNumber`/`licenseExpiry` nullable,
  `archivedAt` (soft-archive; no hard delete).
- **Vehicle**: `vehicleCode` (same auto-generate pattern, `VEH-0001`-style),
  `capacityKg`/`capacityM3` nullable decimals, `status`
  (`AVAILABLE`/`IN_USE`/`MAINTENANCE`/`INACTIVE`), `archivedAt`.
- **Order**: `orderNumber` (unique per organization, auto-generated `ORD-<year>-0001`-style,
  restarting each calendar year), `customerId`, pickup/delivery address+city+date, cargo
  description + optional weight/volume, `price`+`currency`, `status` (see below),
  `driverId`/`vehicleId` nullable, `cancelledAt`/`deliveredAt`. No delete route —
  cancellation (`status: CANCELLED`) is the only removal-adjacent action.
- **OrderStatusHistory**: one append-only row per status change (including the initial
  `DRAFT` on creation), `changedByUserId` nullable (consistent with `AuditLog`).

**Decimal fields** (`price`, `cargoWeightKg`, `cargoVolumeM3`, `capacityKg`, `capacityM3`)
are always serialized as decimal **strings**, never JS numbers — same rationale as
`Customer.creditLimit` (avoiding floating-point precision loss on money/measurements).

### Driver/Vehicle `status` vs. "busy right now" — two different things

`Driver.status`/`Vehicle.status` are coarse, manually-managed administrative fields (is
this driver on leave? is this vehicle in maintenance?). They are **not** automatically
flipped when a driver/vehicle is assigned to an order. Whether someone is actually tied up
*right now* is always computed by cross-referencing orders currently
`ASSIGNED`/`PICKED_UP`/`IN_TRANSIT` (see Dispatch below) — the same "derive, don't
duplicate" approach used everywhere else in this codebase (e.g. the frontend demo's
delayed-order calculation).

## Business rules

- **Customer eligibility**: only a customer with `status: ACTIVE` can be selected for a
  new order (a literal reading of "non-archived, active" — `AT_RISK`/`INACTIVE` also count
  as "non-archived" but are not `ACTIVE`, so they're rejected too, 409).
- **Assignment eligibility**: `POST /orders/:id/assign` only accepts a driver with
  `status: ACTIVE` and a vehicle with `status: AVAILABLE` (409 otherwise), and only when
  the order's own status is `PENDING` or `ASSIGNED` (409 for any other status — reassigning
  a `PICKED_UP`+ order isn't supported by this simple endpoint).
- **Capacity validation**: only checked when *both* the vehicle's capacity field and the
  order's corresponding cargo field are present. If either is null, there's nothing to
  validate against and the assignment proceeds (400 if cargo exceeds capacity).
- **Double-booking prevention**: a driver or vehicle cannot be assigned to two orders whose
  `[pickupDate, deliveryDate]` ranges overlap, considering only orders in
  `ASSIGNED`/`PICKED_UP`/`IN_TRANSIT` (a `DRAFT`/`PENDING` order has no assignment yet by
  definition; `DELIVERED`/`CANCELLED` no longer block anything). Overlap is the standard
  inclusive interval test: `existing.pickupDate <= new.deliveryDate AND existing.deliveryDate
  >= new.pickupDate`. **This is deliberately conservative at the boundary**: an order
  ending exactly when another begins (e.g. a drop-off and the next pickup on the same
  calendar day) counts as overlapping and is rejected (409) — the API does not assume a
  driver/vehicle is free the instant one leg ends. Tested explicitly, including this exact
  boundary case.
- **Status transitions** are forward-only and one step at a time:
  `DRAFT → PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED`, enforced by an
  allowlist (409 on any skip or backward move). `ASSIGNED` is reachable from this endpoint
  in principle, but additionally requires a driver **and** vehicle already set — in
  practice this means `PENDING → ASSIGNED` only really happens via `/orders/:id/assign`,
  not `POST /orders/:id/status`.
- **Cancellation** (`POST /orders/:id/cancel`) is separate from the status-transition
  allowlist: it's allowed from any non-terminal status (`DRAFT` through `IN_TRANSIT`) and
  rejected (409) once an order is `DELIVERED` or already `CANCELLED`.
- **Editing** (`PATCH /orders/:id`) is rejected (409) once an order is `DELIVERED` or
  `CANCELLED`. If a driver/vehicle is already assigned and the pickup/delivery dates
  change, the double-booking check re-runs against the new dates; if cargo weight/volume
  changes, the capacity check re-runs against the assigned vehicle.
- **Delayed is computed, never stored**: `isDelayed` in every Order response is `true` when
  `status` isn't `DELIVERED`/`CANCELLED` and `deliveryDate` has passed — recalculated on
  every read, exactly like the frontend demo's original delayed-order logic.
- **No delete route** for Drivers, Vehicles, or Orders — archive/restore (fleet) or
  cancel (orders) are the only removal-adjacent actions, and both are always reversible.

## Endpoints and roles

| Role | Drivers / Vehicles | Orders (read) | Orders (create/update) | Orders (assign/status/cancel) | Dispatch |
| --- | --- | --- | --- | --- | --- |
| ADMIN | full | full | full | full | full |
| OPERATIONS_MANAGER | full | full | full | full | full |
| DISPATCHER | full | full | full | full | full |
| SALES_CRM_MANAGER | none | yes | yes | **no** (403) | none |
| ACCOUNTANT | none | yes | no (403) | no (403) | yes (read-only) |
| DRIVER | none | none | none | none | none |

This is a literal reading of the phase spec: SALES_CRM_MANAGER may "create/read/update
orders but cannot assign drivers/vehicles or manage fleet" (fulfillment actions and fleet
records are both operational, not sales-facing); ACCOUNTANT's stated scope is "read-only
orders and dispatch" specifically, so it has no access to Drivers/Vehicles at all; DRIVER
has "no general list access yet" anywhere in this phase (a driver-specific delivery API is
explicitly deferred).

### Drivers / Vehicles

`GET/POST /drivers`, `GET/PATCH /drivers/:id`, `POST /drivers/:id/archive`,
`POST /drivers/:id/restore` — and the same five routes under `/vehicles`. List supports
`page`/`limit`/`search`/`status`/`includeArchived`/`sortBy`/`sortOrder`, same shape as
Customers' list endpoint.

### Orders

| Endpoint | Notes |
| --- | --- |
| `GET /orders` | search/filter (`status`, `customerId`, `driverId`, `vehicleId`)/sort/pagination |
| `POST /orders` | starts at `DRAFT`; `driverId`/`vehicleId` are never accepted here |
| `GET /orders/:id` | includes `statusHistory` (list items don't) |
| `PATCH /orders/:id` | excludes `status`/`driverId`/`vehicleId` — those only change via the routes below |
| `POST /orders/:id/assign` | body: `{ driverId, vehicleId }`, both required |
| `POST /orders/:id/status` | body: `{ status, note? }` — forward-only, see Business rules |
| `POST /orders/:id/cancel` | body: `{ note? }` |

### Dispatch

`GET /dispatch/board` — unassigned (`PENDING`) orders, plus drivers/vehicles bucketed into
`available`/`busy` (with their `currentOrder`)/`onLeave`or`inUse`/`maintenance`/`inactive`.
`GET /dispatch/availability?pickupDate&deliveryDate` — without dates, the plain
administrative snapshot (`ACTIVE` drivers, `AVAILABLE` vehicles); with both dates, also
excludes anyone with an overlapping active order in that range (the same rule
`assign` enforces), so the frontend can pre-check before submitting an assignment.

## Frontend Connected Mode

`NEXT_PUBLIC_DATA_MODE=api` now additionally activates:

- **`/orders`**: list + search + a minimal "Create Order" form (customer picker restricted
  to `ACTIVE` customers, pickup/delivery city+date, cargo description, price). Assigning a
  driver/vehicle and progressing status are fully implemented and tested on the API but
  **not yet wired into this view** — a natural next step, called out on the page itself.
- **`/dispatch`**: a read-only rendering of `GET /dispatch/board` (unassigned orders,
  driver/vehicle availability counts and names). No assign action from this view yet.
- **Drivers and Vehicles have no Connected Mode UI this phase.** The existing `/drivers`
  page is a single read-only tabbed view built directly against the frontend's static mock
  data model, with no data-mode branching infrastructure at all (unlike Customers/Orders,
  which already had — or gained — a page-level demo/connected split). Retrofitting it
  cleanly was judged out of scope for this "small, verifiable phase" per the spec's own
  "only if the existing UI can support them cleanly" allowance. **The API itself is
  complete and tested** (see Drivers/Vehicles CRUD above) — only the UI is deferred.
- Both connected views are gated by the same `ProtectedApiRoute` guard as Customers/
  Settings (redirect to `/auth/login` when signed out) and use `useApiSession().callApi()`
  for the same silent-refresh-and-retry-once-on-401 behavior — see
  [CONNECTED_MODE_AUTH_UI.md](CONNECTED_MODE_AUTH_UI.md).
- Every other still-unmigrated module shows the existing "running on local demo data"
  banner when API mode is active (now excluding `/orders`/`/dispatch` too, alongside
  `/customers`/`/settings/*`).
- Orders/Dispatch never read or write the demo's `localStorage` data in API mode, and the
  demo pages themselves are completely unchanged in demo mode.

## Test organization seed vs. an empty real organization

Two different, deliberately separate things:

**An empty real organization** is just... registering normally. There is no special
command — `POST /auth/register` (or the `/auth/register` UI) creates one `User`, one
`Organization`, and an `ADMIN` `Membership`, with zero Drivers/Vehicles/Customers/Orders.
This is what any real customer of the product would do.

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@yourcompany.com","password":"a-real-password","firstName":"You","lastName":"Admin","organizationName":"Your Company"}'
```

**A Test Organization** is an explicit, separate, manually-run seed for sales/demo
purposes — it is **never** run automatically (it is not wired into Prisma's own
`"prisma": { "seed": ... }` auto-seed hook, which stays pointed at the empty
`prisma/seed.ts` placeholder it always has been):

```bash
npm run seed:test-org
```

This creates one organization, **"FlowERP Test Logistics"** (slug
`flowerp-test-logistics`), with:
- 6 test user accounts, one per role, all sharing the password printed by the script
  (`admin@flowerp.test`, `ops-manager@flowerp.test`, `dispatcher@flowerp.test`,
  `accountant@flowerp.test`, `sales@flowerp.test`, `driver@flowerp.test` — the `.test` TLD
  is IANA-reserved specifically for this purpose, RFC 2606, so these addresses can never
  collide with or accidentally email anyone real).
- 3 drivers, 3 vehicles, 3 customers, all named with a `(Test)` suffix or a `[TEST DATA]`
  cargo-description prefix.
- 7 orders spanning every status (`DRAFT`, `PENDING`, `ASSIGNED`, `IN_TRANSIT`,
  `DELIVERED`, `CANCELLED`), including one deliberately overdue `PENDING` order to
  demonstrate the `isDelayed` calculation, each with a matching `OrderStatusHistory` trail.

The script is idempotent-by-refusal: running it again while the organization already
exists does nothing and prints how to reseed cleanly. **Deleting the organization alone is
not enough** — it cascades away the memberships/drivers/vehicles/customers/orders, but the
`User` rows themselves survive (a `User` isn't owned by one `Organization`; the same person
could belong to several), so a full reseed needs both:

```sql
DELETE FROM organizations WHERE slug = 'flowerp-test-logistics';
DELETE FROM users WHERE email LIKE '%@flowerp.test';
```

then `npm run seed:test-org` again. Tenant isolation is what actually guarantees this data
can never mix with a real organization's — the same guarantee every other organization
relies on.

## Tests

`test/drivers-vehicles.e2e-spec.ts` and `test/orders-dispatch.e2e-spec.ts` cover: tenancy
isolation (cross-org 404s, list scoping), role restrictions per the table above, employee/
vehicle code uniqueness-per-org and reuse-across-org, archive/restore, customer eligibility
for order creation, date-range validation, the full sequential status path plus rejected
skips/backward moves/terminal-state edits, `ASSIGNED`-without-fleet rejection, cancellation
rules, assignment validation (driver/vehicle status, capacity, double-booking including the
touching-boundary edge case, and that a cancelled order frees its driver/vehicle for the
same dates), delay calculation, audit logs, and the dispatch board/availability endpoints
including their own role checks. `common/sequential-code.util.spec.ts` unit-tests the
shared code-generation algorithm (including the numeric-vs-lexicographic edge case) that
`Driver.employeeCode`/`Vehicle.vehicleCode`/`Order.orderNumber` all rely on.

## What remains intentionally deferred

- Assign/status/cancel actions in the Connected Mode Orders UI (API-complete, not yet
  wired into the frontend).
- Any Connected Mode UI for Drivers/Vehicles (API-complete, no UI this phase).
- A driver-specific delivery API/UI (explicitly deferred per the phase spec).
- Removing the localStorage demo for any module — an explicit future step once every
  module has a real Connected Mode, not part of this phase.
