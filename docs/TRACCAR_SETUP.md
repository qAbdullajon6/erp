# Traccar GPS Server Setup & Integration

**Last updated:** 2026-08-11  
**Traccar version:** 6.4  
**Integration status:** Production path validated end-to-end with physical S-2423 hardware (FLEX `~T` via Navis `:5019`). See **Current S-2423 architecture** below. Binding to a real vehicle plate remains a business-data blocker (still on seed `VEH-0001` / `01A111AA` until Admin provides identity).

---

## Current S-2423 architecture (authoritative)

Traccar 6.4's **Navtelecom** protocol handler on `:5221` only accepts FLEX `~A`. The live S-2423 sends FLEX `~T`, which the same image's **Navis** decoder on `:5019` accepts. The working local cutover is therefore:

```
S-2423 (FLEX ~T)
  → VPS public TCP :5221
  → SSH reverse tunnel (-R) 5221 → host 127.0.0.1:5019
  → Traccar 6.4 Navis :5019 (decode)
  → forward.url → FlowERP /telematics/ingest/:deviceId
  → gps_positions + vehicle_telematics_states
  → GET /tracking/live + SSE /tracking/live-stream
  → Fleet Tracking UI (Mapbox GL)
```

**Why `:5221` stays public:** devices and firewall rules already target that port on the VPS; it is the stable tunnel endpoint, not the decoder.

**Why `:5019` is the local decoder:** Navis understands FLEX `~T` on this Traccar image. Local `docker-compose.local.yml` publishes `5019:5019` so the SSH tunnel can reach it. **Production `docker-compose.yml` does not yet publish `:5019`** — treat that as an ops follow-up before promoting the same cutover; do not remove working `:5221` without a proven rollback.

**Config persistence (local):** bind-mount `./docker/traccar/traccar.xml` → `/opt/traccar/conf/traccar.xml:ro` so `forward.url` survives container recreate. Never commit real ingest secrets; prefer `X-Ingest-Secret` header when possible. Application logs redact `?secret=` query params.

**Map stacks:** Live Fleet Tracking uses **Mapbox GL** (public `pk.*` in the browser; Directions / reverse-geocode via API with `MAPBOX_SECRET_TOKEN`). Geofences and trip replay still use **MapLibre + OSM** — intentional Phase-2 deferral (unification is Phase 3). Google Maps is not required for Fleet Tracking.

**Do not invent a real plate** or rebind the S-2423 until Company Admin supplies the vehicle identity.

---

## Overview

Traccar is an open-source GPS tracking platform that FlowERP integrates with for fleet telematics. Traccar handles the device-facing side (2000+ GPS device protocols), and FlowERP reads normalized position data via webhook.

**Why Traccar:**
- Supports 2000+ GPS device protocols (Teltonika, Queclink, Coban, etc.)
- Production-tested by thousands of deployments
- Open source, self-hosted
- REST API for position data
- Webhook support for real-time push

**Architecture (generic):**
```
GPS Device → Traccar (protocol decoding) → FlowERP webhook → Ingestion → Live Map
```

For the live S-2423 path, prefer the **Current S-2423 architecture** diagram above over older notes that imply Navtelecom `:5221` is the decoder for this unit.

---

## 1. Starting Traccar Locally

### Docker Compose (Recommended)

Traccar is already configured in `docker-compose.local.yml`:

```bash
# Start Traccar + PostgreSQL
docker compose -f docker-compose.local.yml up -d

# Check Traccar is healthy
docker compose -f docker-compose.local.yml ps traccar
```

**Exposed ports:**
- **8082** — Web UI + REST API (admin interface)
- **5055** — OsmAnd/Traccar Client protocol (for mobile apps)
- **5027** — Teltonika protocol (common hardware tracker, e.g. FMB920)
- **5221** — Navtelecom (NTCB/FLEX) protocol listener (kept for other units / rollback)
- **5019** — Navis protocol (local; used for S-2423 FLEX `~T` via SSH tunnel from VPS `:5221`)

**First-run login — there is no `admin/admin` default.** A fresh Traccar
image ships with an empty user table and `registration: false` (self-service
signup closed), so the web UI's login form has nothing to authenticate
against yet. Bootstrap the first (admin) user once via the REST API — this
only works while the user table is empty:

```bash
curl -X POST http://localhost:8082/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"<choose-a-strong-password>"}'
```

Then log in to the UI (http://localhost:8082) with that email/password.

**⚠️ In production, only bootstrap this over the SSH tunnel (see Section 7) — never expose port 8082 to the internet.**

---

## 2. Device Onboarding

### Step 1: Create Device in Traccar

1. Log in to Traccar UI (http://localhost:8082)
2. Click **Devices** → **+** (add device)
3. Fill in:
   - **Name:** `Fleet-001` (or your vehicle plate/code)
   - **Identifier:** `<device-imei>` (15-digit IMEI from your GPS tracker)
   - **Group:** (optional, for organizing devices)
4. Click **Add**

### Step 2: Register Device in FlowERP

```bash
POST /telematics/devices
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "provider": "TRACCAR",
  "externalId": "<device-imei>",
  "name": "Fleet-001",
  "vehicleId": "<vehicle-uuid>"
}
```

**Response:**
```json
{
  "id": "<device-uuid>",
  "secret": "flowtel_live_abc123...",
  "externalId": "<device-imei>",
  "provider": "TRACCAR",
  "vehicleId": "<vehicle-uuid>"
}
```

**⚠️ Save the `secret` — it's shown only once!**

### Step 3: Configure Traccar Webhook

In Traccar UI:

1. Go to **Settings** → **Notifications**
2. Click **+** (add notification)
3. Fill in:
   - **Type:** Web Request (HTTP)
   - **Always:** ✓ (send for all events)
   - **URL:** `http://host.docker.internal:4000/telematics/ingest/<device-uuid>?secret=<device-secret>`
     - Replace `<device-uuid>` with FlowERP device ID
     - Replace `<device-secret>` with the secret from Step 2
   - **Method:** POST
   - **Content Type:** application/json
4. Click **Add**

**Note for production:** Use `https://your-flowrp-domain.com` instead of `host.docker.internal`.

**What Traccar actually sends:** the webhook body is a NESTED JSON object,
not the flat `latitude`/`longitude`/`id` shape used elsewhere in this doc's
test scripts:

```json
{
  "position": {
    "deviceId": 1,
    "protocol": "navtelecom",
    "fixTime": "2026-08-08T10:53:17.000Z",
    "latitude": 41.3222,
    "longitude": 69.2666,
    "speed": 32.4,
    "course": 270.0,
    "altitude": 470.0,
    "valid": true
  },
  "device": {
    "id": 1,
    "uniqueId": "862531043215285",
    "name": "..."
  }
}
```

Two things worth knowing before you rely on this:
- `speed` is in **knots** (Traccar's internal storage unit, regardless of
  which wire protocol decoded the fix) — `traccar.provider.ts` converts it.
- The device's real identity (IMEI) is at `device.uniqueId`, never at
  `position.deviceId` — that field is Traccar's own internal row id and is
  never usable as a cross-tenant identifier. `traccar.provider.ts` reads
  `device.uniqueId` and cross-checks it against the authenticated device's
  `externalId`; a mismatch is rejected with 401 (protects against a
  Traccar notification accidentally wired to the wrong FlowERP device URL).

This shape was verified empirically against a live `traccar/traccar:6.4`
container (Traccar's `forward.url` position-forwarding feature, which
serialises the same internal `Position`/`Device` model classes a per-device
Web Request notification also sends) — not assumed from documentation, since
Traccar ships no schema for this. See Section 12 for how to reproduce that
verification locally.

---

## 3. Testing Without Real Hardware

### Option A: OsmAnd Mobile App (Easiest)

1. **Install OsmAnd** on your phone (iOS/Android)
2. **Configure tracking:**
   - Open OsmAnd
   - Settings → Plugins → Trip recording
   - Enable "Online tracking"
   - Server URL: `http://<your-ip>:5055/?id=<device-imei>`
   - Tracking interval: 10 seconds
3. **Start tracking:**
   - Main menu → Trip recording → Start
   - Move around (walk, drive)
4. **Verify in FlowERP:**
   - Open live map
   - You should see your device moving in real-time

**Finding your IP:**
```bash
# Windows
ipconfig | findstr IPv4

# macOS/Linux
ifconfig | grep "inet "
```

### Option B: Traccar Client App

1. Install **Traccar Client** from App Store/Play Store
2. Configure:
   - Server URL: `http://<your-ip>:5055`
   - Device identifier: `<device-imei>`
   - Frequency: 10 seconds
3. Start tracking
4. Verify in FlowERP live map

### Option C: GPS Simulator (Scripted)

Create a test script to POST positions directly to FlowERP:

```bash
#!/bin/bash
DEVICE_ID="<device-uuid>"
SECRET="<device-secret>"
URL="http://localhost:4000/telematics/ingest/$DEVICE_ID?secret=$SECRET"

# Simulate a route (NYC to Boston)
ROUTE=(
  "40.7128,-74.0060"
  "40.7589,-73.9851"
  "40.8501,-73.8662"
  "41.0534,-73.5387"
  "41.3083,-72.9279"
  "41.7658,-72.6734"
  "42.3601,-71.0589"
)

for COORDS in "${ROUTE[@]}"; do
  LAT=$(echo $COORDS | cut -d',' -f1)
  LNG=$(echo $COORDS | cut -d',' -f2)
  
  curl -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"latitude\": $LAT,
      \"longitude\": $LNG,
      \"speedKph\": 60,
      \"heading\": 45,
      \"recordedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",
      \"ignitionOn\": true
    }"
  
  echo "Posted position: $LAT, $LNG"
  sleep 10
done
```

---

## 4. Supported GPS Device Protocols

Traccar supports 2000+ protocols. Most common:

| Protocol | Port | Devices |
|----------|------|---------|
| **OsmAnd** | 5055 | OsmAnd app, Traccar Client app |
| **Teltonika** | 5027 | FMB, FMC, FMM series (most popular hardware) |
| **Navtelecom (NTCB/FLEX)** | 5221 | S-2423 and other NTC-series units |
| **Queclink** | 5001 | GL300, GV series |
| **Coban** | 5013 | TK102, TK103, TK104 |
| **H02** | 5013 | Generic Chinese trackers |
| **GT06** | 5023 | Another common Chinese protocol |

**Full list:** https://www.traccar.org/devices/

**A note on the Navtelecom port:** it is not listed on traccar.org's device
pages, and Traccar removed its bundled `default.xml` port table in 6.2+, so
there is no published, stable reference for it. `5221` was extracted
directly from the compiled `org.traccar.config.PortConfigSuffix` class
inside this exact `traccar/traccar:6.4-alpine` image's `tracker-server.jar`
(the same class also correctly reproduces the documented `osmand=5055` /
`teltonika=5027` values above, which is what makes the extraction
trustworthy rather than a guess). If you upgrade the Traccar image tag,
re-verify this port before relying on it — it's an implementation detail of
that build, not a spec.

### Configuring Hardware Trackers

Most hardware trackers have an SMS command interface. Example for Teltonika:

```
# Set server IP and port
setparam 2001:<your-server-ip>
setparam 2002:5027

# Set reporting interval (10 seconds)
setparam 1001:10

# Enable ignition detection
setparam 3001:1
```

Consult your device's manual for exact commands.

---

## 5. Verifying Integration

### Check Device is Posting

1. **Traccar UI** → **Devices** → Select your device
   - Last update time should be recent
   - Position should show on Traccar's map

2. **FlowERP API:**
```bash
GET /telematics/live/<vehicle-id>
Authorization: Bearer <admin-jwt>
```

Expected response:
```json
{
  "vehicle": { "id": "...", "vehicleCode": "Fleet-001", ... },
  "state": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "speedKph": 60,
    "heading": 45,
    "movementState": "MOVING",
    "lastRecordedAt": "2026-07-17T12:34:56.000Z"
  },
  "trail": [...]
}
```

### Check SSE Stream

```bash
# Connect to live stream
curl -N -H "Authorization: Bearer <admin-jwt>" \
  http://localhost:4000/telematics/live-stream
```

You should see events streaming:
```
data: {"type":"position","vehicleId":"...","payload":{...},"at":"..."}

data: {"type":"state","vehicleId":"...","payload":{...},"at":"..."}
```

---

## 6. Troubleshooting

### Device not posting to Traccar

1. **Check device configuration:**
   - Server IP correct?
   - Port correct for protocol?
   - Device has internet connection?

2. **Check Traccar logs:**
```bash
# Local
docker compose -f docker-compose.local.yml logs traccar | tail -50
# Production
docker compose -f docker-compose.yml --env-file .env.production logs traccar | tail -50
```

3. **Test connectivity:**
```bash
# From device's network, can it reach Traccar?
telnet <your-ip> 5055
```

### Traccar posting, but FlowERP not receiving

1. **Check webhook configuration:**
   - URL correct?
   - Secret correct?
   - Local dev: does `host.docker.internal` resolve inside the Traccar container (it should, on Docker Desktop)?
   - Production: does `api:4000` resolve inside the Traccar container? (Same Compose project, default network — it should. If not, confirm neither service has a `networks:` override that split them onto different networks.)

2. **Check FlowERP logs:**
```bash
# In apps/api directory
npm run start:dev
# Watch for incoming POST /telematics/ingest/... requests
```

3. **Test webhook manually:**
```bash
curl -X POST \
  "http://localhost:4000/telematics/ingest/<device-uuid>?secret=<secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 40.7128,
    "longitude": -74.0060,
    "speedKph": 60,
    "recordedAt": "2026-07-17T12:00:00.000Z",
    "ignitionOn": true
  }'
```

Expected response:
```json
{
  "accepted": 1,
  "rejected": 0,
  "tripId": "<trip-uuid>",
  "latest": { "latitude": 40.7128, "longitude": -74.0060, ... }
}
```

### Positions ingested, but not showing on live map

1. **Check vehicle assignment:**
```bash
GET /telematics/devices/<device-uuid>
```

Verify `vehicleId` is set and valid.

2. **Check SSE connection:**
   - Open browser DevTools → Network tab
   - Look for `live-stream` connection
   - Should be status 200 and "pending" (streaming)

3. **Check org-scoping:**
   - Device's org matches user's org?
   - `GET /telematics/live` returns the vehicle?

---

## 7. Production Deployment

### Firewall — exact requirement

The VPS firewall (ufw/cloud security group/whatever manages it — nothing in
this repo touches it) must allow exactly this inbound TCP list, nothing more:

| Port | Purpose | Required |
| --- | --- | --- |
| 22 | SSH | Now |
| 80 | HTTP — ACME challenge + redirect to 443 | Now |
| 443 | HTTPS — Caddy → web/api | Now |
| **5221** | **Traccar — Navtelecom/FLEX (the S-2423)** | **Now** |
| 5027 | Traccar — Teltonika (future FMB920) | Later, once that unit exists — safe to open now too if convenient, just not load-bearing yet |

**Do not open 8082.** It is deliberately never published to the host at all
(`expose:`, not `ports:`, in `docker-compose.yml`'s `traccar` service) — the
firewall can't leak what Docker never exposes, but the firewall must not be
relied on as the only layer either. Reach the admin UI over an SSH tunnel
only:

```bash
ssh -L 8082:localhost:8082 <vps-user>@<vps-host>
# then open http://localhost:8082 in a local browser
```

This is documentation only — nobody has opened 5221 on the actual VPS yet as
of this writing. See the repo-root deployment audit for current status
before assuming it's done.

### What `scripts/deploy.sh` does with Traccar automatically

- Brings the `traccar` container up alongside `postgres`/`redis` on every
  deploy (`compose up -d postgres redis traccar`) — nothing depends on it
  starting first, so it's fire-and-forget.
- After the core API/WEB deploy verification passes, checks Traccar's Docker
  healthcheck status and prints a **loud warning + recent logs** to deploy
  output if it isn't healthy.
- That check is **non-blocking**: it never fails the deploy and never
  triggers `scripts/rollback.sh`. Traccar (GPS ingestion) is auxiliary to
  FlowERP's core application — orders, dispatch, billing, etc. all work
  regardless of Traccar's state, so rolling back a legitimate app deploy over
  an unrelated GPS-bridge hiccup would be the wrong tradeoff. The point of
  the check is that a broken Traccar container is always **visible** in
  deploy output, never silent.

None of the one-time manual setup below (bootstrap admin, register the
S-2423, configure its Web Request notification) is automated by
`deploy.sh`, and shouldn't be — per-device secrets and URLs don't belong in
a shell script that runs on every deploy.

### First-run login

Same as local (Section 1) — there is no `admin/admin` default. Bootstrap the
first admin user once, over the SSH tunnel above, while Traccar's user table
is still empty:

```bash
ssh -L 8082:localhost:8082 <vps-user>@<vps-host>
# in another terminal, or a browser on the tunnel:
curl -X POST http://localhost:8082/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"<real-email>","password":"<strong-password>"}'
```

**Never do this over the public internet** — port 8082 shouldn't be
reachable that way in the first place (previous section), but this is worth
saying twice: this bootstrap endpoint has no auth precondition other than
"the user table happens to be empty," so it must only ever be reached
through the tunnel.

### Device registration + webhook — production specifics

Follow Section 2 exactly, with one change: for the Web Request notification
URL, prefer FlowERP's **internal** service name over the public HTTPS
domain:

```
http://api:4000/telematics/ingest/<device-uuid>?secret=<device-secret>
```

`traccar` and `api` are containers in the same `docker-compose.yml` project
with no `networks:` override, so they share the default Compose network and
resolve each other by service name. This avoids the extra hop through Caddy
+ TLS + public DNS for a call that never leaves the VPS — one fewer thing
that has to be up for GPS ingestion to work. The public
`https://api.flowerp.uz/telematics/ingest/...` URL also works (Caddy proxies
it to `api:4000` with no path restriction) and is a reasonable fallback if
the internal hostname is ever inconvenient, but internal is the
recommendation.

### Performance Tuning

No `traccar.xml` is bind-mounted in production `docker-compose.yml` today —
Traccar runs on its own bundled defaults plus whatever is set through its
admin UI/REST API (which persists to its own database, in the `traccar_data`
volume). The settings below are legitimate Traccar tuning knobs if load ever
requires them, but applying them means adding a config bind mount to the
`traccar` service first — that's a real change, not covered by this pass,
and shouldn't be made speculatively before there's a load reason to.

```xml
<entry key='database.maxPoolSize'>50</entry>
<entry key='geocoder.enable'>false</entry>  <!-- FlowERP does own geocoding -->
```

**Device reporting interval** (set on the device, not Traccar):
- **Moving:** 10-30 seconds (balance accuracy vs. data volume)
- **Idle:** 60-120 seconds (save bandwidth)
- **Stopped:** 300+ seconds (minimal updates)

**Expected load:**
- 100 vehicles @ 10s interval = ~600 positions/min
- 1000 vehicles @ 10s interval = ~6000 positions/min

### Monitoring

**Traccar health (over the SSH tunnel, port 8082 isn't public):**
```bash
curl http://localhost:8082/api/server
curl -u <bootstrapped-email>:<its-password> http://localhost:8082/api/devices
```

**Container health (from the VPS, no tunnel needed):**
```bash
docker inspect --format '{{.State.Health.Status}}' flowerp-traccar
docker compose -f docker-compose.yml --env-file .env.production logs --tail=50 traccar
```

**FlowERP metrics to track:**
- `telematics.ingest.rate` (positions/sec)
- `telematics.ingest.errors` (failed normalizations)
- `telematics.positions.table_size` (row count)
- `telematics.websocket.connections` (active SSE streams)

---

## 8. Alternative: Direct Device Integration

For devices that support custom HTTP protocols, you can bypass Traccar entirely:

```bash
# Device posts directly to FlowERP
POST /telematics/ingest/<device-uuid>?secret=<secret>
Content-Type: application/json

{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "speedKph": 60,
  "heading": 45,
  "recordedAt": "2026-07-17T12:00:00.000Z",
  "ignitionOn": true,
  "odometerKm": 12345.67,
  "fuelLevelPct": 75.5
}
```

**When to use:**
- Device already speaks HTTP/JSON
- You control the device firmware
- Traccar doesn't support the device protocol

**When NOT to use:**
- Device speaks a binary protocol (Teltonika, Queclink, etc.)
- Device uses SMS/GPRS commands
- You need Traccar's geofencing/reporting features

---

## 9. Developer Reference

### Traccar Provider Normalizer

FlowERP's Traccar provider normalizer is in:
```
apps/api/src/telematics/providers/traccar.provider.ts
```

**What it does:**
- Converts Traccar JSON to FlowERP's `NormalizedPosition[]` format
- Handles unit conversions (knots → km/h, epoch seconds → Date)
- Merges query-string params into body (for OsmAnd protocol)
- Parses BOTH wire shapes: Traccar's own nested `{position, device}` webhook
  body (the real production shape — see Section 2, Step 3) and the flat
  `id`/`lat`/`lon` OsmAnd/Traccar-Client shape (used by this doc's manual
  test options and kept as a fallback)
- Cross-checks the payload's device identity (`device.uniqueId`, or the
  flat shape's `id`) against the authenticated device's `externalId`,
  rejecting a mismatch — see `telematics-ingest.controller.ts`

**Verified protocols (real Traccar decode, end to end into FlowERP):**
- OsmAnd (5055) — synthetic fixes decoded by Traccar's real `osmand`
  protocol handler and forwarded into FlowERP's ingestion pipeline
  (Section 12)
- Navtelecom/FLEX (5221) — port verified from the compiled Traccar image;
  full end-to-end decode not yet exercised (requires either the physical
  S-2423 or a Navtelecom protocol simulator, neither available in this
  session)
- Teltonika (5027) — port published/confirmed; full end-to-end decode not
  yet exercised locally

### Adding New Providers

To add support for Samsara, Geotab, or other platforms:

1. Create provider in `apps/api/src/telematics/providers/<name>.provider.ts`
2. Implement `TelematicsProvider` interface
3. Register in `ProviderRegistry`
4. Add tests in `providers.spec.ts`
5. Document webhook setup

Example: `SamsaraProvider` and `GeotabProvider` are already implemented but not verified against live accounts (see TD-TELEMATICS-03).

---

## 12. Local End-to-End Validation (Docker, No Hardware)

This reproduces the validation used to verify the payload shape documented
in Section 2, Step 3, and to prove a position can travel
`Traccar (real protocol decode) → forward.url → FlowERP ingest → Postgres`
without any physical device. Useful before wiring up new hardware, or after
upgrading the Traccar image.

1. **Start Traccar and the API** (`docker-compose -f docker-compose.local.yml up -d`, `npm run start:dev` in `apps/api`).
2. **Bootstrap a Traccar admin user** (Section 1) and register a test device via Traccar's REST API — `registration: false` means you must create it, Traccar won't auto-create it on first contact:
   ```bash
   curl -X POST http://localhost:8082/api/devices \
     -u <email>:<password> -H "Content-Type: application/json" \
     -d '{"name":"Test Unit","uniqueId":"<same-imei-you-register-in-flowerp>"}'
   ```
3. **Register the same device in FlowERP** (Section 2, Step 2) and note the returned `id`/`secret`.
4. **Point Traccar's position forwarding at that device's real FlowERP URL.** Unlike the per-device Web Request notification in Section 2 (configured per notification, so it can carry a different URL for each device), `forward.url` is a single **global** setting — fine for a one-device local test, not a substitute for the per-device notification in a real multi-device fleet. It also only binds at Traccar startup, so a container restart is required after changing it. Edit `traccar.xml` inside the container (or the mounted config, if you've bind-mounted one):
   ```xml
   <entry key='forward.url'>http://host.docker.internal:4000/telematics/ingest/&lt;device-uuid&gt;?secret=&lt;device-secret&gt;</entry>
   <entry key='forward.type'>json</entry>
   ```
   ```bash
   docker restart <traccar-container-name>
   ```
5. **Send a synthetic fix through Traccar's real OsmAnd protocol handler** (stands in for any protocol — the point is that Traccar, not this script, is doing the decoding):
   ```bash
   curl -G "http://localhost:5055/" \
     --data-urlencode "id=<the-imei>" \
     --data-urlencode "lat=41.30" --data-urlencode "lon=69.25" \
     --data-urlencode "timestamp=$(date +%s)" --data-urlencode "speed=25"
   ```
6. **Confirm it landed in FlowERP** via `GET /telematics/live/<vehicle-id>` (Section 5) — `state.latitude`/`state.longitude` should match what you sent, and a `GpsPosition` row now exists.
7. **Revert `traccar.xml`** to drop `forward.url`/`forward.type` and restart, so the container goes back to the default per-device Web Request notification flow — the global forwarder should not stay wired to one device's URL in a shared dev environment.

---

## 13. Physical Device Connection Plan (NAVTELECOM S-2423)

The server-side bridge (Traccar + FlowERP ingest pipeline) is ready and
validated per Section 12. **The physical S-2423 has not been reconfigured —
this section documents the plan only.** When ready to connect it:

1. **VPS address:** the production host's public IP/hostname (`API_ADDRESS`/`SITE_ADDRESS` in `.env.production` — see `deploy/.env.example`). Confirm the actual value with whoever manages DNS before using it.
2. **TCP port:** `5221` — published by the production `traccar` service (`docker-compose.yml`, override via `TRACCAR_NAVTELECOM_PORT`). Verified against the installed Traccar 6.4 image per the note in Section 4; re-verify if the image tag ever changes.
3. **Protocol to select in NTC Configurator:** whichever entry corresponds to plain TCP delivery to a generic/Traccar-compatible server — do not change this without the device physically in hand and NTC Configurator open; this document does not instruct making that change now.
4. **FLEX:** leave the transport protocol selection (FLEX) as currently configured — Traccar's Navtelecom decoder handles NTCB/FLEX; there is no reason identified in this work to change it.
5. **Server address to replace `195.158.11.71:21626`:** `<vps-address>:5221` (items 1–2 above), once confirmed.
6. **Old DRC connection:** leave it as the previous owner's server until the new address is confirmed working end-to-end (step 11 below) — don't remove the old config as the only step in the same session as adding the new one, in case the new one needs debugging.

**Server-side steps, all doable before touching the device (do these first):**

7. **Register the device in Traccar** — `registration: false` means Traccar won't auto-create it on first contact, so this has to happen first or the S-2423's first connection attempt is simply dropped as unknown:
   ```bash
   curl -X POST http://localhost:8082/api/devices \
     -u <bootstrapped-admin-email>:<its-password> -H "Content-Type: application/json" \
     -d '{"name":"S-2423 <vehicle-plate-or-code>","uniqueId":"862531043215285"}'
   ```
   (Run over the SSH tunnel from Section 7 — `ssh -L 8082:localhost:8082 <vps>`.)
8. **Register the IMEI in FlowERP:** `862531043215285`, via `POST /telematics/devices` with `provider: "TRACCAR"` (Section 2, Step 2). Save the returned `id` (FlowERP's device UUID) and `secret` — the secret is shown once.
9. **Bind it to a vehicle:** pass `vehicleId` in that same request, or `PATCH /telematics/devices/<id>` afterward. **This is a decision only you can make** — which `Vehicle` row corresponds to the truck the S-2423 is physically mounted in is not something to infer or guess.
10. **Configure the Web Request notification in Traccar** (Section 2, Step 3 — Settings → Notifications → **+**), pointed at the FlowERP device from step 8:
    - **Type:** Web Request (HTTP)
    - **Always:** ✓
    - **URL:** `http://api:4000/telematics/ingest/<flowerp-device-uuid-from-step-8>?secret=<secret-from-step-8>` (internal service name — see Section 7's "Production specifics")
    - **Method:** POST, **Content Type:** application/json
    - This is what turns "Traccar has a position" into "FlowERP has a position" — everything above this step can be done and verified independently (Traccar UI shows the device even with FLEX still pointed at the old server), but nothing reaches FlowERP until this notification exists.

**Only after 7–10 are done and confirmed correct — then, and only then, the physical step:**

11. **Post-change test:** after (and only after) the device is repointed in NTC Configurator, confirm via Traccar's UI (`Devices` → this device → last update timestamp advancing) AND `GET /telematics/live/<vehicle-id>` in FlowERP showing real coordinates matching the device's actual location — both must agree before considering the migration complete. If Traccar shows updates but FlowERP doesn't, re-check step 10 (URL, secret) before suspecting anything else — Sections 6 and 12 have the full troubleshooting/replay procedure.

---

## 14. FAQ

**Q: Can I use multiple Traccar servers?**  
A: Yes — register devices from each Traccar instance the same way (via `POST /telematics/devices`); FlowERP's ingest endpoint doesn't care which Traccar server a webhook came from, only that the device secret matches.

**Q: Does FlowERP store positions in Traccar's database?**  
A: No. FlowERP has its own `gps_positions` table. Traccar is purely the device protocol gateway.

**Q: Can I import historical data from Traccar?**  
A: Yes, via Traccar's REST API:
```bash
GET /api/positions?deviceId=<traccar-device-id>&from=<iso-date>&to=<iso-date>
```
Then POST each position to FlowERP's ingest endpoint.

**Q: What happens if Traccar goes down?**  
A: Devices keep buffering positions locally (most hardware trackers store 1000-10000 positions). When Traccar comes back, they flush the buffer. FlowERP sees a batch of positions with timestamps in the past and ingests them correctly (sorted by `recordedAt`).

**Q: Can I run Traccar and FlowERP on different servers?**  
A: Yes. Update the webhook URL to point to FlowERP's public domain. Ensure FlowERP is reachable from Traccar's network.

**Q: How do I handle device SIM card costs?**  
A: Configure devices to report less frequently when idle/stopped. Most trackers support dynamic intervals based on ignition state or movement detection.

---

## 15. Support & Resources

**Traccar documentation:** https://www.traccar.org/documentation/  
**Traccar forum:** https://www.traccar.org/forums/  
**Supported devices:** https://www.traccar.org/devices/  
**FlowERP technical debt:** See `docs/TECHNICAL_DEBT.md` (TD-TELEMATICS-03 for Traccar provider verification)

**FlowERP Fleet Telematics API:** See `docs/FLEET_TELEMATICS_API.md`
