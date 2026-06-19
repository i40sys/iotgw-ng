---
id: doc-016
title: Database-Change Provisioning Automation Pattern
type: documentation
created_date: "2025-10-22"
updated_date: "2026-06-17"
---

> **Rewritten 2026-06-17.** This document previously described triggering
> **Kestra** workflows for device/network changes via the `kestra-call` edge
> function. That path was removed: device and network provisioning now run
> **directly** through the `netmaker-call` edge function (which calls the
> Netmaker REST API), and the webhook mechanism is a **Postgres trigger defined
> in a migration**, not a Supabase Dashboard webhook. This doc describes the
> current pattern. Kestra is still used for the OpenWRT flows — see
> [kestra/CLAUDE.md](../../kestra/CLAUDE.md) and the note at the end.

> **Runtime forward-note (2026-06-18):** docker-compose was decommissioned in the
> `TASK-062` milestone — the platform runs on **k8s/kind** (`decision-017`). The
> trigger→edge-function→Netmaker pattern is unchanged; only the runtime moved.
> Any `docker exec supabase-db …` below maps to a `kubectl exec` into the
> StackGres primary (`decision-018`), and the webhook posts to the in-cluster Kong
> Service (`TASK-055`). See [deploy/README.md](../../deploy/README.md).

## Context

This is a **self-hosted** Supabase stack (`supabase/`, host `wsl.ymbihq.local`).
When a row in `devices` or `networks` changes, we provision the matching
Netmaker resource (extclient / network) without any external listener process
and without an orchestration hop. The pattern is:

```
UI (React) → tRPC backend → supabase.from('devices'|'networks').insert/update/delete
   ↓  (AFTER INSERT/UPDATE/DELETE row trigger)
Postgres trigger  →  supabase_functions.http_request(...)   (pg_net under the hood)
   ↓  POST /functions/v1/netmaker-call
netmaker-call edge function (Deno)
   • inserts a {device|network}_jobs row (status PENDING)
   • returns 202 Accepted immediately
   • finishes the work in EdgeRuntime.waitUntil():
       → calls the Netmaker REST API (api.netmaker.i40sys.com)
       → (devices, INSERT only) UPDATE devices SET private_key, public_key, ip_address
       → UPDATE {device|network}_jobs SET status = SUCCESS|FAILED
   ↓
UI polls the jobs table via tRPC → reflects status
```

There is **no polling of Kestra, no Ansible, no 2-minute blocking call**. The
HTTP trigger returns fast; the edge function does the slow work in the
background.

## Components

### 1. The Postgres trigger (the "webhook")

The webhook is a row trigger created **in a migration**, using the self-hosted
Supabase helper `supabase_functions.http_request(...)` (backed by `pg_net`). It
is part of the schema — there is nothing to configure in a dashboard.

Current triggers (see the migrations under
`iotgw-ui/supabase/migrations/`):

| Table | Events | Target | Defined in |
|---|---|---|---|
| `devices` | INSERT, DELETE | `…/functions/v1/netmaker-call` | `20260610000000_repoint_devices_webhook_to_netmaker.sql` |
| `networks` | INSERT, UPDATE, DELETE | `…/functions/v1/netmaker-call` | `20260610000001_repoint_networks_webhook_to_netmaker.sql` |

> Devices are provisioned on INSERT (keys + IP are immutable for an extclient)
> and deprovisioned on DELETE; there is intentionally **no** device UPDATE
> trigger. Networks react to INSERT/UPDATE/DELETE.

Example (devices, INSERT):

```sql
drop trigger if exists devices_webhook on public.devices;
create trigger devices_webhook
  after insert on public.devices
  for each row
  execute function supabase_functions.http_request(
    'http://wsl.ymbihq.local:8000/functions/v1/netmaker-call',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'   -- timeout (ms) for the fire-and-forget POST
  );
```

The trigger sends the standard Supabase webhook payload
(`{ type, table, record, old_record, schema }`); `netmaker-call` reads `type`
(INSERT/UPDATE/DELETE) and `record`/`old_record` to decide what to do.

### 2. The `netmaker-call` edge function

`supabase/volumes/functions/netmaker-call/` — see its own
[CLAUDE.md](../../supabase/volumes/functions/netmaker-call/CLAUDE.md). Behaviour:

- **Responds 202 immediately**, then runs the Netmaker work in
  `EdgeRuntime.waitUntil()` so the trigger's HTTP call never blocks the DB.
- **Devices** — derives the Netmaker `network` from `record.network_id`
  (dashes stripped), creates/deletes the extclient, and on INSERT writes the
  WireGuard `private_key` / `public_key` and `ip_address` back to the `devices`
  row.
- **Networks** — derives `netid` from `record.id` (dashes stripped) and
  creates/updates/deletes the Netmaker network (no write-back).
- **Job tracking** — writes a `device_jobs` / `network_jobs` row (PENDING →
  SUCCESS/FAILED) in the same lifecycle shape the UI already consumes via the
  `get_device_jobs` / `get_network_jobs` RPCs, so the Deployments UI needed no
  change.

### 3. The jobs tables

`device_jobs` and `network_jobs` are the audit/observability trail. The UI
polls them through tRPC to show provisioning status. `network_name` on
`device_jobs` is left `null` on insert and backfilled from `network_id` by a DB
trigger.

## Operating the pattern

### Where the wiring lives

Everything is in the schema + the edge function — both versioned in git:

- Trigger definitions → `iotgw-ui/supabase/migrations/*.sql`
- Edge function → `supabase/volumes/functions/netmaker-call/`

Applying migrations (`pnpm db:reset` / `pnpm db:migrate`) (re)creates the
triggers. Restarting the `functions` container deploys edge-function code
changes. See [doc-010](doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md).

### Verifying end-to-end (don't trust the 202)

1. **Did the trigger POST fire?** Inspect pg_net's response log:
   ```sql
   select id, status_code, content, created
   from net._http_response
   order by created desc limit 10;
   ```
2. **Did the job run?**
   ```sql
   select id, status, error_message, started_at, completed_at
   from device_jobs order by started_at desc limit 5;
   -- and network_jobs likewise
   ```
3. **Edge function logs** (transaction-id prefixed):
   ```bash
   cd supabase && docker compose logs -f supabase-edge-functions
   ```
4. **Device write-back** (INSERT): the `devices` row should gain
   `private_key`, `public_key`, `ip_address`.

### Test inserts

```sql
-- triggers device provisioning
insert into devices (network_id, name) values ('<network-uuid>', 'test-device');

-- triggers network provisioning
insert into networks (domain_id, name, ipv4_cidr)
values ((select id from domains limit 1), 'test-network', '10.0.0.0/24');
```

## Why this shape

| Concern | How it's handled |
|---|---|
| No external listener | Postgres trigger + `pg_net` (in-DB), self-hosted |
| Don't block the DB transaction | `http_request` is fire-and-forget; edge fn returns 202 |
| Don't block the edge worker | Netmaker work runs in `EdgeRuntime.waitUntil()` |
| Observability | `device_jobs` / `network_jobs` + `net._http_response` + container logs |
| Versioned, reproducible | Triggers live in migrations; function in git — no dashboard clicks |

## Relationship to Kestra (still used — just not here)

Kestra is **no longer** in the device/network provisioning path. It remains the
orchestrator for the **OpenWRT gateway** side:

- `install` / `provisioning` / `connectivity-check` flows run Ansible
  (`cytopia/ansible`) against gateways, **fetching** device SSH keys from
  Cosmian KMS to deploy them.
- SSH-key **generation** is no longer a Kestra step (`decision-010`,
  `task-060`): the iotgw-ui backend mints keys directly in Cosmian KMS over its
  KMIP REST API (`apps/backend/src/services/kms.ts`), automatically on device
  create and on demand via `generateMissingSshKey`. The backend no longer calls
  any Kestra flow for SSH keys.

The legacy `kestra-call`, `kestra-call_delete`, and `kestra-call.old` edge
functions (and the Dashboard-webhook setup they relied on) and the Kestra
`devices`/`networks` provisioning flows have all been removed.

## References

- [netmaker-call edge function CLAUDE.md](../../supabase/volumes/functions/netmaker-call/CLAUDE.md)
- [doc-010 — Database Migration & Webhook Management](doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md)
- [doc-008 — Domains/Networks/Devices architecture](doc-008%20-%20Domains-Networks-and-Devices-Architecture.md)
- [decision-010 — SSH key management via Cosmian KMS](../decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md)
- [ansible/netmaker — the Netmaker REST contract netmaker-call replicates](../../ansible/netmaker/CLAUDE.md)
