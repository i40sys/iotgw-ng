---
id: TASK-104
title: Gateway-side automatic renewal of the host certificate before it expires
status: To Do
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - ansible
  - openwrt
milestone: m-1
dependencies:
  - TASK-075
  - TASK-089
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 5 specifies renewal but **nothing implements it**, and no task covered it. Without this, every enrolled gateway's host certificate silently expires 90 days after enrollment and host verification degrades fleet-wide with no warning.

**What is needed on the gateway:** a periodic job (procd/cron on OpenWRT) that checks the remaining life of `/etc/ssh/ssh_host_ecdsa_key-cert.pub` and, below a third of the window (~30 days left), re-runs the enrollment call with the **same** host key. Re-enrollment is idempotent per key, so it is a re-sign, not a re-key.

**The hard part is that renewal must work without Ansible.** `tasks/ssh_ca.yaml` makes the enrollment call from the Ansible **controller**, because that is where the domain/network/device identifiers and Kong reachability live. A gateway renewing on its own needs those identifiers locally, which means either storing them on the device (they are identifiers, not secrets — but see decision-028 §12, which is exactly about how weak they are as an authenticator) or a different credential for renewal.

**The alternative** is controller-driven renewal: a scheduled Kestra flow that walks `devices` where `ssh_host_cert_valid_before < now() + 30 days` and re-runs the `ssh_ca` tag. That needs no on-device state and no new credential, at the cost of only renewing gateways the runner can currently reach.

Pick one deliberately — this is the difference between a fleet that heals itself and one that needs a scheduled job to be healthy.

**Also unhandled:** an expired certificate. Decide what a gateway does when renewal has failed past expiry (decision-028 §8 says login is unaffected and break-glass remains, but nothing alerts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A gateway whose certificate is inside the renewal window obtains a fresh one without human action
- [ ] #2 Renewal reuses the existing host key — it is a re-sign, not a re-key, and the fingerprint is unchanged
- [ ] #3 The renewal path's identifier/credential model is written down and reconciled with decision-028 §12
- [ ] #4 A renewal failure is visible somewhere an operator looks, rather than surfacing as an expired certificate months later
- [ ] #5 A gateway offline past expiry recovers on its next contact without manual re-keying
<!-- AC:END -->
