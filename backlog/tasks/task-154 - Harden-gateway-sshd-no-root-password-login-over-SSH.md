---
id: TASK-154
title: 'Harden gateway sshd: no root password login over SSH'
status: To Do
assignee: []
created_date: '2026-10-06 06:54'
labels:
  - ssh-ca
  - openwrt
  - security
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** files/enable_ansible.sh sets PermitRootLogin yes and the effective sshd on gw-c3 also has PasswordAuthentication yes + KbdInteractiveAuthentication yes with a root password set: anyone reaching port 22 can try root's password.

**What.** Once install-time SSH-CA enrollment lands, ship a drop-in (same /etc/ssh/sshd_config.d mechanism) with PermitRootLogin prohibit-password, PasswordAuthentication no, KbdInteractiveAuthentication no. Keep break-glass key access and the console. Follow-up of the install-time SSH-CA task; kept separate on purpose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gateways reject root password logins over SSH; certificate and break-glass key logins and the console still work
<!-- AC:END -->
