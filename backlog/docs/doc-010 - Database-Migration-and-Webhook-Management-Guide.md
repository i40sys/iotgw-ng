---
id: doc-010
title: Database Migration and Webhook Management Guide
type: other
created_date: '2025-11-17 11:14'
updated_date: '2026-06-17'
---

# Database Migration and Webhook Management Guide

> **Runtime forward-note (2026-06-18):** docker-compose was decommissioned in the
> `TASK-062` milestone — the platform runs on **k8s/kind** (`decision-017`). The
> Postgres tier is now a StackGres SGCluster (`decision-018`), so any
> `docker exec supabase-db …` shown below maps to
> `kubectl -n iotgw exec <stackgres-primary-pod> -c patroni -- psql …`, and pg_net
> webhook URLs point at the in-cluster Kong Service (`TASK-055`). The migration
> and webhook *concepts* are unchanged; only the runtime moved. See
> [deploy/README.md](../../deploy/README.md).

> **Rewritten 2026-06-17.** This guide previously described configuring
> **Supabase Dashboard / Management-API webhooks** (cloud `*.supabase.co`,
> `SUPABASE_ACCESS_TOKEN`, a `setup-webhooks.ts` script) that called the
> `kestra-call` edge function. None of that applies to this **self-hosted**
> stack anymore: webhooks are **Postgres triggers defined in migrations**, and
> the target is the `netmaker-call` edge function. The old setup script and
> `pnpm setup:webhooks` were removed.

## Overview

The iotgw-ui database lives in the **self-hosted** Supabase stack (`supabase/`,
host `wsl.ymbihq.local`). Schema **and** the provisioning webhooks are both
managed as **SQL migrations** — there is no separate webhook-configuration step
and no control-plane API. Applying the migrations creates the tables, the RPCs,
and the row triggers that POST to the `netmaker-call` edge function.

## Key concepts

### Migrations

- **Location**: `iotgw-ui/supabase/migrations/`
- **Naming**: `YYYYMMDDHHMMSS_description.sql`, applied in chronological order
- **Tool**: the Supabase CLI, invoked through pnpm scripts (below)
- **Append-only**: migrations are an immutable ledger — never edit or delete an
  applied migration; add a new one that supersedes it. (E.g. the original
  `kestra-call` webhook migrations are kept; later `…_repoint_…` migrations
  move the triggers to `netmaker-call`.)

### Webhooks (Postgres triggers, not Dashboard webhooks)

- **Storage**: in the database, as `AFTER` row triggers — created by migrations.
- **Mechanism**: `supabase_functions.http_request(url, method, headers, body,
  timeout_ms)` (backed by `pg_net`), which fires a non-blocking HTTP POST.
- **Purpose**: provision Netmaker resources when `devices` / `networks` change.
- **Current target**: `…/functions/v1/netmaker-call` (direct Netmaker REST).

| Table | Events | Defined in |
|---|---|---|
| `devices` | INSERT, DELETE | `20260610000000_repoint_devices_webhook_to_netmaker.sql` |
| `networks` | INSERT, UPDATE, DELETE | `20260610000001_repoint_networks_webhook_to_netmaker.sql` |

The mechanics of the trigger → edge-function → Netmaker flow are documented in
[doc-016](doc-016%20-%20Kestra-Notification-Automation-Pattern.md).

## Common operations

All commands run from `iotgw-ui/`. `DATABASE_URL` (in `iotgw-ui/.env`, rendered
from `secrets/`) points at the self-hosted Postgres.

### 1. Reset the database (schema + triggers)

```bash
pnpm db:reset
```

Drops all objects, reapplies every migration in order (which recreates the
tables, RPCs **and** the trigger "webhooks"), and runs seed data if present.
Because the triggers come from migrations, this is all that's needed — there is
no separate webhook step.

> ⚠️ Destructive — wipes all data. Confirm before running against anything you
> care about.

### 2. Full reset helper

```bash
pnpm db:reset:full        # → scripts/reset-database-and-webhooks.sh
```

A thin wrapper around `supabase db reset` (kept for the historical name). The
"+ webhooks" part is now automatic via the migrations — there is nothing extra
to provision.

### 3. Apply new migrations (forward-only)

```bash
pnpm db:migrate           # supabase db push
```

Pushes pending migrations without a full reset. Forward-only (no rollback).

### 4. Regenerate TypeScript contract types

```bash
pnpm generate:contract
```

Updates `packages/supabase-contract/src/database.types.ts` from the live schema.
Run after any schema change, then `pnpm typecheck`.

## Adding a migration

```bash
# from iotgw-ui/
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_your_change.sql
# write SQL …
pnpm db:reset            # test a from-scratch replay locally
pnpm generate:contract   # refresh types
pnpm typecheck           # verify
git add supabase/migrations/<file> && git commit
```

To change webhook wiring, write a **new** migration that
`drop trigger if exists …` + `create trigger …` (see the `…_repoint_…`
migrations as the template) — don't edit an existing one.

## Verifying the webhooks (self-hosted)

There is no Dashboard "Webhooks → Logs" tab here. Verify through the database
and the edge-function container instead:

1. **Trigger POSTs (pg_net response log):**
   ```sql
   select id, status_code, content, created
   from net._http_response order by created desc limit 10;
   ```
2. **Job records:**
   ```sql
   select * from device_jobs  order by started_at desc limit 5;
   select * from network_jobs order by started_at desc limit 5;
   ```
3. **Edge-function logs:**
   ```bash
   cd ../supabase && docker compose logs -f supabase-edge-functions
   ```
4. **Manual trigger:**
   ```sql
   insert into devices (network_id, name)
   values ('<network-uuid>', 'test-device');
   ```

## Troubleshooting

### `db:reset` fails to connect
- Check `DATABASE_URL` in `iotgw-ui/.env` (render with `just secrets-render`).
- Ensure the supabase stack is up (`cd supabase && docker compose ps`).
- `PGSSLMODE=disable` for the local pooler if SSL negotiation fails.

### Inserts don't create job records / nothing provisions
- Confirm the triggers exist:
  ```sql
  select tgname, tgrelid::regclass from pg_trigger
  where tgname like '%webhook%';
  ```
- Check `net._http_response` for a non-2xx `status_code` (the edge function
  errored) or no row at all (the trigger didn't fire / `pg_net` not enabled).
- Confirm the `functions` container is running and reachable at
  `http://wsl.ymbihq.local:8000/functions/v1/netmaker-call`.
- Read the edge-function logs for the failing transaction id.

### Type errors after a migration
```bash
pnpm generate:contract && pnpm typecheck
```

## File locations

- **Migrations**: `iotgw-ui/supabase/migrations/*.sql`
- **Full-reset helper**: `iotgw-ui/scripts/reset-database-and-webhooks.sh`
- **Edge function**: `supabase/volumes/functions/netmaker-call/`
- **DB config**: `iotgw-ui/.env` (`DATABASE_URL`, rendered from `secrets/`)
- **Generated types**: `packages/supabase-contract/src/database.types.ts`

## Quick reference

```bash
pnpm db:reset            # reset DB + reapply migrations (incl. triggers)
pnpm db:reset:full       # same, via the reset helper script
pnpm db:migrate          # forward-only migration push
pnpm generate:contract   # regenerate TS types
pnpm typecheck           # verify types
```

## Related documentation

- [doc-016 — Database-Change Provisioning Automation Pattern](doc-016%20-%20Kestra-Notification-Automation-Pattern.md)
- [doc-008 — Domains/Networks/Devices architecture](doc-008%20-%20Domains-Networks-and-Devices-Architecture.md)
- [netmaker-call edge function CLAUDE.md](../../supabase/volumes/functions/netmaker-call/CLAUDE.md)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
