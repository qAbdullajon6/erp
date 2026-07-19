#!/usr/bin/env bash
# Shared helpers for deploy.sh and rollback.sh. SOURCED, never executed directly.
#
# Keeping the compose invocation, health polling, and image-ref lookup here means
# deploy and rollback speak to the stack in exactly one way — there is no second,
# subtly-different copy of the deploy logic to drift out of sync.

# Production only. Override ENV_FILE / COMPOSE_FILE if needed for a one-off.
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log() { echo "==> $*"; }
die() { echo "error: $*" >&2; exit 1; }

require_env_file() {
  [[ -f "$ENV_FILE" ]] || die "env file '$ENV_FILE' not found. Copy deploy/.env.example to .env.production and fill secrets."
  log "loading $ENV_FILE (compose: $COMPOSE_FILE)"
}

# Liveness/readiness probe from inside the api container against its own port —
# works whether or not Caddy is up, and needs no published port.
health_ok() { compose exec -T api wget -q --spider "http://127.0.0.1:4000/$1" >/dev/null 2>&1; }

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
