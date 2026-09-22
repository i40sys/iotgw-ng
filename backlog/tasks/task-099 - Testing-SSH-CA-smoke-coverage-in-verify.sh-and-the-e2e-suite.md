---
id: TASK-099
title: 'Testing: SSH-CA smoke coverage in verify.sh and the e2e suite'
status: Done
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-22 06:48'
labels:
  - ssh-ca
  - testing
milestone: m-1
dependencies:
  - TASK-086
  - TASK-072
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
just verify currently covers secret hygiene, SOPS round-trip, kustomize render, ui typecheck+tests and a kind smoke. Add SSH-CA coverage: the ssh-ca edge function answers, a test device can enroll end to end against a container acting as a gateway, and a per-host block is observed to deny then an unblock to restore. Model it on ssh-cert-test/provision.sh, which already does exactly this against the live PKI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 just verify fails if the ssh-ca edge function is broken or a test device cannot enroll
- [x] #2 The suite asserts certificate acceptance from the sshd log, not merely a successful connection
- [x] #3 A block/unblock cycle is exercised and asserted
- [x] #4 No test writes to the production default zone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added tools/ssh-ca-smoke.sh, wired into tools/verify.sh as "== 7. SSH-CA smoke ==". Modeled on ~/ssh-cert-test/provision.sh but adapted to iotgw-ng's edge-function enrollment. Runs GREEN in `just verify` (all 4 checks) and is idempotent (verified back-to-back).

**Self-gating:** SKIPs cleanly (exit 0) unless kind cluster + Kong/edge-fn + pki-manager + docker + an sshd image (ssh-cert-test:latest, override SSH_CA_SMOKE_IMAGE) + krl-client are all reachable — mirrors verify.sh §6.

**What it does (one throwaway docker gateway container, ssh from host):**
1. AC#1: reuses the existing lab device iot-gateway-warehouse @ zone iotgw-lab for edge-fn AUTH (derives its live TOTP), generates an ecdsa host key in the container, and ENROLLS via POST /functions/v1/ssh-ca (action=enroll, openssl AES-256-CBC/pbkdf2/300000 envelope) → installs host cert + User CA + auth_principals + 60- drop-in. verify FAILS (nonzero) if the edge fn is broken or enrollment fails.
2. AC#2: mints an iotgw-ops user cert (backend OIDC → pki-manager /ssh/users/issue, 2h) against a dedicated smoke identity, ssh -o IdentitiesOnly with only that cert, and ASSERTS acceptance from the container's sshd -E log ("Accepted publickey ... ED25519-CERT"), not just a connection.
3. AC#3: POST /ssh/blocks {hostId, identityId} → krl-client pull in the container → login DENIED, asserted from the sshd log ("revoked by file"); then POST /ssh/blocks/unblock → pull → login RESTORED, asserted.
4. AC#4: uses the iotgw-lab LAB zone + a dedicated fixed smoke identity (iotgw-verify-smoke) for the block/unblock — never the production `default` zone, never the shared iotgw-ops identity.

**Side effects (all lab-scoped, cleaned up):** trap removes the container + best-effort unblocks the smoke identity. The edge-fn enroll writes ssh_host_* back to the iot-gateway-warehouse (lab) device row each run — accepted (lab zone, not default). Container host key cached under ~/.cache so re-runs keep a stable (zone,fqdn) pki-manager host record. No new device created (no netmaker-call).

**Green evidence (just verify §7):** PASS enrolled; PASS "Accepted publickey for root ... ED25519-CERT"; PASS block "revoked by file"; PASS unblock restores.

**Pre-existing unrelated failure noted:** verify §1 flags 3 short (12-13 char) decommissioned-secret patterns colliding with text in backlog/tasks/task-067.* incident docs — on main, not from this task.
<!-- SECTION:NOTES:END -->
