#!/usr/bin/env bash
# Nightly PostgreSQL dump for the staging/production VPS.
#
#   ./scripts/backup-postgres.sh                       # uses .env.staging
#   ENV_FILE=.env.prod ./scripts/backup-postgres.sh
#
# Install as a cron job, e.g. 03:17 daily (an odd minute, so it does not land on
# the same second as every other cron on the box):
#   17 3 * * * cd /opt/flowerp && ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
#
# A backup that has never been restored is a guess. See RESTORE below.

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_USER:?POSTGRES_USER missing from $ENV_FILE}"
: "${POSTGRES_DB:=erp_staging}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.sql.gz"

echo "==> dumping $POSTGRES_DB to $TARGET"
# -Fp (plain SQL) rather than a custom archive: it restores with psql alone, so
# recovery never depends on a matching pg_restore version being installed.
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$TARGET"

# A dump that failed halfway still leaves a file. Check it is a complete,
# readable gzip stream before trusting it and deleting older ones.
gzip -t "$TARGET"
SIZE="$(du -h "$TARGET" | cut -f1)"
echo "==> wrote $TARGET ($SIZE)"

echo "==> pruning dumps older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete

# The VPS disk is not a backup. Copy the dump somewhere that survives the box:
#   rclone copy "$TARGET" remote:flowerp-backups/
#   aws s3 cp "$TARGET" s3://flowerp-backups/
if [[ -n "${OFFSITE_COMMAND:-}" ]]; then
  echo "==> shipping offsite"
  eval "$OFFSITE_COMMAND \"$TARGET\""
else
  echo "warning: OFFSITE_COMMAND is unset — this dump only exists on this VPS" >&2
fi

# --- RESTORE -----------------------------------------------------------------
# Restore into a scratch database first and count some rows. Never rehearse a
# restore by pointing it at the live one.
#
#   gunzip -c backups/erp_staging-<stamp>.sql.gz \
#     | docker compose -f docker-compose.staging.yml --env-file .env.staging \
#         exec -T postgres psql -U erp -d erp_restore_test
#
# The dump carries --clean --if-exists, so it drops and recreates each object;
# restoring it over a populated database replaces that database's contents.
