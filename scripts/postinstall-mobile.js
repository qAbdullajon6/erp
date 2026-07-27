#!/usr/bin/env node
/**
 * Two npm-workspaces + Expo monorepo quirks, both reproducible from a clean
 * `rm -rf node_modules && npm install` and both specific to apps/mobile. Neither is
 * a real version conflict — see the mobile foundation report's "Known issues"
 * section for the full investigation of each. Runs as the root "postinstall"
 * script so a fresh install always ends in a working state instead of requiring a
 * remembered follow-up command.
 *
 * 1. `expo-router` hoisting. npm hoists most of apps/mobile's dependencies to the
 *    repo root node_modules but leaves `expo-router` nested in
 *    apps/mobile/node_modules — an npm arborist placement decision, not a version
 *    conflict (nothing else in the repo even depends on expo-router). That's
 *    invisible to Metro, which resolves relative to the project root and finds it
 *    fine, but `@expo/cli`'s typed-routes generator (`@expo/router-server`, itself
 *    hoisted to the root) does a plain Node `require('expo-router/_ctx-shared')`
 *    that only resolves via root node_modules — so `expo start` crashes on startup
 *    with "Cannot find module 'expo-router/_ctx-shared'". Fixed with a symlink.
 *
 * 2. tailwindcss cross-app resolution. apps/web needs tailwindcss v4; apps/mobile's
 *    NativeWind needs v3 (react-native-css-interop hard-peers `tailwindcss: "~3"`
 *    — a real NativeWind 4.2.6 limitation, not a mistake in this repo's setup).
 *    Root now carries its own `tailwindcss: ~3.4.19` devDependency specifically so
 *    npm has a reason to hoist v3 to the root (letting apps/web's v4 need fall back
 *    to its own nested copy, the correct outcome) — but across repeated clean
 *    installs npm's arborist has been observed to hoist apps/web's v4 to root
 *    instead anyway and leave apps/mobile's v3 requirement unsatisfied ("invalid"
 *    in `npm ls`), which crashes Metro with "NativeWind only supports Tailwind CSS
 *    v3" (NativeWind resolves `tailwindcss/package.json` from its own location,
 *    which walks up to whatever landed at the root). The one command that has
 *    reliably fixed it every time it's recurred is a targeted, scoped reinstall —
 *    so that's what this step does, verifying first so it's a no-op once the tree
 *    is already correct.
 *
 * This script must never fail API/web Docker builds. Root `package.json` declares
 * `"postinstall": "node scripts/postinstall-mobile.js"`, and those Dockerfiles run
 * `npm ci --workspace=apps/{api,web} --include-workspace-root`, which installs the
 * root package and therefore runs this lifecycle hook. They also COPY
 * `apps/mobile/package.json` only so npm can resolve the workspace lockfile —
 * that is not a mobile install.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');

function isTruthyEnv(name) {
  const value = process.env[name];
  return value === 'true' || value === '1';
}

/**
 * nativewind is mobile-only. Its presence means this install actually
 * materialised apps/mobile dependencies. `apps/mobile/package.json` alone is
 * not enough — API/web Docker stages copy it for workspace lockfile completeness.
 */
function isMobileDependencyTreePresent() {
  try {
    require.resolve('nativewind/package.json', { paths: [repoRoot] });
    return true;
  } catch {
    return fs.existsSync(
      path.join(repoRoot, 'apps', 'mobile', 'node_modules', 'nativewind'),
    );
  }
}

function getMobileBootstrapSkipReason() {
  if (isTruthyEnv('CI')) return 'CI=true';
  if (isTruthyEnv('DOCKER_BUILD')) return 'DOCKER_BUILD=true';
  if (fs.existsSync('/.dockerenv')) return '/.dockerenv present';
  if (process.env.NODE_ENV === 'production') return 'NODE_ENV=production';
  if (!isMobileDependencyTreePresent()) return 'mobile dependency tree not installed';
  return null;
}

function fixExpoRouterHoist() {
  const target = path.join(repoRoot, 'apps', 'mobile', 'node_modules', 'expo-router');
  const linkPath = path.join(repoRoot, 'node_modules', 'expo-router');

  if (!fs.existsSync(target) || fs.existsSync(linkPath)) return;

  fs.symlinkSync(path.relative(path.dirname(linkPath), target), linkPath, 'dir');
  console.log('[postinstall-mobile] Linked node_modules/expo-router -> apps/mobile/node_modules/expo-router');
}

function fixTailwindResolution() {
  if (!isMobileDependencyTreePresent()) return;

  let resolvedVersion;
  try {
    resolvedVersion = require(
      require.resolve('tailwindcss/package.json', {
        paths: [path.join(repoRoot, 'node_modules', 'nativewind', 'dist', 'metro', 'tailwind')],
      }),
    ).version;
  } catch {
    resolvedVersion = null;
  }

  if (resolvedVersion && resolvedVersion.startsWith('3.')) return;

  console.log(
    `[postinstall-mobile] tailwindcss resolved to ${resolvedVersion ?? 'nothing'} for NativeWind (needs v3) — reinstalling scoped to apps/mobile.`,
  );
  execFileSync('npm', ['install', 'tailwindcss@^3.4.19', '--workspace=apps/mobile'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

const skipReason = getMobileBootstrapSkipReason();
if (skipReason) {
  console.log(
    `[postinstall-mobile] Skipping mobile bootstrap (CI/API-only Docker build): ${skipReason}`,
  );
  process.exit(0);
}

fixExpoRouterHoist();
fixTailwindResolution();
