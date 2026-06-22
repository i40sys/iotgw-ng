---
id: TASK-062.08
title: Containerize and deploy iotgw-ui (frontend + backend) to k8s
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:32'
labels:
  - k8s
  - migration
  - iotgw-ui
  - compose-removal
dependencies:
  - TASK-062.04
  - TASK-055
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
iotgw-ui has ZERO k8s manifests and runs as host pnpm-dev processes; Dockerfiles exist at iotgw-ui/apps/{app,backend}/.docker/Dockerfile but are unused by deploy/. Author Deployments/Services/Ingress for the frontend (served build) and backend (tRPC+WS :4444), wire the backend to Kong (:8000) and Cosmian KMS via in-cluster Services, build+load the images, and add host-port/ingress exposure (cluster.yaml maps neither 5173 nor 4444 today).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deployment + Service for iotgw-ui frontend and backend under deploy/k8s/base, included in the kind overlay
- [x] #2 Backend reaches Supabase via the in-cluster Kong Service and Cosmian KMS via the in-cluster Service
- [x] #3 Frontend and backend reachable from the host (NodePort/Ingress + cluster.yaml host-port or ingress hostnames); the UI loads against the in-cluster stack
- [x] #4 Images built and kind-loaded by bootstrap.sh (no manual step)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author Deployment+Service for iotgw-ui frontend (served build) + backend (tRPC/WS :4444) under base/iotgw-ui; include in kind overlay.\n2. Wire backend to in-cluster Kong (:8000) + KMS (:9998) + Supabase service key; frontend VITE_API_URL.\n3. Expose via Ingress (no cluster recreate) + author NodePort/cluster.yaml host-ports for next kind-up.\n4. Build+kind-load images, add build_iotgw_ui to bootstrap; validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to k8s-operator, verified). New deploy/k8s/base/iotgw-ui/ (backend.yaml: Deployment iotgw-ui-backend:local + Service :4444, env SUPABASE_URL=http://kong:8000, SUPABASE_SERVICE_KEY from supabase-env, KMS_URL=http://cosmian-kms:9998, KESTRA_USER/PASSWORD from kestra-env; frontend.yaml: Deployment iotgw-ui-frontend:local + Service :80 + Ingress iotgw-ui[/-backend].wsl.ymbihq.local with WS-friendly timeouts; kustomization.yaml). Added to kind overlay + nodeports (30517->5173, 30444->4444) + cluster.yaml extraPortMappings (active next clean kind-up). bootstrap.sh build_iotgw_ui() builds+kind-loads both images, called from deploy(). Dockerfile fixes: COPY packages/supabase-contract (missing workspace dep) + VITE_API_URL ARG/ENV.

Verified live: kind overlay renders 43 objects; iotgw-ui-frontend + iotgw-ui-backend pods 1/1 Running. AC#1 met. AC#2: backend->Kong http://kong:8000 returns 401 (TCP ok, apikey expected); backend->KMS http://cosmian-kms:9998/version => '5.20.0'; backend log 'Successfully connected to Supabase' at startup. AC#3: frontend serves its build via Ingress (curl Host: iotgw-ui.wsl.ymbihq.local => Vite title; bundle has the backend tRPC URL); backend reachable via Ingress (tRPC 404). AC#4: images built+kind-loaded, bootstrap automates it.

Authored-not-validated: cluster.yaml 5173/4444 host-port mappings need a clean kind-up (can't remap host ports without recreation) — verify.sh localhost:5173/:4444 probes pass on a fresh cluster; live access is via the Ingress hostnames. KMS minting (vs mere reachability) is exercised in the 062.11 e2e.
<!-- SECTION:NOTES:END -->
