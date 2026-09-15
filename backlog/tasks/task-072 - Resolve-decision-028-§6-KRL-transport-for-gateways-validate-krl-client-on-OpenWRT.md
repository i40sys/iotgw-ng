---
id: TASK-072
title: >-
  Resolve decision-028 §6: KRL transport for gateways (validate krl-client on
  OpenWRT)
status: In Progress
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-15 05:06'
labels:
  - ssh-ca
  - decision
  - openwrt
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
decision-028 §6 leaves the KRL delivery channel open. This is the difference between "we can revoke a compromised operator today" and "we wait for a certificate to expire".

**Option A — `krl-client` + ECIES** (what the ssh-cert-test lab proves): encrypted per-host KRL, Host-CA-signed, anti-rollback, verified before install, and no credential on the device. Requires a Go static binary on the gateway and an **ecdsa-P256** host key — which is why `decision-024` already mandates ecdsa host keys, so that door is kept open.
**Option B — public bare KRL over cron**: a `wget` and an atomic install. Integrity rests on TLS plus `0444` root-owned perms. Per-host blocks need `SSH_HOST_KRL_PUBLIC=true`, which leaks per-host deny intel unauthenticated.
**Option C — broker through the `ssh-ca` edge function**: no new gateway egress, consistent with the rest of the design, but the broker cannot decrypt an ECIES payload (only the host can), so it would proxy opaque bytes. Unproven.

**Concrete work:** build it (`cd pki-manager/krl-client && make build-static`) and run it on an OpenWRT 23.05 x86-64 target. The specific risk is glibc vs musl — a Go static binary should be fine, but "should" is why this is a task. Record the binary size: gateways have limited flash, and `du -h` of the installed image against free space is part of the answer.

**If A fails on OpenWRT**, B is the fallback and the `SSH_HOST_KRL_PUBLIC` exposure has to be weighed explicitly rather than defaulted into.

**Note:** whichever is chosen, `RevokedKeys` must point at a file that exists or sshd refuses to start — the empty-file step in `tasks/ssh_ca.yaml` is load-bearing and must stay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 krl-client is shown to run or not run on OpenWRT 23.05 x86-64, with the binary size and the gateway's free flash recorded
- [x] #2 decision-028 §6 names the chosen transport and its status flips to DECIDED
- [ ] #3 A revocation is observed to actually deny a login on a gateway, and the un-revocation to restore it
- [ ] #4 If the public-KRL path is chosen, the SSH_HOST_KRL_PUBLIC exposure is explicitly accepted in writing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §6):** KRL transport = krl-client + ECIES (brokered or direct); ecdsa-P256 host keys mandated. §6 → DECIDED. Open (code/evidence): AC#1 run krl-client on OpenWRT 23.05 x86-64 + footprint; AC#3 observe a real revoke/un-revoke; broker fallback if the binary cannot run.
<!-- SECTION:NOTES:END -->
