---
name: auth-authorization
description: Owns authentication (JWT sessions, invitations, onboarding) and role-based authorization (MembershipRole guards) across API and frontend. Use for anything touching login, sessions, invitations, or who-can-see/do-what.
---

# Authentication & Authorization

## Purpose

Owns the full auth surface: `apps/api/src/auth/*` (JWT strategy, guards, password
handling), the invitation/onboarding flow (`apps/api/src/invitations/*`, staff
invite + accept flow), and role-based visibility on the frontend
(`components/layout/nav-config.ts`, per-screen role checks). This is one of the
highest-blast-radius areas in the app — a mistake here is a security bug, not a
cosmetic one.

## When to Use

- Adding a new protected endpoint or changing who can call an existing one.
- Adding a new role, or changing a role's permissions.
- Working on login, sign-out, password reset, email verification, or the
  invitation/onboarding flow.
- Adding a new nav entry or screen that needs role gating.

## Responsibilities

- Backend: every protected controller uses `@UseGuards(JwtAuthGuard, RolesGuard)`
  at the class level and `@Roles(...ROLE_LIST)` per endpoint, drawing from named
  role-list constants (`READ_ROLES`, `CREATE_UPDATE_ROLES`, `OPERATIONAL_ROLES`,
  etc.) — never an inline role array duplicated per endpoint.
- Platform-staff-only surfaces (e.g. marketing leads) use `PlatformAdminGuard` in
  addition to the role guard — this is enforced server-side; hiding the nav
  link is a courtesy, never the control.
- Frontend: `nav-config.ts`'s `getNavForRole(role, isPlatformAdmin)` must mirror
  every controller's actual role list — kept honest via the read-role-source
  comments already in that file (one line per module naming which controller's
  role list it mirrors).
- DRIVER is a genuinely different nav (`DRIVER_NAV`), not the default nav with
  items hidden — a DRIVER's backend access is a hard subset (Overview, My
  Deliveries, Settings), not a filtered view of the admin nav.

## Workflow

1. When adding a new protected endpoint: pick (or extend) the correct named role
   constant, don't write a fresh inline array — check the module's existing
   `*_ROLES` constants first.
2. When adding a new nav-visible screen: add the guard server-side first, then
   mirror the exact same role list (plus `platformAdminOnly` if relevant) in
   `nav-config.ts`, with a comment naming the controller/method it mirrors.
3. For session/login work: `sessionManager` (`lib/api/auth.ts`) is the single
   source of truth for "is there a valid session" — `AppRoute`'s guard
   (`routes/app.tsx`) calls `sessionManager.hasValidSession()` and redirects to
   `/auth/sign-in` on failure; don't add a second session check elsewhere.
4. For invitations/onboarding: the accept flow (`invite.$token.tsx`,
   `invite.$token_.accept.tsx`) is the only path that creates a membership from
   an invite — direct member-add was deprecated in favor of this (see recent
   `refactor(organizations)` history) precisely to keep one onboarding path.
5. Verify by checking as more than one role — a role-gating change that "works"
   for ADMIN and breaks for ACCOUNTANT is the common failure mode.

## Rules

- Never grant a frontend nav link to a role the backend would 403.
- Never duplicate a role-list constant inline — extend or reuse the named one.
- Never bypass `RolesGuard`/`JwtAuthGuard` for convenience, even temporarily.
- Never store tokens/session data anywhere but the established `sessionManager`
  mechanism — no ad-hoc `localStorage` reads elsewhere.
- Never weaken password hashing (argon2id) or JWT verification for debugging.

## Best Practices

- Keep the role-source comment block in `nav-config.ts` up to date whenever a
  controller's role list changes — it's the map a future reviewer trusts.
- Prefer one invitation/onboarding path over parallel "quick add" shortcuts —
  this app has already made that call once (member-add deprecation); don't
  reopen it without a deliberate decision.
- Log auth failures usefully (which guard rejected, not just "403") without
  leaking sensitive detail to the client response.

## Never Do

- Never accept a role or permission claim from the client without server-side
  verification.
- Never add a "bypass guard for platform admin" shortcut that isn't
  `PlatformAdminGuard` itself.
- Never let a redesign or refactor touch guard logic "while I'm in the file."

## Checklist

- [ ] New/changed endpoint uses a named role constant, not an inline array.
- [ ] Frontend nav visibility mirrors the backend guard exactly, with a
      role-source comment.
- [ ] Platform-admin-only surfaces use `PlatformAdminGuard`, not just a
      `isPlatformAdmin` UI check.
- [ ] Tested as more than one role.
- [ ] No session/token handling outside `sessionManager`.

## Expected Output

Auth/authorization changes with matching guards on both tiers, named role
constants (no inline duplication), and verification across at least two
different roles.
