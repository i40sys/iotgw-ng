---
id: TASK-086
title: >-
  Edge functions: new ssh-ca function brokering gateway enrollment to
  pki-manager
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
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The core of the design (decision-026 phase 3). TOTP-authenticated like vpn. Two routes: 'trust' returns the device's zone trust material only; 'enroll' additionally takes the gateway's freshly generated host public key, calls POST /api/v1/external/ssh/sign-host with the per-zone fleet token and an Idempotency-Key, and returns the host certificate plus the trust bundle. Resolves device -> network -> domain -> domains.pki_zone and fails closed if unset. Writes the enrollment state back to devices. The fleet token must never be echoed to the device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A device that presents a valid TOTP and a host public key receives a host certificate signed by its domain's Host CA, plus the User CA key, the Host CA key, the auth_principals content and an sshd drop-in
- [x] #2 A device whose domain has no pki_zone is refused with a clear error and nothing is signed
- [x] #3 An invalid or replayed TOTP is refused and nothing is signed
- [x] #4 Repeating the same enrollment does not mint a new serial (Idempotency-Key honoured)
- [x] #5 No response ever contains the fleet token, a CA private key, or any private key
- [x] #6 devices gains the enrollment state (host id, fingerprint, serial, valid_before, enrolled_at) on success
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14, verified end to end against live pki.joor.net + the kind cluster.**

**What changed:**
- `supabase/volumes/functions/ssh-ca/index.ts` — the broker. TOTP-authenticated like `vpn`. `action=trust` returns public trust material only; `action=enroll` also has the gateway's host public key signed by its domain's Host CA.
- `supabase/volumes/functions/_shared/pki-manager.ts` — the pki-manager client: `signHost`, `caPublicKey`, `hostSshdConfig`. Nothing else; iotgw-ng implements no PKI.
- `deploy/k8s/base/supabase-app/functions.yaml` — `PKI_BASE_URL` + `PKI_FLEET_TOKENS` from the `supabase-env` Secret, `optional: true` so a cluster without them starts and the function answers 503 instead of CrashLooping.

**Design points worth knowing:**
- Trust anchors are read from `GET /ssh/cas/:id/ca.pub` — public and **id-addressed**, therefore inherently zone-correct. The zone-scoped routes (`/ssh/zones/:zone/...`) are SPA-shadowed on pki.joor.net and the unscoped ones serve only the `default` zone, so neither works for a per-domain zone (task-076).
- The **registered** fqdn embeds a slice of the device uuid (`<device>-<uuid8>.<network>.<domain>.iotgw`) because pki-manager's offboard is terminal and `(zone,fqdn)` is unique forever; a recreated device with the same name would otherwise be permanently un-enrollable. The human-facing names are certificate *principals* instead.
- `Idempotency-Key = <deviceId>-<sha256(pubkey)>`, so a retried enrollment returns the existing certificate instead of burning a serial.
- Host certs are issued for **90 days** (decision-028 §1), not pki-manager's 52-week default.

**Live verification (device `iot-gateway-warehouse`, domain `warehouse` → zone `iotgw-lab`):**
- AC#1 — enrollment returned a certificate whose `Signing CA` is `SHA256:1Fn5S99s…` = `iotgw-lab-hosts`, with principals `iot-gateway-warehouse-ca4d0b74.warehouse-iot.warehouse.iotgw`, `iot-gateway-warehouse.warehouse-iot.warehouse.iotgw`, `iot-gateway-warehouse.warehouse.iotgw`, `172.16.1.30`; plus the User CA key, Host CA key, `auth_principals` and the pki-manager-rendered sshd drop-in.
- AC#2 — a device in the unlinked `office` domain: `409 Domain is not linked to a pki-manager zone`, nothing signed.
- AC#3 — a bumped `totp_counter`: `401 Authentication failed`, nothing signed.
- AC#4 — second call with the same key returned serial **1** again.
- AC#5 — the response bundle carries only the certificate and public CA keys; no token, no private key.
- AC#6 — the `devices` row gained host id, fingerprint, serial, valid_before and `ssh_ca_enrolled_at`.

**Beyond the ACs**, the bundle was installed on a real `sshd` and a certificate-only login from a machine with no raw key for it succeeded, evidenced by `Accepted certificate ID "oriol@iotgw-lab" (serial 1) signed by ECDSA CA SHA256:SoEpWf… via /etc/ssh/ssh-user-ca.pub` — with no host-key prompt and no `known_hosts` entry added. Break-glass, an uncertified key, and a principal mismatch all behaved as designed.
<!-- SECTION:NOTES:END -->
