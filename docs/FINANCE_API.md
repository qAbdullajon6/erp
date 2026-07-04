# Finance API

Invoices, Payments, and Expenses now exist as real, tested, multi-tenant APIs in
`apps/api`, continuing the pattern started by Customers and Orders + Dispatch. Connected
Mode's `/finance` page now loads/mutates this real data too.

**Product direction note:** this project is moving from a permanent demo to a real
product. The localStorage demo (Reports, Notifications, AI Assistant, and Finance's own
demo view) stays in place until each module has a real Connected Mode equivalent —
removing it is a deliberate future step, not part of this phase. In API mode, Customers,
Orders, Dispatch, Drivers, Vehicles, and now Finance are already real and stay that way.

## Migration

`20260704004516_add_finance_invoices_payments_expenses` — adds `Invoice`,
`InvoiceLineItem`, `Payment`, `Expense` plus the `InvoiceStatus`, `PaymentMethod`,
`ExpenseCategory`, `ExpenseStatus` enums, and a hand-written partial unique index
(`invoices_active_order_unique` on `orders."orderId"` where `status != 'CANCELLED'`) —
Prisma's schema DSL can't express a partial/conditional unique constraint directly, so
this was added by editing the generated `migration.sql` before applying it. Every table
carries `organizationId`; every query in every service is scoped by it.

## Data model

- **Invoice**: `invoiceNumber` (unique per organization, auto-generated
  `INV-<year>-0001`-style or set explicitly), `customerId`, `orderId` nullable, `status`
  (see below), `subtotal`/`discountAmount`/`taxAmount`/`totalAmount`/`paidAmount`/
  `balanceDue` — all always server-computed, never trusted from client input (the create/
  update DTOs don't even have fields for the computed ones; the global `ValidationPipe`'s
  `forbidNonWhitelisted` rejects a request that tries to include them, 400). No delete
  route — cancellation is the only removal-adjacent action.
- **InvoiceLineItem**: `lineTotal` is always `quantity * unitPrice`, computed
  server-side.
- **Payment**: append-only — there is no update/delete route for payments in this phase
  (see "Known limitations"). Recording one atomically updates its invoice's `paidAmount`/
  `balanceDue`/`status` in a single Prisma transaction.
- **Expense**: `expenseNumber` (same auto-generate pattern), starts `PENDING`, optionally
  linked to an `orderId`/`vehicleId`/`driverId`. No delete route — editing is blocked
  once a decision (`APPROVED`/`REJECTED`) is made.

## Business rules

- **Invoice creation**: manual (`POST /invoices`, any customer, optional `orderId`) or
  from a delivered order (`POST /invoices/from-order/:orderId`, which requires
  `status: DELIVERED` and prefills customer/currency/a single line item from the order's
  price). If a manual invoice's body also includes an `orderId`, the same eligibility
  check applies — the invariant "at most one non-cancelled invoice per order" holds
  regardless of which endpoint created it, backed by both an application-level check and
  the partial unique DB index (closing the check-then-create race window).
- **Totals are always server-side**: `subtotal` = sum of line items' `quantity *
  unitPrice`; `totalAmount` = `subtotal - discountAmount + taxAmount`; `balanceDue` =
  `totalAmount - paidAmount`. Editing (`PATCH /invoices/:id`, DRAFT-only) recomputes all
  of this from whatever the resulting line items/discount/tax are — if `lineItems` is
  omitted, the existing stored line items are kept and only discount/tax changes shift
  the totals.
- **Payments**: `amount` must be positive and cannot exceed the invoice's current
  `balanceDue` (400 otherwise — "prevention," not a soft warning). Rejected entirely on a
  `DRAFT` or `CANCELLED` invoice (409 — send it first). Payment `currency` must match the
  invoice's currency exactly — there's no cross-currency conversion in this phase (400 on
  mismatch). Recording one is always atomic: `Payment` create + `Invoice` paidAmount/
  balanceDue/status update happen in one `$transaction`, never as two separate writes
  that could leave the invoice inconsistent if one failed.
- **Invoice status**: `DRAFT → SENT` (`POST /invoices/:id/send`, DRAFT-only).
  `SENT`/`PARTIALLY_PAID` → `PAID` happens automatically the instant a payment brings
  `balanceDue` to zero. `SENT`/`PARTIALLY_PAID` → `OVERDUE` is **computed lazily**: there
  is no cron job in this phase, so an overdue invoice only actually flips to `OVERDUE` in
  the database the next time it's read (`GET /invoices`, `GET /invoices/:id`, or
  `GET /finance/summary`, all of which run the same recompute first) or the next time a
  payment is recorded against it (which re-derives the correct post-payment status
  independently, using the invoice's real `dueDate` rather than trusting a possibly-stale
  stored status). `status` is never accepted as client input anywhere — not on `PATCH`,
  not anywhere else.
- **Cancellation** (`POST /invoices/:id/cancel`): allowed from any status except `PAID`
  or already `CANCELLED`. Cancelling an order-linked invoice immediately frees that order
  for a new invoice (the partial unique index only applies to non-cancelled rows).
- **Expenses**: always start `PENDING`. Only `ADMIN`/`ACCOUNTANT` can approve or reject
  (`POST /expenses/:id/approve` / `/reject`), and only from `PENDING` (409 on a
  re-decision attempt — approve/reject is one-shot in this phase, no appeals flow).
  Editing (`PATCH /expenses/:id`) is likewise blocked once decided.
- **Profitability**: `GET /finance/order-profitability/:orderId` returns `revenue`
  (the order's agreed `price`), `approvedExpenses` (sum of that order's `APPROVED`
  expenses only — `PENDING`/`REJECTED` never count), and `estimatedGrossProfit`
  (`revenue - approvedExpenses`). This is a **different revenue basis** than
  `GET /finance/summary`'s org-wide `estimatedGrossProfit`, which uses actual collected
  payments (`totalCollected - approvedExpensesTotal` org-wide) rather than agreed order
  prices — both are documented inline in `FinanceService` so this isn't accidentally
  "fixed" into inconsistency later.
- **Audit logging**: every invoice/payment/expense create, update, send, cancel,
  approve, and reject action writes an `AuditLog` row, same append-only table used
  everywhere else.
- **No permanent delete routes** anywhere in this module. Cancellation (invoices) and
  the approve/reject decision (expenses) are the only removal-adjacent actions; payments
  have no removal-adjacent action at all in this phase (see "Known limitations").

## Endpoints and roles

| Role | Invoices (read) | Invoices (create/update) | Invoices (send/cancel) | Payments (read) | Payments (record) | Expenses (read) | Expenses (create/update) | Expenses (approve/reject) | `/finance/*` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ACCOUNTANT | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| OPERATIONS_MANAGER | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | ✓ |
| SALES_CRM_MANAGER | ✓ | ✓ | — | ✓ | — | — | — | — | ✓ |
| DISPATCHER | — | — | — | — | — | — | — | — | ✓ (summary + profitability only) |
| DRIVER | — | — | — | — | — | — | — | — | — |

This is a literal reading of the phase spec's own wording, documented here so it isn't
re-litigated later:
- **OPERATIONS_MANAGER**: "read finance + create draft invoice... but cannot approve
  expenses" — read+create+update on invoices (editing a DRAFT before finalization is
  implied by being able to create one), but send/cancel (a finalization decision) and
  recording payments are read as Accounting-only, since neither is mentioned in Ops'
  scope. Ops *can* create/read expenses (the "cannot approve" phrasing implies otherwise
  having some expense interaction), just not decide them.
- **SALES_CRM_MANAGER**: "create/read draft invoices only, no payment/expense approval"
  — same read+create+update scope as Ops on invoices (also excluded from send/cancel/
  payments), and **zero** expense access at all (not just no approval) — expenses aren't
  a sales-facing concern, consistent with Sales having no Drivers/Vehicles access either
  (see [ORDERS_DISPATCH_API.md](ORDERS_DISPATCH_API.md)).
- **DISPATCHER**: "read-only finance summary only; no payment/expense actions" — this is
  read literally: Dispatcher's *entire* finance access is `GET /finance/summary` and
  `GET /finance/order-profitability/:orderId` (both coarse, read-only aggregates); it
  cannot see the raw invoice/payment/expense lists at all.
- **DRIVER**: no finance access anywhere, per every other module's precedent.

### Endpoints

| Endpoint | Notes |
| --- | --- |
| `GET /invoices` | search/filter (`status`, `customerId`, `orderId`, issue-date range)/sort/pagination |
| `POST /invoices` | manual creation; `orderId` optional, validated the same way as `from-order` if given |
| `POST /invoices/from-order/:orderId` | order must be DELIVERED and have no other active invoice |
| `GET /invoices/:id` | includes `lineItems` and `payments` (list items don't) |
| `PATCH /invoices/:id` | DRAFT-only; `lineItems` fully replaces existing ones if given |
| `POST /invoices/:id/send` | DRAFT → SENT |
| `POST /invoices/:id/cancel` | blocked once PAID or already CANCELLED |
| `GET /invoices/:id/payments` | payments for one invoice |
| `POST /invoices/:id/payments` | records a payment; body `{ amount, method, paymentDate?, currency?, reference?, notes? }` |
| `GET /payments` | all payments across the organization; filter by `invoiceId`/`method`/date range |
| `GET /expenses` | search/filter (`status`, `category`, `orderId`/`vehicleId`/`driverId`, date range)/sort/pagination |
| `POST /expenses` | starts PENDING |
| `GET /expenses/:id` | |
| `PATCH /expenses/:id` | PENDING-only |
| `POST /expenses/:id/approve` | PENDING-only, ADMIN/ACCOUNTANT only |
| `POST /expenses/:id/reject` | PENDING-only, ADMIN/ACCOUNTANT only, body `{ rejectionReason? }` |
| `GET /finance/summary` | org-wide invoice/expense aggregates + estimated gross profit |
| `GET /finance/order-profitability/:orderId` | per-order revenue/approved-expenses/estimated-gross-profit |

## Frontend Connected Mode

`NEXT_PUBLIC_DATA_MODE=api` now additionally activates `/finance`, structured as the
same four tabs as the demo view (Dashboard, Invoices, Payments, Expenses) so the layout
stays familiar, but every number on it is real:

- **Dashboard tab**: the `GET /finance/summary` cards (no fake KPIs — a brand-new
  organization simply shows zeroes, not invented sample data).
- **Invoices tab**: list + search, a minimal "Create Invoice" form (active customers
  only, one line item), and per-row actions gated by the signed-in role: Send (DRAFT →
  SENT), Record Payment (a small dialog, amount capped at the balance due client-side —
  the API is still the real enforcement point), Cancel. Non-finalizing roles
  (OPERATIONS_MANAGER, SALES_CRM_MANAGER) see the list and create form but not the
  Send/Record Payment/Cancel actions, matching what the API would 403 on anyway.
- **Payments tab**: a read-only list (`GET /payments`) — recording always happens from
  an invoice's row, matching the real workflow (a payment only ever makes sense in the
  context of the invoice it's paying down).
- **Expenses tab**: list, a minimal "Create Expense" form (role-gated), and Approve/
  Reject actions shown only for ADMIN/ACCOUNTANT.
- **Permission-denied is a distinct state** from a network/loading error: a 403 from the
  API renders "You don't have access to this" rather than a generic failure message —
  this is how DISPATCHER's Invoices/Payments/Expenses tabs render (only the Dashboard tab
  works for them), and how OPERATIONS_MANAGER/SALES_CRM_MANAGER would see it if they
  somehow reached an approve/reject/send action.
- Every section has its own loading/empty/error-with-retry state, following the same
  pattern established for Customers/Orders/Dispatch.
- Finance in API mode never reads or writes the demo's `localStorage` finance data, and
  the demo `/finance` page itself is completely unchanged in demo mode.

## Test organization seed

`npm run seed:test-org` (see [ORDERS_DISPATCH_API.md](ORDERS_DISPATCH_API.md) for the
full command/organization details) now also creates, all clearly labelled:

- **5 invoices** covering every status: `PAID` (linked to the seeded DELIVERED order,
  with a matching payment), `PARTIALLY_PAID` (with one partial payment), `OVERDUE` (due
  date in the past, unpaid), `DRAFT` (still editable), `CANCELLED`.
- **2 payments**, one against the `PAID` invoice and one against the `PARTIALLY_PAID`
  one.
- **5 expenses** covering both categories of decision: 2 `APPROVED` (one linked to the
  DELIVERED order, so `GET /finance/order-profitability/:orderId` has something real to
  compute), 2 `PENDING` (awaiting a decision — one order-linked, one not), 1 `REJECTED`.

Resetting only the test organization (never touches a real one, since everything is
scoped by `organizationId`):

```sql
DELETE FROM organizations WHERE slug = 'flowerp-test-logistics';
DELETE FROM users WHERE email LIKE '%@flowerp.test';
```

then `npm run seed:test-org` again. The script refuses to run if the test organization
still exists, rather than silently duplicating it.

## Known limitations

- **No payment correction/reversal flow.** There is no update or delete route for
  `Payment` in this phase — a mis-recorded payment needs a distinct credit-note/reversal
  design (a new `Payment` with a negative-adjustment semantic, or a dedicated reversal
  entity), which is real accounting complexity deferred past this foundation phase.
- **No cross-currency payments.** A payment's `currency` must exactly match its
  invoice's; there's no FX-rate lookup or conversion anywhere in this system.
- **Overdue status is lazy, not real-time.** An invoice becomes `OVERDUE` in the database
  the next time it (or the org's summary) is read or paid against — not the instant its
  `dueDate` passes. No cron/scheduled job exists in this phase to do it proactively.
- **`estimatedGrossProfit` is a coarse signal, not real accounting** — no COGS modeling,
  no overhead allocation, no tax treatment. It exists to give a directional financial
  read, not to replace a bookkeeper.
- **The Connected Mode Finance UI has no order-profitability widget yet** — the endpoint
  is fully implemented and tested (`GET /finance/order-profitability/:orderId`), just not
  surfaced in this phase's minimal frontend.
