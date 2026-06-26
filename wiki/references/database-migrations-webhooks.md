---
title: Database Migrations & Webhooks Guide
category: references
tags: [data/migrations, data/supabase, data/edge-functions, status/current]
sources:
  - backlog/docs/doc-010 - Database-Migration-and-Webhook-Management-Guide.md
relationships:
  - target: "[[concepts/provisioning-call-chain]]"
    type: related_to
summary: How schema AND provisioning webhooks are both managed as forward-only SQL migrations in iotgw-ui/supabase/migrations — the pnpm db commands and how to verify the triggers fired.
provenance:
  extracted: 0.9
  inferred: 0.03
  ambiguous: 0.07
base_confidence: 0.55
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Database Migrations & Webhooks Guide

In this **self-hosted** Supabase stack, schema **and** the provisioning webhooks
are both managed as **SQL migrations** — there is no separate webhook-config step
and no control-plane API. Applying the migrations creates the tables, RPCs, and
the row triggers that POST to the `netmaker-call` edge function.

## Migrations

- **Location:** `iotgw-ui/supabase/migrations/`, named `YYYYMMDDHHMMSS_*.sql`,
  applied in order.
- **Append-only ledger:** never edit/delete an applied migration; add a new one
  that supersedes it (e.g. the original `kestra-call` webhook migrations are kept;
  later `…_repoint_…` migrations move the triggers to `netmaker-call`).

## Webhooks = Postgres triggers (not Dashboard webhooks)

`AFTER` row triggers calling `supabase_functions.http_request(url, method,
headers, body, timeout_ms)` (backed by `pg_net`).

| Table | Events | Defined in |
|---|---|---|
| `devices` | INSERT, DELETE | `20260610000000_repoint_devices_webhook_to_netmaker.sql` |
| `networks` | INSERT, UPDATE, DELETE | `20260610000001_repoint_networks_webhook_to_netmaker.sql` |

## Commands (from `iotgw-ui/`)

```bash
pnpm db:reset            # drop all + reapply every migration (recreates tables, RPCs, triggers) + seed
pnpm db:reset:full       # same, via scripts/reset-database-and-webhooks.sh
pnpm db:migrate          # forward-only push (no rollback)
pnpm generate:contract   # regenerate packages/supabase-contract/src/database.types.ts
pnpm typecheck
```

To change webhook wiring, write a **new** migration that `drop trigger if
exists … + create trigger …` — never edit an existing one.

## Verifying the webhooks (don't trust the 202)

```sql
-- did the trigger POST fire?
select id, status_code, content, created from net._http_response order by created desc limit 10;
-- did the job run?
select * from device_jobs order by started_at desc limit 5;   -- and network_jobs
```

> [!note] Runtime forward-note
> docker-compose was decommissioned ([[synthesis/docker-compose-decommission]]).
> `docker exec supabase-db …` maps to `kubectl -n supabase-db exec
> <stackgres-primary-pod> -c patroni -- psql …`, and pg_net webhook URLs point at
> `http://kong.supabase-app.svc.cluster.local:8000`. The migration/webhook
> *concepts* are unchanged.

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/docs/doc-010 - Database-Migration-and-Webhook-Management-Guide|doc-010 - Database-Migration-and-Webhook-Management-Guide]]
