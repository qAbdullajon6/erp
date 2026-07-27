# Deployment hardening report — API + WEB as one application

Date: 2026-07-27  
Scope: deployment infrastructure only (no application / schema changes)

## What was wrong

`scripts/deploy.sh` rebuilt **only the API** image:

```bash
compose build api
compose up -d api
# … health …
compose up -d web   # reuses existing flowerp-web:local
```

After `git pull` / Actions deploy, Git HEAD and the API container moved forward,
but the **web container kept serving an older image**. Production UI looked
“stuck” even though the repo on the VPS was current.

## Why it happened

1. Deploy treated API as the only buildable artifact.
2. `compose up -d web` does not rebuild; it starts whatever image is already tagged.
3. There was no git-based “did apps/web change?” gate and no post-deploy check
   that the running web matched the deployed commit.

## What was changed

| File | Change |
| --- | --- |
| `scripts/lib.sh` | Change detection, `[DEPLOY]` logging helpers, web health wait, SHA verification, dual rollback tagging helpers |
| `scripts/deploy.sh` | Always `compose build api web` on local path; pull API + conditional web build when `API_IMAGE` set; force-recreate web; verify; write `.flowerp-deployed-sha` |
| `scripts/rollback.sh` | Rolls back **web** as well when a `:previous` web image exists |
| `docker-compose.yml` | `GIT_COMMIT_SHA` env on **web** (api already had it) |
| `.gitignore` | Ignore `.flowerp-deployed-sha` |
| `.github/workflows/deploy.yml` | Export `GIT_COMMIT_SHA`; document API+WEB deploy |
| `.github/workflows/ci.yml` | Build **API and WEB** images in CI |
| `.github/workflows/release.yml` | Comment: WEB still refreshed on VPS |
| `docs/DEPLOYMENT_PIPELINE.md` | Full pipeline, rebuild rules, cache, rollback, Actions |
| `deploy/README.md` / `docs/CI_CD_GUIDE.md` | Aligned with new behavior |

## Why the bug can no longer happen

1. **Local deploys (push to `main`)** always run `compose build api web` — never API-only.
2. **Prebuilt API path** still rebuilds WEB when `apps/web` (or shared lockfile /
   Dockerfile / postinstall inputs) changed since `.flowerp-deployed-sha`.
3. WEB is **force-recreated** after a rebuild so compose cannot keep a stale container.
4. **Verification** requires `GIT_COMMIT_SHA` inside **both** api and web containers
   to equal `git rev-parse HEAD`. Mismatch aborts and triggers rollback.
5. CI builds both images, so a broken web Dockerfile fails before merge/deploy.

## Remaining risks

| Risk | Mitigation / note |
| --- | --- |
| `VITE_MAPBOX_ACCESS_TOKEN` changed only in `.env.production` (not git) | Git diff will not see it. Use `FORCE_REBUILD_WEB=1 ./scripts/deploy.sh`. |
| Destructive DB migration | Rollback of code is unsafe (unchanged project rule). Stage migrations. |
| First deploy on a VPS | No `.flowerp-deployed-sha` ⇒ WEB treated as changed (full build). |
| Brief downtime on single-instance recreate | Unchanged; still not multi-replica zero-downtime. |
| Release workflow still only publishes API to GHCR | Intentional; WEB builds on VPS with cache. |

## Operator quick check after next production deploy

Look for:

```text
[DEPLOY] API changed .......... YES|NO
[DEPLOY] WEB changed .......... YES|NO
[DEPLOY] Building API .........
[DEPLOY] Building WEB .........
[DEPLOY] Waiting for API health...
[DEPLOY] Starting WEB.........
[DEPLOY] Restarting Caddy.....
[DEPLOY] API GIT_COMMIT_SHA .... <full sha>
[DEPLOY] WEB GIT_COMMIT_SHA .... <full sha>
[DEPLOY] Verification .......... PASS
[DEPLOY] Deployment complete.
```

Both SHAs must match `git rev-parse HEAD` on the VPS.
