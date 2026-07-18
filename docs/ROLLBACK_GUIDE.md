# Rollback Guide

Two kinds of "go back", and they are not the same:

- **Code rollback** — revert the API to its previous image. Fast, safe *when
  migrations are additive*. This is what `scripts/rollback.sh` and `rollback.yml`
  do.
- **Data rollback** — restore the database to a backup. Slower, lossy (writes
  after the backup are gone), and a separate tool
  (`scripts/restore-postgres.sh`, DISASTER_RECOVERY.md).

Reach for code rollback first. Data rollback is only for actual data corruption,
never for "the new version has a bug."

## How the rollback point exists

Before every swap, `deploy.sh` tags the currently-running (good) image as
`<repo>:previous`. Rollback re-points the live tag at that image and recreates
the API container from it — **no rebuild, no pull, no git checkout**. That makes
rollback near-instant and independent of the registry being reachable.

All rollback logic lives in `scripts/rollback.sh` (which shares `scripts/lib.sh`
with `deploy.sh`). There is no second copy in the workflow YAML.

## Automatic rollback (on a failed deploy)

You do nothing — it is built into every deploy. `deploy.sh` health-checks the new
API (`/health` then `/health/database`); if it never becomes healthy it calls
`rollback.sh --auto`, which restores the previous image and health-checks again.
The workflow then reports failure and notifies Slack. Net effect: a bad deploy
leaves production on the **previous, healthy** image, not half-deployed.

Verify after an auto-rollback:

```bash
curl -fsS https://<host>/api/health
curl -fsS https://<host>/api/health/database
```

## Manual rollback (deploy was healthy but wrong)

Some bad deploys pass health checks — the app is up but behaving wrong. Roll back
deliberately.

**Via GitHub (preferred):** Actions → **Rollback (production)** → Run workflow,
with a required reason. It is `production`-environment gated (approval), SSHes in,
and runs `rollback.sh` with `CONFIRM=ROLLBACK`.

**On the VPS directly (break-glass):**

```bash
cd /opt/flowerp
CONFIRM=ROLLBACK ./scripts/rollback.sh
```

`rollback.sh` refuses without `CONFIRM=ROLLBACK` (manual mode), tells you exactly
which image it will move from and to, no-ops if the running image already *is*
the previous one, and health-checks after switching. If it can't reach a healthy
state it stops and says manual intervention is required rather than leaving you
guessing.

## The destructive-migration caveat

Code rollback assumes the previous image runs against the current schema — true
for additive migrations. If the bad release shipped a **destructive** migration
(dropped/renamed a column, tightened a constraint), the old code may not run
against the new schema, and:

- **Do not** assume `rollback.sh` fixes it — it reverts code, not schema.
- The correct path is usually **forward**: a new release that repairs the issue.
- If the data itself is wrong, that is a data rollback — restore a backup
  (DISASTER_RECOVERY.md) and accept the RPO loss.

This is exactly why RELEASE_PROCESS.md forbids shipping a destructive migration
in the same release that stops using the old shape.

## After any rollback

- Confirm health (commands above) and a real login.
- Record what happened and why (the workflow run + reason input is your audit
  trail).
- Decide forward vs. stay: either the previous image is the resting state until a
  fix ships, or you roll forward to a hotfix (RELEASE_PROCESS.md).

## Quick reference

| Situation | Action |
| --- | --- |
| Deploy failed health check | Nothing — auto-rollback already ran; verify health |
| Deploy healthy but wrong | **Rollback (production)** workflow, or `CONFIRM=ROLLBACK ./scripts/rollback.sh` |
| Bad release included a destructive migration | Roll **forward** (new release); code rollback is unsafe |
| Data corrupted | `scripts/restore-postgres.sh` (DISASTER_RECOVERY.md), accept RPO |
| First ever deploy failed | No `<repo>:previous` yet — fix forward; nothing to roll back to |
