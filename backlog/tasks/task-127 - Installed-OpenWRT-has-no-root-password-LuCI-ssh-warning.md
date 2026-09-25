---
id: TASK-127
title: Installed OpenWRT has no root password (LuCI/ssh warning)
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 12:50'
updated_date: '2026-09-25 17:11'
labels:
  - security
  - openwrt
  - kestra
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Found on gw-c3 (2026-09-24):** after `install`, OpenWRT has no root password — LuCI shows "No password set!" and the web UI accepts an empty password (anyone on the LAN can log in as root and reach every ubus object, including the iotgw actions).

**Decide:** set a per-device root password at install (stored where? KMS like the SSH keys) or disable password login entirely (LuCI still needs a login — so a password is needed), and whether LuCI should listen only on LAN/VPN.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A freshly installed gateway has a non-empty, per-device root password (or a documented alternative)
- [x] #2 The decision is recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision (user, 2026-09-25): option (b) — accept the gap and document it.**
- The install leaves root with an **empty password**; the provisioning `system` stack sets it from `root_password` (verified on gw-c3 after provisioning exec 16eszXuegu1PHGPYnW5rZV: `/etc/shadow` has a `$6$` hash).
- Between install and provisioning, LuCI accepts an empty root login from the LAN. Accepted; the operator provisions right after installing.
- Rejected: a per-device password minted at install and stored in KMS (option a), and keeping LuCI closed until provisioning (option c).
- Documented in `live-image/README.md` → "Installed OpenWRT gateway" (Root password).
- AC#1 is met by "a documented alternative".
<!-- SECTION:NOTES:END -->
