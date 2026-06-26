---
title: k8s Migration Epic (Decommission docker-compose)
category: synthesis
tags: [type/task, infra/kubernetes, infra/kind, data/postgres, status/current]
relationships:
  - target: "[[synthesis/docker-compose-decommission]]"
    type: implements
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/tasks/task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind.md
  - backlog/tasks/task-062.16 - SPIKE-blocking-go-no-go-prove-pg_net-Supabase-initdb-fire-on-a-StackGres-SGCluster-PG15.md
  - backlog/tasks/task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract.md
  - backlog/tasks/task-062.15 - TERMINAL-delete-all-docker-compose-files-helper-scripts-and-the-ssh-test-harness.md
  - backlog/tasks/task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner.md
  - backlog/tasks/task-055 - Re-point-pg_net-webhook-URLs-to-in-cluster-Service-for-k8s.md
  - backlog/tasks/task-056 - Adopt-supabase-kubernetes-Helm-chart-for-the-full-Supabase-data-plane.md
  - backlog/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS.md
summary: The TASK-062 milestone (18 subtasks + 054/055/056/057) that executed the docker-compose decommission — Done; what landed, the StackGres go/no-go spike, and the terminal delete.
provenance:
  extracted: 0.85
  inferred: 0.08
  ambiguous: 0.07
base_confidence: 0.75
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# k8s Migration Epic (Decommission docker-compose)

The execution record behind [[synthesis/docker-compose-decommission]]. The
**`TASK-062` milestone** (18 subtasks + the absorbed 054/055/056/057) is **Done**
— docker-compose is gone and the platform runs entirely on Kubernetes (kind
locally). All acceptance criteria green: every compose file deleted, `just
bootstrap` = `kind-up k8s-deploy k8s-smoke` with no compose reference, and `git
grep docker-compose` returns only historical ADRs with forward-notes.

## What landed

- **StackGres SGCluster DB tier** replaced the hand-rolled `supabase-db`
  StatefulSet ([[entities/stackgres]], decision-018).
- **Supabase app tier** (kong/auth/rest/meta/functions) validated on kind.
- **Kestra Ansible flows** on the k8s **PodCreate** runner — no `docker.sock`
  ([[synthesis/kestra-k8s-runner]], task-054); flows + KV in the k8s Postgres.
- **iotgw-ui** containerized + deployed on-cluster (task-062.08).
- **Cosmian KMS** API-token auth + NetworkPolicy (task-057,
  [[entities/cosmian-kms]]).
- **Edge-function → Kestra durable-execution handoff** (`kestra-dispatch`,
  decision-016 §6) e2e-validated (task-062.18, [[entities/edge-functions]]).
- **pg_net webhook re-point** to in-cluster Kong + a fire-assertion (task-055).
- `justfile`/secrets/docs **rewired k8s-first**; compose files staged then deleted
  with a recovery note (reversible cutover, task-062.12/15).

## The blocking go/no-go spike (task-062.16)

The whole milestone hinged on whether `pg_net` + the privileged Supabase initdb
survive a StackGres image. The spike on a real StackGres PG15 SGCluster in kind
returned **GO**: `pg_net` loads, `net.http_post` fires end-to-end and records a
`net._http_response`, and the initdb reproduces via an `SGScript`. This gated
decision-016 and decision-018.

## End-to-end parity (task-062.11)

A full parity run on kind was green: real device/network provision →
`netmaker-call` → job SUCCESS; Ansible flow via the k8s PodCreate runner; backend
KMS mint/fetch with auth; auth/rest/functions via Kong; `just verify` all-green.

> Reproducibility caveat (not a compose dependency): the Kestra flow/KV re-seed is
> a documented follow-up (task-062.05).

## Sources

- task-062 (epic) + .16 (spike), .18 (handoff), .15 (terminal delete); task-054/055/056/057.
- Related: [[synthesis/docker-compose-decommission]], [[entities/stackgres]], [[synthesis/kestra-k8s-runner]], [[concepts/provisioning-call-chain]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/tasks/task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind|task-062 - Epic-Decommission-docker-compose-migrate-fully-to-k8s-kind]]
- [[_sources/tasks/task-062.16 - SPIKE-blocking-go-no-go-prove-pg_net-Supabase-initdb-fire-on-a-StackGres-SGCluster-PG15|task-062.16 - SPIKE-blocking-go-no-go-prove-pg_net-Supabase-initdb-fire-on-a-StackGres-SGCluster-PG15]]
- [[_sources/tasks/task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract|task-062.18 - Define-and-implement-the-edge-function-→-Kestra-durable-execution-handoff-contract]]
- [[_sources/tasks/task-062.15 - TERMINAL-delete-all-docker-compose-files-helper-scripts-and-the-ssh-test-harness|task-062.15 - TERMINAL-delete-all-docker-compose-files-helper-scripts-and-the-ssh-test-harness]]
- [[_sources/tasks/task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner|task-054 - Migrate-Kestra-Ansible-flows-to-the-Kubernetes-task-runner]]
- [[_sources/tasks/task-055 - Re-point-pg_net-webhook-URLs-to-in-cluster-Service-for-k8s|task-055 - Re-point-pg_net-webhook-URLs-to-in-cluster-Service-for-k8s]]
- [[_sources/tasks/task-056 - Adopt-supabase-kubernetes-Helm-chart-for-the-full-Supabase-data-plane|task-056 - Adopt-supabase-kubernetes-Helm-chart-for-the-full-Supabase-data-plane]]
- [[_sources/tasks/task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS|task-057 - Add-authentication-NetworkPolicy-to-Cosmian-KMS]]
