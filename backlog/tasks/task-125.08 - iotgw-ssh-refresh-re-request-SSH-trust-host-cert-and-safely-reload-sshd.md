---
id: TASK-125.08
title: 'iotgw ssh refresh: re-request SSH trust + host cert and safely reload sshd'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 11:16'
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
- [x] #1 ssh refresh renews the host certificate on an enrolled gateway
- [x] #2 Trust/principal changes are applied
- [ ] #3 A config that fails sshd -t or verification is rolled back and sshd stays up
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented.** `iotgw ssh refresh [-otp CODE] [-force]`: renew when the cert is missing / for another key / < 30 days; ssh-ca `enroll` with the task-075 continuity SSHSIG; writes the same files as tasks/ssh_ca.yaml; `sshd -t` → reload (restart fallback) → verify `sshd -T` + an SSH banner; any failure restores every file and restarts sshd.

**Verified:** QEMU e2e (`just e2e`, live-image/test/qemu/run.sh): PASS 33 FAIL 0 on two OpenWRT 23.05.4 VMs (TCG) — a certificate installed, an operator logs in with a user certificate against @cert-authority, renewal skipped while current, `-force` proves continuity.

**Pending AC#3:** the rollback path (sshd -t / verification failure) is implemented but not exercised by a test yet.

**Verified against the real ssh-ca / pki-manager on gw-c3:** a first enrollment of the fresh install (host cert `gw-c3-9a8ce31d.c3.comforsa.iotgw`, valid until 2026-12-23), then `-force` re-enroll accepted with the task-075 continuity proof. Afterwards the Kestra connectivity-check through the Netmaker host succeeded (ICMP + SSH/Ansible with the iotgw-ops certificate).
<!-- SECTION:NOTES:END -->
