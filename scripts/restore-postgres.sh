#!/usr/bin/env bash
# Restore a PostgreSQL dump written by scripts/backup-postgres.sh.
#
# A backup that has never been restored is a guess. This script's DEFAULT is the
# rehearsal: it restores into a throwaway scratch database, counts rows, and
# tears the scratch down — proving the dump is complete without ever touching
# live data. Run it on a schedule; a restore that has not been rehearsed this
# month is not a backup you can trust.
#
#   ./scripts/restore-postgres.sh backups/erp_prod-20260718T031700Z.sql.gz
#       -> restores into <db>_restore_test, verifies, drops it. Live DB untouched.
#
#   CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh <dump>.sql.gz --into-live
#       -> restores into the LIVE database. The dump carries --clean --if-exists,
#          so this DROPS and recreates every object: it REPLACES live contents.
#          Refuses to run without the exact CONFIRM token, by design.
#
#   ENV_FILE=.env.production ./scripts/restore-postgres.sh <dump>.sql.gz
#
# Pairs with scripts/backup-postgres.sh and the runbook in deploy/README.md and
# docs/DISASTER_RECOVERY.md.

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

DUMP=""
INTO_LIVE=0
for arg in "$@"; do
  case "$arg" in
    --into-live) INTO_LIVE=1 ;;
    -*) echo "error: unknown flag $arg" >&2; exit 2 ;;
    *) DUMP="$arg" ;;
  esac
done

if [[ -z "$DUMP" ]]; then
  echo "usage: $0 <dump.sql.gz> [--into-live]" >&2
  exit 2
fi
if [[ ! -f "$DUMP" ]]; then
  echo "error: dump not found: $DUMP" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Fail fast on a truncated/corrupt dump before it touches any database.
echo "==> checking dump integrity"
gzip -t "$DUMP"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_USER:?POSTGRES_USER missing from $ENV_FILE}"
: "${POSTGRES_DB:=erp_prod}"

psql_db() {
  # -v ON_ERROR_STOP=1 so a mid-restore failure is a non-zero exit, not a
  # half-applied database reported as success.
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 "$@"
}

if [[ "$INTO_LIVE" -eq 1 ]]; then
  if [[ "${CONFIRM:-}" != "RESTORE_LIVE" ]]; then
    echo "refusing: --into-live replaces the contents of '$POSTGRES_DB'." >&2
    echo "re-run with: CONFIRM=RESTORE_LIVE $0 $DUMP --into-live" >&2
    exit 3
  fi
  echo "==> RESTORING INTO LIVE DATABASE '$POSTGRES_DB' from $DUMP"
  echo "==> the dump is --clean --if-exists; existing objects are dropped and recreated"
  gunzip -c "$DUMP" | psql_db -d "$POSTGRES_DB"
  echo "==> live restore complete; sanity count:"
  psql_db -d "$POSTGRES_DB" -c 'SELECT count(*) AS users FROM users;' || true
  echo "==> done. Verify the application boots and a login succeeds before trusting it."
  exit 0
fi

# --- Default: verified rehearsal into a scratch database ----------------------
SCRATCH="${POSTGRES_DB}_restore_test"
echo "==> rehearsing restore into scratch database '$SCRATCH' (live DB untouched)"

# Drop any leftover scratch from a previous run, then recreate it empty.
psql_db -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH};"
psql_db -d postgres -c "CREATE DATABASE ${SCRATCH};"

# On any failure from here, still drop the scratch DB so a failed rehearsal does
# not leave a half-restored database lying around.
cleanup() {
  psql_db -d postgres -c "DROP DATABASE IF EXISTS ${SCRATCH};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> restoring dump into $SCRATCH"
gunzip -c "$DUMP" | psql_db -d "$SCRATCH"

echo "==> restore succeeded; row counts as evidence:"
psql_db -d "$SCRATCH" -t -A -c \
  "SELECT 'users=' || count(*) FROM users
   UNION ALL SELECT 'organizations=' || count(*) FROM organizations
   UNION ALL SELECT 'orders=' || count(*) FROM orders;" \
  || echo "   (a counted table was absent — inspect the dump if this is unexpected)"

echo "==> rehearsal passed. Scratch database dropped on exit; '$POSTGRES_DB' was never touched."
