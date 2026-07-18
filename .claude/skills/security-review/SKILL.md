---
name: security-review-standards
description: FlowERP-specific security checklist layered on the general /security-review command — role-guard integrity, tenant/org data isolation, auth token handling, and injection risks specific to this stack. Use alongside /security-review for a FlowERP diff.
---

# Security Review (FlowERP Standards)

## Purpose

Complements the built-in `/security-review` command with checks specific to
this app's architecture: multi-tenant org isolation, role-guard integrity, and
the specific places this codebase already had to get security right (auth,
invitations, platform-admin boundaries).

## When to Use

- Reviewing any change touching auth, guards, org-scoped queries, or
  file uploads.
- Before merging any change to `apps/api/src/auth/*`, `invitations/*`,
  `organizations/*`, or any controller's `@Roles`/`@UseGuards`.

## Responsibilities

- **Org isolation**: every query for org-scoped data (orders, dispatches,
  customers, drivers, vehicles, finance) must filter by the authenticated
  user's organization — never trust an org ID from client input where the
  JWT-derived org is available.
- **Role guard integrity**: every protected controller uses
  `@UseGuards(JwtAuthGuard, RolesGuard)` plus `@Roles(...)` — a missing guard
  on a new endpoint is a direct data-exposure bug, not a style issue. See
  [[auth-authorization]].
- **Platform-admin boundary**: `PlatformAdminGuard`-protected surfaces (e.g.
  Leads) must never be reachable by a regular org role, even indirectly
  through a less-guarded endpoint that happens to return the same data.
- **Password/token handling**: argon2id hashing (`password.service.ts`) and JWT
  verification must never be weakened, logged in plaintext, or bypassed for
  debugging convenience.
- **Injection/validation**: every DTO uses `class-validator`; never accept
  unvalidated input into a Prisma query, especially raw SQL (`$queryRaw`)
  paths if any exist — parameterize, never string-interpolate.

## Workflow

1. Run `/security-review` first for general OWASP-class issues.
2. Then check org-scoping explicitly on every changed query: does it filter by
   the authenticated user's org, or could a crafted request read another
   org's data?
3. Check every new/changed endpoint has both `@UseGuards` and `@Roles`, and
   that the role list is a named constant matching the module's convention.
4. Check any file upload/download path (e.g. delivery proofs, documents) for
   path traversal and org-scoping on storage keys, if such a feature exists.
5. Check that no secret (API key, JWT secret, DB credential) is logged,
   returned in an error response, or committed to a `.env.example` with a real
   value.

## Rules

- Never trust a client-supplied org/tenant identifier over the JWT-derived one.
- Never add an endpoint without both `JwtAuthGuard`/`RolesGuard` and a
  `@Roles(...)` list, unless it's deliberately public (e.g. sign-in) — and
  that exception must be explicit, not accidental.
- Never log a password, token, or full JWT.
- Never weaken CORS, helmet, or rate-limiting config to "make testing easier"
  in a change that ships.

## Best Practices

- When adding a new org-scoped table, verify every query path (list, detail,
  update, delete) filters by org — a detail-by-ID endpoint that skips the org
  filter is a classic IDOR (insecure direct object reference) bug.
- Prefer the existing named guard/role-constant conventions over a new
  one-off check.

## Never Do

- Never disable a guard "temporarily" in committed code.
- Never expose stack traces or internal error detail to the client in
  production error responses.
- Never accept a security shortcut for developer convenience once code is
  destined to merge.

## Checklist

- [ ] Every changed/new query filters by the authenticated org, not a
      client-supplied one.
- [ ] Every new endpoint has `JwtAuthGuard`/`RolesGuard` + `@Roles(...)`,
      or is deliberately and explicitly public.
- [ ] No secrets logged or returned in responses.
- [ ] File upload/download paths (if touched) checked for traversal and
      org-scoping.
- [ ] `/security-review` general pass also run.

## Expected Output

A findings list (or clean bill) specifically covering org isolation, guard
integrity, and secret handling, on top of whatever `/security-review`'s
general pass found.
