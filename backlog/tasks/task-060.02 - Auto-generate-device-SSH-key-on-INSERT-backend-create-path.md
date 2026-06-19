---
id: TASK-060.02
title: Auto-generate device SSH key on INSERT (backend create path)
status: Done
assignee: []
created_date: '2026-06-17 04:54'
updated_date: '2026-06-17 05:38'
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
Wire the backend so that creating a device automatically generates its SSH key in Cosmian KMS and persists ssh_key_id. Generation runs in the backend create-device procedure (devices router) right after the row insert, using the KMS client from task-060.01 — NOT via a DB trigger/edge function (we chose backend-direct).

Define failure semantics: device creation should not be silently broken if KMS is down — decide between (a) create device + surface a degraded/needs-key status, or (b) fail the create. Recommend (a) with a clear status so the on-demand backfill can recover. Keep it consistent with how the UI shows provisioning state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Creating a device via the backend results in a real Cosmian KMS ed25519 key (id device_ssh_<id>) and devices.ssh_key_id set, with no Kestra call
- [x] #2 KMS failure during create is handled gracefully (documented behavior) and recoverable via the on-demand path (task-060.03)
- [x] #3 Tests cover: device create generates+stores ssh_key_id (KMS mocked), and the KMS-failure path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
createDevice mints the KMS key after insert and persists ssh_key_id; degraded-on-failure (device still created without a key, recoverable via generateMissingSshKey). Tests assert the ssh_key_id UPDATE (column+row), the degraded path (no update on KMS failure), and the persist-failure branch.
<!-- SECTION:NOTES:END -->
