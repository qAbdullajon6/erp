# Driver Mobile App — GPS Tracking Contract

How the Driver Mobile App behaves as a first-class GPS device against FlowERP's
Fleet Tracking surface (`/tracking/*`). The phone does not invent a parallel
pipeline — it posts the same positions the hardware ingest path writes into
`GpsPosition` → `VehicleTelematicsState` → SSE → Fleet map / trip replay.

Module owners: `apps/api/src/telematics/tracking`, `apps/api/src/telematics/ingestion`.

---

## 1. Lifecycle

```
Driver login (JWT)
        │
        ▼
Assigned to a live Dispatch  (ASSIGNED | EN_ROUTE_TO_PICKUP | AT_PICKUP | IN_TRANSIT)
        │  vehicleId is resolved server-side — the phone never names a vehicle
        ▼
First GPS POST  ──► TrackingSession(source=DRIVER_APP) auto-created ACTIVE
        │
        ▼
GPS updates (and optional heartbeats)
        │  IngestionService writes GpsPosition (ordered)
        │  upserts VehicleTelematicsState
        │  opens/rolls trips for replay
        │  publishes SSE position + state
        ▼
Fleet Tracking map updates live
        │
Session closes automatically when:
  • Dispatch becomes DELIVERED or CANCELLED
  • Driver logs out / logout-all
  • Heartbeat / GPS goes quieter than org offlineThresholdSec (sweeper)
  • Vehicle is reassigned away from this driver (old vehicle session ends)
```

---

## 2. Endpoints the mobile app uses

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/tracking/my-location` | `DRIVER` | Primary GPS write. Body: `{ positions: IngestPosition[] }` |
| `POST` | `/tracking/my-heartbeat` | `DRIVER` | Presence without a GPS fix (network ok, GPS cold) |
| `POST` | `/tracking/sessions/:id/heartbeat/driver` | `DRIVER` | Heartbeat a known session the driver owns |
| `GET` | `/dispatches/my` | `DRIVER` | Confirm live assignment + vehicle (read only) |

Aliases that still work (legacy): `POST /telematics/my-location`.

Ops-only reads (`/tracking/live`, `/tracking/live-stream`, history, sessions
open/end) stay on ADMIN / OPERATIONS_MANAGER / DISPATCHER.

---

## 3. Required GPS payload

```json
{
  "positions": [
    {
      "latitude": 41.3111,
      "longitude": 69.2797,
      "recordedAt": "2026-07-26T12:00:01.000Z",
      "speedKph": 42.5,
      "heading": 90,
      "accuracyM": 8,
      "idempotencyKey": "phone-uuid-or-monotonic-id"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `latitude` / `longitude` | yes | Rejected if out of range or Null Island `(0,0)` |
| `recordedAt` | no | ISO-8601 device time; defaults to server now. Rejected if > 60s in the future |
| `speedKph` / `heading` / … | no | Optional telemetry |
| `idempotencyKey` | no | Dedupes reconnect / offline flush within a batch (max 128 chars) |

Batch size: **1–1000** positions per request. Sort is applied server-side by
`recordedAt` ascending.

**Response:** `{ accepted, rejected, tripId, sessionId, latest }`. Treat
`accepted < positions.length` as partial success — keep rejected fixes out of
the next flush (they failed validation, not transport).

---

## 4. Expected frequency

| Signal | Cadence | Notes |
|---|---|---|
| GPS while moving | **5–15 s** | Prefer device-time `recordedAt` |
| GPS while stopped | **30–60 s** | Or on meaningful move (> ~25 m) |
| Heartbeat without GPS | **≥ 2 s apart** | Storms closer than 2s are `400` |
| Offline backlog flush | On reconnect | Batch up to 1000; use `idempotencyKey` |

The org `offlineThresholdSec` (default 600) drives Fleet map “offline / GPS
lost” and auto-ends stale `TrackingSession`s via the telematics sweeper.

---

## 5. Validation the phone must expect

Rejected (counted in `rejected`, or hard `4xx`):

| Condition | Behaviour |
|---|---|
| No driver profile linked to the user | `404` |
| No live dispatch | `404` — stop tracking until assigned |
| Dispatch has no vehicle | `400` |
| Invalid / Null Island coordinates | rejected in batch |
| Future `recordedAt` beyond 60s skew | rejected in batch |
| Duplicate / out-of-order vs last fix | rejected in batch (OOO never rewrites live state) |
| Heartbeat storm (< 2s) | `400` |

---

## 6. Failure handling (mobile)

| Situation | App behaviour |
|---|---|
| Network interruption | Queue positions locally with `idempotencyKey`; flush on reconnect |
| Reconnect | POST backlog oldest-first; ignore partial rejects |
| Duplicate packets | Same `idempotencyKey` or same `recordedAt` — server drops |
| Out-of-order | Older-than-last fixes are dropped; do not rewind the phone clock |
| Slow connection | Prefer smaller batches; heartbeat keeps session alive |
| Dispatch finished | Stop posting; server has already ended the session |
| Logout | Call auth logout — server ends `DRIVER_APP` sessions |

---

## 7. Development simulators

Registered **only** when `NODE_ENV=development` on the API:

| `POST` | Body | Effect |
|---|---|---|
| `/tracking/dev/simulate/movement` | `{ vehicleId }` | One moving fix via ingest |
| `/tracking/dev/simulate/stop` | `{ vehicleId }` | One stopped fix |
| `/tracking/dev/simulate/offline` | `{ vehicleId }` | Backdates `lastReceivedAt` past offline threshold |
| `/tracking/dev/simulate/reconnect` | `{ vehicleId }` | Fresh fix after offline |
| `/tracking/dev/simulate/dispatch-finish` | `{ dispatchId }` | Ends tracking sessions for that dispatch (does **not** mutate dispatch status) |

OPS roles only. Production builds register zero of these routes.

---

## 8. What the Fleet map shows

Derived only from live API fields (`sessionId`, `sessionSource`,
`hasActiveDispatch`, coordinates, `isStale` / `movementState`):

| Label | Meaning |
|---|---|
| Tracking | Fresh coordinates |
| Waiting for GPS | Active session, no coordinates yet |
| GPS Lost | Session still open, last fix stale |
| Driver Offline | Driver-app / driver-linked source went quiet |
| Vehicle Offline | Hardware/state offline without driver-app session |
| No Active Dispatch | No live assignment and no open session |

Never fabricated ETA, destination pins, or synthetic GPS.

---

## 9. Related docs

- `docs/FLEET_TELEMATICS_API.md` — provider ingest, trips, geofences, alerts
- `docs/TELEMATICS_SECURITY_REVIEW.md` — device secrets, SSE limits
- `docs/TRACKING_DEBUG_CONSOLE.md` — Phase 11 observability console for GPS testing
