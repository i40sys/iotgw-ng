---
id: TASK-064.12
title: Confirm StackGres SGCluster + generated-secret/initdb placement in supabase-db
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - stackgres
  - supabase-db
  - deploy
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
  - TASK-064.11
modified_files:
  - deploy/k8s/base/supabase-db-stackgres/kustomization.yaml
  - deploy/k8s/base/supabase-db-stackgres/sgcluster.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Verify the SGCluster and its bare-name CR refs (SGInstanceProfile, SGPostgresConfig, SGScript) plus the generated supabase-initdb-sql ConfigMap and the bootstrap-created supabase-db-initdb Secret all resolve in the supabase-db namespace after the T03 ns change, since StackGres resolves these in the SGCluster's own namespace. Confirm the cluster-scoped StackGres operator (in the `stackgres` ns) has no watched-namespace allowlist that would exclude supabase-db, and that the primary Service `supabase-db` is created in supabase-db so consumers' FQDN supabase-db.supabase-db.svc.cluster.local resolves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SGCluster and all CR/object refs render/apply into supabase-db with no dangling cross-namespace bare-name refs
- [x] #2 supabase-initdb-sql ConfigMap and supabase-db-initdb Secret are present in supabase-db (T11 creates the secret there)
- [x] #3 The StackGres operator reconciles the supabase-db SGCluster (no namespace allowlist blocks it) and the primary becomes healthy
- [x] #4 The primary Service is reachable at supabase-db.supabase-db.svc.cluster.local:5432
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Apply supabase-db-stackgres; check operator logs/CRs; verify initdb secret+configmap location and primary health.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SGCluster + CR refs + supabase-initdb-sql ConfigMap render/apply into supabase-db; supabase-db-initdb Secret created there. Cluster-scoped StackGres operator (ns stackgres) reconciled the cluster -> primary Ready (4/4), reachable at supabase-db.supabase-db.svc.cluster.local:5432. FIXED a latent fresh-init bug: 00-roles.sql referenced supabase_functions_admin (GRANT) without creating it -> whole role script rolled back; added the missing CREATE ROLE.
<!-- SECTION:NOTES:END -->
