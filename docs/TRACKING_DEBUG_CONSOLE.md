# Tracking Debug Console (Phase 11)

Internal observability for Driver Mobile GPS testing. **No invented telemetry** —
every panel reads Prisma live state, the in-process ingest packet buffer, SSE
client registry, and audit log lifecycle events.

## Access

| Gate | Value |
|---|---|
| Roles | `ADMIN`, `OPERATIONS_MANAGER` (not DISPATCHER) |
| API registration | `NODE_ENV=development` only |
| Web | `/app/fleet-tracking/debug` (+ nav “Tracking Debug”) |

## API (`/tracking/debug/*`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/tracking/debug/snapshot` | Full console payload |
| `GET` | `/tracking/debug/packets` | Ring-buffer packet inspector |
| `GET` | `/tracking/debug/timeline` | Lifecycle event timeline |
| `GET` | `/tracking/debug/diagnostics` | Highlighted issues + metrics |
| `GET` | `/tracking/debug/metrics` | Dev metrics only |
| `GET` | `/tracking/debug/export` | Same as snapshot, downloadable JSON |

## What you see

- **Sessions** — ACTIVE `TrackingSession` + heartbeat/GPS age, `VehicleTelematicsState`, ACTIVE trips, this-process SSE clients
- **Packet inspector** — every filtered GPS decision (accepted/rejected, reason, device vs receive time, lat/lng/speed/heading/accuracy, processing / SSE / replay latencies)
- **Timeline** — instrumented events (`session_created`, `gps_received`, `vehicle_updated`, `replay_saved`, `sse_broadcast`, `heartbeat`, `session_closed`, `dispatch_finished`) merged with audit (`auth.login`, dispatch assign/finish)
- **Diagnostics** — duplicates, late/OOO, future timestamps, invalid coords, offline drivers, missing heartbeat, session/vehicle conflicts
- **Metrics** — avg GPS interval, processing / SSE / replay latency, packets/min, connected drivers estimate, active sessions, SSE counts

## Notes

- Packet buffer and SSE client counts are **per API process** (same honesty as the SSE registry).
- Production builds register **zero** debug routes.
- Simulate GPS via Phase 10 `/tracking/dev/simulate/*` while watching this console.
