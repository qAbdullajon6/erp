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

Caddy terminates TLS. Containers: `flowerp-api`, `flowerp-web`, `flowerp-postgres`, `flowerp-redis`, `flowerp-caddy`, `flowerp-traccar`.

## Prerequisites on the VPS

Ubuntu LTS, Docker with the Compose plugin, and AWS CLI v2 for the S3 backup
wrapper. Point DNS A/AAAA for `flowerp.uz` and `api.flowerp.uz` at the VPS
**before** the first `up` (ACME needs that).

**Firewall — inbound TCP, exact list, nothing else:**

| Port | Purpose | Required |
| --- | --- | --- |
| 22 | SSH | Now |
| 80 | HTTP (ACME + redirect to 443) | Now |
| 443 | HTTPS (Caddy → web/api) | Now |
| 5221 | Traccar — Navtelecom/FLEX (the S-2423) | Now |
| 5027 | Traccar — Teltonika (future FMB920) | Later, once that unit exists |

Do **not** open 8082 (Traccar admin UI/REST) — it's intentionally not published to the host at all (`expose`, not `ports`, in `docker-compose.yml`); reach it only via SSH tunnel (`ssh -L 8082:localhost:8082 <vps-user>@<vps-host>`, then `http://localhost:8082`). See `docs/TRACCAR_SETUP.md` Section 7 for the full Traccar deployment/firewall detail — this table is the same information, just at the "what does this VPS need" summary level.

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

Push to `main` runs `.github/workflows/deploy.yml`: SSH → sync git →
`./scripts/deploy.sh`.

That script treats **API + WEB as one application**:

- Local build path: `compose build api web` (Docker layer cache kept).
- Prebuilt `API_IMAGE` path: pull API; rebuild WEB when `apps/web` changed
  since the last successful deploy (git diff vs `.flowerp-deployed-sha`).
- Health-gates API, then WEB, then recreates Caddy.
- Verifies `/health`, `/health/database`, web probe, and matching
  `GIT_COMMIT_SHA` in both containers.
- On failure: `scripts/rollback.sh --auto`.

See `docs/DEPLOYMENT_PIPELINE.md` for rebuild rules and the stale-frontend fix.

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

The repository includes `scripts/offsite/aws-s3-backup.sh`, but adding it here
does not install AWS CLI, create/configure the bucket, apply IAM/lifecycle
configuration, install credentials, schedule cron, or prove a production backup.
Those remain explicit operator actions.

Install AWS CLI v2 as a VPS system dependency, using AWS's signed/current
distribution for the VPS architecture. Do not add an npm AWS SDK dependency for
this script. Install the reviewed wrapper outside the checkout:

```bash
sudo install -m 0750 scripts/offsite/aws-s3-backup.sh /usr/local/bin/flowerp-offsite-backup
```

Configure these non-secret values in `.env.production`:

```dotenv
REQUIRE_OFFSITE_BACKUP=true
OFFSITE_WRAPPER=/usr/local/bin/flowerp-offsite-backup
AWS_REGION=eu-north-1
S3_BUCKET=flowerp-812063706887-eu-north-1-an
S3_BACKUP_PREFIX=backups/
```

`OFFSITE_WRAPPER` must be an absolute executable path. The parent invokes it
directly (never through a shell or `eval`) with exactly two quoted arguments:

```text
/absolute/path/to/wrapper <dump.sql.gz> <dump.sql.gz.sha256>
```

The S3 wrapper uses only the standard AWS CLI credential provider chain. Supply
credentials outside git and cron command lines, preferably with a VPS instance
role; an operator-managed AWS config/credentials file or process environment
from a protected secret store are alternatives. Do not put
`AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in `.env.production` or tracked
files.

Before use, an AWS administrator must create the private bucket, enable S3 Block
Public Access for the bucket/account, enable bucket versioning, and attach a
credential policy based on `deploy/aws/s3-backup-iam-policy.json`. There is no
IAM `s3:HeadObject` action: verification is authorized by `s3:GetObject`. The
policy deliberately grants no delete, ACL, or KMS permissions.

Apply `deploy/aws/s3-backup-lifecycle.json` only as a separate, reviewed
administrator action; the wrapper never changes retention and tests perform no
deletes. Its `backups/` rule expires current objects after 90 days, noncurrent
versions after 30 days, and incomplete multipart uploads after 7 days. Even
with versioning, this lifecycle does not absolutely preserve the latest object
if backups stop. Backup alerts must be investigated well before 90 days.

Test once interactively:

```bash
./scripts/backup-postgres.sh
```

Production keeps `REQUIRE_OFFSITE_BACKUP=true`. An unset, relative, or
non-executable wrapper fails clearly. For local-only use, set
`REQUIRE_OFFSITE_BACKUP=false` and leave `OFFSITE_WRAPPER` empty; the local dump
and checksum still succeed. Offsite failures retry according to
`OFFSITE_MAX_ATTEMPTS` and `OFFSITE_RETRY_BACKOFF_SECONDS` (positive integers,
capped at 10 and 3600). A failed upload does not update `.last-success` or prune
local recovery points.

Cron example (nightly, about a 24-hour RPO):

```cron
17 3 * * * cd /opt/flowerp && umask 077 && ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

`RETENTION_DAYS` prunes matching local dumps and checksum sidecars only after
offsite handling succeeds. Offsite retention is independently enforced by the
S3 lifecycle policy. The wrapper validates gzip and the local checksum, uses
multipart-capable `aws s3 cp`, requests SSE-S3 (`AES256`) on both uploads, and
verifies both remote lengths and encryption. It also verifies the dump's
SHA-256 object metadata and downloads the remote checksum sidecar for exact
content comparison. The script atomically writes backup metrics into
`NODE_EXPORTER_TEXTFILE_DIR`; the optional monitoring stack mounts that host
directory into node-exporter and alerts on stale or failed attempts.

For recovery, configure AWS CLI credentials on a recovery host, download the
selected dump and same-named `.sha256` object from
`s3://flowerp-812063706887-eu-north-1-an/backups/` into one directory, then rehearse with
`./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz` (scratch DB by
default). The sidecar is verified before any database operation. Live restore
requires `CONFIRM=RESTORE_LIVE` and `--into-live`. See
`docs/DISASTER_RECOVERY.md` for exact download commands, RPO/RTO assumptions,
and the full runbook.

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
