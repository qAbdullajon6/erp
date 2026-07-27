#!/usr/bin/env node
/**
 * Root package.json postinstall entrypoint.
 *
 * API/web Docker builds run `npm ci --include-workspace-root`, which invokes
 * root lifecycle scripts. Those images COPY this file (and optionally the
 * mobile bootstrap) before npm ci. If the mobile bootstrap is absent for any
 * reason, exit 0 — never fail the install with MODULE_NOT_FOUND.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const bootstrap = path.join(__dirname, 'postinstall-mobile.js');

if (!fs.existsSync(bootstrap)) {
  console.log(
    '[postinstall-mobile] Skipping mobile bootstrap (CI/API-only Docker build): script not present',
  );
  process.exit(0);
}

execFileSync(process.execPath, [bootstrap], { stdio: 'inherit' });
