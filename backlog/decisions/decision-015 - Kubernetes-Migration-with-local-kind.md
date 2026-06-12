---
id: decision-015
title: Kubernetes Migration (kustomize) with a local kind cluster for testing
date: '2026-06-13 00:30'
status: accepted
---

## Context

The platform ran as **5 independent docker-compose stacks** (supabase 13
services, kestra 2, kms 1, traefik-poc 2, plus an ssh-test harness) with no
shared network — cross-stack traffic went over host ports on
`wsl.ymbihq.local`. The workspace map (`BACKUP/claude-workspace-map-2026-06-12.json`)
catalogued every service and flagged the k8s blockers: three `docker.sock`
mounts (vector, kestra-as-root task runner, traefik provider), Kong's `eval`
env-substitution, realtime's hostname-derived tenant, root-owned bind-mount
state, and hardcoded host-port URLs.

Goal: migrate to Kubernetes, tested locally on **kind**.

## Decision

Adopt **kustomize** (base + overlays) deployed to a local **kind** cluster for
dev/testing, with a production overlay path. Secrets come from the SOPS store
(`decision-014`) via `tools/secrets/secrets.sh k8s`, never inlined.

### Structure (`deploy/`)

- `kind/cluster.yaml` — single-node kind, **pinned `kindest/node:v1.31.12`**
  (kind's default v1.35 ships containerd 2.x whose symlink-escape hardening
  rejects the minimal `cosmian/kms` image with *"path escapes from parent"*;
  v1.31 runs every platform image). Host-port mappings reproduce the compose
  port contract (9998/8080/5432 via NodePort, 80/443 via ingress-nginx).
- `kind/bootstrap.sh` — `up | secrets | deploy | smoke | down`.
- `k8s/base/` — `kms`, `supabase-db`, `kestra`, `whoami`, `supabase-app`.
- `k8s/overlays/kind` — NodePorts mapped to host ports (the validated dev path).
- `k8s/overlays/prod` — base + `supabase-app` + real ingress (sketch).

### Mapping decisions

- **StatefulSet + PVC** for stateful tiers: KMS (SQLite, 1 replica),
  supabase-db, kestra-postgres. **Deployment** for stateless: kestra server,
  whoami, and the supabase app tier.
- **Init order** via readiness/liveness probes (compose healthchecks translate
  1:1) instead of `depends_on`.
- **Images pinned** (compose used `:latest`/untagged for kestra, kestra-pg,
  kms): `kestra:v1.3.22`, `cosmian/kms:5.20.0`, `supabase/postgres:15.8.1.085`.
- **Init SQL** (`supabase/volumes/db/*.sql`) → ConfigMap mounted at
  `/docker-entrypoint-initdb.d/iotgw` (runs on empty PGDATA).
- **Secrets** → k8s Secrets generated from `secrets/*.enc.env`.
- **traefik-poc** → replaced by an **Ingress** (ingress-nginx in kind; Traefik
  CRDs/Gateway API in prod). The docker-provider PoC does not translate.

## Validated on kind (2026-06-13, v1.31.12)

`just kind-up && just k8s-deploy && just k8s-smoke` brings up and verifies:

| Component | Evidence |
|---|---|
| Cosmian KMS | `:9998/version` → `5.20.0` |
| Supabase Postgres | `pg_isready` OK; init-SQL created `supabase_admin`/`authenticator`/`supabase_storage_admin` |
| Kestra (+ Postgres) | server `1/1 Ready`, HTTP 200 on `:8080` |
| whoami via ingress-nginx | reachable on `:80` with Host header |
| SOPS→Secret | `supabase-env` (62 keys), `kestra-env` (4) created without touching plaintext |

This proves every hard pattern: StatefulSet+PVC, Secret-from-SOPS, init-SQL
ConfigMap, NodePort host mapping, Ingress, multi-service ordering.

## Authored but not yet kind-validated

The Supabase application tier (`base/supabase-app/`: kong/auth/rest/meta/functions)
is authored from the compose spec and included in the **prod** overlay only.
The remaining services (realtime/storage/imgproxy/analytics/supavisor/vector)
are **not** hand-migrated: for the full data plane in production, use the
`supabase-kubernetes` community Helm chart (mirrors this topology) fed from the
SOPS store, and keep `kms`/`kestra`/ingress from this tree.

## Production path

Same repo, same secrets: swap the `kind` overlay for `prod` (image registry,
real ingress hostnames + TLS, external/HA Postgres, the Helm-managed Supabase
data plane), and re-key the SOPS files to a cluster/KMS age recipient
(`sops updatekeys`). Outstanding for prod: Kestra Kubernetes task runner for
the Ansible flows; re-running the pg_net webhook migrations against in-cluster
Service URLs; KMS authentication + NetworkPolicy (it has none today).

## Consequences

**Positive**: reproducible local cluster (`just kind-*`); the painful infra
patterns are proven; secrets unified across compose + k8s; clear prod path.

**Negative**: the full Supabase stack is not 1:1 hand-migrated (Helm chart
recommended); Kestra Ansible execution needs a runner change before it works in
k8s; kind node pinned to v1.31 due to a containerd-2.x/image incompatibility.

## References

- `deploy/README.md` — operational guide + validation table.
- `decision-014` — secrets (source for k8s Secrets).
- `decision-013` — monorepo organization (the `deploy/` tree).
- Backlog tasks added for: Kestra k8s task runner, webhook URL re-pointing,
  Supabase Helm adoption, KMS auth.
