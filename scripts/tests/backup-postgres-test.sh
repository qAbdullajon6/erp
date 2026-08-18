#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="$ROOT/scripts/backup-postgres.sh"
RESTORE_SCRIPT="$ROOT/scripts/restore-postgres.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "expected file: $1"
}

assert_contains() {
  grep -Fq "$2" "$1" || fail "expected '$2' in $1"
}

FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' '-- fake pg_dump output --' 'CREATE TABLE backup_test(id integer);'
EOF

cat > "$FAKE_BIN/sleep" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$1" >> "$FAKE_SLEEP_LOG"
EOF

chmod +x "$FAKE_BIN/docker" "$FAKE_BIN/sleep"

ENV_FILE="$TMP/test.env"
cat > "$ENV_FILE" <<'EOF'
POSTGRES_USER=erp
POSTGRES_DB=erp_test
EOF

run_backup() {
  PATH="$FAKE_BIN:$PATH" \
  ENV_FILE="$ENV_FILE" \
  COMPOSE_FILE="$TMP/compose.yml" \
  BACKUP_DIR="${BACKUP_DIR:?}" \
  RETENTION_DAYS=14 \
  REQUIRE_OFFSITE_BACKUP="${REQUIRE_OFFSITE_BACKUP:?}" \
  OFFSITE_WRAPPER="${OFFSITE_WRAPPER:-}" \
  OFFSITE_MAX_ATTEMPTS=3 \
  OFFSITE_RETRY_BACKOFF_SECONDS=1 \
  NODE_EXPORTER_TEXTFILE_DIR="${NODE_EXPORTER_TEXTFILE_DIR:?}" \
  FAKE_SLEEP_LOG="$TMP/sleep.log" \
  bash "$BACKUP_SCRIPT"
}

echo "test: local-only success, checksum, marker, and metrics"
LOCAL_DIR="$TMP/local"
LOCAL_METRICS="$TMP/local-metrics"
BACKUP_DIR="$LOCAL_DIR" \
NODE_EXPORTER_TEXTFILE_DIR="$LOCAL_METRICS" \
REQUIRE_OFFSITE_BACKUP=false \
OFFSITE_WRAPPER= \
run_backup > "$TMP/local.log" 2>&1

LOCAL_DUMP="$(printf '%s\n' "$LOCAL_DIR"/erp_test-*.sql.gz)"
[[ "$LOCAL_DUMP" != *'*'* ]] || fail "local dump was not created"
assert_file "$LOCAL_DUMP"
assert_file "$LOCAL_DUMP.sha256"
(cd "$LOCAL_DIR" && sha256sum -c "$(basename "$LOCAL_DUMP.sha256")" >/dev/null)
assert_file "$LOCAL_DIR/.last-success"
assert_contains "$LOCAL_METRICS/flowerp_backup.prom" "flowerp_backup_latest_attempt_status 1"
assert_contains "$LOCAL_METRICS/flowerp_backup.prom" "flowerp_backup_last_success_timestamp_seconds"

echo "test: bounded offsite retries and exact two-file contract"
WRAPPER="$TMP/fake-offsite-wrapper"
cat > "$WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$#" -eq 2 ]]
[[ -f "$1" && -f "$2" ]]
(cd "$(dirname "$1")" && sha256sum -c "$(basename "$2")" >/dev/null)
count=0
[[ ! -f "$FAKE_OFFSITE_COUNT" ]] || count="$(<"$FAKE_OFFSITE_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" > "$FAKE_OFFSITE_COUNT"
printf '%s|%s\n' "$1" "$2" >> "$FAKE_OFFSITE_ARGS"
(( count >= FAKE_OFFSITE_SUCCEED_ON ))
EOF
chmod +x "$WRAPPER"

RETRY_DIR="$TMP/retry"
RETRY_METRICS="$TMP/retry-metrics"
export FAKE_OFFSITE_COUNT="$TMP/offsite-count"
export FAKE_OFFSITE_ARGS="$TMP/offsite-args"
export FAKE_OFFSITE_SUCCEED_ON=3
BACKUP_DIR="$RETRY_DIR" \
NODE_EXPORTER_TEXTFILE_DIR="$RETRY_METRICS" \
REQUIRE_OFFSITE_BACKUP=true \
OFFSITE_WRAPPER="$WRAPPER" \
run_backup > "$TMP/retry.log" 2>&1

[[ "$(<"$FAKE_OFFSITE_COUNT")" == "3" ]] || fail "offsite wrapper did not run three times"
[[ "$(wc -l < "$TMP/sleep.log" | tr -d ' ')" == "2" ]] || fail "expected two retry backoffs"
assert_file "$RETRY_DIR/.last-success"
assert_contains "$RETRY_METRICS/flowerp_backup.prom" "flowerp_backup_latest_attempt_status 1"
while IFS='|' read -r dump checksum; do
  [[ "$checksum" == "$dump.sha256" ]] || fail "wrapper checksum argument did not match dump"
done < "$FAKE_OFFSITE_ARGS"

echo "test: exhausted wrapper retries preserve all local recovery points"
EXHAUSTED_DIR="$TMP/exhausted"
EXHAUSTED_METRICS="$TMP/exhausted-metrics"
mkdir -p "$EXHAUSTED_DIR"
EXHAUSTED_OLD_DUMP="$EXHAUSTED_DIR/erp_test-20000101T000000Z.sql.gz"
EXHAUSTED_OLD_CHECKSUM="$EXHAUSTED_OLD_DUMP.sha256"
printf 'old recovery point\n' > "$EXHAUSTED_OLD_DUMP"
printf 'old checksum\n' > "$EXHAUSTED_OLD_CHECKSUM"
touch -t 200001010000 "$EXHAUSTED_OLD_DUMP" "$EXHAUSTED_OLD_CHECKSUM"
: > "$FAKE_OFFSITE_ARGS"
rm -f "$FAKE_OFFSITE_COUNT" "$TMP/sleep.log"
export FAKE_OFFSITE_SUCCEED_ON=99

if BACKUP_DIR="$EXHAUSTED_DIR" \
  NODE_EXPORTER_TEXTFILE_DIR="$EXHAUSTED_METRICS" \
  REQUIRE_OFFSITE_BACKUP=true \
  OFFSITE_WRAPPER="$WRAPPER" \
  run_backup > "$TMP/exhausted.log" 2>&1; then
  fail "backup unexpectedly succeeded after wrapper retry exhaustion"
fi

[[ "$(<"$FAKE_OFFSITE_COUNT")" == "3" ]] || fail "wrapper retry exhaustion did not stop at three attempts"
[[ "$(wc -l < "$TMP/sleep.log" | tr -d ' ')" == "2" ]] || fail "retry exhaustion did not use exactly two backoffs"
assert_contains "$TMP/exhausted.log" "offsite wrapper failed after 3 attempts"
assert_file "$EXHAUSTED_OLD_DUMP"
assert_file "$EXHAUSTED_OLD_CHECKSUM"
EXHAUSTED_NEW_DUMP="$(printf '%s\n' "$EXHAUSTED_DIR"/erp_test-202*.sql.gz)"
[[ "$EXHAUSTED_NEW_DUMP" != *'*'* ]] || fail "failed run did not preserve its new dump"
assert_file "$EXHAUSTED_NEW_DUMP"
assert_file "$EXHAUSTED_NEW_DUMP.sha256"
[[ ! -e "$EXHAUSTED_DIR/.last-success" ]] || fail "retry exhaustion wrote success marker"
assert_contains "$EXHAUSTED_METRICS/flowerp_backup.prom" "flowerp_backup_latest_attempt_status 0"

echo "test: required offsite failure preserves local recovery points"
FAIL_DIR="$TMP/required-failure"
FAIL_METRICS="$TMP/failure-metrics"
mkdir -p "$FAIL_DIR"
OLD_DUMP="$FAIL_DIR/erp_test-20000101T000000Z.sql.gz"
OLD_CHECKSUM="$OLD_DUMP.sha256"
printf 'old recovery point\n' > "$OLD_DUMP"
printf 'old checksum\n' > "$OLD_CHECKSUM"
touch -t 200001010000 "$OLD_DUMP" "$OLD_CHECKSUM"

if BACKUP_DIR="$FAIL_DIR" \
  NODE_EXPORTER_TEXTFILE_DIR="$FAIL_METRICS" \
  REQUIRE_OFFSITE_BACKUP=true \
  OFFSITE_WRAPPER= \
  run_backup > "$TMP/failure.log" 2>&1; then
  fail "required offsite backup unexpectedly succeeded"
fi

assert_contains "$TMP/failure.log" "REQUIRE_OFFSITE_BACKUP=true but OFFSITE_WRAPPER is unset"
assert_file "$OLD_DUMP"
assert_file "$OLD_CHECKSUM"
[[ ! -e "$FAIL_DIR/.last-success" ]] || fail "failure wrote success marker"
assert_contains "$FAIL_METRICS/flowerp_backup.prom" "flowerp_backup_latest_attempt_status 0"

echo "test: restore rejects an invalid checksum before database access"
RESTORE_DIR="$TMP/restore"
RESTORE_BIN="$TMP/restore-bin"
mkdir -p "$RESTORE_DIR" "$RESTORE_BIN"
printf 'SELECT 1;\n' | gzip -9 > "$RESTORE_DIR/drill.sql.gz"
printf '%064d  drill.sql.gz\n' 0 > "$RESTORE_DIR/drill.sql.gz.sha256"
cat > "$RESTORE_BIN/docker" <<EOF
#!/usr/bin/env bash
touch "$TMP/restore-docker-called"
EOF
chmod +x "$RESTORE_BIN/docker"

if PATH="$RESTORE_BIN:$PATH" \
  ENV_FILE="$ENV_FILE" \
  COMPOSE_FILE="$TMP/compose.yml" \
  bash "$RESTORE_SCRIPT" "$RESTORE_DIR/drill.sql.gz" > "$TMP/restore.log" 2>&1; then
  fail "restore unexpectedly accepted an invalid checksum"
fi

[[ ! -e "$TMP/restore-docker-called" ]] || fail "restore contacted the database before checksum validation"
assert_contains "$TMP/restore.log" "FAILED"

echo "PASS: backup-postgres shell tests"
