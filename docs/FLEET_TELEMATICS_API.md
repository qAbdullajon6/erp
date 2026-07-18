# Fleet Telematics & GPS Tracking

The live-operations layer of FlowERP: where every vehicle is right now, where it
has been, and what it did on the way. Provider-agnostic ingestion feeds one
derived pipeline — live state, trips, geofence events, alerts, analytics — that
the map, the reports, the AI copilot, the developer API and the customer portal
all read from.

Module: `apps/api/src/telematics`. Registered in `AppModule`; a leaf consumer of
`AuditModule` and the `WorkflowsModule` event bus, so nothing in the rest of the
domain depends on it.

---

## 1. Architecture

```
 device / driver app / webhook
            │  (provider-specific wire format)
            ▼
   ProviderRegistry → normalizer            NormalizedPosition[]
            │
            ▼
   IngestionService  ──────────────────────────────────────────────┐
   • persist raw fix (GpsPosition, append-only, source of truth)    │
   • movement classification (idle / stop / moving)                 │
   • trip open / rollup / (auto-)close                              │
   • geofence enter / exit / dwell                                  │
   • alert engine (speeding, harsh, idle, low-fuel, check-engine)   │
   • health snapshots                                               │
   • live-state upsert (VehicleTelematicsState — the map read model)│
            │                                                        │
            ├── TelematicsRealtimeService.publish ──► WebSocket clients (per-org)
            ├── WorkflowEventService.emit ──► workflow engine + webhooks
            └── TelematicsAlert rows ──► NotificationsService reconcile (FLEET)
```

Everything except `GpsPosition` and `VehicleTelematicsState` is **derived** and
recomputable from the raw stream. The raw stream is the only source of truth;
side effects (alerts, geofences, workflow emits) are wrapped so a failure in any
of them can never lose a position.

The two time-based actors that no incoming ping can trigger live in
`TelematicsSweeperService`: **offline detection**, **trip auto-close**, and
**retention pruning**, on a 60-second `setInterval` (matching
`WorkflowSchedulerService` — the repo has no `@nestjs/schedule` dependency).

---

## 2. Data model

New tables (migration `20260717100000_add_fleet_telematics`):

| Table | Purpose |
|---|---|
| `telematics_devices` | A GPS unit, its provider, and its ingest-secret hash. Bound to a vehicle. |
| `gps_positions` | Append-only raw fix stream (high volume). |
| `vehicle_telematics_states` | One row per vehicle — the denormalised live-map read model. |
| `trips` | A journey with rolled-up distance/duration/idle/harsh/speeding aggregates. |
| `geofences` | Circle or polygon areas; per-fence enter/exit/dwell alerting. |
| `geofence_events` | Append-only arrival/departure/dwell trail. |
| `telematics_alerts` | Alert-engine output with ack/resolve lifecycle. |
| `vehicle_health_snapshots` | Point-in-time OBD/diagnostics (fuel, battery, DTC codes). |
| `telematics_settings` | Per-org tunable thresholds (lazily created with defaults). |

Physical sensor readings (speed, heading, temperature) are `Float`; for-the-
record aggregates (distance, fuel) are `Decimal`. `linkedCustomerId` on a
geofence is a **soft reference** (no FK) to keep the telematics schema decoupled
from a customer hard-delete.

---

## 3. GPS provider abstraction

A provider's one job is to turn a vendor wire format into `NormalizedPosition[]`.
`ProviderRegistry.forType(providerType)` returns the normalizer; the ingestion
pipeline never branches on vendor.

| Provider | Notes |
|---|---|
| `MANUAL` / `GENERIC_WEBHOOK` | Our normalised shape (driver app, first-party). |
| `TRACCAR` | Traccar/OsmAnd flat object. Speed in **knots** → km/h; epoch-seconds timestamps; query-string transport merged into the body. |
| `SAMSARA` | `data[].gps` envelope; speed in **mph** → km/h. |
| `GEOTAB` | MyGeotab record; speed already km/h. |

Adding a vendor is a new normalizer + a registry row — never a change to
ingestion.

---

## 4. Ingestion endpoints

### 4.1 Device webhook (secret-authenticated, no session)

```
POST /telematics/ingest/:deviceId
  Header:  X-Ingest-Secret: flowtel_live_...     (or ?secret=)
  Body:    provider-specific payload (or Traccar query-string params)
```

The device secret is shown **once** at device creation, stored only as a
SHA-256 hash, and verified in constant time on every post (fast hash on the hot
path — the same decision as API keys). The org and vehicle come from the device,
never from the request, so a device cannot spoof a tenant or a vehicle.
Rate limiting is intentionally skipped here (see TD-TELEMATICS-06).

### 4.2 First-party (session-authenticated)

```
POST /telematics/vehicles/:vehicleId/positions   (ADMIN/OPS/DISPATCHER)
POST /telematics/my-location                      (DRIVER — vehicle resolved server-side)
Body: { "positions": [ { latitude, longitude, recordedAt?, speedKph?, heading?, ignitionOn?, ... } ] }
```

A driver never names a vehicle: `POST /telematics/my-location` resolves the
vehicle from the driver's in-progress dispatch on the server.

---

## 5. Realtime Server-Sent Events (SSE)

```
GET  /telematics/live-stream?vehicleIds=<optional-csv-list>
Authorization: Bearer <access-jwt>
```

Built on Server-Sent Events over plain HTTP (same architecture as AI Copilot
module). SSE rather than WebSockets: this is one-directional server-push, so it
needs no second protocol, no separate auth handshake, and no sticky-session
config at the load balancer.

The handshake is the security boundary: the JWT is verified exactly like
`JwtStrategy`, then the response is pinned to that organization for its whole
life. Fan-out only ever visits responses whose org equals the event's org —
tenant isolation by construction. Redis pub/sub (when `REDIS_URL` is set)
carries events across instances.

**Query parameters:**
- `vehicleIds` (optional): comma-separated vehicle IDs to filter stream

**Server → client event format:**

```
data: {"type":"position|state|alert|geofence|trip", "vehicleId":"...", "at":"ISO", "payload":{...}}

```

**Event types:**
- `position` — individual GPS fix
- `state` — vehicle's complete current state (full snapshot)
- `alert` — new alert raised
- `geofence` — enter/exit/dwell event
- `trip` — trip started/completed

**Keep-alive:** Server sends `: keep-alive` comments every 30 seconds to hold
connection through proxies.

---

## 6. Staff REST API (JWT + RolesGuard)

Read surface is `ADMIN` / `OPERATIONS_MANAGER` / `DISPATCHER` (matching Vehicles
& Drivers). Fleet-configuration writes (devices, geofence create/edit, settings)
are `ADMIN` / `OPERATIONS_MANAGER` only.

| Method & path | Purpose |
|---|---|
| `GET /telematics/live` | Whole-fleet live positions (one indexed read). |
| `GET /telematics/live/:vehicleId` | One vehicle: state, recent trail, active trip. |
| `GET /telematics/vehicles/:id/eta?lat=&lng=` | Kinematic ETA to a point. |
| `GET /telematics/vehicles/:id/playback?from&to&limit` | Historical playback (range-bounded). |
| `GET /telematics/trips` · `/:id` · `/:id/replay` | Trips + route replay. |
| `GET/POST /telematics/geofences` · `PATCH/:id` · `POST /:id/archive|restore` | Geofence CRUD. |
| `GET /telematics/geofences/events` | Arrival/departure/dwell log. |
| `GET /telematics/alerts` · `/:id` · `POST /:id/acknowledge|resolve` | Alert centre. |
| `GET/POST /telematics/devices` · `PATCH/:id` · `POST /:id/rotate-secret|archive|restore` | Device management. |
| `GET/PATCH /telematics/settings` | Threshold tuning. |
| `GET /telematics/analytics/{overview,fleet-utilization,driver-behavior,fuel,health}` | Analytics. |

---

## 7. Derived logic

**Movement** (`movement-detector.ts`): a fix ≥ 5 km/h is `MOVING`; below that,
`IDLING` (ignition on) or `STOPPED`. Idle/stop thresholds fire **exactly once**
per stationary spell via crossing flags, so a parked vehicle's every-few-seconds
ping does not read as a fresh idle.

**Trips**: opened when a stationary vehicle starts moving, linked to the
vehicle's in-progress dispatch/order. Aggregates (distance, moving/idle seconds,
max/avg speed, harsh counts, speeding samples) are held in memory across a batch
and written as absolute values once per batch (see TD-TELEMATICS-02). Closed by
the sweeper after `tripAutoCloseSec` of inactivity.

**ETA** (`eta.util.ts`): kinematic, not routing-engine. Straight-line remaining
distance × a winding factor (~1.3), over a chosen effective speed (live → trip
average → urban fallback). Address→coordinate geocoding is out of scope
(TD-TELEMATICS-04); the caller supplies destination coordinates.

**Alert engine** (`alert-rules.ts` + `AlertService`): speeding (severity bands by
km/h over), harsh accel/brake/corner (m/s² thresholds; cornering from
speed × yaw-rate), idle, stop, low-fuel, check-engine, geofence enter/exit/dwell,
device-offline. A sustained condition is deduped into one row (updated in place)
via the `(organizationId, dedupeKey)` unique slot, released on resolve so a
recurrence is a fresh alert.

**Fuel** (`fuel-model.ts`): an explicit distance × nominal-rate estimate by
vehicle type — labelled an estimate everywhere; not a fuel-card reconciliation.

**Driver safety score**: `100 − (weighted incidents per 100 km) × 2.5`, clamped
0–100. Documented formula, not a certified rating.

---

## 8. Cross-module integration

- **Workflows / webhooks**: emits `trip.started`, `trip.completed`,
  `vehicle.geofence.entered/exited`, `telematics.alert.raised` through
  `WorkflowEventService` (fans out to the workflow engine and developer
  webhooks). Registered in `trigger-registry.ts`.
- **Notifications**: `NotificationsService` reconcile adds a `TELEMATICS_ALERT`
  FLEET rule surfacing **open CRITICAL/HIGH** alerts; acknowledging/resolving an
  alert auto-archives its notification.
- **AI Copilot**: `TelematicsAiTools` adds `fleet_status`, `track_vehicle`,
  `list_fleet_alerts`, `driver_safety` — read-only, OPS-scoped, same services the
  HTTP controllers use.
- **Developer API**: `telematics:read` scope; `GET /v1/telematics/live`,
  `/vehicles/:id/live`, `/trips`, `/alerts`.
- **Customer Portal**: `GET /customer-portal/orders/:id/tracking` — ownership
  checked exactly like `getById` (foreign order → 404), no driver PII in the
  payload.
- **Reports**: `GET /reports/fleet-telematics` bundles overview, utilisation,
  driver-behaviour and fuel.

---

## 9. Security & tenancy

- Every query is scoped by `organizationId`; a cross-org id returns 404, never
  leaking existence.
- WebSocket sockets are pinned to one org at handshake; fan-out is org-filtered.
- Device ingest secrets: one-time reveal, SHA-256 hash, constant-time compare.
- RBAC mirrors Vehicles/Drivers; device/settings writes are tighter.
- Every mutation is audit-logged (`telematics.*` actions).

---

## 10. Configuration

Per-organization thresholds live in `telematics_settings` (tunable in-app), not
in env. Infra env reused from the rest of the app: `REDIS_URL` (realtime fan-out
+ throttle store), `DATABASE_URL`, `JWT_ACCESS_SECRET` (WS handshake). No new
required env vars.

Key tunables (defaults): speed limit 90 km/h (+10 tolerance), idle 300 s, stop
180 s, offline 600 s, harsh accel/brake 3.5 m/s², harsh corner 3.0 m/s², trip
auto-close 600 s, low fuel 15 %, retention 90 days.

---

## 11. Known limitations / technical debt

Tracked in `docs/TECHNICAL_DEBT.md` as **TD-TELEMATICS-01 … 09**: high-volume
`gps_positions` partitioning & batched pruning; serial-per-vehicle aggregate
assumption; Samsara/Geotab mapping verification; ETA geocoding; ambient `ws`
types; per-device ingest rate limiting; per-ping geofence dwell queries;
account-level multi-vehicle webhooks; and the divergent dev-DB migration
history note.
