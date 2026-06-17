---
id: TASK-060.03
title: Rewrite generateMissingSshKey to call KMS directly (drop Kestra)
status: To Do
assignee: []
created_date: '2026-06-17 04:54'
labels:
  - ssh
  - kms
  - backend
dependencies:
  - TASK-060.01
parent_task_id: TASK-060
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the Kestra POST + 2-minute poll in generateMissingSshKey (apps/backend/src/routers/devices.ts) with a direct call to the KMS client (task-060.01). This procedure becomes the on-demand backfill / force-regenerate path for devices missing a key (or when force=true). Remove the synthetic 'stamp device_ssh_<id> without a real key' fallback. Drop the now-unused KESTRA_USER/KESTRA_PASSWORD usage from THIS procedure only (deployments + connectivity-check still use them).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 generateMissingSshKey creates/repairs the KMS key and sets ssh_key_id with no Kestra HTTP call and no polling loop
- [ ] #2 force=true regenerates the key; without force, an existing ssh_key_id is returned unchanged
- [ ] #3 apps/backend/src/routers/__tests__/sshKeyId.test.ts updated: Kestra mocks replaced with KMS mocks; all cases pass
- [ ] #4 No remaining Kestra reference in the generateMissingSshKey procedure
<!-- AC:END -->
