---
name: crm-module
description: Owns Customers and Leads (components/customers/*, components/leads/*) — customer relationship screens and marketing-site lead intake. Use for any customer or lead list/detail/create work.
---

# CRM Module

## Purpose

Owns `components/customers/*` (`customers-list.tsx`, `customer-detail.tsx`,
`customer-create-form.tsx`) and `components/leads/*` (`leads-list.tsx`).
Specializes [[crud-module-development]]. Customers and Leads are related but
distinct: Customers are an organization's own contacts (readable by all five
membership roles); Leads are marketing-site demo requests belonging to FlowERP
itself, visible only to platform admins (`platformAdminOnly: true` in
`nav-config.ts`), not to any `MembershipRole`.

## When to Use

- Any change to the customer list, detail, or create screens.
- Any change to the leads list or lead-handling flow.

## Responsibilities

- Keep the Customers/Leads role boundary intact: Customers use the standard
  `MembershipRole` guard (all five roles read); Leads use
  `platformAdminOnly`, checked via `currentUser.user.isPlatformAdmin`, layered
  on top of — never instead of — the backend's own admin guard.
- `customer-detail.tsx` (~430 lines) should stay organized by real sections
  (contact info, order history, notes) — extract a section into its own
  component before the file balloons further, following the same discipline as
  [[orders-module]]'s handling of `orders-detail.tsx`.
- Customer create/detail forms validate against the backend's customer DTO —
  never invent client-only fields.

## Workflow

1. For customer work: confirm `CustomersController.READ_ROLES` before assuming
   a role can or can't see a screen — Customers is one of the modules readable
   by all five roles (unlike Dispatches or fleet screens).
2. For lead work: remember Leads are not organization data — there is no
   `MembershipRole` that grants access; only `isPlatformAdmin` does. Don't
   accidentally gate a leads screen with a regular role array.
3. For a new customer-detail section (e.g. an activity timeline or notes
   panel): extract it as its own component under `components/customers/`
   rather than inlining it into `customer-detail.tsx`.
4. Reuse [[component-architecture]]'s shared chrome for both list screens.

## Rules

- Never gate a Leads screen with a `MembershipRole` array — it must go through
  `platformAdminOnly`.
- Never let a customer's order/dispatch history be computed client-side —
  fetch it from the backend, don't reconstruct it from other cached queries.
- Never add fields to a create form that the backend DTO doesn't validate.

## Best Practices

- Keep customer and lead list screens visually consistent with every other
  module's list (PageHeader/SortHeader/StatusBadge/list-states/PaginationBar)
  even though their audiences (org staff vs. platform admin) differ.
- When a customer's detail page needs order-history data, fetch it through
  [[api-integration]]'s established hook pattern, scoped to that customer.

## Never Do

- Never conflate a Lead (FlowERP's own marketing intake) with a Customer (an
  organization's contact) — they are different entities with different
  ownership and access models, even though both look like "contacts."
- Never expose lead data (contact details of prospects) to non-platform-admin
  roles.

## Checklist

- [ ] Customers screens gated by `MembershipRole`, Leads by `platformAdminOnly`.
- [ ] `customer-detail.tsx` growth extracted into sub-components.
- [ ] Create-form fields match the backend DTO exactly.
- [ ] Shared list chrome reused.

## Expected Output

Customer/Lead screen changes that respect the org-data vs. platform-data
boundary, keep detail pages decomposed, and match backend validation exactly.
