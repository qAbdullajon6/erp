---
name: frontend-redesign
description: Leads full-screen or full-module visual/UX overhauls toward a premium enterprise SaaS look (Linear/Stripe/Vercel/Notion-tier), without touching business logic, APIs, or router architecture. Use for large, multi-file redesign efforts — not for a single small visual tweak (use ui-polish for that).
---

# Frontend Redesign

## Purpose

Coordinates large-scope visual/UX overhauls of FlowERP's frontend — a whole module
(Dashboard, Orders, Dispatch Board, CRM, Finance, Reports) or the shared app shell —
while strictly preserving business logic, API contracts, TanStack Router structure,
and data flow. This is the "big lever" skill; it plans and sequences work that
[[design-system]], [[component-architecture]], and the relevant module skill then
execute.

## When to Use

- A module or the app shell needs a genuine visual/UX overhaul, not a small fix.
- Multiple screens need to move to a new shared pattern at once (e.g. adopting a
  new DataTable primitive across list pages).
- The user asks for "redesign," "premium," "polish this whole module," or similar
  scope, as opposed to "fix this button" (→ [[ui-polish]]).

## Responsibilities

- Audit current state honestly before proposing changes — read the actual files,
  don't assume a screen is worse than it is. FlowERP's existing components are
  often already deliberate (oklch-validated chart colors, tone+icon pairing for
  accessibility, consistent skeleton states) — verify before rewriting.
- Scope work into phases (foundation → module by module), matching the project's
  own stated execution strategy: shell/nav/design-tokens first, then one module
  at a time, verifying nothing broke between phases.
- Preserve 100% of business logic: role-gating, ADR-001 dispatch invariants
  (see [[dispatch-board]]), projection rules, validation, and API contracts are
  off-limits. Only markup, styling, and pure-presentational structure change.

## Workflow

1. **Branch correctly.** Before starting, confirm which branch actually has the
   current, complete frontend — `origin/main` can lag a local feature branch by
   several unmerged commits. Diff branch tips (`git log --oneline A..B`) rather
   than assuming `main` is current. See [[git-workflow]].
2. **Audit first, with direct file reads** — not by trusting a prior summary.
   Re-verify file names, line counts, and component names by opening the actual
   files; a stale or hallucinated audit produces a plan for a codebase that
   doesn't exist.
3. **Propose a phased plan** and get sign-off before touching code if the change
   spans more than one module or restructures shared chrome (app shell, nav,
   command palette) — this is exactly the kind of large, hard-to-reverse change
   that warrants a plan document.
4. **Foundation phase**: design tokens ([[design-system]]), app shell/sidebar/
   topbar/breadcrumbs/command palette ([[component-architecture]]), any new
   shared primitive (e.g. a generic DataTable) — built once, adopted per module.
5. **Module phases**: one module per pass, using the relevant module skill
   ([[orders-module]], [[dispatch-board]], [[crm-module]], [[finance-module]],
   [[dashboard-development]], [[reports-analytics]], [[ai-assistant]]).
6. **Verify after each phase**: `npm run typecheck`, `npm run lint`, `npm run test`,
   a production `npm run build`, and — when a browser tool is available — an
   actual visual pass (sidebar collapse, mobile nav, command palette, spot-check
   pages). If no browser tool is available, say so explicitly rather than
   claiming visual verification that didn't happen.

## Rules

- Never touch `apps/api/*`, DTOs, or endpoint contracts for a "redesign" task.
- Never change TanStack Router file/route structure (renames, nesting) without
  an explicit, separate decision — redesigns restyle, they don't re-route.
- Never silently expand scope mid-phase; if a module turns out to need more work
  than planned, say so and let the user re-prioritize rather than quietly
  ballooning the change.
- Never claim a visual/browser verification that didn't actually happen.

## Best Practices

- Recalibrate scope honestly when the audit shows the code is already solid —
  a redesign that only touches the shell (nav/breadcrumbs/command palette)
  because the module components were already premium is a *better* outcome than
  a wasteful rewrite, not a failure to deliver.
- Sequence foundation before modules — a module redesign done before the shell
  lands gets redone once shared primitives change.
- Keep the plan file (if one exists) updated as scope is confirmed per phase,
  rather than re-litigating already-agreed decisions each turn.

## Never Do

- Never rewrite a component that's already following [[design-system]] and
  [[component-architecture]] conventions just to "look busier."
- Never mix a redesign phase with an unrelated feature/bugfix commit.
- Never proceed past a phase with failing typecheck/lint/tests.

## Checklist

- [ ] Correct branch/base confirmed as current before starting.
- [ ] Audit done against real files, not assumptions or stale reports.
- [ ] Scope and phase order confirmed with the user for multi-module work.
- [ ] No business logic, API, or routing changes in the diff.
- [ ] Typecheck/lint/tests/build all pass after each phase.
- [ ] Visual verification done, or explicitly flagged as not possible.

## Expected Output

Per phase: a scoped diff touching only presentation-layer files, a short list of
what changed and why, and a clear statement of what the next phase covers.
