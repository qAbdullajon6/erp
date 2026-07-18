# Production Smoke Test Checklist

**Purpose:** Verify FlowERP is production-ready before public launch or after a deployment.

**Target audience:** DevOps, QA, Product Owners

**Execution time:** ~45-60 minutes for full checklist

**Prerequisites:**
- Access to staging/production environment
- Valid admin credentials
- API access (curl, Postman, or similar)
- Browser for frontend testing

---

## Pre-Deployment Verification

### Environment Configuration

- [ ] `.env.staging` or `.env.production` file exists on VPS
- [ ] `JWT_ACCESS_SECRET` is set and non-empty
- [ ] `APP_SECRET` is set (if billing/notifications are configured)
- [ ] `DATABASE_URL` points to correct database
- [ ] `REDIS_URL` is set (for multi-instance) or empty (for single-instance)
- [ ] `APP_PUBLIC_URL` matches frontend origin
- [ ] `CORS_ORIGIN` includes frontend origin
- [ ] `SMTP_URL` and `MAIL_FROM` configured (if email is required)
- [ ] `AI_PROVIDER` and corresponding API key set (if AI is enabled)

### Git State

- [ ] Current branch/tag confirmed: `git rev-parse --short HEAD`
- [ ] No uncommitted changes: `git status --short` returns empty
- [ ] Tag matches release: `git describe --tags` (if tagged deployment)

---

## 1. Deployment Verification

### Container Health

**Check all containers are running:**

```bash
cd /opt/flowerp
docker compose -f docker-compose.staging.yml ps
```

- [ ] `postgres` - Status: Up, Health: healthy
- [ ] `redis` - Status: Up, Health: healthy
- [ ] `api` - Status: Up, Health: healthy
- [ ] `caddy` - Status: Up

**Check container logs for errors:**

```bash
docker compose -f docker-compose.staging.yml logs api --tail=100
docker compose -f docker-compose.staging.yml logs caddy --tail=50
docker compose -f docker-compose.staging.yml logs postgres --tail=50
```

- [ ] No `ERROR` or `FATAL` lines in API logs (last 100 lines)
- [ ] No certificate errors in Caddy logs
- [ ] No connection refused errors in any logs

### Database Migrations

```bash
docker compose -f docker-compose.staging.yml exec api npx prisma migrate status
```

- [ ] Output shows "Database schema is up to date!"
- [ ] No pending migrations listed

---

## 2. Health Endpoints

**Base URL:** `https://staging.flowerp.uz` (or `https://api.flowerp.uz` for production)

### GET /api/health

```bash
curl -fsS https://staging.flowerp.uz/api/health | jq
```

**Expected response:**
- [ ] HTTP 200
- [ ] `status: "ok"`
- [ ] `info.version.version` exists (e.g., "0.1.0")
- [ ] `info.commit.sha` exists (not "unknown" in production)
- [ ] `info.uptime.seconds` is a positive integer
- [ ] `timestamp` is recent ISO string (within last 5 seconds)

### GET /api/health/database

```bash
curl -fsS https://staging.flowerp.uz/api/health/database | jq
```

- [ ] HTTP 200
- [ ] `info.database.status: "up"`
- [ ] Response time < 500ms

### GET /api/health/redis

```bash
curl -fsS https://staging.flowerp.uz/api/health/redis | jq
```

- [ ] HTTP 200
- [ ] If REDIS_URL set: `info.redis.status: "up"`
- [ ] If REDIS_URL empty: `info.redis.message: "not_configured"` (this is valid)

### GET /api/health/ready

```bash
curl -fsS https://staging.flowerp.uz/api/health/ready | jq
```

- [ ] HTTP 200
- [ ] `status: "ok"`
- [ ] `info.database.status: "up"`
- [ ] `info.redis` reports up or not_configured

---

## 3. Authentication

### Register New Organization (if testing fresh install)

**Browser:** Navigate to `https://staging.flowerp.uz/auth/sign-up`

- [ ] Registration form loads
- [ ] Fill: email, password, firstName, lastName, organizationName
- [ ] Submit → redirects to `/app` dashboard
- [ ] No console errors in browser DevTools

### Login

**Browser:** Navigate to `https://staging.flowerp.uz/auth/sign-in`

- [ ] Login form loads
- [ ] Enter valid credentials
- [ ] Submit → redirects to `/app` dashboard
- [ ] User name appears in top-right corner
- [ ] No console errors

**API verification:**

```bash
# Get access token
curl -X POST https://staging.flowerp.uz/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dev-test.local","password":"DevTest@123!"}' | jq

# Save the accessToken from response
```

- [ ] HTTP 200
- [ ] Response contains `data.accessToken` (JWT string)
- [ ] Response contains `data.refreshToken` (48-char string)
- [ ] Response contains `data.user` object with email, firstName
- [ ] Response contains `data.membership` with role

### Refresh Token

```bash
# Use the refreshToken from login response
curl -X POST https://staging.flowerp.uz/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}' | jq
```

- [ ] HTTP 200
- [ ] New `accessToken` received (different from original)
- [ ] New `refreshToken` received (different from original)
- [ ] Old refresh token is now invalid (401 if reused)

### Logout

```bash
curl -X POST https://staging.flowerp.uz/api/auth/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}' | jq
```

- [ ] HTTP 200
- [ ] Refresh token is invalidated (401 if used again)

### Unauthorized Request Returns 401

```bash
curl -X GET https://staging.flowerp.uz/api/customers \
  -H "Authorization: Bearer invalid-token" -w "\n%{http_code}\n"
```

- [ ] HTTP 401
- [ ] Response contains `message` about invalid token

---

## 4. Customers Module

**Set ACCESS_TOKEN env var for convenience:**

```bash
export ACCESS_TOKEN="<your-access-token>"
```

### List Customers

```bash
curl -fsS https://staging.flowerp.uz/api/customers \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] Response contains `data` array
- [ ] Each customer has: `id`, `name`, `email`, `status`
- [ ] Response time < 1 second

### Create Customer

```bash
curl -X POST https://staging.flowerp.uz/api/customers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smoke Test Customer",
    "contactPerson": "Test Person",
    "email": "smoketest@example.com",
    "phone": "+998901234567",
    "address": "123 Test St"
  }' | jq

# Save the returned customer ID
export CUSTOMER_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Response contains created customer with `id`
- [ ] Customer appears in list

### Update Customer

```bash
curl -X PATCH https://staging.flowerp.uz/api/customers/$CUSTOMER_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address":"Updated Address 456"}' | jq
```

- [ ] HTTP 200
- [ ] Response shows updated `address`

### Archive Customer

```bash
curl -X PATCH https://staging.flowerp.uz/api/customers/$CUSTOMER_ID/archive \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] Customer status changed to `ARCHIVED`
- [ ] Customer no longer in default list (needs `?includeArchived=true`)

### Restore Customer

```bash
curl -X PATCH https://staging.flowerp.uz/api/customers/$CUSTOMER_ID/restore \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] Customer status back to `ACTIVE`

---

## 5. Orders Module

### Create Driver (prerequisite)

```bash
curl -X POST https://staging.flowerp.uz/api/drivers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Driver",
    "phone": "+998901111111",
    "licenseNumber": "AA1234567",
    "licenseExpiryDate": "2027-12-31"
  }' | jq

export DRIVER_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Driver created with `id`

### Create Vehicle (prerequisite)

```bash
curl -X POST https://staging.flowerp.uz/api/vehicles \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "registrationNumber": "01A123BC",
    "make": "Toyota",
    "model": "Hiace",
    "year": 2023,
    "capacity": 1500
  }' | jq

export VEHICLE_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Vehicle created with `id`

### Create Order

```bash
curl -X POST https://staging.flowerp.uz/api/orders \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "'$CUSTOMER_ID'",
    "pickupAddress": "Warehouse A",
    "deliveryAddress": "Client Location B",
    "pickupCity": "Tashkent",
    "deliveryCity": "Samarkand",
    "pickupDateScheduled": "2026-07-20T09:00:00.000Z",
    "deliveryDateScheduled": "2026-07-20T18:00:00.000Z",
    "price": 50000,
    "currency": "UZS"
  }' | jq

export ORDER_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Order created with `PENDING` status
- [ ] Order has `orderNumber` assigned

### Edit Order

```bash
curl -X PATCH https://staging.flowerp.uz/api/orders/$ORDER_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"price":55000}' | jq
```

- [ ] HTTP 200
- [ ] Price updated to 55000

### Create Dispatch Assignment

```bash
curl -X POST https://staging.flowerp.uz/api/dispatch \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "'$ORDER_ID'",
    "driverId": "'$DRIVER_ID'",
    "vehicleId": "'$VEHICLE_ID'",
    "notes": "Smoke test dispatch"
  }' | jq

export DISPATCH_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Dispatch created with `ASSIGNED` status
- [ ] Order status automatically updated to `ASSIGNED`

### Update Order Status via Dispatch

```bash
curl -X PATCH https://staging.flowerp.uz/api/dispatch/$DISPATCH_ID/status \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "EN_ROUTE_TO_PICKUP",
    "note": "Driver departed"
  }' | jq
```

- [ ] HTTP 200
- [ ] Dispatch status updated
- [ ] Order status updated accordingly

---

## 6. Dispatch Module - Validation Tests

### Notes Field Length Validation

```bash
# Attempt to create dispatch with >2000 char notes (should fail)
curl -X POST https://staging.flowerp.uz/api/dispatch \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "'$ORDER_ID'",
    "driverId": "'$DRIVER_ID'",
    "vehicleId": "'$VEHICLE_ID'",
    "notes": "'$(printf 'x%.0s' {1..2001})'"
  }' -w "\n%{http_code}\n"
```

- [ ] HTTP 400
- [ ] Error message mentions `notes` and `maxLength`

### List Dispatches with Excessive Limit

```bash
# Attempt limit > 200 (should be capped or rejected)
curl -fsS "https://staging.flowerp.uz/api/dispatch?limit=999" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 400 OR HTTP 200 with limit capped at 200
- [ ] No memory spike on server
- [ ] Response contains ≤ 200 items

---

## 7. Finance Module

### View Finance Dashboard

```bash
curl -fsS https://staging.flowerp.uz/api/finance \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] Response contains `revenue`, `expenses`, `profit` fields

### Create Expense

```bash
curl -X POST https://staging.flowerp.uz/api/expenses \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Fuel",
    "amount": 150000,
    "currency": "UZS",
    "category": "FUEL",
    "expenseDate": "2026-07-18"
  }' | jq

export EXPENSE_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Expense created with `PENDING` status

### Create Invoice for Order

```bash
curl -X POST https://staging.flowerp.uz/api/invoices \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "'$ORDER_ID'",
    "dueDate": "2026-07-25"
  }' | jq

export INVOICE_ID="<returned-id>"
```

- [ ] HTTP 201
- [ ] Invoice created with `DRAFT` status
- [ ] Invoice has `invoiceNumber`

### Record Payment

```bash
curl -X POST https://staging.flowerp.uz/api/payments \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "'$INVOICE_ID'",
    "amount": 55000,
    "paymentMethod": "CASH",
    "paymentDate": "2026-07-18"
  }' | jq
```

- [ ] HTTP 201
- [ ] Payment recorded
- [ ] Invoice status updated to `PAID`

---

## 8. AI Assistant

### Check AI Health

```bash
curl -fsS https://staging.flowerp.uz/api/ai/health \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

**Expected:**
- [ ] HTTP 200
- [ ] If `AI_PROVIDER` configured: `configured: true`, `provider: "anthropic"` (or configured provider)
- [ ] If `AI_PROVIDER` not set: `configured: false`

### Simple Chat Request (if AI is configured)

**Browser:** Navigate to `https://staging.flowerp.uz/app/ai-assistant`

- [ ] AI chat interface loads
- [ ] Send message: "What is today's date?"
- [ ] AI responds within 10 seconds
- [ ] Response appears in chat (not an error message)

**API test:**

```bash
curl -X POST https://staging.flowerp.uz/api/ai/chat \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "List my pending orders"
  }' | jq
```

- [ ] HTTP 200
- [ ] Response contains AI-generated text
- [ ] No error about missing API key

### Failure Handling When Provider Unavailable

**If AI_PROVIDER is not configured:**

```bash
curl -X POST https://staging.flowerp.uz/api/ai/chat \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' -w "\n%{http_code}\n"
```

- [ ] HTTP 400 or 503
- [ ] Error message states AI is not configured
- [ ] No server crash

---

## 9. Notifications

### List Notifications

```bash
curl -fsS https://staging.flowerp.uz/api/notifications \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] Response contains `data` array
- [ ] Notifications have `type`, `title`, `message`, `isRead`

### Create Notification (automated via workflow trigger)

**Trigger a workflow that creates a notification (if workflows are configured):**

- [ ] Order status change triggers notification
- [ ] Notification appears in list

### Mark Notification as Read

```bash
# Get first notification ID from list
export NOTIFICATION_ID="<id-from-list>"

curl -X PATCH https://staging.flowerp.uz/api/notifications/$NOTIFICATION_ID/read \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

- [ ] HTTP 200
- [ ] `isRead: true` in response

---

## 10. Performance

### API Response Time

**Measure average response time for key endpoints:**

```bash
# Dashboard/Reports
curl -w "\nTime: %{time_total}s\n" -o /dev/null -s \
  https://staging.flowerp.uz/api/reports/executive-overview \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

- [ ] `/api/health` responds in < 100ms
- [ ] `/api/customers` (list) responds in < 1s
- [ ] `/api/orders` (list) responds in < 1.5s
- [ ] `/api/reports/executive-overview` responds in < 3s

### Memory Usage

```bash
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```

- [ ] API container uses < 512MB RAM at idle
- [ ] API container uses < 1GB RAM under load (after creating 10 orders)
- [ ] No memory leak (RSS stable over 5 minutes)

### CPU Usage

- [ ] API container uses < 10% CPU at idle
- [ ] API container uses < 50% CPU during smoke test
- [ ] CPU returns to baseline after test completes

---

## 11. Security

### JWT Validation

**Test expired token:**

```bash
# Wait for token to expire (15 minutes) OR use an old token
curl -X GET https://staging.flowerp.uz/api/customers \
  -H "Authorization: Bearer <EXPIRED_TOKEN>" -w "\n%{http_code}\n"
```

- [ ] HTTP 401
- [ ] Message about expired or invalid token

**Test tampered token:**

```bash
curl -X GET https://staging.flowerp.uz/api/customers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid" \
  -w "\n%{http_code}\n"
```

- [ ] HTTP 401

### Rate Limiting

**Test auth endpoint rate limit (5 requests/60s):**

```bash
# Send 6 login requests rapidly
for i in {1..6}; do
  curl -X POST https://staging.flowerp.uz/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"wrong@example.com","password":"wrong"}' \
    -w "\n%{http_code}\n" -s -o /dev/null
done
```

- [ ] First 5 requests: HTTP 401 (Unauthorized)
- [ ] 6th request: HTTP 429 (Too Many Requests)
- [ ] Rate limit resets after 60 seconds

### CORS

**Test cross-origin request from browser console:**

Navigate to a different origin (e.g., `https://google.com`), open DevTools console:

```javascript
fetch('https://staging.flowerp.uz/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

- [ ] Request succeeds (CORS allows specified origins)
- [ ] Preflight OPTIONS request succeeds if needed

**Test from unauthorized origin:**

```bash
curl -X GET https://staging.flowerp.uz/api/customers \
  -H "Origin: https://evil.com" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -I
```

- [ ] No `Access-Control-Allow-Origin: https://evil.com` header
- [ ] Request may succeed but browser would block response

### Security Headers

```bash
curl -I https://staging.flowerp.uz/api/health
```

**Verify headers:**
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] No `Server` header (hidden)
- [ ] No `X-Powered-By` header

---

## 12. Rollback Verification

**Prerequisite:** Tag current version before testing rollback

```bash
docker tag flowerp-staging-api:latest flowerp-staging-api:pre-rollback-test
```

### Execute Rollback

```bash
cd /opt/flowerp
CONFIRM=ROLLBACK ./scripts/rollback.sh
```

**Verify rollback:**
- [ ] Script outputs "Rollback complete"
- [ ] API container restarted
- [ ] Health check passes: `curl https://staging.flowerp.uz/api/health`
- [ ] Previous image is now running
- [ ] No data loss (customers/orders still exist)

### Roll Forward Again

```bash
docker tag flowerp-staging-api:pre-rollback-test flowerp-staging-api:previous
docker compose -f docker-compose.staging.yml up -d api
```

- [ ] API returns to current version
- [ ] Health checks pass

---

## 13. Backup Verification

### Verify Backup Script Exists

```bash
ls -lh /opt/flowerp/scripts/backup-postgres.sh
```

- [ ] File exists and is executable

### Run Backup

```bash
cd /opt/flowerp
./scripts/backup-postgres.sh
```

- [ ] Backup completes without error
- [ ] Backup file created in `./backups/` directory
- [ ] Backup file is gzipped: `file backups/<latest>.sql.gz`
- [ ] Backup file size > 0 bytes

### Verify Backup Contents (non-destructive)

```bash
./scripts/restore-postgres.sh backups/<latest>.sql.gz
```

**This restores to a TEST database, not production:**
- [ ] Script outputs "Restoring to test database <db>_restore_test"
- [ ] Restore completes without error
- [ ] Row count displayed
- [ ] Test database dropped at end
- [ ] Production database untouched

### Verify Offsite Backup (if configured)

```bash
# If OFFSITE_COMMAND is set (e.g., rclone, aws s3)
echo $OFFSITE_COMMAND
```

- [ ] `OFFSITE_COMMAND` is set in cron or .env
- [ ] Latest backup exists in offsite location (check cloud console or run offsite list command)

---

## 14. Final Go/No-Go Checklist

### Critical (Must Pass - Blocks Launch)

- [ ] All containers healthy
- [ ] `/api/health` returns 200
- [ ] `/api/health/database` returns 200
- [ ] Database migrations applied successfully
- [ ] Login works (browser + API)
- [ ] JWT validation works (expired token rejected)
- [ ] Can create customer
- [ ] Can create order
- [ ] Can create dispatch
- [ ] Rate limiting active (6th auth attempt blocked)
- [ ] Security headers present (HSTS, X-Frame-Options)
- [ ] Backup script runs and creates valid backup
- [ ] Rollback script completes successfully

### Important (Should Pass - Launch with Caution)

- [ ] Refresh token rotation works
- [ ] All CRUD operations pass (Customer, Order, Dispatch)
- [ ] Finance dashboard loads
- [ ] Invoice creation works
- [ ] Notifications appear
- [ ] API response times acceptable (< 3s for reports)
- [ ] Memory usage stable (< 1GB)
- [ ] Redis healthy (if enabled) or reports not_configured
- [ ] AI health check passes (if configured)
- [ ] Restore verification passes

### Nice to Have (Can Launch - Fix Post-Launch)

- [ ] AI chat responds correctly
- [ ] Workflow automation triggers
- [ ] Email delivery works (if SMTP configured)
- [ ] Performance optimal (< 1s for all list endpoints)
- [ ] Comprehensive error messages

---

## Decision Matrix

| Failures | Decision |
|----------|----------|
| **0 Critical failures** | ✅ **GO** - Ready for launch |
| **1-2 Critical failures** | ⚠️ **HOLD** - Fix and re-test |
| **3+ Critical failures** | 🛑 **NO-GO** - Major issues, full review needed |
| **0 Critical + 0-2 Important** | ✅ **GO** - Launch with monitoring |
| **0 Critical + 3+ Important** | ⚠️ **GO with reservations** - Fix critical path issues ASAP |

---

## Post-Launch Monitoring (First 24 Hours)

After launch, monitor:

- [ ] `/api/health` every 5 minutes (set up monitoring alert)
- [ ] Error rate < 1% (check logs: `docker compose logs api | grep ERROR`)
- [ ] Response time < 2s average (check logs or monitoring)
- [ ] Memory stable (no continuous growth)
- [ ] No crash loops (container restarts)
- [ ] User-reported issues (support channel)
- [ ] Database disk space > 20% free
- [ ] Backup runs successfully (next scheduled run)

**Emergency rollback criteria:**
- Error rate > 5%
- API unavailable > 5 minutes
- Data corruption detected
- Security breach discovered

---

## Notes

- **Smoke test vs. Full QA:** This checklist covers critical paths only. Comprehensive QA testing should happen before this smoke test.
- **Environment:** Run this checklist on staging first, then production pre-launch, then after every production deployment.
- **Timing:** Allow 45-60 minutes. Do NOT rush.
- **Team:** Minimum 2 people (one executes, one verifies).
- **Documentation:** Note all failures in a shared document with timestamps.

**Last updated:** 2026-07-18 (Production Readiness Phase 1)
