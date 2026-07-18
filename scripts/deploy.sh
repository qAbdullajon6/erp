#!/usr/bin/env bash
# Deploy the FlowERP API stack on the VPS, health-gated, with automatic rollback.
#
#   ./scripts/deploy.sh                       # build locally + deploy current checkout
#   ./scripts/deploy.sh v1.4.0                # checkout a ref, then build + deploy
#   API_IMAGE=ghcr.io/OWNER/erp-api:v1.4.0 ./scripts/deploy.sh v1.4.0   # pull prebuilt
#   ENV_FILE=.env.prod ./scripts/deploy.sh
#
# What it does, in order:
#   1. (optional) checks out the requested git ref
#   2. records the running API image and tags it `<repo>:previous` (rollback point)
#   3. gets the new image: PULLS it if API_IMAGE is set (CI built it and pushed to
#      GHCR), otherwise BUILDS it locally — the original single-VPS behaviour
#   4. recreates the stack; the API container runs `prisma migrate deploy` on
#      start, so the migration happens as part of the swap, before it serves
#   5. polls /health then /health/database until the new API is ready
#   6. if it never becomes healthy, delegates to scripts/rollback.sh --auto
#
# Prebuilt vs. local build: pointing API_IMAGE at a GHCR tag CI pushed removes the
# build from the VPS entirely (the memory spike deploy/README.md warns about) and
# makes the deployed artifact bit-identical to what CI tested. Leaving API_IMAGE
# unset preserves the original build-on-the-box path unchanged.
#
# Migration ordering assumption: migrations are additive / backward-compatible
# (the project's standing rule). That is what makes step 4 safe and rollback
# safe: the previous code still runs against the migrated schema. A destructive
# migration breaks this and must be staged across two deploys (add nullable ->
# backfill -> constrain), never shipped in one.
#
# Single-instance caveat (honest): with one API container, recreating it is a
# brief connection reset, not true zero-downtime — Caddy health-gates new traffic
# (health_uri /health) but the old container does stop. For genuine zero-downtime,
# run two API replicas behind Caddy and recreate them one at a time; the
# in-process schedulers must then move to a single-runner (TD-018 / the deployment
# report) so crons do not double-fire. Correct and safe for single-instance.

set -Eeuo pipefail

cd "$(dirname "$0")/.."          # repo root, so compose/env paths resolve
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"  # compose(), log(), die(), wait_healthy(), api_live_ref()

API_IMAGE="${API_IMAGE:-}"       # set -> pull a prebuilt image; unset -> build locally
GIT_REF="${1:-}"

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"

# --- 1. optional git ref -----------------------------------------------------
if [[ -n "$GIT_REF" ]]; then
  log "checking out $GIT_REF"
  git fetch --all --tags --prune
  git checkout "$GIT_REF"
fi
DEPLOY_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
log "deploying $DEPLOY_REF ${API_IMAGE:+(image: $API_IMAGE)}"

# --- 2. record the current API image as the rollback point -------------------
# Tag the running image `<repo>:previous` so rollback.sh can find it after the
# swap re-points the live tag at the new image.
PREV_LIVE_REF="$(api_live_ref || true)"
if [[ -n "$PREV_LIVE_REF" ]]; then
  PREV_ROLLBACK_REF="${PREV_LIVE_REF%:*}:previous"
  docker tag "$PREV_LIVE_REF" "$PREV_ROLLBACK_REF"
  log "rollback point tagged: $PREV_ROLLBACK_REF (was $PREV_LIVE_REF)"
else
  log "no running api container — first deploy, no rollback point"
fi

# --- 3. get the new image: pull (prebuilt) or build (local) ------------------
API_UP_ARGS=""
if [[ -n "$API_IMAGE" ]]; then
  log "pulling prebuilt API image"
  compose pull api
  API_UP_ARGS="--no-build"
else
  log "building API image locally"
  compose build api
fi

# --- 4. recreate the stack (API migrates on start) ---------------------------
log "starting datastores"
compose up -d postgres redis
log "recreating api (runs prisma migrate deploy, then serves)"
# shellcheck disable=SC2086  # API_UP_ARGS is intentionally word-split (empty or --no-build)
compose up -d $API_UP_ARGS api

# --- 5. health verification --------------------------------------------------
if wait_healthy; then
  # --- 7. reverse proxy last: it health-polls the API and only routes when
  # /health passes, so it never sends traffic to an API mid-migration.
  log "ensuring caddy is up"
  compose up -d caddy
  log "deploy of $DEPLOY_REF complete and healthy"
  compose ps
  exit 0
fi

# --- 6. rollback on failure (single implementation, in rollback.sh) ----------
echo "error: new api did not become healthy" >&2
compose logs --tail=50 api >&2 || true
if [[ -n "$PREV_LIVE_REF" ]]; then
  log "auto-rollback via scripts/rollback.sh"
  ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash "$(dirname "$0")/rollback.sh" --auto || true
  die "deploy failed; auto-rollback attempted. Investigate before retrying."
fi
die "deploy failed and there is no previous image to roll back to. Stack left as-is for inspection."
