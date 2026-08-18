#!/usr/bin/env bash
# Deploy the FlowERP API + WEB stack on the VPS, health-gated, with automatic rollback.
#
#   ./scripts/deploy.sh                       # build locally + deploy current checkout
#   ./scripts/deploy.sh v1.4.0                # checkout a ref, then build + deploy
#   API_IMAGE=ghcr.io/OWNER/erp-api:v1.4.0 ./scripts/deploy.sh v1.4.0   # pull prebuilt API
#   ENV_FILE=.env.production ./scripts/deploy.sh
#
# API and WEB are one deployable application. Local builds always run
# `compose build api web` so the frontend cannot stay on a stale image while
# Git HEAD moves. When API_IMAGE is set, the API is pulled from the registry
# and WEB is still rebuilt whenever apps/web (or shared build inputs) changed
# since the last successful deploy (git diff vs .flowerp-deployed-sha).
#
# Order:
#   1. optional git checkout
#   2. detect API/WEB changes (git)
#   3. tag running api+web images as :previous
#   4. up postgres + redis + traccar (GPS bridge — see docs/TRACCAR_SETUP.md)
#   4. up postgres + redis
#   5. pull/build images
#   6. recreate api → wait /health + /health/database
#   7. recreate web → wait web healthy
#   8. recreate caddy
#   9. verify (health + GIT_COMMIT_SHA in both containers)
#  10. check Traccar health (warns only — never fails the deploy, see lib.sh)
#  11. on failure → scripts/rollback.sh --auto
#  10. on failure → scripts/rollback.sh --auto
#
# Migration ordering assumption: migrations are additive / backward-compatible
# (the project's standing rule). Destructive migrations must be staged.

set -Eeuo pipefail

cd "$(dirname "$0")/.."          # repo root, so compose/env paths resolve
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"  # compose(), log(), die(), wait_healthy(), …

API_IMAGE="${API_IMAGE:-}"       # set -> pull a prebuilt API image; unset -> build locally
GIT_REF="${1:-}"
FORCE_REBUILD_WEB="${FORCE_REBUILD_WEB:-0}"

# Validate and load .env.production before any docker compose call.
require_env_file

# --- 1. optional git ref -----------------------------------------------------
if [[ -n "$GIT_REF" ]]; then
  log "checking out $GIT_REF"
  git fetch --all --tags --prune
  git checkout "$GIT_REF"
fi

DEPLOY_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
DEPLOY_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
[[ -n "$DEPLOY_SHA" ]] || die "unable to resolve git HEAD"
export GIT_COMMIT_SHA="$DEPLOY_SHA"

PREV_DEPLOY_SHA="$(read_previous_deploy_sha || true)"

# --- 2. change detection (git diff vs last successful deploy) ----------------
API_CHANGED=NO
WEB_CHANGED=NO
if paths_changed_between "$PREV_DEPLOY_SHA" "$DEPLOY_SHA" "${API_WATCH_PATHS[@]}"; then
  API_CHANGED=YES
fi
if paths_changed_between "$PREV_DEPLOY_SHA" "$DEPLOY_SHA" "${WEB_WATCH_PATHS[@]}"; then
  WEB_CHANGED=YES
fi

# First deploy / missing prior SHA / missing web image ⇒ treat WEB as changed.
if [[ -z "$PREV_DEPLOY_SHA" ]] || ! image_exists "flowerp-web:local"; then
  WEB_CHANGED=YES
fi
if [[ "$FORCE_REBUILD_WEB" == "1" ]]; then
  WEB_CHANGED=YES
fi

deploy_log "Deploy ref ........... $DEPLOY_REF ($DEPLOY_SHA)"
deploy_log "Previous deploy ...... ${PREV_DEPLOY_SHA:-none}"
deploy_log "API_IMAGE ............ ${API_IMAGE:-build-on-vps}"
deploy_log "API changed .......... $API_CHANGED"
deploy_log "WEB changed .......... $WEB_CHANGED"

# --- 3. record rollback points -----------------------------------------------
tag_rollback_point api
tag_rollback_point web

# --- 4. datastores + Traccar (GPS bridge) ------------------------------------
# Traccar has no depends_on relationship with api/web (own H2 database, no
# migration ordering to respect), so it starts here alongside postgres/redis
# rather than needing its own step. See check_traccar_health() in lib.sh for
# why it's verified but never gates the deploy.
deploy_log "Starting postgres + redis + traccar..."
compose up -d postgres redis traccar
# --- 4. datastores -----------------------------------------------------------
deploy_log "Starting postgres + redis..."
compose up -d postgres redis

# --- 5. get images: pull and/or build ----------------------------------------
API_UP_ARGS=""
WEB_BUILT=0

if [[ -n "$API_IMAGE" ]]; then
  deploy_log "Pulling prebuilt API image..."
  compose pull api
  API_UP_ARGS="--no-build"

  if [[ "$WEB_CHANGED" == "YES" ]]; then
    deploy_log "Building WEB ........."
    compose build web
    WEB_BUILT=1
  else
    deploy_log "Skipping WEB rebuild (unchanged since last deploy)"
  fi
else
  # Local path: API + WEB are one unit. Always invoke build for both so a
  # frontend-only change cannot be skipped by an API-only habit; Docker layer
  # cache keeps the unchanged side cheap.
  deploy_log "Building API ........."
  deploy_log "Building WEB ........."
  compose build api web
  WEB_BUILT=1
fi

# --- 6. recreate API (migrates on start) -------------------------------------
deploy_log "Recreating API ......."
# shellcheck disable=SC2086  # API_UP_ARGS is intentionally word-split (empty or --no-build)
compose up -d $API_UP_ARGS api

# --- 7. health + web + caddy -------------------------------------------------
if wait_healthy; then
  deploy_log "Starting WEB........."
  if [[ "$WEB_BUILT" -eq 1 || "$WEB_CHANGED" == "YES" ]]; then
    # Force recreate so compose cannot keep a stale container on an old image id.
    compose up -d --force-recreate --no-deps web
  else
    # Even when the image is unchanged, recreate if the running container still
    # carries a stale GIT_COMMIT_SHA (env-only drift after git pull).
    RUNNING_WEB_SHA="$(container_env web GIT_COMMIT_SHA 2>/dev/null || true)"
    if [[ "$RUNNING_WEB_SHA" != "$DEPLOY_SHA" ]]; then
      compose up -d --force-recreate --no-deps web
    else
      compose up -d --no-deps web
    fi
  fi

  if ! wait_web_healthy; then
    echo "error: web did not become healthy" >&2
    compose logs --tail=50 web >&2 || true
    if service_live_ref api >/dev/null 2>&1; then
      log "auto-rollback via scripts/rollback.sh"
      ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash "$(dirname "$0")/rollback.sh" --auto || true
    fi
    die "deploy failed; web unhealthy. Auto-rollback attempted."
  fi

  # The Caddyfile is bind-mounted from the host. Force-recreate so Caddy
  # reloads the file and reconciles ACME SANs after git pull.
  deploy_log "Restarting Caddy....."
  compose up -d --force-recreate --no-deps caddy

  if ! verify_deployment "$DEPLOY_SHA"; then
    compose logs --tail=50 api web >&2 || true
    if service_live_ref api >/dev/null 2>&1; then
      log "auto-rollback via scripts/rollback.sh"
      ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash "$(dirname "$0")/rollback.sh" --auto || true
    fi
    die "deploy failed verification; auto-rollback attempted."
  fi

  # Non-blocking: never fails the deploy or triggers rollback (see lib.sh),
  # only makes sure a broken GPS bridge is loud instead of silent.
  check_traccar_health

  write_deployed_sha "$DEPLOY_SHA"
  deploy_log "Deployment complete."
  log "deploy of $DEPLOY_REF complete and healthy"
  compose ps
  exit 0
fi

      # --- 8. rollback on API health failure ---------------------------------------
echo "error: new api did not become healthy" >&2
compose logs --tail=50 api >&2 || true
if api_live_ref >/dev/null 2>&1; then
  log "auto-rollback via scripts/rollback.sh"
  ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash "$(dirname "$0")/rollback.sh" --auto || true
  die "deploy failed; auto-rollback attempted. Investigate before retrying."
fi
die "deploy failed and there is no previous image to roll back to. Stack left as-is for inspection."
