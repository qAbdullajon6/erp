# FlowERP AI

An intelligent logistics operations platform: orders, dispatch, fleet, customer CRM,
finance, reporting and notifications in one workspace, backed by a real multi-tenant API.

Built by IT Technology Group.

## Stack

| | |
|---|---|
| **`apps/web`** | Vite + TanStack Start/Router + React 19 + Tailwind + shadcn/ui |
| **`apps/api`** | NestJS + Prisma + PostgreSQL |
| **Auth** | Argon2id passwords, JWT access tokens (15 min), rotating opaque refresh tokens |
| **Tests** | Jest (API units), Playwright (browser end-to-end) |

The frontend talks to the API through `/api`, which the Vite dev server proxies to
`http://localhost:4000` (see `apps/web/vite.config.ts`). There is no `localStorage` demo
mode and no data-mode switch — every screen reads and writes the real API.

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)

## Getting started

Run everything from the repository root; npm workspaces forwards to the right app.

```bash
# 1. Install
npm install

# 2. Start PostgreSQL (host port 5433, not 5432 — see docker-compose.local.yml)
docker compose -f docker-compose.local.yml up -d

# 3. Configure the API
cp apps/api/.env.example apps/api/.env.local
# Generate a JWT secret and paste it into JWT_ACCESS_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 4. Apply migrations and generate the Prisma client
npm run prisma:migrate:deploy
npm run prisma:generate

# 5. Seed a demo organization with test accounts (see below)
npm run seed:test-org
```

Then start both processes, in two terminals:

```bash
npm run dev:api    # http://localhost:4000
npm run dev:web    # http://localhost:3000
```

Open <http://localhost:3000>. The marketing page is at `/`, the application at `/app`.

> `npm run prisma:generate` fails with `EPERM` on Windows while the API is running — it
> holds the query engine DLL. Stop `dev:api` first.

## Test accounts

> **These accounts are for local development and demos only.** They ship with a known
> password and must never exist in a production database.

`npm run seed:test-org` creates one organization, **FlowERP Test Logistics**, with seven
accounts. They all share the password:

```
FlowERP-Test-2026!
```

| Email | Role | Sees |
|---|---|---|
| `admin@flowerp.test` | Admin | everything except **Leads** |
| `ops-manager@flowerp.test` | Operations Manager | orders, dispatch, customers, fleet, finance, reports |
| `dispatcher@flowerp.test` | Dispatcher | same as above |
| `accountant@flowerp.test` | Accountant | orders, dispatch, customers, finance, reports — no fleet |
| `sales@flowerp.test` | Sales / CRM Manager | orders, customers, finance, reports |
| `driver@flowerp.test` | Driver | overview and **My Deliveries** only |
| `platform@flowerp.test` | FlowERP staff | the admin screens **plus Leads** |

The sidebar is scoped to what each role's API will actually serve, so a link never leads
to a `403`. `apps/web/e2e/role-nav.spec.ts` asserts this for every account above.

The seed is safe to re-run: it refuses to create a second copy if the organization already
exists, and prints the SQL to remove it first.

### Platform admin

**Leads** — demo requests captured from the marketing page — belong to FlowERP, not to any
customer organization. A `Lead` row has no `organizationId`, so the tenant scoping every
other table relies on cannot apply to it.

They are therefore gated on `User.isPlatformAdmin`, never on a membership role.
`MembershipRole.ADMIN` only ever means "admin of one customer organization", and that
person must not see another company's demo request. `admin@flowerp.test` and
`platform@flowerp.test` are separate accounts for exactly this reason, and
`apps/web/e2e/leads-admin.spec.ts` asserts that a tenant admin gets a `403` from
`GET /leads` — not merely a hidden sidebar link.

Nothing in the product grants the flag: there is no UI, no endpoint, and no role that can
set it. That is deliberate — it cannot be escalated into.

**Bootstrapping it in production.** Register the staff account through the normal sign-up
flow (or invite it into an organization), then flip the flag once, by hand, against the
production database:

```sql
UPDATE users SET "isPlatformAdmin" = true WHERE email = 'you@yourcompany.com';
```

Revoking it is the same statement with `false`, and takes effect on that user's very next
request — `JwtStrategy` re-reads the flag from the database every time rather than trusting
the token.

## Everyday commands

Run these from the repository root.

```bash
npm run dev:api          # NestJS, watch mode          → :4000
npm run dev:web          # Vite dev server             → :3000

npm run typecheck        # tsc --noEmit, both apps
npm run lint             # eslint on apps/web — 0 errors

npm run test:api         # Jest unit tests
npm run test:e2e         # Playwright, needs both servers running (see below)

npm run build:web        # `npm run build` is an alias for this one
npm run build:api
```

Before opening a pull request, the full gate is:

```bash
npm run typecheck && npm run lint && npm run test:api && npm run build:web && npm run build:api
```

`npm run lint:api` exists but does not pass yet — see *Known gaps*.

## End-to-end tests

Playwright drives a real browser against the running dev servers, so **start `dev:api` and
`dev:web` first**. It signs in with the seeded accounts above, so run `seed:test-org` too.

```bash
cd apps/web
FRONTEND_URL=http://localhost:3000 npx playwright test
```

| Spec | Covers |
|---|---|
| `crud-audit.spec.ts` | create → read → update → archive for drivers, vehicles, customers |
| `order-dispatch-flow.spec.ts` | an order, then a dispatch, with every picker populated |
| `token-refresh.spec.ts` | an expired access token is refreshed, not signed out |
| `sign-in-flow.spec.ts` | a wrong password shows the real error; the reveal toggle works |
| `role-nav.spec.ts` | the sidebar matches each of the six roles' API permissions |
| `leads-admin.spec.ts` | only platform admins can read or triage leads |
| `demo-lead.spec.ts` | the landing form performs a real `POST /leads` |
| `notifications-panel.spec.ts` | the notification slide-over opens against real data |
| `shots.spec.ts` | screenshots a route list, for reviewing a change by eye |

Two things worth knowing:

- **`POST /auth/login` is throttled to 5 requests/minute per IP.** `role-nav` and
  `leads-admin` sign in as several accounts and back off on a `429`, which makes them slow
  against a dev API. CI runs the API with `NODE_ENV=test`, where the throttler is not
  registered at all. Every other spec shares one memoized login (`e2e/session.ts`).
- **The pages are server-rendered.** Markup arrives before React hydrates, so a click that
  lands in between does nothing. Specs wait for interactivity, not for visibility.

## Database

```bash
npm run prisma:migrate:deploy   # apply pending migrations (safe on an existing database)
npm run prisma:migrate          # author a new migration (development only)
npm run prisma:studio           # browse the data
npm run seed:test-org           # demo organization + the seven accounts above
```

Neither seed deletes anything. `seed:test-org` skips if **FlowERP Test Logistics** already
exists; `seed:development-company` adds a *second*, separate organization
(`admin@dev-test.local` / `DevTest@123!`), skips if it already exists, and refuses to run
under `NODE_ENV=production`. Both are additive — to start over, drop the rows yourself.

If `prisma migrate dev` ever offers to reset the database, **do not accept it.** That
means the datamodel and the database have drifted. Diagnose with:

```bash
cd apps/api
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

An empty result means they agree.

## Repository structure

```text
erp/
  apps/
    web/                 # Vite + TanStack frontend
      src/components/
        shared/          # the design system — page headers, tables states, badges, dialogs
        ui/              # shadcn primitives
      e2e/               # Playwright specs
    api/                 # NestJS + Prisma backend
      prisma/            # schema, migrations, seeds
      src/<module>/      # one folder per business module
  docs/                  # per-phase API contracts and design notes
  docker-compose.yml       # production stack (VPS)
  docker-compose.local.yml # local PostgreSQL + Traccar
  deploy/                  # Caddyfile, env template, monitoring
  scripts/                 # deploy, backup, rollback
```

`apps/web/src/components/shared/` is the design system. `status-badge.tsx` is the single
source of truth for how a domain status is coloured — reach for these rather than
hand-rolling a table or picking a colour, and never use raw `bg-gray-*` / `text-blue-*`
against this app's dark surfaces.

## Known gaps

These are deliberate and tracked, not oversights:

- **Rate limiting is in-memory.** Every API instance counts on its own, so running more
  than one behind a load balancer multiplies every limit — including the brute-force guard
  on `/auth/login`. A shared store (Redis) is required before scaling out.
- **There is no password-reset email.** No mail provider is configured, so
  `/auth/forgot-password` directs the user to an admin or to support rather than claiming
  an email was sent.
- **Tokens live in `sessionStorage`.** Closing the tab ends the session. This keeps a
  refresh token out of `localStorage`, where any injected script could read it.
- **`npm run lint:api` does not pass.** It reports ~127 pre-existing errors, mostly
  `no-unsafe-*` from `any` in `dispatches.service.ts`, and it also lints stale `.d.ts`
  build artifacts under `apps/api/test/`. `npm run lint` (the web app) is clean and is the
  one wired into the pull-request gate.
- **The AI Assistant is a placeholder.** It is planned as a separate read-only,
  role-scoped feature over the live ERP data.
