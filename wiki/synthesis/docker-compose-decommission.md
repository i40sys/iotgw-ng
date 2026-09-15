---
title: docker-compose Decommission → k8s-only Runtime
category: synthesis
tags: [infra/kubernetes, infra/kind, data/postgres, status/current]
sources:
  - backlog/decisions/decision-017-authorize-docker-compose-decommission-and-make-kubernetes-the-sole-supported-runtime.md
  - backlog/decisions/decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod.md
  - backlog/decisions/decision-016-edge-functions-architecture-for-the-stackgres-data-plane-migration.md
  - backlog/decisions/decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing.md
  - backlog/tasks/task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind.md
relationships:
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: derived_from
summary: How the platform moved from "compose and kind as co-equal paths" to Kubernetes as the SOLE runtime — the policy decision, the parity gates, and the StackGres/edge-function/Kestra work it forced.
provenance:
  extracted: 0.85
  inferred: 0.1
  ambiguous: 0.05
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# docker-compose Decommission → k8s-only Runtime

This synthesis traces a single arc across four ADRs: the platform went from
running as **5 docker-compose stacks** to **Kubernetes as the sole supported
runtime**.

## The arc

1. **decision-015** migrated to kustomize + kind, but framed **compose and kind
   as co-equal parallel dev paths**.
2. **decision-017** is the **policy change** that retires compose: Kubernetes
   (kind locally, the `deploy/k8s` kustomize tree for prod) becomes the **single
   supported runtime**; the compose stacks are deleted as the terminal step of
   the `TASK-062` milestone.

> [!warning] Supersession
> decision-017 **supersedes the "co-equal parallel paths" language** in
> decision-013 and decision-015. Both carry forward-notes pointing to it; history
> is not rewritten.

## Removal is gated on validated k8s parity

Compose is deleted only after all hold (each milestone-owned):

- Supabase app tier validated on kind against the StackGres SGCluster.
- The `pg_net` provisioning webhook fires in-cluster end-to-end (TASK-055).
- Kestra Ansible flows run under the k8s task runner (TASK-054); long-running work
  follows the edge→Kestra split ([[entities/edge-functions]]).
- iotgw-ui (frontend + backend) runs on-cluster.
- A full e2e parity run on kind is green.
- `just`, `verify.sh`, secrets flow, and docs rewired to k8s-only.
- A reversible deprecation window precedes the hard delete.

## What it forced

- **StackGres** for the Postgres tier (decision-018) — the hand-rolled
  StatefulSet had no HA/PITR/backups/monitoring; the `pg_net`-on-StackGres spike
  returned **GO** ([[entities/stackgres]]).
- **Edge-function re-pointing** (decision-016) — the webhook URL → in-cluster
  Kong, and the direct `SUPABASE_DB_URL` → SGCluster direct primary.

**Reversibility:** compose definitions remain recoverable from git history and
the `BACKUP/` `.git` archives.

## Execution

Carried out as the **`TASK-062` milestone** (18 subtasks + 054/055/056/057),
**Done** — the per-task evidence (StackGres go/no-go spike, terminal delete, e2e
parity) is in [[synthesis/k8s-migration-epic]].

## Sources

- decision-017 (authorization), decision-018 (StackGres), decision-016 (edge
  functions), decision-015 (the migration it supersedes); task-062 (execution).
- Related: [[concepts/kubernetes-migration-kind]], [[entities/stackgres]], [[skills/deploy-on-kind]], [[synthesis/k8s-migration-epic]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-017-authorize-docker-compose-decommission-and-make-kubernetes-the-sole-supported-runtime|decision-017-authorize-docker-compose-decommission-and-make-kubernetes-the-sole-supported-runtime]]
- [[_sources/decisions/decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod|decision-018-adopt-stackgres-for-the-postgres-tier-dev-and-prod]]
- [[_sources/decisions/decision-016-edge-functions-architecture-for-the-stackgres-data-plane-migration|decision-016-edge-functions-architecture-for-the-stackgres-data-plane-migration]]
- [[_sources/decisions/decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing|decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing]]
- [[_sources/tasks/task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind|task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind]]
