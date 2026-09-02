---
name: reports-analytics
description: Owns the Reports module (components/reports/*, routes/app.reports.tsx) — executive overview, financial, and operations tabs with date-range filtering and CSV export. Use for any reporting/analytics screen work.
---

# Reports & Analytics

## Purpose

Owns `components/reports/*`: `reports-view.tsx` (tab shell), `executive-overview-tab.tsx`,
`financial-tab.tsx`, `operations-tab.tsx`, `date-range-filter.tsx`,
`export-csv-button.tsx`. Readable by all five membership roles
(`ReportsController.ROLES`). This is the app's read-only analytics surface —
it displays aggregates, it does not mutate anything.

## When to Use

- Any change to a reports tab, its charts/tables, or the date-range filter.
- Adding a new report/export, or changing what a CSV export contains.

## Responsibilities

- Reports are strictly read-only against the backend's reporting endpoints —
  never a place to add a mutation shortcut "since we're already looking at
  the data."
- Date-range filtering (`date-range-filter.tsx`) is the shared control across
  all three tabs — a new tab must reuse it, not invent a second date picker.
- CSV export (`export-csv-button.tsx`) must export exactly what's on screen
  for the current filter state — never a silently different dataset (e.g. a
  wider date range than what's displayed).
- Chart colors and tooltip treatment follow the same [[design-system]] tokens
  and `lib/chart-theme.ts` conventions as [[dashboard-development]] — Reports
  and Dashboard should look like the same product, not two different styles
  of chart.

## Workflow

1. For a new metric/tab: confirm the backend reporting endpoint already
   provides it (`apps/api/src/reports/*`) — this module never computes
   aggregates client-side from raw list data; that's the backend's job
   (`reports.service.ts`, `csv.util.ts`).
2. For chart work: reuse `lib/chart-theme.ts` and `components/ui/chart.tsx`
   rather than restyling per-tab.
3. For export changes: verify the exported CSV matches the current
   `date-range-filter.tsx` selection and any other active filter — test with a
   non-default range, not just the default.
4. Keep the three tabs (`executive-overview`, `financial`, `operations`)
   visually and structurally consistent — a user switching tabs shouldn't feel
   like they left the app.

## Rules

- Never add a write/mutation action inside Reports.
- Never compute an aggregate figure client-side that the backend already
  computes — a mismatch between a report's number and the same number shown
  elsewhere (e.g. the dashboard) is a serious trust bug in a reporting product.
- Never let CSV export silently diverge from the on-screen filtered view.

## Best Practices

- Cross-check a report figure against the equivalent dashboard KPI when both
  exist — they should reconcile exactly for the same period.
- Prefer the same chart tooltip/legend treatment as [[dashboard-development]]
  for a consistent product feel.

## Never Do

- Never introduce a second date-range-filter implementation.
- Never let a report silently show stale data without a loading/error state
  from `list-states.tsx`.

## Checklist

- [ ] Reports remain strictly read-only.
- [ ] New metrics sourced from backend reporting endpoints, not computed
      client-side.
- [ ] Date-range filter reused across tabs.
- [ ] CSV export matches the current on-screen filter state.
- [ ] Chart styling consistent with [[dashboard-development]].

## Expected Output

Reporting changes that stay strictly read-only, reuse the shared date-range and
chart-theme conventions, and keep exports faithful to the displayed filter
state.
