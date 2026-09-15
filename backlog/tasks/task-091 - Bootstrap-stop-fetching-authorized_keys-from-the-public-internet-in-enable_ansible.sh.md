---
id: TASK-091
title: >-
  Bootstrap: stop fetching authorized_keys from the public internet in
  enable_ansible.sh
status: To Do
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-15 17:42'
labels:
  - ssh-ca
  - ansible
  - bootstrap
  - security
milestone: m-1
dependencies:
  - TASK-107
  - TASK-109
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
files/enable_ansible.sh builds a freshly installed gateway's /root/.ssh/authorized_keys by wget-ing github.com/sabatligats.keys and u.joor.net/ssh-pub-key — an unauthenticated third-party trust root, fetched at install time over redirects. Replace with a vendored break-glass file in the namespace blob, and additionally install the domain's User CA anchor, auth_principals and the CA drop-in inside the chroot so the gateway accepts certificates from first boot even if provisioning never runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A freshly installed gateway has no key material that was fetched from a third-party host at install time
- [ ] #2 A freshly installed gateway accepts an iotgw-admin certificate on first boot, before any provisioning run
- [x] #3 The vendored break-glass set is attributed — every key has a known owner
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Verify on the fresh reinstall (planned).** The committed fix (enable_ansible.sh vendors files/authorized_keys = the 2 attributed break-glass keys, no public-internet fetch; d01 ships it to /tmp/authorized_keys) will be exercised by the upcoming clean reinstall test (boot live -> d01 install -> boot disk). AC#1 (no third-party-fetched key material on a fresh install) and AC#2 (accepts an iotgw-admin cert on first boot) verify then. NOTE: the current canary sshd is down (task-089 rollback bug, since fixed) — the reinstall recovers it.
<!-- SECTION:NOTES:END -->
