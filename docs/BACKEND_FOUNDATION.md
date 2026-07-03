# Backend Foundation

This documents the `apps/api` backend foundation added in this phase: a
NestJS + PostgreSQL + Prisma service laying the groundwork for a future
production backend. **No ERP module has been migrated to it yet** — the
frontend (`apps/web`) still runs entirely on its own `localStorage` demo
data, untouched. See [`MONOREPO_MIGRATION.md`](MONOREPO_MIGRATION.md) for how
the repository itself was restructured in the prior phase.

## Local prerequisites

- Node.js and npm (already required for `apps/web`)
- Docker (for local PostgreSQL via `docker-compose.yml`) — or any PostgreSQL
  16+ instance you already have running locally

## Starting PostgreSQL locally with Docker Compose

A `docker-compose.yml` at the repo root starts **Postgres only** — the
frontend and API are not containerized in this phase.

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` with:

- user: `erp`
- password: `erp`
- database: `erp_dev`

These match the default `DATABASE_URL` in `apps/api/.env.example`. Stop it
with `docker compose down` (add `-v` to also delete the data volume).

## Environment variables

Copy `apps/api/.env.example` to `apps/api/.env` and adjust as needed. **Never
commit a real `.env` file or a real `DATABASE_URL`/secret** — `.env*` is
gitignored (with `.env.example` explicitly un-ignored so the template stays
tracked).

| Variable       | Purpose                                                                 | Example                                                  |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `PORT`         | Port the NestJS app listens on                                           | `4000`                                                     |
| `NODE_ENV`     | Standard Node environment flag                                           | `development`                                              |
| `CORS_ORIGIN`  | Comma-separated list of origins allowed to call the API (local dev only) | `http://localhost:3000`                                    |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma                              | `postgresql://erp:erp@localhost:5432/erp_dev?schema=public` |

## Migration commands

Run from the repository root (forwards to `apps/api`) or directly inside
`apps/api`:

```bash
npm run prisma:generate         # regenerate the Prisma client after a schema change
npm run prisma:migrate          # create + apply a new migration in development
npm run prisma:migrate:deploy   # apply existing migrations (production/CI)
npm run prisma:studio           # open Prisma Studio to browse the database
```

The initial migration (`apps/api/prisma/migrations/`) creates the foundation
tables: `organizations`, `users`, `memberships`, `refresh_tokens`,
`audit_logs`.

## Seed command

```bash
npm run seed
```

This currently only logs a message — **it intentionally creates no data**.
Real seed data (and real ERP demo data migrated from `apps/web`) is out of
scope for this phase.

## API run / build / test commands

All run from the repository root:

```bash
npm run dev:api         # start the API in watch mode (http://localhost:4000)
npm run build:api       # nest build
npm run start:api       # run the built app (node dist/main.js)
npm run lint:api        # eslint
npm run typecheck:api   # tsc --noEmit
npm run test:api        # jest unit tests
```

End-to-end tests run directly inside `apps/api`: `npm run test:e2e`.

## Health endpoints

- `GET /health` — liveness only. Deliberately does **not** touch the
  database, so it stays accurate even if PostgreSQL is down.
- `GET /health/database` — readiness check that runs `SELECT 1` through
  Prisma to confirm the database connection is actually working.

Both are wrapped in the API's standard response envelope: `{ "data": ... }`
on success, `{ "error": { "statusCode", "message" } }` on failure (see
`src/common/filters/http-exception.filter.ts` and
`src/common/interceptors/transform.interceptor.ts`).

## Tenant isolation rules

**This is the single most important rule for everything built on top of this
foundation.** An `Organization` is a tenant. Every ERP entity added in future
phases (Order, Customer, Invoice, Vehicle, Driver, Expense, ...) **must**:

1. Carry an `organizationId` foreign key column.
2. Never be queried, updated, or deleted without scoping the query by that
   `organizationId` — there is no cross-organization data sharing anywhere
   in this system, ever.
3. Have that scoping enforced structurally (e.g. a repository layer or
   Prisma middleware/extension that always injects the current request's
   `organizationId`), not left to individual developers to remember on each
   query.

A `Membership` row is what grants a `User` a `MembershipRole` within a
specific `Organization`. Every authorization check ultimately resolves
through Membership — "can this user do X in this organization" always means
"look up their Membership for that `organizationId` and check its `role`."

## What is intentionally not implemented yet

- No frontend module has been migrated from `localStorage` to this API.
- No real authentication flow: `AuthService`'s methods (`register`, `login`,
  `refreshAccessToken`, `selectOrganization`) are documented placeholders
  that throw `NotImplementedException`. No `AuthController` exists — nothing
  is exposed over HTTP yet.
- No JWT/session issuance, no guards, no `@CurrentUser()`/`@CurrentOrg()`
  decorators.
- No ERP business entities (Order, Customer, Invoice, Vehicle, Driver,
  Expense, ...) — only the tenant/user/membership/audit foundation.
- No cloud database, no deployment, no CI pipeline for the API.

### Planned auth flow (for the next phase, not built yet)

1. **Register**: email + password (hashed via `PasswordService`, bcryptjs)
   creates a `User`, and either creates a new `Organization` or accepts an
   invitation into an existing one via `Membership`.
2. **Login**: verify email + password, then issue a short-lived **access
   token** (JWT) plus a longer-lived **refresh token**. Only the refresh
   token's hash is persisted (`RefreshToken.tokenHash`), never the raw token.
3. **Refresh**: present the refresh token, validate it against its stored
   hash, reject if revoked or expired, rotate it, and issue a new access
   token.
4. **Organization selection**: once authenticated, a user with multiple
   Memberships selects which Organization the session acts within; every
   subsequent request is scoped to that `organizationId` (see Tenant
   isolation rules above).
5. **Authorization**: route guards check the current Membership's `role`
   (`ADMIN`, `OPERATIONS_MANAGER`, `DISPATCHER`, `ACCOUNTANT`, `DRIVER`,
   `SALES_CRM_MANAGER` — mirroring the frontend demo's roles) against each
   endpoint's required permissions.
