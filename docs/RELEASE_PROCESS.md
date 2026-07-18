# Release Process

How a tested `main` becomes a versioned artifact and reaches production. The
release and the deploy are two deliberate steps: tagging builds an immutable
image; deploying ships it after an approval.

## Versioning

- Semver `vMAJOR.MINOR.PATCH`. MAJOR = a breaking change (incl. a migration that
  isn't backward-compatible — which itself must be staged, see below); MINOR = a
  feature; PATCH = a fix.
- The git tag is the single source of the version. `release.yml` derives the
  image tags from it (`vX.Y.Z`, `X.Y`, and the commit `sha`).

## Cutting a release

Preconditions: `main` is green on the blocking CI checks and the change is
verified.

```bash
git checkout main && git pull
git tag -a v1.4.0 -m "v1.4.0"
git push origin v1.4.0
```

Pushing the tag triggers `release.yml`, which:

1. Builds the API image **once** and pushes it to GHCR as
   `ghcr.io/<owner>/erp-api:1.4.0`, `:1.4`, and `:sha-<commit>`.
2. Creates a GitHub Release for the tag with auto-generated notes.

The frontend is not part of this — Vercel deploys it from `main` independently
(DEPLOYMENT_PIPELINE.md → Vercel).

## Deploying the release

Deploy is a separate, approval-gated action so a build is never a surprise ship.
Two ways, same `deploy.yml`:

- **Auto on publish**: publishing the GitHub Release fires `deploy.yml` — it still
  stops at the `production` environment for reviewer approval before touching the
  VPS.
- **Manual**: Actions → **Deploy (production)** → Run workflow, with
  `image_tag = v1.4.0`, `ref = v1.4.0` (or `main`), and a reason.

Either way the VPS pulls `ghcr.io/<owner>/erp-api:v1.4.0` and runs
`scripts/deploy.sh`, which migrates, health-gates, and auto-rolls-back on failure.

## Migration ordering (the one hard rule)

`prisma migrate deploy` runs as the API container boots, **before** it serves —
and CI already proved the migration applies. The deploy is safe *because
migrations are additive / backward-compatible*: the previous image (the rollback
target) still runs against the new schema.

A **destructive** change (drop/rename a column, tighten a constraint) breaks that
and must be split across releases:

1. Release N: add the new nullable column / new table; write to both.
2. Release N (data): backfill.
3. Release N+1: make it required / drop the old column, once nothing reads it.

Never ship a destructive migration in the same release that stops using the old
shape — it makes rollback unsafe. This is enforced by discipline and the PR
template, not by the tool.

## Hotfix release

A hotfix is the normal flow, compressed:

```bash
git checkout -b hotfix/x main    # or off the release tag if main moved on
# fix + verify
git push  # open PR, let CI run, merge
git tag -a v1.4.1 -m "v1.4.1" && git push origin v1.4.1
```

Then **Deploy (production)** with `image_tag = v1.4.1`. The same health-gate and
auto-rollback apply — a hotfix gets no less safety than a normal deploy. If the
hotfix is itself bad, roll back (ROLLBACK_GUIDE.md).

## After a release

- Confirm `curl -fsS https://<host>/api/health` and `/api/health/database`.
- One real login through the Vercel frontend.
- Watch the first minutes (logs, or the opt-in monitoring stack).
- The image stays in GHCR; it is the rollback-forward target if needed.
