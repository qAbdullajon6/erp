---
name: production-readiness
description: Audits FlowERP for deployment/operational readiness — env config, secrets, health checks, logging, migrations, rate limiting. Use before a release or when auditing what's blocking production deployment.
---

# Production Readiness

## Purpose

Audits whether FlowERP is safe and correct to run in production, distinct from
"does it work in dev." This project already has an active production-readiness
initiative (see the `chore/production-readiness-audit` line of work) — this
skill continues that discipline rather than restarting it from scratch.

## When to Use

- Auditing what's blocking a production deployment.
- Reviewing env/config, health checks, logging, or observability changes.
- Before a release, alongside [[release-checklist]].

## Responsibilities

- Verify `apps/api/.env.example` and `apps/web/.env.example` stay in sync with
  what the code actually reads from `process.env` — an undocumented required
  env var is a deploy-day surprise.
- Verify health check endpoints (`apps/api/src/health/*`) actually check what
  they claim (DB connectivity, Redis if used, not just "server responds").
- Verify logging is structured and doesn't leak secrets/PII (check
  `logging.middleware.ts` and any request/response logging for tokens,
  passwords, or full request bodies containing sensitive fields).
- Verify migrations are deploy-safe (see [[database-migrations]]) — a
  migration that needs `prisma migrate deploy` to run cleanly against a
  populated database, not just a fresh one.
- Verify rate limiting (`@nestjs/throttler` / `@nest-lab/throttler-storage-redis`
  if present) covers auth and other abuse-prone endpoints.

## Workflow

1. Diff `.env.example` files against actual `process.env` reads in code —
   flag anything read but undocumented, or documented but unused.
2. Exercise health endpoints against a real dependency outage (DB down,
   Redis down if applicable) to confirm they actually report unhealthy, not
   just "200 OK because the process is alive."
3. Review recent logging output for anything that shouldn't be there
   (tokens, passwords, full PII payloads).
4. Confirm the current migration set applies cleanly via `prisma migrate
   deploy` against a copy of production-shaped data, not just a fresh DB.
5. Confirm CORS, Helmet, and rate-limit config match the intended production
   posture (not a dev-relaxed config accidentally left in place).
6. Cross-check `docs/TECHNICAL_DEBT.md` for any OPEN entry that's actually a
   production blocker rather than an accepted, scheduled debt.

## Rules

- Never mark something production-ready without checking the actual failure
  mode (a health check that always returns 200 is worse than no health check).
- Never ship a secret, API key, or credential in a committed `.env.example`
  with a real value — only placeholders.
- Never relax CORS/Helmet/rate-limiting for convenience in a change that
  reaches a production branch.

## Best Practices

- Treat `docs/TECHNICAL_DEBT.md` as a living readiness input — an OPEN entry
  with production impact should be surfaced explicitly, not silently ignored
  because it's "just a debt entry."
- Prefer additive, reversible production config changes over one-way switches.

## Never Do

- Never claim production-readiness verification that wasn't actually performed
  (e.g. "health checks work" without actually killing the DB connection to
  check).
- Never skip the `.env.example` sync check because "it probably didn't
  change."

## Checklist

- [ ] `.env.example` files match actual required env vars, both directions.
- [ ] Health checks verified against a real simulated dependency failure.
- [ ] Logging reviewed for secret/PII leakage.
- [ ] Migrations verified deploy-safe against realistic data.
- [ ] CORS/Helmet/rate-limit config confirmed production-appropriate.
- [ ] Open `TECHNICAL_DEBT.md` entries reviewed for production impact.

## Expected Output

A concrete punch list of what's ready vs. blocking, each item backed by an
actual check performed (not assumed), cross-referenced with any relevant open
technical debt.
