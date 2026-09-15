---
title: kind
category: entities
tags: [infra/kind, infra/kubernetes, status/current]
relationships:
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/decisions/decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing.md
  - backlog/decisions/decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod.md
summary: Kubernetes-in-Docker — the local single-node cluster (name iotgw) pinned to kindest/node:v1.31.12, where the whole platform is built and validated.
provenance:
  extracted: 0.9
  inferred: 0.05
  ambiguous: 0.05
base_confidence: 0.55
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# kind

**kind** (Kubernetes-IN-Docker) runs the local single-node cluster where the
whole platform is built, deployed and validated. Cluster name **`iotgw`**,
context `kind-iotgw` ([[concepts/namespace-per-subproject]]).

## Pinned node image

> [!warning] Pinned to v1.31.12
> The node image is **pinned to `kindest/node:v1.31.12`**. kind's default v1.35
> ships containerd 2.x whose symlink-escape hardening rejects the minimal
> `cosmian/kms` image with *"path escapes from parent"*. v1.31 runs every
> platform image. Separately, **StackGres operator v1.18.8 is broken on k8s 1.31**
> — use v1.17.4 ([[entities/stackgres]]).

## Bring-up

- `deploy/kind/cluster.yaml` defines the node + host-port mappings that reproduce
  the former compose port contract (9998/8080/5432 via NodePort, 80/443 via
  ingress-nginx).
- `deploy/kind/bootstrap.sh` — `up | secrets | deploy | smoke | down`; custom
  images are built `:local` and `kind load`-ed by default
  ([[references/container-image-cicd]]).
- `just kind-up && just k8s-deploy && just k8s-smoke` is the validated dev path
  ([[skills/deploy-on-kind]]).

## Sources

- decision-015, decision-018.
- Related: [[concepts/kubernetes-migration-kind]], [[entities/ingress-nginx]], [[skills/deploy-on-kind]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing|decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing]]
- [[_sources/decisions/decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod|decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod]]
