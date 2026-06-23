---
id: TASK-064.04
title: >-
  Rework the KMS NetworkPolicy for cross-namespace clients (AND-combined
  selectors)
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - networkpolicy
  - security
  - kms
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
modified_files:
  - deploy/k8s/base/kms/networkpolicy.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update deploy/k8s/base/kms/networkpolicy.yaml:51-67 so the three client classes are admitted across namespace boundaries. Replace the single `from:` with three OR'd in-namespace podSelectors by THREE separate `from:` entries, each a single peer object combining namespaceSelector AND podSelector (list item with both keys = logical AND): (1) ns iotgw-ui + pod app.kubernetes.io/name=iotgw-ui-backend; (2) ns kestra + pod app.kubernetes.io/name=kestra; (3) ns kestra + pod app.kubernetes.io/managed-by=kestra. Key the namespaceSelector on the guaranteed `kubernetes.io/metadata.name` label. Confirm supabase-app (functions/kong) is intentionally NOT on the allow-list. Update the policy comments for cross-namespace paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The policy has three distinct `from:` entries, each with namespaceSelector AND podSelector in the SAME peer object (no namespaceSelector floating as a separate OR'd peer)
- [x] #2 All namespaceSelectors use `kubernetes.io/metadata.name`
- [x] #3 Comments document the cross-namespace client paths and explicitly note supabase-app is not allowed
- [x] #4 Rendered policy passes `kubectl --dry-run`/kustomize build; live: backend (iotgw-ui) and kestra/runner (kestra) reach 9998 and a non-allowed pod is denied
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rewrite the ingress block carefully to avoid the AND-vs-OR widening trap; rely on the auto label key; align with T11 namespace labeling.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
KMS NetworkPolicy rewritten: 3 from-peers each AND-combining namespaceSelector(kubernetes.io/metadata.name)+podSelector. LIVE VALIDATED: backend(iotgw-ui)->KMS=HTTP200 ALLOW; kong(supabase-app)->KMS=timeout DENY; kestra managed-by=kestra pod->KMS=ALLOW.
<!-- SECTION:NOTES:END -->
