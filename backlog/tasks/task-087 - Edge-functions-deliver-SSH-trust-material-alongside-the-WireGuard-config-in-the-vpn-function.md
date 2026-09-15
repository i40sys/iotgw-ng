---
id: TASK-087
title: >-
  Edge functions: deliver SSH trust material alongside the WireGuard config in
  the vpn function
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
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
Stated requirement: 'in the process of getting wireguard configuration, we'll also install SSH user and host CAs'. Add an opt-in to the vpn function so the same TOTP-authenticated exchange can carry the trust bundle, keeping the legacy response byte-identical when the flag is absent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A vpn request that opts in receives the WireGuard config and the SSH trust material in one encrypted response
- [x] #2 A vpn request that does not opt in receives exactly the response it receives today
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** `vpn/index.ts` gained an opt-in `?with_ssh_ca=true`.

**What changed:** with the flag, the same TOTP-encrypted response carries `{wg0_conf, ssh_ca:{zone, user_ca, host_ca, cert_authority, principals, auth_principals}}` instead of the bare `wg0.conf`. This is the stated requirement that getting the WireGuard configuration also installs the SSH user and host CAs.

**Backward compatibility:** without the flag the response is byte-for-byte the legacy `wg0.conf`, so no deployed gateway changes behaviour.

**Deliberately best-effort:** if the domain has no zone or pki-manager is unreachable, the `ssh_ca` field carries an `error` string and the WireGuard config is still delivered. A PKI hiccup must never stop a device getting on the network — that is this endpoint's primary job.

**Not yet verified end to end** (no gateway currently exercises the flag); `deno check` passes and the enrollment path that shares the same `caPublicKey` code is live-verified in task-086.
<!-- SECTION:NOTES:END -->
