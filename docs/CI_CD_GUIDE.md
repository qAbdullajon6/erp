# CI/CD Guide

The workflows in `.github/workflows/`, what each does, which checks block a merge
and which don't, and how to reproduce a failure locally. Setup is in
GITHUB_SETUP.md; the end-to-end map is DEPLOYMENT_PIPELINE.md.

## The four workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PR to `main`, push to `main` | Validates a change: lint, typecheck, unit tests, builds, migration apply, Docker build |
| `release.yml` | push tag `v*.*.*` | Builds + pushes the API image to GHCR, creates the GitHub Release |
| `deploy.yml` | push to `main`, manual (`workflow_dispatch`), or release published | SSHes to the VPS and runs `scripts/deploy.sh` (API+WEB, approval-gated) |
| `rollback.yml` | manual (`workflow_dispatch`) | SSHes to the VPS and runs `scripts/rollback.sh` (approval-gated) |

## CI jobs — blocking vs. non-blocking

Blocking jobs are calibrated to what is **verified green today**, so a PR is not
perpetually red for reasons unrelated to it.

**Blocking (must pass to merge — set these as required checks, GITHUB_SETUP.md §4):**

| Job | What it proves |
| --- | --- |
| `Web · typecheck · lint · unit · build` | The frontend typechecks, lints clean, unit tests pass, and the production `vite build` succeeds. |
| `API · build` | `nest build` compiles `src` via `tsconfig.build.json` (excludes `test/`). |
| `API · lint + full typecheck` | `eslint "src/**/*.ts"` and full `tsc --noEmit` incl. `test/` (Sprint B gate). |
| `API · unit tests` | Jest unit suite against ephemeral Postgres (Sprint B gate). |
| `Migrations · apply … + status` | All migrations apply cleanly via `prisma migrate deploy`, and `migrate status` shows no drift. |
| `Docker · build API + WEB images` | Production API and WEB images build (multi-stage, non-root, tini, HEALTHCHECK). |
| `Playwright · enterprise regression suite` | Seeded test org + Chromium regression project (Sprint A gate). |

**Non-blocking:** none. Sprint B removed `continue-on-error` from API lint/typecheck
and API unit tests after those suites reached zero errors.

Remaining lint note (does **not** fail CI): one `@typescript-eslint/no-unsafe-argument`
warning in `subscription-renewal.worker.ts` where the cron path passes `null as any`
as actor — widening `cancelSubscription` to accept `null` would change null-safe
audit writes and is deferred.

## Reproduce CI locally

Everything CI runs has a local equivalent — CI reuses the repo's own scripts, it
doesn't invent commands:

```bash
npm ci

# Web (all blocking)
npm run typecheck:web
npm run lint:web
npm run test --workspace=apps/web
npm run build:web

# API build (blocking) — the src typecheck
npm run prisma:generate
npm run build:api

# Migrations (blocking) — needs a Postgres; the dev one works
cd apps/api && npx prisma migrate deploy && npx prisma migrate status

# Docker images (blocking) — API and WEB
docker build -f apps/api/Dockerfile -t flowerp-api:local .
docker build -f apps/web/Dockerfile -t flowerp-web:local .

# API quality + unit tests (blocking after Sprint B)
cd apps/api && npx eslint "src/**/*.ts"
npm run typecheck:api
npm run test:api
```

## Reading a failure

- **A blocking web/api-build/docker/api-quality/api-tests job is red** → a real
  regression in this PR. Reproduce with the matching command above.
- **`Migrations` is red** → a migration doesn't apply cleanly or drifts from the
  schema. Check the new migration SQL (database-migrations discipline).
- **`Playwright · enterprise regression` is red** → seed, API boot, or an e2e
  assertion failed; check the uploaded Playwright report artifact.
- **`Deploy`/`Rollback` red** → see ROLLBACK_GUIDE.md; deploy.sh auto-rolls-back
  on a failed health check **or failed post-deploy verification** (including
  API/WEB `GIT_COMMIT_SHA` mismatch), so the VPS is not left with a stale UI.

## Caching & runners

- Node deps cache via `actions/setup-node` (`cache: npm`, keyed on the root
  lockfile). Docker layers cache via `type=gha` in buildx.
- All jobs run on `ubuntu-latest`, Node 24 (matching the images' `node:24`).
- `concurrency` cancels superseded CI runs per ref; the deploy/rollback lock
  (`group: deploy-production`, no cancel) guarantees prod actions never overlap.
