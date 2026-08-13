#!/usr/bin/env node
/**
 * Disposable database provisioning for the API e2e suite.
 *
 * The e2e specs truncate whole tables, so they must never point at the
 * development database. This script creates a uniquely named database inside
 * the already-running local Postgres container, applies the current
 * migrations, and drops it again afterwards.
 *
 *   node scripts/e2e-db.mjs run              # create, migrate, test, drop
 *   node scripts/e2e-db.mjs run --keep       # leave the database behind
 *   node scripts/e2e-db.mjs run telematics   # pass a filter through to jest
 *   node scripts/e2e-db.mjs create [name]
 *   node scripts/e2e-db.mjs drop <name>
 *   node scripts/e2e-db.mjs list
 *
 * `run` is the safe default for parallel work: every invocation gets its own
 * database, so concurrent agents cannot truncate each other's fixtures.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PG_HOST = process.env.E2E_PG_HOST ?? "localhost";
const PG_PORT = process.env.E2E_PG_PORT ?? "5433";
const PG_USER = process.env.E2E_PG_USER ?? "erp";
const PG_PASSWORD = process.env.E2E_PG_PASSWORD ?? "erp";

/// Only ever create or drop databases matching this. The dev database cannot
/// be named by this script even by explicit argument.
const DISPOSABLE = /^erp_e2e[a-z0-9_]*$/i;

function assertDisposable(name) {
  if (!DISPOSABLE.test(name)) {
    throw new Error(
      `Refusing to touch database "${name}". This script only manages databases named erp_e2e*.`,
    );
  }
}

function timestampName() {
  const t = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+$/, "");
  return `erp_e2e_baseline_${t}`;
}

function findContainer() {
  const byLabel = execFileSync(
    "docker",
    ["ps", "--filter", "label=com.docker.compose.service=postgres", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  ).trim();
  const name = byLabel.split("\n").filter(Boolean)[0];
  if (!name) {
    throw new Error(
      "No running Postgres container found. Start it with:\n  docker compose -f docker-compose.local.yml up -d postgres",
    );
  }
  return name;
}

function psql(container, sql, database = "postgres") {
  return execFileSync(
    "docker",
    ["exec", container, "psql", "-U", PG_USER, "-d", database, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
    { encoding: "utf8" },
  ).trim();
}

function urlFor(name) {
  return `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${name}?schema=public`;
}

function create(name) {
  assertDisposable(name);
  const container = findContainer();
  psql(container, `CREATE DATABASE "${name}"`);
  console.log(`created database ${name}`);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: urlFor(name) },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(`migrations applied to ${name}`);

  /// The e2e specs authenticate as the seeded organisation rather than
  /// registering an admin of their own, so a migrated-but-empty database
  /// fails every authenticated request with a 401.
  execFileSync("npx", ["ts-node", "prisma/seed-test-org.ts"], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: urlFor(name) },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(`seeded test organisation into ${name}`);
  return name;
}

function drop(name) {
  assertDisposable(name);
  const container = findContainer();
  psql(container, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  console.log(`dropped database ${name}`);
}

function list() {
  const container = findContainer();
  const rows = psql(container, "SELECT datname FROM pg_database WHERE datname LIKE 'erp\\_e2e%'");
  console.log(rows || "(no disposable e2e databases)");
}

function run(argv) {
  const keep = argv.includes("--keep");
  const jestArgs = argv.filter((a) => a !== "--keep");
  const name = timestampName();

  create(name);
  let failed = false;
  try {
    execFileSync("npx", ["jest", "--config", "./test/jest-e2e.json", "--runInBand", ...jestArgs], {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: urlFor(name), NODE_ENV: "test" },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  } catch {
    failed = true;
  } finally {
    if (keep) {
      console.log(`\nkeeping database ${name} (--keep)`);
    } else {
      drop(name);
    }
  }
  process.exit(failed ? 1 : 0);
}

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "create":
      console.log(create(rest[0] ?? timestampName()));
      break;
    case "drop":
      if (!rest[0]) throw new Error("usage: node scripts/e2e-db.mjs drop <name>");
      drop(rest[0]);
      break;
    case "list":
      list();
      break;
    case "run":
      run(rest);
      break;
    default:
      console.error("usage: node scripts/e2e-db.mjs <create|drop|list|run>");
      process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
