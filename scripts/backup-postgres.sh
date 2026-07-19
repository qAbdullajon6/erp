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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_USER:?POSTGRES_USER missing from $ENV_FILE}"
: "${POSTGRES_DB:=erp_prod}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.sql.gz"

echo "==> dumping $POSTGRES_DB to $TARGET"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$TARGET"

gzip -t "$TARGET"
SIZE="$(du -h "$TARGET" | cut -f1)"
echo "==> wrote $TARGET ($SIZE)"

echo "==> pruning dumps older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete

if [[ -n "${OFFSITE_COMMAND:-}" ]]; then
  echo "==> shipping offsite"
  eval "$OFFSITE_COMMAND \"$TARGET\""
else
  echo "warning: OFFSITE_COMMAND is unset — this dump only exists on this VPS" >&2
fi
