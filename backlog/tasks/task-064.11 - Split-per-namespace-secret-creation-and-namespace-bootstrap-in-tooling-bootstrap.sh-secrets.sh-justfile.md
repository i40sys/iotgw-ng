---
id: TASK-064.11
title: >-
  Split per-namespace secret creation and namespace bootstrap in tooling
  (bootstrap.sh / secrets.sh / justfile)
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - tooling
  - secret
  - bootstrap
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
  - TASK-064.04
modified_files:
  - deploy/kind/bootstrap.sh
  - tools/secrets.sh
  - justfile
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refactor deploy/kind/bootstrap.sh to: create all 5 namespaces up front (and label them consistently per the decision-020 convention so namespaceSelectors match); fan out secrets to the right namespace(s) — supabase-env into supabase-app AND iotgw-ui; kestra-env into kestra AND iotgw-ui; supabase-db-initdb into supabase-db; kms-auth into iotgw-ui; the wildcard TLS into supabase-app AND iotgw-ui. Replace the single NS=iotgw variable/`kubectl -n $NS` pattern with per-tier namespace routing (the StackGres queries to supabase-db, rollout restarts to supabase-app, KMS/backend to kms/iotgw-ui). Fix the embedded cross-namespace short name in the bootstrap KMS smoke exec (cosmian-kms:9998 -> cosmian-kms.kms.svc.cluster.local:9998 from the iotgw-ui-backend pod). Confirm secrets.sh `k8s <name> <ns> <secret>` ns arg is threaded per call.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bootstrap.sh creates kestra/kms/supabase-db/supabase-app/iotgw-ui (with the agreed labels) before applying workloads
- [x] #2 Each secret is created in every namespace that consumes it (supabase-env x2, kestra-env x2, supabase-db-initdb, kms-auth, TLS x2)
- [x] #3 No remaining `-n iotgw` or NS=iotgw in bootstrap.sh; StackGres/app/KMS commands target the correct namespaces
- [x] #4 The bootstrap KMS smoke exec URL is the cosmian-kms.kms FQDN and runs from the iotgw-ui-backend pod in iotgw-ui
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Introduce NS_* vars; reorder to create namespaces+labels first; duplicate the two-home secrets; route every kubectl/exec to the right ns; fix the embedded smoke URL.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bootstrap.sh rewritten: per-ns vars, ensure_namespaces (create+label), secret fan-out (supabase-env x2 in supabase-app+iotgw-ui, kestra-env x2 in kestra+iotgw-ui, supabase-db-initdb->supabase-db, kms-auth->iotgw-ui), StackGres/migrate/smoke routed per-ns, smoke KMS exec uses cosmian-kms.kms FQDN. Live: `bootstrap.sh secrets` placed every secret in the right namespace(s).
<!-- SECTION:NOTES:END -->
