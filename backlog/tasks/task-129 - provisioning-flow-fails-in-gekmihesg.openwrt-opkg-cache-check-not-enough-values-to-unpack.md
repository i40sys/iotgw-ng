---
id: TASK-129
title: >-
  provisioning flow fails in gekmihesg.openwrt (opkg cache check: not enough
  values to unpack)
status: To Do
assignee: []
created_date: '2026-09-24 15:28'
labels:
  - kestra
  - ansible
  - provisioning
dependencies: []
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
