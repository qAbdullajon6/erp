#!/usr/bin/env bash
# Shared helpers for deploy.sh and rollback.sh. SOURCED, never executed directly.
#
# Keeping the compose invocation, health polling, and image-ref lookup here means
# deploy and rollback speak to the stack in exactly one way — there is no second,
# subtly-different copy of the deploy logic to drift out of sync.

# --- Environment selection -------------------------------------------------
# DEPLOY_ENV picks the conventional per-environment file `.env.<DEPLOY_ENV>`
# (e.g. staging -> .env.staging, production -> .env.production). It defaults to
# `staging`, so existing behaviour is unchanged. ENV_FILE, if set, overrides the
# derived name outright. The chosen file is handed to docker compose by the
# single `compose()` wrapper below via --env-file, so EVERY compose command
# (build/pull/up/exec/…) interpolates the right variables — there is no second,
# un-env'd docker compose invocation anywhere in deploy.sh or rollback.sh.
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
ENV_FILE="${ENV_FILE:-.env.${DEPLOY_ENV}}"
# The canonical stack file is shared across environments; only the env file
# differs. Override COMPOSE_FILE if an environment ever needs its own.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"     # x HEALTH_INTERVAL = max wait for the API
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log() { echo "==> $*"; }
die() { echo "error: $*" >&2; exit 1; }

# Resolve, validate, and announce the env file BEFORE any compose command runs.
# Fails early with a clear message instead of letting compose die with a cryptic
# "VAR is required" when the selected file is missing.
require_env_file() {
  [[ -f "$ENV_FILE" ]] || die "env file '$ENV_FILE' not found (DEPLOY_ENV=$DEPLOY_ENV). Create it at the repo root, or set DEPLOY_ENV / ENV_FILE."
  log "environment: $DEPLOY_ENV → loading $ENV_FILE (compose: $COMPOSE_FILE)"
}

# Liveness/readiness probe from inside the api container against its own port —
# works whether or not Caddy is up, and needs no published port.
health_ok() { compose exec -T api wget -q --spider "http://127.0.0.1:4000/$1" >/dev/null 2>&1; }

# Poll /health (liveness) then /health/database (readiness). Returns 0 healthy.
wait_healthy() {
  local ok=0 i
  log "waiting for /health (liveness)"
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if health_ok "health"; then ok=1; break; fi
    sleep "$HEALTH_INTERVAL"
  done
  [[ "$ok" -eq 1 ]] || return 1
  log "liveness ok; checking /health/database (readiness)"
  health_ok "health/database" || return 1
  log "database readiness ok"
  return 0
}

# The repo:tag that compose currently addresses the running api container by.
# Empty output if no api container is running.
api_live_ref() {
  local id
  id="$(compose images -q api 2>/dev/null | head -n1)"
  [[ -n "$id" ]] || return 1
  docker inspect --format '{{if .RepoTags}}{{index .RepoTags 0}}{{end}}' "$id" 2>/dev/null
}
