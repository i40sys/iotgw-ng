---
title: Deployments & deployment_jobs — Feature History
category: synthesis
tags: [type/task, provisioning/openwrt, app/frontend, data/supabase, status/historical]
relationships:
  - target: "[[references/deployments-page-behavior]]"
    type: implements
sources:
  - backlog/archive/tasks/task-001 - Create-database-schema-for-deployments-table.md
  - backlog/archive/tasks/task-009 - Implement-deployment-execution-functionality.md
  - backlog/archive/tasks/task-010 - Create-deployment_jobs-database-table-and-migration.md
  - backlog/archive/tasks/task-019 - Add-auto-refresh-for-active-deployment-jobs.md
summary: Archived task-001..021 epic that built the deployments table, the deployment wizard execution path, and deployment_jobs tracking/auto-refresh UI — the precedent the *_jobs pattern derives from.
provenance:
  extracted: 0.8
  inferred: 0.13
  ambiguous: 0.07
base_confidence: 0.55
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: peripheral
created: 2026-06-26
updated: 2026-06-26
---

# Deployments & deployment_jobs — Feature History

An **archived** (superseded) task epic — `archive/tasks/task-001..021`, all Done.
It built the original Deployments feature: the `deployments` table, the
execution path, and the `deployment_jobs` tracking UI. Tagged
`status/historical` because the **execution/provisioning wiring evolved** into the
later `netmaker-call` / `kestra-dispatch` chains, though the page itself and the
`*_jobs` schema pattern live on.

## What it built

- **`deployments` table** (task-001): `id`, `device_id` FK (CASCADE), `name`,
  `configuration` (JSONB), `version`, RLS + a `modified_at` trigger.
- **tRPC CRUD** + the deployment form route, device-selection panel (domain/network
  filters), version list panel, Monaco JSON editor, actions panel, unsaved-changes
  detection (task-002..008).
- **Execution** (task-009): the wizard's deploy/install path → Kestra flows.
- **`deployment_jobs`** (task-010..020): the job table + RPCs + tRPC queries +
  generated types + list component + section on the deployments page + i18n +
  **auto-refresh for active jobs** + a config viewer.
- **Design coherence** sweep (task-021).

## Why it matters to the backbone

`deployment_jobs` is the **precedent** the `network_jobs` / `device_jobs` tables
were "inspired by" (the network_jobs schema task explicitly mirrors it). The
shared lifecycle (`PENDING → SUCCESS/FAILED`) and denormalized snapshot fields are
what the whole provisioning UI polls today
([[synthesis/network-crud-and-jobs-feature-history]],
[[concepts/provisioning-call-chain]]). The Deployments page behavior is specified
in [[references/deployments-page-behavior]]; under the k8s split, long-running
deployment work is handed to Kestra via `kestra-dispatch`
([[entities/edge-functions]], decision-016 §6).

## Sources

- archive/tasks/task-001..021 (deployments + deployment_jobs epic).
- Related: [[references/deployments-page-behavior]], [[synthesis/network-crud-and-jobs-feature-history]], [[entities/edge-functions]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/archive/tasks/task-001 - Create-database-schema-for-deployments-table|task-001 - Create-database-schema-for-deployments-table]]
- [[_sources/archive/tasks/task-009 - Implement-deployment-execution-functionality|task-009 - Implement-deployment-execution-functionality]]
- [[_sources/archive/tasks/task-010 - Create-deployment_jobs-database-table-and-migration|task-010 - Create-deployment_jobs-database-table-and-migration]]
- [[_sources/archive/tasks/task-019 - Add-auto-refresh-for-active-deployment-jobs|task-019 - Add-auto-refresh-for-active-deployment-jobs]]
