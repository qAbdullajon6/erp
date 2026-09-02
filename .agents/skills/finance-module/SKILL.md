---
name: finance-module
description: Owns Invoices, Payments, and Expenses (components/finance/*, routes/app.finance.tsx) — the accounting surface of FlowERP. Use for any invoice, payment, or expense list/detail/create work.
---

# Finance Module

## Purpose

Owns `components/finance/*`: `invoices-list.tsx`, `invoice-detail-sheet.tsx`,
`invoice-create-dialog.tsx`, `record-payment-dialog.tsx`, `expenses-list.tsx`,
`expense-create-dialog.tsx`, and the module's dashboard summary
(`finance-dashboard.tsx`, `finance-connected-view.tsx`). Readable by all five
membership roles (`FinanceController.ROLES` — see `nav-config.ts`'s read-role
comment block).

## When to Use

- Any change to invoice, payment, or expense screens.
- Anything touching money formatting, currency handling, or the finance
  dashboard summary.

## Responsibilities

- Money is always formatted through `lib/format.ts`'s `formatMoney` — never a
  raw template string with a currency symbol. Every finance screen must render
  amounts identically to every other screen that shows money (dashboard KPI
  cards, order totals, invoice line items).
- Invoices, payments, and expenses are related but distinct write paths — a
  payment records against an invoice via its own dialog/endpoint
  (`record-payment-dialog.tsx`), it does not mutate the invoice directly from
  the frontend.
- Detail views use a `Sheet` (`invoice-detail-sheet.tsx`) rather than a full
  page — keep that pattern for invoice detail; don't convert it to a route-level
  detail page without a deliberate UX decision, since the sheet pattern is
  already established here.
- Create flows use dialogs (`invoice-create-dialog.tsx`,
  `expense-create-dialog.tsx`) rather than dedicated create routes, unlike
  Orders/Customers/Drivers/Vehicles — this module's own established convention,
  keep it consistent within Finance rather than converting to match other
  modules.

## Workflow

1. For any amount displayed anywhere in Finance, use `formatMoney` — check
   `lib/format.ts` before writing a new formatter.
2. For a new payment/invoice/expense field, match the backend DTO's shape and
   validation before writing the dialog form.
3. Keep the invoice → payment relationship one-directional in the UI: opening
   "record payment" from an invoice, not the reverse.
4. Verify the finance dashboard summary numbers reconcile with the
   list/detail screens after any change — a mismatch here is the kind of bug
   users notice immediately (their money doesn't add up).

## Rules

- Never introduce a second money-formatting path.
- Never let a payment write bypass its own recording flow to "directly" patch
  an invoice's paid amount from elsewhere.
- Never show currency amounts without the currency itself, if the entity is
  multi-currency (check the DTO/response shape — don't assume single-currency).

## Best Practices

- Keep the Sheet/dialog patterns (not full-page routes) consistent across
  Finance's create/detail flows — that's this module's own convention,
  distinct from the list+detail+create-route pattern used elsewhere in the app.
- Reconcile the finance dashboard's summary figures against the detailed lists
  whenever either changes.

## Never Do

- Never round or reformat money in a way that could disagree with the
  backend's stored value — display precision must match source precision.
- Never bypass `record-payment-dialog.tsx`'s flow for a "quick" payment entry
  elsewhere.

## Checklist

- [ ] All money rendered via `formatMoney`.
- [ ] New fields match backend DTOs exactly.
- [ ] Sheet/dialog convention preserved for Finance's own create/detail flows.
- [ ] Dashboard summary reconciled against detail screens after the change.

## Expected Output

Finance-screen changes with consistent money formatting, DTO-matched
validation, and no invoice/payment write-path shortcuts.
