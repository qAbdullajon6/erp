#!/usr/bin/env bash
# Nightly PostgreSQL dump for the production VPS.
#
#   ./scripts/backup-postgres.sh
#   ENV_FILE=.env.production ./scripts/backup-postgres.sh
#
# Cron (odd minute so it does not pile onto every other job):
#   17 3 * * * cd /opt/flowerp && ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
#
# A backup that has never been restored is a guess. See scripts/restore-postgres.sh.

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
REQUIRE_OFFSITE_BACKUP="${REQUIRE_OFFSITE_BACKUP:-false}"
OFFSITE_MAX_ATTEMPTS="${OFFSITE_MAX_ATTEMPTS:-3}"
OFFSITE_RETRY_BACKOFF_SECONDS="${OFFSITE_RETRY_BACKOFF_SECONDS:-30}"
NODE_EXPORTER_TEXTFILE_DIR="${NODE_EXPORTER_TEXTFILE_DIR:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_USER:?POSTGRES_USER missing from $ENV_FILE}"
: "${POSTGRES_DB:=erp_prod}"

if [[ ! "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
   [[ ! "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "error: POSTGRES_USER and POSTGRES_DB must be plain PostgreSQL identifiers" >&2
  exit 2
fi

validate_positive_integer() {
  local name="$1"
  local value="$2"
  local maximum="$3"
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]] || (( value > maximum )); then
    echo "error: $name must be a positive integer no greater than $maximum" >&2
    exit 2
  fi
}

validate_positive_integer "RETENTION_DAYS" "$RETENTION_DAYS" 3650
validate_positive_integer "OFFSITE_MAX_ATTEMPTS" "$OFFSITE_MAX_ATTEMPTS" 10
validate_positive_integer "OFFSITE_RETRY_BACKOFF_SECONDS" "$OFFSITE_RETRY_BACKOFF_SECONDS" 3600

if [[ "$REQUIRE_OFFSITE_BACKUP" != "true" && "$REQUIRE_OFFSITE_BACKUP" != "false" ]]; then
  echo "error: REQUIRE_OFFSITE_BACKUP must be true or false" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.sql.gz"
CHECKSUM="$TARGET.sha256"
SUCCESS_MARKER="$BACKUP_DIR/.last-success"
ATTEMPT_SUCCEEDED=0

emit_backup_metrics() {
  [[ -n "$NODE_EXPORTER_TEXTFILE_DIR" ]] || return 0

  mkdir -p "$NODE_EXPORTER_TEXTFILE_DIR"
  local metrics_file="$NODE_EXPORTER_TEXTFILE_DIR/flowerp_backup.prom"
  local metrics_tmp="$NODE_EXPORTER_TEXTFILE_DIR/.flowerp_backup.prom.$$"
  local now
  now="$(date +%s)"

  {
    echo '# HELP flowerp_backup_latest_attempt_status Whether the latest backup attempt succeeded (1) or failed (0).'
    echo '# TYPE flowerp_backup_latest_attempt_status gauge'
    printf 'flowerp_backup_latest_attempt_status %s\n' "$ATTEMPT_SUCCEEDED"
    echo '# HELP flowerp_backup_latest_attempt_timestamp_seconds Unix timestamp of the latest backup attempt completion.'
    echo '# TYPE flowerp_backup_latest_attempt_timestamp_seconds gauge'
    printf 'flowerp_backup_latest_attempt_timestamp_seconds %s\n' "$now"
    if [[ -f "$SUCCESS_MARKER" ]]; then
      local last_success
      last_success="$(<"$SUCCESS_MARKER")"
      if [[ "$last_success" =~ ^[0-9]+$ ]]; then
        echo '# HELP flowerp_backup_last_success_timestamp_seconds Unix timestamp of the last successful backup.'
        echo '# TYPE flowerp_backup_last_success_timestamp_seconds gauge'
        printf 'flowerp_backup_last_success_timestamp_seconds %s\n' "$last_success"
      fi
    fi
  } > "$metrics_tmp"
  mv -f "$metrics_tmp" "$metrics_file"
}

finish() {
  local status=$?
  trap - EXIT
  if ! emit_backup_metrics; then
    echo "warning: failed to write backup metrics to $NODE_EXPORTER_TEXTFILE_DIR" >&2
  fi
  exit "$status"
}
trap finish EXIT

echo "==> dumping $POSTGRES_DB to $TARGET"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$TARGET"

gzip -t "$TARGET"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$CHECKSUM")")
SIZE="$(du -h "$TARGET" | cut -f1)"
echo "==> wrote $TARGET ($SIZE)"
echo "==> wrote checksum $CHECKSUM"

if [[ -n "${OFFSITE_WRAPPER:-}" ]]; then
  if [[ "$OFFSITE_WRAPPER" != /* ]]; then
    echo "error: OFFSITE_WRAPPER must be an absolute executable path: $OFFSITE_WRAPPER" >&2
    exit 3
  fi
  if [[ ! -x "$OFFSITE_WRAPPER" || ! -f "$OFFSITE_WRAPPER" ]]; then
    echo "error: OFFSITE_WRAPPER is not an executable file: $OFFSITE_WRAPPER" >&2
    exit 3
  fi

  attempt=1
  while true; do
    echo "==> shipping dump and checksum offsite (attempt $attempt/$OFFSITE_MAX_ATTEMPTS)"
    if "$OFFSITE_WRAPPER" "$TARGET" "$CHECKSUM"; then
      break
    fi
    if (( attempt >= OFFSITE_MAX_ATTEMPTS )); then
      echo "error: offsite wrapper failed after $OFFSITE_MAX_ATTEMPTS attempts" >&2
      exit 4
    fi
    echo "warning: offsite attempt $attempt failed; retrying in ${OFFSITE_RETRY_BACKOFF_SECONDS}s" >&2
    sleep "$OFFSITE_RETRY_BACKOFF_SECONDS"
    ((attempt += 1))
  done
else
  echo "warning: OFFSITE_WRAPPER is unset — this dump only exists on this VPS" >&2
  if [[ "$REQUIRE_OFFSITE_BACKUP" == "true" ]]; then
    echo "error: REQUIRE_OFFSITE_BACKUP=true but OFFSITE_WRAPPER is unset" >&2
    exit 3
  fi
fi

echo "==> pruning dumps and checksum sidecars older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" \
  \( -name "${POSTGRES_DB}-*.sql.gz" -o -name "${POSTGRES_DB}-*.sql.gz.sha256" \) \
  -type f -mtime "+${RETENTION_DAYS}" -print -delete

# Written only after dump integrity, offsite handling, and retention succeed.
MARKER_TMP="$BACKUP_DIR/.last-success.$$"
date +%s > "$MARKER_TMP"
mv -f "$MARKER_TMP" "$SUCCESS_MARKER"
ATTEMPT_SUCCEEDED=1
echo "==> backup success marker updated: $SUCCESS_MARKER"
