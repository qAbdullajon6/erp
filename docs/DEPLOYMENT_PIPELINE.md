# Deployment Pipeline

The complete lifecycle of a change, from a developer's branch to running in
production — and why each hop exists. This is the map; the other docs are the
detail (CI_CD_GUIDE, RELEASE_PROCESS, ROLLBACK_GUIDE, SECRETS_GUIDE,
GITHUB_SETUP).

Two things ship on two paths, on purpose:

- **The API** → GHCR image → the VPS (this pipeline).
- **The frontend** → Vercel, Git-driven (native, no workflow).

## The lifecycle

```
 Developer
    │  push branch / open PR
    ▼
 GitHub  ──────────────────────────────────────────────────────────────────┐
    │                                                                        │
    ▼                                                                        │
 CI (.github/workflows/ci.yml)                                              │
    │  web: typecheck·lint·unit·build      ┐                                │
    │  api: nest build (src typecheck)     │ blocking — must pass to merge   │
    │  migrations: apply to ephemeral PG   │                                │
    │  docker: build API image (no push)   ┘                                │
    │  api-quality / api-tests  → non-blocking (tracks known test debt)     │
    ▼                                                                        │
 Merge to main ──► Vercel builds & deploys the frontend (production)  ◄──────┘
    │              (a preview deploy was already posted on the PR)
    │
    │  maintainer cuts a release: git tag vX.Y.Z && push tag
    ▼
 Release (.github/workflows/release.yml)
    │  docker build ──► push  ghcr.io/<owner>/erp-api:vX.Y.Z (+ maj.min, sha)
    │  create GitHub Release (generated notes)
    ▼
 Deploy (.github/workflows/deploy.yml)   [environment: production → approval]
    │  workflow_dispatch (manual/hotfix)  OR  release published (auto)
    │  SSH to VPS ──► scripts/deploy.sh vX.Y.Z   (NO deploy logic in the workflow)
    │
    ├─► deploy.sh on the VPS:
    │      2. tag running image  <repo>:previous     (rollback point)
    │      3. docker compose pull api                (the CI-built image)
    │      4. up -d postgres redis → up -d api
    │           └─ container entrypoint: prisma migrate deploy → node
    │      5. wait_healthy: /health then /health/database
    │      6. unhealthy? ──► scripts/rollback.sh --auto ──┐
    │      7. healthy? ──► up -d caddy → done             │
    ▼                                                     │
 Health check ── ok ──► Production (Caddy routes traffic) │
    │                                                     │
    └── fail ──► Auto-rollback (previous image) ──────────┘
                     │
                     ▼
                 Notify (Slack, on failure)
```

## Stage by stage

**Developer → GitHub.** Work on a branch, open a PR into `main`. Branch
protection (GITHUB_SETUP.md §4) requires the blocking CI checks and a review.

**CI.** `ci.yml` runs on every PR. Blocking jobs are the ones proven green: the
web quartet (typecheck/lint/unit/build), the API `nest build` (which is the `src`
typecheck, via `tsconfig.build.json`), a real `prisma migrate deploy` against an
ephemeral Postgres (plus `migrate status` to assert no drift), and a Docker build
of the API image. Two jobs are deliberately `continue-on-error` — the full API
typecheck/lint (red only on the telematics `*.e2e-spec.ts` debt) and the API unit
tests (not yet stabilised). They stay visible without blocking every PR. Rationale
in CI_CD_GUIDE.md.

**Merge → frontend deploy.** Merging to `main` triggers Vercel's native Git
integration to build and deploy the frontend. Each PR already got its own preview
URL. No GitHub workflow is involved (see *Vercel*, below).

**Tag → Release.** A maintainer cuts `vX.Y.Z`. `release.yml` builds the API image
**once** and pushes it to GHCR (semver + `maj.min` + `sha` tags), then creates a
GitHub Release. Building once and pulling that exact artifact is what makes the
deployed image bit-identical to what was tested. RELEASE_PROCESS.md.

**Deploy.** `deploy.yml` (manual, hotfix, or auto-on-release) stops at the
`production` environment gate for approval, then SSHes to the VPS and runs
`scripts/deploy.sh`. The workflow carries no deploy logic — it sets
`API_IMAGE=ghcr.io/<owner>/erp-api:<tag>` and calls the script. deploy.sh pulls
that image, brings up datastores, recreates the API (which runs `migrate deploy`
on boot), and health-gates the result.

**Health check → Production / Rollback.** deploy.sh polls `/health` then
`/health/database`. Healthy → Caddy is (re)started last and routes traffic.
Unhealthy → deploy.sh calls `rollback.sh --auto`, which re-points the API to the
`<repo>:previous` image and health-checks again. ROLLBACK_GUIDE.md.

**Notify.** On any deploy/rollback failure, the workflow posts to Slack if
`SLACK_WEBHOOK_URL` is set (otherwise the step is skipped, not failed).

## Vercel — the frontend path (recommended architecture)

**Recommendation: native GitHub → Vercel Git integration. Do not add a
GitHub-Action-drives-Vercel-CLI workflow.** Only the recommended option is
implemented — which here means *nothing to implement in the repo*; it is the
Vercel GitHub App plus project settings (GITHUB_SETUP.md §8).

Why native over an Action + `vercel` CLI:

- **Preview per PR for free.** The App posts a unique preview deployment on every
  PR and comments the URL — exactly the frontend equivalent of CI. Reproducing
  that with the CLI is real work.
- **No secrets in GitHub.** The App owns the Vercel side; there is no
  `VERCEL_TOKEN`/`ORG_ID`/`PROJECT_ID` to store or rotate. Fewer secrets is
  fewer things to leak (SECRETS_GUIDE.md).
- **Vercel builds where its cache lives.** Nitro's `vercel` preset + Vercel's
  build cache are faster and better-supported than reimplementing the build in
  an Action. The VPS also never builds the frontend — deploy/README.md's sizing
  note depends on that.
- **Rollback in one click.** Vercel keeps every deployment; promoting a previous
  one is a dashboard action, no pipeline needed.
- **One moving part, not two.** An Action + CLI adds a second deploy path that
  can disagree with the native one. The only integration point that must stay in
  lockstep is the `vercel.json` rewrite host = the VPS `SITE_ADDRESS`
  (deploy/README.md).

The Action-drives-CLI approach is the right choice only if deploys must be gated
behind repo-side logic Vercel can't express, or the frontend must deploy to a
non-Vercel host. Neither is true here, so it is deliberately not used.

## What is reused, not rebuilt

This pipeline sits on top of the existing infrastructure and adds no parallel
copy of it:

- `scripts/deploy.sh` / `scripts/rollback.sh` / `scripts/lib.sh` — the deploy and
  rollback logic, called by the workflows, never duplicated in YAML.
- `docker-compose.staging.yml` — the production topology; the pipeline only adds
  an optional `API_IMAGE` override so a prebuilt image can be pulled.
- The `/health` + `/health/database` endpoints — the same probes Caddy and the
  container `HEALTHCHECK` use.
- `prisma migrate deploy` — the same command the API runs on boot, validated in
  CI before it ever runs in production.
