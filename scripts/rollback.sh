#!/usr/bin/env bash
# Roll the FlowERP API back to the previous image, health-gated.
#
# This is the SINGLE rollback implementation. deploy.sh calls it on a failed
# deploy (--auto); an operator calls it by hand to undo a bad-but-healthy deploy.
#
#   ./scripts/rollback.sh                 # interactive-safe manual rollback
#   ./scripts/rollback.sh --auto          # called by deploy.sh, no confirmation
#   ENV_FILE=.env.prod ./scripts/rollback.sh
#
# How the rollback point exists: before every swap, deploy.sh tags the
# currently-running (good) image as `<repo>:previous`. Rollback re-points the
# live tag back at that image and recreates the api container from it — no
# rebuild, no pull. Because migrations are additive (the standing rule), the
# previous code runs against the already-migrated schema. A DESTRUCTIVE migration
# breaks that contract: code-rollback is unsafe and the fix is forward. This is
# exactly why destructive migrations are staged across two deploys.

set -Eeuo pipefail

cd "$(dirname "$0")/.."          # repo root, so compose/env paths resolve
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"

LIVE_REF="$(api_live_ref || true)"
[[ -n "$LIVE_REF" ]] || die "no running api container — nothing to roll back"
REPO="${LIVE_REF%:*}"
PREV_REF="${REPO}:previous"

if ! docker image inspect "$PREV_REF" >/dev/null 2>&1; then
  die "no rollback point ($PREV_REF) exists. A rollback point is created by deploy.sh before each swap; the very first deploy has none."
fi

PREV_ID="$(docker image inspect --format '{{.Id}}' "$PREV_REF")"
LIVE_ID="$(docker image inspect --format '{{.Id}}' "$LIVE_REF" 2>/dev/null || echo '')"
if [[ "$PREV_ID" == "$LIVE_ID" ]]; then
  log "the running image already IS the rollback point ($PREV_REF) — nothing to do"
  exit 0
fi

if [[ "$AUTO" -ne 1 ]]; then
  echo "About to roll the api service back:"
  echo "  from (live): $LIVE_REF  [$LIVE_ID]"
  echo "  to   (prev): $PREV_REF  [$PREV_ID]"
  echo "Set CONFIRM=ROLLBACK to proceed."
  [[ "${CONFIRM:-}" == "ROLLBACK" ]] || die "not confirmed"
fi

log "rolling api back: $LIVE_REF -> image behind $PREV_REF"
# Re-point the live tag at the previous image and recreate from it, no rebuild.
docker tag "$PREV_REF" "$LIVE_REF"
compose up -d --no-build api

if wait_healthy; then
  log "rollback complete and healthy"
  compose ps api
  exit 0
fi

echo "error: api did not become healthy after rollback" >&2
compose logs --tail=50 api >&2 || true
die "rollback did not reach a healthy state — manual intervention required"
