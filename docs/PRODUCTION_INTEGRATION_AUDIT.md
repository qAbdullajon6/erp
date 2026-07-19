# Production Integration Audit

> **Purpose.** One place that answers: which external services does FlowERP use, which secrets they need, what is live vs scaffolded, and what is still missing before / after deploy.  
> **Date.** 2026-07-19  
> **Scope.** Entire monorepo: `apps/web`, `apps/api`, Docker/Compose, `deploy/`, `.github/workflows`, `docs/`, scripts. No `packages/` or `infrastructure/` directories exist in this checkout.  
> **Method.** Repo-wide search of env examples, configuration, providers, package dependencies, CI, and deployment docs. This is an audit document — not a redesign or implementation task.

**Status legend**

| Status | Meaning |
| --- | --- |
| **LIVE** | Code path exists and works once secrets/env are set |
| **PARTIAL** | Code exists but incomplete (placeholders, missing SDK, or DB-only config) |
| **SCAFFOLD** | Env vars / registry / docs reserved; no working runtime path yet |
| **MARKETING** | Shown on landing / integrations UI as active or available; not actually wired |
| **N/A** | Infrastructure/process item (no third-party SDK) |

**Configured** below means “has a real non-empty value in the *target* production env.” Examples in `.env.example` do **not** count as configured.

---

## 1. Integration inventory

### 1.1 Marketing & analytics (browser)

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Tag Manager | Tag orchestration + Consent Mode forwarding | Yes | Yes | Check deploy | `VITE_GTM_CONTAINER_ID` | **LIVE** | `.env.example` ships `GTM-N3BSF3TL` (treat as real ID — rotate/confirm ownership). Loads `googletagmanager.com`. |
| Google Analytics 4 | Page/event analytics | Yes | Yes | Check deploy | `VITE_GA4_MEASUREMENT_ID` | **LIVE** | `.env.example` ships `G-7JJZ27NLS5`. Still initializes even if GTM is also set (possible double-fire unless GTM owns GA4). |
| Google Consent Mode v2 | GDPR consent signals for Google tags | Yes | No | Via banner | (driven by consent UI → `analytics.setConsent`) | **LIVE** | Default denied until Accept; DNT treated as reject. |
| Cookie consent banner | User opt-in for analytics/marketing | Yes | No | Feature flag | `VITE_FEATURE_COOKIE_CONSENT` | **LIVE** | Persists to `localStorage`; privacy/terms routes required. |
| Meta Pixel | Ads conversions / retargeting | Yes | Yes | Usually empty | `VITE_META_PIXEL_ID` | **LIVE** | Consent-gated. Leave empty until Ads account ready. |
| LinkedIn Insight | LinkedIn Ads conversions | Partial | Yes | Usually empty | `VITE_LINKEDIN_PARTNER_ID` | **PARTIAL** | Script loads, but conversion IDs hardcoded as `1234567/8/9` placeholders — replace before Ads use. |
| Microsoft Clarity | Session replay / heatmaps | Yes | Yes | Usually empty | `VITE_CLARITY_PROJECT_ID` | **LIVE** | Initializes when env set. Confirm consent policy vs privacy copy. |
| Google Ads | Conversion ID | No provider | Yes | Empty | `VITE_GOOGLE_ADS_ID` | **SCAFFOLD** | Declared in config/types only. |
| Hotjar | UX analytics | No | Yes | Empty | `VITE_HOTJAR_ID` | **SCAFFOLD** | Declared “when implemented”. |
| TikTok Pixel | Ads pixel | No | Yes | Empty | `VITE_TIKTOK_PIXEL_ID` | **SCAFFOLD** | Declared “when implemented”. |
| Yandex Metrica | CIS analytics | No | Yes | Empty | `VITE_YANDEX_METRICA_ID` | **SCAFFOLD** | Declared “when implemented”. |
| Web Vitals (native) | LCP/CLS/INP/FCP/TTFB → analytics | Yes | No | Always on after analytics init | — | **LIVE** | No third-party RUM vendor; reports as `web_vitals` events. |
| UTM / lead attribution | First-touch campaign capture | Yes | No | Always | — | **LIVE** | Stored in `localStorage`; sent with demo lead to API. |

### 1.2 Error tracking & monitoring

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sentry (web) | Client errors | Forward-only | Yes | Empty | `VITE_SENTRY_DSN` | **PARTIAL** | No `@sentry/*` package; forwards to `window.Sentry` if something else inits it. |
| Sentry (API) | Server errors | Env reserved | Yes | Empty | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE` | **SCAFFOLD** | Explicitly “not yet wired” — no `Sentry.init` in `apps/api`. |
| Lovable error hook | Platform capture | Yes | No | Host-dependent | — | **PARTIAL** | `window.__lovableEvents`; useful in Lovable sandbox, not production VPS. |
| Prometheus / Grafana / Loki | Infra metrics & logs | Opt-in compose | Yes (Grafana admin) | Opt-in | `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_ROOT_URL` | **PARTIAL** | Stack under `deploy/monitoring/`; API `/metrics` scrape deferred. |
| Slack (deploy failures) | CI notify | Yes | Yes | Optional | `SLACK_WEBHOOK_URL` (GitHub env) | **LIVE** | Workflow failure only — not app alerts. |
| Alertmanager receivers | PagerDuty/email/Slack alerts | Template only | Yes | Empty | (monitoring templates) | **SCAFFOLD** | Placeholders in monitoring stack. |

### 1.3 Email & lead intake

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SMTP (Nodemailer) | Invite + lead notification mail | Yes | Yes (in URL) | Usually empty | `SMTP_URL`, `MAIL_FROM` | **LIVE** | Prod without SMTP → `UnavailableMailService` (invites fail clearly). |
| Lead notifications | Email sales on demo request | Yes | Uses SMTP | Usually empty | `LEADS_NOTIFY_EMAIL` (falls back to `MAIL_FROM`) | **LIVE** | Lead always persisted; email is best-effort. |
| Resend | Tenant notification provider | Yes (DB config) | Yes | Per-tenant DB | Encrypted via `APP_SECRET` | **PARTIAL** | Runtime provider; credentials in DB, not env. |
| SendGrid | Tenant notification provider | Yes (DB config) | Yes | Per-tenant DB | Encrypted via `APP_SECRET` | **PARTIAL** | Same pattern. |
| AWS SES | Tenant notification provider | Yes (DB config) | Yes | Per-tenant DB | Encrypted via `APP_SECRET` | **PARTIAL** | SDK present; configured in-app. |
| Gmail / Outlook OAuth | “Send via mailbox” | No | OAuth | — | — | **SCAFFOLD / MARKETING** | Integrations registry `coming_soon`. |

### 1.4 AI

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Anthropic | Copilot LLM | Yes | Yes | Empty until chosen | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL`, tuning vars | **LIVE** | Key mandatory only if selected. |
| OpenAI (or compatible) | Copilot LLM | Yes | Yes | Empty until chosen | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `AI_OPENAI_BASE_URL` | **LIVE** | `.env.example` comments say `OPENAI_BASE_URL` — code reads `AI_OPENAI_BASE_URL`. |
| Google Gemini | Copilot LLM | Yes | Yes | Empty until chosen | `AI_PROVIDER=gemini`, `GEMINI_API_KEY` | **LIVE** | |
| Ollama | Self-hosted LLM | Yes | No | Local URL | `AI_PROVIDER=ollama`, `AI_OLLAMA_BASE_URL` | **LIVE** | Default `http://127.0.0.1:11434`. |

### 1.5 Payments / billing

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stripe | Subscriptions / webhooks | Partial | Yes | DB + env | DB: `secretKey`; env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **PARTIAL** | Code present; `stripe` package not in API `package.json` (lazy require will fail until installed). Env vars **missing from `.env.example`**. |
| Click.uz | Local payments | Partial | Yes | DB + env | DB credentials; env: `CLICK_SECRET_KEY` | **PARTIAL** | Not in `.env.example`. |
| Payme.uz | Local payments | Partial | Yes | DB + env | DB credentials; env: `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY` | **PARTIAL** | Not in `.env.example`. |
| QuickBooks | Accounting sync | No | Yes | — | — | **SCAFFOLD / MARKETING** | Registry `coming_soon`. |

### 1.6 Maps, fleet, messaging

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MapLibre GL | Fleet map UI | Yes | No | — | — | **LIVE** | Web dependency. |
| OpenStreetMap tiles | Map tiles | Yes | No (ToS) | Hardcoded | — | **LIVE** | `tile.openstreetmap.org` — respect usage policy; production should use a tile provider / self-host. |
| Google Maps | Routing / ETA (claimed) | No | Yes | — | — | **MARKETING** | Registry marks `active` but **no Google Maps SDK**; ETA is straight-line. |
| Traccar | GPS gateway | Yes | Device secrets in DB | Docker default `admin/admin` | — | **LIVE** | Change defaults in prod. See `docs/TRACCAR_SETUP.md`. |
| Samsara / Geotab | Telematics normalizers | Scaffold | Per vendor | — | — | **SCAFFOLD** | Provider files exist; not live-verified. |
| Generic telematics webhook | Direct GPS ingest | Yes | Per-device secret | — | `TELEMATICS_SSE_*` | **LIVE** | |
| Twilio SMS | Delivery SMS | No | Yes | — | — | **SCAFFOLD / MARKETING** | Registry `coming_soon`. |
| WhatsApp Business API | Order notifications | No | Yes | — | — | **SCAFFOLD / MARKETING** | Registry `coming_soon`. Landing uses `wa.me` **deep links only** (`VITE_CONTACT_WHATSAPP`). |
| Telegram Bot API | Notifications | No | Yes | — | — | **SCAFFOLD / MARKETING** | Registry `coming_soon`. Landing uses `t.me` links only (`VITE_CONTACT_TELEGRAM`). |

### 1.7 Auth, data, APIs

| Service | Purpose | Integrated | API key required | Configured | Environment variables | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL | Primary DB | Yes | Password | Mandatory | `DATABASE_URL` / `POSTGRES_*` | **LIVE** | |
| Redis | Shared rate limits / SSE fanout | Yes | Optional auth | Recommended multi-instance | `REDIS_URL` | **LIVE** | Optional single-instance; **required** multi-instance. |
| JWT sessions | Staff/customer auth | Yes | Secret | Mandatory | `JWT_ACCESS_SECRET`, expiry vars | **LIVE** | App refuses empty JWT secret. |
| `APP_SECRET` | Encrypt DB credentials | Yes | Secret | Mandatory if providers used | `APP_SECRET` | **LIVE** | Load-bearing for payment/email provider ciphertext. |
| Developer outbound webhooks | Customer event delivery | Yes | Customer secrets | Per-org | `WEBHOOK_*` | **LIVE** | SSRF guard; private targets forced off in prod. |
| Workflow inbound webhooks | Trigger workflows | Yes | Per-workflow secret | — | — | **LIVE** | |
| REST API (FlowERP) | App + public leads | Yes | JWT / public throttle | — | Web: same-origin `/api` | **LIVE** | Vite/Caddy/Vercel rewrite strip `/api`. |
| OAuth social login | Google/GitHub login | No | — | — | — | **N/A / missing** | Email+password + invites only. |
| `NEXT_PUBLIC_*` vars | Legacy connected-mode flags | Declared | — | — | `NEXT_PUBLIC_DATA_MODE`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENABLE_API` | **SCAFFOLD** | In web `.env.example` but **not consumed** by current `apps/web/src`. |

### 1.8 Hosting, CDN, CI/CD, domain

| Service | Purpose | Integrated | API key required | Configured | Environment variables / secrets | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VPS (Docker Compose) | API (+ optional SSR web) | Yes | SSH | Ops | GitHub: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, optional passphrase/port | **LIVE** | Deploy workflows. |
| Caddy | TLS + reverse proxy | Yes | ACME | DNS A record | `SITE_ADDRESS`, ports | **LIVE** | Auto SSL via Let's Encrypt. |
| GHCR | API container images | Yes | PAT if private | Ops | `GITHUB_TOKEN` (push); VPS `GHCR_READ_PAT` | **LIVE** | |
| Vercel | Frontend hosting (docs path) | Assumed | Vercel account | Ops | Vercel project env (`VITE_*`) | **LIVE / PARTIAL** | `vercel.json` hardcodes rewrite to `https://api.flowerp.uz/api/:path*`. Prod docs also allow VPS SSR web. |
| Nitro / Node SSR | Web build output | Yes | — | — | `NITRO_PRESET`, `VERCEL` | **LIVE** | |
| Cloudflare / CDN | Edge CDN | No | — | — | — | **Missing** | No Cloudflare config found. |
| Domain / DNS | flowerp.uz | Ops | Registrar | Ops | — | **N/A** | Must point A/AAAA at VPS (and Vercel if used). |
| Google Fonts CDN | Manrope / Inter | Yes | No | Hardcoded | — | **LIVE** | Privacy/perf: consider self-hosting. |
| Postgres backups | Nightly dumps | Script | Offsite creds | Ops | `OFFSITE_COMMAND`, `BACKUP_DIR`, `RETENTION_DAYS` | **PARTIAL** | Local dump works; offsite is operator-supplied (`rclone` / `aws s3 cp`). |
| AWS S3 (backups) | Offsite storage | Documented only | Yes | — | via `OFFSITE_COMMAND` | **SCAFFOLD** | No in-app S3 SDK for product storage. |

### 1.9 Site config (marketing) — not third-party SDKs but deploy-critical

| Item | Env vars | Status |
| --- | --- | --- |
| Marketing / app URLs | `VITE_MARKETING_URL`, `VITE_APP_URL` | Defaults to flowerp.uz / app.flowerp.uz |
| Contact channels | `VITE_CONTACT_EMAIL`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_WHATSAPP`, `VITE_CONTACT_TELEGRAM`, `VITE_CONTACT_WEBSITE` | Defaults to itechnology.uz contacts |
| Social profiles | `VITE_SOCIAL_LINKEDIN`, `VITE_SOCIAL_TWITTER`, `VITE_SOCIAL_FACEBOOK`, `VITE_SOCIAL_INSTAGRAM` | Empty = omitted from schema |
| Feature flags | `VITE_FEATURE_SIGNUP`, `VITE_FEATURE_PRICING_PAGE`, `VITE_FEATURE_COOKIE_CONSENT` | Signup/pricing page default false |

---

## 2. Required secrets (by consumer)

### 2.1 Mandatory to boot / serve production safely

| Secret | Where set | Consumed by | Mandatory? | Dummy today? |
| --- | --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | VPS `.env` | API auth | **Yes** — refuse boot if empty | Blank in examples |
| `DATABASE_URL` / `POSTGRES_PASSWORD` | VPS `.env` | Prisma | **Yes** | Local `erp:erp` only for dev |
| `APP_PUBLIC_URL` | VPS `.env` | Invite links | **Yes in production** | Localhost in examples |
| `CORS_ORIGIN` / `PUBLIC_ORIGIN` | VPS `.env` | API CORS | **Yes** when browser hits API directly | Localhost |
| `APP_SECRET` | VPS `.env` | Encrypt provider credentials | **Yes** if any DB-stored provider used | Blank |
| VPS SSH secrets | GitHub `production` env | Deploy workflow | **Yes** for automated deploy | — |
| DNS + `SITE_ADDRESS` | Registrar + VPS | Caddy TLS | **Yes** | `:8080` local skip ACME |

### 2.2 Strongly recommended before “real” launch

| Secret | Where set | Consumed by | Mandatory? | Notes |
| --- | --- | --- | --- | --- |
| `SMTP_URL` + `MAIL_FROM` | VPS | Invites, lead mail | Strongly | Without SMTP, invites/leads email do not deliver |
| `LEADS_NOTIFY_EMAIL` | VPS | Lead notify | Recommended | Defaults to `MAIL_FROM` |
| `REDIS_URL` | VPS | Rate limits | Required if ≥2 API replicas | Else limits are N× looser |
| `VITE_GTM_CONTAINER_ID` and/or `VITE_GA4_MEASUREMENT_ID` | Vercel / web build | Analytics | If marketing measurement needed | Confirm IDs in `.env.example` are yours |
| One of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | VPS | Copilot | If AI feature shipped | Leave `AI_PROVIDER` empty to disable |

### 2.3 Optional / only when feature enabled

| Secret | Store | Consumed by | Notes |
| --- | --- | --- | --- |
| `VITE_META_PIXEL_ID` | Frontend build | Meta Pixel | |
| `VITE_LINKEDIN_PARTNER_ID` | Frontend build | LinkedIn | Also replace placeholder conversion IDs in code |
| `VITE_CLARITY_PROJECT_ID` | Frontend build | Clarity | |
| `VITE_SENTRY_DSN` / `SENTRY_DSN` | Frontend / VPS | Sentry | **SDK not wired on API**; web is forward-only |
| Stripe / Click / Payme | DB (+ webhook env) | Billing | Document env in `.env.example` before go-live |
| `SLACK_WEBHOOK_URL` | GitHub env | Deploy alerts | |
| `GRAFANA_ADMIN_PASSWORD` | VPS | Monitoring stack | Only if monitoring compose enabled |
| Traccar admin password | Traccar | Telematics | Change from `admin/admin` |
| GHCR read PAT | VPS docker login | Pull images | If package private |

### 2.4 Dummy / placeholder values currently in repo

| Location | Value | Risk |
| --- | --- | --- |
| `apps/web/.env.example` | `G-7JJZ27NLS5`, `GTM-N3BSF3TL` | Look like real IDs — verify ownership; do not assume they are safe defaults for all envs |
| `linkedin-insight.ts` | Conversion IDs `1234567`… | Will report nonsense conversions if LinkedIn enabled |
| `vercel.json` | Rewrite host `api.flowerp.uz` | Production Vercel must change this or traffic hits the wrong API host |
| `DemoModal` conversion `value: 0` | Analytics only | Business-defined later |
| Traccar Docker docs | `admin/admin` | Must change in production |
| Integrations registry | Google Maps `active` | Misleading — maps are OSM/MapLibre |

Authoritative rotation/ownership table: [`docs/SECRETS_GUIDE.md`](./SECRETS_GUIDE.md).

---

## 3. Deployment checklist

Copy this into your runbook. Check each box only when verified in the **production** environment.

### 3.1 Core platform

- [ ] Domain DNS A/AAAA records point at VPS (and Vercel if split)
- [ ] TLS certificate issued (Caddy ACME) / Vercel HTTPS
- [ ] `SITE_ADDRESS` / `PUBLIC_ORIGIN` / `APP_PUBLIC_URL` / `CORS_ORIGIN` match real domains
- [ ] Postgres running; strong `POSTGRES_PASSWORD`; `DATABASE_URL` includes pool + `statement_timeout`
- [ ] Migrations applied (`prisma migrate deploy`)
- [ ] `JWT_ACCESS_SECRET` generated and set
- [ ] `APP_SECRET` generated, backed up off-box, set
- [ ] Redis configured if multi-instance (`REDIS_URL`)
- [ ] API health endpoint green; smoke login works
- [ ] Backup script scheduled; offsite restore tested once

### 3.2 Frontend / marketing

- [ ] All production `VITE_*` set in Vercel (or VPS web env) and redeployed
- [ ] `vercel.json` API rewrite points at **production** API (not a stale host)
- [ ] Favicon, `site.webmanifest`, `og-image.png`, `logo-512.png` served
- [ ] Sitemap/robots regenerated with production host
- [ ] Cookie consent banner tested (accept / essential / DNT)
- [ ] Demo form → `POST /leads` → row in DB → (optional) notify email received
- [ ] `/privacy` and `/terms` reachable from footer

### 3.3 Analytics

- [ ] GTM and/or GA4 account created
- [ ] Measurement / container IDs in production build
- [ ] Consent Mode verified in GTM Preview / GA4 DebugView
- [ ] Meta Pixel (if used): ID set + consent grant fires Lead
- [ ] LinkedIn (if used): partner ID + **real** conversion IDs in code
- [ ] Clarity (if used): project ID set; PII masking reviewed
- [ ] Scroll / CTA / conversion events visible in dataLayer or GA4

### 3.4 Email

- [ ] SMTP provider account created
- [ ] `SMTP_URL` + `MAIL_FROM` set
- [ ] Test invitation email delivered
- [ ] `LEADS_NOTIFY_EMAIL` receives a test demo lead
- [ ] SPF/DKIM/DMARC configured for sending domain

### 3.5 AI (if shipping Copilot)

- [ ] Provider account + billing enabled
- [ ] `AI_PROVIDER` + matching API key set
- [ ] Rate limits reviewed (`AI_RATE_LIMIT_PER_HOUR`)
- [ ] Copilot smoke test in authenticated app

### 3.6 Billing (if shipping payments)

- [ ] Provider account(s) live (Stripe and/or Click/Payme)
- [ ] Credentials entered in admin UI (`APP_SECRET` decrypts)
- [ ] Webhook endpoints registered; `*_WEBHOOK_SECRET` / provider secrets set
- [ ] `stripe` npm package installed if Stripe path used
- [ ] End-to-end test payment in production mode (or staged live)

### 3.7 Fleet / telematics (if shipping)

- [ ] Traccar (or webhook) configured; default admin password changed
- [ ] Device ingest secrets set
- [ ] Live map tiles acceptable under OSM policy (or commercial tiles)
- [ ] SSE limits tuned if needed

### 3.8 Observability

- [ ] Decide: enable `deploy/monitoring` stack or external APM
- [ ] Wire Sentry SDK (API + web) **or** accept gap and track as debt
- [ ] Slack/PagerDuty for deploy + critical alerts
- [ ] Uptime check on `/` and API health from outside the VPS

### 3.9 CI/CD

- [ ] GitHub `production` env secrets: `VPS_*`, optional `SLACK_WEBHOOK_URL`
- [ ] GHCR package visibility / read PAT on VPS
- [ ] Release → deploy dry-run once
- [ ] Rollback path rehearsed (`docs/ROLLBACK_GUIDE.md`)

---

## 4. Services that should exist but are incomplete or missing

| Gap | Why it matters | Current state | Recommendation |
| --- | --- | --- | --- |
| **Sentry SDK wiring** | Blind production without stack traces | Env reserved; no `Sentry.init` | Add `@sentry/node` + `@sentry/react` (or equivalent) and init from existing DSN vars |
| **Uptime / DNS monitoring** | Outages unnoticed until users complain | Not found | External check (Better Stack, UptimeRobot, Cloudflare Health) on marketing + API health |
| **CDN / edge** | Latency, cache, DDoS cushion | No Cloudflare (or other CDN) config | Put marketing + static behind CDN; keep API origin protected |
| **Offsite backup verification** | Backups that are never restored are not backups | Script exists; offsite optional | Require `OFFSITE_COMMAND` + quarterly restore drill (`DISASTER_RECOVERY.md`) |
| **Abuse protection beyond throttle** | Public lead endpoint + auth are internet-facing | Nest throttler + Redis optional | Consider CAPTCHA on leads, WAF, fail2ban/Caddy rate limits |
| **Email deliverability** | Leads/invites land in spam | SMTP optional | Dedicated sending domain + SPF/DKIM/DMARC |
| **Real Google Maps / routing** | Landing claims routing; product uses OSM + straight-line ETA | MARKETING mismatch | Either integrate Maps/Directions API or change marketing copy / registry status |
| **Twilio / WhatsApp / Telegram Business APIs** | Claimed as integrations | `coming_soon` registry + deep links only | Keep “Coming Soon” in UI until APIs exist |
| **Stripe package + env docs** | Billing path will crash or confuse ops | Code without dep / undocumented env | Install `stripe`, document webhook secrets in `.env.example` |
| **OSM tile ToS / commercial tiles** | OSM usage policy for heavy production traffic | Hardcoded public tiles | Switch to MapTiler / self-hosted tiles for production fleet |
| **Self-hosted fonts** | Extra third-party request + privacy | Google Fonts CDN | Optional: self-host Manrope/Inter |
| **Alerting on app errors** | Deploy Slack ≠ product alerts | Deploy-only Slack | Wire Alertmanager or Sentry → Slack/PagerDuty |
| **Social OAuth** | Enterprise buyers sometimes expect SSO | Password + invite only | Track as future; document as out of scope for v1 if intentional |

---

## 5. Package.json signals (hidden / implied integrations)

### `apps/web`

| Package | Implies | Used? |
| --- | --- | --- |
| `maplibre-gl` | Map tiles / GIS | Yes — OSM tiles |
| `@lovable.dev/vite-tanstack-config` | Lovable build + error plugins | Yes (build) |
| No `@sentry/*`, `stripe`, `openai`, `twilio`, `@googlemaps` | — | Confirmed absent |

### `apps/api` / root workspace

| Package / import | Implies | Used? |
| --- | --- | --- |
| `nodemailer` | SMTP | Yes |
| `resend`, `@sendgrid/mail`, `@aws-sdk/client-ses` | Email providers | Yes via notification registry |
| Anthropic / OpenAI / Gemini SDKs (or fetch clients) | LLMs | Yes under `src/ai/providers` |
| Lazy `require('stripe')` | Stripe | Code path exists; **package may be missing** — verify install before enabling |
| No `@sentry/*` | Sentry | Env only |

---

## 6. Environment variable quick index

### Frontend build (`VITE_*` — Vercel or web container)

```
VITE_MARKETING_URL
VITE_APP_URL
VITE_SITE_NAME
VITE_SITE_LEGAL_NAME
VITE_CONTACT_EMAIL
VITE_CONTACT_PHONE
VITE_CONTACT_PHONE_DIAL
VITE_CONTACT_WHATSAPP
VITE_CONTACT_TELEGRAM
VITE_CONTACT_WEBSITE
VITE_SOCIAL_LINKEDIN
VITE_SOCIAL_TWITTER
VITE_SOCIAL_FACEBOOK
VITE_SOCIAL_INSTAGRAM
VITE_FEATURE_SIGNUP
VITE_FEATURE_PRICING_PAGE
VITE_FEATURE_COOKIE_CONSENT
VITE_GA4_MEASUREMENT_ID
VITE_GTM_CONTAINER_ID
VITE_GOOGLE_ADS_ID          # scaffold
VITE_META_PIXEL_ID
VITE_LINKEDIN_PARTNER_ID
VITE_CLARITY_PROJECT_ID
VITE_HOTJAR_ID              # scaffold
VITE_TIKTOK_PIXEL_ID        # scaffold
VITE_YANDEX_METRICA_ID      # scaffold
VITE_SENTRY_DSN             # partial
```

### API / VPS runtime

```
PORT, NODE_ENV
DATABASE_URL / POSTGRES_*
JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRES_IN_SECONDS, REFRESH_TOKEN_EXPIRES_IN_DAYS
APP_SECRET
APP_PUBLIC_URL, CORS_ORIGIN, PUBLIC_ORIGIN, SITE_ADDRESS
SMTP_URL, MAIL_FROM, LEADS_NOTIFY_EMAIL
AI_PROVIDER, AI_MODEL, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
AI_OPENAI_BASE_URL, AI_OLLAMA_BASE_URL, AI_* tuning
REDIS_URL
WEBHOOK_*
TELEMATICS_SSE_*
SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE   # scaffold
REQUEST_TIMEOUT_MS, SHUTDOWN_TIMEOUT_MS
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                    # used, undocumented in .env.example
CLICK_SECRET_KEY                                            # used, undocumented
PAYME_MERCHANT_ID, PAYME_SECRET_KEY                         # used, undocumented
```

### GitHub Actions (`production` environment)

```
VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_SSH_PASSPHRASE?, VPS_SSH_PORT?
SLACK_WEBHOOK_URL?
```

---

## 7. Honest “configured?” snapshot (repo state, not your live box)

This audit **cannot** see your VPS or Vercel dashboards. From the **repository alone**:

| Area | Repo evidence |
| --- | --- |
| Analytics IDs in `.env.example` | Present (look real) — confirm they match your Google accounts |
| Meta / LinkedIn / Clarity | Empty in examples |
| SMTP / AI keys / JWT / APP_SECRET | Empty placeholders |
| Sentry | Documented as unwired |
| Stripe npm + env docs | Incomplete |
| Google Maps / Twilio / WhatsApp Business / Telegram Bot | Not implemented |
| Monitoring compose | Opt-in, incomplete app scrape |

**After deploy, fill a private ops sheet** with one row per secret from §2 and mark Configured = yes/no for the live environment. Do not commit that sheet.

---

## 8. Related docs

| Doc | Role |
| --- | --- |
| [`SECRETS_GUIDE.md`](./SECRETS_GUIDE.md) | Where each secret lives + rotation |
| [`GITHUB_SETUP.md`](./GITHUB_SETUP.md) | CI secrets / GHCR |
| [`DEPLOYMENT_PIPELINE.md`](./DEPLOYMENT_PIPELINE.md) | Release flow |
| [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) | Backups / restore |
| [`deploy/monitoring/README.md`](../deploy/monitoring/README.md) | Observability stack |
| [`BILLING_INFRASTRUCTURE_AUDIT.md`](./BILLING_INFRASTRUCTURE_AUDIT.md) | Payments detail |
| [`TRACCAR_SETUP.md`](./TRACCAR_SETUP.md) | Telematics gateway |

---

## 9. Summary verdict

FlowERP’s **production-ready integrations** (code exists; need secrets) are:

1. Postgres, JWT auth, Redis (multi-instance), Caddy TLS, GHCR + VPS deploy  
2. SMTP invites + lead notify + Resend/SendGrid/SES (DB-configured)  
3. AI providers (Anthropic / OpenAI / Gemini / Ollama)  
4. Analytics stack (GTM, GA4, Meta, Clarity, consent, Web Vitals, UTM attribution)  
5. Developer/workflow webhooks, telematics ingest (+ Traccar)  
6. Billing providers (Click / Payme / Stripe) — **partial**, Stripe packaging/docs gaps  

**Do not treat as live:** Sentry (env only), Google Maps, Twilio, WhatsApp Business API, Telegram Bot API, Hotjar/TikTok/Yandex, Cloudflare CDN, formal uptime monitoring.

**Highest-priority pre-deploy actions:** set mandatory secrets (§2.1), SMTP + lead notify, fix `vercel.json` rewrite for production, decide AI provider, wire or explicitly defer Sentry, correct marketing/registry claims for Maps & messaging, and schedule an offsite backup restore drill.
