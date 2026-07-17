# Developer Portal API

Two distinct surfaces, deliberately separated:

| Surface | Auth | Who uses it |
|---|---|---|
| `/admin/*` | Staff session JWT + `ADMIN`/`OPERATIONS_MANAGER` role | The Developer screen in the app |
| `/v1/*` | API key | Third-party integrations |

An API key **cannot** reach `/admin/*`. That is intentional: a leaked key must not be
able to mint another key, rotate a webhook secret, or otherwise bootstrap itself into
persistence. Managing integrations is a human, session-authenticated act.

---

## Authentication (`/v1`)

Present the key on either transport:

```http
GET /v1/orders
X-API-Key: flowerp_live_a1b2c3d4...
```

```http
GET /v1/orders
Authorization: Bearer flowerp_live_a1b2c3d4...
```

Both work. The `Authorization` form is distinguished from a staff session JWT by the
`flowerp_` namespace, so the two schemes coexist on one header without ambiguity.

Every request validates that the key exists, is `ACTIVE`, has not expired, and belongs to
an active organization — then records `lastUsedAt`. All rejections return the same
`401 Invalid API key`: distinguishing "no such key" from "revoked" from "expired" would
tell an attacker which stolen key is worth pursuing.

The organization is taken from the key. There is no way to name a tenant in a request,
so there is no way to ask for another tenant's data.

### Scopes

| Scope | Grants |
|---|---|
| `orders:read` | `GET /v1/orders`, `GET /v1/orders/:id` |
| `customers:read` | `GET /v1/customers`, `GET /v1/customers/:id` |
| `drivers:read` | `GET /v1/drivers` |
| `vehicles:read` | `GET /v1/vehicles` |
| `orders:write`, `customers:write`, `finance:read`, `webhooks:admin` | Reserved; no `/v1` route consumes these yet |

A key missing a required scope gets `403` naming the missing scope — safe to state
plainly, since the caller already proved they hold the key.

### Rate limiting

Per key, per rolling 60-second window, using that key's `rateLimitPerMinute` (default
120). Every metered response carries the budget, so a client can back off *before* being
rejected:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1784265328
```

On `429`, a `Retry-After` header gives the seconds to wait. It is a header, not a body
field: the global exception filter normalizes every error body to
`{error:{statusCode,message}}`, so a body field would be silently dropped.

### Endpoints

| Method | Path | Scope |
|---|---|---|
| `GET` | `/v1/me` | — (any valid key) |
| `GET` | `/v1/orders` | `orders:read` |
| `GET` | `/v1/orders/:id` | `orders:read` |
| `GET` | `/v1/customers` | `customers:read` |
| `GET` | `/v1/customers/:id` | `customers:read` |
| `GET` | `/v1/drivers` | `drivers:read` |
| `GET` | `/v1/vehicles` | `vehicles:read` |

`GET /v1/me` echoes back what the key is and may do — the first call to make when
wiring up an integration:

```json
{
  "data": {
    "organizationId": "...",
    "keyName": "Acme Integration",
    "scopes": ["orders:read"],
    "rateLimitPerMinute": 120
  }
}
```

---

## API keys (`/admin/api-keys`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/api-keys` | Includes revoked keys, so an operator can see a key is already dead |
| `POST` | `/admin/api-keys` | **Returns `rawKey` — the only time it is ever visible** |
| `PATCH` | `/admin/api-keys/:id` | Name, scopes, rate limit |
| `DELETE` | `/admin/api-keys/:id` | Revoke. Terminal and idempotent |
| `POST` | `/admin/api-keys/:id/rotate` | **Returns a new `rawKey`** |
| `POST` | `/admin/api-keys/:id/enable` | |
| `POST` | `/admin/api-keys/:id/disable` | |

Only the SHA-256 hash of a key is stored. `rawKey` is returned by exactly two endpoints —
create and rotate — and by nothing else, ever. A caller who lost it rotates; they do not
re-read it.

**Revoke vs disable.** Revoke is terminal: the key is dead permanently and cannot be
rotated or re-enabled (`409`). Disable is a reversible pause — the same secret works
again after `enable`. Use disable to turn an integration off while debugging; use revoke
when the secret has leaked.

Rotation issues a new secret onto the same key, so the integration's identity, scopes and
usage history survive while the old secret dies **immediately** — there is no grace
window, because a rotation is usually a response to a leak.

---

## Webhooks (`/admin/webhooks`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/webhooks` | |
| `GET` | `/admin/webhooks/events` | The supported event names |
| `POST` | `/admin/webhooks` | **Returns `secret`** |
| `GET` | `/admin/webhooks/:id` | |
| `PATCH` | `/admin/webhooks/:id` | |
| `DELETE` | `/admin/webhooks/:id` | Cascades to its deliveries |
| `POST` | `/admin/webhooks/:id/enable` | |
| `POST` | `/admin/webhooks/:id/disable` | |
| `POST` | `/admin/webhooks/:id/rotate-secret` | **Returns the new `secret`**, bumps `version` |
| `POST` | `/admin/webhooks/:id/test` | Sends a synthetic delivery and **waits for the result** |

Like an API key's `rawKey`, the signing `secret` is returned only by create and
rotate-secret — never by a list or get.

### Supported events

`order.created`, `order.updated`, `order.status_changed`, `order.cancelled`,
`dispatch.created`, `dispatch.status_changed`, `dispatch.completed`,
`invoice.created`, `invoice.paid`, `payment.received`,
`customer.created`, `customer.updated`, `driver.created`, `vehicle.created`,
`expense.created`, `expense.approved`

Subscribing to an unknown event is rejected at create/update time rather than stored —
a webhook subscribed to an event nothing emits is silently dead.

### URL restrictions

Webhook URLs must be public `http`/`https`. Private, loopback and link-local addresses
are rejected, since the server makes the outbound request from inside the network
perimeter. `169.254.169.254` and other link-local addresses are blocked in **every**
environment, including development.

Locally, `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` permits a loopback/LAN receiver. It is
forced off under `NODE_ENV=production`. See TD-017 for the known limit of this check.

### Payload

```http
POST /your/endpoint
Content-Type: application/json
User-Agent: FlowERP-Webhooks/1.0
X-FlowERP-Event: order.created
X-FlowERP-Delivery: 8f3c...
X-FlowERP-Attempt: 1
X-FlowERP-Signature: t=1784265328,v1=baf0f674...
```

```json
{
  "event": "order.created",
  "organizationId": "...",
  "occurredAt": "2026-07-17T05:15:18.226Z",
  "data": { "id": "...", "orderNumber": "ORD-2026-0001", "status": "DRAFT" }
}
```

### Verifying the signature

The signature is an HMAC-SHA256 over `<timestamp>.<raw body>`, keyed with the endpoint's
secret. The timestamp is **inside** the signed material, which is what bounds replay: a
captured delivery cannot stay valid forever.

```js
const crypto = require('crypto');

function verify(secret, rawBody, header, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const timestamp = Number(parts.t);

  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // Constant-time — a plain === leaks the signature byte by byte.
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
```

Verify against the **raw** body, before any JSON parsing: re-serializing changes the bytes
and the signature will not match.

### Delivery, retries and backoff

Delivery is out-of-band: the domain operation that triggered the event never waits for
your endpoint, and a failing webhook can never fail it.

A non-2xx response or a timeout is retried with exponential backoff — 1s, 2s, 4s, ...
capped at 5 minutes — up to `WEBHOOK_MAX_ATTEMPTS` (default 5) total attempts, after
which the delivery is `FAILED`. Every physical attempt is recorded separately, so the
full retry history is inspectable rather than overwritten by the last one.

Deliveries survive a process restart: a pending delivery is a database row, not an
in-memory queue entry.

**Your endpoint should be idempotent.** A retry after a timeout may deliver a payload
your endpoint already processed — from our side an accepted-but-unacknowledged delivery
is indistinguishable from a lost one. De-duplicate on `X-FlowERP-Delivery`.

### Delivery history

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/webhooks/:id/deliveries` | Newest first; `?limit=`, `?status=` |
| `GET` | `/admin/webhooks/:id/deliveries/:deliveryId` | Includes payload and every attempt |
| `POST` | `/admin/webhooks/:id/deliveries/:deliveryId/replay` | **Forks a new delivery** from the same payload |
| `POST` | `/admin/webhooks/:id/deliveries/:deliveryId/retry` | **Re-queues the same delivery**; `FAILED` only |

**Replay vs retry.** Replay creates a *new* delivery from the original's frozen payload
and links back via `replayOfId`; the original is never mutated, because its history is
the evidence you were reading when you decided to replay. Retry continues the *same*
delivery's attempt history, and only applies to a `FAILED` one (`409` otherwise).

The stored `requestHeaders` show `X-FlowERP-Signature: [redacted]` — a real signature for
a known body is a valid credential, and the delivery detail is rendered in the UI.

---

## Usage (`/admin/usage`)

`GET /admin/usage?startDate=2026-07-01&endDate=2026-07-17`

Bounds are date-only and inclusive of the whole end day. Defaults to the last 30 days.

```json
{
  "data": {
    "totalCalls": 1420,
    "avgLatencyMs": 38,
    "statusBreakdown": { "200": 1380, "403": 32, "429": 8 },
    "endpointBreakdown": { "/v1/orders": 900, "/v1/customers": 520 },
    "successCount": 1380,
    "failureCount": 40,
    "successRate": 97.18,
    "webhookDeliveries": { "total": 210, "delivered": 205, "failed": 5, "successRate": 97.62 },
    "lastActivityAt": "2026-07-17T05:15:28.481Z",
    "dailyUsage": [{ "date": "2026-07-16", "count": 812 }],
    "monthlyUsage": [{ "month": "2026-07", "count": 1420 }]
  }
}
```

Only API-key traffic is metered — session traffic is the app talking to itself, and
counting it would drown the integration signal. Failed calls are counted too, including
`403` (missing scope) and `429` (rate limited): a success-only chart would hide exactly
the failures this exists to surface.

`endpointBreakdown` is keyed by route template (`/v1/orders/:id`), never the concrete
path, so ids never reach the analytics table and the breakdown stays bounded.

Webhook `successRate` counts only *settled* deliveries — a pending one has neither
succeeded nor failed, and counting it either way would make the number lurch as the
queue drains.
