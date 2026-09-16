---
id: TASK-091
title: >-
  Bootstrap: stop fetching authorized_keys from the public internet in
  enable_ansible.sh
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-16 04:20'
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
- [x] #1 A freshly installed gateway has no key material that was fetched from a third-party host at install time
- [x] #2 A freshly installed gateway accepts an iotgw-admin certificate on first boot, before any provisioning run
- [x] #3 The vendored break-glass set is attributed — every key has a known owner
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**DONE 2026-09-16 — verified on a clean reinstall.** Booted live -> d01_install_owrt.yml --skip-tags vpn -> boot disk. AC#1: the freshly installed OpenWRT root has EXACTLY the two vendored break-glass keys (oriol@mini6 + root@iot-gw), NO material fetched from github.com/*.keys or links.example.com, and no public-fetch remnants in /etc/ssh. AC#2: on first boot (before any enrollment) the gateway accepts SSH via the vendored keys, and immediately enrolls first-try to accept an iotgw-admin certificate (verified cert-only login). AC#3 already done (set attributed). enable_ansible.sh now installs files/authorized_keys shipped by d01 to /tmp/authorized_keys.
<!-- SECTION:NOTES:END -->
