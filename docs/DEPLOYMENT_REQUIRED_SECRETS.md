# Deployment required secrets
#
# Fill these before the first production deploy. Do not commit real values.
# Full env templates: deploy/.env.example (VPS), apps/web/.env.example (Vercel/build).

## GitHub Actions environment `production`

| Secret | Required |
| --- | --- |
| `VPS_HOST` | Yes |
| `VPS_USER` | Yes |
| `VPS_SSH_KEY` | Yes |
| `VPS_SSH_PASSPHRASE` | Only if the key is encrypted |
| `VPS_SSH_PORT` | No (default 22) |
| `SLACK_WEBHOOK_URL` | No |

## VPS file `.env.production` (from `deploy/.env.example`)

| Variable | Required |
| --- | --- |
| `JWT_ACCESS_SECRET` | Yes — API will not boot |
| `POSTGRES_PASSWORD` | Yes — compose will not start |
| `PUBLIC_ORIGIN` | Yes — compose requires it |
| `APP_PUBLIC_URL` | Yes — production API boot |
| `SITE_ADDRESS` | Yes — real hostname for TLS |
| `APP_SECRET` | Yes if billing or tenant email providers are used |
| `SMTP_URL` + `MAIL_FROM` | **Yes for staff password recovery** and any invite/lead email delivery. Without SMTP, recovery returns the anti-enumeration response but invalidates the undelivered reset token. |
| `LEADS_NOTIFY_EMAIL` | Recommended (falls back to `MAIL_FROM`) |
| `AI_PROVIDER` + matching API key | Only if Copilot is enabled |
| `STRIPE_*` / `CLICK_*` / `PAYME_*` | Only if that payment provider is live |
| `MAPBOX_SECRET_TOKEN` | Recommended for Fleet Tracking Directions / reverse-geocode (`sk.*`). Injected into the API container. Leave empty to disable those API features only. |
| `VITE_MAPBOX_ACCESS_TOKEN` | Recommended for Fleet Tracking map tiles (`pk.*`). Passed as a **web Docker build-arg** (Vite inlines at image build time). Rebuild the web image after changing it. |
| `TELEMATICS_SSE_MAX_CONNECTIONS_PER_ORG` / `_GLOBAL` | Optional (defaults 20 / 500) |
| `TRACCAR_NAVTELECOM_PORT` | Optional (default 5221) — override only if that port is already in use on the VPS |
| `TRACCAR_TELTONIKA_PORT` | Optional (default 5027) — same, for the future FMB920 unit |

### S3 backup configuration and credentials

The tracked VPS template contains only non-secret destination configuration:

| Variable | Required value |
| --- | --- |
| `OFFSITE_WRAPPER` | `/usr/local/bin/flowerp-offsite-backup` |
| `AWS_REGION` | `eu-north-1` |
| `S3_BUCKET` | `flowerp-812063706887-eu-north-1-an` |
| `S3_BACKUP_PREFIX` | `backups/` |

AWS CLI v2 is a VPS system dependency. Install the reviewed wrapper with
`sudo install -m 0750 scripts/offsite/aws-s3-backup.sh
/usr/local/bin/flowerp-offsite-backup`. The wrapper uses the standard AWS CLI
credential provider chain. Prefer a VPS instance role; otherwise provision an
operator-owned AWS credentials/config file or inject credentials from a
protected secret store. Never add `AWS_ACCESS_KEY_ID` or
`AWS_SECRET_ACCESS_KEY` to the tracked environment template, repository, or
cron command.

The bucket must be private with S3 Block Public Access and versioning enabled.
Attach least privilege based on `deploy/aws/s3-backup-iam-policy.json`. Apply
`deploy/aws/s3-backup-lifecycle.json` only as a separate reviewed AWS
administrator action; deployment and the wrapper do not apply it.

### SMTP transport

- `SMTP_URL` must use `smtp://` (normally port 587 with required STARTTLS) or
  `smtps://` (normally port 465 with implicit TLS), for example
  `smtp://USERNAME:PASSWORD@smtp.example.com:587`. URL-encode usernames and
  passwords. Other protocols and malformed URLs are rejected with a generic
  configuration error that does not echo the URL.
- `MAIL_FROM` is mandatory whenever `SMTP_URL` is configured and must be a
  syntactically valid mailbox, for example `FlowERP <no-reply@example.com>`.
- `SMTP_CONNECT_HOST` is optional. It overrides only the TCP connection
  destination (for example, with a fixed IP); TLS SNI and certificate
  verification continue to use the hostname from `SMTP_URL`.
- SMTP always verifies certificates and requires TLS 1.2 or newer. Password
  recovery sends synchronously with 5-second connection and greeting timeouts,
  a 10-second socket timeout, and no API retry. A failed send returns the same
  generic public response and invalidates the undelivered reset token.
- An empty `SMTP_URL` does not block production startup. The unavailable mail
  provider is selected, so email-dependent operations fail safely rather than
  using invented credentials. Under `NODE_ENV=test`, the outbox is always
  selected even if a developer environment contains SMTP settings; tests never
  open an SMTP connection.

Production compose supplies `REDIS_URL=redis://redis:6379` for shared auth
throttling. Deployment readiness checks `/health/ready`; a configured but
unreachable Redis instance blocks rollout instead of silently weakening limits.

## Vercel / frontend build

| Variable | Required |
| --- | --- |
| `VITE_MARKETING_URL` | Recommended |
| `VITE_APP_URL` | Recommended |
| `VITE_MAPBOX_ACCESS_TOKEN` | Recommended if Fleet Tracking maps are used on Vercel |
| `VITE_GA4_MEASUREMENT_ID` / `VITE_GTM_CONTAINER_ID` | Only if analytics enabled |
| Other `VITE_*` | Optional |

Also ensure DNS for `SITE_ADDRESS` points at the VPS before first Caddy TLS issue, and that `apps/web/vercel.json` rewrite host matches the live API (`https://api.flowerp.uz`).
