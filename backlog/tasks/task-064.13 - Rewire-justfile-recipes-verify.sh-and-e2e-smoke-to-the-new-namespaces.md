---
id: TASK-064.13
title: 'Rewire justfile recipes, verify.sh, and e2e/smoke to the new namespaces'
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - tooling
  - justfile
  - verify
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.11
modified_files:
  - justfile
  - tools/verify.sh
parent_task_id: TASK-064
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update operational tooling that hardcodes `-n iotgw`: justfile:63 `just status` to roll up across namespaces via the existing label (`kubectl get pods -A -l app.kubernetes.io/part-of=iotgw-ng`); tools/verify.sh:53,87-93 to `-n iotgw-ui exec deploy/iotgw-ui-backend` / `-n iotgw-ui get deploy iotgw-ui-frontend`, and the embedded KMS check URL inside the verify.sh exec from cosmian-kms:9998 -> cosmian-kms.kms.svc.cluster.local:9998. Update e2e/smoke recipes and any other `kubectl -n iotgw` usages across justfile and tools to the per-tier namespaces. Do NOT rename the kind cluster, the kind-iotgw context, or the `kind get clusters | grep -qx iotgw` check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `just status` reports pods across all platform namespaces via the part-of=iotgw-ng selector
- [x] #2 verify.sh targets iotgw-ui for the backend/frontend checks and uses the cosmian-kms.kms FQDN in its embedded KMS fetch
- [x] #3 No remaining `-n iotgw` namespace usage in justfile/tools (cluster/context `iotgw` references are deliberately preserved)
- [x] #4 e2e/smoke recipes run against the correct namespaces
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Grep justfile+tools for `-n iotgw` and the embedded short-name URL; replace per-tier; preserve cluster/context grep; keep the part-of selector for status.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
justfile `status` -> `kubectl get pods -A -l part-of=iotgw-ng`; verify.sh KMS exec -> -n iotgw-ui + cosmian-kms.kms FQDN, frontend check -> -n iotgw-ui; smoke-pgnet.sh NS default -> supabase-db. Cluster/context iotgw grep preserved. `just verify` -> ALL VERIFICATIONS PASSED.
<!-- SECTION:NOTES:END -->
