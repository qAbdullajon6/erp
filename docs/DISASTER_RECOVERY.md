# Disaster Recovery

What to do when something is lost — a table, the database, or the whole VPS. This
is the runbook that turns the backup script into an actual recovery. It assumes
the deployment in `deploy/README.md`: a single VPS running Postgres, Redis, the
API, web, and Caddy under `docker-compose.yml` with `.env.production`.

The guiding fact: **the VPS disk is not a backup, and a dump that has never been
restored is a guess.**

## What actually needs recovering

| Asset | Where it lives | Recovery source |
| --- | --- | --- |
| **PostgreSQL data** | `postgres_data` volume (`flowerp`) | gzipped `pg_dump` from `scripts/backup-postgres.sh` |
| **Redis** | in-memory, persistence off | nothing — rate-limit counters only |
| **Secrets** (`.env.production`) | the VPS, git-ignored | your own secret store — **not** in any backup here |
| **TLS certificates** | `caddy_data` volume | none needed — Caddy re-obtains them from ACME on boot |
| **Application code / images** | git + Docker build | `git clone` + `./scripts/deploy.sh` |
| **Frontend** | VPS `web` service (or Vercel if used) | rebuild from git |

Only the database row is irreplaceable. **Redis is disposable. TLS is disposable.**

## Objectives (RPO / RTO)

- **RPO: up to 24 hours** with nightly dumps. Tighten by running
  `scripts/backup-postgres.sh` more often or adding WAL / managed PITR.
- **RTO: ~15–30 minutes** for a DB restore into an existing stack; **~1 hour**
  for a full VPS rebuild (dominated by `docker compose build`).

## Backups

```cron
17 3 * * * cd /opt/flowerp && OFFSITE_COMMAND='rclone copy remote:flowerp-backups/' ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

Rehearse monthly:

```bash
./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz
```

## Restore into live (last resort)

```bash
CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz --into-live
```

## Full VPS rebuild

1. Provision a new Ubuntu box; install Docker + Compose plugin.
2. Restore `.env.production` from your secret store (it is **not** in the DB dump).
3. Clone the repo to `/opt/flowerp`, copy `.env.production` into place.
4. Point DNS for `flowerp.uz` and `api.flowerp.uz` at the new IP.
5. `./scripts/deploy.sh`
6. `CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz --into-live`
7. Verify `https://api.flowerp.uz/health` and a login.

## Secrets checklist after recovery

Confirm off-box copies of: `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `APP_SECRET`,
SMTP credentials, billing webhook secrets. See `docs/SECRETS_GUIDE.md` and
`docs/DEPLOYMENT_REQUIRED_SECRETS.md`.
