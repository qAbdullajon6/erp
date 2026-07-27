#!/usr/bin/env bash
# Roll the FlowERP API (+ WEB when a web rollback point exists) back to the
# previous images, health-gated.
#
# This is the SINGLE rollback implementation. deploy.sh calls it on a failed
# deploy (--auto); an operator calls it by hand to undo a bad-but-healthy deploy.
#
#   ./scripts/rollback.sh                 # interactive-safe manual rollback
#   ./scripts/rollback.sh --auto          # called by deploy.sh, no confirmation
#   ENV_FILE=.env.production ./scripts/rollback.sh
#
# How the rollback point exists: before every swap, deploy.sh tags the
# currently-running (good) images as `<repo>:previous` for api and web.
# Rollback re-points the live tags and recreates containers — no rebuild.
# Because migrations are additive (the standing rule), the previous code runs
# against the already-migrated schema. A DESTRUCTIVE migration breaks that
# contract: code-rollback is unsafe and the fix is forward.

set -Eeuo pipefail

cd "$(dirname "$0")/.."          # repo root, so compose/env paths resolve
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

require_env_file

LIVE_API_REF="$(api_live_ref || true)"
[[ -n "$LIVE_API_REF" ]] || die "no running api container — nothing to roll back"
API_REPO="${LIVE_API_REF%:*}"
PREV_API_REF="${API_REPO}:previous"

if ! docker image inspect "$PREV_API_REF" >/dev/null 2>&1; then
  die "no rollback point ($PREV_API_REF) exists. A rollback point is created by deploy.sh before each swap; the very first deploy has none."
fi

PREV_API_ID="$(docker image inspect --format '{{.Id}}' "$PREV_API_REF")"
LIVE_API_ID="$(docker image inspect --format '{{.Id}}' "$LIVE_API_REF" 2>/dev/null || echo '')"

LIVE_WEB_REF="$(web_live_ref || true)"
PREV_WEB_REF=""
ROLL_WEB=0
if [[ -n "$LIVE_WEB_REF" ]]; then
  PREV_WEB_REF="${LIVE_WEB_REF%:*}:previous"
  if docker image inspect "$PREV_WEB_REF" >/dev/null 2>&1; then
    PREV_WEB_ID="$(docker image inspect --format '{{.Id}}' "$PREV_WEB_REF")"
    LIVE_WEB_ID="$(docker image inspect --format '{{.Id}}' "$LIVE_WEB_REF" 2>/dev/null || echo '')"
    if [[ "$PREV_WEB_ID" != "$LIVE_WEB_ID" ]]; then
      ROLL_WEB=1
    fi
  fi
fi

if [[ "$PREV_API_ID" == "$LIVE_API_ID" && "$ROLL_WEB" -eq 0 ]]; then
  log "the running images already ARE the rollback points — nothing to do"
  exit 0
fi

if [[ "$AUTO" -ne 1 ]]; then
  echo "About to roll services back:"
  echo "  api from (live): $LIVE_API_REF  [$LIVE_API_ID]"
  echo "  api to   (prev): $PREV_API_REF  [$PREV_API_ID]"
  if [[ "$ROLL_WEB" -eq 1 ]]; then
    echo "  web from (live): $LIVE_WEB_REF"
    echo "  web to   (prev): $PREV_WEB_REF"
  fi
  echo "Set CONFIRM=ROLLBACK to proceed."
  [[ "${CONFIRM:-}" == "ROLLBACK" ]] || die "not confirmed"
fi

if [[ "$PREV_API_ID" != "$LIVE_API_ID" ]]; then
  log "rolling api back: $LIVE_API_REF -> image behind $PREV_API_REF"
  docker tag "$PREV_API_REF" "$LIVE_API_REF"
  compose up -d --no-build api
fi

if [[ "$ROLL_WEB" -eq 1 ]]; then
  log "rolling web back: $LIVE_WEB_REF -> image behind $PREV_WEB_REF"
  docker tag "$PREV_WEB_REF" "$LIVE_WEB_REF"
  compose up -d --no-build --force-recreate --no-deps web
fi

if wait_healthy; then
  if [[ -n "$LIVE_WEB_REF" ]]; then
    wait_web_healthy || die "web did not become healthy after rollback"
  fi
  log "rollback complete and healthy"
  compose ps api web
  exit 0
fi

echo "error: api did not become healthy after rollback" >&2
compose logs --tail=50 api >&2 || true
die "rollback did not reach a healthy state — manual intervention required"
