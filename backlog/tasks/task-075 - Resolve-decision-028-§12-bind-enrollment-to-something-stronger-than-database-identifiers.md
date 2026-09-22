---
id: TASK-075
title: >-
  Resolve decision-028 §12: bind enrollment to something stronger than database
  identifiers
status: Done
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-22 08:32'
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
- [x] #3 The chosen binding is reflected in decision-026 phase 3 and in the ssh-ca edge function's behaviour
- [x] #4 Re-enrollment after the first is shown to require proof of the existing host key, if proof-of-continuity is part of the chosen binding
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1/#2 were already done (decision recorded: proof-of-continuity; source-address binding dropped due to NAT). AC#3/#4 implemented + demonstrated live on branch feat/ssh-ca-continuity.

**AC#3 — reflected in the ssh-ca edge function + decision-026 phase 3:**
- Migration 20260922000000: devices.ssh_host_pubkey (full OpenSSH pubkey of the currently-enrolled host key; public material only — a fingerprint can't verify a signature). Applied live.
- supabase/volumes/functions/_shared/sshsig.ts (NEW): SSHSIG (PROTOCOL.sshsig) verifier on WebCrypto — ecdsa-sha2-nistp256 + ssh-ed25519, fail-closed. Node-tested against real ssh-keygen -Y sign output (valid→true; wrong-namespace/tampered/wrong-pubkey/garbage→false).
- ssh-ca/index.ts: DEVICE_SELECT now reads ssh_host_key_fingerprint + ssh_host_pubkey. In the enroll block, if ssh_host_pubkey is set (already enrolled) → REQUIRE request.continuity_sig, verify it via verifySshSig against the stored pubkey (namespace iotgw-reenroll, message `<device_id>\n<new host_pubkey>\n<TOTP>`), else HTTP 401. First enroll (empty pubkey) → one-shot. On success, record ssh_host_pubkey (rolls forward on re-enroll).
- decision-026 phase 3: added the proof-of-continuity note.

**AC#4 — re-enroll requires host-key proof, SHOWN (live):** tools/ssh-ca-smoke.sh (verify §7) now resets the lab device's ssh_host_pubkey, does a first enroll, then: re-enroll WITHOUT continuity_sig → asserts HTTP 401; re-enroll WITH a valid SSHSIG (signed by the container's existing host key) → asserts accepted (fresh host cert). Ran GREEN against the live edge fn:
  PASS re-enroll WITHOUT proof-of-continuity is rejected (HTTP 401)
  PASS re-enroll WITH valid proof-of-continuity is accepted (fresh host cert)
(plus the existing enroll / cert-accept / block / unblock PASSes.)

**Production client path (separate repo i40sys/iotgw-kestra, branch feat/ssh-ca-continuity):** tasks/ssh_ca.yaml now signs the continuity challenge with the EXISTING /etc/ssh/ssh_host_ecdsa_key ON THE GATEWAY (no delegate_to) when a prior cert exists, and includes continuity_sig in the enroll body (built via to_json so the armored SSHSIG is escaped). No immediate fleet breakage: existing devices have NULL ssh_host_pubkey until they enroll once under the new code (first-enroll path), after which re-enrolls carry the proof.

**Deviations/notes:** first-enroll weakness remains accepted (bench, §5) — one-time token / operator approval is the future upgrade. Key rotation (deleting the old host key) cannot prove continuity by design → offboard + re-provision. supabase-contract types NOT regenerated (ssh_host_pubkey is additive/nullable, consumed only by the edge fn's own DeviceRow type, not backend TS) — pick up in a routine regen. Deployed live to kind (migration + functions image). Branch not merged (parent decides).
<!-- SECTION:NOTES:END -->
