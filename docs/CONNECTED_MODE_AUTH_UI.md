# Connected Mode: Authentication + Organization Onboarding UI

This documents the frontend UI added on top of [Auth + Organization
Onboarding](AUTH_ONBOARDING.md) and [Customers API + Connected
Mode](CUSTOMERS_API.md): real `/auth/*` pages, an app-shell "Connected
Workspace" state, and `/settings/organization` + `/settings/members` admin
pages. **The live demo is unaffected**: everything here is inert unless
`NEXT_PUBLIC_DATA_MODE=api` is set, and even then only Customers and these
new settings pages talk to `apps/api` — every other module keeps running on
`localStorage`, and the demo role switcher is completely untouched.

## Local startup

```bash
# 1. Backend (see BACKEND_FOUNDATION.md / AUTH_ONBOARDING.md)
docker compose -f docker-compose.local.yml up -d
cp apps/api/.env.example apps/api/.env   # set a real JWT_ACCESS_SECRET
npm run prisma:migrate
npm run dev:api                          # http://localhost:4000

# 2. Frontend, in Connected Mode
cd apps/web
NEXT_PUBLIC_DATA_MODE=api npm run dev    # http://localhost:3000
```

Then either:
- Visit `http://localhost:3000/auth/register` and create an organization
  through the real UI, or
- Register via curl as before (see CUSTOMERS_API.md) and sign in at
  `/auth/login`.

Visiting any Connected Mode page while signed out (`/customers`,
`/settings/organization`, `/settings/members`) redirects you to
`/auth/login?redirect=<page>` and brings you back after signing in.

## API mode vs. demo mode

`NEXT_PUBLIC_DATA_MODE` (`apps/web/.env.local`) still controls everything, as
established in the Customers API phase:

- **`demo` (default, and always true on the deployed Vercel site)**: every
  page — including `/customers` — runs on `localStorage` exactly as before.
  `/auth/*` and `/settings/*` pages still render (nothing 404s), but any
  attempt to actually call the API immediately fails with a clear "Connected
  Mode is disabled in this environment" message, since `isApiEnabled()`
  returns `false`. Nothing changes about the demo shell, sidebar, role
  switcher, or any existing module in this mode.
- **`api`**: `/customers`, `/settings/organization`, and
  `/settings/members` load and mutate data through the real API and require a
  real signed-in session. The app shell gains a **"Connected Workspace"**
  control in the topbar (separate from the sidebar's "Demo Data" badge) and,
  when signed in, a "Connected Workspace" section in the sidebar nav linking
  to the two settings pages. Every other module (Orders, Dispatch, Drivers,
  Finance, Reports, Notifications, AI Assistant, My Deliveries, Dashboard)
  shows a small dashed-border notice — *"This module is running on local
  demo data... Connected Mode currently only covers Customers"* — so nobody
  mistakes demo numbers for live ones while Connected Mode is active.

## Routes and roles

| Route | Shell | Auth required | Notes |
| --- | --- | --- | --- |
| `/auth/login` | standalone (no sidebar) | no | email/password/org-slug, remember-me, redirects to `?redirect=` or `/customers` |
| `/auth/register` | standalone | no | first/last name, email, password×2, org name → auto-login → `/customers` |
| `/auth/forgot-password` | standalone | no | honest "email delivery not configured" state, never fakes sending |
| `/auth/reset-password` | standalone | no | placeholder only — no backend reset-token endpoint exists |
| `/auth/logout` | standalone | no | performs logout, redirects to `/auth/login` |
| `/customers` (API mode) | app shell | **yes** | any authenticated member (read is allowed for every role except DRIVER, per the Customers API's own RBAC) |
| `/settings/organization` | app shell | **yes, ADMIN only** | non-admins see a professional "you don't have access" state, not a broken page |
| `/settings/members` | app shell | **yes, ADMIN only** | same |

Route protection is implemented once, in
`components/layout/protected-api-route.tsx` (`ProtectedApiRoute`), used by
`/customers`'s API-mode branch and both settings pages:

1. In demo mode, it renders a small "this page is part of Connected Mode"
   notice instead of its children — nothing crashes if you navigate here
   directly with `NEXT_PUBLIC_DATA_MODE` unset.
2. In API mode, while the session is still being restored (see "Session
   restore on load" below) it shows a brief loading state.
3. Once resolved, if there's no session it redirects to
   `/auth/login?redirect=<current path>`.
4. If a `requireRole` prop is given (used by both settings pages, `["ADMIN"]`)
   and the signed-in membership's role isn't in that list, it renders
   `ApiAccessRestricted` instead of the page content.

`(app)/layout.tsx`'s `RouteGuard` (the demo role switcher's page-visibility
check) explicitly skips any path starting with `/settings` — those pages are
governed by the real API session's role, not the demo role, and are
deliberately absent from every demo role's `roleAllowedPaths`.

## Authentication / session strategy

Uses the existing backend token design from AUTH_ONBOARDING.md unchanged —
no new API endpoints were added this phase. What's new is how the frontend
holds onto the tokens (`apps/web/src/lib/api-session.ts`):

- **Access token: in-memory only.** It lives in a private field on a
  module-level singleton store instance — plain JavaScript memory, gone the
  instant the tab is closed or the page is hard-reloaded. It is **never**
  written to `localStorage`, `sessionStorage`, or a cookie.
- **Refresh token: in-memory always; persisted to `localStorage` only if
  "Remember me" was checked at sign-in.** With "Remember me" off, the
  refresh token still works for the rest of that tab's lifetime (silent
  refresh-on-401, logout-revoke, etc. all still work), it just isn't
  written anywhere durable — closing the tab or reloading the page requires
  signing in again. With it on, `flowerp:api-session:v1` in `localStorage`
  holds `{ refreshToken, user, organization, membership }` (never the access
  token), isolated from the demo's `flowerp:data:v5` and `flowerp:role:v2`
  keys and from the Customers phase's now-removed developer-only session
  shape.
- **Why not httpOnly cookies?** That's the textbook production answer, but
  it needs backend work this phase didn't do: a `Set-Cookie` on
  login/register/refresh, `refresh` reading the cookie instead of a request
  body, `SameSite`/CSRF handling, and a cookie-parser middleware. Given the
  explicit instruction to reuse the existing token strategy and keep this
  phase small, the in-memory-access-token + optionally-persisted-refresh-
  token design above was chosen as the safer *local-development* middle
  ground: it never puts the more powerful, short-lived access token at rest
  anywhere, and it makes the weaker, longer-lived refresh token's
  persistence an explicit user choice. **This is not a production-grade
  posture** — a real deployment should move to httpOnly, `SameSite=Lax`
  (or stricter) cookies with CSRF protection on state-changing requests.
- **Session restore on load**: `useApiSession()`'s `initializing` flag is
  `true` from first use until a one-time silent refresh attempt resolves.
  If a "remembered" refresh token exists in `localStorage`, it's redeemed
  via `POST /auth/refresh` to mint a fresh access token (and rotate the
  refresh token, per the backend's single-use design) before any protected
  page renders its real content. If it's missing, expired, or revoked, this
  just resolves to signed-out — no error is shown, the user just sees the
  sign-in redirect.
- **401 retry-once**: all authenticated calls in Connected Mode components
  go through `useApiSession().callApi(fn)` rather than calling `apiClient`
  directly with a token. `callApi` runs `fn` with the current access token;
  if it fails with an `ApiRequestError` whose `status` is 401, it attempts
  exactly one silent refresh and retries `fn` once with the new token. If
  that refresh also fails, the session is cleared and the *original* 401 is
  rethrown, so the calling component can show a "session expired, sign in
  again" state instead of a confusing generic error.
- **Logout / logout-all**: both clear local state immediately (so the UI
  reacts instantly) and then best-effort call the real
  `POST /auth/logout` / `POST /auth/logout-all` endpoints to revoke the
  server-side refresh token(s); a failed revoke call never blocks the local
  sign-out.
- **No token is ever used in demo mode**: `apiClient`'s `request()` throws
  `ApiDisabledError` immediately unless `isApiEnabled()` is true (which
  requires `NEXT_PUBLIC_DATA_MODE=api`), so even if a session were
  hypothetically restored, no demo-mode page ever attempts an API call.

## Organization and member management

`/settings/organization` (ADMIN only): view/edit name, timezone
(free-text, e.g. `Asia/Tashkent`), and default currency (3-letter code);
slug and status are shown read-only, matching the backend's
`UpdateOrganizationDto` which doesn't allow editing either (slug changes
need collision handling, status changes are a bigger administrative action
— both explicitly out of scope, per AUTH_ONBOARDING.md).

`/settings/members` (ADMIN only): a table of every membership (name, email,
role, status) with an inline role-change dropdown and a Remove button per
row, plus an "Add member" form (email + role). **This only attaches an
existing FlowERP AI account** — the backend's `POST
/organizations/current/members` looks up the user by email and 404s if none
exists; there is no invite-by-email flow, no temporary-password account
creation, and no email is ever sent. The form says so explicitly. If someone
needs adding who doesn't have an account yet, they (or an admin on their
behalf) must register one first at `/auth/register`, then get added here.
Removing/demoting the organization's last active ADMIN is rejected by the
backend (409) and surfaces as an inline error, not a silent failure.

## Limitations of local development

- **No httpOnly cookies** — see the session-strategy section above. The
  refresh token, when "remembered," sits in `localStorage`, readable by any
  script running on the page (XSS risk). Acceptable for a local demo;
  not acceptable for production as-is.
- **No CSRF protection** — irrelevant while tokens travel only via
  `Authorization` headers (never cookies), but would need addressing
  alongside any future move to cookie-based sessions.
- **No account-recovery email** — `/auth/forgot-password` and
  `/auth/reset-password` are honest placeholders, not functional flows.
- **No organization-switcher UI** — a user with multiple memberships still
  has to log out and log back in with a different `organizationSlug` (the
  optional field on the login form) to change which org they're acting as,
  matching the "one session = one organization" design from
  AUTH_ONBOARDING.md.
- **No frontend test runner** — `apps/web` still has no Jest/Vitest/RTL
  setup (this has been true since the project's very first phase). Adding
  one was judged out of scope for this phase's "small, verifiable" goal.
  The pure-logic pieces (`src/lib/auth-validation.ts`) were deliberately
  written as small, dependency-free functions specifically so they're easy
  to unit-test the moment a runner exists. See "Manual test scenarios"
  below for what was actually exercised this phase.
- **Customers Connected Mode UI is still minimal** (list, search, create) —
  unchanged from the prior phase; this phase focused on auth/session/
  org-settings, not expanding Customers feature parity.

## Manual test scenarios

Exercised by hand against a local Docker Postgres + `apps/api` +
`NEXT_PUBLIC_DATA_MODE=api npm run dev` (no automated frontend test runner
exists yet — see above):

1. **Register → auto-login → redirect**: fill out `/auth/register`, submit;
   lands on `/customers` already signed in, with the org just created.
2. **Login, remember-me on**: sign out, sign back in with "Remember me"
   checked; hard-reload the page — still signed in (silent refresh
   restored the session from the persisted refresh token).
3. **Login, remember-me off**: sign out, sign back in with "Remember me"
   unchecked; hard-reload the page — signed out, redirected to
   `/auth/login` (nothing was persisted).
4. **Protected-route redirect and return**: while signed out, navigate
   directly to `/customers`; redirected to
   `/auth/login?redirect=%2Fcustomers`; after signing in, lands back on
   `/customers`, not some default page.
5. **Invalid credentials**: wrong password on `/auth/login` shows "Invalid
   email or password", not a generic/blank error.
6. **Connection error**: stop `apps/api`, attempt to sign in; shows "Could
   not reach the API at http://localhost:4000. Is apps/api running?",
   visibly distinct from an invalid-credentials message.
7. **Demo mode is unaffected**: with `NEXT_PUBLIC_DATA_MODE` unset (or
   `demo`), `/customers` renders the original localStorage
   `CustomersView`, no Connected Workspace control appears in the topbar,
   no "Demo data" banners appear anywhere, and the demo role switcher works
   exactly as before.
8. **Settings, admin**: sign in as the org's ADMIN (the registering user),
   visit `/settings/organization`, change the name/timezone/currency, save
   — reload the page, changes persisted. Visit `/settings/members`, add an
   existing second user by email with a non-admin role, change their role,
   then remove them.
9. **Settings, non-admin**: add a member with a non-ADMIN role, sign in as
   that member, visit `/settings/organization` — sees the professional
   "you don't have access to this page" state, not a crash or blank screen.
10. **Last-admin protection surfaces in the UI**: as the sole admin, try to
    change your own role away from ADMIN (or remove yourself) — the
    backend's 409 shows up as an inline error on that row, the change does
    not silently succeed.
11. **Session-expired path**: manually revoke a session (e.g. via
    `logout-all` from another tab) then perform an action in the first tab
    — `callApi`'s refresh-and-retry fails, the session is cleared, and the
    Customers page shows the "Your session has expired" state with a
    working "Sign in again" button.

## What remains intentionally deferred

- httpOnly-cookie token storage and CSRF protection (production hardening).
- Real password-reset-by-email and account-invitation-by-email flows (both
  need email delivery, which doesn't exist in this project at all yet).
- An organization-switcher UI (log in again with a different org slug is
  the current workaround).
- Any frontend automated test coverage (no test runner is installed).
- Connected Mode for any module besides Customers.
