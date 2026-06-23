---
id: TASK-064.09
title: >-
  Move Ingresses into their backend namespaces and replicate the wildcard TLS
  Secret
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - ingress
  - tls
  - deploy
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
modified_files:
  - deploy/k8s/overlays/prod/ingress-prod.yaml
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/k8s/base/supabase-app/ingress-kong.yaml
  - deploy/k8s/base/iotgw-ui/frontend.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
nginx Ingress routes only to Services in its own namespace and TLS Secrets must live in the Ingress namespace. Ensure the kong Ingress is in supabase-app (short backend ref `kong`), and the iotgw-ui-frontend/backend Ingresses are in iotgw-ui (short backend refs) — these follow the T03 per-base namespaces. Update overlays/prod/ingress-prod.yaml and the overlays/prod/kustomization.yaml TLS runbook so `iotgw-wildcard-tls` is created in BOTH supabase-app AND iotgw-ui (two `kubectl create secret tls` / two secrets.sh calls), not in iotgw. Verify ingress-nginx watches all namespaces (default) so it serves Ingresses across the 5 namespaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 kong Ingress resolves in supabase-app and iotgw-ui Ingresses resolve in iotgw-ui (short backend service refs work)
- [x] #2 iotgw-wildcard-tls is provisioned into supabase-app AND iotgw-ui; the prod runbook/comments reflect both namespaces (no `-n iotgw`)
- [x] #3 TLS terminates for all three hostnames post-split
- [x] #4 ingress-nginx is confirmed cluster-wide (no --watch-namespace scoping that would drop these Ingresses)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Update the prod ingress patches + TLS creation doc; rely on per-base namespaces for the Ingress objects; check ingress-nginx watch scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per-component namespaces place each Ingress with its backend (kong->supabase-app; iotgw-ui front/back->iotgw-ui). prod TLS runbook (ingress-prod.yaml + overlays/prod) updated to create iotgw-wildcard-tls in BOTH supabase-app and iotgw-ui. prod render: all 3 Ingresses keep TLS in correct namespaces. Live: ingresses serve (frontend 200, backend 404 via host).
<!-- SECTION:NOTES:END -->
