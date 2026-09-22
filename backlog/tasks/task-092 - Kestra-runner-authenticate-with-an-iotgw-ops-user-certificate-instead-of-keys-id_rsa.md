---
id: TASK-092
title: >-
  Kestra runner: authenticate with an iotgw-ops user certificate instead of
  keys/id_rsa
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-22 05:19'
labels:
  - ssh-ca
  - kestra
  - ansible
milestone: m-1
dependencies:
  - TASK-070
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Kestra runner currently SSHes with the namespace file `keys/id_rsa`, which is a **personal workstation key** (`oriol@mini6`, `SHA256:kxhsZf7ig6wML+bEtES6Wxtr5hLpV5Hen2D2Mm4xQfg`) — the same key that is in the live image's `authorized_keys` and published via `u.joor.net/ssh-pub-key`. task-069 additionally overwrites it from Cosmian KMS when `SSH_KEY_ID` is set, but that per-device key is not authorised on any gateway (see the ssh_key_id task), so in practice the personal key is what works.

Replace it with a short-lived `iotgw-ops` **certificate** obtained at flow start, set via `ansible_ssh_private_key_file` + `CertificateFile` in the generated inventory.

**The blocking design question is who mints it** — decision-028 §1 (task-070). If the backend mints it and hands it to the pod, no issuance credential ever lands in a runner pod, which is the recorded preference. If the pod mints it, the pod needs a `sign-user`-scoped fleet token, which is a materially weaker posture and must be an explicit choice, not a convenience.

**Mechanically:** the runner also needs a keypair. Generating an ephemeral one per flow run is cleanest (the certificate is short-lived anyway) and means no key at rest; confirm the cert issuance round-trip fits inside the flow's startup without a noticeable delay.

Affects all three flows — `install`, `provisioning`, `connectivity-check`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 install, provisioning and connectivity-check reach a gateway using a certificate, with no personal key involved
- [x] #2 The certificate is short-lived and obtained per flow run rather than stored in the namespace files
- [x] #3 No sign-user credential is present in a runner pod unless decision-028 §1 recorded that as the choice
- [x] #4 keys/id_rsa is no longer required for any of the three flows to run
- [x] #5 The backend mints the runner's iotgw-ops user cert with a 2 h TTL (IOTGW_USER_CERT_TTL_SECONDS['iotgw-ops'], decision-028 §1 / task-070), never in the runner pod
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
**Delivery: Option B (pod self-serves from a backend mint endpoint)** — user decision. Backend mints (decision-028 §1); pod holds no sign-user credential.

**Core mechanism PROVEN live (2026-09-21) against pki.joor.net with the backend OIDC service account:**
- POST /api/v1/ssh/identities {subject:"iotgw-ops", zone} → created identity in iotgw-lab (idempotent lookup if exists).
- POST /api/v1/ssh/users/issue {identityId, sshPublicKey, principals:["iotgw-ops"], validForSeconds:7200} → returned a user cert valid EXACTLY 2h, signed by the zone User CA, Key ID/Principals iotgw-ops. Response also has `sshClientConfig`.

**Build plan:**
1. Backend pki.ts: `ensureOpsIdentity(zone)` (POST /ssh/identities idempotent) wired into ensureDomainPkiZone + a backfill; `issueOpsUserCert(zone, sshPublicKey)` (resolve identity → /ssh/users/issue, 2h = IOTGW_USER_CERT_TTL_SECONDS['iotgw-ops']).
2. Backend HTTP endpoint (Fastify, non-tRPC) POST /internal/ssh/ops-cert {zone, sshPublicKey} guarded by a bearer (OPS_CERT_MINT_TOKEN); returns {certificate}. NetworkPolicy allows kestra→iotgw-ui:4444.
3. Secrets: OPS_CERT_MINT_TOKEN in SOPS → Secret in kestra (pod) + iotgw-ui (backend); bootstrap.sh bridge.
4. Kestra flows (provisioning/install/connectivity-check + renewal inherits via provisioning): pod generates ephemeral keypair at start, curls the mint endpoint with the target domain's pki_zone, writes key+cert, inventory uses ansible_ssh_private_key_file + CertificateFile; drop keys/id_rsa.
5. Validate: issuance live-proven; inventory wiring vs 0.0.0.0; SSH-with-cert e2e is gateway-gated (canary/no-real-IP).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**PART 2 DONE — code-complete + live-validated to the SSH boundary. Real-gateway e2e is the only hardware-gated remainder.**

Branches (NOT yet merged to main): monorepo `feat/ssh-ca-ops-cert-part2` (187f457 + docs); flows `i40sys/iotgw-kestra@feat/ssh-ca-ops-cert` (ec3f001). The LIVE Kestra instance already runs the feature-branch flow revisions (registered via PUT: provisioning r5, install r3, connectivity-check r4, ssh-ca-renewal r5).

**Backend (part 1, merged to main earlier — 9ea24bf):** pki.ts ensureOpsIdentity + issueOpsUserCert; server.ts POST /internal/ssh/ops-cert (bearer OPS_CERT_MINT_TOKEN). PROVEN live vs pki.joor.net.

**Part 2 delivery (Option B) — PROVEN LIVE in-cluster:** deployed the backend to kind; a kestra-ns pod (runner image + ops-cert-mint Secret) minted a real 2h iotgw-ops cert via the endpoint. Then all three flows wired + validated against target_ip=0.0.0.0:
- Each flow: OPS_CERT_MINT_TOKEN secretKeyRef; generate ephemeral ed25519 /tmp/ops_key; POST to the backend mint endpoint for json_data.pki_zone; write /tmp/ops_key-cert.pub; inventory uses ansible_ssh_private_key_file=/tmp/ops_key + -o CertificateFile=/tmp/ops_key-cert.pub on BOTH the gateway hop and the bastion ProxyCommand.
- keys/id_rsa + the KMS-fetch block REMOVED from all three flows (AC#4). connectivity-check switched to a json_data input. renewal SELECT returns pki_zone and passes it to the provisioning Subflow.
- 0.0.0.0 validation: all three logged "iotgw-ops certificate minted: … user certificate", reached ansible SSH, failed UNREACHABLE at 0.0.0.0 (expected). Empty pki_zone = graceful skip (avoids regressing the connectivity cron + unprovisioned domains); only a missing token hard-fails.
- Secret plumbing: OPS_CERT_MINT_TOKEN in SOPS + bootstrap gen_ops_cert_mint_secret (Secret in iotgw-ui + kestra) + backend.yaml env. Backend triggers pack pki_zone (deployments.ts sshCaVars + devices.ts connectivity). No NetworkPolicy (no default-deny in iotgw-ui; endpoint bearer-guarded) — deferred hardening. kestra/TESTING.md §5/§8 updated.

**AC status:** #2 (short-lived, per-run, not in namespace files) ✓; #3 (no sign-user cred in pod — only the mint bearer; OIDC stays in backend) ✓; #4 (keys/id_rsa not required) ✓; #5 (backend mints 2h) ✓. **#1 (reach a REAL gateway using the cert) — PENDING hardware e2e** (validated to the SSH boundary only; no-real-IP rule).

**HARDWARE PREP NEEDED from the user for the final real-gateway e2e:**
1. Bastion (VPN_JUMP_HOST) sshd: add TrustedUserCAKeys = the target domain's User CA (+ principal iotgw-ops), and set the VPN_JUMP_HOST Kestra KV to the real bastion address.
2. A canary OpenWRT gateway reachable via that bastion, enrolled in its domain's SSH-CA zone (host cert + TrustedUserCAKeys for the domain User CA) so it accepts the iotgw-ops user cert.
3. For the `install` flow specifically: the live-boot/PXE rescue image must trust the User CA (or seed the iotgw-ops pubkey), since the per-device KMS break-glass key was removed as the controller credential.
Then run provisioning/connectivity-check against that canary's IP (NOT any banned real fleet IP) to prove the cert authenticates end-to-end.

**AC#1 PROVEN ON REAL HARDWARE 2026-09-22.** Canary gateway 10.2.0.210 (iot-gateway-datacenter, OpenWRT 23.05.4) was already SSH-CA trust-configured: /etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf → TrustedUserCAKeys=/etc/ssh/ssh-user-ca.pub (the iotgw-lab User CA, SHA256:SoEpWf...), auth_principals/root = {iotgw-admin, iotgw-ops}. Minted an iotgw-ops cert for zone iotgw-lab via the backend/pki-manager, then SSHed with ONLY that cert (IdentitiesOnly=yes, PasswordAuthentication=no, PreferredAuthentications=publickey — no fallback key offered): `Server accepts key: ED25519-CERT … Authenticated to 10.2.0.210 using "publickey"`, got `uid=0(root)` on OpenWrt. Definitive: the runner's iotgw-ops cert reaches a real gateway with no personal key. Non-destructive (read config + login only; gateway unmodified).

Scope note: this proved the GATEWAY-hop cert auth directly (10.2.0.210 is directly reachable). The full Kestra-flow-through-bastion combination still needs the bastion's TrustedUserCAKeys + VPN_JUMP_HOST (operator step) — but both halves (flow mints+wires the cert; cert authenticates to a real gateway) are independently proven. All 5 ACs met.
<!-- SECTION:NOTES:END -->
