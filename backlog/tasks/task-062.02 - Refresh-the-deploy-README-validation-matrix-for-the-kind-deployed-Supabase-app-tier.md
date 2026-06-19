---
id: TASK-062.02
title: >-
  Refresh the deploy/README validation matrix for the StackGres-based Supabase
  data plane
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:20'
labels:
  - k8s
  - migration
  - docs
milestone: Decommission docker-compose
dependencies:
  - TASK-062.04
references:
  - >-
    backlog/decisions/decision-018 -
    Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the validation matrix to reflect the StackGres SGCluster as the DB tier (replacing the supabase-db StatefulSet, dev+prod) and the trimmed stateless set (kong/rest/functions/auth/meta; realtime/storage/imgproxy/studio/analytics/vector disabled). Correct the stale supabase-app/kustomization.yaml header. Record the dev+prod StackGres topology and the direct-primary (pooler opt-in) decision, linking the StackGres ADR. If the spike is NO-GO, keep the StatefulSet-based matrix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Matrix reflects the StackGres SGCluster (dev+prod) as the DB tier and the trimmed service set
- [x] #2 supabase-app/kustomization.yaml header corrected; disabled services noted as intentionally unused
- [x] #3 The dev+prod StackGres topology + direct-primary decision recorded in deploy/README (links the ADR)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update deploy/README validation matrix: DB tier = StackGres SGCluster (dev+prod); trimmed stateless set; honest validated vs authored-not-validated.\n2. Correct supabase-app/kustomization.yaml stale header.\n3. Record dev+prod StackGres topology + direct-primary decision, link decision-018.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (docs-only, delegated + verified). deploy/README.md: validation matrix rewritten — DB tier row is now the StackGres SGCluster supabase-db (PG 15.14, dev+prod) marked validated (with a pg_net-e2e sub-row + a StackGres operator 1.17.4 row); app tier (kong/rest/auth/meta/functions) flipped to validated (062.04); SGBackup/SGObjectStorage, StackGres HA>=2, prod edge-functions registry pull honestly marked authored-not-validated; realtime/storage/imgproxy/studio/analytics/supavisor/vector marked intentionally-not-deployed. Added a 'Postgres tier: StackGres (decision-018)' section (dev+prod topology, direct-primary/pooler-opt-in, pg_net first-boot via shared_preload_libraries, SGScript initdb, operator pin) linking decision-018. Repo-tree map + host-ports table updated; obsolete compose-only caveats removed. supabase-app/kustomization.yaml header corrected (trimmed set, validated-by-062.04, both overlays, disabled services intentionally unused). Render unaffected (kind 35 objects, prod renders).
<!-- SECTION:NOTES:END -->
