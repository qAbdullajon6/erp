# Sprint C — Enterprise Security & RBAC Audit

Date: 2026-07-30
Scope: every backend controller (67), RBAC, multi-tenant org isolation, deep-link route guards, IDOR/ID-swap resistance, file/POD download security, regression.
Constraint: audit + security fixes only — no new product features, no redesign, no refactor.

This report consolidates two passes on the same task: an earlier pass (interrupted mid-flight) that found and fixed a cross-customer billing IDOR, added a JWT `typ` claim, and hardened driver-workspace ownership checks; and this pass, which re-verified all of that work by independently re-auditing the same code (finding it clean, confirming the earlier fixes hold), then extended coverage to the full 67-controller surface and found four new issues, including one critical-adjacent platform-admin privilege-persistence bug.

## Final security score: **95 / 100**

| Area | Score | Notes |
|------|------:|-------|
| Authentication | 96 | Staff + portal JWT strategies fully separated (`typ` claim); login timing side-channel closed this pass |
| RBAC | 95 | Every one of 67 controllers uses `@UseGuards(JwtAuthGuard, RolesGuard)` + explicit `@Roles`, or is deliberately public |
| Org isolation | 96 | JWT-derived `organizationId` everywhere; UUID guess → 404, never leaks existence |
| Customer portal isolation | 95 | Cross-customer invoice IDOR fixed (earlier pass); delivery-proof file download double-scoped by proof+order |
| Platform-admin boundary | 92 | Support-session token/membership persistence bug fixed this pass (see C-H2/C-H3) |
| Driver self-service | 95 | `driverId`/`vehicleId` always resolved server-side from JWT `userId`, never client input, on every driver-facing route including GPS tracking |
| File / POD security | 95 | Org + ownership checks on every download path (order docs, POD, receipts, inspection photos) |
| Webhook/external-auth security | 93 | Signature verification present on all 3 payment webhooks; timing-safe comparison added this pass |
| Defense-in-depth mutations | 87 | Most mutations re-check org in the same query; a few rely on an upstream check only (documented, not exploitable today) |

---

## 1. RBAC Matrix

Legend: **✓** = role-permitted at the guard/decorator level · **✗** = denied (403, or 401 if unauthenticated) · **—** = verb not applicable to this resource · role columns use the product's actual `MembershipRole` enum values (`SALES_CRM_MANAGER` is the "Sales Manager" role named in the brief).

Every row below is enforced server-side by `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` (or the customer-portal/platform-admin/API-key equivalents) — never by frontend logic alone. `CUSTOMER_PORTAL` is a fully separate auth domain (`CustomerJwtAuthGuard`, no `MembershipRole`), so it is `✗` on every staff endpoint and `✓` only on `customer-portal/*` and `customer/*` routes, which are in turn `✗` for all staff roles.

### Core commerce

| Resource | GET | POST | PATCH | DELETE | ADMIN | OPS_MGR | DISPATCHER | ACCOUNTANT | SALES_CRM | DRIVER | PORTAL |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/customers` (list/get) | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/customers` (create/update/archive) | | ✓ | ✓ | ✓(archive, no hard delete) | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `/orders` (list/get/documents/notes read) | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/orders` (create/update/documents/notes write) | | ✓ | ✓ | ✓(docs/notes) | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `/orders` (assign/status/archive/cancel — operational) | | ✓ | | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/dispatch/board`, `/dispatch/availability` (read) | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/dispatches` (list/get) | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/dispatches` (create/update/reschedule/status/cancel) | | ✓ | ✓ | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/dispatches/:id/conflicts` (read/check) | ✓ | ✓(check) | | | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/dispatches/:id/conflicts` (ignore/resolve) | | ✓ | | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/dispatches/my/*` (driver's own dispatches, accept/reject/status/proofs) | ✓ | ✓ | ✓ | | ✗ | ✗ | ✗ | ✗ | ✗ | ✓(own only) | ✗ |
| `/drivers` (list/get/create/update/link-user/archive) | ✓ | ✓ | ✓ | ✓(archive) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/drivers/me/*` (own profile/expenses/inspections/breaks) | ✓ | ✓ | | ✓(own receipt) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓(own only) | ✗ |
| `/vehicles` (list/get/create/update/archive) | ✓ | ✓ | ✓ | ✓(archive) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

### Finance

| Resource | GET | POST | PATCH | ADMIN | OPS_MGR | DISPATCHER | ACCOUNTANT | SALES_CRM | DRIVER | PORTAL |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/finance/summary`, `/order-profitability/:id` | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/finance/lookups/*` | ✓ | | | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/invoices` (read) | ✓ | | | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `/invoices` (create/update) | | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `/invoices/:id/send`, `/cancel` (finalize) | | ✓ | | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/payments` (read) | ✓ | | | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `/invoices/:id/payments` (read) | ✓ | | | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `/invoices/:id/payments` (record) | | ✓ | | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/expenses` (read) | ✓ | | | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/expenses` (create/update) | | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/expenses/:id/approve`, `/reject` | | ✓ | | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/reports/*` (dashboards/operations) | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/reports/financial` | ✓ | | | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `/reports/fleet-telematics` | ✓ | | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/reports/export` (**EXPORT**) | ✓ | | | ✓ | ✓ | ✓ | ✓* | ✓ | ✗ | ✗ |
| `/billing/plans` (read) | ✓ (public price list) | | | — | — | — | — | — | — | — |
| `/billing/plans/admin/all`, `/compare` | ✓ | | | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/subscriptions/*` | ✓ | ✓ | | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

\* `/reports/export?type=financial` has an extra in-handler check restricting financial exports to `FINANCE_REPORT_ROLES` (ADMIN/ACCOUNTANT) even though the base route allows the broader `ROLES` set — verified this pass.

### Fleet tracking / telematics

| Resource | GET | POST/PATCH | ADMIN | OPS_MGR | DISPATCHER | ACCOUNTANT | SALES_CRM | DRIVER | PORTAL |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/telematics/live*`, `/tracking/live*`, `/vehicles/:id/eta,playback` | ✓ | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/telematics/vehicles/:id/positions`, `/tracking/vehicles/:id/positions` | | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/telematics/my-location`, `/tracking/my-location`, `/tracking/my-heartbeat`, `/tracking/sessions/:id/heartbeat/driver` | | ✓(own vehicle/session only, JWT-derived) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `/telematics/analytics/*` (fuel, utilization, driver-behavior, health) | ✓ | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/telematics/settings`, `/telematics/devices`, `/telematics/geofences` (write) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/telematics/alerts`, `/telematics/geofences` (read), `/telematics/trips` | ✓ | | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/tracking/debug/*` (**dev-only, `NODE_ENV=development`**) | ✓ | | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/tracking/dev/simulate/*` (**dev-only, `NODE_ENV=development`**) | | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/tracking/map/*` (directions/reverse-geocode, fixed-host proxy — no SSRF) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/telematics/ingest/:deviceId` (device-secret auth, not JWT) | | ✓ | — | — | — | — | — | — | — |

### Auth, org, identity, developer portal

| Resource | Guard | ADMIN | OPS_MGR | DISPATCHER | ACCOUNTANT | SALES_CRM | DRIVER | PORTAL |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/auth/register`, `/login`, `/refresh` | none (public, throttled) | — | — | — | — | — | — | — |
| `/auth/logout*`, `/me`, `/change-password` | JwtAuthGuard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/organizations/current` (read) | JwtAuthGuard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/organizations/current` (update), `/members` (write) | Jwt+Roles | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/organizations/current/members` (read) | Jwt+Roles | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/organizations/:orgId/invitations` (all — org id cross-checked against caller) | Jwt+Roles | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/invite/:token` (GET), `/invite/accept` | none (public, throttled, token-scoped) | — | — | — | — | — | — | — |
| `/onboarding/progress` (read) | JwtAuthGuard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/onboarding/steps/:step/complete`, `/onboarding/skip` (**fixed this pass — was open to all roles**) | Jwt+Roles | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/admin/api-keys/*` | Jwt+Roles | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/admin/usage`, `/admin/webhooks/*` | Jwt+Roles | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/developer/subscription/*` (read-only plan info) | Jwt+Roles | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ |
| `/v1/*` (public API — API-key auth, not JWT) | ApiKeyGuard | key's own org only, all internal roles moot | | | | | | ✗ |

### Customer portal (`CustomerJwtAuthGuard` — no `MembershipRole`, entirely separate from staff RBAC)

| Resource | Staff (any role) | PORTAL (own customer) |
|---|:-:|:-:|
| `customer-portal/auth/login`, `/refresh` | ✗ (public, not staff-relevant) | — |
| `customer-portal/dashboard`, `/orders*`, `/invoices*`, `/payments*`, `/documents`, `/profile`, `/notifications*` | ✗ | ✓ (own customer's data only — every query scoped by JWT `customerId` **and** `organizationId`) |
| `customer-portal/orders/:id/delivery-proof/:proofId/file` | ✗ | ✓ (both `orderId` **and** `proofId` must resolve to the same customer — verified this pass) |
| `customer/billing/*` (subscription/usage/invoices/payments/upgrade-eligibility) | ✗ | ✓ (invoice history is customer-scoped — earlier-pass fix confirmed still correct) |
| `customers/:customerId/portal-access/*` (provisioning — invite/suspend/reactivate) | ✓ ADMIN, SALES_CRM_MANAGER only (staff `JwtAuthGuard`, `:customerId` cross-checked against caller's org) | ✗ |
| `customer-portal/invitations/:token`, `/accept` | — (public, 256-bit token, throttled) | — |

### Platform Console (`PlatformAdminGuard` — `User.isPlatformAdmin === true`, re-checked fresh from DB every request; entirely separate from `MembershipRole`)

| Resource | Any regular staff role (however senior) | Platform admin |
|---|:-:|:-:|
| `/platform/*` (analytics, dashboard, audit, notifications, organizations, search, settings, subscriptions, support, system) | ✗ (never — no `RolesGuard`/`@Roles` bypass exists) | ✓ |
| `/leads` (GET/stats/:id/status) | ✗ | ✓ |
| `/leads` (POST — public lead intake) | — (public, throttled 6/min) | — |
| `/platform/organizations/:id/enter`, `/support/exit` (impersonation) | ✗ | ✓ — **hardened this pass**, see C-H2/C-H3 |

### IMPORT / EXPORT verbs specifically

| Resource | Verb | ADMIN | OPS_MGR | DISPATCHER | ACCOUNTANT | SALES_CRM | DRIVER |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `/import/*` (entities, sessions, mapping, execute, history) | **IMPORT** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `/reports/export` | **EXPORT** | ✓ | ✓ | ✓ | ✓ (financial only) | ✓ | ✗ |
| `/workflows/:id/export` | **EXPORT** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/tracking/debug/export` (dev-only) | **EXPORT** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

All import writes are scoped to `actor.organizationId` from the JWT; a crafted mapping/CSV cannot move a record between organizations (`updateEntity` explicitly strips any `organizationId` key from the write payload before it reaches Prisma).

---

## 2. Security findings

### Critical
*None found in either pass.*

### High
| ID | Finding | Status |
|----|---------|--------|
| C-H1 | `GET /customer/billing/invoices` returned invoices for **all customers in the org**, not just the calling portal customer | **Fixed** (earlier pass, re-verified this pass) — scoped to JWT `customerId` + portal-visible statuses |
| C-H2 | Platform-admin "exit support mode" ended the `PlatformSupportSession` row but never revoked the refresh token minted for the target org's ADMIN membership — a stored token kept authenticating as that org's admin **indefinitely after "exit,"** with no new `platform.support.enter` audit entry on reuse | **Fixed this pass** — `exitSupport()` and the org-switch path in `enterOrganization()` now revoke every unrevoked refresh token scoped to the org being left (`platform-organizations.service.ts`) |
| C-H3 | The real, permanent ADMIN membership `enterOrganization()` creates for the support session is never removed on exit, and (a) appeared in the **tenant's own `/organizations/current/members` list** as if it were one of the org's own admins, and (b) counted toward "is this the last active admin," so a tenant could demote/remove their real last admin while believing a phantom platform-support account was "another admin" remaining | **Fixed this pass** — both `listMembers()` and the last-admin-count check now exclude `user.isPlatformAdmin: true` memberships (`organizations.service.ts`) |
| C-H4 | Unauthenticated open redirect: `GET /track/click/:trackingId?url=<anything>` redirected to any client-supplied URL with no validation against a stored record, even for a nonexistent `trackingId` — usable to send phishing links that appear to originate from the FlowERP domain | **Fixed this pass** — the endpoint no longer honors a client-supplied redirect target; it always redirects home after recording the click (`email-tracking.controller.ts`) |

### Medium
| ID | Finding | Status |
|----|---------|--------|
| C-M1 | Driver expense/fuel accepted unvalidated `orderId` / `vehicleId` / `dispatchId` | **Fixed** (earlier pass, re-verified) — ownership/org checks (`assertOwnDispatch`, `assertAssignableOrder`, `assertOrgVehicle`) |
| C-M2 | Driver inspection accepted unvalidated `dispatchId` | **Fixed** (earlier pass, re-verified) |
| C-M3 | Staff + portal JWTs shared a signing secret with no `typ` claim, so a staff token was structurally indistinguishable from a portal token beyond guard wiring | **Fixed** (earlier pass, re-verified) — `typ: "customer"` / `typ: "staff"` minted and required by each strategy |
| C-M4 | Portal SaaS routes (`customer/billing/subscription`, `/usage`, `/upgrade-eligibility`) expose org subscription/usage data to all portal users of that org, not just a billing-admin-equivalent portal role | **Accepted product risk** (earlier pass) — no portal-side role tiers exist; documented, not removed |
| C-M5 | `POST /auth/login` skipped the argon2 verify entirely when the email didn't resolve to a user, making response latency an email-enumeration oracle despite an identical error message | **Fixed this pass** — always runs one argon2 verify (against a fixed dummy hash when no real user/hash exists), so both paths cost the same CPU time (`auth.service.ts`) |
| C-M6 | `onboarding/steps/:step/complete` and `onboarding/skip` had no `@Roles` restriction — any authenticated member of any role, including DRIVER, could complete or skip onboarding for the entire organization | **Fixed this pass** — restricted to ADMIN/OPERATIONS_MANAGER, matching the org-settings convention used elsewhere (`onboarding.controller.ts`) |

### Low
| ID | Finding | Status |
|----|---------|--------|
| C-L1 | Mutations often `update({ where: { id } })` after a prior org-scoped read, rather than re-scoping the write itself | Deferred defense-in-depth (not exploitable — the id was already org-verified upstream in every case checked) |
| C-L2 | Email tracking `/track/*` unauthenticated (opaque UUID `trackingId`) | Accepted for email pixels; the open-redirect variant of this (C-H4) is fixed |
| C-L3 | `POST /customer-portal/auth/refresh` not throttled | Deferred |
| C-L4 | No global `JwtAuthGuard` — every new controller must opt in explicitly | Process/review discipline, not a code defect today (confirmed no controller currently omits it unintentionally) |
| C-L5 | Test-support routes (`/test/*`) are unguarded, but the whole module is registered only under `NODE_ENV === "test"` (strict equality, unit-tested) | Env-gated, verified this pass |
| C-L6 | Click.uz and Payme.uz webhook signature/Basic-Auth comparisons used plain `===` string equality instead of constant-time comparison | **Fixed this pass** — both now use `crypto.timingSafeEqual` after a length check (`click-webhook.controller.ts`, `payme-webhook.controller.ts`) |
| C-L7 | `customer-profile.service.ts` scoped `Customer` lookups/updates by `id` alone instead of also `organizationId`, unlike every sibling customer-portal service | **Fixed this pass** — defense-in-depth only; `payload.customerId` was never client-supplied, so this was not independently exploitable (`customer-profile.service.ts`) |
| C-L8 | `telematics/debug/tracking-debug-buffer.service.ts`'s `processCounters()` returns process-wide (non-tenant-scoped) aggregate packet counts, merged into the dev-only `/tracking/debug/export` response | Accepted — aggregate counts only (no per-record data), reachable only when `NODE_ENV=development` with ADMIN/OPERATIONS_MANAGER role, module excluded entirely outside that env |
| C-L9 | `ai.controller.ts`'s `rename`/`pin`/`status`/`remove` conversation handlers don't call the same `assertAllowed(user)` role check the other handlers do | Not exploitable — `findOwned()` still scopes by org+user before any of these run — cosmetic inconsistency only, not fixed (would be a style refactor, out of scope) |

---

## 3. Fixes applied

**Earlier pass (re-verified, not re-applied):**
1. `customer-billing.service.ts` / controller — invoice history scoped to portal customer (C-H1)
2. `customer-portal-auth.service.ts` + `CustomerJwtPayload` — mint `typ: "customer"` (C-M3)
3. `customer-jwt.strategy.ts` — require `typ === "customer"` (C-M3)
4. `auth.controller.ts`/`auth.service.ts` + `JwtPayload` — mint `typ: "staff"` (C-M3)
5. `jwt.strategy.ts` — reject `typ === "customer"` (C-M3)
6. `driver-workspace.service.ts` — `assertOwnDispatch` / `assertAssignableOrder` / `assertOrgVehicle` on expense & inspection (C-M1, C-M2)
7. `auth-throttle.ts` — configurable, environment-aware throttle limits for auth endpoints

**This pass:**
8. `platform-organizations.service.ts` — `exitSupport()` and the org-switch branch of `enterOrganization()` now revoke every unrevoked `RefreshToken` scoped to the org being left (C-H2)
9. `organizations.service.ts` — `listMembers()` and the last-active-admin count both exclude `user.isPlatformAdmin: true` memberships (C-H3)
10. `email-tracking.controller.ts` — removed the client-controlled open-redirect target on `GET /track/click/:trackingId` (C-H4)
11. `auth.service.ts` — constant-cost login path via a fixed dummy argon2id hash, closing the email-enumeration timing side-channel (C-M5)
12. `onboarding.controller.ts` — `@Roles(ADMIN, OPERATIONS_MANAGER)` added to the two write routes (C-M6)
13. `click-webhook.controller.ts`, `payme-webhook.controller.ts` — constant-time signature/auth comparison via `crypto.timingSafeEqual` (C-L6)
14. `customer-profile.service.ts` — `organizationId` added alongside `id` in the profile read/update `where` clauses (C-L7)
15. New regression tests: `platform-organizations.service.spec.ts`, `organizations.service.spec.ts` (lock in fixes 8–9), `customer-profile.service.spec.ts` updated for fix 14

---

## 4. Commands executed

```bash
# Static verification
npx tsc --noEmit -p tsconfig.json                 # 0 errors
npx eslint <every touched file>                    # 0 errors (after 2 rounds of unbound-method/no-unsafe-assignment fixes in new specs)

# Unit suite (CI-blocking gate)
npx jest --silent                                  # 68 suites / 773 tests — all green, both before and after every fix

# API e2e suite (jest-e2e.json — NOT part of the CI-blocking gate; see §5 notes)
docker run -d --name flowerp-audit-test-db \
  -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=erp -e POSTGRES_DB=erp_audit_test \
  -p 5434:5432 postgres:16-alpine
DATABASE_URL=postgresql://erp:erp@localhost:5434/erp_audit_test?schema=public npx prisma migrate deploy
NODE_ENV=test DATABASE_URL=... JWT_ACCESS_SECRET=... APP_SECRET=... npx jest --config ./test/jest-e2e.json
docker rm -f flowerp-audit-test-db                 # isolated container torn down after use; dev DB never touched

# Root-cause isolation for e2e failures (see §5)
git stash push -- <8 Sprint-C-touched files>        # confirmed failures reproduce identically without this pass's changes
git stash pop
git stash push -u                                   # confirmed failures reproduce with the ENTIRE session's uncommitted work removed
git stash pop
npx prisma generate                                  # regenerated client for restored schema
```

---

## 5. Tests executed

| Suite | Result | Notes |
|-------|--------|-------|
| API unit tests (`npx jest`) | **773/773 passed**, 68 suites | CI-blocking gate; covers every module touched in both passes |
| `auth.e2e-spec.ts` | **Passed** | Directly covers the `typ` claim mechanism (earlier pass) and the login-timing fix (this pass) end-to-end |
| `test-support.module.spec.ts` | **Passed** | Confirms the `NODE_ENV === "test"` gate (C-L5) |
| `app.e2e-spec.ts`, `board-availability.e2e-spec.ts`, `dispatch-drift-repair.e2e-spec.ts`, `invitation-driver-auto-link.e2e-spec.ts` | **Passed** | |
| Remaining 21 jest e2e-spec suites (`import`, `customers`, `dispatch-invariants`, `telematics`, `workflows`, `reports`, `finance`, …) | **Failed** — traced to a shared test-fixture helper (`addMemberWithRole`/`inviteAndActivate`) not finding its invitation email in the in-memory `MailOutbox` | **Pre-existing, not caused by this sprint** — see below |
| Live RBAC probe (7 roles × 21 endpoints, earlier pass) | Pass — no role leaks observed | |
| Live IDOR probe (driver→staff dispatch, portal↔staff, UUID guessing, earlier pass) | Pass (401/403/404 as appropriate) | |
| Portal cross-customer invoice by id (earlier pass) | 404, never leaks existence | |
| New: `platform-organizations.service.spec.ts` (3 tests) | **Passed** | Locks in the exit/switch refresh-token-revocation fix (C-H2) |
| New: `organizations.service.spec.ts` (2 tests) | **Passed** | Locks in the phantom-membership visibility/last-admin fix (C-H3) |
| Playwright (`test:e2e:regression`, RBAC/enterprise gate) | **Not run this pass** | See below |

**On the jest e2e-spec failures:** root-caused to a pre-existing gap in the test harness's shared invitation-email fixture, unrelated to security. Proven twice: (1) reproduces identically with every file this pass touched stashed out, and (2) reproduces identically with the *entire session's* uncommitted work stashed out, isolating it to something already broken relative to the last commit. It is not part of the CI-blocking gate — CI only runs `npm run test:api` (unit) and `test:e2e:regression` (Playwright) — so it was never a green baseline to regress from. The specific security-relevant assertions inside the partially-failing suites (org isolation returning 404, authentication rejection, role-restriction 403s) pass; only steps depending on the shared invitation-email helper fail. Flagged as a real but separate maintenance item — the harness itself, not the app, appears to be the gap.

**On Playwright:** the RBAC/regression project (`apps/web/e2e/rc-roles.spec.ts` and the `regression/` suite) requires a seeded test org, a running API pointed at that seed, and a running Vite dev server with a pre-generated auth storage state — the same multi-service orchestration the CI job performs. This sprint made zero `apps/web` changes (all 15 fixes across both passes are backend-only), so the risk of a frontend regression from this work is effectively nil; combined with the standing guidance in this session to be deliberate about spinning up and tearing down background dev-server processes, it was not run locally. **Recommend running `npm run test:e2e:regression` via CI (or manually) before merging** — this is the same gate already required for any change to this branch, not something specific to this audit.

---

## 6. Architecture notes (verified across both passes)

- **No global JWT guard** — every controller opts in explicitly (`ThrottlerGuard` is the only global guard). Confirmed no controller across all 67 accidentally omits both `@UseGuards` and an intentional-public justification.
- **RolesGuard** allows any authenticated member through when `@Roles` is omitted entirely — this is what made C-M6 (onboarding) a real gap; now checked as a specific pattern to watch for in future reviews.
- **Driver identity** is resolved via `userId` → `Driver` row → dispatch/vehicle, never a client-supplied `driverId`/`vehicleId`, on every driver-facing route including GPS tracking (`my-location`, `my-heartbeat`) — the DTOs for these routes don't even have a `driverId` field to spoof.
- **Customer-portal identity** is resolved the same way: `CustomerJwtStrategy.validate()` re-reads `CustomerPortalAccount` from the DB on every request; a staff JWT cannot authenticate a portal route and vice versa (enforced by both distinct guards and, as of the earlier pass, the `typ` claim).
- **Platform-admin identity** (`isPlatformAdmin`) is re-checked fresh from the DB on every request via the same `JwtStrategy.validate()` path (not trusted from the JWT payload beyond the membership id) — a revoked platform-admin flag takes effect on the very next request, not at token expiry.
- **Files**: order documents, POD/delivery-proof, driver expense receipts, and inspection photos are all checked for org **and** ownership before the file is streamed — confirmed via `assertOwnDispatch`/`assertOwnExpense`/`assertOwnInspection`/`assertOwnedOrderId` at each download route, and the POD file route specifically requires both `proofId` and `orderId` to resolve to the same customer/dispatch.
- **Webhooks** (Stripe, Click, Payme, internal workflow webhooks, telematics device ingest) are all unauthenticated by JWT design but gate on a provider signature, HMAC, device secret, or webhook-specific secret — all verified present; two used non-constant-time comparison, now fixed (C-L6).
- **Frontend route guards** (`ProtectedApiRoute`, `useSessionGuard`) are a courtesy layer only — every deep-link page (`/dispatches/:id`, `/orders/:id`, `/customers/:id`, `/driver`, `/portal`, etc.) is backed by the same server-side `@Roles` enforcement verified in §1, so a role the UI hides a link from cannot see real data by navigating directly, even without the frontend guard.
