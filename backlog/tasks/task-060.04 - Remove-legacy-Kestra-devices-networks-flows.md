---
id: TASK-060.04
title: Remove legacy Kestra devices/networks flows
status: Done
assignee: []
created_date: '2026-06-17 04:54'
updated_date: '2026-06-17 05:38'
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
- [x] #1 Kestra namespace iotgw-ng no longer contains devices/networks (device_update/device_delete/network_update/network_delete) flows; verified via Kestra API
- [x] #2 The _files copies (kestra/data/main/iotgw-ng/_files/{device,network}_{update,delete}.yml and .v* versions) are removed and namespace files re-synced
- [ ] #3 Device+network create/update/delete still provision correctly via netmaker-call (verified end-to-end against the running stack)
- [ ] #4 install/provisioning/connectivity-check flows remain intact and runnable
- [x] #5 No tracked file contains the hardcoded Netmaker master_key from those playbooks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done by kestra-expert. Kind Kestra DB had ZERO iotgw-ng flows (only tutorial examples); external i40sys/iotgw-kestra no longer in the org. Removed the gitignored local _files legacy playbooks (device_update/delete, network_update/delete + 64 .v* copies) which carried the hardcoded master key. KEEP set intact (Flow.yaml/provisioning, i11_provisioning_iotgw.yaml, d01_install_owrt.yml, connectivity_check.yml, network_reachability.yml). AC#1 (no devices/networks flows) + AC#5 (no tracked master key) DONE; AC#2 effectively done (local removal; resync N/A). AC#3 (e2e) and AC#4 (kind-runnable, blocked by a kind Kestra basic-auth bug + pending decision-015 Docker->k8s task-runner migration) deferred to task-060.06. Netmaker master key flagged for rotation (task-060.06).
<!-- SECTION:NOTES:END -->
