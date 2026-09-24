---
id: TASK-125.11
title: 'CI: boot OpenWRT x86_64 in QEMU and test the recovery cases'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 14:37'
labels:
  - live-image
  - openwrt
  - ci
dependencies:
  - TASK-125.05
  - TASK-125.07
  - TASK-125.08
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 Consequences; decision-029 QEMU approach.**

Cases: LAN router change, lost/empty route, VPN down → fallback, breaking change → rollback, hold mode, `vpn refresh`, `ssh refresh`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CI job boots OpenWRT x86_64 with the iotgw binary
- [x] #2 The listed recovery cases pass in CI
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented.** live-image/test/qemu/run.sh + test/fakeapi; `just e2e`; CI job `e2e` in .github/workflows/live-image.yml (KVM via udev rule, VM logs uploaded on failure).

**Local result:** PASS 33 FAIL 0 (TCG, ~45 min). Cases: route repair (gw-c3 reproduced), router change, LAN→VPN fallback + return, hold, policy across a power cycle, console dashboard, vpn refresh + rollback, ssh refresh + continuity.

**Pending:** the CI run itself (after main is pushed).

**CI verified:** the live-image workflow's e2e job runs on GitHub-hosted runners with KVM (~11 min): PASS 42 FAIL 0 (run on a747d92); VM serial logs are uploaded on failure.
<!-- SECTION:NOTES:END -->
