---
name: drivers-vehicles
description: Owns the fleet modules — Drivers and Vehicles (components/drivers/*, components/vehicles/*) — both gated to ADMIN/OPERATIONS_MANAGER/DISPATCHER only. Use for any driver or vehicle list/detail/create work, or fleet availability display.
---

# Drivers & Vehicles

## Purpose

Owns `components/drivers/*` and `components/vehicles/*` — the fleet-resource
modules consumed by [[dispatch-board]] for assignment/availability. Both are
gated to `FLEET_ROLES = [ADMIN, OPERATIONS_MANAGER, DISPATCHER]` in
`nav-config.ts`; ACCOUNTANT and SALES_CRM_MANAGER have no backend access to
either.

## When to Use

- Any change to the drivers or vehicles list/detail/create screens.
- Anything showing driver/vehicle availability or status outside the dispatch
  board itself (e.g. a fleet-status widget).

## Responsibilities

- Preserve the `FLEET_ROLES` gate exactly — this is one of the narrower role
  sets in the app; don't widen it to match the more common all-five-role
  pattern used by Orders/Customers/Finance/Reports.
- Vehicles previously had working routes/list/detail/create with **no nav
  entry linking to them at all** — a real bug this app already caught and
  fixed once. When adding any new fleet-adjacent screen, verify it's actually
  reachable from `nav-config.ts`, not just that the route exists.
- Driver/vehicle *availability* (busy/available/maintenance) is derived
  server-side from active Dispatch assignments (ADR-001 — see
  [[dispatch-board]]) — never compute "is this driver available" from a local
  join of cached queries.
- Keep detail pages (`drivers-detail.tsx`, `vehicles-detail.tsx`, both ~230
  lines) organized by real sections; extract before they grow into
  `orders-detail.tsx`-scale monoliths.

## Workflow

1. Confirm `DriversController`/`VehiclesController`'s role list before any nav
   or guard change — both currently match `FLEET_ROLES`, not the broader
   five-role set.
2. For a new fleet screen or entry point, explicitly check it's linked from
   `nav-config.ts` (or another real entry point) before calling the work done —
   an orphaned route is a shipped bug here, not hypothetical.
3. For availability/status display, fetch from the dispatch/availability
   endpoint rather than deriving it from separately-cached driver/vehicle lists
   — the two can be stale relative to each other.
4. Reuse [[component-architecture]]'s shared list/detail chrome.

## Rules

- Never grant Drivers/Vehicles nav visibility to ACCOUNTANT or
  SALES_CRM_MANAGER — the backend will 403 them.
- Never compute fleet availability client-side from cached list data — it must
  come from the same source [[dispatch-board]] uses.
- Never ship a new fleet route without confirming it's actually linked from
  somewhere a user can reach.

## Best Practices

- Cross-check any driver/vehicle status change against how the dispatch board
  represents the same resource — they must never disagree.
- Keep create-form validation matching the backend DTO (license info, vehicle
  capacity/type fields, etc.) exactly.

## Never Do

- Never let a driver/vehicle screen reimplement the assignment-eligibility
  logic that belongs to `AssignmentPolicy` (backend).
- Never add a fleet screen that's unreachable from any nav or link — verify
  reachability explicitly.

## Checklist

- [ ] `FLEET_ROLES` gate preserved on any nav/guard change.
- [ ] New screens confirmed reachable from `nav-config.ts` or another link.
- [ ] Availability data sourced from the dispatch/availability endpoint, not
      derived client-side.
- [ ] Detail pages kept decomposed as they grow.

## Expected Output

Fleet-module changes that preserve the `FLEET_ROLES` gate, stay reachable from
real navigation, and never diverge from the dispatch board's view of resource
availability.
