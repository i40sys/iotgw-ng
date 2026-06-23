---
id: decision-020
title: Namespace-per-subproject topology (iotgw is the cluster, not a namespace)
date: '2026-06-23 06:30'
status: accepted
---
## Context

Since the kind migration (`decision-015`) the whole platform ran in a **single
`iotgw` Kubernetes namespace**, collapsed there by a global `namespace: iotgw`
kustomize transformer in `deploy/k8s/base` + both overlays. Only Headlamp
(`decision-019`, [[doc-017]]) and the vendored ingress-nginx were isolated. This
made `iotgw` a giant catch-all namespace mixing five independent subprojects
(Kestra, Cosmian KMS, the Supabase DB tier, the Supabase app tier, and the
iotgw-ui app), defeating per-subproject RBAC/NetworkPolicy/quota boundaries and
conflating the **cluster identity** (`iotgw`) with a **namespace**.

The Headlamp split established the reference pattern: a self-contained
kustomization with its own `namespace:` transformer and its own `Namespace`
resource, applied standalone so no global transformer absorbs it.

## Decision

**`iotgw` is the kind CLUSTER name only — there is no `iotgw` namespace.** The
platform is split into one namespace per independent subproject, each a
self-contained kustomization with its own `namespace:` transformer and
`Namespace` resource (the Headlamp pattern); the global `namespace: iotgw`
transformer and the shared `iotgw` `Namespace` are removed.

| Namespace | Workloads |
|---|---|
| `kestra` | Kestra Deployment + `kestra-postgres` StatefulSet + Kestra RBAC + the Kestra-spawned Ansible runner pods |
| `kms` | Cosmian KMS StatefulSet/Service + its NetworkPolicy |
| `supabase-db` | StackGres `SGCluster supabase-db` (the Postgres tier) |
| `supabase-app` | kong, auth (GoTrue), rest (PostgREST), meta, functions (edge runtime) |
| `iotgw-ui` | frontend + backend (**and the whoami demo**, see below) |

`headlamp` and `ingress-nginx` are already isolated and are **not** touched.

Conventions ratified here:

- **The names `iotgw` (kind cluster), `kind-iotgw` (kube-context),
  `kind load --name iotgw`, the `verify.sh` cluster grep, and the Keycloak
  `iotgw` realm are UNCHANGED.** Only the k8s namespace named `iotgw` is removed.
  Likewise the **Kestra** flow namespace `iotgw-ng` (an internal Kestra concept,
  not a k8s namespace) is unchanged.
- **Cross-namespace** service references use the FQDN
  `service.namespace.svc.cluster.local`; **intra-namespace** references stay
  short names (e.g. `kestra → kestra-postgres`, `kong → auth/rest/functions`,
  `auth → kong`). The load-bearing distinction is *cross-namespace only* — no
  needless FQDN churn on same-namespace calls.
- **NetworkPolicy** `namespaceSelector`s key on the guaranteed auto-label
  `kubernetes.io/metadata.name` (stamped on every namespace by the
  NamespaceDefaultLabelName admission plugin), so no manual namespace labelling
  is required. A cross-namespace allow rule combines `namespaceSelector` AND
  `podSelector` **inside one `from:` peer object** (a list item with both keys),
  never as two separate OR'd peers — the latter would widen access to the
  SSH-key store (`decision-015` KMS hardening, `task-057`).
- **whoami is dropped entirely.** It was an obsolete TLS-termination PoC (the
  remnant of the removed `traefik-poc`) and is no longer needed. Its base
  component (`deploy/k8s/base/whoami/`) and its smoke check are removed. The KMS
  NetworkPolicy **deny-path test** is now performed from a pod that is
  intentionally NOT on the allow-list — any `supabase-app` pod (e.g. `kong` or
  `functions`) reaching `cosmian-kms.kms:9998` must be denied.

## Consequences

- **Per-subproject isolation.** RBAC, NetworkPolicy, resource quotas and blast
  radius are now scoped per subproject. The Kestra pod-runner Role/RoleBinding
  and the Kestra-spawned runner pods live in `kestra`; the KMS NetworkPolicy
  admits exactly `iotgw-ui-backend` (from `iotgw-ui`) and Kestra + its runners
  (from `kestra`) and nothing else.
- **FQDNs become load-bearing.** The app tier reaches the DB at
  `supabase-db.supabase-db.svc.cluster.local:5432`, the backend reaches KMS at
  `cosmian-kms.kms.svc.cluster.local:9998` and Kong at
  `kong.supabase-app.svc.cluster.local:8000`, the functions reach Kestra at
  `kestra.kestra.svc.cluster.local:8080`.
- **Runtime/cross-system state must be repointed, not just the manifests.** The
  live pg_net webhook triggers inside `supabase-db` must be repointed to the
  `kong.supabase-app` FQDN via a NEW forward migration (editing migration files
  is a no-op on an existing DB); the Gitea-synced Kestra PodCreate
  `namespace: iotgw` and the Kestra KV `COSMIAN_KMS_URL`/`SUPABASE_URL` live in
  the iotgw-kestra repo / the Kestra DB, not in `deploy/k8s`, so they are edited
  at the source and re-synced/re-seeded.
- **NodePorts co-locate with their pods.** A NodePort selects Endpoints only in
  its own namespace, so each NodePort moves into its target namespace; the kind
  `cluster.yaml` host-port mappings are unchanged.
- **TLS secret replication.** The wildcard `iotgw-wildcard-tls` Secret must exist
  in every Ingress namespace (an Ingress can only use a TLS Secret in its own
  namespace) — `supabase-app` (kong) and `iotgw-ui` (frontend+backend).
- **Secrets fan out per namespace.** `supabase-env` is created in `supabase-app`
  AND `iotgw-ui`; `kestra-env` in `kestra` AND `iotgw-ui`; `supabase-db-initdb`
  in `supabase-db`; `kms-auth` in `iotgw-ui`.
- **Cutover ordering / rollback.** Namespaces + the cross-namespace NetworkPolicy
  exist before the KMS smoke; the old `iotgw` namespace is deleted LAST, after
  every workload is confirmed Running elsewhere.
- Tracked as milestone **Namespace-per-subproject split** (`task-064`). Reference
  pattern: `decision-019` / [[doc-017]]. KMS hardening: `decision-015`,
  `task-057`. Supersedes the single-namespace assumption in `decision-015`.
