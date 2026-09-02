---
name: dashboard-development
description: Builds and maintains the Command Center dashboard (apps/web/src/routes/app.index.tsx and components/dashboard/*) — KPI cards, charts, recent-orders/delayed-deliveries panels, and the driver-specific summary view. Use for any dashboard-screen work.
---

# Dashboard Development

## Purpose

Owns `routes/app.index.tsx` and `components/dashboard/*`: the operations
dashboard (`KpiCards`, `RevenueChart`, `DeliveryStatusChart`, `RecentOrdersTable`,
`DelayedDeliveries`, `DriverFleetStatus`) and the separate driver-role summary
(`DriverDashboardSummary`). Data comes from `useDashboardData` in
`lib/api/dashboard.ts` — this skill never changes that contract.

## When to Use

- Adding, removing, or restyling a dashboard card/chart/panel.
- Changing the dashboard's layout/grid.
- Adjusting the driver-vs-operations split (`DashboardPage` branches on
  `currentUser.membership.role === "DRIVER"`).

## Responsibilities

- Keep the role split intact: `DRIVER` sees only `DriverDashboardSummary`;
  everyone else sees `OperationsDashboard`, which itself gates fleet data
  (`FLEET_VISIBLE_ROLES = ADMIN/OPERATIONS_MANAGER/DISPATCHER/ACCOUNTANT`) because
  `SALES_CRM_MANAGER` has no backend access to `DispatchController.board()`.
- Keep every card/chart driving its own `loading` boolean from `useDashboardData`
  and rendering the shared `Skeleton` (`components/ui/skeleton.tsx`) — not a
  hand-rolled `animate-pulse` div.
- Keep chart colors on the validated tokens: `--series-revenue`/`--series-expenses`
  for the revenue/expense area chart (never `--success`/`--warning`, which are
  reserved status colors), and route recharts through `lib/chart-theme.ts` +
  `components/ui/chart.tsx` (`ChartContainer`/`ChartTooltip`/`ChartTooltipContent`)
  for a consistent tooltip instead of a hand-rolled `contentStyle`.
- Keep status-driven visuals paired with an icon, not color alone — see
  `TONE_STYLES` in `kpi-cards.tsx` (good/warning/neutral, each with both a text
  color and a `LucideIcon`).

## Workflow

1. Read the real files before changing them — `components/dashboard/*` is small
   (~530 lines total across 7 files); don't assume structure from memory or a
   prior summary.
2. For a new metric/panel: add the data to `useDashboardData`'s return shape only
   if the backend already serves it (`ExecutiveOverviewTotals` et al. in
   `lib/api/dashboard.ts`) — never invent client-side numbers.
3. For chart work: reuse `chart-theme.ts`'s `revenueExpensesChartConfig`/
   `chartAxisTickStyle` rather than re-declaring tick styles per chart.
4. For a new card: match the existing gradient-card treatment
   (`rounded-2xl border border-brand/10 bg-gradient-to-br from-surface
   to-surface/50`, hover elevation) rather than a flat card — this is the
   dashboard's established visual signature.
5. Verify both roles: sign in (or check) as a DRIVER and as an ADMIN/OPS role to
   confirm neither branch regressed.

## Rules

- Never call an endpoint a role can't reach (check the controller's `@Roles(...)`
  before adding a fetch — see [[auth-authorization]]).
- Never invent a trend/delta figure the backend doesn't provide.
- Never duplicate the gradient-card/skeleton/tone-icon patterns — extend the
  existing components, don't fork a parallel style.

## Best Practices

- Keep chart tooltips formatted with `lib/format.ts`'s `formatMoney`/
  `formatRelativeTime`, matching the rest of the app.
- Prefer `mt-auto` footer pinning (as `DeliveryStatusChart` does) when two cards
  in a stretch grid need to end on the same baseline, rather than fixed heights.
- Keep the "Recent orders" / "Delayed deliveries" link-outs (`Link to="/app/orders"`
  etc.) pointing at the real list routes, not a dead end.

## Never Do

- Never fetch fleet/board data for a role that 403s on it.
- Never replace the tone+icon accessibility pattern with color-only signaling.
- Never introduce a second charting library alongside recharts.

## Checklist

- [ ] Both DRIVER and operations-role views checked.
- [ ] Fleet-gated data only fetched for `FLEET_VISIBLE_ROLES`.
- [ ] Loading states use shared `Skeleton`, not ad-hoc pulses.
- [ ] Chart colors from validated tokens, tooltips via `ui/chart.tsx`.
- [ ] Typecheck/lint/tests/build clean.

## Expected Output

Dashboard changes confined to `routes/app.index.tsx` and `components/dashboard/*`
(plus `lib/chart-theme.ts` for shared chart styling), with no changes to
`lib/api/dashboard.ts`'s data contract unless the backend genuinely added a field.
