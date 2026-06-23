---
id: TASK-064.06
title: >-
  Repoint iotgw-ui backend service references to cross-namespace FQDNs (kong,
  KMS) + backend code fallbacks
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - service-dns
  - iotgw-ui
  - backend
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
modified_files:
  - deploy/k8s/base/iotgw-ui/backend.yaml
  - iotgw-ui/apps/backend/src/routers/devices.ts
  - iotgw-ui/apps/backend/src/routers/deployments.ts
  - iotgw-ui/apps/backend/src/services/kms.ts
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Manifest: deploy/k8s/base/iotgw-ui/backend.yaml:36 SUPABASE_URL ->http://kong.supabase-app.svc.cluster.local:8000 and :43 KMS_URL ->http://cosmian-kms.kms.svc.cluster.local:9998. Backend code: update the in-cluster Kestra REST base in devices.ts (~220, ~246) and deployments.ts (~724/~742/~776) from the host hairpin http://wsl.ymbihq.local:8080 to http://kestra.kestra.svc.cluster.local:8080 (or an env var), and fix the kms.ts:18 fallback from http://wsl.ymbihq.local:9998 to http://cosmian-kms.kms.svc.cluster.local:9998 (env already set by the manifest).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backend.yaml SUPABASE_URL and KMS_URL use supabase-app/kms FQDNs
- [x] #2 devices.ts and deployments.ts no longer hardcode the host Kestra URL; they use the kestra.kestra FQDN (or env)
- [x] #3 kms.ts default fallback is the cosmian-kms.kms FQDN
- [x] #4 iotgw-ui typecheck/tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Edit manifest env + the 5 backend URL sites; prefer extracting Kestra base URL to an env var; run pnpm typecheck/tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
backend.yaml SUPABASE_URL->kong.supabase-app, KMS_URL->cosmian-kms.kms, added KESTRA_API_URL=kestra.kestra. Backend code: kms.ts fallback + devices.ts/deployments.ts Kestra base -> in-cluster FQDN via KESTRA_API_URL env. typecheck+vitest PASS. Live: backend Running, KMS auth+mint over FQDN validated (CreateKeyPair HTTP200).
<!-- SECTION:NOTES:END -->
