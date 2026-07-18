# Staging deployment

**The frontend is deployed to Vercel. The VPS serves the API alone**, in four containers:
PostgreSQL, Redis, the NestJS API, and Caddy in front of it. Everything below was
rehearsed locally against `docker-compose.staging.yml` before it was written down.

## How a request reaches the API

The browser only ever talks to the Vercel origin. Vercel's rewrite
(`apps/web/vercel.json`) proxies `/api/*` to `https://staging.flowerp.uz/api/*`
server-side, and Caddy on the VPS strips the `/api` prefix before the API sees it.

Three things make this the shape it is:

- **The API mounts its routes at the root** — `/auth/login`, `/orders` — not under `/api`.
  The Vite dev server rewrites the prefix away; every proxy in front of it must do the
  same, or every call 404s. Caddy's `handle_path` does exactly that; a plain `handle`
  would not.
- **The built frontend has no `/api` route at all.** The dev proxy does not exist in the
  production bundle, so without a rewrite in front the app loads and every request 404s —
  a failure that looks like a frontend bug and is not.
- **Because Vercel's rewrite is a server-side proxy, the browser sees one origin.** No
  cross-origin request is made, no CORS preflight happens, and the `sessionStorage` tokens
  behave exactly as they do locally. `CORS_ORIGIN` is still set on the API for the case
  where it is called directly.

Vercel does not expand environment variables in `vercel.json`, so the API host is written
out there. Change it in lockstep with `SITE_ADDRESS` in `.env.staging`.

## Vercel project settings

- **Root Directory**: `apps/web`
- **Output Directory**: leave empty. Nitro's `vercel` preset writes `.vercel/output`
  (Build Output API v3), which Vercel detects on its own. Setting it to `build` is what
  produced *"No Output Directory named build found"* — no preset here emits `build/`.

The preset is chosen automatically: `vercel` when the `VERCEL` environment variable is
present, `node-server` otherwise (local builds, and the `web` profile below).

## Prerequisites on the VPS

Ubuntu LTS, Docker with the Compose plugin, and a firewall that allows only `80`, `443`
and SSH. Postgres and Redis publish no ports — they are reachable on the Compose network
and nowhere else. A database port open to the internet is how staging databases get
emptied.

## First deploy

```bash
git clone <repo> /opt/flowerp && cd /opt/flowerp
cp deploy/.env.staging.example .env.staging
```

Fill in `.env.staging`:

```bash
# Point the DNS A record at this VPS *before* starting Caddy, or the ACME
# challenge fails and you get a self-signed certificate. This host must match
# the rewrite destination in apps/web/vercel.json.
SITE_ADDRESS=staging.flowerp.uz
HTTP_PORT=80
HTTPS_PORT=443

# The origin the browser sees — the Vercel deployment, not this VPS. Used as the
# API's CORS_ORIGIN. Vercel's rewrite is server-side, so no preflight is ever
# sent, but a wrong value bites the moment the API is called directly.
PUBLIC_ORIGIN=https://<your-project>.vercel.app

# Generated with openssl, which a fresh Ubuntu already has — the VPS needs no
# Node at all, since everything is built inside containers.
#   openssl rand -base64 24 | tr '+/' '-_' | tr -d '='   # POSTGRES_PASSWORD
#   openssl rand -base64 48 | tr '+/' '-_' | tr -d '='   # JWT_ACCESS_SECRET
POSTGRES_PASSWORD=...
JWT_ACCESS_SECRET=...

# Database connection pool: docker-compose.staging.yml includes production-ready
# pool parameters (connection_limit=30, pool_timeout=10, connect_timeout=30).
# The POSTGRES_* variables above are interpolated into DATABASE_URL automatically.
# Tune connection_limit if running multiple instances — see .env.staging.example.
```

Then:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

The API container runs `prisma migrate deploy` on start. It never runs `migrate dev`,
which offers to reset the database.

Check it came up:

```bash
curl -fsS https://staging.flowerp.uz/api/health
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
17 3 * * * cd /opt/flowerp && OFFSITE_COMMAND='rclone copy' ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
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

The VPS answers the API only, so check it directly first:

```bash
curl -fsS https://staging.flowerp.uz/api/health
curl -o /dev/null -s -w '%{http_code}\n' https://staging.flowerp.uz/   # 404, by design
```

Then point the e2e suite at the **Vercel** origin — that is where the browser goes, and
its rewrite is part of what needs testing. These are the same specs the release candidate
used, so a pass means the deployed build behaves like the one that was signed off:

```bash
cd apps/web
FRONTEND_URL=https://<your-project>.vercel.app \
API_URL=https://<your-project>.vercel.app/api \
npx playwright test e2e/rc-golden-path.spec.ts e2e/rc-auth.spec.ts e2e/leads-admin.spec.ts
```

## Sizing

2 vCPU / 2 GB runs the API stack. The memory pressure comes from `docker compose build` on
the box, not from serving: the frontend is built on Vercel, so the VPS never bundles it.
4 GB is still the safer choice, or build the API image in CI and pull it, which removes the
spike entirely.

## Local rehearsal

The whole stack, frontend included, runs locally over plain HTTP on `:8080`. This is how
everything above was verified — it puts the SSR frontend and the API on one origin, which
is what Vercel's rewrite makes it look like in production:

```bash
cp deploy/.env.staging.example .env.staging   # SITE_ADDRESS=:8080 is the default

CADDYFILE=./deploy/Caddyfile.local docker compose \
  -f docker-compose.staging.yml --env-file .env.staging --profile web up -d --build

curl -fsS http://localhost:8080/api/health
curl -o /dev/null -s -w '%{http_code}\n' http://localhost:8080/        # 200, the frontend
```

Drop `CADDYFILE` and `--profile web` to bring up exactly what the VPS runs: the API alone,
with `/` answering 404.

The Compose project is named `flowerp-staging`. Without that name it would collide with
the development `docker-compose.yml`, whose Postgres container has the same derived name —
bringing staging up would replace the development database container, and `down` would
delete it.
