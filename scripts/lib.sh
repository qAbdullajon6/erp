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
# Written after a successful deploy; used for git-diff change detection next time.
DEPLOYED_SHA_FILE="${DEPLOYED_SHA_FILE:-.flowerp-deployed-sha}"

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log() { echo "==> $*"; }
deploy_log() { echo "[DEPLOY] $*"; }
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
  deploy_log "Waiting for API health..."
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

wait_web_healthy() {
  local ok=0 i
  deploy_log "Waiting for WEB health..."
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if compose exec -T web wget -q --spider "http://127.0.0.1:3000/" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep "$HEALTH_INTERVAL"
  done
  [[ "$ok" -eq 1 ]] || return 1
  return 0
}

# The repo:tag that compose currently addresses the running service by.
# Empty output if no container is running.
service_live_ref() {
  local svc="$1" id
  id="$(compose images -q "$svc" 2>/dev/null | head -n1)"
  [[ -n "$id" ]] || return 1
  docker inspect --format '{{if .RepoTags}}{{index .RepoTags 0}}{{end}}' "$id" 2>/dev/null
}

api_live_ref() { service_live_ref api; }
web_live_ref() { service_live_ref web; }

tag_rollback_point() {
  local svc="$1" live_ref rollback_ref
  live_ref="$(service_live_ref "$svc" || true)"
  if [[ -n "$live_ref" ]]; then
    rollback_ref="${live_ref%:*}:previous"
    docker tag "$live_ref" "$rollback_ref"
    log "rollback point tagged: $rollback_ref (was $live_ref) [$svc]"
  else
    log "no running $svc container — no rollback point for $svc"
  fi
}

read_previous_deploy_sha() {
  if [[ -f "$DEPLOYED_SHA_FILE" ]]; then
    tr -d '[:space:]' <"$DEPLOYED_SHA_FILE"
  fi
}

write_deployed_sha() {
  local sha="$1"
  printf '%s\n' "$sha" >"$DEPLOYED_SHA_FILE"
}

# Paths that invalidate the API image when they change between deploys.
API_WATCH_PATHS=(
  apps/api
  apps/api/Dockerfile
  package.json
  package-lock.json
  scripts/postinstall.js
  scripts/postinstall-mobile.js
)

# Paths that invalidate the WEB image when they change between deploys.
WEB_WATCH_PATHS=(
  apps/web
  apps/web/Dockerfile
  package.json
  package-lock.json
  scripts/postinstall.js
  scripts/postinstall-mobile.js
)

# Returns 0 (true) when paths changed between $1 and $2, or when comparison is impossible.
paths_changed_between() {
  local from_sha="$1" to_sha="$2"
  shift 2
  local paths=("$@")

  if [[ -z "$from_sha" ]]; then
    return 0
  fi
  if ! git cat-file -e "${from_sha}^{commit}" 2>/dev/null; then
    return 0
  fi
  if ! git diff --quiet "$from_sha" "$to_sha" -- "${paths[@]}"; then
    return 0
  fi
  return 1
}

image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

container_env() {
  local svc="$1" key="$2"
  compose exec -T "$svc" printenv "$key" 2>/dev/null | tr -d '[:space:]'
}

# Post-deploy verification. Aborts (returns 1) if anything is wrong.
verify_deployment() {
  local expected_sha="$1"
  local api_sha web_sha web_status

  deploy_log "Verifying deployment..."

  health_ok "health" || {
    echo "error: verification failed — API /health" >&2
    return 1
  }
  health_ok "health/database" || {
    echo "error: verification failed — API /health/database" >&2
    return 1
  }

  if ! compose exec -T web wget -q --spider "http://127.0.0.1:3000/" >/dev/null 2>&1; then
    echo "error: verification failed — WEB HTTP probe" >&2
    return 1
  fi

  web_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' flowerp-web 2>/dev/null || echo missing)"
  case "$web_status" in
    healthy | starting | none) ;;
    *)
      echo "error: verification failed — WEB container health=$web_status" >&2
      return 1
      ;;
  esac

  api_sha="$(container_env api GIT_COMMIT_SHA || true)"
  web_sha="$(container_env web GIT_COMMIT_SHA || true)"

  if [[ -z "$api_sha" || "$api_sha" == "unknown" ]]; then
    echo "error: verification failed — API GIT_COMMIT_SHA missing/unknown (got '${api_sha:-}')" >&2
    return 1
  fi
  if [[ -z "$web_sha" || "$web_sha" == "unknown" ]]; then
    echo "error: verification failed — WEB GIT_COMMIT_SHA missing/unknown (got '${web_sha:-}')" >&2
    return 1
  fi
  if [[ "$api_sha" != "$expected_sha" ]]; then
    echo "error: verification failed — API GIT_COMMIT_SHA=$api_sha expected=$expected_sha" >&2
    return 1
  fi
  if [[ "$web_sha" != "$expected_sha" ]]; then
    echo "error: verification failed — WEB GIT_COMMIT_SHA=$web_sha expected=$expected_sha" >&2
    return 1
  fi

  deploy_log "API GIT_COMMIT_SHA .... $api_sha"
  deploy_log "WEB GIT_COMMIT_SHA .... $web_sha"
  deploy_log "Verification .......... PASS"
  return 0
}
