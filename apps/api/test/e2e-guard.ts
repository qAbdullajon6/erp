/// Refuses to let the API e2e suite touch anything but a disposable database.
///
/// Several specs clear whole tables to get a clean fixture — for example
/// `prisma.telematicsDevice.deleteMany({})` in telematics.e2e-spec.ts. An empty
/// Prisma filter matches every row, so pointed at the local development
/// database those calls delete the registered GPS hardware and its vehicle
/// binding. Nothing in the runtime prevented that: `.env` and `.env.local` both
/// resolve DATABASE_URL to erp_dev, and @nestjs/config only fills in keys that
/// are absent from process.env, so a bare `npm run test:e2e` silently inherited
/// the developer's own data.
///
/// Jest loads this through `setupFiles`, which runs in every worker process
/// before a spec can import PrismaClient. The suite therefore cannot start
/// unless DATABASE_URL was set deliberately, and only ever to a throwaway
/// database on a local host.
///
/// Provision one with: node scripts/e2e-db.mjs create

const ALLOWED_DATABASE = /^erp_(e2e|test|ci)(_[a-z0-9_]+)?$/i;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db"]);

function fail(reason: string, detail: string): never {
  throw new Error(
    [
      "",
      "  API e2e suite refused to start.",
      "",
      `  ${reason}`,
      `  ${detail}`,
      "",
      "  These specs truncate whole tables. Run them only against a disposable",
      "  database, never against development or production data.",
      "",
      "  Provision one:",
      "    cd apps/api && node scripts/e2e-db.mjs create",
      "",
      "  Then run the suite with the DATABASE_URL it prints, and drop it after:",
      "    node scripts/e2e-db.mjs drop <name>",
      "",
    ].join("\n"),
  );
}

const raw = process.env.DATABASE_URL;

if (!raw) {
  fail(
    "DATABASE_URL is not set.",
    "Without it the app would fall back to .env / .env.local, which point at the dev database.",
  );
}

let parsed: URL;
try {
  parsed = new URL(raw);
} catch {
  fail("DATABASE_URL is not a valid URL.", "Expected postgresql://user:password@host:port/database");
}

const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
const host = parsed.hostname;

if (!LOCAL_HOSTS.has(host)) {
  fail(
    `DATABASE_URL points at a non-local host (${host}).`,
    "The e2e suite is destructive and may only run against a local database server.",
  );
}

if (!ALLOWED_DATABASE.test(database)) {
  fail(
    `DATABASE_URL points at database "${database}", which is not a recognised throwaway database.`,
    'Allowed names match erp_e2e*, erp_test* or erp_ci* — for example "erp_e2e_baseline_20260813".',
  );
}
