# Monitoring (prepared, opt-in)

This directory is **production-ready configuration, not a running dependency**.
The application stack (`docker-compose.yml`) does not need it and does not
reference it. Bring it up when you want observability; it attaches to the app
stack's network and reads the same `.env.production`.

```bash
# app stack must be up first (it owns the network the exporters attach to)
docker compose --env-file .env.production up -d

# then the monitoring stack
docker compose -f deploy/monitoring/docker-compose.monitoring.yml \
  --env-file .env.production up -d
```

Add `GRAFANA_ADMIN_PASSWORD=<something-strong>` to `.env.production` first — Grafana
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

**Deliberately deferred:**

- **Application metrics** — needs a `/metrics` endpoint (scrape job commented in `prometheus/prometheus.yml`).
- **Grafana dashboards** — datasources provisioned; curated dashboards later.
- **Sentry** — wired by `SENTRY_DSN` env, not this compose.

## Before exposing anything

- Grafana is bound to `127.0.0.1:3001` — SSH tunnel only.
- Prometheus, Alertmanager, Loki and exporters publish **no** host ports.
- Fill in a real Alertmanager receiver or alerts fire into the void.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.monitoring.yml` | the opt-in stack |
| `prometheus/prometheus.yml` | scrape targets (+ deferred app job) |
| `prometheus/alerts.yml` | alert rules |
| `alertmanager/alertmanager.yml` | routing template |
| `loki/loki-config.yml` | single-binary Loki |
| `promtail/promtail-config.yml` | Docker log discovery → Loki |
| `grafana/provisioning/datasources/datasources.yml` | Prometheus + Loki |
