# deploy/ — Kubernetes deployment

Kustomize manifests + a local `kind` cluster for the iotgw-ng platform. This is
the compose → k8s migration target (`backlog/decisions/decision-015`); the
Postgres tier runs on StackGres (`backlog/decisions/decision-018`).

```
deploy/
  kind/
    cluster.yaml      # kind cluster (1 node, pinned v1.31.12, host-port mappings)
    bootstrap.sh      # up | secrets | deploy | smoke | down
  k8s/
    base/             # platform manifests
      namespace.yaml
      kms/                  # Cosmian KMS (StatefulSet + PVC + ConfigMap + Service)
      supabase-db-stackgres/ # Supabase Postgres tier: StackGres SGCluster +
                            #   SGScript initdb + SGInstanceProfile/SGPostgresConfig
                            #   (decision-018; the deployed DB tier, dev+prod)
      supabase-db/          # legacy hand-authored Postgres StatefulSet — RETAINED
                            #   as the documented NO-GO rollback only (not deployed)
      kestra/               # Kestra server + its Postgres
      whoami/               # demo app behind Ingress (the k8s TLS-termination demo)
      supabase-app/         # Supabase app tier (kong/rest/auth/meta/functions)
    overlays/
      kind/           # local dev: StackGres DB + app tier, NodePorts → host ports
      prod/           # production sketch (StackGres DB + app tier, real ingress)
```

## Quickstart (local kind)

```bash
# from repo root — needs: kind, kubectl, sops(+age key), ~/.local/bin on PATH
just kind-up         # create cluster + ingress-nginx        (deploy/kind/bootstrap.sh up)
just k8s-deploy      # create Secrets from SOPS + apply kind overlay
just k8s-smoke       # smoke checks
just kind-down       # tear down
```

Host ports (mapped by `kind/cluster.yaml`, same as the compose stacks):

| Host port | Service | via |
|---|---|---|
| 9998 | Cosmian KMS | NodePort 30998 |
| 8080 | Kestra UI/API | NodePort 30808 |
| 8000 | Supabase Kong API (edge fns via `/functions/v1/*`) | NodePort 30800 |
| 5432 | Supabase Postgres (StackGres primary) | NodePort 30543 |
| 80 / 443 | Ingress (whoami, headlamp, …) | ingress-nginx |

## Headlamp dashboard (TASK-063)

[Headlamp](https://headlamp.dev) is an in-cluster Kubernetes web UI in its own
**dedicated `headlamp` namespace** (`deploy/k8s/headlamp/`, applied standalone —
*not* through the iotgw overlay, so the `namespace: iotgw` transformer can't
absorb it). Exposed through ingress-nginx like the whoami demo. It runs with
`-in-cluster` and a `headlamp` ServiceAccount bound (ClusterRoleBinding
`headlamp-admin`) to the built-in **`cluster-admin`** ClusterRole — full
read-write control of the cluster. `just k8s-deploy` applies it automatically;
to apply on its own: `kubectl apply -k deploy/k8s/headlamp`.

```bash
# open http://headlamp.wsl.ymbihq.local/ (DNS via Pi-hole CNAME → wsl.ymbihq.local)
# and log in with a short-lived ServiceAccount bearer token:
kubectl -n headlamp create token headlamp
```

To restrict to read-only instead, point the `headlamp-admin` ClusterRoleBinding's
`roleRef` at a `get`/`list`/`watch` ClusterRole. Full deploy + token runbook:
[`backlog/docs/doc-017`](../backlog/docs/doc-017%20-%20Headlamp-Kubernetes-Dashboard-Deployment-and-Access.md).

## Postgres tier: StackGres (decision-018)

The Supabase Postgres tier is a **StackGres `SGCluster` named `supabase-db`**
(`base/supabase-db-stackgres/`, PG 15.14) in **both kind-dev and prod** — it
supersedes the hand-authored `supabase-db` StatefulSet (which is retained in
`base/supabase-db/` as the documented NO-GO rollback only, not deployed). See
[`decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md`](../backlog/decisions/decision-018%20-%20Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md).

- **Topology.** `dev+prod` parity on the same SGCluster definition: `instances: 1`
  in kind (set `>=2` in prod for Patroni HA/failover). The cluster is named
  `supabase-db` so its **primary Service is `supabase-db`** — the app tier's
  existing `supabase-db:5432` references resolve unchanged.
- **Direct primary (pooler opt-in).** `disableConnectionPooling: true` →
  clients hit Postgres **directly** at `supabase-db:5432`. StackGres's
  transaction-mode PgBouncer (and the supavisor pooler) is **opt-in only** and
  is **not deployed** — transaction pooling would change prepared-statement /
  `SET ROLE` semantics the app tier has never been tested against (decision-018 §3).
- **pg_net is live first-boot.** `pg_net` is declared in `spec.postgres.extensions`
  **and** added to `shared_preload_libraries` via the `SGPostgresConfig`, so its
  bgworker fires without a post-install `SGDbOps op:restart`. The full chain
  (device/network INSERT → `supabase_functions.http_request()` → `net.http_post`
  → in-cluster Kong POST → `net._http_response` HTTP 202 + a `*_jobs` row) is
  proven on the SGCluster by `tools/smoke-pgnet.sh`.
- **initdb is an `SGScript`** ported from `supabase/volumes/db/{roles,webhooks,jwt}.sql`
  (run as the StackGres superuser): the supabase roles, the `SECURITY DEFINER`
  webhook fn, the event trigger, and the JWT GUCs.
- **Operator is pinned to 1.17.4** (installed by `deploy/kind/bootstrap.sh`) —
  1.18.x is broken on k8s 1.31 (`TASK-062.16`).

## Validation status (2026-06-18, kind v1.31.12)

| Component | Status | Evidence |
|---|---|---|
| Cosmian KMS | ✅ **validated** | `curl :9998/version` → `5.20.0` |
| StackGres operator (1.17.4) | ✅ **validated** | `bootstrap.sh up` installs clean on k8s 1.31 (1.18.x rejected — `TASK-062.16`) |
| **Supabase Postgres — StackGres SGCluster** `supabase-db` (PG 15.14, dev+prod) | ✅ **validated** | primary pod Ready; SGScript initdb created the supabase roles (incl. NOINHERIT `authenticator`); `supabase-db:5432` reachable directly (`TASK-062.04`/`062.16`) |
| ↳ `pg_net` end-to-end on the SGCluster | ✅ **validated** | shared_preload_libraries has pg_net first-boot; INSERT → `net._http_response` HTTP 202 + `*_jobs` row (`tools/smoke-pgnet.sh`) |
| Kestra (+ Postgres) | ✅ **validated** | server `1/1 Ready`, HTTP 200 on `:8080` |
| whoami + ingress-nginx | ✅ **validated** | `curl -H 'Host: whoami.wsl.ymbihq.local' :80` returns whoami |
| Headlamp dashboard (TASK-063) | ✅ **validated** | pod Ready in dedicated **`headlamp`** namespace; `curl http://headlamp.wsl.ymbihq.local/` → HTTP 200 + in-cluster `/config`; `headlamp` SA bound to `cluster-admin` (read-write); Pi-hole CNAME resolves |
| Secrets from SOPS | ✅ **validated** | `secrets.sh k8s` → `supabase-env`, `kestra-env`, `supabase-db-initdb` Secrets |
| **Supabase app tier** (kong / rest=PostgREST / auth=GoTrue / meta / functions) | ✅ **validated** | trimmed stateless set up on kind against the SGCluster; `PGRST_DB_SCHEMAS=public`; edge fns served from the baked `iotgw-functions:local` image (`TASK-062.04`) |
| StackGres backups/PITR (`SGBackup`/`SGObjectStorage`) | 🟡 **authored, not validated** | `base/supabase-db-stackgres/backup.yaml` — needs a real S3/MinIO target + creds Secret; **not** in the kind path (no object store) |
| StackGres HA (≥2 instances, prod) | 🟡 **authored, not validated** | kind runs `instances: 1`; prod bumps it — Patroni failover not exercised here |
| prod edge-functions image (registry pull) | 🟡 **authored, not validated** | prod overlay points at `registry.invalid/...` until `TASK-062.03` wires the CI build+push |
| Supabase realtime / storage / imgproxy / studio / analytics / supavisor / vector | ⚪ **intentionally not deployed** | decision-018 §4: grep-confirmed unused; schemas trimmed out of `PGRST_DB_SCHEMAS`. Not a gap — these are dropped on purpose, not "to do" |

## Known migration caveats (carried from the compose spec)

- **Kestra Ansible flows** run on Kestra's **Kubernetes task runner**
  (`io.kestra.plugin.kubernetes.core.PodCreate`, `kestra` ServiceAccount + RBAC)
  — the host Docker/`docker.sock` runner is gone (`TASK-054`). Flow source + KV
  live in the k8s Kestra Postgres, synced from a Gitea repo (`TASK-062.05`).
- **Kong** needs its declarative config rendered with secret substitution. The
  manifest uses an `envsubst` initContainer instead of the compose `eval` hack.
- **edge functions** are bind-mounted in compose (restart-to-deploy). In k8s the
  functions code is **baked into an image**: kind builds/loads `iotgw-functions:local`;
  prod pulls a release-pinned tag (registry + CI wiring is `TASK-062.03`). The
  base manifest's emptyDir is a placeholder that both overlays patch out.
- **pg_net webhook URLs** stored in the DB point at the in-cluster Kong Service
  URL, not `wsl.ymbihq.local:8000` (`TASK-055`).
- The disabled data-plane services above (realtime/storage/imgproxy/studio/
  analytics/supavisor/vector) and their compose-only quirks (realtime tenant
  from hostname, vector scraping the Docker socket) are **moot** — those services
  are not deployed (decision-018), so the app tier no longer carries that
  surface.

## Accepted parity deltas vs compose (TASK-062.11)

The kind stack was end-to-end validated at parity with compose (UI→backend→
Supabase→DB trigger→in-cluster `netmaker-call`→`network_jobs` SUCCESS verified
with a real Netmaker create/delete round-trip; an Ansible flow ran to SUCCESS on
the k8s PodCreate runner; backend mints/fetches SSH keys in KMS; `just verify`
all-green). The following intentional differences from the compose stack are
**accepted**, not regressions:

- **Data-plane services dropped** (decision-018): realtime, storage, imgproxy,
  studio, analytics/Logflare, **supavisor pooler**, vector. Clients connect to
  the **direct primary** `supabase-db:5432` (no `:6543` pooler).
- **Postgres tier is StackGres** (SGCluster), not the hand StatefulSet; PG15
  vs the compose PG image. Operator pinned 1.17.4.
- **KMS requires auth** (Cosmian API-token) and a **NetworkPolicy** restricts
  `:9998` to in-namespace clients — so the host `:9998` NodePort is blocked
  (kindnet enforces); KMS is reached in-cluster only (`TASK-057`).
- **iotgw-ui** is reached via **ingress hostnames** on the running cluster; the
  `:5173`/`:4444` host ports only map on a fresh `kind-up` (cluster.yaml).
- **Edge functions** are baked into an image (not bind-mounted restart-to-deploy).
- **Kestra** flow source/KV are synced from `git.oriolrius.cat/oriolrius/iotgw-kestra`
  (the old `i40sys/iotgw-kestra` GitHub repo is gone).

### Authored-but-not-fully-validated (need external resources)

- The **real OpenWRT provisioning** flow (install/provisioning against a gateway)
  needs hardware **and** the Ansible KMS-fetch role must now present
  `KMS_AUTH_TOKEN` (KMS auth, `TASK-057`); the k8s PodCreate runner itself is
  proven, the gateway run is not.
- **SGBackup/SGObjectStorage** + the **prod** overlay (TLS, registry image pull)
  render but need a real prod cluster / S3 target.
- Gitea→Kestra **webhook delivery** is unwired (Schedule + manual triggers work).
- Pre-existing **credential rotation** (`TASK-053`) / git-history scrub
  (`TASK-058`) are tracked separately — outside this milestone.
