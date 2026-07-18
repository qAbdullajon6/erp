#!/usr/bin/env bash
# Deploy the FlowERP API stack on the VPS, health-gated, with automatic rollback.
#
#   ./scripts/deploy.sh                 # build + deploy current checkout
#   ./scripts/deploy.sh v1.4.0          # checkout a ref, then build + deploy
#   ENV_FILE=.env.prod ./scripts/deploy.sh
#
# What it does, in order:
#   1. (optional) checks out the requested git ref
#   2. records the currently-running API image id, for rollback
#   3. builds the new images
#   4. recreates the stack; the API container runs `prisma migrate deploy` on
#      start, so the migration happens as part of the swap, before it serves
#   5. polls /health then /health/database until the new API is ready
#   6. if it never becomes healthy, rolls the API back to the recorded image
#
# Migration ordering assumption: migrations are additive / backward-compatible
# (the project's standing rule — see docs and the database-migrations skill).
# That is what makes step 4 safe: the new schema is compatible with the request
# in flight, and a rollback to the previous image still runs against it. A
# destructive migration breaks this contract and must be staged across two
# deploys (add nullable -> backfill -> constrain), never shipped in one.
#
# Single-instance caveat (honest): with one API container, recreating it is a
# brief connection reset, not true zero-downtime — Caddy health-gates new
# traffic (health_uri /health) but the old container does stop. For genuine
# zero-downtime, run two API replicas behind Caddy and recreate them one at a
# time; the in-process schedulers must then move to a single-runner (see
# TD-018 / the deployment report) so crons do not double-fire. This script is
# correct and safe for the current single-instance topology.

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"     # x2s = up to 60s for the API to come up
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"
GIT_REF="${1:-}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log() { echo "==> $*"; }
die() { echo "error: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"

# --- 1. optional git ref -----------------------------------------------------
if [[ -n "$GIT_REF" ]]; then
  log "checking out $GIT_REF"
  git fetch --all --tags --prune
  git checkout "$GIT_REF"
fi
DEPLOY_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
log "deploying $DEPLOY_REF"

# --- 2. record the current API image for rollback ----------------------------
# The image id the running api container was created from, plus the tag compose
# addresses it by. `compose build` will overwrite that tag with the new image,
# leaving PREV_API_IMAGE (the id) present but untagged — so rollback is just
# re-pointing the tag back at the old id and recreating from it, no rebuild.
PREV_API_IMAGE="$(compose images -q api 2>/dev/null | head -n1 || true)"
PREV_API_TAG=""
if [[ -n "$PREV_API_IMAGE" ]]; then
  PREV_API_TAG="$(docker inspect --format '{{if .RepoTags}}{{index .RepoTags 0}}{{end}}' "$PREV_API_IMAGE" 2>/dev/null || true)"
  log "current api image: $PREV_API_IMAGE ${PREV_API_TAG:+($PREV_API_TAG)} (rollback target)"
else
  log "no running api container — this looks like a first deploy (no rollback target)"
fi

# --- 3. build ----------------------------------------------------------------
log "building images"
compose build

# --- 4. recreate the stack (API migrates on start) ---------------------------
# Dependencies first so Postgres/Redis are healthy before the API migrates.
log "starting datastores"
compose up -d postgres redis
log "recreating api (runs prisma migrate deploy, then serves)"
compose up -d api

# --- 5. health verification --------------------------------------------------
# Check from inside the api container against its own port, so this works whether
# or not Caddy is up yet and needs no published port. wget ships in the image.
health_ok() {
  compose exec -T api wget -q --spider "http://127.0.0.1:4000/$1" >/dev/null 2>&1
}

log "waiting for /health (liveness)"
ok=0
for ((i = 1; i <= HEALTH_RETRIES; i++)); do
  if health_ok "health"; then ok=1; break; fi
  sleep "$HEALTH_INTERVAL"
done

if [[ "$ok" -eq 1 ]]; then
  log "liveness ok; checking /health/database (readiness)"
  if health_ok "health/database"; then
    log "database readiness ok"
  else
    log "database readiness FAILED"
    ok=0
  fi
fi

# --- 6. rollback on failure --------------------------------------------------
if [[ "$ok" -ne 1 ]]; then
  echo "error: new api did not become healthy" >&2
  compose logs --tail=50 api >&2 || true
  if [[ -n "$PREV_API_IMAGE" && -n "$PREV_API_TAG" ]]; then
    log "ROLLING BACK api to $PREV_API_IMAGE ($PREV_API_TAG)"
    # Re-point the compose tag back at the previous image id and recreate the
    # api service from it without rebuilding. The previous code is expected to
    # run against the migrated schema because migrations are additive (see the
    # assumption at the top). If a migration was destructive, code rollback is
    # not safe and the fix is forward — which is exactly why destructive
    # migrations are staged across deploys.
    docker tag "$PREV_API_IMAGE" "$PREV_API_TAG"
    compose up -d --no-build api || true
    die "deploy failed; rolled back to $PREV_API_IMAGE. Investigate before retrying."
  fi
  die "deploy failed and there is no previous image to roll back to. Stack left as-is for inspection."
fi

# --- 7. reverse proxy + frontend rehearsal service ---------------------------
# Caddy is safe to (re)start last: it health-polls the API and only routes when
# /health passes, so it never sends traffic to an API mid-migration.
log "ensuring caddy is up"
compose up -d caddy

log "deploy of $DEPLOY_REF complete and healthy"
compose ps
