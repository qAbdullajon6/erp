## FlowERP AI

FlowERP AI is an intelligent logistics operations platform — a portfolio demo built by
IT Technology Group. It brings order management, dispatch, fleet, customer CRM, finance
and reporting into one workspace, plus a local AI Operations Assistant that answers
questions about the live data.

The live demo (`apps/web`) is still entirely **frontend-only**: no backend, database, or
real authentication — all of its data lives in your browser's `localStorage`, exactly as
before. A production backend foundation (`apps/api`) now exists alongside it, but nothing
has been migrated to it yet — the demo does not call it.

### Repository structure

This repository is an npm-workspaces monorepo:

```text
erp/
  apps/
    web/          # the Next.js frontend — still fully localStorage-based, unchanged behavior
    api/          # NestJS + Prisma + PostgreSQL backend foundation (not yet used by apps/web)
  packages/
    ui/           # placeholder — no shared components yet
    types/        # placeholder — no shared types yet
  docs/
    DEMO_SCRIPT.md
    MONOREPO_MIGRATION.md
    BACKEND_FOUNDATION.md
    AUTH_ONBOARDING.md
  docker-compose.yml   # local PostgreSQL only, for apps/api development
  package.json         # workspace root — forwards scripts to apps/web and apps/api
  README.md
```

See [`docs/MONOREPO_MIGRATION.md`](docs/MONOREPO_MIGRATION.md) for how the repo was
restructured, and [`docs/BACKEND_FOUNDATION.md`](docs/BACKEND_FOUNDATION.md) for the
backend's setup, environment variables, and tenant-isolation rules.

### Main modules

- **Dashboard** — today's orders, active deliveries, revenue trend, fleet status
- **Orders** — full order lifecycle from Draft to Delivered/Cancelled
- **Dispatch Board** — assign drivers and vehicles with capacity/availability checks
- **Drivers & Vehicles** — fleet roster, status, maintenance and license expiry
- **Customers / CRM** — profiles, credit limits, order history, activity timeline
- **Finance** — invoices, payments, expense approvals, order profitability
- **Reports** — Executive Overview, Operations and Financial reporting tabs
- **Notifications** — a derived, rule-based alert center
- **AI Operations Assistant** — a local, deterministic Q&A engine over the live ERP data (no external AI API)
- **My Deliveries** — the Driver role's restricted delivery checklist
- **Landing page** (`/landing`) — the public marketing page for the product

### Demo roles

Use the role switcher in the topbar to preview six demo identities: **Admin/Owner**,
**Operations Manager**, **Dispatcher**, **Accountant**, **Driver** and **Sales/CRM Manager**.
Each role has its own allowed pages and gated actions — this is a **UI permission preview
for demo purposes only**, not real authorization.

### How the demo data works

All ERP data (orders, drivers, vehicles, customers, invoices, expenses) and your selected
role are persisted to `localStorage` in your browser — nothing is sent to a server. This
means your changes (assigning a driver, recording a payment, switching roles) persist
across page reloads, but only on that browser/device.

### Resetting the demo

Open **Demo Guide** in the topbar and use **Reset demo data** (with confirmation) to erase
all local changes and restore the original seeded data and the Admin role. This is also
useful before starting a fresh live demo.

### Development

Run all commands from the repository root — npm workspaces forwards them to `apps/web`:

```bash
npm install
npm run dev          # start the dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

Open [http://localhost:3000](http://localhost:3000) — this is the live ERP app.
The marketing landing page is at [http://localhost:3000/landing](http://localhost:3000/landing).

### Production build & deployment

```bash
npm run build
npm run start
```

Deploys cleanly to [Vercel](https://vercel.com) with no environment variables or database
required, since all persistence is client-side `localStorage`. Because the app now lives in
`apps/web`, the Vercel project's **Root Directory** setting must be `apps/web`, not `.`.

### Backend foundation (apps/api)

A NestJS + PostgreSQL + Prisma backend foundation lives in `apps/api` — organizations,
users, memberships (with roles mirroring the frontend's demo roles), an audit log
foundation, and health endpoints. Full setup instructions (Docker Compose for local
Postgres, environment variables, migration/seed commands, tenant-isolation rules, and
what's intentionally not implemented yet) are in
[`docs/BACKEND_FOUNDATION.md`](docs/BACKEND_FOUNDATION.md).

```bash
docker compose up -d          # start local PostgreSQL
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate        # apply migrations
npm run dev:api                # http://localhost:4000
```

### Auth + organizations (apps/api)

Real email/password auth (Argon2 hashing, JWT access tokens, rotating refresh tokens) and
organization/membership management now run on top of that foundation — registration
creates a User, an Organization, and an ADMIN Membership together; role-based guards
enforce admin-only actions, cross-organization isolation, and last-admin protection. None
of this is wired up to the frontend yet — the live demo is untouched. Endpoint contracts,
the token/refresh strategy, and security notes are in
[`docs/AUTH_ONBOARDING.md`](docs/AUTH_ONBOARDING.md).

### What this demo is not

FlowERP AI's live demo does not use a real external AI API, real GPS tracking, real
authentication, or production-grade security — these would be part of a production
deployment, not this portfolio demo. `apps/api` now has a real, tested auth and
organization API, but it is not connected to the demo, and no ERP business data has been
migrated to it.

---

The `apps/web` frontend is a [Next.js](https://nextjs.org) project originally bootstrapped
with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app),
using [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
to load the Geist font family.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
