# Deployment Pipeline

How a change reaches production. There is **no staging environment** — only local
development and production on a single VPS.

```
 Developer
    │  push branch / open PR
    ▼
 GitHub CI (.github/workflows/ci.yml)
    │  typecheck · lint · unit · build · migrate
    │  docker build API + WEB
    ▼
 Merge to main
    │
    ▼
 Deploy (.github/workflows/deploy.yml)
    │  SSH → /opt/flowerp
    │  git checkout / reset to main
    │  export GIT_COMMIT_SHA=$(git rev-parse HEAD)
    │  ./scripts/deploy.sh
    │     · detect API/WEB changes (git diff vs .flowerp-deployed-sha)
    │     · tag running api+web images as :previous
    │     · up postgres + redis
    │     · local: compose build api web  (always both)
    │     · or:    compose pull api + build web if changed
    │     · recreate api → wait /health + /health/database
    │     · recreate web → wait web healthy
    │     · recreate caddy
    │     · verify health + GIT_COMMIT_SHA in api AND web
    │     · write .flowerp-deployed-sha
    │     · unhealthy / verify fail → rollback.sh --auto
    ▼
 Production (flowerp.uz / api.flowerp.uz)
```

## What was wrong before

`scripts/deploy.sh` only ran `compose build api`, then `compose up -d web`
without rebuilding the web image. After `git pull`, the API matched HEAD while
`flowerp-web` kept serving an older Docker image — a stale production UI.

## Rebuild rules

| Mode | API | WEB |
| --- | --- | --- |
| Local build (`API_IMAGE` unset) — default for push-to-`main` | Always `compose build api` | Always `compose build web` in the **same** `compose build api web` invocation |
| Prebuilt API (`API_IMAGE` set) — release / manual | `compose pull api` | Rebuild only when web sources changed since last successful deploy, or web image is missing, or `FORCE_REBUILD_WEB=1` |

Change detection uses **git**, not timestamps:

- Previous SHA: `.flowerp-deployed-sha` (written only after a fully verified deploy)
- Current SHA: `git rev-parse HEAD`
- API watch paths: `apps/api`, `apps/api/Dockerfile`, root `package.json` / `package-lock.json`, postinstall scripts
- WEB watch paths: `apps/web`, `apps/web/Dockerfile`, same shared lockfile / postinstall inputs

Docker **layer cache** remains enabled. Unchanged layers are reused; we do not
pass `--no-cache`.

## Health-gated order

1. postgres + redis  
2. build / pull images  
3. recreate **api** (runs `prisma migrate deploy` then serves)  
4. wait until `/health` and `/health/database` pass  
5. recreate **web**  
6. wait until web responds on `:3000`  
7. force-recreate **caddy** (reload Caddyfile + ACME)  
8. verify (below)

## Post-deploy verification

Deploy aborts (and triggers auto-rollback) unless all of the following pass:

- API `GET /health`
- API `GET /health/database`
- WEB HTTP probe inside the container (`http://127.0.0.1:3000/`)
- WEB container not in a failed Docker health state
- `GIT_COMMIT_SHA` inside **api** equals deployed git SHA
- `GIT_COMMIT_SHA` inside **web** equals deployed git SHA

`GIT_COMMIT_SHA` is injected at **runtime** via `docker-compose.yml` (exported by
`deploy.sh`). It is not baked early in the Dockerfile, so it does not bust the
`npm ci` layer cache.

## Rollback

`scripts/rollback.sh` is the single rollback implementation.

- Before each swap, deploy tags running `api` and `web` images as `:previous`.
- On failed health or failed verification, deploy calls `rollback.sh --auto`.
- Manual: `CONFIRM=ROLLBACK ./scripts/rollback.sh`
- Migrations must stay additive; destructive migrations are not rollback-safe.

## GitHub Actions

| Workflow | Role |
| --- | --- |
| `ci.yml` | PR/push validation; builds **both** API and WEB images (no push) |
| `deploy.yml` | Push to `main`, manual dispatch, or release → SSH → `deploy.sh` |
| `release.yml` | Tag `v*.*.*` → build/push API to GHCR; VPS still refreshes WEB via deploy.sh |
| `rollback.yml` | Manual SSH → `rollback.sh` |

Push to `main` never requires a manual web rebuild. `deploy.sh` always treats
API+WEB as one application on the local-build path.

## Operator overrides

```bash
# Force a web rebuild even if git says unchanged
FORCE_REBUILD_WEB=1 ./scripts/deploy.sh

# Pull a prebuilt API from GHCR; web still follows git change detection
API_IMAGE=ghcr.io/OWNER/erp-api:v1.4.0 ./scripts/deploy.sh v1.4.0
```

## Environments

| Name | Purpose | Compose / env |
| --- | --- | --- |
| Local | Day-to-day development | `docker-compose.local.yml` + `apps/*/.env.local` |
| Production | Live traffic | `docker-compose.yml` + `.env.production` |

## Related docs

- `deploy/README.md` — first boot and day-2 ops
- `docs/DEPLOYMENT_REQUIRED_SECRETS.md` — secrets checklist
- `docs/DISASTER_RECOVERY.md` — restore runbook
- `docs/SECRETS_GUIDE.md` — where secrets live
- `docs/CI_CD_GUIDE.md` — workflow details
