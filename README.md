## FlowERP AI

FlowERP AI is an intelligent logistics operations platform — a portfolio demo built by
IT Technology Group. It brings order management, dispatch, fleet, customer CRM, finance
and reporting into one workspace, plus a local AI Operations Assistant that answers
questions about the live data.

This is a **frontend-only demo**: there is no backend, database, or real authentication.
All data lives in your browser's `localStorage`.

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

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — this is the live ERP app.
The marketing landing page is at [http://localhost:3000/landing](http://localhost:3000/landing).

### Production build & deployment

```bash
npm run build
npm run start
```

Deploys cleanly to [Vercel](https://vercel.com) with no environment variables or database
required, since all persistence is client-side `localStorage`.

### What this demo is not

FlowERP AI's demo does not use a real external AI API, real GPS tracking, real
authentication, or production-grade security — these would be part of a production
deployment, not this portfolio demo.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
