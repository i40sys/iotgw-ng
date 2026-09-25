---
id: TASK-129
title: >-
  provisioning flow fails in gekmihesg.openwrt (opkg cache check: not enough
  values to unpack)
status: To Do
assignee: []
created_date: '2026-09-24 15:28'
updated_date: '2026-09-25 03:42'
labels:
  - kestra
  - ansible
  - provisioning
dependencies:
  - TASK-130
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found on gw-c3 (2026-09-24, exec 5wNrxwxdRfOiqYCdairaOC):** after install + enrollment the Kestra `provisioning` flow reaches the gateway (SSH over the Netmaker host OK) but fails in the third-party role `gekmihesg.openwrt` → `packages.yml` "check whether opkg caches need update": `not enough values to unpack (expected 4, got 2)`.

The runner is `cytopia/ansible:latest-tools` (unpinned; ansible-core 2.17 locally) and the role is installed unpinned from Galaxy at runtime — likely an ansible-core / role incompatibility. Pin both, or fix/replace the role.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The provisioning flow completes on a freshly installed gateway
- [ ] #2 The runner image and the Galaxy role are pinned
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Blocked on task-130 (2026-09-25)**
- AC#2 (pinning) is done; AC#1 (provisioning completes on a fresh gateway) is now blocked on the deployment configuration: the gw-c3 re-run (exec IeBFGp5yquThkwufsKKSp) passed the role + packages, then failed on `'primary_ntp' is undefined` because the UI only sends placeholder keys.
- task-130 defines the variable contract + JSON Schema and adds a preflight to the playbook (iotgw-kestra branch `task-130-provisioning-schema`); re-test AC#1 once that branch is merged and the UI produces a real config.
<!-- SECTION:NOTES:END -->
