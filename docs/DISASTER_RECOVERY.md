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

These are planning assumptions, not guarantees. The RPO assumes cron runs,
the provider accepts and verifies both artifacts, alerts are acted on, and an
offsite copy survives. The RTO assumes operators can access the provider,
credentials and encryption keys survive outside the VPS, and a production-sized
dump has been restore-rehearsed. Record actual drill times and revise both.

## Backups

```cron
17 3 * * * cd /opt/flowerp && umask 077 && ./scripts/backup-postgres.sh >> /var/log/flowerp-backup.log 2>&1
```

Keep `REQUIRE_OFFSITE_BACKUP=true` in production and set `OFFSITE_WRAPPER` in
`.env.production` to `/usr/local/bin/flowerp-offsite-backup`. Install AWS CLI v2
on the VPS, then install the repository wrapper without editing it in place:

```bash
sudo install -m 0750 scripts/offsite/aws-s3-backup.sh /usr/local/bin/flowerp-offsite-backup
```

Set `AWS_REGION`, `S3_BUCKET`, and `S3_BACKUP_PREFIX` to the reviewed non-secret
destination values. The parent does not evaluate a command string; it invokes
the absolute executable directly with exactly:

```text
<dump.sql.gz> <dump.sql.gz.sha256>
```

The S3 wrapper contract is all-or-nothing. It validates gzip and the local
checksum, uploads both files with multipart-capable `aws s3 cp` and explicit
SSE-S3 (`AES256`), verifies both remote lengths and encryption, verifies the
dump SHA-256 metadata, then downloads only the remote checksum sidecar and
compares its exact content. It returns nonzero unless every step succeeds.
Retries belong only to the parent script.

AWS credentials come from the standard AWS CLI provider chain. Prefer a VPS
instance role; otherwise use an operator-managed AWS credentials/config file or
protected secret injection. Keep credentials outside git, `.env.production`,
and cron command lines. The bucket must have S3 Block Public Access enabled.
Enable bucket versioning, attach a least-privilege policy based on
`deploy/aws/s3-backup-iam-policy.json`, and retain recovery access in an off-VPS
secret store/runbook. `HeadObject` uses `s3:GetObject`; IAM has no
`s3:HeadObject` action.

Apply `deploy/aws/s3-backup-lifecycle.json` separately as an AWS administrator
after review. The wrapper does not apply it. The rule is limited to `backups/`,
expires current versions after 90 days and noncurrent versions after 30 days,
and aborts incomplete multipart uploads after 7 days. Versioning should be
enabled, but this lifecycle does not absolutely preserve the latest object if
backups stop. Alerts must catch and escalate failures well before 90 days.

`OFFSITE_MAX_ATTEMPTS` and `OFFSITE_RETRY_BACKOFF_SECONDS` control bounded
retries (positive integers; maximum 10 attempts and 3600 seconds). Exhausted
retries fail the run. A failure leaves the new local dump and checksum in place,
does not update `backups/.last-success`, and does not prune older local recovery
points. On success, local dumps and matching sidecars older than
`RETENTION_DAYS` are pruned, then the marker is updated.

The backup writes node-exporter textfile metrics atomically when
`NODE_EXPORTER_TEXTFILE_DIR` is set. `BackupLatestAttemptFailed` detects a
failed/absent latest status and `BackupStale` detects a missing or older-than-26h
success. Alerts do not replace checking cron logs and provider verification.

Rehearse monthly against the script's isolated `${POSTGRES_DB}_restore_test`
database:

```bash
./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz
```

For offsite recovery, install AWS CLI v2 and authenticate on the recovery host
using the operator runbook. Choose one timestamp, then download both objects
without overwriting other recovery points:

```bash
mkdir -m 0700 recovery && cd recovery
aws s3 cp s3://flowerp-812063706887-eu-north-1-an/backups/erp_prod-<stamp>.sql.gz . --region eu-north-1 --only-show-errors
aws s3 cp s3://flowerp-812063706887-eu-north-1-an/backups/erp_prod-<stamp>.sql.gz.sha256 . --region eu-north-1 --only-show-errors
gzip -t erp_prod-<stamp>.sql.gz
sha256sum -c erp_prod-<stamp>.sql.gz.sha256
```

Preserve the matching filenames in one directory. Do not proceed if either
download or either local integrity check fails. Then return to the repository
and run `./scripts/restore-postgres.sh
/absolute/path/to/recovery/erp_prod-<stamp>.sql.gz`; it verifies the sidecar
again before any database command.

The rehearsal never restores over the live database, prints row counts, drops
the scratch database on exit, and writes `backups/.last-restore-drill`. Record
elapsed time during the drill and include provider access/download time.

## Restore into live (last resort)

```bash
CONFIRM=RESTORE_LIVE ./scripts/restore-postgres.sh backups/erp_prod-<stamp>.sql.gz --into-live
```

## Full VPS rebuild

1. Provision a new Ubuntu box; install Docker + Compose plugin and AWS CLI v2.
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
