# Deployment Pipeline

How a change reaches production. There is **no staging environment** — only local
development and production on a single VPS.

```
 Developer
    │  push branch / open PR
    ▼
 GitHub CI (.github/workflows/ci.yml)
    │  typecheck · lint · unit · build · migrate · docker build
    ▼
 Merge to main
    │
    ▼
 Deploy (.github/workflows/deploy.yml)
    │  SSH → /opt/flowerp
    │  git checkout / reset to main
    │  ./scripts/deploy.sh
    │     · tag running API image as :previous
    │     · build (or pull API_IMAGE if set)
    │     · up postgres redis → api → wait /health
    │     · up web caddy
    │     · unhealthy → rollback.sh --auto
    ▼
 Production (flowerp.uz / api.flowerp.uz)
```

## Environments

| Name | Purpose | Compose / env |
| --- | --- | --- |
| Local | Day-to-day development | `docker-compose.local.yml` + `apps/*/.env.local` |
| Production | Live traffic | `docker-compose.yml` + `.env.production` |

## Deploy entry points

- **Push to `main`** — automatic deploy workflow (build on VPS).
- **`workflow_dispatch`** — manual ref; optional prebuilt `api_image`.
- **GitHub Release** — optional path that can pull `ghcr.io/<owner>/erp-api:<tag>` if images are published by `release.yml`.

All deploy logic lives in `scripts/deploy.sh` / `scripts/lib.sh`. The workflow only SSHs and invokes the script.

## Related docs

- `deploy/README.md` — first boot and day-2 ops
- `docs/DEPLOYMENT_REQUIRED_SECRETS.md` — secrets checklist
- `docs/DISASTER_RECOVERY.md` — restore runbook
- `docs/SECRETS_GUIDE.md` — where secrets live
