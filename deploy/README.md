# Staging deployment

One VPS, five containers: PostgreSQL, Redis, the NestJS API, the SSR frontend, and
Caddy in front of both. Everything below was rehearsed locally against
`docker-compose.staging.yml` before it was written down.

## Why one origin

The browser only ever talks to `https://staging.flow-erp.uz` and
`https://staging.flow-erp.uz/api/*`. Caddy strips the `/api` prefix and forwards to the
API container.

This matters more than it looks:

- **The API mounts its routes at the root** — `/auth/login`, `/orders` — not under `/api`.
  The Vite dev server rewrites the prefix away; any proxy in front of production must do
  the same, or every call 404s. Caddy's `handle_path` does exactly that.
- **`npm run build:web` produces no `/api` route at all.** The dev proxy does not exist in
  the built server. Without the reverse proxy the frontend loads and every request 404s —
  a failure that looks like a frontend bug and is not.
- No cross-origin request is ever made, so there is no CORS preflight to misconfigure and
  the `sessionStorage` tokens behave exactly as they do locally.

Splitting the API onto `api.staging.flow-erp.uz` also works, but it buys a CORS
configuration and buys nothing else.

## Prerequisites on the VPS

Ubuntu LTS, Docker with the Compose plugin, and a firewall that allows only `80`, `443`
and SSH. Postgres and Redis publish no ports — they are reachable on the Compose network
and nowhere else. A database port open to the internet is how staging databases get
emptied.

## First deploy

```bash
git clone <repo> /srv/flowerp && cd /srv/flowerp
cp deploy/.env.staging.example .env.staging
```

Fill in `.env.staging`:

```bash
# Point the DNS A record at this VPS *before* starting Caddy, or the ACME
# challenge fails and you get a self-signed certificate.
SITE_ADDRESS=staging.flow-erp.uz
HTTP_PORT=80
HTTPS_PORT=443
PUBLIC_ORIGIN=https://staging.flow-erp.uz

POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
```

Then:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

The API container runs `prisma migrate deploy` on start. It never runs `migrate dev`,
which offers to reset the database.

Check it came up:

```bash
curl -fsS https://staging.flow-erp.uz/api/health
docker compose -f docker-compose.staging.yml --env-file .env.staging logs api | grep -i migration
```

## Seeding staging

Only if staging needs demo data. Both seeds are additive and refuse to duplicate
themselves, but they create accounts with a **password published in the repository's
README** — never run them against production.

The API's runtime image is built with `--omit=dev` and has no `ts-node`, so
`docker compose exec api npx prisma db seed` fails with `spawn ts-node ENOENT`. Use the
`seeder` service instead: it stops at the Dockerfile's build stage, which keeps the dev
dependencies, and runs on the Compose network so it can reach Postgres without publishing
a port.

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging \
  run --rm seeder "npx ts-node prisma/seed-test-org.ts"
```

Do not seed from the host by mounting the repo into a container: `node_modules` there
holds the host platform's native binaries (Prisma's query engine, argon2), which will not
run under Alpine.

## Platform admin

`User.isPlatformAdmin` gates the Leads screen. Nothing in the product grants it. Register
the staff account normally, then:

```sql
UPDATE users SET "isPlatformAdmin" = true WHERE email = 'you@yourcompany.com';
```

Revoking it takes effect on that user's next request — `JwtStrategy` re-reads the flag
from the database rather than trusting the token.

## Redis

Rate-limit counters live in Redis when `REDIS_URL` is set, and in the API process's memory
when it is not. In-memory is correct for exactly one instance and wrong for two: each
would keep its own tally, so N instances make every limit N times looser — including the
5/min brute-force guard on `/auth/login`. The staging stack sets `REDIS_URL` from the
start so this is never a surprise later.

Redis persistence is deliberately off. It holds counters, not data; losing them on restart
costs one minute of throttling.

## Backups

```bash
./scripts/backup-postgres.sh          # writes ./backups/<db>-<utc-stamp>.sql.gz
```

Install it as a cron job and set `OFFSITE_COMMAND`, or the dumps only exist on the box you
are backing up:

```cron
17 3 * * * cd /srv/flowerp && OFFSITE_COMMAND='rclone copy' ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

**Rehearse the restore.** A backup that has never been restored is a guess. Restore into a
scratch database and count rows — never into the live one:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T postgres \
  psql -U erp -d postgres -c 'CREATE DATABASE erp_restore_test'

gunzip -c backups/erp_staging-<stamp>.sql.gz \
  | docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T postgres \
      psql -U erp -d erp_restore_test

docker compose -f docker-compose.staging.yml --env-file .env.staging exec -T postgres \
  psql -U erp -d erp_restore_test -c 'SELECT count(*) FROM users'
```

The dump carries `--clean --if-exists`, so it drops and recreates each object. Restoring it
over a populated database replaces that database's contents.

## Verifying a deploy

Point the e2e suite at the deployed origin. These are the same specs the release candidate
used, so a pass means the deployed build behaves like the one that was signed off:

```bash
cd apps/web
FRONTEND_URL=https://staging.flow-erp.uz \
API_URL=https://staging.flow-erp.uz/api \
npx playwright test e2e/rc-golden-path.spec.ts e2e/rc-auth.spec.ts e2e/leads-admin.spec.ts
```

## Sizing

2 vCPU / 2 GB runs the stack, but the images are built on the box and `docker compose
build` plus Postgres plus a browser hitting SSR will crowd 2 GB. 4 GB is the safer choice
for a single VPS carrying API + web + Postgres + Redis. Alternatively, build the images in
CI and pull them, which removes the memory spike entirely.

## Local rehearsal

The whole stack runs locally with plain HTTP on `:8080`, which is how everything above was
verified:

```bash
cp deploy/.env.staging.example .env.staging   # SITE_ADDRESS=:8080 is the default
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
curl -fsS http://localhost:8080/api/health
```

The Compose project is named `flowerp-staging`. Without that name it would collide with
the development `docker-compose.yml`, whose Postgres container has the same derived name —
bringing staging up would replace the development database container, and `down` would
delete it.
