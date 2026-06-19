---
id: decision-017
title: >-
  Authorize docker-compose Decommission and make Kubernetes the sole supported
  runtime
date: '2026-06-18 13:20'
status: accepted
---
## Context

`decision-013` (monorepo organization) and `decision-015` (k8s migration with
kind) framed **docker-compose and kind/k8s as co-equal, parallel dev paths**.
No accepted ADR ever mandated *removing* compose. The
`Decommission docker-compose` milestone (`TASK-062`) does exactly that — it
deletes the `supabase/`, `kestra/`, and `kms/` compose stacks (and the
`kms/ssh-test` harness) and rewires the `just` orchestrator and docs to a
k8s-only workflow. That is a **policy change**, not a mechanical cleanup, so it
needs an explicit authorizing decision; otherwise the work contradicts the
documented "parallel paths" architecture.

The platform already runs its core on kind (`decision-015`: KMS, Supabase
Postgres, Kestra, ingress validated) and the StackGres data-plane path is now
proven (`TASK-062.16` spike → GO, see `decision-018`). The remaining barrier to
a single runtime is finishing k8s parity (full Supabase app/data plane,
iotgw-ui on-cluster, Kestra k8s task runner) and then retiring compose.

## Decision

1. **Kubernetes (kind locally, the kustomize tree in `deploy/k8s` for prod) is
   the single supported runtime** for the iotgw-ng platform. The docker-compose
   stacks are deprecated and will be **deleted** as the terminal step of
   `TASK-062`.
2. **Removal is gated on validated k8s parity** — compose files are deleted only
   after all of the following hold (each owned by a milestone task):
   - Supabase app tier (kong/auth/rest/meta/functions) validated on kind against
     the StackGres SGCluster (`TASK-062.04`, `decision-018`).
   - The `pg_net` provisioning webhook fires in-cluster end-to-end
     (`TASK-055`, proven feasible by `TASK-062.16`).
   - Kestra Ansible flows run under the k8s task runner (`TASK-054`) and
     long-running work follows the edge-function → Kestra split (`decision-016`).
   - iotgw-ui (frontend + backend) runs on-cluster (`TASK-062.08`).
   - A full end-to-end parity run on kind is green (`TASK-062.11`).
   - The `just` orchestrator, `verify.sh`, secrets flow, and docs are rewired to
     k8s-only (`TASK-062.13`, `TASK-062.14`).
   - A reversible deprecation window precedes the hard delete (`TASK-062.12`).
3. **Reversibility:** compose definitions remain recoverable from git history
   (and the pre-consolidation `.git` archives in `BACKUP/`). The deprecation
   window (`TASK-062.12`) provides a fast rollback before the final deletion.
4. **`iotgw-ui` dev loop:** `pnpm dev` against an in-cluster backend remains a
   valid *local developer* convenience; what is removed is the **compose**
   orchestration of the platform services, not the local UI dev server.

This **supersedes the "co-equal parallel paths" language** in `decision-013` and
`decision-015`; both carry a forward-note pointing here (history is not
rewritten).

## Consequences

**Positive**
- One runtime to build, document, secure, and reason about; no compose/k8s
  drift; the prod path is the path exercised in CI/kind.
- Forces closure of the long-standing k8s parity gaps.

**Negative / cost**
- A real migration effort (StackGres DB, Helm/kustomize stateless tier, Kestra
  runner, iotgw-ui manifests) before any deletion is safe.
- Loss of the lightweight `docker compose up` developer ergonomics; mitigated by
  `just kind-up`/`k8s-deploy` and a fast inner loop.

**Neutral**
- Compose remains in git history; this decision can itself be revisited if the
  k8s path proves unviable (the `TASK-062.12` window is the decision point).

## References
- `decision-013` (monorepo organization), `decision-015` (k8s migration) — superseded re: parallel paths
- `decision-018` (StackGres Postgres tier), `decision-016` (edge functions)
- Milestone `TASK-062` and its tasks (esp. the terminal `TASK-062.15`)
