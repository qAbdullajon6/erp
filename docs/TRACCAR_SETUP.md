# Traccar GPS Server Setup & Integration

**Last updated:** 2026-07-17  
**Traccar version:** 6.4  
**Integration status:** Production-ready

---

## Overview

Traccar is an open-source GPS tracking platform that FlowERP integrates with for fleet telematics. Traccar handles the device-facing side (2000+ GPS device protocols), and FlowERP reads normalized position data via webhook.

**Why Traccar:**
- Supports 2000+ GPS device protocols (Teltonika, Queclink, Coban, etc.)
- Production-tested by thousands of deployments
- Open source, self-hosted
- REST API for position data
- Webhook support for real-time push

**Architecture:**
```
GPS Device → Traccar (protocol decoding) → FlowERP webhook → Ingestion → Live Map
```

---

## 1. Starting Traccar Locally

### Docker Compose (Recommended)

Traccar is already configured in `docker-compose.local.yml`:

```bash
# Start Traccar + PostgreSQL
docker-compose up -d

# Check Traccar is healthy
docker-compose ps traccar
```

**Exposed ports:**
- **8082** — Web UI + REST API (admin interface)
- **5055** — OsmAnd/Traccar Client protocol (for mobile apps)
- **5027** — Teltonika protocol (common hardware tracker)

**Default credentials:**
- Username: `admin`
- Password: `admin`

**⚠️ Change the default password immediately in production!**

Access Traccar UI: http://localhost:8082

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
  "vehicleId": "<vehicle-uuid>",
  "config": {
    "traccarDeviceId": "<traccar-numeric-id>"
  }
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
   - **URL:** `http://host.docker.internal:3000/telematics/ingest/<device-uuid>?secret=<device-secret>`
     - Replace `<device-uuid>` with FlowERP device ID
     - Replace `<device-secret>` with the secret from Step 2
   - **Method:** POST
   - **Content Type:** application/json
4. Click **Add**

**Note for production:** Use `https://your-flowrp-domain.com` instead of `host.docker.internal`.

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
URL="http://localhost:3000/telematics/ingest/$DEVICE_ID?secret=$SECRET"

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
| **Queclink** | 5001 | GL300, GV series |
| **Coban** | 5013 | TK102, TK103, TK104 |
| **H02** | 5013 | Generic Chinese trackers |
| **GT06** | 5023 | Another common Chinese protocol |

**Full list:** https://www.traccar.org/devices/

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
  http://localhost:3000/telematics/live-stream
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
docker-compose logs traccar | tail -50
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
   - `host.docker.internal` resolves inside Traccar container?

2. **Check FlowERP logs:**
```bash
# In apps/api directory
npm run start:dev
# Watch for incoming POST /telematics/ingest/... requests
```

3. **Test webhook manually:**
```bash
curl -X POST \
  "http://localhost:3000/telematics/ingest/<device-uuid>?secret=<secret>" \
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

### Security Checklist

- [ ] Change Traccar default password (`admin/admin`)
- [ ] Use HTTPS for FlowERP webhook URL
- [ ] Rotate device secrets periodically
- [ ] Restrict Traccar ports (5055, 5027) to device IPs only
- [ ] Enable Traccar SSL/TLS for device connections
- [ ] Set up Traccar user accounts (one per fleet manager)
- [ ] Enable Traccar audit logging

### Performance Tuning

**Traccar configuration** (`traccar.xml`):

```xml
<entry key='database.maxPoolSize'>50</entry>
<entry key='web.port'>8082</entry>
<entry key='geocoder.enable'>false</entry>  <!-- FlowERP does own geocoding -->
```

**Device reporting interval:**
- **Moving:** 10-30 seconds (balance accuracy vs. data volume)
- **Idle:** 60-120 seconds (save bandwidth)
- **Stopped:** 300+ seconds (minimal updates)

**Expected load:**
- 100 vehicles @ 10s interval = ~600 positions/min
- 1000 vehicles @ 10s interval = ~6000 positions/min

### Monitoring

**Traccar health:**
```bash
# Check Traccar is responding
curl http://localhost:8082/api/server

# Check connected devices
curl -u admin:password http://localhost:8082/api/devices
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

**Tested protocols:**
- OsmAnd (5055)
- Traccar Client (5055)
- Teltonika (5027)

### Adding New Providers

To add support for Samsara, Geotab, or other platforms:

1. Create provider in `apps/api/src/telematics/providers/<name>.provider.ts`
2. Implement `TelematicsProvider` interface
3. Register in `ProviderRegistry`
4. Add tests in `providers.spec.ts`
5. Document webhook setup

Example: `SamsaraProvider` and `GeotabProvider` are already implemented but not verified against live accounts (see TD-TELEMATICS-03).

---

## 10. FAQ

**Q: Can I use multiple Traccar servers?**  
A: Yes. Each device can point to a different Traccar instance. Set `config.traccarBaseUrl` when creating the device in FlowERP.

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

## 11. Support & Resources

**Traccar documentation:** https://www.traccar.org/documentation/  
**Traccar forum:** https://www.traccar.org/forums/  
**Supported devices:** https://www.traccar.org/devices/  
**FlowERP technical debt:** See `docs/TECHNICAL_DEBT.md` (TD-TELEMATICS-03 for Traccar provider verification)

**FlowERP Fleet Telematics API:** See `docs/FLEET_TELEMATICS_API.md`
