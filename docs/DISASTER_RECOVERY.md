# Disaster Recovery

What to do when something is lost — a table, the database, or the whole VPS. This
is the runbook that turns the backup script into an actual recovery. It assumes
the deployment described in `deploy/README.md`: the frontend on Vercel, and a
single VPS running Postgres, Redis, the API and Caddy under
`docker-compose.staging.yml`.

The guiding fact behind every choice here: **the VPS disk is not a backup, and a
dump that has never been restored is a guess.** Both are addressed below.

## What actually needs recovering

| Asset | Where it lives | Recovery source |
| --- | --- | --- |
| **PostgreSQL data** | `postgres_staging_data` volume | the gzipped `pg_dump` written by `scripts/backup-postgres.sh` |
| **Redis** | in-memory, persistence off | nothing — it holds only rate-limit counters (see below) |
| **Secrets** (`.env.staging`) | the VPS, git-ignored | your own secret store — **not** in any backup here |
| **TLS certificates** | `caddy_data` volume | none needed — Caddy re-obtains them from ACME on boot |
| **Application code / images** | git + the Docker build | `git clone` + `docker compose ... up --build` |
| **Frontend** | Vercel | Vercel's own deployment history; redeploy from git |

Only the first row is irreplaceable, which is why the entire backup strategy is
about the database and nothing else. **Redis is deliberately disposable** —
persistence is off because it holds rate-limit counters, not data; losing them
on restart costs one minute of throttling. **TLS is disposable** — Caddy obtains
and renews certificates itself, so a lost `caddy_data` volume costs one ACME
round-trip on next boot, nothing more.

## Objectives (RPO / RTO)

- **RPO (how much data you can lose): up to 24 hours.** The backup runs nightly.
  A failure just before the next run loses at most one day of writes. To tighten
  it, run `scripts/backup-postgres.sh` more often (it is safe to run any time)
  and/or move to continuous archiving (see "Beyond nightly dumps" below).
- **RTO (how long recovery takes): ~15–30 minutes** for a database restore into
  an existing stack; **~1 hour** for a full VPS rebuild, dominated by
  `docker compose build`.

These are the honest numbers for nightly logical dumps on one box. If the
business needs a smaller RPO than 24h, that is a deliberate infrastructure
decision (WAL archiving / a managed Postgres with PITR), not a script change.

## Backups: what runs, and the one thing that makes them real

`scripts/backup-postgres.sh` writes `./backups/<db>-<utc-stamp>.sql.gz`,
verifies the gzip stream is complete before trusting it, prunes dumps older than
`RETENTION_DAYS` (default 14), and — if `OFFSITE_COMMAND` is set — ships the dump
off the box. Install it as cron:

```cron
17 3 * * * cd /opt/flowerp && OFFSITE_COMMAND='rclone copy' ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

**`OFFSITE_COMMAND` is not optional for real DR.** A dump that only exists on the
VPS you are protecting is gone the moment the VPS is. Point it at object storage
you control (`rclone copy`, `aws s3 cp`). The script warns loudly when it is
unset.

Retention is 14 days locally; keep a longer tail offsite (a lifecycle rule on
the bucket — e.g. 30 daily, 12 monthly) so a corruption discovered late is still
recoverable.

## Rehearsing the restore — do this on a schedule

The most important DR task is the one that changes nothing in production:
prove the latest dump restores. `scripts/restore-postgres.sh` does exactly this
by default — it restores into a throwaway `<db>_restore_test`, counts rows as
evidence, and drops the scratch database on exit. **The live database is never
touched.**

```bash
./scripts/restore-postgres.sh backups/erp_staging-<stamp>.sql.gz
```

A green run here is the signal your backups are real. A month without one means
you have backups you have never proven you can use. Automate it if you can (a
weekly cron that alerts on non-zero exit).

## Recovery scenarios

### 1. Bad data / accidental deletion (database intact, contents wrong)

Restore the most recent good dump. First rehearse it into the scratch DB
(above) to confirm the dump predates the damage, then restore into live:

```bash
CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/erp_staging-<stamp>.sql.gz --into-live
```

The dump carries `--clean --if-exists`, so this **replaces** live contents with
the dump's — it is a point-in-time rollback to the backup, not a merge. Anything
written after that dump is lost (your RPO in action). The script refuses to run
without the exact `CONFIRM=RESTORE_LIVE` token, so it cannot fire by accident.

After a live restore: confirm the API boots and a login succeeds before
declaring recovery complete.

### 2. Database container/volume lost, VPS intact

Bring the stack back up (Postgres recreates an empty volume), then restore:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/erp_staging-<stamp>.sql.gz --into-live
```

The API runs `prisma migrate deploy` on start, so the schema is already present
before the data restore; the dump then supplies both schema and rows over it.

### 3. Total VPS loss (rebuild from nothing)

This is why the dump and the secrets both have to live off the box.

1. Provision a fresh Ubuntu VPS (Docker + Compose plugin; firewall to 80/443/SSH
   only). See `deploy/README.md` → *Prerequisites*.
2. Point the DNS A record at the new box **before** first boot, so Caddy's ACME
   challenge succeeds and it gets a real certificate.
3. Recover code and secrets:
   ```bash
   git clone <repo> /opt/flowerp && cd /opt/flowerp
   # restore .env.staging from your secret store — it is NOT in the DB backup
   ```
4. Pull the latest offsite dump into `./backups/`.
5. Bring the stack up, then restore:
   ```bash
   docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
   CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/<db>-<stamp>.sql.gz --into-live
   ```
6. Verify: `curl -fsS https://<domain>/api/health`, then a real login through the
   Vercel frontend.
7. Re-grant platform admin if the staff account was created fresh (see
   `deploy/README.md` → *Platform admin*). If restoring from a dump that already
   contains it, this is unnecessary — the flag is a column, and it comes back
   with the data.

### 4. Frontend (Vercel) down or broken deploy

The frontend is stateless and owned by Vercel. Roll back to a previous
deployment in the Vercel dashboard, or redeploy from git. Nothing on the VPS is
involved. Keep the `vercel.json` rewrite host in lockstep with `SITE_ADDRESS`
(see `deploy/README.md`) — a frontend that builds but points at the wrong API
host is the failure that looks like a frontend bug and is not.

## Secrets are your responsibility, not the backup's

`.env.staging` — `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `APP_SECRET`, SMTP
credentials — is git-ignored and is **not** in the database dump. Store it in a
secret manager or an encrypted vault off the VPS. Two consequences worth stating
plainly:

- **`APP_SECRET` is load-bearing for data, not just auth.** Payment-provider
  credentials and other sensitive fields are AES-256 encrypted with it. Restore
  the database with a *different* `APP_SECRET` and those ciphertexts no longer
  decrypt — the rows are intact but unreadable. The secret must be recovered
  alongside the data, or those encrypted values are lost.
- **`JWT_ACCESS_SECRET`** only affects live sessions: change it and every issued
  access token is rejected, forcing re-login. That is a nuisance, not data loss.

## Beyond nightly dumps (when 24h RPO is too much)

Nightly logical dumps are the right first tier: simple, self-contained, restore
with `psql` alone, no version coupling. When the business outgrows a 24-hour RPO,
the next tier is continuous WAL archiving (`pgBackRest`, or a managed Postgres
with point-in-time recovery) — a larger infrastructure commitment, called out
here so the upgrade path is deliberate rather than a surprise under pressure.

## Checklist

- [ ] `scripts/backup-postgres.sh` installed as nightly cron.
- [ ] `OFFSITE_COMMAND` set — dumps leave the VPS.
- [ ] Offsite retention longer than the 14-day local window.
- [ ] `.env.staging` (esp. `APP_SECRET`) stored in a secret manager off the box.
- [ ] Restore rehearsed this month via `restore-postgres.sh` (scratch mode), green.
- [ ] DNS TTL low enough to re-point quickly in a full-rebuild.
- [ ] This runbook's scenario steps confirmed against the current stack.
