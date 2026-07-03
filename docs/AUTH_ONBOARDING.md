# Auth + Organization Onboarding

This documents the real authentication and organization-management API added
in `apps/api` on top of the [Backend Foundation](BACKEND_FOUNDATION.md). It
is **not connected to the live demo** — `apps/web` still runs entirely on its
own `localStorage` data, and its role switcher is untouched. Nothing here
migrates any ERP business data (Customers, Orders, Dispatch, Finance, ...).

## Local setup

```bash
docker compose up -d                          # start local PostgreSQL (see BACKEND_FOUNDATION.md)
cp apps/api/.env.example apps/api/.env
# generate a real local secret and paste it into .env as JWT_ACCESS_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run prisma:migrate
npm run dev:api                               # http://localhost:4000
```

The app refuses to boot if `JWT_ACCESS_SECRET` is empty — this is
intentional (see Security notes).

## Auth flow

1. **Register** (`POST /auth/register`) creates a `User`, a new
   `Organization`, and a `Membership` with role `ADMIN` for that user in that
   organization, all in one transaction. It returns tokens immediately
   (auto-login) — there's no separate "confirm your account" step in this
   phase.
2. **Login** (`POST /auth/login`) verifies the password and picks the
   session's **current organization** — see "Current-organization selection
   strategy" below.
3. Every subsequent authenticated request carries the **access token**
   (`Authorization: Bearer <token>`) and is scoped to that one
   user+organization+role for its lifetime.
4. When the access token expires, the client calls **refresh**
   (`POST /auth/refresh`) with the **refresh token** to get a new pair of
   both tokens (rotation — see below).
5. **Logout** revokes one specific session; **logout-all** revokes every
   session for the user (e.g. "log out everywhere").
6. **Change password** re-verifies the current password, updates it, and
   revokes every existing session — the user (and anyone else who might have
   a stolen token) is forced to log in again everywhere.

## Token storage / refresh strategy

- **Access token**: a JWT, signed with `JWT_ACCESS_SECRET`, short-lived
  (`JWT_ACCESS_EXPIRES_IN_SECONDS`, default 900 = 15 minutes). Its payload is
  deliberately minimal — just the user id and membership id. Role and
  organization status are **re-checked fresh from the database on every
  request** (`JwtStrategy`), not trusted from the token's claims, so
  revoking a membership or disabling a user takes effect immediately instead
  of waiting for the token to expire.
- **Refresh token**: a long random opaque string (not a JWT), returned to
  the client once. Only its **SHA-256 hash** is ever persisted
  (`RefreshToken.tokenHash`) — a fast, deterministic hash is correct here
  specifically because the token itself is already a high-entropy random
  secret, not a human-memorable password (unlike `PasswordService`, which
  uses Argon2id for actual passwords).
- **Rotation**: every `/auth/refresh` call revokes the presented refresh
  token and issues a brand new one. A refresh token is single-use; replaying
  an old one after it's been rotated away fails with 401. This limits the
  blast radius of a leaked refresh token to one use.
- **Session = one refresh token = one organization.** A `RefreshToken` row
  carries `organizationId`, fixed at issuance and carried forward by every
  rotation. This is the "current-organization selection strategy":

  **At login**, if the request includes `organizationSlug`, the server
  verifies an active `Membership` really exists for that user in that
  organization (never trusted blindly) and uses it; otherwise it defaults to
  the user's oldest active `Membership`. That choice is then fixed for the
  life of the session/refresh token. **Switching organizations** (a future
  phase, not built yet) would mean logging in again with a different
  `organizationSlug` to mint a new, separately-scoped session — this design
  doesn't need to change for that; it already supports a user holding
  multiple concurrent sessions across different organizations.

## Endpoint examples

All responses are wrapped in `{ "data": ... }` on success or
`{ "error": { "statusCode", "message" } }` on failure (see
[BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md)). Passwords and refresh/access
tokens are never included in any response beyond the token fields shown
below, and `passwordHash` is never serialized anywhere.

### POST /auth/register

```json
// Request
{
  "email": "ada@example.com",
  "password": "correct-horse-battery",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "organizationName": "Analytical Engines Ltd"
}
```
```json
// Response 201
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "3f9a...(opaque, base64url)",
    "accessTokenExpiresInSeconds": 900,
    "user": { "id": "...", "email": "ada@example.com", "firstName": "Ada", "lastName": "Lovelace" },
    "organization": { "id": "...", "name": "Analytical Engines Ltd", "slug": "analytical-engines-ltd", "defaultCurrency": "USD", "timezone": "UTC" },
    "membership": { "id": "...", "role": "ADMIN" }
  }
}
```

### POST /auth/login

```json
// Request (organizationSlug optional — only needed with multiple memberships)
{ "email": "ada@example.com", "password": "correct-horse-battery", "organizationSlug": "analytical-engines-ltd" }
```
Response: same shape as register.

### POST /auth/refresh

```json
// Request
{ "refreshToken": "3f9a..." }
```
Response: same shape as register, with both tokens rotated.

### POST /auth/logout / POST /auth/logout-all

Require `Authorization: Bearer <accessToken>`. `/logout` body:
`{ "refreshToken": "..." }` (revokes that one session).
`/logout-all` takes no body (revokes every session for the user).
Both respond `{ "data": { "success": true } }` (logout) or
`{ "data": { "revokedCount": 2 } }` (logout-all).

### GET /auth/me

Requires `Authorization: Bearer <accessToken>`.
```json
{ "data": { "user": {...}, "organization": {...}, "membership": { "id": "...", "role": "ADMIN" } } }
```

### POST /auth/change-password

Requires auth. `{ "currentPassword": "...", "newPassword": "..." }` →
`{ "data": { "success": true } }`. Revokes all other sessions.

### Organization endpoints

All require `Authorization: Bearer <accessToken>`; the organization is
**always** the one the token is scoped to — there is no
`/organizations/:id` route and no client-supplied organization id anywhere.

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /organizations/current` | any member | basic org info (name, slug, currency, timezone, status) |
| `PATCH /organizations/current` | ADMIN only | body: `{ name?, defaultCurrency?, timezone? }` — slug and status are not editable here |
| `GET /organizations/current/members` | ADMIN only | full membership list with user info |
| `POST /organizations/current/members` | ADMIN only | body: `{ email, role }` — adds an **existing** user by email; 404 if no such user exists (no invite-email flow in this phase) |
| `PATCH /organizations/current/members/:membershipId` | ADMIN only | body: `{ role?, status? }` |
| `DELETE /organizations/current/members/:membershipId` | ADMIN only | soft-removes (`status: REMOVED`), never hard-deletes |

## Organization and membership rules

- Roles use the existing `MembershipRole` enum: `ADMIN`, `OPERATIONS_MANAGER`,
  `DISPATCHER`, `ACCOUNTANT`, `DRIVER`, `SALES_CRM_MANAGER` — the same six
  roles the frontend demo's role switcher already uses.
- **Last-admin protection**: a `PATCH`/`DELETE` that would leave an
  organization with zero active `ADMIN` memberships is rejected with 409,
  whether that's demoting the last admin's role or removing/deactivating
  them. This is enforced server-side in `OrganizationsService`, not just in
  a UI — there's no way to bypass it through the API.
- **Cross-organization isolation**: a membership ID that belongs to a
  *different* organization than the caller's token always returns 404, never
  403 or any other signal that it exists elsewhere. Every organization-scoped
  query is filtered by `organizationId` server-side.
- A `User` can hold multiple `Membership` rows across different
  organizations (the schema already supported this before this phase) —
  there's just no UI/endpoint yet to *switch* between them mid-session; you
  log in again with a different `organizationSlug` instead.
- `POST /organizations/current/members` only attaches an **existing** user
  by email. There is no invite-by-email flow (no email sending, no
  accept-invitation token) in this phase — building that is future scope.

## Security notes

- Passwords are hashed with **Argon2id** (`argon2` package, default cost
  parameters). Password hashes are never serialized in any API response.
- The app **refuses to start** if `JWT_ACCESS_SECRET` is unset — booting
  with an empty/guessable secret would let anyone forge valid access tokens.
- Refresh tokens are stored only as a SHA-256 hash; the raw token is
  returned to the client exactly once and is not recoverable from the
  database afterward.
- Auth endpoints (`register`, `login`) are rate-limited to 5 requests/minute
  per IP; `refresh` to 10/minute. `GET /health*` is exempt. Rate limiting is
  disabled when `NODE_ENV=test` so the e2e suite isn't flaky (see
  `AppModule`) — this does not affect development or production.
- Audit events are recorded for registration, login (success and failure),
  logout, logout-all, refresh, password change, and organization/membership
  management actions (`AuditLog` table, written via `AuditService`).
  `AuditLog.organizationId` is nullable specifically so a failed login
  against an email matching no user can still be recorded.
- **Known limitation, deferred**: login response times are not currently
  constant-time between an existing and a non-existing email (Argon2
  verification only runs when a user is found), which is a minor timing-based
  user-enumeration vector. Considered acceptable for this phase; a future
  hardening pass could add a dummy-hash comparison to close it.

## What remains intentionally deferred

- No frontend login/register UI, and no ERP business module has been
  migrated from `apps/web`'s `localStorage` demo to this API.
- No email sending of any kind (no invite emails, no password-reset emails).
- No organization-switching endpoint (see "current-organization selection
  strategy" above for why the design already supports adding one later).
- No refresh-token device/session listing UI (e.g. "see all your logged-in
  devices") — the data model supports it (`RefreshToken` rows exist per
  session), but no endpoint exposes it yet.
- No production secrets management, no cloud database, no deployment.
