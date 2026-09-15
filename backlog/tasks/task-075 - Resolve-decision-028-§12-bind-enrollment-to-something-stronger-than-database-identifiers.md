---
id: TASK-075
title: >-
  Resolve decision-028 §12: bind enrollment to something stronger than database
  identifiers
status: To Do
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-15 04:49'
labels:
  - ssh-ca
  - decision
  - security
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enrollment authenticates a gateway with the device TOTP derived from `domain_id-network_id-device_id-totp_counter` (decision-009). Those four values are **not secrets** — they appear in job tables, UI URLs and logs — yet the artefact obtained is a host certificate. Anyone who can read them can impersonate the device to the `ssh-ca` edge function.

Recommendation in decision-028 §12 was: bind to the device's WireGuard source address **and** make first enrollment one-shot (re-enrollment must present the existing host key, proving continuity).

**Evidence found 2026-09-14 that weakens the first half:** on the live gateway at 10.2.0.210, `sshd` logged inbound connections from the controller as coming from `10.2.0.47`, not the controller's own address — **there is NAT on the provisioning path**. If gateway -> Kong is NATed the same way, every gateway in a segment presents the same source address to the edge function, so address binding would attest a segment, not a device.

The proof-of-continuity half is unaffected and is the stronger of the two. Other options: a one-time enrollment token issued with the device, TPM/secure-element attestation, or manual operator approval of the first enrollment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The gateway -> Kong source address is measured on the real path (not inferred), so it is known whether address binding can attest a device at all
- [x] #2 decision-028 §12 records the chosen binding and its status flips to DECIDED
- [ ] #3 The chosen binding is reflected in decision-026 phase 3 and in the ssh-ca edge function's behaviour
- [ ] #4 Re-enrollment after the first is shown to require proof of the existing host key, if proof-of-continuity is part of the chosen binding
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision recorded 2026-09-15 (decision-028 §12).**

- Binding = **proof-of-continuity**: first enrollment one-shot; re-enrollment must present the existing host key. §12 flipped to DECIDED.
- **Source-address binding dropped** — NAT on the provisioning path (sshd saw controller as 10.2.0.47) means address attests a segment, not a device. AC#1 satisfied by that measurement (address is measurably unusable, so not trusted).
- Residual: first-enroll of a never-enrolled device still authenticates only with non-secret TOTP inputs; accepted on the isolated bench (§5 AC#4). One-time token / operator approval is the future upgrade.

AC#1/#2 done. **AC#3 (reflect in decision-026 phase 3 + ssh-ca edge fn) and AC#4 (re-enroll requires host-key proof, shown) are OPEN** — implementation carried by the ssh-ca edge function + task-089; task stays In Progress.
<!-- SECTION:NOTES:END -->
