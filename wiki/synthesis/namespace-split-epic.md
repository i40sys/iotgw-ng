---
title: Namespace Split Epic
category: synthesis
tags: [type/task, infra/kubernetes, infra/networking, status/current]
relationships:
  - target: "[[concepts/namespace-per-subproject]]"
    type: implements
sources:
  - backlog/tasks/task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace.md
  - backlog/tasks/task-064.04 - Rework-the-KMS-NetworkPolicy-for-cross-namespace-clients-AND-combined-selectors.md
  - backlog/tasks/task-064.10 - Add-a-forward-migration-repointing-the-live-pg_net-webhook-triggers-to-the-kong-FQDN.md
  - backlog/tasks/task-064.07 - Move-rename-Kestra-RBAC-and-repoint-the-Gitea-synced-PodCreate-runner-namespace-to-kestra.md
  - backlog/tasks/task-064.15 - Terminal-end-to-end-validation-of-the-namespace-split-gated-on-all-work.md
summary: The TASK-064 milestone (15 subtasks, Done 2026-06-23) that split the single iotgw namespace into five — the live-validation evidence and the runtime-state repoints it required.
provenance:
  extracted: 0.85
  inferred: 0.08
  ambiguous: 0.07
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Namespace Split Epic

The execution record behind [[concepts/namespace-per-subproject]]. The
**`TASK-064` milestone** (15 subtasks) is **Done (2026-06-23)**: the single
`iotgw` k8s namespace was split into `kestra` / `kms` / `supabase-db` /
`supabase-app` / `iotgw-ui` (whoami dropped per the owner). `iotgw` remains the
kind **cluster** name only.

## Live-validation evidence

- `just verify` ALL PASSED post-cutover; `iotgw` namespace deleted; **0 resources
  in `default`**; cluster/context `iotgw` preserved.
- **KMS NetworkPolicy** AND-combined cross-ns selectors: backend/kestra **ALLOW**,
  supabase-app **DENY** (the negative test) (task-064.04).
- **pg_net webhook** DB (`supabase-db`) → `kong.supabase-app` → `netmaker-call`
  fires (task-064.10 — a NEW forward migration; editing the migration file alone
  is a no-op on an existing DB).
- **Backend KMS mint** over the `cosmian-kms.kms` FQDN (CreateKeyPair 200).
- **Kestra DB + KV** migrated to the `kestra` namespace with FQDN KV (task-064.07).

## Why it was more than a manifest change

The split spanned **static manifests AND runtime/cross-system state**: the KMS
NetworkPolicy (AND-combined `namespaceSelector`+`podSelector` per `from:` entry to
avoid widening SSH-key-store access), the Kestra RoleBinding + the Gitea-synced
PodCreate runner namespace, the live pg_net triggers, NodePort co-location, the
replicated wildcard TLS Secret, and per-namespace secret fan-out. Ratified by
**decision-020**.

## Follow-ups it surfaced

- **task-065** — a pre-existing `DownloadFiles`→`PodCreate` leading-slash path bug
  blocking the Ansible runner spawn ([[synthesis/kestra-k8s-runner]]).
- **task-066** — push the flow `namespace: kestra` to the Gitea source for sync
  durability ([[synthesis/kestra-k8s-runner]]).
- Incidental fix: `00-roles.sql` now **creates** `supabase_functions_admin` (was
  GRANTed-not-created). ^[inferred]

## Sources

- task-064 (epic) + .04/.07/.10/.15; ratified by decision-020.
- Related: [[concepts/namespace-per-subproject]], [[entities/cosmian-kms]], [[synthesis/kestra-k8s-runner]], [[references/service-ports-and-namespaces]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/tasks/task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace|task-064 - Epic-Namespace-per-subproject-split-iotgw-becomes-the-cluster-not-a-namespace]]
- [[_sources/tasks/task-064.04 - Rework-the-KMS-NetworkPolicy-for-cross-namespace-clients-AND-combined-selectors|task-064.04 - Rework-the-KMS-NetworkPolicy-for-cross-namespace-clients-AND-combined-selectors]]
- [[_sources/tasks/task-064.10 - Add-a-forward-migration-repointing-the-live-pg_net-webhook-triggers-to-the-kong-FQDN|task-064.10 - Add-a-forward-migration-repointing-the-live-pg_net-webhook-triggers-to-the-kong-FQDN]]
- [[_sources/tasks/task-064.07 - Move-rename-Kestra-RBAC-and-repoint-the-Gitea-synced-PodCreate-runner-namespace-to-kestra|task-064.07 - Move-rename-Kestra-RBAC-and-repoint-the-Gitea-synced-PodCreate-runner-namespace-to-kestra]]
- [[_sources/tasks/task-064.15 - Terminal-end-to-end-validation-of-the-namespace-split-gated-on-all-work|task-064.15 - Terminal-end-to-end-validation-of-the-namespace-split-gated-on-all-work]]
