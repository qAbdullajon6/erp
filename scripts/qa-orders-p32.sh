#!/usr/bin/env bash
# P3.2 Orders Module QA — API harness wrapper
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export API_URL="${API_URL:-http://127.0.0.1:4000}"
echo "Running P3.2 Orders API QA against $API_URL"
node "$ROOT/scripts/qa-orders-p32.mjs" "$@"
