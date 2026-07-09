# Quick Start: Running E2E Tests

## One Command to Run Everything

### Windows (PowerShell)
```powershell
cd C:\Users\ACER\Desktop\erp
.\run-e2e-tests.ps1
```

### Mac/Linux (Bash)
```bash
cd ~/path/to/erp
bash test-e2e-suite.sh
```

### Cross-Platform (Node.js)
```bash
cd ~/path/to/erp
node run-e2e-tests.mjs
```

## What Happens Automatically

1. **Database Setup** (≈30 seconds)
   - Runs migrations on test database
   - Seeds test organization and 3 customers
   - Creates test users with proper credentials

2. **Services Start** (≈10 seconds)
   - Backend API starts on `localhost:4000`
   - Frontend dev server starts on `localhost:3001`
   - Waits for both to be ready

3. **Playwright Setup** (≈5-10 seconds)
   - Creates authenticated session
   - Logs in with `admin@flowerp.test`
   - Caches session for test reuse

4. **Test Run #1** (≈30-60 seconds)
   - Runs 10 customer CRUD tests
   - Should see 10 passing tests
   - No manual login needed (uses cached session)

5. **Test Run #2** (≈30-60 seconds)
   - Runs same 10 tests again
   - Should see 10 passing tests again (proves deterministic)
   - Confirms no flaky behavior

6. **Validation** (≈30-60 seconds, unless using -Quick)
   - TypeCheck
   - Lint
   - Build

## Success Indicators

### ✅ What You Want to See

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

E2E Test Run #2: (all 10 pass again)

Final Report:
✅ E2E Test Run #1: PASSED
✅ E2E Test Run #2: PASSED
✅ Typecheck: PASSED
✅ Lint: PASSED
✅ Build: PASSED

✅ ALL TESTS AND VALIDATIONS PASSED
```

### ❌ What Might Go Wrong

| Problem | Cause | Solution |
|---------|-------|----------|
| API failed to start | Port 4000 in use | Kill other node processes or check PORT env var |
| Frontend failed to start | Port 3001 in use | Kill other node processes |
| Database connection error | PostgreSQL not running | Start PostgreSQL, verify port 5433 accessible |
| Test database setup failed | Migrations issue | Check `/apps/api/.env.test` DATABASE_URL |
| Playwright timeout | Slow login | Check frontend at http://localhost:3001/auth/sign-in works |
| Tests fail intermittently | Flaky tests | All tests should be deterministic; check for shared state |

## Manual Debugging

If you need to debug a specific issue:

### Terminal 1: Start Database Setup
```bash
cd apps/api
npx ts-node scripts/setup-test-db.ts
```

### Terminal 2: Start API Backend
```bash
cd apps/api
NODE_ENV=test DISABLE_AUTH_THROTTLE=true npm run start:dev
```

### Terminal 3: Start Frontend
```bash
cd apps/web
npm run dev
```

### Terminal 4: Run Tests
```bash
cd apps/web
npx playwright test --project=authenticated
```

### Terminal 5: Check Auth State (optional)
```bash
cat apps/web/e2e/auth-state.json | jq .
```

## Test Credentials

- **Email**: `admin@flowerp.test`
- **Password**: `FlowERP-Test-2026!`

(These are automatically used by the global setup)

## Test Database Details

- **Server**: `localhost:5433`
- **Database**: `erp_test`
- **Username**: `erp`
- **Password**: `erp`

Connection string:
```
postgresql://erp:erp@localhost:5433/erp_test?schema=public
```

## Test Data Created

When the setup runs, these customers are created:
1. **Silk Road Traders (Test)** - CUS-0001
2. **Bukhara Foods (Test)** - CUS-0002
3. **Andijan Textiles (Test)** - CUS-0003

Tests verify these customers appear in the list.

## Timing Expectations

| Phase | Duration | Notes |
|-------|----------|-------|
| Database setup | 10-30s | Includes migrations and seed |
| API startup | 5-10s | Waits for health endpoint |
| Frontend startup | 5-10s | Waits for localhost:3001 |
| Global auth setup | 5-15s | May wait for rate limiter reset on first run |
| Test Run #1 | 30-60s | 10 tests |
| Test Run #2 | 30-60s | 10 tests again |
| Validation | 30-60s | typecheck, lint, build |
| **Total** | **2-4 minutes** | Entire suite |

## Options

### Windows PowerShell

```powershell
# Full suite (includes validation)
.\run-e2e-tests.ps1

# Quick mode (E2E tests only, skip validation)
.\run-e2e-tests.ps1 -Quick
```

### Node.js (cross-platform)

```bash
node run-e2e-tests.mjs
```

(Always includes validation)

## Troubleshooting: Port Already in Use

### Windows
```powershell
# Find process on port 4000
netstat -ano | findstr :4000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Mac/Linux
```bash
# Find process on port 4000
lsof -i :4000

# Kill the process
kill -9 <PID>
```

## For More Details

See:
- **Architecture & Setup**: `/TEST_ENVIRONMENT.md`
- **Implementation Details**: `/PHASE_2_1_IMPLEMENTATION.md`
- **Test Specs**: `/apps/web/e2e/customers-crud-focused.spec.ts`

## Next Steps After Tests Pass

1. ✅ Confirm both E2E runs show 100% pass rate
2. ✅ Confirm typecheck, lint, and build pass
3. → Proceed to Phase 3: Orders CRUD implementation
4. → Create similar E2E infrastructure for Orders module

---

**Phase 2.1 Status**: ✅ COMPLETE - Ready for acceptance testing
