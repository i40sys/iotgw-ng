---
id: decision-016
title: Edge Functions Architecture for the StackGres Data-Plane Migration
date: '2026-06-18 08:57'
status: accepted
---

> **STATUS: ACCEPTED.** This document ratifies the target edge-function
> architecture for the StackGres data-plane migration (folded into the
> `Decommission docker-compose` milestone, `TASK-062`). The architecture
> decisions here are accepted; **implementation** remains gated on the
> `pg_net`-on-StackGres go/no-go spike (`TASK-062.16`) and the StackGres
> adoption ADR (`TASK-062.17`) — concrete values and in-cluster Service names
> are the intended targets, to be confirmed during the spike.

## Context

The platform's edge functions are Deno workers served by
`supabase/edge-runtime:v1.74.0` through the Kong gateway. They are the
**right-hand side of the real provisioning call chain**: a row change in
Postgres fires a `pg_net` webhook that POSTs to an edge function, which calls
an external API and writes the result back to the database.

```
UI (tRPC) → backend → supabase.from().insert()
   → Postgres AFTER INSERT/UPDATE/DELETE trigger
   → supabase_functions.http_request()  (pg_net: net.http_post)
   → POST /functions/v1/netmaker-call   (via Kong)
   → edge function → Netmaker REST API
   → write-back: devices.{private_key,public_key,ip_address} + {device|network}_jobs.status
   → UI polls *_jobs via tRPC
```

This document is needed because the StackGres migration replaces the Postgres
tier (the hand-authored `supabase-db` StatefulSet → a StackGres-managed
`SGCluster`, `decision-015` + the StackGres ADR `TASK-062.17`). The **origin**
of the webhook (`pg_net` running as a background worker inside the
StackGres-managed Patroni runtime) and the **direct DB credentials** the
functions container is wired with both change. The functions tier itself is
stateless and is **not** managed by StackGres, but its two DB-facing seams must
be re-pointed and its trust model re-examined. This decision captures, to the
last detail, how the edge functions are expected to work in the future
k8s + StackGres architecture: the parts, the communications, the security, and
the migration deltas.

### Functions inventory (today)

| Function | Trigger | DB access | External calls | Notes |
|---|---|---|---|---|
| `main/` | dispatcher (entrypoint) | none | none | JWT-verifies when `VERIFY_JWT=true`; spawns a per-request worker for `/<name>` |
| `netmaker-call/` | `pg_net` webhook on `devices` (INSERT/DELETE) **and** `networks` (INSERT/UPDATE/DELETE) | `@supabase/supabase-js` (service-role) → **Kong/PostgREST** | **Netmaker REST** (`https://api.netmaker.i40sys.com`) | Live provisioning path. Creates `*_jobs` rows, writes WireGuard keys back to `devices`, returns `202` + `EdgeRuntime.waitUntil()` background work |
| `vpn/` | manual / device | TBC (re-validate) | none known | TOTP auth for device VPN (`decision-009`) |
| `hello/`, `martin/` | manual | none | none | smoke tests |
| `about.ipxe`, `menu.ipxe` | HTTP (PXE clients) | none | none | iPXE boot configs |

> The legacy `kestra-call*` functions were removed; SSH-key generation and the
> OpenWRT Ansible flows are driven from the **iotgw-ui backend**, not from edge
> functions. The backend talks to **Cosmian KMS** and **Kestra** today.
> **Forward note:** §6 re-introduces edge-function→Kestra triggering — but only
> as a thin "start a flow and return" handoff for long-running webhook-originated
> work, not the heavy `kestra-call` orchestration that was removed.

### How it is wired today (the exact details)

**Runtime / dispatch** (`supabase/volumes/functions/main/index.ts`):
- `supabase/edge-runtime:v1.74.0`, listening on container port **9000**, started
  with `--main-service /home/deno/functions/main`.
- The `main` worker reads `/<service_name>` from the path, then creates a
  per-request worker with `EdgeRuntime.userWorkers.create()`
  (`memoryLimitMb=150`, `workerTimeoutMs=60_000`), passing **all** of the
  runtime env (`Deno.env.toObject()`) into the worker, and proxies `worker.fetch(req)`.
- JWT gate: `if (req.method !== 'OPTIONS' && VERIFY_JWT)` verify the `Bearer`
  token against `JWT_SECRET` (`main/index.ts:34`). **`VERIFY_JWT` is `"false"`
  in k8s** (`functions.yaml:80-81`), so the gate is currently a no-op.

**Ingress route** (`deploy/k8s/base/supabase-app/kong.yaml:116-125`):
- `functions-v1`: `url: http://functions:9000/`, route path `/functions/v1/`
  with `strip_path: true` and the `cors` plugin. So
  `POST /functions/v1/netmaker-call` → `functions:9000/netmaker-call` →
  dispatcher → `netmaker-call` worker.

**The webhook origin** (`supabase/volumes/db/webhooks.sql` +
`iotgw-ui/supabase/migrations/20260610000000_…` / `…0001_…`):
- `supabase_functions.http_request()` is a `plpgsql` trigger function that calls
  `net.http_post(url, payload, params, headers, timeout_ms)` (the `pg_net`
  extension, installed `SCHEMA extensions`).
- The triggers pass `url='http://wsl.ymbihq.local:8000/functions/v1/netmaker-call'`,
  `method='POST'`, `headers='{"Content-Type":"application/json"}'`,
  `timeout='5000'`. **There is no `Authorization` header** — the payload is the
  only thing sent. `payload = {old_record, record, type, table, schema}`.

**Container env** (`deploy/k8s/base/supabase-app/functions.yaml`, all from the
`supabase-env` Secret rendered from SOPS):
- `SUPABASE_URL=http://kong:8000` (functions reach the DB **through Kong/PostgREST**)
- `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (service role → bypasses RLS)
- `FUNC_PW = POSTGRES_PASSWORD` and
  `SUPABASE_DB_URL = postgresql://postgres:$(FUNC_PW)@supabase-db:5432/postgres`
  (a **direct** superuser libpq URL — the only hard, engine-specific coupling)
- `NETMAKER_BASE_URL`, `NETMAKER_MASTER_KEY` (the live, shared, compromised
  master key — `decision-014`, `task-061`)
- `KESTRA_BASE_URL`, `KESTRA_USER`, `KESTRA_PASSWORD` (**vestigial** — the live
  `netmaker-call` does not use Kestra), `VERIFY_JWT="false"`, `JWT_SECRET`.
- Code is delivered via an `emptyDir` placeholder today; it must be baked into
  an image or git-synced (`TASK-062.03`).

## Decision

**The edge-functions tier stays a stateless service in our existing
`deploy/k8s/base/supabase-app/` kustomize tree — it is NOT managed by
StackGres.** StackGres owns only Postgres. The functions tier is essentially
**engine-agnostic**: its primary data path is HTTP to Kong/PostgREST, so the
StatefulSet→SGCluster swap is transparent to it *provided PostgREST is
re-pointed*. Only two seams actually change, and the trust model must be
hardened. The target architecture is specified below.

### 1. Placement, ownership, image delivery

- **Owner:** kustomize (`deploy/k8s/base/supabase-app/functions.yaml`), per the
  StackGres ADR decision to keep the stateless tier in kustomize rather than
  adopt the `supabase-kubernetes` Helm chart (the chart omits `functions`,
  which we need). StackGres CRDs do not touch this Deployment.
- **Image:** bake `iotgw-functions:local` (`FROM supabase/edge-runtime:v1.74.0`,
  `COPY volumes/functions /home/deno/functions`) and `kind load` it in
  `deploy/kind/bootstrap.sh`; in prod, publish to a registry or git-sync the
  tree. Replaces the compose bind-mount restart-to-deploy workflow
  (`TASK-062.03`). The `emptyDir` placeholder is removed.
- **Topology:** unchanged Deployment + `Service functions:9000`; `replicas: 1`
  in kind. See §7 for the replica/background-work caveat in prod.

### 2. Communications (target)

| # | Path | Today | Under StackGres | Change? |
|---|---|---|---|---|
| A | **Webhook ingress**: `pg_net` → function | `net.http_post` from the StatefulSet → `wsl.ymbihq.local:8000` → Kong → `functions:9000` | `net.http_post` from the **SGCluster Patroni pod** → in-cluster `http://kong:8000/functions/v1/netmaker-call` → `functions:9000` | **Yes** — URL re-pointed (`TASK-055`); egress from the StackGres pod to the Kong Service must be allowed |
| B | **Function → DB (writes)**: `*_jobs`, key write-back | `supabase-js` (service-role) → `SUPABASE_URL=http://kong:8000` → PostgREST → `supabase-db:5432` | identical client; **PostgREST** is re-pointed to the SGCluster **direct primary** Service | **No change to the function**; transparent once PostgREST is re-pointed (`task-056`) |
| C | **Function → DB (direct libpq)**: `SUPABASE_DB_URL` | `postgres:<POSTGRES_PASSWORD>@supabase-db:5432` | `postgres:<StackGres-managed-superuser-pw>@<sgcluster-primary-svc>:5432` (direct primary, **not** the transaction-mode PgBouncer) | **Yes** — host + credential **source** change (see §5) |
| D | **Function → Netmaker REST** | `https://api.netmaker.i40sys.com/api/...`, `Authorization: Bearer NETMAKER_MASTER_KEY` | identical (external egress) | **No** — but see §4 (scoped key, egress policy) |
| E | **202 + background model** | `EdgeRuntime.waitUntil(bgPromise)`; job row `PENDING→RUNNING→SUCCESS/FAILED` | identical | **No** — but see §7 (durability across pod restarts) |

Concretely: the `netmaker-call` function never opens a direct libpq connection
itself — it uses the `supabase-js` client against Kong (path B). The direct
`SUPABASE_DB_URL` (path C) is injected into every worker's env but is only a
liability if a function actually uses it (`vpn/` and any future function must be
audited). The migration's job is therefore mostly (A) + (C) + the security
hardening, not a rewrite of the functions.

### 3. Database-side dependencies (provided by the SGCluster, not the functions)

The webhook mechanism depends on DB objects that move from the supabase image's
baked init into the **SGScript** that bootstraps the SGCluster (`task-056`,
proven by the spike `TASK-062.16`):

- The `pg_net` extension (`CREATE EXTENSION pg_net SCHEMA extensions`) **loaded
  as a background worker** — `pg_net` must be in `SGCluster.spec.postgres.extensions`
  **and** appended to `shared_preload_libraries` via `SGPostgresConfig` (keeping
  the auto-managed `pg_stat_statements,auto_explain`), applied with an
  `SGDbOps op:restart`.
- The `supabase_functions` schema, the `supabase_functions.http_request()`
  `SECURITY DEFINER` trigger function, the `supabase_functions.hooks` audit
  table, and the `issue_pg_net_access` `ddl_command_end` event trigger.
- The role set the function path relies on: `service_role` (RLS bypass via
  grants — **not** `BYPASSRLS`), `authenticator`/`anon`/`authenticated` (the
  PostgREST role-switch the `supabase-js` client uses through Kong).

If any of these is missing or `pg_net` fails to load, **path A fails silently**
(the trigger still returns `NEW`; nothing is POSTed). This is the single
highest-severity risk and is why the spike must assert an actual
`net._http_response` row, not just an HTTP 200.

### 4. Security (target model)

1. **Webhook & function authentication — per-route at Kong + NetworkPolicy
   (resolved Q1/Q4).** Today the trigger sends **no `Authorization` header** and
   `VERIFY_JWT=false`, so anything able to reach
   `kong:8000/functions/v1/netmaker-call` can drive Netmaker provisioning. Auth
   is therefore enforced **per route at Kong**, not via the edge runtime's
   single global `VERIFY_JWT` (a global flag cannot express the JWT-free
   exceptions below). Layers:
   - **NetworkPolicy:** `functions:9000` accepts ingress **only from the Kong
     pod**; the SGCluster pods may egress to Kong; nothing else may reach either.
   - **Kong per-route JWT:** protected routes (the `netmaker-call` webhook and
     any authenticated function) carry a Kong `jwt` plugin; the `pg_net` trigger
     supplies a **service-role JWT** in its `headers` argument (the
     `http_request()` signature already accepts a headers JSON — extend the
     migration triggers to pass
     `{"Content-Type":"application/json","Authorization":"Bearer <service-role-jwt>"}`).
   - **JWT-free routes (a first-class requirement):** some functions MUST be
     reachable without a token — the iPXE boot configs (`about.ipxe`/`menu.ipxe`,
     served to PXE clients that cannot present a JWT) and other special cases —
     so they get **dedicated open Kong routes** (no `jwt` plugin), narrowed by
     NetworkPolicy / source-IP where possible. This per-route requirement is the
     reason auth lives at Kong rather than in a blanket runtime flag.
   - The edge runtime keeps **`VERIFY_JWT=false`** (auth delegated to Kong so the
     JWT-free exceptions remain expressible). A dispatcher-level allow-list was
     considered and rejected in favor of Kong routes.
2. **Netmaker credential.** `NETMAKER_MASTER_KEY` is a shared, production,
   non-rotatable master key and is **compromised** (`decision-014`). Target:
   replace it with a **scoped, revocable Netmaker API key** (`task-061`) sourced
   from the SOPS store; keep the "no inline fallback, fail loudly if unset"
   behavior (`netmaker-call/index.ts:39-41`).
3. **Service-role key blast radius.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.
   It stays in the `supabase-env` Secret (SOPS → k8s Secret, `decision-014`);
   it is never logged and never baked into the image. Worker env is per-request
   and in-memory only.
4. **Egress.** A **NetworkPolicy egress** rule allows the functions pod to reach
   (a) Kong (DB writes via PostgREST), (b) the external **Netmaker API** over
   TLS, (c) DNS, and — only if a function uses path C — (d) the SGCluster direct
   primary Service. All other egress denied.
5. **Secret sourcing.** All function env comes from the `supabase-env` Secret
   rendered by `secrets.sh k8s` from SOPS; no plaintext in tracked source
   (`decision-014`). The direct-DB credential (§5) is the one value that must be
   re-sourced from the **StackGres-managed** credential Secret.
6. **Transport.** Function ↔ Kong ↔ PostgREST ↔ SGCluster is in-cluster
   (cleartext within the pod network, gated by NetworkPolicy). Function →
   Netmaker is public TLS. External exposure terminates TLS at the Ingress
   (`decision-015`).

### 5. The one hard credential change (direct DB URL)

`functions.yaml:48-54` builds `SUPABASE_DB_URL` from
`FUNC_PW = supabase-env/POSTGRES_PASSWORD` against host `supabase-db:5432`. Under
StackGres:
- The `postgres` superuser password is **managed by StackGres** in its own
  generated Secret (exposed via the `postgres-util` sidecar), **not** the
  supabase `POSTGRES_PASSWORD`. `FUNC_PW` must reference the StackGres
  credential Secret key.
- The host changes from `supabase-db` to the **SGCluster primary Service** name
  (e.g. `<sgcluster-name>` / its `-primary` endpoint), and must target the
  **direct primary**, never the transaction-mode PgBouncer (multi-statement /
  prepared-statement hazards — StackGres ADR `TASK-062.17`).
- **Keep `SUPABASE_DB_URL` (resolved Q2), but re-point + re-source it.** A direct
  libpq path is **retained** for functions that need one (the live `netmaker-call`
  does not use it, but it is kept for `vpn/` and future use cases). Under
  StackGres: change the host from `supabase-db` to the SGCluster **direct
  primary** Service, and rebuild `FUNC_PW` from the **StackGres-managed**
  superuser credential Secret (not the supabase `POSTGRES_PASSWORD`). Document
  which functions consume it. Any function on the direct path must target the
  **direct primary**, never the transaction-mode PgBouncer (multi-statement /
  prepared-statement hazards).

### 6. Execution model: fast → edge function, long-running → Kestra (resolved Q3)

Work is split by duration/durability, and the split is **firm**:

- **Fast path → edge function (Supabase).** Short, idempotent work (e.g.
  `netmaker-call`: one or two synchronous Netmaker round-trips, well within the
  60s worker timeout) runs in-process via `202 Accepted` +
  `EdgeRuntime.waitUntil()`, with the `*_jobs` row as the status record.
  Semantics are **at-least-once**, so a **stranded-`RUNNING` sweeper** (a
  reconciler that re-drives jobs stuck past a timeout) is required to make the
  fast path safe across pod restarts.
- **Long-running / durable path → Kestra flow.** Anything that can exceed the
  edge-runtime worker timeout or must survive a pod restart is **NOT** run inside
  the ephemeral edge runtime (`waitUntil` dies with the pod). It executes as a
  **Kestra flow** — Kestra is already in the stack, durable, retriable, and
  observable. The originator only **triggers the flow and returns**:
  - **webhook-originated** long work: the edge function calls the **Kestra REST
    API** to start the flow (a thin handoff that formalizes the pattern the
    removed `kestra-call` function used), then returns `202`;
  - **backend-originated** long work: the iotgw-ui backend triggers the Kestra
    flow directly — already the case for the OpenWRT install/provisioning/
    connectivity flows and SSH-key work.

  In both cases the **Kestra execution id is recorded in the relevant `*_jobs`
  row**, so the existing Deployments UI polling is unchanged.

**Decision rule:** if it is fast and idempotent → edge function; if it is
long-running or must-not-be-lost → Kestra flow. `netmaker-call` stays an edge
function. For these flows to run under k8s, the **Kestra Docker task runner must
be migrated to the Kubernetes task runner** (`task-054`).

### 7. What explicitly does NOT change

- The dispatcher model, per-request worker creation, memory/timeout limits, and
  the `202 + waitUntil` async pattern.
- The `netmaker-call` business logic, idempotency, UUID-without-dashes
  convention, and the `*_jobs` lifecycle (`PENDING→RUNNING→SUCCESS/FAILED`).
- The function→DB **write** path (B): it stays `supabase-js` over Kong; the DB
  engine swap is invisible to it.
- The Kong `/functions/v1/*` route and the `functions:9000` Service.

## Considerations for the future architecture

- **Silent `pg_net` failure (highest severity).** A non-loaded/non-firing
  `pg_net` bgworker leaves the trigger returning normally while no POST happens —
  the whole provisioning chain is dead with no error. Mitigations: the spike
  must fire `net.http_post` end-to-end and assert a `net._http_response` row;
  `task-055` adds a re-usable "assert it fired" check; `TASK-062.10` extends the
  kind smoke to assert a `net._http_response` / `*_jobs` row after a create.
- **Background-work durability (see §6).** The fast path (`waitUntil`) is
  at-least-once: a pod killed mid-flight strands the job in `RUNNING` and may
  leave Netmaker half-applied. Required fast-path mitigations:
  `terminationGracePeriodSeconds` tuned to the 60s worker timeout, a `preStop`
  drain, `maxUnavailable: 0` on rollout, and a **sweeper** that re-drives
  `RUNNING` jobs older than N minutes. Work that cannot tolerate at-least-once
  uses the **durable executor** path (§6), not `waitUntil`.
- **Replicas vs. the per-request worker model.** Scaling to >1 replica is safe
  for ingress (idempotent Netmaker ops, job rows keyed by `execution_id`) but
  multiplies background workers; pair with the durability mitigations above.
- **Observability.** `analytics`/`vector` are being dropped (unused). Function
  logs (with transaction IDs) go to pod stdout → the cluster's log path; ensure
  `kubectl logs` / the chosen log stack captures them, and that the
  silent-failure conditions surface (alert on `*_jobs` stuck in `PENDING`/`RUNNING`).
- **`KESTRA_*` env is the durable-handoff credential, not dead weight.** The
  live `netmaker-call` (fast path) does not use `KESTRA_BASE_URL/USER/PASSWORD`,
  but per §6 any edge function that triggers a **Kestra flow** for long-running
  work needs them. Keep them for the functions that hand off to Kestra; drop them
  only from functions that never do. Sourced from the SOPS store like every
  other secret.
- **Edge-runtime pinning & supply chain.** `v1.74.0` is pinned; the baked image
  is the new supply-chain unit — sign/scan it and pin the base in prod.
- **`vpn/` and iPXE functions.** Re-validate `vpn/` (TOTP, `decision-009`) DB
  access path under StackGres, and that the iPXE functions (served to PXE
  clients) are reachable through the chosen Ingress/Service exposure.
- **DB-credential reconciliation (§5)** is the only change that can hard-break a
  function that uses path C; resolve by auditing and preferably dropping
  `SUPABASE_DB_URL`.

## Consequences

**Positive**
- The functions tier is largely **decoupled** from the DB engine: keeping the
  primary path on Kong/PostgREST means StackGres adoption is low-impact here.
- Forces closure of a real pre-existing security gap (unauthenticated webhook),
  the compromised Netmaker key, and the vestigial Kestra env.
- The migration makes the webhook's silent-failure mode explicit and tested.

**Negative / cost**
- One hard credential re-wire (`SUPABASE_DB_URL` host + StackGres-managed creds),
  plus the `pg_net`-as-bgworker init that must be reproduced in the SGScript.
- New `NetworkPolicy`, JWT/auth on the webhook, and background-work durability
  handling are net-new work the current compose setup never had.

**Neutral**
- The functions code itself is essentially unchanged; the work is manifest,
  init-SQL placement, networking, and secrets.

## Action items (linked tasks)

- `TASK-062.16` — spike: prove `pg_net` loads + `net.http_post` fires from the
  SGCluster and reaches `netmaker-call`; reproduce the `supabase_functions`
  schema / `http_request()` / event trigger via SGScript. **Gates this doc.**
- `TASK-062.17` — StackGres adoption ADR (direct-primary, kustomize stateless
  tier). Records the connection decisions this doc depends on.
- `task-056` — SGCluster + SGScript initdb (incl. the function DB objects) +
  re-point PostgREST to the direct primary.
- `task-055` — re-point the webhook URL to in-cluster Kong **and** assert the
  POST actually fires (engine-neutral; lands regardless of StackGres).
- `TASK-062.03` — bake/git-sync the functions image (removes the `emptyDir`).
- `TASK-062.04` — validate the app tier (incl. functions + the end-to-end
  webhook) against the SGCluster.
- `TASK-062.10` — extend `verify.sh` smoke to assert a `net._http_response` /
  `*_jobs` row after a device/network create.
- `task-061` — replace the Netmaker master key with a scoped, revocable API key.
- **New (to be created if accepted):** add a **NetworkPolicy** for the functions
  tier; implement **Kong per-route auth** (JWT plugin on protected routes incl.
  the `netmaker-call` webhook; open routes for iPXE/JWT-free functions) and
  extend the webhook trigger to send a **service-role JWT** header; **re-point +
  re-source `SUPABASE_DB_URL`** to the SGCluster direct primary + StackGres
  credential Secret (kept, not dropped); add the **stranded-`RUNNING` sweeper**
  for the fast path; for the **durable path, define the Kestra enqueue contract**
  (which flow, REST trigger + auth, execution-id write-back) per use case —
  depends on the Kestra k8s task runner (`task-054`); keep `KESTRA_*` env on the
  functions that trigger flows.

## Resolved decisions (2026-06-18 review)

1. **Webhook auth → JWT + NetworkPolicy**, enforced **per route at Kong** (the
   `pg_net` trigger sends a service-role JWT; runtime `VERIFY_JWT=false`). See §4.
2. **Keep `SUPABASE_DB_URL`** — a direct DB path is retained for functions that
   need it; re-point to the SGCluster direct primary and re-source the credential
   from the StackGres-managed Secret. See §5.
3. **Execution split is firm: fast → edge function, long-running → Kestra
   flow.** Short idempotent ops (e.g. `netmaker-call`) stay on the edge-function
   fast path (+ sweeper); long-running / must-not-be-lost work runs as a Kestra
   flow, triggered by the edge function (webhook-originated) or the backend.
   See §6.
4. **JWT-free functions are required** (iPXE and other special cases) — use
   dedicated **open Kong routes**; this is why auth is per-route rather than a
   blanket runtime flag. See §4.

## Kestra durable-execution handoff contract (TASK-062.18, 2026-06-18)

The following contract was **implemented and e2e-validated** in kind (`task-062.18`).
It resolves the "Kestra enqueue contract" open item above.

### Contract: webhook-originated long-running work → Kestra

**Function:** `kestra-dispatch` (`supabase/volumes/functions/kestra-dispatch/`)

**Trigger:** `deployments` table — AFTER INSERT (INSERT only, no loop risk).
Migration: `iotgw-ui/supabase/migrations/20260618000000_create_deployments_webhook.sql`

**Target flow:** Default `k8s-ansible-runner-test` (for e2e proof); override with
`KESTRA_DISPATCH_FLOW_ID` env var for production flows (`provisioning`/`install`).

**Kestra REST trigger call:**
```
POST http://kestra:8080/api/v1/main/executions/iotgw-ng/{flowId}
Authorization: Basic base64(KESTRA_USER:KESTRA_PASSWORD)
```
No body for flows without inputs (e.g. `k8s-ansible-runner-test`).
`multipart/form-data` with field `json_data` for flows with a JSON input.

**Payload mapping** (`deployments` record → `deployment_jobs`):
- `device_id` → look up `devices` → `device_name`, `device_ip_address`, `ssh_key_id`
- `devices.network_id` → look up `networks` → `network_name`, `network_ipv4`, etc.
- `networks.domain_id` → look up `domains` → `domain_name`, `domain_display_name`
- `id`, `name`, `configuration`, `version` → `deployment_id`, `deployment_name`, `configuration_json`, `deployment_version`

**Auth source:** `supabase-env` k8s Secret (from SOPS store):
- `KESTRA_USER` / `KESTRA_PASSWORD` — basic auth
- `KESTRA_BASE_URL` is **overridden to `http://kestra:8080`** in
  `deploy/k8s/base/supabase-app/functions.yaml` (the Secret carries the
  external URL; the manifest patches it to the in-cluster Service).

**`deployment_jobs` lifecycle:**

| Phase | execution_id | status | Who sets it |
|---|---|---|---|
| Before 202 | `kestra-dispatch-<uuid>` | PENDING | Function (sync) |
| Trigger succeeded | same | RUNNING + `error_message=Kestra execution: <id>` | Function background |
| Trigger failed | same | FAILED + error_message | Function background |
| Durable row | `<kestra-execution-UUID>` | PENDING | Function background |
| Flow finished | `<kestra-execution-UUID>` | SUCCESS / FAILED | Kestra write-back task |

**Kestra write-back task** (added to `k8s-ansible-runner-test`, revision 4):
```yaml
- id: writeback_success
  type: io.kestra.plugin.core.http.Request
  uri: "http://kong:8000/rest/v1/deployment_jobs?execution_id=eq.{{ execution.id }}"
  method: PATCH
  headers:
    Authorization: "Bearer <SERVICE_ROLE_KEY>"
    apikey: "<SERVICE_ROLE_KEY>"
    Content-Type: application/json
    Prefer: return=minimal
  body: '{"status": "SUCCESS", "completed_at": "{{ now() }}"}'
  options:
    allowFailed: true
```
Note: Kong PostgREST route requires both `Authorization: Bearer` and `apikey`
headers (Kong JWT plugin behaviour). The `allowFailed: true` option prevents the
flow from failing if the write-back is unsuccessful (best-effort reconciliation).

**Failure handling (AC #4):** if the Kestra trigger call fails (network error,
Kestra not reachable, non-200 response), the background task sets the placeholder
row to `FAILED` with the error message. No silent loss.

**The Deployments UI polling is unchanged** — it reads `deployment_jobs` via
`get_deployment_jobs` RPC and observes the status transitions.

### E2e validation (kind, 2026-06-18)

```
# POST to kestra-dispatch (simulating webhook)
→ 202 ACCEPTED, pendingExecutionId: kestra-dispatch-bc17adc7-...

# deployment_jobs immediately (before flow completes):
  kestra-dispatch-bc17adc7-... | PENDING  (created sync, before 202)
  50wszkz3wXQrdkSHHKEqVJ      | PENDING  (Kestra exec id, created background)

# After Kestra flow completes (k8s-ansible-runner-test ~30s):
  kestra-dispatch-bc17adc7-... | RUNNING  (promoted, ref: Kestra exec id)
  50wszkz3wXQrdkSHHKEqVJ      | SUCCESS  (Kestra write-back returned 204)

# Webhook-triggered path also validated:
  pg_net → deployments_webhook → kestra-dispatch 202
  → EjhG1mKtOBzxPVrubdsKX SUCCESS (via writeback_success task code 204)
```

## Remaining open items

- **Per-route Kong config:** the JWT-plugin configuration for protected routes
  and the confirmed list of JWT-free routes (`about.ipxe`, `menu.ipxe`, …), to be
  finalized during implementation.

## References

- `decision-015` — Kubernetes migration with kind (data-plane target)
- `TASK-062.17` (draft ADR) — adopt StackGres for the Postgres tier
- `decision-014` — Secrets management (SOPS+age); Netmaker key compromise
- `decision-009` — TOTP authentication for device VPN access (`vpn/`)
- `backlog/docs/doc-016` — DB-change → `netmaker-call` provisioning pattern
- Code: `supabase/volumes/functions/{main,netmaker-call,kestra-dispatch}/index.ts`,
  `deploy/k8s/base/supabase-app/{functions,kong}.yaml`,
  `supabase/volumes/db/webhooks.sql`,
  `iotgw-ui/supabase/migrations/20260610000000_*`, `…0001_*`,
  `…20260618000000_create_deployments_webhook.sql`
