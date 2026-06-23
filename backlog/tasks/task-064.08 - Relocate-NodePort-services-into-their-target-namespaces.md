---
id: TASK-064.08
title: Relocate NodePort services into their target namespaces
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - nodeport
  - deploy
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
modified_files:
  - deploy/k8s/overlays/kind/nodeports.yaml
  - deploy/k8s/base/kestra/kustomization.yaml
  - deploy/k8s/base/kms/kustomization.yaml
  - deploy/k8s/base/supabase-db-stackgres/kustomization.yaml
  - deploy/k8s/base/supabase-app/kustomization.yaml
  - deploy/k8s/base/iotgw-ui/kustomization.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A NodePort selects Endpoints only in its own namespace; with the global transformer gone the NodePorts would land in `default` and select zero pods, killing every host port. Split deploy/k8s/overlays/kind/nodeports.yaml so each NodePort is created alongside its target pods: kestra-nodeport->kestra, kms-nodeport->kms, supabase-db-nodeport->supabase-db, kong-nodeport->supabase-app, iotgw-ui-frontend/backend-nodeport->iotgw-ui (either explicit metadata.namespace per Service or per-namespace files wired into each base kustomization). cluster.yaml host port mappings stay valid and need no change; just document the multi-namespace selectors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each NodePort resource is created in the same namespace as the pods it selects
- [x] #2 kustomize build assigns every NodePort a non-default namespace
- [x] #3 Host ports 8000/5432/8080/9998/5173/4444 resolve to live Endpoints after apply (no dead NodePort)
- [x] #4 cluster.yaml is unchanged except documentation/comments
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add explicit namespaces (or split files) and attach each to its base; resolve the lens contradiction (NodePorts are NOT namespace-agnostic) in the cutover note.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
nodeports.yaml: each NodePort pinned to its target namespace (kestra/kms/supabase-db/supabase-app/iotgw-ui). Live: all 6 NodePorts bound, host ports 8000/8080/9998/5432 + ingress serving live Endpoints (just verify smoke green).
<!-- SECTION:NOTES:END -->
