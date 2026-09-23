---
id: TASK-109
title: >-
  Decide and implement how a gateway consumes the vpn function's SSH trust
  bundle
status: Done
assignee: []
created_date: '2026-09-14 07:09'
updated_date: '2026-09-23 07:33'
labels:
  - ssh-ca
  - bootstrap
  - edge-function
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-024-ssh-ca-target-architecture-iotgw-ng-consumes-pki-manager-one-zone-per-domain.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `vpn` edge function now supports `?with_ssh_ca=true`, returning the domain's User CA, Host CA, `@cert-authority` line and principals inside the same TOTP-encrypted response as the WireGuard config. **Nothing consumes it.** The server half shipped without a client half, so the stated requirement — "in the process of getting the WireGuard configuration we'll also install the SSH user and host CAs" — is only half met.

**Where it would go:** the device fetches its `wg0.conf` during the install phase, and `files/setup_vpn.sh` parses that file inside the chroot to write `/etc/config/network`. That is the natural place to also drop `/etc/ssh/ssh-user-ca.pub`, `/etc/ssh/auth_principals/root` and the `60-` drop-in into the target rootfs.

**But note the overlap** with the bootstrap task that changes `enable_ansible.sh` to install the same trust material. Two paths writing the same files is worse than one. Decide which owns it:
- `enable_ansible.sh` — runs in the chroot, knows the domain only if the flow passes it;
- the `vpn` bundle — is already device-scoped and authenticated, so it knows the domain by construction, but changes the response shape for whoever fetches `wg0.conf` today.

**Blocking unknown:** who actually calls `/functions/v1/vpn` in the current flow, and whether it is a human copying a config or an automated step. That determines whether adding a query parameter is free or a breaking change for a manual runbook.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 It is established who calls the vpn endpoint today and whether adding the parameter breaks any existing runbook
- [ ] #2 Exactly one code path installs the SSH trust material during install, and the other is explicitly ruled out
- [ ] #3 A gateway that went through the install phase has the User CA anchor and auth_principals in place before its first boot
- [ ] #4 A caller that does not opt in still receives the legacy wg0.conf response unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**IMPLEMENTED 2026-09-23 as decision-031 — but NOT via the combined bundle.**

**Design changed:**
- VPN and SSH PKI are two independent APIs and boot steps: `vpn` (WireGuard only; `?with_ssh_ca=true` removed) and `ssh-ca` action `live-enroll` (trust bundle + 12 h live host cert, separate `live-…` FQDN, never writes the device row).
- The client is the live image's `iotgw-bootstrap` (live-image/, Go), not `enable_ansible.sh` / `setup_vpn.sh`.

**AC mapping:**
- #1 caller: the live image's boot script was the only caller; it is replaced.
- #2 one path: `iotgw-bootstrap` installs trust at boot; the static task-095 bake is removed from the VPN-test tree.
- #3 anchor in place: proven on gw-c3 (User CA + principals + live host cert, sshd -T verified).
- #4 legacy response: `vpn` still returns the bare wg0.conf.
<!-- SECTION:NOTES:END -->
