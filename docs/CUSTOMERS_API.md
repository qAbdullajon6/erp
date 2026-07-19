# Customers API + Connected Mode

The first ERP business module (Customers) now exists as a real, tested, multi-tenant
API in `apps/api`, alongside a small opt-in "Connected Mode" in `apps/web` that can load
and mutate Customers data through that API instead of `localStorage`. **The live demo is
unaffected**: Connected Mode is off by default everywhere, and even when enabled it only
ever applies to the Customers page — every other module keeps using the localStorage
demo, and the demo role switcher is untouched.

See [CONNECTED_MODE_AUTH_UI.md](CONNECTED_MODE_AUTH_UI.md) for the real `/auth/*` sign-in
UI, session/token strategy, and `/settings/organization` + `/settings/members` admin pages
that now sit in front of this module.

## API contracts

All responses use the standard envelope: `{ "data": ... }` on success,
`{ "error": { "statusCode", "message" } }` on failure (see
[BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md)). Every endpoint requires
`Authorization: Bearer <accessToken>` (see [AUTH_ONBOARDING.md](AUTH_ONBOARDING.md)) and is
always scoped to the token's organization — there is no way to pass an organization id from
the client, and a record id from a different organization always returns 404.

| Endpoint | Roles | Notes |
| --- | --- | --- |
| `GET /customers` | ADMIN, SALES_CRM_MANAGER, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT | list, see query params below |
| `POST /customers` | ADMIN, SALES_CRM_MANAGER | create |
| `GET /customers/:id` | ADMIN, SALES_CRM_MANAGER, OPERATIONS_MANAGER, DISPATCHER, ACCOUNTANT | |
| `PATCH /customers/:id` | ADMIN, SALES_CRM_MANAGER | partial update; rejected (409) if the customer is archived |
| `POST /customers/:id/archive` | ADMIN, SALES_CRM_MANAGER | soft-archive; 409 if already archived |
| `POST /customers/:id/restore` | ADMIN, SALES_CRM_MANAGER | 409 if not archived |

`DRIVER` has no access to any of these — every route 403s for that role. **There is no
delete endpoint of any kind** — archiving is the only removal-adjacent action, and it's
always reversible via restore.

### List query parameters (`GET /customers`)

| Param | Type | Notes |
| --- | --- | --- |
| `page` | integer ≥ 1 | default 1 |
| `limit` | integer 1–100 | default 20 |
| `search` | string | matches `customerCode`, `companyName`, `contactName`, `email`, `phone`, `city` (case-insensitive) |
| `status` | `ACTIVE\|AT_RISK\|INACTIVE\|ARCHIVED` | exact match |
| `includeArchived` | boolean | default `false` — archived customers are excluded from the default list; available to any role with read access, not just write roles |
| `sortBy` | `customerCode\|companyName\|createdAt\|updatedAt\|creditLimit\|status` | allowlisted — anything else is a 400, not silently ignored |
| `sortOrder` | `asc\|desc` | default `desc` |

**`hasOverdueBalance` is intentionally not a filter.** Customer has no relation yet to
Invoices/Orders (those still only exist in the frontend's localStorage demo), so there is
nothing to compute an overdue balance from on this API — passing it returns a 400
(unknown-parameter validation), same as any other unrecognized query param.

### Customer fields

```json
{
  "id": "uuid",
  "organizationId": "uuid",
  "customerCode": "CUS-0001",
  "companyName": "Acme Logistics",
  "contactName": "Jane Doe",
  "email": null,
  "phone": null,
  "country": null,
  "city": null,
  "address": null,
  "taxId": null,
  "paymentTerms": "NET_30",
  "creditLimit": "15000.00",
  "status": "ACTIVE",
  "deliveryNotes": null,
  "internalNotes": null,
  "archivedAt": null,
  "createdAt": "2026-07-03T21:00:00.000Z",
  "updatedAt": "2026-07-03T21:00:00.000Z"
}
```

**`creditLimit` is a decimal STRING**, not a JS number — this avoids floating-point
precision loss on monetary values. Requests accept it as a plain JSON number (up to 2
decimal places); responses always serialize it back as a string.

**`customerCode`** is unique per organization (not globally — the same code can be reused
across different organizations, by design). Omit it on create to auto-generate the next
sequential `CUS-0001`-style code for that organization; provide it explicitly to set a
custom one (validated for format — letters, numbers, hyphens only — and per-organization
uniqueness, 409 on conflict). It can be changed later via `PATCH`, with the same validation.

**`status`** via `PATCH` only accepts `ACTIVE`, `AT_RISK`, or `INACTIVE` — never `ARCHIVED`.
Archiving and restoring always go through the dedicated endpoints, which also keep
`archivedAt` in sync and are the only way a customer transitions in or out of the archived
state.

### Audit logging

Every create, update, archive, and restore writes an `AuditLog` row (`entityType:
"Customer"`, scoped to the organization, with the acting user's id) — the same append-only
audit table used by auth and organization management.

## Data-mode behavior (Connected Mode)

A new env var controls this per-deployment, defaulting to the unchanged demo behavior
everywhere:

```bash
# apps/web/.env.local (or .env)
NEXT_PUBLIC_DATA_MODE=demo   # default if unset — current localStorage behavior, unchanged
NEXT_PUBLIC_DATA_MODE=api    # Customers page only: loads/mutates data through apps/api
```

This is **only ever read at the `/customers` page level** (`src/app/(app)/customers/page.tsx`)
— it branches between the existing `CustomersView` (untouched, zero changes) and a new
`CustomersConnectedView`. No other route, component, or the demo role switcher checks this
flag at all. The production Vercel deployment never sets `NEXT_PUBLIC_DATA_MODE`, so it
always resolves to `"demo"` there — Connected Mode literally cannot activate without a local
developer explicitly setting this environment variable.

### What Connected Mode looks like

- **Not signed in**: redirected to the real `/auth/login` page (see
  [CONNECTED_MODE_AUTH_UI.md](CONNECTED_MODE_AUTH_UI.md)) and brought back to `/customers`
  afterward. There is no embedded sign-in form on this page anymore — that lived here only
  before the real auth UI existed; see CONNECTED_MODE_AUTH_UI.md for the current session
  storage design (`flowerp:api-session:v1`, isolated from the demo's `flowerp:data:v5` and
  `flowerp:role:v2` keys).
- **Signed in, loading**: a loading indicator while the customer list is fetched.
- **Signed in, loaded, empty**: "No customers yet in this organization. Create one above."
- **Signed in, loaded, with data**: a simple table (code, company, contact, status, credit
  limit), a search box, and a minimal inline "Create Customer" form — enough to prove
  read+write against the real API, not a redesign of the demo's rich Customers page.
- **Fetch error** (e.g. `apps/api` isn't running): a clear error message plus a Retry button —
  never silently falls back to demo data.
- **Session expired/invalid** (401 from the API): a distinct "Your session has expired, sign
  in again" state, distinguishing "wrong password" from "your token stopped working."

### Local testing steps

```bash
# 1. Start the backend (see BACKEND_FOUNDATION.md / AUTH_ONBOARDING.md)
docker compose -f docker-compose.local.yml up -d
cp apps/api/.env.example apps/api/.env   # set a real JWT_ACCESS_SECRET
npm run prisma:migrate
npm run dev:api

# 2. Start the frontend in Connected Mode
cd apps/web
NEXT_PUBLIC_DATA_MODE=api npm run dev
# open http://localhost:3000/customers — you'll be redirected to /auth/register
# or /auth/login. See CONNECTED_MODE_AUTH_UI.md for the full auth UI.
```

### Switching back to demo mode

Simply don't set `NEXT_PUBLIC_DATA_MODE` (or set it to `demo`) and restart `npm run dev` /
rebuild — `/customers` (and everything else) goes straight back to the exact same
localStorage-backed behavior as before this phase. The Connected Mode session in
`localStorage` (`flowerp:api-session:v1`) is simply ignored while in demo mode; nothing needs
to be manually cleared.

## Known transitional limitations

- Only Customers has a Connected Mode. Every other module (Orders, Dispatch, Drivers,
  Finance, Reports, Notifications, AI Assistant) still runs exclusively on the localStorage
  demo, even while Customers is connected — this is an intentional transitional state, not an
  oversight.
- Silent refresh-on-load and a one-retry-after-401 wrapper are now implemented (see
  CONNECTED_MODE_AUTH_UI.md) — a session only shows "expired" after a refresh attempt has
  actually failed, not on every access-token expiry.
- The Connected Mode Customers view is intentionally minimal (list, search, create) — it does
  not yet have parity with the demo's full CRM feature set (credit limit editing, notes,
  activity timeline, archive/restore UI, etc.). Those exist on the API already (see contracts
  above) and can be wired into the UI in a future phase.
- No pagination controls in the Connected Mode UI yet (the API supports `page`/`limit`; the
  UI currently just requests up to 50 records).
