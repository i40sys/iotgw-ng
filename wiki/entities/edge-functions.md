---
title: Edge Functions
category: entities
tags: [data/edge-functions, data/supabase, vpn/netmaker, status/current]
relationships:
  - target: "[[concepts/provisioning-call-chain]]"
    type: implements
  - target: "[[entities/kestra]]"
    type: uses
sources:
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
  - backlog/tasks/task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract.md
summary: The Deno workers (supabase/edge-runtime) served through Kong — netmaker-call (live provisioning), kestra-dispatch (durable handoff), vpn (TOTP), and iPXE/smoke functions; the right-hand side of the call chain.
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Edge Functions

The platform's **edge functions** are Deno workers served by
`supabase/edge-runtime:v1.74.0` through the Kong gateway (route
`/functions/v1/*`). They live in `supabase/volumes/functions/` and are the
**right-hand side of the provisioning call chain**
([[concepts/provisioning-call-chain]]). Stateless; in the **`supabase-app`**
namespace.

## Dispatch model

`main/` is the dispatcher (container port 9000): it reads `/<name>` from the path
and spawns a per-request worker (`memoryLimitMb=150`, `workerTimeoutMs=60_000`),
passing the runtime env in and proxying `worker.fetch`. `VERIFY_JWT=false` in k8s
(auth delegated to per-route Kong, so JWT-free routes like iPXE remain
expressible).

## Inventory

| Function | Trigger | Role |
|---|---|---|
| `netmaker-call` | `pg_net` webhook on `devices`/`networks` | **live provisioning** — calls Netmaker REST, writes WireGuard keys/IP back, returns 202 + `EdgeRuntime.waitUntil()` |
| `kestra-dispatch` | `deployments` AFTER INSERT | **durable handoff** — triggers a Kestra flow via REST, records the execution id |
| `vpn` | manual / device | **TOTP** auth for device VPN config ([[concepts/totp-device-vpn-auth]]) |
| `about.ipxe`, `menu.ipxe` | HTTP (PXE clients) | iPXE boot configs (JWT-free) |
| `hello`, `martin` | manual | smoke tests |

> The legacy `kestra-call*` functions were **removed**; SSH-key generation and
> OpenWRT flows are driven from the iotgw-ui backend, not edge functions.

## The fast → edge, long-running → Kestra split (decision-016 §6)

- **Fast + idempotent** (e.g. `netmaker-call`: one or two Netmaker round-trips
  inside the 60s timeout) → runs in-process via `202 + waitUntil`, with a `*_jobs`
  row as status. At-least-once, so a **stranded-`RUNNING` sweeper** is required.
- **Long-running / must-not-be-lost** → NOT run in `waitUntil` (it dies with the
  pod) → executes as a **Kestra flow**, triggered by `kestra-dispatch`
  (webhook-originated) or the backend, with the execution id written back. The
  `kestra-dispatch` contract was e2e-validated in kind (TASK-062.18).

## k8s seams that change under StackGres

The functions tier is engine-agnostic (primary path is HTTP to Kong/PostgREST).
Only the webhook URL (→ in-cluster Kong) and the direct `SUPABASE_DB_URL` (→
SGCluster direct primary + StackGres-managed credential) change. Image baked as
`iotgw-functions` ([[references/container-image-cicd]]).

The `kestra-dispatch` durable-handoff contract was **implemented + e2e-validated
in kind** (task-062.18): a `deployments` INSERT → `kestra-dispatch` 202 → Kestra
flow → write-back, with the execution id recorded in `deployment_jobs`.

## Sources

- decision-016 (full target architecture), doc-016; task-062.18.
- Related: [[concepts/provisioning-call-chain]], [[entities/netmaker]], [[entities/kestra]], [[entities/supabase]], [[synthesis/kestra-k8s-runner]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration|decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration]]
- [[_sources/docs/doc-016 - Kestra-Notification-Automation-Pattern|doc-016 - Kestra-Notification-Automation-Pattern]]
- [[_sources/tasks/task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract|task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract]]
