# api.flowerp.uz — Fleet Tracking + Driver Mobile deployment checklist

Safe update path for production (`https://api.flowerp.uz` / `https://flowerp.uz`)
before distributing a Driver Mobile APK. **Audit-derived** — verify each box
against the live VPS; do not treat unchecked items as done.

Companion docs: `deploy/README.md`, `docs/DEPLOYMENT_REQUIRED_SECRETS.md`,
`docs/DRIVER_MOBILE_PRODUCTION_CHECKLIST.md`, `docs/DRIVER_MOBILE_GPS.md`.

---

## 0. Do not ship until these blockers are cleared

- [ ] **Commit** `apps/api/prisma/migrations/20260726210000_fleet_tracking_foundation/`
      and the matching `schema.prisma` `TrackingSession` changes. Untracked
      migrations never reach the VPS via `git pull` → `prisma migrate deploy`.
- [ ] **Commit** any other migrations you intend to ship with this release
      (currently untracked on the working tree: report indexes, one-live-dispatch,
      payment/driver/vehicle indexes — ship only what belongs in this release).
- [ ] **Commit** Fleet Tracking web deps (`mapbox-gl` in `apps/web/package.json`
      + lockfile) so the Docker web build does not miss packages.
- [ ] **Commit** `apps/mobile/**` (package.json is currently untracked in a dirty
      tree) before any EAS build from a clean clone.
- [ ] Wire **`MAPBOX_SECRET_TOKEN`** into `docker-compose.yml` → `api.environment`
      (present in `deploy/.env.example` but **not** injected into the API
      container today).
- [ ] Pass **`VITE_MAPBOX_ACCESS_TOKEN`** as a **Docker build-arg** for
      `apps/web/Dockerfile` (Vite inlines at build time; runtime `environment:`
      alone will not bake tiles into the SSR bundle).
- [ ] Put real Mapbox tokens in VPS `.env.production` (never commit them).
- [ ] Confirm production has a real **DRIVER** user linked to a `Driver` row
      (do **not** run `seed-test-org` on production — password is published).

---

## 1. Pre-flight (laptop / CI)

- [ ] Working tree for this release is on the branch you will deploy; `git status`
      shows no required migration/schema/env-example files left untracked.
- [ ] `apps/api/.env.example` and `deploy/.env.example` document:
      - `MAPBOX_SECRET_TOKEN`
      - `VITE_MAPBOX_ACCESS_TOKEN` (web / deploy)
      - optional `TELEMATICS_SSE_MAX_CONNECTIONS_*`
- [ ] `apps/mobile/eas.json` `preview` + `production` set
      `EXPO_PUBLIC_API_URL=https://api.flowerp.uz`.
- [ ] Local smoke (optional): `curl -fsS https://api.flowerp.uz/health` → 200.

---

## 2. Backup before migrate

On the VPS:

```bash
cd /opt/flowerp
./scripts/backup-postgres.sh
```

- [ ] Backup artifact exists and is restorable (`docs/DISASTER_RECOVERY.md`).

---

## 3. Deploy API + web (VPS)

```bash
cd /opt/flowerp
git pull   # must include fleet_tracking_foundation migration
# Ensure .env.production has MAPBOX_SECRET_TOKEN (+ VITE_MAPBOX_ACCESS_TOKEN for web rebuild)
./scripts/deploy.sh
```

Or: `docker compose --env-file .env.production up -d --build`

API container CMD runs `npx prisma migrate deploy && node dist/main.js`.

- [ ] `docker compose --env-file .env.production logs api | grep -i migration`
      shows `20260726210000_fleet_tracking_foundation` applied (or already applied).
- [ ] `curl -fsS https://api.flowerp.uz/health` → 200.
- [ ] `curl -fsS https://flowerp.uz/` → 200.
- [ ] Confirm `NODE_ENV=production` in API container (dev-only
      `/tracking/dev/*` and `/tracking/debug/*` must **not** be registered).

---

## 4. Fleet Tracking API smoke (production)

Authenticated as ADMIN / OPS (or DRIVER where noted):

- [ ] `GET /tracking/live` (OPS) returns 200 (empty fleet is OK).
- [ ] DRIVER with live dispatch: `POST /tracking/my-location` with one real
      lat/lng accepts ≥1 position and returns `sessionId`.
- [ ] DRIVER without live dispatch: same POST → 404 (expected).
- [ ] After GPS: `TrackingSession` ACTIVE + `VehicleTelematicsState` updated
      (DB or Fleet Tracking UI).
- [ ] Optional: Mapbox reverse-geocode / directions only if
      `MAPBOX_SECRET_TOKEN` is set; tiles on web only if `VITE_MAPBOX_ACCESS_TOKEN`
      was present at **web image build** time.

---

## 5. Driver Mobile APK (EAS — not VPS)

Mobile is **not** part of `docker-compose.yml`. Build separately:

```bash
cd apps/mobile
eas build --platform android --profile production   # or preview
```

- [ ] Profile is **not** `development` (that falls back to `localhost:4000`).
- [ ] Install APK on a physical device; login as a production DRIVER account.
- [ ] Driver has an active live dispatch with a vehicle assigned.
- [ ] Grant location (incl. background) + notification permissions.
- [ ] Confirm posts hit `https://api.flowerp.uz/tracking/my-location`
      (Fleet Tracking UI / Tracking Debug is **dev-only** — use live map or
      DB on prod).
- [ ] Heartbeat / offline queue recovery works after airplane mode (see
      `docs/DRIVER_MOBILE_GPS.md`).

Full mobile sign-off: `docs/DRIVER_MOBILE_PRODUCTION_CHECKLIST.md`.

---

## 6. Rollback

If migrate or API boot fails:

```bash
CONFIRM=ROLLBACK ./scripts/rollback.sh
```

If migration applied but app is wrong: restore DB from the §2 backup only with
the documented restore procedure (`CONFIRM=RESTORE_LIVE` + `--into-live` when
intentionally restoring live). Prefer forward-fix for additive migrations.

---

## 7. Post-deploy monitoring (24h)

- [ ] API / web container restarts = 0 unexpected.
- [ ] No surge of 5xx on `/tracking/my-location`.
- [ ] SSE / Redis: without `REDIS_URL` multi-instance fan-out is single-node only
      (compose sets Redis — confirm `REDIS_URL` reaches API).
- [ ] Driver field reports: session opens on first GPS, closes on delivery/logout.

---

## What production mobile does **not** need

| Surface | Prod? |
|---|---|
| `/tracking/dev/simulate/*` | No — `NODE_ENV=development` only |
| `/tracking/debug/*` | No — same |
| Test seed `driver@flowerp.test` | No — never seed prod |
| VPS Docker “mobile” service | N/A — EAS APK only |
