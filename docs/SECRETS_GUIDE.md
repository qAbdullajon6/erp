# Secrets Guide

Every secret the FlowERP pipeline touches: what it is, **where it lives**, **who
owns it**, and **how it is rotated**. The organising principle is that a secret
lives in exactly one authoritative place and is never copied into a second.

There are four stores, and it matters which is which:

1. **GitHub environment secrets** (`production` env) — CI/CD needs them to reach
   the VPS. See GITHUB_SETUP.md.
2. **The VPS `.env.production`** (git-ignored, on the box) — what the running API
   reads. This is the runtime source of truth.
3. **The database (AES-256 encrypted)** — payment-provider credentials, entered
   through the admin UI, encrypted with `APP_SECRET`. Never an env var.
4. **Vercel project env** — the frontend's own settings.

A secret's store is chosen by *who consumes it*. Nothing runtime belongs in
GitHub; nothing CI-only belongs on the VPS.

## Inventory

| Secret | Store | Owner | Rotation |
| --- | --- | --- | --- |
| `VPS_SSH_KEY` (+ `VPS_HOST`/`VPS_USER`/`VPS_SSH_PORT`) | GitHub `production` env | DevOps | New keypair; update `authorized_keys` on the VPS and the env secret; remove the old public key. Quarterly or on team change. |
| `GITHUB_TOKEN` | GitHub (auto, per-run) | GitHub | Automatic — ephemeral per workflow run. Never stored. |
| GHCR read PAT (VPS `docker login`) | VPS (docker credential store) | DevOps | Regenerate the `read:packages` PAT; `docker login` again. Or make the package public and retire the PAT. |
| `SLACK_WEBHOOK_URL` | GitHub `production` env | DevOps | Regenerate in Slack; update the secret. On leak. |
| `POSTGRES_PASSWORD` | VPS `.env.production` | DevOps/DBA | `openssl rand`, update `.env.production`, `ALTER ROLE … PASSWORD`, restart API. Coordinated (brief downtime). |
| `DATABASE_URL` | VPS `.env.production` (derived from the above) | DevOps | Changes only when the password/host changes; it is composed from `POSTGRES_*` in compose. |
| `JWT_ACCESS_SECRET` | VPS `.env.production` | DevOps | `openssl rand -base64 48`; update and restart. Effect: all live access tokens rejected → users re-login. Low blast radius; rotate freely. |
| `APP_SECRET` | VPS `.env.production` | DevOps (**high-value**) | **Load-bearing for data.** It decrypts DB-stored payment credentials — rotating it requires re-encrypting those rows, not just swapping the value. Treat as a key-rotation project, not a config edit. Store off-box (secret manager) so a restore can recover it. See DISASTER_RECOVERY.md. |
| `REDIS_URL` | VPS `.env.production` | DevOps | Only if Redis auth/host changes. No data at risk (counters only). |
| Payment provider creds — **Stripe**, **Click**, **Payme** | **Database, AES-256 encrypted** | Org admin (per tenant) | Entered/updated through the billing admin UI (`PaymentProviderRegistry`), never as env vars. Rotate at the provider, then update via the UI; the new ciphertext is written with `APP_SECRET`. |
| `SMTP_URL` / `MAIL_FROM` | VPS `.env.production` | DevOps | Rotate the SMTP credential at the provider; update and restart. Empty → invite links are logged, not mailed. |
| **AWS** (SES/S3) keys | *not currently required* | DevOps | The mail transport is `SMTP_URL`; the AWS SES SDK is present but unwired. If SES or S3 offsite backups are adopted, prefer **OIDC role assumption** (GITHUB_SETUP.md §7) over static keys; if static keys are unavoidable they go in the store of whoever consumes them (CI → GitHub env; runtime → VPS `.env`). |
| `SENTRY_DSN` (+ `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`) | VPS `.env.production` | DevOps | Scaffolded, not yet wired (see deploy/monitoring). A DSN is low-sensitivity (ingest-only); rotate in Sentry if leaked. |
| `GRAFANA_ADMIN_PASSWORD` | VPS `.env.production` (monitoring stack only) | DevOps | `openssl rand`; update and restart Grafana. Only relevant if the opt-in monitoring stack is running. |
| Vercel project env (e.g. any frontend vars) | Vercel project settings | DevOps | In the Vercel dashboard; redeploy to apply. The frontend currently needs no secret — the API host is baked into `vercel.json`. |

## Rules

- **One store per secret.** A value that is both a GitHub secret and a VPS `.env`
  entry is a value that will drift; pick the consumer's store.
- **Never commit a real value.** `.gitignore` excludes `.env*` (except
  `*.env.example`); the examples hold placeholders only.
- **`APP_SECRET` and the offsite DB backup travel together.** A backup restored
  under a different `APP_SECRET` leaves payment rows intact but undecryptable.
- **Prefer ephemeral/keyless.** `GITHUB_TOKEN` over PATs; OIDC over static cloud
  keys when a cloud is added.
- **Rotation is only real if rehearsed.** After rotating `POSTGRES_PASSWORD` or
  `APP_SECRET`, verify the API boots and a login + a decrypt-path action succeed.

## Generating values

```bash
openssl rand -base64 24 | tr '+/' '-_' | tr -d '='   # POSTGRES_PASSWORD
openssl rand -base64 48 | tr '+/' '-_' | tr -d '='   # JWT_ACCESS_SECRET
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='   # APP_SECRET (>= 32 chars)
ssh-keygen -t ed25519 -C flowerp-deploy -f deploy_key   # VPS_SSH_KEY (private) + .pub
```
