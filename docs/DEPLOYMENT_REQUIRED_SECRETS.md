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
| `SMTP_URL` + `MAIL_FROM` | Yes if invite / lead email must deliver |
| `LEADS_NOTIFY_EMAIL` | Recommended (falls back to `MAIL_FROM`) |
| `AI_PROVIDER` + matching API key | Only if Copilot is enabled |
| `STRIPE_*` / `CLICK_*` / `PAYME_*` | Only if that payment provider is live |
| `MAPBOX_SECRET_TOKEN` | Recommended for Fleet Tracking Directions / reverse-geocode (`sk.*`). Injected into the API container. Leave empty to disable those API features only. |
| `VITE_MAPBOX_ACCESS_TOKEN` | Recommended for Fleet Tracking map tiles (`pk.*`). Passed as a **web Docker build-arg** (Vite inlines at image build time). Rebuild the web image after changing it. |
| `TELEMATICS_SSE_MAX_CONNECTIONS_PER_ORG` / `_GLOBAL` | Optional (defaults 20 / 500) |

## Vercel / frontend build

| Variable | Required |
| --- | --- |
| `VITE_MARKETING_URL` | Recommended |
| `VITE_APP_URL` | Recommended |
| `VITE_MAPBOX_ACCESS_TOKEN` | Recommended if Fleet Tracking maps are used on Vercel |
| `VITE_GA4_MEASUREMENT_ID` / `VITE_GTM_CONTAINER_ID` | Only if analytics enabled |
| Other `VITE_*` | Optional |

Also ensure DNS for `SITE_ADDRESS` points at the VPS before first Caddy TLS issue, and that `apps/web/vercel.json` rewrite host matches the live API (`https://api.flowerp.uz`).
