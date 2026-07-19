# Production Readiness Audit - Phase 2

**Backend Infrastructure & Runtime Audit**

**Date:** 2026-07-18  
**Scope:** NestJS backend production configuration, runtime behavior, error handling, resource management

---

## Executive Summary

This audit focuses on runtime reliability, observability, resource management, and operational concerns for the FlowERP backend in production environments.

**Overall Assessment:** The backend is architecturally sound with good fundamentals (graceful shutdown, structured logging, consistent error handling), but has **15 issues** requiring attention before high-traffic production use.

**Critical Issues:** 3  
**High Priority:** 5  
**Medium Priority:** 4  
**Low Priority:** 3

---

## Critical Issues

### CRIT-1: Bootstrap Error Handling Missing

**Severity:** Critical

**Location:** `apps/api/src/main.ts`

**Issue:**
The `bootstrap()` function has no try-catch wrapper and no `.catch()` on the promise chain. If the application fails to start (e.g., port already in use, config validation fails, Prisma schema mismatch), the process exits with an unhandled promise rejection, which may not be logged properly.

```typescript
void bootstrap(); // No error handling
```

**Why it matters:**
- Deployment fails silently or with cryptic "ExperimentalWarning" messages
- No structured log of WHY the boot failed
- Monitoring systems cannot distinguish "failed to start" from "never deployed"
- Docker healthcheck may mark container unhealthy before any log is written

**Recommended fix:**
```typescript
bootstrap().catch((error) => {
  console.error('FATAL: Application failed to start:', error);
  process.exit(1);
});
```

**Effort:** 5 minutes

**Risk if ignored:**
- Deployment failures are hard to diagnose
- Container orchestrators may restart loop without visibility
- P0 incidents take longer to resolve due to lack of boot failure logs

---

### CRIT-2: No Database Connection Pool Configuration

**Severity:** Critical

**Location:** `apps/api/prisma/schema.prisma`, DATABASE_URL

**Issue:**
Prisma's default connection pool size is 10 (or CPU count * 2). This is fine for dev but inadequate for production. There's no explicit `connection_limit` or `pool_timeout` in the DATABASE_URL, and no documentation about tuning this for load.

```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // No pool configuration
}
```

**Why it matters:**
- Under load, requests queue waiting for a connection
- 429/503 errors increase latency
- No control over max connection lifecycle (stale connections)
- Database may run out of connections (Postgres max_connections default is 100)

**Recommended fix:**
1. Document recommended production DATABASE_URL format:
   ```
   postgresql://user:pass@host:5432/db?schema=public&connection_limit=20&pool_timeout=10
   ```
2. Add to `.env.example` with explanation
3. Set `connection_limit` based on: `min(available_postgres_connections / num_api_instances, 50)`
4. Set `pool_timeout=10` (seconds) to fail fast rather than queue indefinitely

**Effort:** 30 minutes (documentation + testing)

**Risk if ignored:**
- Production outages under moderate load (>20 concurrent users)
- Request timeouts when connection pool exhausted
- Cascading failures (slow queries block all connections)

---

### CRIT-3: Cron Jobs Run on Every Instance (No Distributed Lock)

**Severity:** Critical

**Location:**  
- `apps/api/src/billing/subscription-renewal.worker.ts`
- `apps/api/src/billing/usage-snapshot.worker.ts`
- `apps/api/src/notifications/queue/delivery-queue.service.ts`

**Issue:**
Three `@Cron()` jobs run in-process with no locking mechanism:
1. Subscription renewal (daily at midnight)
2. Usage snapshot (daily at 1am)
3. Notification delivery queue (every 30 seconds)

In a multi-instance deployment (horizontal scale behind a load balancer), each instance runs its own copy of these crons. This causes:
- Duplicate billing charges (renewal job runs N times)
- Duplicate notifications sent
- Race conditions on database updates

```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processRenewals() {
  // Runs on ALL instances simultaneously
}
```

**Why it matters:**
- **Data corruption**: Two instances update same subscription simultaneously
- **Duplicate charges**: Customer billed twice for renewal
- **Lost revenue**: Race condition may skip billing
- **Duplicate notifications**: User spammed with N copies of same email

**Recommended fix:**

Option A (Quick): Use Redis-based distributed lock via `@nestjs/schedule` + `ioredis`:
```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processRenewals() {
  const lock = await this.acquireLock('subscription-renewal', 300_000);
  if (!lock) return; // Another instance is running it
  try {
    // ... existing logic
  } finally {
    await lock.release();
  }
}
```

Option B (Better): Move to a dedicated queue (BullMQ, which uses Redis):
- Cron adds job to queue
- One worker picks it up atomically
- Built-in retry, monitoring, failure handling

Option C (Workaround): Document that multi-instance requires Redis + manual worker designation (only 1 instance runs crons)

**Effort:** 
- Option A: 2-3 hours
- Option B: 8-12 hours (migrate to BullMQ)
- Option C: 30 minutes (docs only, operational burden)

**Risk if ignored:**
- P0 production incident (duplicate billing)
- Customer trust damage (overcharging)
- Regulatory/compliance issues

---

## High Priority Issues

### HIGH-1: No Graceful Shutdown Timeout

**Severity:** High

**Location:** `apps/api/src/main.ts`

**Issue:**
`app.enableShutdownHooks()` is called but there's no timeout. If `onModuleDestroy()` hooks hang (e.g., waiting for in-flight SSE streams to close, Prisma disconnect stuck), the process never exits. `docker stop` waits 10 seconds then SIGKILLs, interrupting active transactions.

**Why it matters:**
- In-flight requests are killed mid-transaction
- Database writes may be partially applied (data corruption)
- Long SSE connections delay shutdown indefinitely
- Rolling deploys become "hard" restarts

**Recommended fix:**
```typescript
app.enableShutdownHooks();

// Enforce maximum shutdown time
const shutdownTimeout = setTimeout(() => {
  console.error('Graceful shutdown timed out, forcing exit');
  process.exit(1);
}, 8000); // 8s, leaving 2s for Docker's SIGKILL

process.on('SIGTERM', () => {
  console.log('SIGTERM received, starting graceful shutdown');
  app.close().finally(() => clearTimeout(shutdownTimeout));
});
```

**Effort:** 30 minutes

**Risk if ignored:**
- Partial database writes during deploys
- Lost webhook deliveries
- Inconsistent state during traffic spikes

---

### HIGH-2: No Request Timeout Middleware

**Severity:** High

**Location:** `apps/api/src/app.config.ts` / `main.ts`

**Issue:**
There's no global HTTP request timeout. A slow query (e.g., missing index, full table scan) can block a worker indefinitely. Under load, all workers become blocked and the API stops responding.

**Why it matters:**
- One slow query can cascade into full outage
- No escape hatch for runaway queries
- Resource exhaustion (blocked event loop)
- Clients wait 60s+ for default socket timeout

**Recommended fix:**
Add timeout middleware in `app.config.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';

app.use((req: Request, res: Response, next: NextFunction) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          statusCode: 503,
          message: 'Request timeout',
        },
      });
    }
  }, 30000); // 30s global timeout

  res.on('finish', () => clearTimeout(timeout));
  next();
});
```

**Effort:** 1 hour

**Risk if ignored:**
- Cascading outages under load
- P0 incidents from unoptimized queries going to production

---

### HIGH-3: No Query Timeout Configuration in Prisma

**Severity:** High

**Location:** `apps/api/src/prisma/prisma.service.ts`

**Issue:**
Prisma has no statement_timeout configured. A query can run indefinitely, blocking a connection from the pool.

**Why it matters:**
- One bad query (cartesian product, missing WHERE clause) can starve the connection pool
- No automatic circuit breaker for slow queries
- Monitoring cannot distinguish "legitimately slow" from "runaway query"

**Recommended fix:**
Set `statement_timeout` in DATABASE_URL:
```
postgresql://user:pass@host/db?schema=public&statement_timeout=15000
```
Or in PrismaService:
```typescript
async onModuleInit() {
  await this.$queryRaw`SET statement_timeout = '15s'`;
  this.logger.log('PrismaService ready with 15s query timeout');
}
```

**Effort:** 30 minutes

**Risk if ignored:**
- Production outages from N+1 queries or missing indexes
- Connection pool starvation

---

### HIGH-4: Webhook Dispatcher Has No Circuit Breaker

**Severity:** High

**Location:** `apps/api/src/developer/webhooks/webhook-dispatcher.service.ts`

**Issue:**
The dispatcher's drain loop (`setInterval`) runs every 10 seconds and attempts all pending deliveries. If the target webhook endpoint is down, every attempt times out after `WEBHOOK_TIMEOUT_MS` (10s), blocking the loop for 10s * N deliveries. With 100 pending webhooks, the loop takes 1000 seconds (16 minutes) to complete one cycle.

No circuit breaker stops attempting deliveries to a known-down endpoint.

**Why it matters:**
- Delivery queue stalls when one customer's webhook is misconfigured
- Thundering herd problem (100 simultaneous HTTP requests)
- Exponential backoff is per-delivery, not per-endpoint

**Recommended fix:**
Implement per-endpoint circuit breaker:
```typescript
private endpointHealth = new Map<string, { failures: number, nextAttempt: Date }>();

if (this.isCircuitOpen(delivery.url)) {
  // Skip this delivery, check again later
  return;
}
```

**Effort:** 3-4 hours

**Risk if ignored:**
- Webhook subsystem becomes unreliable
- Cascading delays for all customers

---

### HIGH-5: SSE Streams Have No Connection Limit

**Severity:** High

**Location:** `apps/api/src/telematics/telematics.controller.ts`, `apps/api/src/ai/ai.controller.ts`

**Issue:**
Two endpoints return SSE (Server-Sent Events) streams:
1. `/api/telematics/live` - Fleet tracking (keeps connection open indefinitely)
2. `/api/ai/chat` - AI assistant streaming

There's no limit on concurrent SSE connections per org or globally. One malicious/buggy client can open 1000 connections and exhaust memory.

```typescript
@Sse("live")
liveUpdates() {
  // No connection limit, no cleanup on client disconnect detection
}
```

**Why it matters:**
- Memory grows linearly with open connections (~1-5MB per SSE)
- 500 concurrent streams = 2.5GB RAM
- No defense against slow-loris or connection exhaustion attacks
- File descriptor limit hit (ulimit)

**Recommended fix:**
1. Add connection counter per organization:
   ```typescript
   if (this.activeConnections.get(orgId) >= 10) {
     throw new BadRequestException('Too many active streams');
   }
   ```
2. Clean up on client disconnect:
   ```typescript
   req.on('close', () => {
     this.activeConnections.dec(orgId);
     subscription.unsubscribe();
   });
   ```
3. Document max concurrent SSE in API docs

**Effort:** 2-3 hours

**Risk if ignored:**
- Memory exhaustion outage
- Denial of service via connection exhaustion

---

## Medium Priority Issues

### MED-1: Transaction Isolation Level Not Specified

**Severity:** Medium

**Location:** All `prisma.$transaction()` calls (115 instances)

**Issue:**
Prisma defaults to `READ COMMITTED` isolation level. For critical operations (subscription upgrades, billing charges, double-booking prevention), this can lead to race conditions under concurrent load.

Example: Two simultaneous dispatch assignments for the same driver may both pass the availability check (phantom read), resulting in double-booking.

**Why it matters:**
- Rare but costly data integrity bugs
- "Works in dev, breaks in prod" due to concurrency
- Financial impact (double-billing, lost revenue)

**Recommended fix:**
Use explicit isolation for critical paths:
```typescript
await prisma.$transaction(
  async (tx) => {
    // ... work
  },
  { isolationLevel: 'Serializable' }
);
```

Apply to:
- Billing/subscription changes
- Dispatch assignment (double-booking check)
- Inventory decrements
- Sequential code generation (invoice numbers)

**Effort:** 3-4 hours to audit and annotate critical transactions

**Risk if ignored:**
- Rare data corruption bugs
- Hard to reproduce, hard to fix

---

### MED-2: No Structured Logging (JSON Format)

**Severity:** Medium

**Location:** All `Logger` instances throughout codebase

**Issue:**
NestJS default logger outputs plain text:
```
[HTTP] GET /api/customers 200 +45ms
```

Production log aggregators (ELK, Datadog, CloudWatch) work best with JSON:
```json
{"level":"info","message":"GET /api/customers","status":200,"duration":45,"timestamp":"2026-07-18T..."}
```

**Why it matters:**
- Hard to parse logs for metrics (avg response time, error rate by endpoint)
- Cannot filter/group by structured fields
- Manual log analysis required

**Recommended fix:**
1. Install: `npm i nest-winston winston`
2. Configure in `main.ts`:
   ```typescript
   app.useLogger(app.get(WinstonLogger));
   ```
3. Set format to JSON in production, pretty in development

**Effort:** 2-3 hours

**Risk if ignored:**
- Poor observability
- Slow incident response
- Manual log archaeology

---

### MED-3: No Memory Leak Detection

**Severity:** Medium

**Location:** Long-lived services (SSE, crons, setInterval)

**Issue:**
Several services use long-lived timers and in-memory caches:
- `TelematicsSweeperService` - setInterval every 5 minutes
- `WorkflowSchedulerService` - setInterval every 60s
- `TelematicsRealtimeService` - Redis subscriber (indefinite)

No monitoring for memory growth. If any of these accumulate references (event listeners not removed, Map never pruned), memory leaks go undetected until OOM crash.

**Why it matters:**
- Slow, silent memory growth over days
- Sudden OOM crash with no warning
- Lost state for in-progress work

**Recommended fix:**
1. Add memory usage logging in crons:
   ```typescript
   @Cron(CronExpression.EVERY_HOUR)
   logMemoryUsage() {
     const mem = process.memoryUsage();
     this.logger.log(`Memory: RSS ${mem.rss / 1024 / 1024}MB, Heap ${mem.heapUsed / 1024 / 1024}MB`);
   }
   ```
2. Document "expected" baseline RSS
3. Set up alert for RSS > 1.5x baseline

**Effort:** 1-2 hours

**Risk if ignored:**
- Unexpected production crashes
- Data loss from abrupt termination

---

### MED-4: File Upload Size Not Coordinated with Reverse Proxy

**Severity:** Medium

**Location:** `apps/api/src/import/import.controller.ts`, `deploy/Caddyfile`

**Issue:**
Multer upload limit is 100MB:
```typescript
const UPLOAD_LIMITS = {
  fileSize: 100 * 1024 * 1024, // 100 MB
};
```

But Caddy has no explicit `request_body_max_size` configuration (defaults to unlimited). If Caddy is later configured with a limit (e.g., 10MB), clients will hit 413 errors from Caddy before reaching the API, with no visibility in API logs.

**Why it matters:**
- Inconsistent error messages (client sees generic "413 Request Entity Too Large" from Caddy, not API's structured error)
- Hard to debug (upload fails before API sees request)

**Recommended fix:**
1. Add to Caddyfile:
   ```
   request_body_max_size 100MB
   ```
2. Document upload limits in API docs
3. Keep Caddy, multer, and documentation in sync

**Effort:** 30 minutes

**Risk if ignored:**
- Poor user experience (cryptic errors)
- Support burden (customers confused)

---

## Low Priority Issues

### LOW-1: No Prisma Query Logging in Production

**Severity:** Low

**Location:** `apps/api/prisma/schema.prisma`

**Issue:**
Prisma query logging is not configured. In production, it's valuable to log slow queries (>1s) for performance tuning.

```
generator client {
  provider = "prisma-client-js"
  // No log configuration
}
```

**Why it matters:**
- Cannot identify slow queries without APM tool
- Missing data for index optimization

**Recommended fix:**
Enable in PrismaService for production:
```typescript
if (process.env.NODE_ENV === 'production') {
  this.$on('query', (e) => {
    if (e.duration > 1000) {
      this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}
```

**Effort:** 1 hour

**Risk if ignored:**
- Slow performance tuning cycles
- No proactive query optimization

---

### LOW-2: No Rate Limit Exceeded Metrics

**Severity:** Low

**Location:** `@nestjs/throttler` usage

**Issue:**
When rate limiting triggers (429 response), there's no logging or metric emitted. Cannot distinguish between:
- Legitimate spike (should scale up)
- Bot/scraper (should block)
- Misconfigured frontend (should fix)

**Why it matters:**
- No visibility into rate limit effectiveness
- Cannot tune limits based on data

**Recommended fix:**
Add custom guard that logs 429s:
```typescript
@Injectable()
export class ObservableThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    Logger.warn(`Rate limit exceeded: ${req.ip} ${req.method} ${req.url}`);
    return super.throwThrottlingException(context);
  }
}
```

**Effort:** 1 hour

**Risk if ignored:**
- Blind rate limiting
- No tuning data

---

### LOW-3: No Environment-Specific Sentry/Error Tracking

**Severity:** Low

**Location:** `apps/api/.env.example` (SENTRY_DSN prepared but not wired)

**Issue:**
Sentry config is documented in `.env.example` but never initialized:
```typescript
// No Sentry.init() in main.ts
```

Unhandled exceptions are logged to console but not aggregated.

**Why it matters:**
- No centralized error dashboard
- Cannot track error trends
- No automatic alerting on new error types

**Recommended fix:**
In `main.ts`:
```typescript
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });
}
```

**Effort:** 1 hour

**Risk if ignored:**
- Manual error tracking
- Slower incident detection

---

## Additional Observations (Informational)

### ✅ Strengths

1. **Graceful shutdown implemented** - `app.enableShutdownHooks()` properly configured
2. **Helmet security headers** - CSP, HSTS, X-Frame-Options all present
3. **Consistent error handling** - `AllExceptionsFilter` ensures uniform error shape
4. **Log redaction** - Bearer tokens redacted from logs
5. **Lazy Prisma connection** - App can boot without database for health checks
6. **Tini in Docker** - Proper PID 1 init system for signal handling
7. **Non-root Docker user** - Security best practice followed
8. **Healthcheck in Dockerfile** - Container self-monitoring enabled
9. **Transaction usage** - 115 instances show awareness of data integrity
10. **Rate limiting** - Global + auth-specific throttling configured
11. **Validation pipe** - `whitelist: true`, `forbidNonWhitelisted: true` for security
12. **Redis optional** - App works without Redis (single-instance)

### ⚠️ Configuration Gaps

1. **No NODE_OPTIONS memory limit** - Dockerfile doesn't set `--max-old-space-size`
2. **No PM2 or cluster mode** - Single-threaded, doesn't use all CPU cores
3. **No request ID correlation** - Hard to trace request through logs
4. **No APM/tracing** - No OpenTelemetry or similar
5. **No /metrics endpoint** - Prometheus scraping not supported

---

## Recommended Implementation Order

### Sprint 1 (Week 1) - Critical
1. CRIT-1: Bootstrap error handling (5 min)
2. CRIT-2: Database connection pool docs (30 min)
3. CRIT-3: Cron job locking (Option C: docs only for now) (30 min)

**Total: 1 hour 5 minutes**

### Sprint 2 (Week 2) - High Priority (Prevent Outages)
1. HIGH-1: Graceful shutdown timeout (30 min)
2. HIGH-2: Request timeout middleware (1 hour)
3. HIGH-3: Prisma query timeout (30 min)

**Total: 2 hours**

### Sprint 3 (Week 3) - High Priority (Resource Management)
1. HIGH-4: Webhook circuit breaker (3-4 hours)
2. HIGH-5: SSE connection limits (2-3 hours)

**Total: 5-7 hours**

### Sprint 4 (Week 4) - Medium Priority
1. MED-1: Transaction isolation audit (3-4 hours)
2. MED-2: JSON structured logging (2-3 hours)
3. MED-3: Memory leak detection (1-2 hours)
4. MED-4: Upload size coordination (30 min)

**Total: 7-10 hours**

### Sprint 5 (Month 2) - Low Priority
1. LOW-1: Prisma query logging (1 hour)
2. LOW-2: Rate limit metrics (1 hour)
3. LOW-3: Sentry integration (1 hour)
4. CRIT-3 revisit: Implement distributed locking (8-12 hours)

**Total: 11-15 hours**

---

## Total Effort Estimate

**Critical fixes (must do before scale):** 1 hour  
**High priority (reliability):** 7-9 hours  
**Medium priority (hardening):** 7-10 hours  
**Low priority (observability):** 11-15 hours  

**Grand total:** 26-35 hours (~1 week of focused work)

---

## Risk Summary

| Issue | If Ignored | Probability | Impact | Composite Risk |
|-------|-----------|-------------|--------|---------------|
| CRIT-1 | Silent boot failures | High | High | **P0** |
| CRIT-2 | Connection exhaustion | High | Critical | **P0** |
| CRIT-3 | Duplicate billing | Medium (multi-instance) | Critical | **P0** |
| HIGH-1 | Transaction corruption | Medium | High | **P1** |
| HIGH-2 | Cascading query timeouts | High | High | **P1** |
| HIGH-3 | Connection pool starvation | High | High | **P1** |
| HIGH-4 | Webhook queue stall | Medium | Medium | **P1** |
| HIGH-5 | Memory exhaustion | Medium | High | **P1** |
| MED-1 | Rare data corruption | Low | High | **P2** |
| MED-2 | Poor incident response | Certain | Low | **P2** |
| MED-3 | Slow memory leaks | Low | Medium | **P2** |
| MED-4 | Confusing upload errors | Low | Low | **P2** |
| LOW-* | Operational friction | Certain | Low | **P3** |

---

## Go/No-Go Recommendation

**For single-instance production/pilot (< 50 users):** ✅ GO after Sprint 1 (Critical fixes)

**For production launch (public):** ⚠️ HOLD until Sprint 2 complete (High-1,2,3)

**For multi-instance/high-traffic production:** 🛑 NO-GO until Sprint 5 complete (especially CRIT-3 distributed locking)

---

**Last Updated:** 2026-07-18 (Production Readiness Phase 2)  
**Next Review:** After implementing Sprint 1-2 fixes
