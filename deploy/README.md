# Production deployment

FlowERP runs on a single VPS. There is no staging environment.

| Environment | How |
| --- | --- |
| **Local development** | `docker compose -f docker-compose.local.yml up -d` (Postgres + Traccar) + `apps/api` / `apps/web` via npm |
| **Production** | `/opt/flowerp` on the VPS — `docker-compose.yml` + `.env.production` |

## Public routing

| Host | Upstream |
| --- | --- |
| `https://flowerp.uz` | SSR web (`web:3000`), plus same-origin `/api/*` → API |
| `https://api.flowerp.uz` | NestJS API (`api:4000`) |

Caddy terminates TLS. Containers: `flowerp-api`, `flowerp-web`, `flowerp-postgres`, `flowerp-redis`, `flowerp-caddy`.

## Prerequisites on the VPS

Ubuntu LTS, Docker with the Compose plugin, firewall allowing only `80`, `443`, and SSH. Point DNS A/AAAA for `flowerp.uz` and `api.flowerp.uz` at the VPS **before** the first `up` (ACME needs that).

## First deploy

```bash
git clone <repo> /opt/flowerp && cd /opt/flowerp
cp deploy/.env.example .env.production
# fill secrets — see docs/DEPLOYMENT_REQUIRED_SECRETS.md
./scripts/deploy.sh
```

Or equivalently:

```bash
docker compose --env-file .env.production up -d --build
```

The API container runs `prisma migrate deploy` on start (never `migrate dev`).

Verify:

```bash
curl -fsS https://api.flowerp.uz/health
curl -fsS https://flowerp.uz/
docker compose --env-file .env.production logs api | grep -i migration
```

## Ongoing deploys

Push to `main` runs `.github/workflows/deploy.yml`: SSH → `git pull` → `./scripts/deploy.sh` (build on VPS unless a prebuilt `API_IMAGE` is supplied) → health checks.

Manual on the box:

```bash
cd /opt/flowerp
git pull
./scripts/deploy.sh
```

Rollback: `CONFIRM=ROLLBACK ./scripts/rollback.sh`

## Seeding (local / throwaway only)

Seeds create accounts with a **password published in the README**. Never run against production.

```bash
docker compose --env-file .env.production --profile seed \
  run --rm seeder "npx ts-node prisma/seed-test-org.ts"
```

## Backups

```bash
./scripts/backup-postgres.sh
```

Cron example:

```cron
17 3 * * * cd /opt/flowerp && OFFSITE_COMMAND='rclone copy' ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

Rehearse restore with `./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz` (scratch DB by default). Live restore requires `CONFIRM=RESTORE_LIVE` and `--into-live`. See `docs/DISASTER_RECOVERY.md`.

## Local rehearsal of the production stack

```bash
cp deploy/.env.example .env.production
# set SITE_ADDRESS=:8080 API_ADDRESS=:8080 HTTP_PORT=8080 HTTPS_PORT=8443
# and fill JWT / POSTGRES secrets

CADDYFILE=./deploy/Caddyfile.local \
  docker compose --env-file .env.production up -d --build

curl -fsS http://localhost:8080/api/health
```

Local Postgres for day-to-day API development stays on `docker-compose.local.yml` (project `flowerp-local`) so it never collides with production compose (project `flowerp`).

## Optional: Vercel frontend

If the marketing/app UI is hosted on Vercel instead of the VPS `web` service, keep `apps/web/vercel.json` rewriting `/api/*` to `https://api.flowerp.uz/api/*`, set Vercel `VITE_*` from `apps/web/.env.example`, and you may stop the compose `web` service. The default production path is VPS SSR behind Caddy.

## Platform admin

```sql
UPDATE users SET "isPlatformAdmin" = true WHERE email = 'you@yourcompany.com';
```

## Redis

Compose sets `REDIS_URL=redis://redis:6379`. Persistence is off (rate-limit counters only).
