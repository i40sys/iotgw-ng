---
title: Kubernetes Migration with kind
category: concepts
tags: [infra/kubernetes, infra/kind, infra/ingress, status/current]
relationships:
  - target: "[[entities/kind]]"
    type: uses
  - target: "[[concepts/secrets-management-sops-age]]"
    type: uses
  - target: "[[synthesis/docker-compose-decommission]]"
    type: related_to
sources:
  - backlog/decisions/decision-015 - Kubernetes-Migration-with-local-kind.md
  - backlog/decisions/decision-017 - Authorize-docker-compose-Decommission-and-make-Kubernetes-the-sole-supported-runtime.md
summary: kustomize (base + kind/prod overlays) on a pinned single-node kind cluster is the sole supported runtime; secrets come from SOPS, the Postgres tier moved to StackGres.
provenance:
  extracted: 0.88
  inferred: 0.07
  ambiguous: 0.05
base_confidence: 0.75
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Kubernetes Migration with kind

The platform migrated from **5 independent docker-compose stacks** to
**Kubernetes**, deployed via **kustomize** and tested locally on **kind**.
Kubernetes is now the **sole supported runtime** (decision-017 — docker-compose
decommissioned; see [[synthesis/docker-compose-decommission]]).

## Structure (`deploy/`)

- `kind/cluster.yaml` — single-node kind, **pinned `kindest/node:v1.31.12`**.
  (kind's default v1.35 ships containerd 2.x whose symlink-escape hardening
  rejects the minimal `cosmian/kms` image with "path escapes from parent";
  v1.31 runs every platform image.)
- `kind/bootstrap.sh` — `up | secrets | deploy | smoke | down`.
- `k8s/base/` — `kms`, `supabase-db`, `kestra`, `supabase-app` (whoami was later dropped).
- `k8s/overlays/kind` — NodePorts mapped to host ports (the validated dev path).
- `k8s/overlays/prod` — base + real ingress + image registry digests.

## Mapping decisions

- **StatefulSet + PVC** for stateful tiers (KMS/SQLite, supabase-db,
  kestra-postgres); **Deployment** for stateless (kestra server, supabase app tier).
- **Init order** via readiness/liveness probes (compose healthchecks → 1:1).
- **Images pinned** (compose used `:latest`): `kestra:v1.3.22`,
  `cosmian/kms:5.20.0`, `supabase/postgres:15.8.1.085`.
- **Init SQL** → ConfigMap mounted at `/docker-entrypoint-initdb.d`.
- **Secrets** → k8s Secrets generated from `secrets/*.enc.env` via
  `secrets.sh k8s` (see [[concepts/secrets-management-sops-age]]).
- **traefik-poc PoC → an Ingress** (ingress-nginx in kind). See [[entities/ingress-nginx]].

## Validated on kind

`just kind-up && just k8s-deploy && just k8s-smoke` brings up and verifies KMS
(`:9998/version` → 5.20.0), Supabase Postgres, Kestra, ingress, and the
SOPS→Secret bridge. This proved every hard pattern: StatefulSet+PVC,
Secret-from-SOPS, init-SQL ConfigMap, NodePort host mapping, Ingress,
multi-service ordering.

## KMS hardening (task-057)

The KMS no longer runs open: it requires **Cosmian KMS 5.20 API-token auth**
(`Authorization: Bearer <token>`) and is fronted by a **NetworkPolicy** that
default-denies ingress to `:9998` except from in-namespace clients. The
`kindnet` CNI **does enforce** the policy, so the host→NodePort `/version`
smoke is blocked and falls back to an in-cluster probe. See [[entities/cosmian-kms]].

## Production path

Same repo, same secrets: swap the `kind` overlay for `prod` (image registry,
real ingress hostnames + TLS, external/HA Postgres via StackGres), and re-key
the SOPS files to a cluster/KMS age recipient (`sops updatekeys`).

## Sources

- decision-015 (k8s migration with kind), decision-017 (compose decommission authorization).
- Related: [[entities/stackgres]], [[concepts/namespace-per-subproject]], [[references/service-ports-and-namespaces]], [[skills/deploy-on-kind]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-015 - Kubernetes-Migration-with-local-kind|decision-015 - Kubernetes-Migration-with-local-kind]]
- [[_sources/decisions/decision-017 - Authorize-docker-compose-Decommission-and-make-Kubernetes-the-sole-supported-runtime|decision-017 - Authorize-docker-compose-Decommission-and-make-Kubernetes-the-sole-supported-runtime]]
