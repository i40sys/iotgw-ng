---
title: Namespace-per-subproject Topology
category: concepts
tags: [infra/kubernetes, infra/networking, status/current]
relationships:
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: extends
sources:
  - backlog/decisions/decision-020-namespace-per-subproject-topology-iotgw-is-the-cluster-not-a-namespace.md
  - backlog/tasks/task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace.md
summary: iotgw is the kind CLUSTER name only; the platform is split into one namespace per subproject (kestra/kms/supabase-db/supabase-app/iotgw-ui), making FQDNs and NetworkPolicies load-bearing.
provenance:
  extracted: 0.9
  inferred: 0.05
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Namespace-per-subproject Topology

Since the kind migration the whole platform ran in a single `iotgw` namespace,
collapsed there by a global `namespace: iotgw` kustomize transformer. That made
`iotgw` a catch-all mixing five independent subprojects and conflated the
**cluster identity** with a namespace.

**Decision: `iotgw` is the kind CLUSTER name only — there is no `iotgw`
namespace.** The platform is split one namespace per subproject, each a
self-contained kustomization with its own `namespace:` transformer and
`Namespace` resource (the Headlamp pattern — see [[entities/headlamp]]).

| Namespace | Workloads |
|---|---|
| `kestra` | Kestra Deployment + `kestra-postgres` StatefulSet + RBAC + Ansible runner pods |
| `kms` | Cosmian KMS StatefulSet/Service + its NetworkPolicy |
| `supabase-db` | StackGres `SGCluster supabase-db` (Postgres tier) |
| `supabase-app` | kong, auth (GoTrue), rest (PostgREST), meta, functions (edge runtime) |
| `iotgw-ui` | frontend + backend |

`headlamp` and `ingress-nginx` were already isolated and untouched.

## Conventions ratified

- **Unchanged:** `iotgw` kind cluster, `kind-iotgw` context, `kind load --name
  iotgw`, the Keycloak `iotgw` realm, and the **Kestra** flow namespace
  `iotgw-ng` (a Kestra concept, not a k8s namespace). Only the k8s namespace
  named `iotgw` is removed.
- **Cross-namespace** references use the FQDN
  `service.namespace.svc.cluster.local`; **intra-namespace** stay short names.
  The load-bearing distinction is cross-namespace only — no needless FQDN churn.
- **NetworkPolicy** `namespaceSelector`s key on the auto-label
  `kubernetes.io/metadata.name`. A cross-namespace allow rule combines
  `namespaceSelector` AND `podSelector` **inside one `from:` peer object**, never
  as two OR'd peers (the latter would widen access to the SSH-key store —
  task-057, see [[concepts/ssh-key-management-kms]]).
- **whoami dropped entirely** (obsolete TLS-termination PoC).

## Consequences

- **FQDNs become load-bearing:** app tier → DB at
  `supabase-db.supabase-db.svc.cluster.local:5432`; backend → KMS at
  `cosmian-kms.kms.svc.cluster.local:9998` and Kong at
  `kong.supabase-app.svc.cluster.local:8000`; functions → Kestra at
  `kestra.kestra.svc.cluster.local:8080`.
- **Runtime state must be repointed**, not just manifests — the live pg_net
  webhook triggers and Kestra KV URLs are edited at their source and re-synced.
- **NodePorts co-locate** with their pods (a NodePort selects Endpoints only in
  its own namespace).
- **Secrets fan out per namespace** (`supabase-env` in `supabase-app` AND
  `iotgw-ui`, etc.); the wildcard TLS Secret is replicated into every Ingress
  namespace.

## Implementation status

**Done (2026-06-23)** as the `TASK-064` milestone (15 subtasks), live-validated on
kind — see [[synthesis/namespace-split-epic]] for the evidence and the
runtime-state repoints it required.

## Sources

- decision-020, task-064. Reference pattern: decision-019 / [[entities/headlamp]].
- Related: [[references/service-ports-and-namespaces]], [[concepts/kubernetes-migration-kind]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-020-namespace-per-subproject-topology-iotgw-is-the-cluster-not-a-namespace|decision-020-namespace-per-subproject-topology-iotgw-is-the-cluster-not-a-namespace]]
- [[_sources/tasks/task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace|task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace]]
