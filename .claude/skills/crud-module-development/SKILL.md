---
name: crud-module-development
description: The template for building a new list+detail+create module end to end (route files, list/detail components, API hooks, NestJS controller/service/DTOs). Use when adding a new entity module, or as the reference pattern other module skills specialize.
---

# CRUD Module Development

## Purpose

FlowERP's entity modules (Orders, Customers, Drivers, Vehicles, Leads, Expenses,
Invoices...) all follow the same shape on both sides of the stack. This skill is
the generic template; [[orders-module]], [[crm-module]], [[drivers-vehicles]],
and [[finance-module]] specialize it with entity-specific rules.

## When to Use

- Adding a brand-new entity module (list + detail + create, API + UI).
- Reviewing whether an existing module deviates from the established shape.

## Responsibilities

- Frontend: `routes/app.<module>.index.tsx` (list, thin) → `components/<module>/
  <module>-list.tsx` (real list); `routes/app.<module>.$id.tsx` → `<module>-detail.tsx`;
  `routes/app.<module>.create.tsx` → `<module>-create-form.tsx`.
- Backend: `<module>.controller.ts` (`@UseGuards(JwtAuthGuard, RolesGuard)` at
  class level, `@Roles(...)` per endpoint), `<module>.service.ts` (business logic
  + Prisma), DTOs for create/update validated with `class-validator`.
- Both sides share one truth for who can do what — the frontend's role gate
  ([[auth-authorization]]) must mirror the controller's `@Roles()` list exactly.

## Workflow

1. **Backend first**: define the Prisma model (if new — see [[database-migrations]]),
   the controller's role lists (typically `READ_ROLES` broader than
   `CREATE_UPDATE_ROLES`/`OPERATIONAL_ROLES`, matching the existing modules'
   convention), the service methods, and DTOs.
2. **API hook layer**: add typed fetchers/hooks in `lib/api/<module>.ts` using
   TanStack Query — see [[api-integration]] for the query-key and mutation
   conventions.
3. **List screen**: compose `PageHeader` + `ListToolbar`/filter controls +
   a table (using `components/ui/table.tsx` primitives, `SortHeader` for sortable
   columns, `StatusBadge` for status cells) + `list-states.tsx` for loading/
   empty/error + `PaginationBar`. See [[component-architecture]].
4. **Detail screen**: `DetailField` for label/value pairs, section grouping that
   matches the entity's real structure — don't invent a generic "detail viewer."
5. **Create form**: `react-hook-form` + `@hookform/resolvers` zod/yup schema
   matching the backend DTO's validation exactly (client validation is UX, the
   DTO is the source of truth), `FormField`/`FormAlert` from `components/shared`.
6. **Nav + roles**: add the module to `components/layout/nav-config.ts`'s
   `DEFAULT_NAV` (or `DRIVER_NAV`) with the exact same role list as the
   controller's read guard, plus the read-role source comment convention already
   used there.

## Rules

- The frontend must never show a link to a screen the current role's backend
  guard would 403 on.
- Every create/update form's client validation must be a subset of (never looser
  than) the backend DTO's validation — the backend is the enforcement boundary.
- List and detail screens use the shared chrome components; don't hand-roll
  pagination, loading, or empty states.

## Best Practices

- Keep the list screen's sortable-field union narrow and typed (see
  `SortHeader<TField extends string>`), not a bare `string`.
- Name query keys consistently (`['<module>', 'list', params]`,
  `['<module>', 'detail', id]`) so cache invalidation on mutation is predictable.
- Reuse `ConfirmDialog` for any destructive action (cancel, delete, deactivate).

## Never Do

- Never skip the DTO validation layer because "the frontend already validates it."
- Never add a nav entry without a matching backend role check.
- Never build a new generic list/detail scaffold when the existing shared
  components already cover the need.

## Checklist

- [ ] Prisma model + migration in place (if new entity).
- [ ] Controller role guards defined and mirrored exactly in `nav-config.ts`.
- [ ] API hooks added via [[api-integration]] conventions.
- [ ] List/detail/create screens use shared chrome components.
- [ ] Client validation matches backend DTO validation.
- [ ] Typecheck/lint/tests pass on both `apps/web` and `apps/api`.

## Expected Output

A complete, working module (route files, components, API hooks, controller,
service, DTOs) that looks and behaves consistently with every other CRUD module
in the app, with roles enforced identically on both tiers.
