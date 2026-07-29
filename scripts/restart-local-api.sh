#!/usr/bin/env bash
# Kill stale root/user API processes, free ports, start a clean API on :4000.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Stopping old API processes (may ask for sudo password)..."
sudo pkill -9 -f 'node --enable-source-maps dist/main.js' 2>/dev/null || true
sudo pkill -9 -f 'nest start' 2>/dev/null || true
pkill -9 -f 'node --enable-source-maps dist/main.js' 2>/dev/null || true
sleep 1

# Ensure Brevo SMTP resolves even if systemd-resolved is broken
if ! grep -q 'smtp-relay.brevo.com' /etc/hosts 2>/dev/null; then
  echo "==> Adding smtp-relay.brevo.com to /etc/hosts..."
  echo '172.246.243.66 smtp-relay.brevo.com' | sudo tee -a /etc/hosts >/dev/null
fi

# Keep resolv.conf usable
if [[ ! -s /etc/resolv.conf ]] || [[ -L /etc/resolv.conf && ! -e /etc/resolv.conf ]]; then
  echo "==> Fixing /etc/resolv.conf..."
  sudo rm -f /etc/resolv.conf
  printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' | sudo tee /etc/resolv.conf >/dev/null
fi

echo "==> Building API..."
cd "$ROOT/apps/api"
npx nest build

echo "==> Starting API on :4000..."
# Load .env.local via Node (handles MAIL_FROM angle brackets; bash source breaks)
node <<'STARTAPI'
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = process.cwd();
const envPath = path.join(apiDir, '.env.local');
const env = { ...process.env };

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

env.PORT = '4000';
env.NODE_ENV = env.NODE_ENV || 'development';

const logPath = '/tmp/flowerp-api.log';
const logFd = fs.openSync(logPath, 'w');
const child = spawn('node', ['--enable-source-maps', 'dist/main.js'], {
  cwd: apiDir,
  env,
  detached: true,
  stdio: ['ignore', logFd, logFd],
});
child.unref();
fs.writeFileSync('/tmp/flowerp-api.pid', String(child.pid));
console.log('Started API pid', child.pid);
STARTAPI
sleep 3

if curl -sf "http://127.0.0.1:4000/health" >/dev/null; then
  echo "==> API OK on http://127.0.0.1:4000 (pid $(cat /tmp/flowerp-api.pid))"
  echo "    Logs: tail -f /tmp/flowerp-api.log"
else
  echo "==> API failed to start. Last log lines:"
  tail -40 /tmp/flowerp-api.log || true
  exit 1
fi
