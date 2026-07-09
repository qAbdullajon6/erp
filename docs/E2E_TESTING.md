# E2E Testing (Customers CRUD)

Playwright E2E tests run against a dedicated, isolated test environment — separate
database, disabled auth rate limiting, and a pre-authenticated session — so they're
deterministic and safe to run repeatedly.

## Running the suite

```powershell
# Windows PowerShell — full suite (typecheck, lint, build + two E2E runs)
.\run-e2e-tests.ps1

# Quick mode — E2E tests only, skip validation
.\run-e2e-tests.ps1 -Quick
```

```bash
# Cross-platform (Node.js) — always includes validation
node run-e2e-tests.mjs

# Mac/Linux (Bash)
bash test-e2e-suite.sh
```

Each of these does the same thing end-to-end:

1. **Database setup** (~10-30s) — runs migrations against the test DB and seeds a test
   organization, users, and fixtures (`apps/api/scripts/setup-test-db.ts`).
2. **Service startup** (~10-20s) — starts the API (`NODE_ENV=test`) on `:4000` and the
   frontend dev server on `:3001`, waiting for both health checks.
3. **Playwright global setup** (~5-15s) — logs in as `admin@flowerp.test`, caches the
   session in `apps/web/e2e/auth-state.json` (gitignored — contains a real JWT, never
   commit it) for reuse across tests.
4. **Test run #1 and #2** — the full Customers CRUD suite runs twice back-to-back to catch
   flaky/non-deterministic tests.
5. **Validation** (unless `-Quick`) — `typecheck`, `lint`, `build`.

## Architecture

| Aspect | Detail |
|---|---|
| Test database | `postgresql://erp:erp@localhost:5433/erp_test?schema=public` |
| Backend config | `apps/api/.env.test` — `NODE_ENV=test`, `DISABLE_AUTH_THROTTLE=true` |
| Rate limiting | `ThrottlerGuard` is disabled only when `NODE_ENV=test` (see `app.module.ts`) — never in dev/prod |
| Test org | "FlowERP Test Logistics" (slug `flowerp-test-logistics`), created by `npm run seed:test-org --workspace=apps/api` |
| Test credentials | `admin@flowerp.test` / `FlowERP-Test-2026!` (all seeded users use the `.test` TLD, RFC 2606 reserved) |
| Playwright config | `apps/web/playwright.config.ts` — `authenticated` project reuses the cached session, `unauthenticated` project has none |
| Test spec | `apps/web/e2e/customers-crud-focused.spec.ts` — 10 cases: list load, create, detail view, inline edit, search, status filter, sort, pagination, archive/restore, error states |

## Manual / debugging setup

```bash
# 1. Seed the test database
cd apps/api && npx ts-node scripts/setup-test-db.ts

# 2. Start the API in test mode
cd apps/api && NODE_ENV=test DISABLE_AUTH_THROTTLE=true npm run start:dev

# 3. Start the frontend
cd apps/web && npm run dev

# 4. Run the tests
cd apps/web && npx playwright test --project=authenticated
```

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| API failed to start | Port 4000 in use | Kill other node processes, or check `PORT` env var |
| Frontend failed to start | Port 3001 in use | Kill other node processes |
| Database connection error | PostgreSQL not running | Start Postgres, verify port 5433 is reachable |
| Test DB setup failed | Migration issue | Check `apps/api/.env.test` `DATABASE_URL`, or run manually: `DATABASE_URL="postgresql://erp:erp@localhost:5433/erp_test?schema=public" npx prisma migrate deploy` |
| Playwright timeout on login | Slow login / stale rate limiter | Confirm `http://localhost:3001/auth/sign-in` works manually; global setup waits ~70s for the rate limiter to reset on a cold run |
| Tests pass individually, fail together | Shared state between tests | Use `test.beforeEach()` instead of `test.beforeAll()`, check for leaked state |

Windows: find/kill a stuck port with `netstat -ano | findstr :4000` then `taskkill /PID <PID> /F`.
Mac/Linux: `lsof -i :4000` then `kill -9 <PID>`.
