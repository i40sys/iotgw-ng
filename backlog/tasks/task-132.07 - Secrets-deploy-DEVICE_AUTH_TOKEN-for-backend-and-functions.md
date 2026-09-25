---
id: TASK-132.07
title: 'Secrets + deploy: DEVICE_AUTH_TOKEN for backend and functions'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
labels:
  - deploy
  - secrets
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §2, decision-014. SOPS entry, bootstrap.sh Secret generation into iotgw-ui + supabase-app, env wiring in backend.yaml and functions.yaml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Token only in SOPS and k8s Secrets; kind deploy wires it into both workloads
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `DEVICE_AUTH_TOKEN` in secrets/iotgw-ui-backend.enc.env (SOPS); bootstrap.sh `gen_device_auth_secret` → `device-auth` Secret in iotgw-ui + supabase-app; backend.yaml + functions.yaml env (optional, 503 when unset); functions get `IOTGW_BACKEND_URL`. Applied to kind.
<!-- SECTION:NOTES:END -->
