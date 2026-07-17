---
name: component-architecture
description: Governs how frontend code is organized into routes, feature components, and shared primitives — file placement, prop contracts, and reuse boundaries. Use when adding a new component, deciding where code should live, or reviewing whether something should be extracted/shared.
---

# Component Architecture

## Purpose

FlowERP's frontend (`apps/web/src`) follows a strict three-layer structure:
`routes/` (TanStack Router file-based routes — thin), `components/<module>/*`
(feature components — the real logic), and `components/shared/` + `components/ui/`
(cross-module reuse). This skill decides which layer new code belongs in and keeps
the layers from bleeding into each other.

## When to Use

- Adding any new component and deciding where the file goes.
- Deciding whether a piece of UI should be extracted into `shared/`.
- Reviewing a PR for misplaced logic (business logic in a route file, a one-off
  component duplicated across modules).

## Responsibilities

- Keep `routes/*.tsx` thin: a route file defines `Route = createFileRoute(...)`
  with `head()`/`component`, and the component body does session/role gating and
  data-hook wiring, then renders from `components/<module>/*`. Compare
  `routes/app.orders.index.tsx` (16 lines) against `components/orders/orders-list.tsx`
  (the real implementation) — that ratio is the target for every module.
- Keep `components/<module>/*` focused on one module's screens and own no
  cross-module state.
- Keep `components/shared/*` for conventions every module list/detail screen reuses:
  `PageHeader`, `ListToolbar`, `list-states.tsx` (`LoadingState`/`ErrorState`/
  `EmptyState`), `PaginationBar`, `SortHeader`, `StatusBadge`, `ConfirmDialog`,
  `DetailField`, `FormAlert`/`FormField`. A new list screen should reach for these
  before inventing its own loading/empty/error treatment.
- Keep `components/ui/*` for [[design-system]] primitives only — never feature logic.
- Keep `components/layout/*` for app-shell chrome (`app-shell.tsx`, `app-sidebar.tsx`,
  `topbar.tsx`, `nav-config.ts`, `command-palette.tsx`) — this is the one place
  role-based navigation visibility is computed; it must stay in sync with each
  controller's `@Roles(...)` list (see [[auth-authorization]]).

## Workflow

1. Before writing a component, check `components/shared/*` and `components/ui/*`
   for something that already does this — three similar lines beat a premature
   abstraction, but a fourth copy of a loading spinner does not.
2. Decide the layer: does this render one module's data (→ `components/<module>/`),
   or is it a convention every list/detail screen needs (→ `components/shared/`),
   or is it a pure design primitive with no business meaning (→ `components/ui/`)?
3. Name and type props narrowly — see `SortHeader<TField extends string>` in
   `shared/sort-header.tsx` for the pattern of keeping a generic field union
   per-module instead of widening to `string`.
4. Wire the route file last: import the real component, pass only what session/
   auth/router context provides (current user, params), and let the component
   own its own data fetching via [[api-integration]] hooks.

## Rules

- A route file (`routes/*.tsx`) never contains a `<Table>`, a chart, or a form —
  only composition and guards.
- A component never imports another module's component directly (e.g.
  `components/orders/*` must not import from `components/finance/*`); shared
  needs go through `components/shared/`.
- Every list screen uses `PageHeader` + `list-states.tsx` + `PaginationBar` —
  don't hand-roll a new loading/empty pattern per module.
- Role-gated UI must mirror the backend's `@Roles(...)` list exactly (see the
  role-source comments in `nav-config.ts`) — a link a role can't use is worse
  than no link.

## Best Practices

- Prefer composition (`children`, render props) over configuration objects when
  a component has more than 2-3 visual variants.
- Keep one component per file, named after the file.
- Co-locate a component's tiny helper types in the same file unless reused
  elsewhere; promote to a shared `types.ts` only on the second real use.

## Never Do

- Never duplicate `list-states.tsx`/`PageHeader`/`PaginationBar` logic per module.
- Never let a `components/ui/*` primitive import from `components/<module>/*` —
  the dependency direction is one-way (ui → shared → module → route).
- Never introduce a global mutable store for something that belongs in
  [[api-integration]]'s query cache.

## Checklist

- [ ] New code placed in the correct layer (route / module / shared / ui).
- [ ] Reused an existing shared primitive instead of duplicating one.
- [ ] Route file stayed thin — no business logic or markup beyond composition.
- [ ] Role-gated visibility matches the backend guard exactly.
- [ ] No cross-module component imports introduced.

## Expected Output

New or moved files that keep the route/module/shared/ui boundaries intact, with
any newly-shared logic promoted to `components/shared/` (not left duplicated)
and a one-line note on why something was placed where it was, if non-obvious.
