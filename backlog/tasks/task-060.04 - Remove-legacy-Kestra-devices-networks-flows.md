---
id: TASK-060.04
title: Remove legacy Kestra devices/networks flows
status: To Do
assignee: []
created_date: '2026-06-17 04:54'
labels:
  - kestra
  - cleanup
  - netmaker
dependencies:
  - TASK-060.02
  - TASK-060.03
parent_task_id: TASK-060
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once provisioning is fully on netmaker-call and SSH-key generation is on the backend→KMS path, remove the now-dead Kestra flows: device_update / device_delete / network_update / network_delete (the iotgw-ng 'devices' and 'networks' flows). They only do Netmaker provisioning (already covered by netmaker-call) and embed a hardcoded Netmaker master_key. Use the kestra-expert agent: delete from the Kestra namespace (DB) and the synced _files, run sync-namespace-files. KEEP install / provisioning / connectivity-check flows.

Note: this also closes the related cleanup intent in the task-052 epic (task-045 master-key externalization becomes moot for these files once deleted).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Kestra namespace iotgw-ng no longer contains devices/networks (device_update/device_delete/network_update/network_delete) flows; verified via Kestra API
- [ ] #2 The _files copies (kestra/data/main/iotgw-ng/_files/{device,network}_{update,delete}.yml and .v* versions) are removed and namespace files re-synced
- [ ] #3 Device+network create/update/delete still provision correctly via netmaker-call (verified end-to-end against the running stack)
- [ ] #4 install/provisioning/connectivity-check flows remain intact and runnable
- [ ] #5 No tracked file contains the hardcoded Netmaker master_key from those playbooks
<!-- AC:END -->
