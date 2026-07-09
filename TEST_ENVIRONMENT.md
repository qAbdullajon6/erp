# Phase 2.1: Test Environment Setup Guide

This document describes the dedicated test environment for Phase 2: Customers CRUD E2E testing.

## Overview

The test environment is completely isolated from development:
- **Separate PostgreSQL database** on port 5433 (`erp_test`)
- **Test-only rate limiting bypass** (safely gated to `NODE_ENV=test`)
- **Pre-authenticated test sessions** via Playwright global setup
- **Reliable test data** created by seed scripts
- **Deterministic test execution** with no flaky retries

## Architecture

### Test Database

- **Location**: `postgresql://erp:erp@localhost:5433/erp_test?schema=public`
- **Setup**: Automatic migrations and seeding before each test run
- **Test Organization**: "FlowERP Test Logistics" (slug: `flowerp-test-logistics`)
- **Test Credentials**: 
  - Email: `admin@flowerp.test`
  - Password: `FlowERP-Test-2026!`
  - All emails use `.test` TLD (IANA RFC 2606 reserved)

### Backend Configuration

**File**: `/apps/api/.env.test`

```env
NODE_ENV=test
DATABASE_URL="postgresql://erp:erp@localhost:5433/erp_test?schema=public"
DISABLE_AUTH_THROTTLE=true
```

**Rate Limiting Behavior**:
- Global `ThrottlerGuard` is **disabled** when `NODE_ENV=test` (see `app.module.ts` lines 60-62)
- This allows the test suite to make rapid auth requests without hitting the 5 req/60s limit
- The guard is **never** disabled in production or development builds (safe guard)

### Frontend Configuration

**Global Setup**: `/apps/web/e2e/global-setup.ts`
- Creates authenticated session via login
- Saves `auth-state.json` for reuse across all tests
- Caches session for 1 hour (re-uses same auth state within window)
- Waits 70 seconds for rate limiter to reset on first run

**Playwright Config**: `/apps/web/playwright.config.ts`
- Two test projects:
  - `authenticated`: Uses pre-logged-in session from global setup
  - `unauthenticated`: No session (for testing auth flows)
- All Customers CRUD tests run under `authenticated` project

## Test Database Setup

The test database is automatically set up by the runner scripts, but you can also do it manually:

```bash
# Setup migrations
DATABASE_URL="postgresql://erp:erp@localhost:5433/erp_test?schema=public" npx prisma migrate deploy

# Seed test data (creates test org, users, customers, orders, etc)
npm run seed:test-org --workspace=apps/api
```

**What gets created**:
- Test organization "FlowERP Test Logistics"
- 6 test users across different roles
- 3 test customers (Silk Road Traders, Bukhara Foods, Andijan Textiles)
- 8 test orders with various statuses
- Test drivers and vehicles
- Sample invoices, payments, and expenses

## Running the Tests

### Option 1: Windows PowerShell (Recommended for Windows)

```powershell
# Full test suite with validation
.\run-e2e-tests.ps1

# Quick run (skip typecheck/lint/build)
.\run-e2e-tests.ps1 -Quick
```

### Option 2: Node.js (Cross-Platform)

```bash
node run-e2e-tests.mjs
```

### Option 3: Manual Setup (For Debugging)

If you need to run tests manually:

```bash
# Terminal 1: Setup database
cd apps/api
npx ts-node scripts/setup-test-db.ts

# Terminal 2: Start backend in test mode
cd apps/api
NODE_ENV=test DISABLE_AUTH_THROTTLE=true npm run start:dev

# Terminal 3: Start frontend
cd apps/web
npm run dev

# Terminal 4: Run tests
cd apps/web
npx playwright test --project=authenticated
```

## Test Execution Flow

1. **Database Setup** (automatic)
   - Run migrations on test database
   - Seed test organization and data
   - Verify 3 customers exist (Silk Road, Bukhara Foods, Andijan Textiles)

2. **Service Startup** (automatic)
   - Start API backend in test mode (`NODE_ENV=test`)
   - Wait for health endpoint (`http://localhost:4000/health`)
   - Start frontend dev server
   - Wait for frontend (`http://localhost:3001`)

3. **Playwright Global Setup** (automatic)
   - Check for cached auth state (reuse if < 1 hour old)
   - If stale, wait 70 seconds for rate limiter reset
   - Log in with `admin@flowerp.test`
   - Save `auth-state.json` for test reuse

4. **Test Run #1**
   - Run all Customers CRUD tests with authenticated session
   - Tests use pre-logged-in session (no manual login needed)
   - All tests should pass (10 test cases)

5. **Test Run #2** (after 5 second delay)
   - Run all tests again
   - Verify 100% pass rate in both runs
   - Confirms tests are deterministic (no flaky behavior)

6. **Validation** (unless --Quick flag used)
   - TypeCheck: `npm run typecheck`
   - Lint: `npm run lint`
   - Build: `npm run build`

## Test Suite Details

**File**: `/apps/web/e2e/customers-crud-focused.spec.ts`

**10 Test Cases**:

1. **List page loads with real seeded data** - Verify customers table shows seeded "Silk Road Traders"
2. **Create customer workflow** - Create new customer with form validation
3. **Detail page displays customer info** - Navigate to detail, verify fields
4. **Edit customer inline** - Toggle edit mode, verify form inputs
5. **Search filters work** - Search for customer, verify filtered results
6. **Status filter works** - Filter by ACTIVE status
7. **Sorting works** - Click header to sort, verify URL changes
8. **Pagination controls exist** - Verify pagination UI elements
9. **Archive and restore customer** - Check for archive/restore buttons
10. **Error states show feedback** - Simulate API failure, verify error handling

## Environment Variables Summary

### Production/Development (`.env`)
- Standard rate limiting enabled (5 req/60s for auth)
- Development database used

### Test (`.env.test`)
- `NODE_ENV=test`
- Rate limiting disabled (`DISABLE_AUTH_THROTTLE=true`)
- Test database used (`erp_test` on port 5433)
- Same JWT secret as dev (for token generation compatibility)

## Troubleshooting

### "API failed to start"
- Check that port 4000 is not in use: `lsof -i :4000` (or `netstat -ano | findstr :4000` on Windows)
- Check API logs for errors
- Verify `.env.test` exists and has correct DATABASE_URL

### "Frontend failed to start"
- Check that port 3001 is not in use
- Check frontend logs for errors

### "Test database setup failed"
- Verify PostgreSQL is running and test database exists
- Check that `DATABASE_URL` is correct for test database
- Try manual setup: `DATABASE_URL="postgresql://erp:erp@localhost:5433/erp_test?schema=public" npx prisma migrate deploy`

### "Playwright timeout"
- If global setup times out on login, increase the timeout in `global-setup.ts`
- Check that frontend is serving the login page at `http://localhost:3001/auth/sign-in`
- Verify test credentials work manually

### "Tests pass individually but fail together"
- This indicates non-deterministic tests (flaky)
- Check for shared state between tests
- Verify each test properly initializes its state
- Use `test.beforeEach()` for per-test setup instead of `test.beforeAll()`

## Expected Results

When running the full test suite:

```
E2E Test Run #1:
  ✅ 1. List page loads with real seeded data
  ✅ 2. Create customer workflow
  ✅ 3. Detail page displays customer info
  ✅ 4. Edit customer inline
  ✅ 5. Search filters work
  ✅ 6. Status filter works
  ✅ 7. Sorting works
  ✅ 8. Pagination controls exist
  ✅ 9. Archive and restore customer
  ✅ 10. Error states show feedback

E2E Test Run #2: (all tests pass again)
  ✅ All 10 tests pass

Validation:
  ✅ Typecheck: PASSED
  ✅ Lint: PASSED
  ✅ Build: PASSED

✅ ALL TESTS AND VALIDATIONS PASSED
```

## Key Differences from Production

| Aspect | Production | Test |
|--------|-----------|------|
| Database | Main `erp` database | Separate `erp_test` database |
| Rate Limiting | Enabled (5 req/60s) | Disabled via `NODE_ENV=test` |
| Auth State | Session per browser | Pre-generated in global setup |
| Test Data | Real customer data | Seeded test fixtures |
| Data Isolation | Multi-tenant per org | Single test org (flowerp-test-logistics) |

## Next Steps

After tests pass:
1. Verify both E2E runs show 100% pass rate
2. Verify typecheck, lint, and build all pass
3. Proceed to Phase 3: Orders CRUD implementation
4. For each new module, create similar E2E test suite with separate test fixtures
