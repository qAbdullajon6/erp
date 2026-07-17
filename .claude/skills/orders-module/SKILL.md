---
name: orders-module
description: Owns the Orders module (components/orders/*, routes/app.orders.*) — the largest single screen in the app (orders-detail.tsx) and the entity whose status is a projection of Dispatch under ADR-001. Use for any order list/detail/create work.
---

# Orders Module

## Purpose

Owns `components/orders/*` (`orders-list.tsx`, `orders-detail.tsx` — the largest
component in the app at ~740 lines, `orders-create-form.tsx`) and the matching
routes (`app.orders.index.tsx`, `app.orders.$orderId.tsx`, `app.orders.create.tsx`).
Specializes [[crud-module-development]] with the one rule that makes Orders
different from every other entity: **an order's status is not independently
writable — it is a projection of its Dispatch**, per ADR-001 (see
[[dispatch-board]] for the full invariant).

## When to Use

- Any change to the orders list, detail page, or create form.
- Anything touching order status, assignment, or the order-dispatch relationship.

## Responsibilities

- Respect the projection relationship: order status changes flow through the
  dispatch/assignment path, not a direct `PATCH /orders/:id/status`-style write
  from a form. `OrdersService.assign` reaches the assignment rules through
  `AssignmentPolicy` (backend) — the frontend never computes eligibility itself.
- Keep `orders-detail.tsx` decomposed as it grows — at ~740 lines it is already
  the largest file in the app; new sections should become their own components
  under `components/orders/` rather than growing the single file further.
- Read-role parity: `OrdersController.READ_ROLES` includes all five roles
  (unlike Dispatches, which excludes `SALES_CRM_MANAGER`) — don't copy a
  narrower role list from a neighboring module by habit.
- List screen follows the standard shared-chrome pattern
  ([[component-architecture]]): `PageHeader`, `SortHeader` for sortable columns,
  `StatusBadge` for status cells, `list-states.tsx`, `PaginationBar`.

## Workflow

1. For anything touching order *status*: stop and check whether the change
   belongs in dispatch's transition policy instead — see [[dispatch-board]].
   An order screen should render status and history, not decide it.
2. For detail-page growth: when a section (e.g. a new "delivery proof" or
   "documents" panel) is added, extract it as
   `components/orders/order-<section>.tsx` rather than inlining more JSX into
   `orders-detail.tsx`.
3. For the create form: client-side validation must match
   `CreateOrderDto`'s validation exactly — check the DTO before writing a zod/
   yup schema from assumption.
4. For the list: reuse the existing filter/sort/pagination chrome; don't add a
   parallel table implementation.
5. Verify across roles — Orders is readable by all five roles, so a change here
   is seen by everyone; check at least ADMIN and one non-admin role (e.g.
   ACCOUNTANT or SALES_CRM_MANAGER).

## Rules

- Never write order status directly from a frontend form or a service method
  that bypasses the dispatch/assignment path.
- Never let `orders-detail.tsx` become the dumping ground for a new feature —
  extract a component once a section has its own clear responsibility.
- Never duplicate the assignment/capacity logic that already lives in
  `AssignmentPolicy` — the frontend consumes its result, never reimplements it.

## Best Practices

- When in doubt about whether an order/dispatch coupling is intentional, check
  `TECHNICAL_DEBT.md` first — several entries (TD-001/TD-002/TD-003/TD-005)
  document exactly this boundary and what went wrong before it was fixed.
- Keep the create form's field grouping matching the DTO's logical structure
  (pickup/delivery/cargo/pricing), not an arbitrary visual grouping.

## Never Do

- Never reintroduce a client-side "can this order be assigned" check — that's
  `AssignmentPolicy`'s job, server-side.
- Never let order and dispatch state diverge by writing one without the other.

## Checklist

- [ ] No direct order-status writes outside the dispatch/assignment path.
- [ ] `orders-detail.tsx` growth extracted into focused sub-components.
- [ ] Create-form validation matches the backend DTO.
- [ ] Verified across at least two roles.
- [ ] Shared list chrome reused, no parallel table implementation.

## Expected Output

Order-screen changes that never write status independently of Dispatch, keep
the detail page decomposed rather than monolithic, and match backend DTO
validation exactly.
