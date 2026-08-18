#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "error: usage: aws-s3-backup.sh <dump.sql.gz> <dump.sql.gz.sha256>" >&2
  exit 2
fi

DUMP="$1"
CHECKSUM="$2"

if [[ ! -f "$DUMP" || ! -r "$DUMP" ]]; then
  echo "error: dump is not a readable file" >&2
  exit 2
fi
if [[ ! -f "$CHECKSUM" || ! -r "$CHECKSUM" ]]; then
  echo "error: checksum is not a readable file" >&2
  exit 2
fi

command -v aws >/dev/null 2>&1 || {
  echo "error: AWS CLI v2 is required" >&2
  exit 2
}
if [[ "$(aws --version 2>&1)" != aws-cli/2.* ]]; then
  echo "error: AWS CLI v2 is required" >&2
  exit 2
fi

: "${AWS_REGION:?AWS_REGION is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_BACKUP_PREFIX:?S3_BACKUP_PREFIX is required}"

if [[ ! "$AWS_REGION" =~ ^[a-z0-9-]+$ ||
      ! "$S3_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ||
      "$S3_BUCKET" == *".."* ||
      "$S3_BACKUP_PREFIX" =~ [[:cntrl:]] ]]; then
  echo "error: invalid AWS region, S3 bucket, or backup prefix" >&2
  exit 2
fi

PREFIX="$S3_BACKUP_PREFIX"
while [[ "$PREFIX" == /* ]]; do
  PREFIX="${PREFIX#/}"
done
while [[ "$PREFIX" == */ ]]; do
  PREFIX="${PREFIX%/}"
done
if [[ -z "$PREFIX" ]]; then
  echo "error: S3_BACKUP_PREFIX must identify a non-root prefix" >&2
  exit 2
fi
if [[ "/$PREFIX/" == *"/../"* || "/$PREFIX/" == *"/./"* || "$PREFIX" == *"//"* ]]; then
  echo "error: S3_BACKUP_PREFIX contains an unsafe path segment" >&2
  exit 2
fi
PREFIX="$PREFIX/"

echo "==> validating local backup artifacts"
gzip -t -- "$DUMP"
(
  cd "$(dirname "$CHECKSUM")"
  sha256sum -c -- "$(basename "$CHECKSUM")" >/dev/null
)

DUMP_SHA256="$(sha256sum -- "$DUMP" | awk '{print $1}')"
read -r CHECKSUM_SHA256 CHECKSUM_FILENAME < "$CHECKSUM"
CHECKSUM_FILENAME="${CHECKSUM_FILENAME#\*}"
if [[ "$(wc -l < "$CHECKSUM" | tr -d '[:space:]')" != "1" ||
      "$CHECKSUM_SHA256" != "$DUMP_SHA256" ||
      "$CHECKSUM_FILENAME" != "$(basename "$DUMP")" ]]; then
  echo "error: checksum sidecar does not describe the supplied dump" >&2
  exit 2
fi
DUMP_SIZE="$(wc -c < "$DUMP" | tr -d '[:space:]')"
CHECKSUM_SIZE="$(wc -c < "$CHECKSUM" | tr -d '[:space:]')"
DUMP_KEY="${PREFIX}$(basename "$DUMP")"
CHECKSUM_KEY="${PREFIX}$(basename "$CHECKSUM")"

echo "==> uploading s3://$S3_BUCKET/$DUMP_KEY"
aws s3 cp "$DUMP" "s3://$S3_BUCKET/$DUMP_KEY" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --metadata "sha256=$DUMP_SHA256" \
  --only-show-errors

echo "==> uploading s3://$S3_BUCKET/$CHECKSUM_KEY"
aws s3 cp "$CHECKSUM" "s3://$S3_BUCKET/$CHECKSUM_KEY" \
  --region "$AWS_REGION" \
  --sse AES256 \
  --only-show-errors

echo "==> verifying s3://$S3_BUCKET/$DUMP_KEY"
# tr -d '\r': the AWS CLI ends lines with CRLF on Windows, which would otherwise
# leave a carriage return on the last tab-separated field and fail the compare.
IFS=$'\t' read -r REMOTE_DUMP_SIZE REMOTE_DUMP_SSE REMOTE_DUMP_SHA256 < <(
  aws s3api head-object \
    --bucket "$S3_BUCKET" \
    --key "$DUMP_KEY" \
    --region "$AWS_REGION" \
    --query '[ContentLength,ServerSideEncryption,Metadata.sha256]' \
    --output text | tr -d '\r'
)
if [[ "$REMOTE_DUMP_SIZE" != "$DUMP_SIZE" ||
      "$REMOTE_DUMP_SSE" != "AES256" ||
      "$REMOTE_DUMP_SHA256" != "$DUMP_SHA256" ]]; then
  echo "error: remote dump verification failed for s3://$S3_BUCKET/$DUMP_KEY" >&2
  exit 1
fi

echo "==> verifying s3://$S3_BUCKET/$CHECKSUM_KEY"
IFS=$'\t' read -r REMOTE_CHECKSUM_SIZE REMOTE_CHECKSUM_SSE < <(
  aws s3api head-object \
    --bucket "$S3_BUCKET" \
    --key "$CHECKSUM_KEY" \
    --region "$AWS_REGION" \
    --query '[ContentLength,ServerSideEncryption]' \
    --output text | tr -d '\r'
)
if [[ "$REMOTE_CHECKSUM_SIZE" != "$CHECKSUM_SIZE" ||
      "$REMOTE_CHECKSUM_SSE" != "AES256" ]]; then
  echo "error: remote checksum verification failed for s3://$S3_BUCKET/$CHECKSUM_KEY" >&2
  exit 1
fi

REMOTE_CHECKSUM="$(mktemp)"
trap 'rm -f "$REMOTE_CHECKSUM"' EXIT
aws s3 cp "s3://$S3_BUCKET/$CHECKSUM_KEY" - \
  --region "$AWS_REGION" \
  --only-show-errors > "$REMOTE_CHECKSUM"
if ! cmp -s -- "$CHECKSUM" "$REMOTE_CHECKSUM"; then
  echo "error: remote checksum content mismatch for s3://$S3_BUCKET/$CHECKSUM_KEY" >&2
  exit 1
fi

echo "==> verified S3 backup artifacts at s3://$S3_BUCKET/$PREFIX"
