---
id: TASK-064.14
title: >-
  Update all docs, runbooks, CLAUDE.md Service Ports tables, and memory for the
  per-namespace layout
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - docs
  - runbook
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
  - TASK-064.04
  - TASK-064.05
  - TASK-064.06
  - TASK-064.07
  - TASK-064.08
  - TASK-064.09
  - TASK-064.10
  - TASK-064.11
modified_files:
  - CLAUDE.md
  - README.md
  - deploy/README.md
  - supabase/CLAUDE.md
  - kms/CLAUDE.md
  - kestra/CLAUDE.md
  - deploy/k8s/base/supabase-db-stackgres/CUTOVER.md
  - backlog/docs/netmaker-credential-handling.md
parent_task_id: TASK-064
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the root CLAUDE.md Service Ports table into per-namespace sections + FQDN conventions; README.md:47 status comment; deploy/README.md:53; supabase/CLAUDE.md (app tier ns iotgw->supabase-app, the ~15 `-n iotgw` commands -> supabase-app/supabase-db, the POSTGRES_HOST note); supabase/volumes/functions/CLAUDE.md and kestra-dispatch/CLAUDE.md FQDNs; kms/CLAUDE.md:54 (-n kms); kestra/CLAUDE.md:5 (-n kestra); deploy/k8s/base/supabase-db-stackgres/CUTOVER.md (-n supabase-db); backlog/docs/netmaker-credential-handling.md (supabase-env ns + functions rollout ns); doc-010 (psql exec -n supabase-db); doc-017 validation namespaces; task-057 NetworkPolicy notes (cross-ns); and the user memory MEMORY.md namespace references. Keep the Keycloak realm `iotgw` references unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root CLAUDE.md Service Ports table is reorganized per namespace with the FQDN convention documented
- [x] #2 Every subproject CLAUDE.md/runbook `kubectl -n iotgw ...` is updated to the correct per-tier namespace (supabase-app/supabase-db/kestra/kms/iotgw-ui)
- [x] #3 doc-017, task-057, netmaker-credential-handling, doc-010, and CUTOVER.md reflect the split; Keycloak `iotgw` realm mentions are untouched
- [x] #4 Memory MEMORY.md notes the new topology
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Systematically bulk-update the cataloged doc locations from the findings; preserve cluster/realm `iotgw` names; cross-link decision-020.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Docs sweep (2 agents): 14 core docs (root+subproject CLAUDE.md Service Ports per-namespace, deploy/README, cluster.yaml, kms/kestra/supabase CLAUDE.md, CUTOVER.md, doc-010/doc-017, netmaker-credential-handling) + 8 supabase/.claude/skills files (92 `-n iotgw` flags) updated to per-ns + FQDNs; whoami removed; cluster/context/realm/iotgw-ng preserved. git grep confirms only cluster/realm iotgw remain.
<!-- SECTION:NOTES:END -->
