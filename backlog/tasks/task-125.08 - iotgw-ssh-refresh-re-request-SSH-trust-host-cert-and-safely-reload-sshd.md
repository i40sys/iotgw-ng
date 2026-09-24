---
id: TASK-125.08
title: 'iotgw ssh refresh: re-request SSH trust + host cert and safely reload sshd'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 08:37'
labels:
  - live-image
  - openwrt
  - ssh-ca
dependencies:
  - TASK-125.03
parent_task_id: TASK-125
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §6.** Client of `ssh-ca` / pki-manager (no PKI on the device).

1. re-request trust and the host certificate (`enroll` with the task-075 continuity signature from the current host key);
2. write files; `sshd -t`; prefer **reload**, fall back to restart;
3. verify sshd serves `TrustedUserCAKeys` + `HostCertificate`; roll back on failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ssh refresh renews the host certificate on an enrolled gateway
- [ ] #2 Trust/principal changes are applied
- [ ] #3 A config that fails sshd -t or verification is rolled back and sshd stays up
<!-- AC:END -->
