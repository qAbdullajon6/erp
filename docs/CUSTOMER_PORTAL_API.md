# Customer Portal

A self-service portal for a customer's own contact to sign in and track their orders,
invoices, and account — independent of staff authentication. This document covers the
backend (`apps/api/src/customer-portal/`) and the matching frontend (`apps/web/src/routes/portal.*`,
`apps/web/src/lib/api/portal-*.ts`).

**Provenance note.** This module's business logic (auth, orders, invoices, dashboard,
notifications, documents, profile) was originally built in an earlier development pass,
lost from version control before being committed, and recovered via forensic inspection of
the live database and an uncommitted git stash (see the repository truth audit that
preceded this milestone). Account **provisioning** — how a customer ever gets an account in
the first place — did not exist anywhere in that recovered code and was designed and built
fresh as part of this milestone.

## Architecture

### Two separate principal types, one database

A **customer portal account** (`CustomerPortalAccount`) is a distinct authentication
principal from a staff **User** — a different table, a different JWT strategy
(`"customer-jwt"` vs `"jwt"`), and no relationship to `Membership`/`MembershipRole` at all.
A `CustomerPortalAccount` is always exactly one row per `Customer` (`customerId` is unique),
never per-organization-membership like staff.

```
Organization ─┬─< User ─< Membership (staff, role-based)
              ├─< Customer ─┬─< CustomerPortalAccount (0 or 1) ─< CustomerRefreshToken
              │             └─< CustomerPortalInvitation (0..n, history)
              └─< CustomerPortalAccount, CustomerRefreshToken, CustomerPortalInvitation
                  (also organization-scoped directly, for tenant isolation checks)
```

`CustomerNotificationRead` tracks which synthesized notification keys an account has seen
(see Notifications below) — it has no `organizationId` of its own; `accountId` already
scopes it to one tenant.

### Provisioning flow (staff invites, customer activates)

Deliberately mirrors the existing staff `Invitation` flow (`apps/api/src/invitations/`)
exactly — same token/hash/partial-unique-index/status pattern — but is a fully separate
model and code path, because accepting one creates a `CustomerPortalAccount`, never a
`User`/`Membership`.

1. Staff with `ADMIN` or `SALES_CRM_MANAGER` calls `POST /customers/:customerId/portal-access/invitations`.
   `CustomerPortalProvisioningService.createInvitation` refuses if the customer already has
   an account, has no email on file, isn't `ACTIVE`, or the organization isn't `ACTIVE`.
2. A `CustomerPortalInvitation` row is created (`PENDING`) with a hashed, 256-bit opaque
   token. Only the hash is ever persisted; the raw token exists only in the emailed link.
3. An email is sent (via the shared `MailService` abstraction — real SMTP, or captured in
   the dev/test `MailOutbox` under `GET /test/mail/customer-portal-outbox`) with an
   activation link: `<APP_PUBLIC_URL>/portal/accept-invite?token=<raw>`.
4. The customer opens `/portal/accept-invite`, which calls `GET /customer-portal/invitations/:token`
   (validates: well-formed, not revoked, not accepted, not expired) and then
   `POST /customer-portal/invitations/accept` with a new password.
5. Acceptance is one transaction: compare-and-set consumes the invitation (`PENDING` →
   `ACCEPTED`), then creates the `CustomerPortalAccount` with the password hashed via the
   same `PasswordService` (Argon2id) staff accounts use. No JWT/session is issued by
   acceptance — the customer signs in separately, same as the staff invite flow.
6. Staff can `resend` (rotates the token, invalidating the old link), `revoke` (kept as a
   row with `status: REVOKED`, not deleted, so the accept flow can distinguish "revoked"
   from "never existed"), and later `suspend`/`reactivate` an existing account.

A partial unique index (`customer_portal_invitations_open_customer_unique`, raw SQL — not
expressible in Prisma's schema DSL) enforces "at most one open invitation per customer" at
the database level, backing up the application-level check under a race.

### Authentication

- `CustomerJwtStrategy` (`"customer-jwt"` Passport strategy) validates a bearer token against
  `CustomerPortalAccount`, re-reading account/customer/organization status **live on every
  request** — a suspended account or archived customer stops working the instant the token
  is next checked, not just at next login.
- Refresh tokens (`CustomerRefreshToken`) are opaque, 384-bit random values; only a SHA-256
  hash is ever persisted (`common/refresh-token.util.ts`, shared with — but not used by — the
  pre-existing staff refresh-token implementation). Refreshing rotates the token: the old row
  is revoked, a new one issued.
- Changing password revokes every other active refresh token for that account immediately —
  a leaked token stops working the moment the customer changes their password.
- **Shares the staff JWT signing secret** (`AuthConfig.jwtAccessSecret`) rather than a
  separate one. This is a deliberate, documented tradeoff (see Security below), not an
  oversight.

### Login — resolving which account, across organizations

`organizationSlug` is optional. When given, login is scoped to that organization only. When
omitted, `CustomerPortalAuthService` searches for the email **across every organization**:

- Exactly one matching account → used.
- Zero matches → generic "Invalid email or password" (no enumeration signal).
- More than one match (the same email registered as a portal contact in two different
  organizations) → a specific "please specify your organization" message, since a generic
  failure here would make login impossible for that customer without ever telling them why.

This replaces a bug found during the repository audit: the originally recovered version
resolved an **arbitrary first `ACTIVE` organization** when `organizationSlug` was omitted,
and only then checked for a matching account in *that* organization — meaning login
silently failed for almost any customer in a database with more than one organization,
regardless of how correct their password was.

## API

All responses use the standard envelope (`{ "data": ... }` / `{ "error": { "statusCode", "message" } }`).
Authenticated routes require `Authorization: Bearer <accessToken>` from a customer-portal
login — a staff token is never accepted here (different Passport strategy, different table).

### Public (no auth)

| Endpoint | Notes |
| --- | --- |
| `POST /customer-portal/auth/login` | `{ email, password, organizationSlug? }`. Throttled 5/min. |
| `POST /customer-portal/auth/refresh` | `{ refreshToken }`. Rotates the token. |
| `GET /customer-portal/invitations/:token` | Validate an invitation token for the activation page. Throttled 10/min. |
| `POST /customer-portal/invitations/accept` | `{ token, password }`. Throttled 10/min. |

### Authenticated (customer session)

| Endpoint | Notes |
| --- | --- |
| `GET /customer-portal/auth/me` | Current session. |
| `POST /customer-portal/auth/logout` | Revokes one refresh token. |
| `POST /customer-portal/auth/change-password` | Revokes every other active session. |
| `GET /customer-portal/dashboard` | Aggregates: open orders, delivered this month, outstanding balance/count, recent orders, upcoming deliveries, unread count. |
| `GET /customer-portal/orders`, `GET /customer-portal/orders/:id`, `GET /customer-portal/orders/:id/timeline` | Always scoped to the caller's own `customerId`; cross-customer/cross-org access returns 404, never 403 (see Security). |
| `GET /customer-portal/invoices`, `GET /customer-portal/invoices/:id` | Same scoping rule. |
| `GET /customer-portal/documents` | Synthesized list (see Known limitations — invoices only, currently). |
| `GET /customer-portal/notifications`, `.../unread-count`, `POST .../:key/read`, `POST .../read-all` | Synthesized feed (see below), with per-account read tracking. |
| `GET /customer-portal/profile`, `PATCH /customer-portal/profile` | Read/update the linked `Customer` record's contact fields. Monetary fields (`creditLimit`) are decimal **strings**, never JS numbers. |

### Staff-facing (organization session, `ADMIN`/`SALES_CRM_MANAGER`)

| Endpoint | Notes |
| --- | --- |
| `GET /customers/:customerId/portal-access` | Current status: has an account? its status? a pending invitation? |
| `POST /customers/:customerId/portal-access/invitations` | Invite. 409 if the customer already has an account or an open invitation. |
| `POST .../invitations/:id/resend` | Rotates the token. |
| `POST .../invitations/:id/revoke` | |
| `POST /customers/:customerId/portal-access/suspend` | Immediate — the account's next authenticated request 401s. |
| `POST /customers/:customerId/portal-access/reactivate` | |

## Permissions / tenant isolation

Every authenticated-customer query is scoped by **both** `organizationId` and `customerId`
sourced from the validated JWT payload — never from client input, never from a route
parameter alone. Cross-customer and cross-organization access both return **404**, uniformly
— never 403, which would let a customer distinguish "exists but isn't yours" from "doesn't
exist," and enumerate valid IDs belonging to other customers by the response code alone.

Provisioning routes are gated to `ADMIN`/`SALES_CRM_MANAGER` (`CustomerPortalProvisioningController`
— the same role set as `CustomersController`'s own write access), and additionally scoped to
the caller's own `organizationId`.

## Database

Four tables, reconciled into `schema.prisma` from the live database (three pre-existed
there, undocumented; `customer_portal_invitations` is new — see the Prisma migration
`20260717050000_add_customer_portal_invitations`):

- `customer_portal_accounts` — `organizationId`, `customerId` (unique), `email`,
  `passwordHash`, `status` (`ACTIVE`/`SUSPENDED`/`DISABLED`), `lastLoginAt`.
- `customer_refresh_tokens` — mirrors `refresh_tokens` exactly, scoped to an account instead
  of a user.
- `customer_notification_reads` — `accountId`, `key`, unique on the pair.
- `customer_portal_invitations` — mirrors `invitations` exactly (see Provisioning above).

## Security

- **Password hashing**: Argon2id via the shared `PasswordService` — identical algorithm/cost
  parameters to staff accounts.
- **Enumeration resistance**: 404-not-403 on cross-tenant access (see above); a generic
  "Invalid email or password" on login regardless of whether the email exists.
- **Rate limiting**: login throttled 5/min; the public invitation-validate/accept routes
  throttled 10/min — the only unauthenticated, credential-checking surfaces this module
  exposes.
- **Audit logging**: every state change (login, login-failed, password-changed,
  profile-updated, invitation created/revoked, access suspended/reactivated) is written
  through the shared `AuditService`.
- **SQL safety**: every query goes through Prisma's query builder or parameterized
  `createMany`/`aggregate` calls — no raw SQL string interpolation anywhere in this module.
  (The originally recovered `markAllRead` used `$executeRawUnsafe` with hand-escaped
  interpolated values; this was replaced with a parameterized `createMany({ skipDuplicates: true })`.)
- **Known tradeoff — shared JWT secret**: customer and staff tokens are signed with the same
  secret (`AuthConfig.jwtAccessSecret`). Separation relies on (a) two distinct Passport
  strategy names and (b) the `sub` claim resolving against two disjoint, independently
  generated UUID tables (`User` vs `CustomerPortalAccount`) — not on cryptographic
  separation or an explicit `aud`/`typ` claim. Practically safe (UUID collision across
  independent spaces isn't a realistic attack), but a future hardening pass could mint a
  dedicated customer-portal signing secret and/or add an explicit token-type claim.

## Performance

- **Dashboard outstanding balance** is computed via `prisma.invoice.aggregate({ _sum: { balanceDue: true } })`
  — one `SUM()` in Postgres — not by pulling rows into the Node process and accumulating in
  a loop (the originally recovered version pulled up to 1,000 invoice rows to do this).
- **Notifications unread-count** counts directly against `CustomerNotificationRead` rather
  than re-fetching and re-formatting the entire feed just to discard it (the originally
  recovered version called its own `list()` with a 200-row limit purely to get a count).
- Documents/notifications lists are capped (100/200 rows) rather than paginated — acceptable
  at current scale; would need real pagination if a customer's order/invoice history grows
  much larger.

## Known limitations

- **Delivery Proof viewing is not wired up.** The original design included a customer-facing
  proof-of-delivery viewer (`GET /customer-portal/orders/:id/delivery-proof`, a "POD"
  document type). The Delivery Proof module (model, service, storage) is **not present in
  this repository** as of this milestone — it existed in an earlier session and was removed
  before this one began. Rather than reference a table/service that doesn't exist, this
  capability was omitted outright: `CustomerOrdersService` has no delivery-proof methods,
  and `CustomerDocumentsService` only synthesizes invoice documents. The frontend's
  `usePortalOrderDeliveryProofs` hook and the order-detail page's "Delivery Proofs" card
  still exist and degrade gracefully (an empty result, no error shown — the card simply
  doesn't render), but will show nothing until Delivery Proof is recovered/rebuilt and this
  module's order/document services are extended to use it again.
- **No test-only account seeding.** There is no seed script that creates a demo
  `CustomerPortalAccount` — every account must go through the real invite → activate flow
  (including in e2e tests, which do exactly that).
- **No self-service password reset** ("forgot password") — only authenticated
  change-password. A reset flow would need its own token/email infrastructure, deliberately
  out of scope for this milestone.

## Deployment requirements

Nothing beyond what the rest of the API already needs: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`APP_PUBLIC_URL` (used to build both staff and customer-portal activation links), and a
configured `SMTP_URL` in production (see `.env.example`) — without it, invitation emails fail
loudly (`UnavailableMailService`) rather than silently pretending to send.
