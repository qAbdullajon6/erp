# Production Environment Checklist

> **ONE source of truth** for every environment variable FlowERP reads before / during / after deploy.  
> **Date.** 2026-07-19  
> **Scope.** `apps/api`, `apps/web`, Docker/Compose, `deploy/`, `scripts/`, `.github/workflows`, Caddy, Prisma, analytics, email, billing, AI, monitoring.  
> **No nginx** config exists in this repo.  
> **Related.** [`PRODUCTION_INTEGRATION_AUDIT.md`](./PRODUCTION_INTEGRATION_AUDIT.md) (services) · [`SECRETS_GUIDE.md`](./SECRETS_GUIDE.md) (rotation / stores)

**How to use this document**

1. Before deploy: walk §1 tables and fill the **Production value** column in your private ops sheet (never commit real secrets).  
2. Check §2–§5 for unused / duplicate / wrong / missing vars.  
3. Use §6 as the day-of deploy gate.  
4. Track readiness via §7 score.

**Column legend**

| Column | Meaning |
| --- | --- |
| **Req** | `M` = mandatory for that surface to boot/serve safely · `C` = conditional (feature on) · `O` = optional |
| **Fail?** | Does empty/missing cause **API boot**, **compose up**, **CI deploy**, or **feature hard-fail**? |
| **Secret?** | Must never be committed; rotate on leak |
| **Default** | Code / compose / `.env.example` default when unset |

---

## 1. Master inventory

### 1.1 Auth & encryption (API)

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | `apps/api/src/config/configuration.ts`, compose, `deploy/.env.example` | **M** | _(empty)_ | Cryptographically random ≥48 bytes | **Yes — API refuses boot** | **Yes** |
| `JWT_ACCESS_EXPIRES_IN_SECONDS` | configuration.ts, compose | O | `900` | Usually keep `900` | No | No |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | configuration.ts, compose | O | `30` | Usually keep `30` | No | No |
| `APP_PUBLIC_URL` | configuration.ts, compose, production env | **M** (prod) | `http://localhost:3000` / `:8080` | Real frontend origin (Vercel or VPS), no trailing slash issues | **Yes in `NODE_ENV=production`** | No |
| `APP_SECRET` | billing + email provider registries, compose | **C** | _(empty)_ | Random ≥32 chars; backup off-box | No boot; **decrypt fails** when providers used | **Yes** |
| `INVITATION_EXPIRES_IN_DAYS` | configuration.ts, compose | O | `7` | Positive integer | Empty OK; invalid integer **boots fail** | No |

### 1.2 Database & Redis

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Prisma `schema.prisma`, configuration.ts, CI, compose (built) | **M** | Local: `postgresql://erp:erp@localhost:5433/erp_dev?schema=public` | Hosted URL + `connection_limit`, `pool_timeout`, `connect_timeout`, `statement_timeout` | **Yes — migrate/query** | **Yes** |
| `POSTGRES_USER` | compose, backup/restore scripts, monitoring | **M** (compose) | `erp` | Strong unique user | Yes (scripts) | No |
| `POSTGRES_PASSWORD` | compose, monitoring | **M** | _(empty in example)_ | Strong random | **Yes compose** | **Yes** |
| `POSTGRES_DB` | compose, scripts | O | `erp_prod` / `erp_prod` | Match env | No if defaulted | No |
| `REDIS_URL` | `app.module.ts`, redis health, telematics SSE | **C** | _(empty)_ → in-memory | `redis://…` for multi-instance | No single-node; **rate limits wrong** multi-node | Maybe |

### 1.3 CORS / public origins / Caddy

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `CORS_ORIGIN` | API configuration, prod compose | **M** (browser→API) | `http://localhost:3000` | Comma-separated real frontend origins | Compose may require; API allows empty | No |
| `PUBLIC_ORIGIN` | `deploy/.env.example`, production compose → feeds `CORS_ORIGIN` | **M** (production compose) | `http://localhost:8080` | Browser-visible frontend origin | **Yes production compose** | No |
| `SITE_ADDRESS` | Caddyfile, production compose | **M** (real TLS) | `:8080` | `api.flowerp.uz` (or your host) | No for local HTTP; **TLS/ACME needs hostname** | No |
| `HTTP_PORT` | production compose | O | `8080` | `80` in prod | No | No |
| `HTTPS_PORT` | production compose | O | `8443` | `443` in prod | No | No |
| `CADDYFILE` | production compose | O | `./deploy/Caddyfile` | Valid path | Yes if path invalid | No |

### 1.4 Mail & leads

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `SMTP_URL` | configuration.ts → mail factory, compose | **C** (real mail) | _(empty)_ | Provider SMTP URL with credentials | No boot; **invites/leads email fail** (prod → UnavailableMail) | **Yes** |
| `MAIL_FROM` | configuration.ts, compose | **C** | _(empty)_ | `FlowERP <no-reply@yourdomain>` | No boot | No |
| `LEADS_NOTIFY_EMAIL` | configuration.ts, `.env.example` | **C** | falls back to `MAIL_FROM` | Sales inbox | No; lead still saved | No |

> Tenant email providers (Resend / SendGrid / SES) store **API keys in the database**, encrypted with `APP_SECRET` — not as `AWS_ACCESS_KEY_ID` / env. See §5.

### 1.5 AI Copilot

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `AI_PROVIDER` | configuration.ts, compose | **C** | Unset → `anthropic` | `anthropic` \| `openai` \| `gemini` \| `ollama` — **or leave UNSET to disable** | **Yes if set to empty string** (compose `${AI_PROVIDER:-}` trap) | No |
| `AI_MODEL` | configuration.ts | O | _(empty)_ → provider default | Explicit model id if needed | No | No |
| `ANTHROPIC_API_KEY` | AI Anthropic provider | **C** | _(empty)_ | Real key if provider=anthropic | No boot; Copilot fails | **Yes** |
| `OPENAI_API_KEY` | AI OpenAI provider | **C** | _(empty)_ | Real key if provider=openai | No boot; Copilot fails | **Yes** |
| `GEMINI_API_KEY` | AI Gemini provider | **C** | _(empty)_ | Real key if provider=gemini | No boot; Copilot fails | **Yes** |
| `AI_OPENAI_BASE_URL` | configuration.ts | O | `https://api.openai.com/v1` | Azure/gateway URL if used | No | No |
| `AI_OLLAMA_BASE_URL` | configuration.ts | O | `http://127.0.0.1:11434` | Reachable Ollama host | No | No |
| `AI_MAX_TOKENS` | configuration.ts | O | `4096` | Tune as needed | Invalid integer → **boot fail** | No |
| `AI_TEMPERATURE` | configuration.ts | O | `0.2` (code) | `0..2` | Invalid → **boot fail** | No |
| `AI_MAX_TOOL_ITERATIONS` | configuration.ts | O | `8` | Positive int | Invalid → **boot fail** | No |
| `AI_REQUEST_TIMEOUT_MS` | configuration.ts | O | `120000` (code) | Positive int | Invalid → **boot fail** | No |
| `AI_RATE_LIMIT_PER_HOUR` | configuration.ts | O | `120` (code) | Positive int | Invalid → **boot fail** | No |

### 1.6 Webhooks (developer portal)

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `WEBHOOK_TIMEOUT_MS` | configuration.ts, compose | O | `10000` | Keep or raise | Invalid → boot fail | No |
| `WEBHOOK_MAX_ATTEMPTS` | configuration.ts, compose | O | `5` | Keep | Invalid → boot fail | No |
| `WEBHOOK_CIRCUIT_FAILURE_THRESHOLD` | configuration.ts | O | `5` | Keep | Invalid → boot fail | No |
| `WEBHOOK_CIRCUIT_RESET_TIMEOUT_MS` | configuration.ts | O | `60000` | Keep | Invalid → boot fail | No |
| `WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS` | configuration.ts | O | `3` | Keep | Invalid → boot fail | No |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS` | configuration.ts | O | unset/false | **Never enable in prod** (forced off) | No | No |

### 1.7 Billing (webhook verification — env)

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | `billing/webhooks/stripe-webhook.controller.ts` | **C** | _(none)_ | Live/test secret key | No boot; Stripe webhooks **reject** | **Yes** |
| `STRIPE_WEBHOOK_SECRET` | stripe webhook controller | **C** | _(none)_ | `whsec_…` | No boot; webhooks **reject** | **Yes** |
| `CLICK_SECRET_KEY` | click webhook controller | **C** | _(none)_ | Click secret | No boot; webhooks **reject** | **Yes** |
| `PAYME_MERCHANT_ID` | payme webhook controller | **C** | _(none)_ | Merchant id | No boot; webhooks **reject** | No |
| `PAYME_SECRET_KEY` | payme webhook controller | **C** | _(none)_ | Payme secret | No boot; webhooks **reject** | **Yes** |

> Provider credentials for initiating charges also live **encrypted in DB** (admin UI) via `APP_SECRET`.

### 1.8 Telematics & timeouts

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `TELEMATICS_SSE_MAX_CONNECTIONS_PER_ORG` | configuration.ts | O | `20` | Tune under load | Invalid → boot fail | No |
| `TELEMATICS_SSE_MAX_CONNECTIONS_GLOBAL` | configuration.ts | O | `500` | Tune under load | Invalid → boot fail | No |
| `REQUEST_TIMEOUT_MS` | configuration.ts | O | `30000` | Keep; excludes SSE | Invalid → boot fail | No |
| `SHUTDOWN_TIMEOUT_MS` | configuration.ts | O | `30000` | Prefer `< Docker stop` (e.g. `8000`) | Invalid → boot fail | No |
| `GIT_COMMIT_SHA` | `health.controller.ts` | O | `unknown` | Inject at image build | No | No |
| `NODE_ENV` | configuration, app.module, Dockerfiles | **M** | code `development` | `production` on VPS | Wrong value changes guards/mail/webhooks | No |
| `PORT` | configuration, Dockerfiles | O | API `4000`, web `3000` | Match compose | No | No |

### 1.9 Monitoring (scaffolded / opt-in)

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `SENTRY_DSN` | API `.env.example`, production compose **only** — **no SDK init** | O | _(empty)_ | Real DSN **after** wiring SDK | No (inert today) | Low sensitivity |
| `SENTRY_ENVIRONMENT` | example, compose | O | `production` | `production` | No | No |
| `SENTRY_TRACES_SAMPLE_RATE` | API `.env.example` | O | `0.1` | `0.0`–`1.0` | No | No |
| `GRAFANA_ADMIN_PASSWORD` | `deploy/monitoring/docker-compose.monitoring.yml` | **C** | _(none)_ | Strong password if stack on | **Yes for monitoring compose** | **Yes** |
| `GRAFANA_ROOT_URL` | monitoring compose | O | `http://localhost:3001` | Public Grafana URL | No | No |
| `SLACK_WEBHOOK_URL` | GitHub deploy/rollback workflows | O | _(secret)_ | Incoming webhook URL | No (notify skipped) | **Yes** |
| `PAGERDUTY_ROUTING_KEY` | alertmanager comment only | O | _(none)_ | Future | No | **Yes** |

### 1.10 Frontend build (`VITE_*` — baked at build time)

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_MARKETING_URL` | `site-config.ts`, `generate-sitemap.mjs` | O | `https://flowerp.uz` | Canonical marketing origin | No | No |
| `VITE_APP_URL` | `site-config.ts` | O | `https://app.flowerp.uz` | Authenticated app origin | No | No |
| `VITE_SITE_NAME` | site-config | O | `FlowERP` | Brand | No | No |
| `VITE_SITE_LEGAL_NAME` | site-config | O | `FlowERP AI` | Legal name | No | No |
| `VITE_CONTACT_EMAIL` | site-config | O | `hello@itechnology.uz` | Real support email | No | No |
| `VITE_CONTACT_PHONE` | site-config | O | `+998 50 108 18 24` | Real phone display | No | No |
| `VITE_CONTACT_PHONE_DIAL` | site-config | O | from phone | E.164 dialable | No | No |
| `VITE_CONTACT_WHATSAPP` | site-config | O | from phone | Digits for `wa.me` | No | No |
| `VITE_CONTACT_TELEGRAM` | site-config | O | _(empty)_ | Username without `@` | No | No |
| `VITE_CONTACT_WEBSITE` | site-config | O | `https://itechnology.uz/` | Company site | No | No |
| `VITE_SOCIAL_*` | site-config (linkedin/twitter/facebook/instagram) | O | _(empty)_ | Full profile URLs | No | No |
| `VITE_FEATURE_SIGNUP` | site-config | O | `false` | `true` when self-serve live | No | No |
| `VITE_FEATURE_PRICING_PAGE` | site-config | O | `false` | `true` when `/pricing` exists | No | No |
| `VITE_FEATURE_COOKIE_CONSENT` | site-config | O | `true` | Usually `true` | No | No |
| `VITE_GA4_MEASUREMENT_ID` | `analytics/config.ts` | O | example `G-7JJZ27NLS5` | Your GA4 ID | No (analytics off) | Public ID |
| `VITE_GTM_CONTAINER_ID` | analytics config | O | example `GTM-N3BSF3TL` | Your GTM ID | No | Public ID |
| `VITE_GOOGLE_ADS_ID` | analytics config | O | _(empty)_ | AW-… when Ads wired | No | Public ID |
| `VITE_META_PIXEL_ID` | analytics config | O | _(empty)_ | Pixel ID | No | Public ID |
| `VITE_LINKEDIN_PARTNER_ID` | analytics config | O | _(empty)_ | Partner ID | No | Public ID |
| `VITE_CLARITY_PROJECT_ID` | analytics config | O | _(empty)_ | Clarity project | No | Public ID |
| `VITE_HOTJAR_ID` | analytics config | O | _(empty)_ | **Scaffold — no provider** | No | Public ID |
| `VITE_TIKTOK_PIXEL_ID` | analytics config | O | _(empty)_ | **Scaffold** | No | Public ID |
| `VITE_YANDEX_METRICA_ID` | analytics config | O | _(empty)_ | **Scaffold** | No | Public ID |
| `VITE_SENTRY_DSN` | `lib/monitoring/index.ts` | O | _(empty)_ | DSN after SDK init | No (forward-only today) | DSN |

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `NITRO_PRESET` | `apps/web/vite.config.ts` | O | `vercel` if `VERCEL` else `node-server` | Match host | No | No |
| `VERCEL` | vite.config (platform) | O | unset | Set by Vercel | No | No |

### 1.11 GitHub Actions / deploy scripts

| Name | Used in | Req | Default | Production value needed | Fail without it? | Secret? |
| --- | --- | --- | --- | --- | --- | --- |
| `VPS_HOST` | deploy.yml, rollback.yml | **M** | _(none)_ | VPS IP/hostname | **Yes preflight** | Treat as secret |
| `VPS_USER` | deploy/rollback | **M** | _(none)_ | SSH user | **Yes** | Soft |
| `VPS_SSH_KEY` | deploy/rollback | **M** | _(none)_ | Private key | **Yes** | **Yes** |
| `VPS_SSH_PASSPHRASE` | deploy/rollback | **C** | _(none)_ | If key encrypted | Yes if needed | **Yes** |
| `VPS_SSH_PORT` | deploy/rollback | O | `22` | Custom port | No | No |
| `GITHUB_TOKEN` | release.yml | **M** | GitHub-provided | Auto | Release push fails | Ephemeral |
| `API_IMAGE` | deploy.sh, compose | O | local build tag | `ghcr.io/…/erp-api:tag` | Missing → local build | No |
| `ENV_FILE` | scripts | O | `.env.production` | Path to real env file | **Yes if missing** | Path |
| `COMPOSE_FILE` | scripts | O | `docker-compose.yml` | Correct compose | Yes if missing | No |
| `HEALTH_RETRIES` | lib.sh | O | `30` | Keep | No | No |
| `HEALTH_INTERVAL` | lib.sh | O | `2` | Keep | No | No |
| `BACKUP_DIR` | backup-postgres.sh | O | `./backups` | Writable path | No | No |
| `RETENTION_DAYS` | backup-postgres.sh | O | `14` | Policy | No | No |
| `OFFSITE_COMMAND` | backup-postgres.sh | O | unset | e.g. `aws s3 cp` / rclone | No (warn only) | May embed secrets |
| `CONFIRM` | rollback.sh, restore-postgres.sh | **M** (destructive) | _(none)_ | Must be set for manual ops | **Yes for those scripts** | No |

### 1.12 Test-only (not production runtime)

| Name | Used in | Notes |
| --- | --- | --- |
| `API_URL`, `FRONTEND_URL` | Playwright e2e | Defaults localhost; set for remote runs |
| `CI` | playwright.config | GitHub sets automatically |
| `SHOT_ROUTES`, `SHOT_WIDTH`, `SHOT_HEIGHT`, `SHOT_NO_AUTH`, `SHOT_FULL` | shots.spec.ts | Screenshot harness only |

---

## 2. Unused environment variables

| Variable | Where declared | Verdict |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | `apps/web/.env.example` | **Obsolete** — Vite app; no `apps/web/src` consumer |
| `NEXT_PUBLIC_API_URL` | web `.env.example` | **Obsolete** — API via same-origin `/api` |
| `NEXT_PUBLIC_ENABLE_API` | web `.env.example` | **Obsolete** |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | API example + compose | **Reserved / unused** until SDK wired |
| `VITE_GOOGLE_ADS_ID` | analytics config | **Inert scaffold** — no provider |
| `VITE_HOTJAR_ID` | analytics config | **Inert scaffold** |
| `VITE_TIKTOK_PIXEL_ID` | analytics config | **Inert scaffold** |
| `VITE_YANDEX_METRICA_ID` | analytics config | **Inert scaffold** |
| `VITE_SENTRY_DSN` | monitoring flag only | **Partial** — no `@sentry` init |
| `PAGERDUTY_ROUTING_KEY` | alertmanager comment | **Unused** |
| Workflow `ENV_NAME` | deploy.yml | **Bug** — referenced but never set (see §4) |

---

## 3. Duplicate / overlapping variables

| Concept | Variables | Guidance |
| --- | --- | --- |
| Frontend origin (browser) | `PUBLIC_ORIGIN`, `CORS_ORIGIN`, `APP_PUBLIC_URL`, `VITE_APP_URL`, `VITE_MARKETING_URL` | Same domain family, **different jobs**: CORS allowlist vs invite links vs SEO/canonical vs Caddy host (`SITE_ADDRESS`). Align values carefully; do not collapse into one blindly. |
| Postgres connection | `DATABASE_URL` ↔ `POSTGRES_USER` / `PASSWORD` / `DB` | Prefer compose-built `DATABASE_URL`; avoid dual sources drifting. |
| AI base URLs | `AI_OPENAI_BASE_URL` / `AI_OLLAMA_BASE_URL` vs commented `OPENAI_BASE_URL` / `OLLAMA_BASE_URL` | Code only reads `AI_*`. |
| Deploy env selection | `ENV_FILE`, `COMPOSE_FILE` | Defaults to `.env.production` + `docker-compose.yml`. |
| Sentry | `SENTRY_DSN` (API) vs `VITE_SENTRY_DSN` (web) | Separate client/server DSNs; both unwired/partial. |

---

## 4. Wrong naming / should rename / documentation bugs

| Issue | Severity | Fix (ops or later code) |
| --- | --- | --- |
| `.env.example` comments `OPENAI_BASE_URL` / `OLLAMA_BASE_URL` | High (ops trap) | Use **`AI_OPENAI_BASE_URL`** / **`AI_OLLAMA_BASE_URL`** |
| User-facing name `VITE_GA_MEASUREMENT_ID` / `VITE_GTM_ID` | Medium | Code uses **`VITE_GA4_MEASUREMENT_ID`** / **`VITE_GTM_CONTAINER_ID`** — configure those exact names |
| `NEXT_PUBLIC_*` in Vite project | Medium | Remove from examples or migrate to `VITE_*` if feature returns |
| `AI_PROVIDER=` empty in compose (`${AI_PROVIDER:-}`) | **Critical** | Empty string ≠ unset → **API boot throws**. Leave variable **absent**, or set a real provider, or fix compose later |
| Example default mismatches | Low | `AI_TEMPERATURE` comment `0.3` vs code `0.2`; `AI_REQUEST_TIMEOUT_MS` comment `60000` vs code `120000`; `AI_RATE_LIMIT_PER_HOUR` comment `30` vs code `120` |
| ~~deploy env selection bug~~ | Fixed | Production-only deploy workflow |
| Billing webhook secrets missing from `.env.example` | High | Document `STRIPE_*`, `CLICK_SECRET_KEY`, `PAYME_*` |
| `vercel.json` hardcodes `api.flowerp.uz` | **Critical for Vercel** | Not an env var — must be environment-specific rewrite |

---

## 5. Missing variables (expected by ops / common SaaS, not in repo)

| Expected name | Status in FlowERP |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` | **Not used as env.** SES credentials are DB-encrypted; S3 only via optional `OFFSITE_COMMAND` shell. |
| `PAYME_KEY` | Use **`PAYME_SECRET_KEY`** (+ `PAYME_MERCHANT_ID`) |
| `VITE_GA_MEASUREMENT_ID` / `VITE_GTM_ID` | Wrong names — use GA4/GTM names in §1.10 |
| Twilio / WhatsApp / Telegram API tokens | **No env** — features not implemented |
| Google Maps API key | **No env** — MapLibre + OSM tiles |
| Cloudflare / CDN tokens | **No env** — not integrated |
| Uptime monitor tokens | **No env** — not integrated |

**Missing from `.env.example` but consumed in code (must add to ops sheet):**

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLICK_SECRET_KEY`, `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY`, `AI_OPENAI_BASE_URL`, `AI_OLLAMA_BASE_URL`, `GIT_COMMIT_SHA`, webhook circuit vars (commented only), telematics SSE vars (commented only).

---

## 6. Day-of deployment checklist

Copy into the release ticket. Check only when verified in the **target** environment.

### 6.1 Secrets store (GitHub `production` env)

- [ ] `VPS_HOST` set  
- [ ] `VPS_USER` set  
- [ ] `VPS_SSH_KEY` set (and passphrase if needed)  
- [ ] `VPS_SSH_PORT` correct  
- [ ] `SLACK_WEBHOOK_URL` optional but tested  

### 6.2 VPS env file (`.env.production` / `.env.production`)

- [ ] `JWT_ACCESS_SECRET` generated & set  
- [ ] `POSTGRES_PASSWORD` / `DATABASE_URL` set with pool + `statement_timeout`  
- [ ] `APP_PUBLIC_URL` = real frontend URL  
- [ ] `PUBLIC_ORIGIN` / `CORS_ORIGIN` match frontend  
- [ ] `SITE_ADDRESS` = real hostname for Caddy TLS  
- [ ] `APP_SECRET` set & backed up off-box  
- [ ] `NODE_ENV=production`  
- [ ] `SMTP_URL` + `MAIL_FROM` set (if sending mail)  
- [ ] `LEADS_NOTIFY_EMAIL` set  
- [ ] `REDIS_URL` set if ≥2 API replicas  
- [ ] `AI_PROVIDER` **unset or valid** — never empty string  
- [ ] Matching AI API key if Copilot shipped  
- [ ] Billing webhook secrets if payments shipped  
- [ ] Migrations applied after env ready  

### 6.3 Frontend build (Vercel / web image)

- [ ] All production `VITE_*` set **before** build  
- [ ] Especially `VITE_MARKETING_URL`, `VITE_APP_URL`, analytics IDs you own  
- [ ] `vercel.json` rewrite points at **this** environment’s API (correct API host)  
- [ ] Rebuild/redeploy after any `VITE_*` change  

### 6.4 Post-deploy smoke

- [ ] API health green (`GIT_COMMIT_SHA` if injected)  
- [ ] Login works  
- [ ] Invite email delivers (or known UnavailableMail)  
- [ ] Demo lead → DB (+ notify email)  
- [ ] Analytics events in GTM Preview / GA4 DebugView after consent  
- [ ] Backup script + offsite command once  

---

## 7. Deployment readiness score

Scored against **environment configuration readiness** (docs + known traps), not feature completeness.

| Criterion | Weight | Score | Notes |
| --- | --- | --- | --- |
| Mandatory boot secrets documented (`JWT`, DB, `APP_PUBLIC_URL`) | 20 | **18** | Documented; still blank in examples (expected) |
| Mail / leads env documented | 10 | **9** | Present; `LEADS_NOTIFY_EMAIL` added |
| Frontend `VITE_*` inventory complete | 10 | **9** | Complete; examples include real-looking GA/GTM IDs |
| Billing webhook env documented in examples | 10 | **3** | **Code uses vars; `.env.example` omits them** |
| AI env naming consistency | 10 | **4** | Wrong comment names; **empty `AI_PROVIDER` boot trap** |
| Deploy workflow env propagation | 15 | **5** | Production-only workflow |
| Unused / obsolete vars cleaned | 5 | **2** | `NEXT_PUBLIC_*` + inert scaffolds remain |
| Monitoring env actionable | 5 | **2** | Sentry reserved but unwired |
| Storage (S3/AWS) clarity | 5 | **5** | Correctly absent as env (DB / `OFFSITE_COMMAND`) |
| Vercel / API host configuration | 10 | **4** | API host in vercel.json must match production |

### **Overall: 61 / 100**

**Interpretation:** Configuration is **inventoried and mostly usable**, but production deploy is **not fully safe** until:

1. Confirm deploy uses `.env.production` only.  
2. Never pass empty `AI_PROVIDER` from compose.  
3. Document + set billing webhook secrets if enabling payments.  
4. Point Vercel API rewrite at the correct API host.  
5. Remove or clearly mark obsolete `NEXT_PUBLIC_*` and scaffold analytics IDs.

Until those are closed, treat readiness as **conditional go** — core API can ship with careful manual env files; automated multi-env deploy and AI/billing edges need ops caution.

---

## 8. Quick reference — secrets that kill the deploy

```
# API will not boot
JWT_ACCESS_SECRET=
APP_PUBLIC_URL=          # when NODE_ENV=production
AI_PROVIDER=             # empty string — crash (leave unset instead)

# Compose / deploy will not succeed
POSTGRES_PASSWORD=
PUBLIC_ORIGIN=           # production compose
VPS_HOST / VPS_USER / VPS_SSH_KEY

# Feature hard-fails (boot OK)
SMTP_URL=                # no invite/lead email in prod
STRIPE_WEBHOOK_SECRET=   # Stripe webhook 400
CLICK_SECRET_KEY=
PAYME_SECRET_KEY=
ANTHROPIC_API_KEY=       # if AI_PROVIDER=anthropic
```

---

## 9. Private ops sheet template

Do **not** commit filled values. Copy columns:

| Name | Store (GitHub / VPS / Vercel / DB) | Staging value set? | Production value set? | Last rotated | Owner |
| --- | --- | --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | VPS | ☐ | ☐ | | |
| `DATABASE_URL` | VPS | ☐ | ☐ | | |
| … | | | | | |

Use §1 as the row source. After first production deploy, bump the readiness score when §4 critical items are fixed.
