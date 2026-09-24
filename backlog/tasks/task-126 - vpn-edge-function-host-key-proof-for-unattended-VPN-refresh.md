---
id: TASK-126
title: 'vpn edge function: host-key proof for unattended VPN refresh'
status: To Do
assignee: []
created_date: '2026-09-24 07:49'
labels:
  - vpn
  - security
  - edge-functions
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Follow-up of decision-032 / task-125.07.** Today `iotgw vpn refresh` authenticates with the device TOTP only (operator code or derived from non-secret identifiers), which is why the daemon never refreshes the VPN by itself.

**Goal:** let the `vpn` function require, for an ENROLLED device, a proof of possession of the enrolled SSH host key — the same SSHSIG continuity check `ssh-ca` does for re-enroll (task-075) — so an installed gateway could refresh its VPN unattended.

**Scope:**
- `supabase/volumes/functions/vpn`: optional `host_sig` over `<device_id>\n<TOTP>` verified against `devices.ssh_host_pubkey` (namespace e.g. `iotgw-vpn`); required once the device is enrolled.
- `iotgw vpn refresh`: send it; then decide whether the daemon may refresh on its own (e.g. after N hours without a handshake).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 vpn rejects a request for an enrolled device without a valid host-key signature
- [ ] #2 iotgw vpn refresh sends the signature and still works end-to-end
- [ ] #3 decision-032 updated with whether the daemon may refresh unattended
<!-- AC:END -->
