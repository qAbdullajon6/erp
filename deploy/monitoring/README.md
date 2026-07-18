# Monitoring (prepared, opt-in)

This directory is **production-ready configuration, not a running dependency**.
The application stack (`docker-compose.staging.yml`) does not need it and does not
reference it. Bring it up when you want observability; it attaches to the app
stack's network and reads the same `.env`.

```bash
# app stack must be up first (it owns the network the exporters attach to)
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# then the monitoring stack
docker compose -f deploy/monitoring/docker-compose.monitoring.yml \
  --env-file .env.staging up -d
```

Add `GRAFANA_ADMIN_PASSWORD=<something-strong>` to `.env.staging` first — Grafana
refuses to start without it.

## What is real today vs. deferred

**Works immediately, with zero application changes:**

| Signal | Source |
| --- | --- |
| Host CPU / memory / disk / filesystem | node-exporter |
| Per-container resource usage | cAdvisor |
| PostgreSQL connections, transactions, locks, db size | postgres-exporter |
| Redis memory, keyspace, clients, evictions | redis-exporter |
| Every container's logs, searchable & labelled | Promtail → Loki |
| Alerting on all of the above | Prometheus rules → Alertmanager |

**Deliberately deferred to the monitoring milestone (documented, not stubbed):**

- **Application metrics** (request rate/latency, notification queue depth, cron
  outcomes). Needs a `/metrics` endpoint on the API — the scrape job is written
  and commented in `prometheus/prometheus.yml`, with the exact integration shape.
- **Grafana dashboards.** Datasources are provisioned so Explore works now;
  curated dashboards are out of scope for this milestone by design.
- **Sentry.** It is SaaS/self-hosted separately and wired by env var, not by this
  compose — see `SENTRY_DSN` in `apps/api/.env.example`. The SDK call is the
  integration step, deferred with the app metrics.

## Before exposing anything

- Grafana is bound to `127.0.0.1:3001` — reach it over an SSH tunnel
  (`ssh -L 3001:localhost:3001 vps`), not the public internet.
- Prometheus, Alertmanager, Loki and the exporters publish **no** host ports;
  they are reachable only on the monitoring network. Keep it that way.
- Fill in a real Alertmanager receiver (`alertmanager/alertmanager.yml`) or
  alerts fire into the void.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.monitoring.yml` | the opt-in stack |
| `prometheus/prometheus.yml` | scrape targets (+ deferred app job) |
| `prometheus/alerts.yml` | alert rules over today's signals |
| `alertmanager/alertmanager.yml` | routing template — add your receiver |
| `loki/loki-config.yml` | single-binary Loki, 14-day retention |
| `promtail/promtail-config.yml` | Docker log discovery → Loki |
| `grafana/provisioning/datasources/datasources.yml` | Prometheus + Loki wired |
