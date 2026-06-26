---
title: Provisioning Call Chain
category: concepts
tags: [data/edge-functions, data/supabase, vpn/netmaker, provisioning/devices, provisioning/networks, status/current]
relationships:
  - target: "[[entities/edge-functions]]"
    type: uses
  - target: "[[entities/netmaker]]"
    type: uses
  - target: "[[concepts/domains-networks-devices]]"
    type: related_to
sources:
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
  - backlog/docs/doc-010 - Database-Migration-and-Webhook-Management-Guide.md
summary: The platform spine — a UI device/network change becomes a real Netmaker resource via a Postgres pg_net trigger that POSTs to the netmaker-call edge function (no Kestra, no Ansible).
provenance:
  extracted: 0.9
  inferred: 0.08
  ambiguous: 0.02
base_confidence: 0.85
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Provisioning Call Chain

This is the **spine of the platform**. When a user creates/updates/deletes a
device or network in the UI, devices and networks now provision **directly via
the `netmaker-call` edge function** — not through Kestra and not through Ansible.

```
1. UI (React)                          iotgw-ui/apps/app/
       ↓ tRPC call
2. Backend (Fastify/tRPC, :4444)       iotgw-ui/apps/backend/src/routers/
       ↓ supabase.from().insert()
3. Supabase PostgreSQL
       ↓ AFTER INSERT/UPDATE/DELETE row trigger (pg_net)
4. supabase_functions.http_request() → POST /functions/v1/netmaker-call
       ↓ (via Kong)
5. Edge Function "netmaker-call" (Deno)
       • creates a {device|network}_jobs row (status PENDING)
       • returns 202 Accepted, finishes work in EdgeRuntime.waitUntil()
       • calls the Netmaker REST API directly (no Kestra)
       ↓
6. Netmaker API (api.netmaker.i40sys.com)
       • creates extclient / network → returns WireGuard keys + IP
7. (device INSERT only) UPDATE devices SET private_key, public_key, ip_address
8. UPDATE {device|network}_jobs SET status = SUCCESS/FAILED
9. UI polls jobs table via tRPC → updates UI
```

## Key Ideas

- **The webhook is a Postgres trigger defined in a migration**, not a Supabase
  Dashboard webhook. It calls `supabase_functions.http_request(url, method,
  headers, body, timeout_ms)`, backed by the `pg_net` extension, which fires a
  non-blocking HTTP POST. Triggers live in
  `iotgw-ui/supabase/migrations/20260610000000_…`/`…0001_…`.
- **Trigger coverage:** `devices` reacts to INSERT + DELETE (keys/IP are
  immutable for an extclient — there is intentionally **no** device UPDATE
  trigger); `networks` reacts to INSERT/UPDATE/DELETE.
- **Fast + async:** the trigger's HTTP call returns fast (`202`); the slow
  Netmaker work runs in `EdgeRuntime.waitUntil()`. Job rows
  (`device_jobs`/`network_jobs`) are the observability trail the UI polls via
  the `get_device_jobs`/`get_network_jobs` RPCs.
- **Silent-failure mode (highest severity):** if `pg_net` is not loaded/firing,
  the trigger returns normally and **nothing is POSTed** — the whole chain dies
  with no error. Verification must assert an actual `net._http_response` row,
  not just an HTTP 200. ^[inferred]
- This pattern replaced the removed `kestra-call` edge function and the Kestra
  `devices`/`networks` flows (commits f309e78/124e70e, migrations
  20260610000000/01).

## Kestra is still used — just not here

Kestra orchestrates the **OpenWRT gateway** side, not device/network
provisioning: `install` / `provisioning` / `connectivity-check` flows run
Ansible against gateways. SSH-key **generation** is also no longer a Kestra step
(see [[concepts/ssh-key-management-kms]]). For long-running webhook-originated
work, a thin `kestra-dispatch` edge function hands off to a Kestra flow (the
fast→edge-function, long-running→Kestra split — see [[entities/edge-functions]]).

## Under StackGres / k8s

The chain is engine-agnostic: the primary write path is HTTP to Kong/PostgREST,
so the StatefulSet → StackGres `SGCluster` swap is transparent **provided
PostgREST is re-pointed**. Only the webhook URL (now in-cluster
`kong.supabase-app.svc.cluster.local:8000`) and the direct `SUPABASE_DB_URL`
seam change. See [[concepts/kubernetes-migration-kind]],
[[entities/stackgres]], [[concepts/namespace-per-subproject]].

## Sources

- [[references/database-migrations-webhooks]] — how the trigger migrations are managed.
- decision-016 (edge functions architecture), doc-016 (provisioning pattern), doc-010 (migration/webhook guide).
- Part of the [[projects/iotgw-ng]] project hub.

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration|decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration]]
- [[_sources/docs/doc-016 - Kestra-Notification-Automation-Pattern|doc-016 - Kestra-Notification-Automation-Pattern]]
- [[_sources/docs/doc-010 - Database-Migration-and-Webhook-Management-Guide|doc-010 - Database-Migration-and-Webhook-Management-Guide]]
