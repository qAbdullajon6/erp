---
name: api-integration
description: Wires the frontend to the NestJS API — TanStack Query hooks in apps/web/src/lib/api/*, error handling, cache invalidation, and typed contracts. Use when adding/changing a data fetch, mutation, or the way a screen consumes backend data.
---

# API Integration

## Purpose

Owns the boundary between frontend and backend: `apps/web/src/lib/api/*` (typed
fetchers + TanStack Query hooks) and how components consume them. Never changes
what the backend does — only how the frontend talks to it.

## When to Use

- Adding a new query or mutation hook.
- Debugging a loading/error/stale-cache issue.
- Wiring a new screen to existing or new backend endpoints.

## Responsibilities

- One file per module in `lib/api/` (`dashboard.ts`, `orders.ts`, `finance.ts`,
  `organizations.ts`, `notifications.ts`, ...), exporting typed response
  interfaces and hooks (`useCurrentUser`, `useDashboardData`, etc.).
- Correct TanStack Query usage: sensible `queryKey` structure, `staleTime`/
  `gcTime` where it matters, and mutation `onSuccess`/`invalidate()` wired to the
  right query keys (see `lib/api/invalidate.ts` for the shared invalidation
  helper and its test coverage in `invalidate.test.ts`).
- Correct error surfacing: use the existing `describe-error.ts` conventions
  (e.g. the retry policy that does NOT retry a 409 but DOES retry a 500 — see
  `describe-error.test.ts`) rather than a per-hook ad-hoc error message.
- Respect role-based reachability: a hook must not be called for a role whose
  backend guard would 403 it (see [[auth-authorization]]) — gate the call at the
  component level (`enabled: someRoleCheck` in the query options), not just the UI.

## Workflow

1. Check `lib/api/invalidate.ts` and `lib/api/describe-error.ts` before writing
   new error-handling or cache-invalidation logic — these are shared, tested
   utilities, not per-module reinventions.
2. Define the response type from the actual backend DTO/controller response
   shape — don't guess a shape and hope it matches.
3. Write the hook with an explicit `queryKey` that includes every parameter the
   query depends on (pagination, filters, org context) so the cache can't
   silently serve stale data for different params.
4. For mutations, invalidate exactly the query keys affected — over-invalidating
   causes unnecessary refetch storms, under-invalidating leaves stale UI.
5. Gate role-sensitive queries with `enabled:` rather than letting them fire and
   fail — a 403 in the network tab for a role that should never see the request
   is a bug, not an acceptable side effect.

## Rules

- Never call an endpoint the current role's controller guard would reject —
  check `@Roles(...)` server-side before wiring the hook.
- Never bypass TanStack Query for ad-hoc `useEffect` + `fetch` — consistency in
  caching/retry/error behavior across the app depends on going through the
  established hook pattern.
- Never invalidate the entire query cache (`queryClient.invalidateQueries()`
  with no key) when a scoped invalidation would do.

## Best Practices

- Keep response interfaces exported from the same file as the hook that uses
  them, so a component importing `useDashboardData` also gets
  `ExecutiveOverviewTotals` etc. from one place.
- Prefer `select` on `useQuery` to shape data for a specific component rather
  than duplicating a shaping function in the component.
- Test retry/error-classification logic (as `describe-error.test.ts` already
  does) rather than trusting it by inspection — a 409-vs-500 retry bug is easy
  to introduce silently.

## Never Do

- Never fetch org-scoped or role-scoped data without confirming which roles the
  backend actually serves it to.
- Never duplicate the shared `invalidate`/`describe-error` logic per module.
- Never let a mutation's optimistic update diverge from what the server
  actually confirms — see [[dispatch-board]] for why (drag is visually
  optimistic only; the real state comes from `invalidate()` after the server
  responds).

## Checklist

- [ ] Query key includes every param the result depends on.
- [ ] Role-sensitive queries gated with `enabled`, matching backend guards.
- [ ] Mutations invalidate exactly the affected keys.
- [ ] Error handling goes through the shared `describe-error` conventions.
- [ ] New/changed hooks covered by a test where behavior is non-obvious
      (retry policy, invalidation scope).

## Expected Output

Typed, tested API hooks in `lib/api/*` that components consume directly, with
no parallel fetch logic, no over/under-invalidation, and no role-mismatched
requests.
