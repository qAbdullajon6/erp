#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRAPPER="$ROOT/scripts/offsite/aws-s3-backup.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  grep -Fq -- "$2" "$1" || fail "expected '$2' in $1"
}

assert_not_contains() {
  if grep -Fq -- "$2" "$1"; then
    fail "did not expect sensitive value in $1"
  fi
}

FAKE_BIN="$TMP/bin"
FAKE_STORE="$TMP/store"
mkdir -p "$FAKE_BIN" "$FAKE_STORE"

cat > "$FAKE_BIN/aws" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

printf '%q ' "$@" >> "$FAKE_AWS_LOG"
printf '\n' >> "$FAKE_AWS_LOG"

if [[ "${1:-}" == "--version" ]]; then
  printf '%s\n' "${FAKE_AWS_VERSION:-aws-cli/2.27.0 Python/3.13.3 Linux/6.8 exe/x86_64}"
  exit 0
fi

value_after() {
  local wanted="$1"
  shift
  while (( $# > 0 )); do
    if [[ "$1" == "$wanted" ]]; then
      printf '%s' "$2"
      return 0
    fi
    shift
  done
  return 1
}

if [[ "$1 $2" == "s3 cp" ]]; then
  source_path="$3"
  destination="$4"
  if [[ "$source_path" != s3://* ]]; then
    if [[ "${FAKE_AWS_FAIL_UPLOAD_BASENAME:-}" == "$(basename "$source_path")" ]]; then
      exit 42
    fi
    object_name="$(basename "$destination")"
    cp -- "$source_path" "$FAKE_AWS_STORE/$object_name"
    printf '%s' "AES256" > "$FAKE_AWS_STORE/$object_name.sse"
    metadata="$(value_after --metadata "$@" || true)"
    printf '%s' "${metadata#sha256=}" > "$FAKE_AWS_STORE/$object_name.metadata-sha256"
    exit 0
  fi

  object_name="$(basename "$source_path")"
  [[ "$destination" == "-" ]]
  [[ -f "$FAKE_AWS_STORE/$object_name" ]]
  if [[ "${FAKE_AWS_REMOTE_CHECKSUM_MISMATCH:-false}" == "true" ]]; then
    printf 'mismatched remote checksum\n'
  else
    command cat -- "$FAKE_AWS_STORE/$object_name"
  fi
  exit 0
fi

if [[ "$1 $2" == "s3api head-object" ]]; then
  key="$(value_after --key "$@")"
  query="$(value_after --query "$@")"
  object_name="$(basename "$key")"
  [[ -f "$FAKE_AWS_STORE/$object_name" ]]
  if [[ "${FAKE_AWS_FAIL_HEAD_BASENAME:-}" == "$object_name" ]]; then
    exit 43
  fi
  size="$(wc -c < "$FAKE_AWS_STORE/$object_name" | tr -d '[:space:]')"
  sse="$(<"$FAKE_AWS_STORE/$object_name.sse")"
  [[ "${FAKE_AWS_BAD_SIZE_BASENAME:-}" != "$object_name" ]] || size=$((size + 1))
  [[ "${FAKE_AWS_BAD_SSE_BASENAME:-}" != "$object_name" ]] || sse="aws:kms"
  eol=$'\n'
  [[ "${FAKE_AWS_CRLF:-false}" != "true" ]] || eol=$'\r\n'
  if [[ "$query" == *"Metadata.sha256"* ]]; then
    digest="$(<"$FAKE_AWS_STORE/$object_name.metadata-sha256")"
    [[ "${FAKE_AWS_BAD_HASH_BASENAME:-}" != "$object_name" ]] || digest="bad-digest"
    printf '%s\t%s\t%s%s' "$size" "$sse" "$digest" "$eol"
  else
    printf '%s\t%s%s' "$size" "$sse" "$eol"
  fi
  exit 0
fi

exit 44
EOF
chmod +x "$FAKE_BIN/aws"

DUMP="$TMP/erp_prod-20260812T180000Z.sql.gz"
printf '%s\n' 'static backup test payload' | gzip -9 > "$DUMP"
(cd "$TMP" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256")
CHECKSUM="$DUMP.sha256"
DUMP_SHA256="$(sha256sum "$DUMP" | awk '{print $1}')"
SECRET_VALUE="FAKE-SECRET-MUST-NOT-APPEAR"

run_wrapper() {
  PATH="$FAKE_BIN:$PATH" \
  AWS_REGION="eu-north-1" \
  S3_BUCKET="flowerp-812063706887-eu-north-1-an" \
  S3_BACKUP_PREFIX="/backups//" \
  AWS_ACCESS_KEY_ID="fake-access-id" \
  AWS_SECRET_ACCESS_KEY="$SECRET_VALUE" \
  FAKE_AWS_STORE="$FAKE_STORE" \
  FAKE_AWS_LOG="$TMP/aws.log" \
  bash "$WRAPPER" "$DUMP" "${1:-$CHECKSUM}"
}

echo "test: uploads and verifies both encrypted S3 objects"
: > "$TMP/aws.log"
if ! run_wrapper > "$TMP/success.log" 2>&1; then
  command cat "$TMP/success.log" >&2
  fail "wrapper success scenario failed"
fi
assert_contains "$TMP/aws.log" "s3 cp $DUMP s3://flowerp-812063706887-eu-north-1-an/backups/$(basename "$DUMP")"
assert_contains "$TMP/aws.log" "--sse AES256"
assert_contains "$TMP/aws.log" "--metadata sha256=$DUMP_SHA256"
assert_contains "$TMP/aws.log" "s3 cp $CHECKSUM s3://flowerp-812063706887-eu-north-1-an/backups/$(basename "$CHECKSUM")"
DUMP_UPLOAD_LINE="$(grep -F -- "s3 cp $DUMP s3://flowerp-812063706887-eu-north-1-an/backups/$(basename "$DUMP")" "$TMP/aws.log")"
CHECKSUM_UPLOAD_LINE="$(grep -F -- "s3 cp $CHECKSUM s3://flowerp-812063706887-eu-north-1-an/backups/$(basename "$CHECKSUM")" "$TMP/aws.log")"
[[ "$DUMP_UPLOAD_LINE" == *"--sse AES256"* ]] || fail "dump upload omitted explicit SSE-S3"
[[ "$DUMP_UPLOAD_LINE" == *"--metadata sha256=$DUMP_SHA256"* ]] || fail "dump upload omitted SHA-256 metadata"
[[ "$CHECKSUM_UPLOAD_LINE" == *"--sse AES256"* ]] || fail "checksum upload omitted explicit SSE-S3"
assert_contains "$TMP/aws.log" "s3api head-object --bucket flowerp-812063706887-eu-north-1-an --key backups/$(basename "$DUMP")"
assert_contains "$TMP/aws.log" "Metadata.sha256"
assert_contains "$TMP/aws.log" "s3api head-object --bucket flowerp-812063706887-eu-north-1-an --key backups/$(basename "$CHECKSUM")"
assert_contains "$TMP/aws.log" "s3 cp s3://flowerp-812063706887-eu-north-1-an/backups/$(basename "$CHECKSUM") -"
assert_not_contains "$TMP/success.log" "$SECRET_VALUE"
assert_not_contains "$TMP/aws.log" "$SECRET_VALUE"

echo "test: CRLF head-object output is verified, not rejected"
if ! FAKE_AWS_CRLF=true run_wrapper > "$TMP/crlf.log" 2>&1; then
  command cat "$TMP/crlf.log" >&2
  fail "wrapper rejected CRLF head-object output from a Windows AWS CLI"
fi

echo "test: upload failure returns nonzero"
if FAKE_AWS_FAIL_UPLOAD_BASENAME="$(basename "$DUMP")" run_wrapper > "$TMP/upload-failure.log" 2>&1; then
  fail "wrapper unexpectedly accepted an upload failure"
fi

echo "test: a sidecar that does not describe the dump is rejected before any upload"
BAD_CHECKSUM="$TMP/$(basename "$DUMP").sha256.bad"
printf '%s *%s\n' \
  "0000000000000000000000000000000000000000000000000000000000000000" \
  "$(basename "$DUMP")" > "$BAD_CHECKSUM"
: > "$TMP/aws.log"
if run_wrapper "$BAD_CHECKSUM" > "$TMP/bad-sidecar.log" 2>&1; then
  fail "wrapper accepted a checksum sidecar that does not describe the dump"
fi
if grep -Fq -- "s3 cp" "$TMP/aws.log"; then
  fail "wrapper uploaded despite a checksum sidecar mismatch"
fi

echo "test: AWS CLI v1 is rejected"
if FAKE_AWS_VERSION="aws-cli/1.36.0 Python/3.11 Linux/6.8" run_wrapper > "$TMP/aws-v1.log" 2>&1; then
  fail "wrapper unexpectedly accepted AWS CLI v1"
fi
assert_contains "$TMP/aws-v1.log" "AWS CLI v2 is required"

echo "test: head-object failure returns nonzero"
if FAKE_AWS_FAIL_HEAD_BASENAME="$(basename "$DUMP")" run_wrapper > "$TMP/head-failure.log" 2>&1; then
  fail "wrapper unexpectedly accepted a head-object failure"
fi

echo "test: remote dump metadata mismatch returns nonzero"
if FAKE_AWS_BAD_HASH_BASENAME="$(basename "$DUMP")" run_wrapper > "$TMP/hash-mismatch.log" 2>&1; then
  fail "wrapper unexpectedly accepted a dump metadata mismatch"
fi
assert_contains "$TMP/hash-mismatch.log" "remote dump verification failed"

echo "test: remote checksum size and encryption mismatch returns nonzero"
if FAKE_AWS_BAD_SIZE_BASENAME="$(basename "$CHECKSUM")" run_wrapper > "$TMP/size-mismatch.log" 2>&1; then
  fail "wrapper unexpectedly accepted a checksum size mismatch"
fi
if FAKE_AWS_BAD_SSE_BASENAME="$(basename "$CHECKSUM")" run_wrapper > "$TMP/sse-mismatch.log" 2>&1; then
  fail "wrapper unexpectedly accepted a checksum encryption mismatch"
fi

echo "test: downloaded checksum content mismatch returns nonzero"
if FAKE_AWS_REMOTE_CHECKSUM_MISMATCH=true run_wrapper > "$TMP/content-mismatch.log" 2>&1; then
  fail "wrapper unexpectedly accepted mismatched remote checksum content"
fi
assert_contains "$TMP/content-mismatch.log" "remote checksum content mismatch"

for captured_log in "$TMP"/*.log; do
  assert_not_contains "$captured_log" "$SECRET_VALUE"
done

echo "PASS: aws-s3-backup shell tests"
