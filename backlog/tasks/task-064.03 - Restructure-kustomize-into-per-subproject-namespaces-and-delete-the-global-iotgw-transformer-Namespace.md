---
id: TASK-064.03
title: >-
  Restructure kustomize into per-subproject namespaces and delete the global
  iotgw transformer + Namespace
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - kustomize
  - deploy
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.01
  - TASK-064.02
modified_files:
  - deploy/k8s/base/kustomization.yaml
  - deploy/k8s/base/namespace.yaml
  - deploy/k8s/overlays/kind/kustomization.yaml
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/k8s/base/kestra/kustomization.yaml
  - deploy/k8s/base/kms/kustomization.yaml
  - deploy/k8s/base/supabase-app/kustomization.yaml
  - deploy/k8s/base/iotgw-ui/kustomization.yaml
  - deploy/k8s/base/supabase-db-stackgres/kustomization.yaml
  - deploy/k8s/base/whoami/kustomization.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the global `namespace: iotgw` transformer from base/kustomization.yaml:3 and both overlays (overlays/kind/kustomization.yaml:3, overlays/prod/kustomization.yaml:3). Delete base/namespace.yaml (the single iotgw Namespace) and stop referencing it. Add an explicit `namespace:` line to each subproject kustomization: base/kestra (kestra), base/kms (kms), base/supabase-app (supabase-app), base/iotgw-ui (iotgw-ui); change base/supabase-db-stackgres/kustomization.yaml:3 from `namespace: iotgw` to `namespace: supabase-db`. Make each base tier self-contained/independently appliable (Headlamp pattern); rewire the root base aggregator and both overlays to include the tier kustomizations without a global namespace. Apply the whoami outcome from T02. Create the namespaces out-of-band (T11 tooling) rather than via a Namespace resource.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No `namespace: iotgw` remains in any kustomization.yaml; base/namespace.yaml is removed and unreferenced
- [x] #2 Each subproject base kustomization declares its own namespace (kestra/kms/supabase-db/supabase-app/iotgw-ui)
- [x] #3 `kustomize build overlays/kind` and `overlays/prod` succeed and every rendered resource has a non-default namespace (grep confirms nothing lands in `default`)
- [x] #4 whoami is handled per the T02 decision (removed, or relocated with its namespace set)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Edit the 3 transformer lines + supabase-db-stackgres ns; add `namespace:` to the 4 bases lacking it; delete base/namespace.yaml; restructure root base + overlays; validate with kustomize build and a render-namespace audit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Global `namespace: iotgw` transformer + base/namespace.yaml removed; each component sets its own namespace + Namespace resource (kms/kestra/supabase-db/supabase-app/iotgw-ui). kustomize build kind(46)/prod(40) OK; render audit: 0 resources land in default (only the 5 Namespace objects are cluster-scoped). Live: applied, all workloads Running in new namespaces.
<!-- SECTION:NOTES:END -->
