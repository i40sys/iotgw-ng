---
id: TASK-092
title: >-
  Kestra runner: authenticate with an iotgw-ops user certificate instead of
  keys/id_rsa
status: To Do
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-21 15:08'
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
- [ ] #1 install, provisioning and connectivity-check reach a gateway using a certificate, with no personal key involved
- [ ] #2 The certificate is short-lived and obtained per flow run rather than stored in the namespace files
- [ ] #3 No sign-user credential is present in a runner pod unless decision-028 §1 recorded that as the choice
- [ ] #4 keys/id_rsa is no longer required for any of the three flows to run
- [ ] #5 The backend mints the runner's iotgw-ops user cert with a 2 h TTL (IOTGW_USER_CERT_TTL_SECONDS['iotgw-ops'], decision-028 §1 / task-070), never in the runner pod
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
**PART 1 DONE + pushed (monorepo 9ea24bf): backend minting, live-proven.**
- pki.ts: ensureOpsIdentity(zone) (wired into ensureDomainPkiZone) + issueOpsUserCert(zone, sshPublicKey) → 2 h iotgw-ops cert (IOTGW_USER_CERT_TTL_SECONDS). PROVEN live vs pki.joor.net: created iotgw-ops identity in iotgw-lab, issued cert valid exactly 2 h, signed by zone User CA, Principals iotgw-ops.
- server.ts: POST /internal/ssh/ops-cert {zone, sshPublicKey}, bearer-guarded by OPS_CERT_MINT_TOKEN (503 until set — inert, no behaviour change). Pod sends only its ephemeral pubkey; no sign-user cred in the pod (AC#3).
- typecheck clean, 22 tests pass.

**DESIGN DECISIONS (user):**
- Delivery = Option B: pod self-serves from the backend mint endpoint (uniform for all flows incl. the pure-Kestra renewal Subflow).
- Bastion hop = the bastion trusts the domain User CA (TrustedUserCAKeys), so the SAME iotgw-ops cert authenticates BOTH the bastion (ProxyCommand) AND the gateway → keys/id_rsa fully removed (AC#4 clean). Bastion-side sshd config is an OPERATOR step (flag it).

**PART 2 REMAINING:**
1. Secret: add OPS_CERT_MINT_TOKEN to SOPS (secrets/iotgw-ui-backend.enc.env). bootstrap.sh gen_ops_cert_mint_secret → `ops-cert-mint` Secret in BOTH iotgw-ui (backend env) + kestra (runner pod). backend.yaml: add OPS_CERT_MINT_TOKEN env via secretKeyRef (optional:true).
2. NetworkPolicy: allow kestra namespace → iotgw-ui backend :4444.
3. Backend triggers pack pki_zone into json_data: deployments.ts sshCaVars (select domains.pki_zone) + devices.ts connectivity trigger. Renewal flow SELECT already can add pki_zone.
4. Kestra flows (provisioning/install/connectivity-check; renewal inherits via provisioning Subflow): at pod start generate an ephemeral ed25519 keypair, curl POST the mint endpoint {zone: <pki_zone>, sshPublicKey} with Bearer OPS_CERT_MINT_TOKEN, write /tmp/ops_key + /tmp/ops-cert.pub; inventory ansible_ssh_private_key_file=/tmp/ops_key + -o CertificateFile=/tmp/ops-cert.pub for BOTH the gateway hop and the ProxyCommand bastion hop; remove keys/id_rsa. Backend URL: iotgw-ui backend service .iotgw-ui.svc.cluster.local:4444.
5. Validate: issuance live-proven; after backend redeploy (new endpoint+token+NetworkPolicy) test the endpoint + a 0.0.0.0 dummy flow reaching the mint+inventory stage; SSH-with-cert e2e is gateway-gated (canary). Delegate flow edits + live validation to kestra-expert (+ k8s-operator for the backend redeploy).

AC#5 done (backend mints 2 h). AC#1-4 land in part 2.
<!-- SECTION:NOTES:END -->
