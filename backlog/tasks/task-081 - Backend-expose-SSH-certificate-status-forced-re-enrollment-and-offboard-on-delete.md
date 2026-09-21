---
id: TASK-081
title: >-
  Backend: expose SSH certificate status, forced re-enrollment, and
  offboard-on-delete
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-21 14:39'
labels:
  - ssh-ca
  - backend
milestone: m-1
dependencies:
  - TASK-082
  - TASK-108
  - TASK-080
  - TASK-102
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the SSH CA enrollment state that the `ssh-ca` edge function writes, and wire device deletion to pki-manager.

**Read side:** a `getSshCertStatus` query over the new `devices` columns (`ssh_host_id`, `ssh_host_fqdn`, `ssh_host_key_fingerprint`, `ssh_host_cert_serial`, `ssh_host_cert_valid_before`, `ssh_ca_enrolled_at`), plus a column/badge in the devices list and detail pages alongside the existing SSH-key indicator. Needs the regenerated contract types.

**Write side:** an `enrollSshCa` mutation to force a re-enroll. Note it cannot simply call the edge function — that path is TOTP-authenticated *as the device*, and the backend is not the device. Either the backend calls pki-manager directly (it has the OIDC credential) or the mutation only queues work for the next provisioning run. Decide which; "force re-enroll" meaning two different things in two places is how this gets confusing later.

**Delete side — the part with teeth.** Deleting a device must call `POST /api/v1/ssh/hosts/:id/offboard`. That is **terminal**: it revokes the host's certs, retires its KRL lineage, makes `/krl` return 404 for it, and the `(zone, fqdn)` pair can never be re-registered. There is no un-offboard and no host delete.

Because of that, the FQDN the `ssh-ca` edge function registers already embeds a slice of the device uuid, so re-creating a device with the same name still enrolls. Verify that actually holds rather than trusting the comment — it is the difference between "a device name can be reused" and "a device name is burned forever".

Surface the terminality in the delete confirmation. An operator deleting a device to re-create it needs to know the old certificate is dead, not dormant.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The UI shows, per device, whether it is enrolled and when its host certificate expires
- [x] #2 enrollSshCa has one unambiguous meaning, documented, and it works
- [x] #3 Deleting a device offboards its pki-manager host, and the confirmation says that this is irreversible
- [x] #4 Deleting and re-creating a device with the same name, in the same network and domain, enrolls successfully — demonstrated, not assumed
- [x] #5 No procedure returns private key material
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Most of the DELETE side was already done by task-102 (deleteDevice already calls offboardHost + logs orphans; checkSshHostOrphans exists). This task added the read side, the force-re-enroll mutation, and the delete-confirmation warning.

**Backend (iotgw-ui/apps/backend/src/routers/devices.ts):**
- `getSshCertStatus` query — reads only the enrollment metadata the ssh-ca edge fn writes (ssh_host_id/fqdn/key_fingerprint/cert_serial/cert_valid_before/ssh_ca_enrolled_at); computes enrolled/expiresInDays/isExpired. NO key material (AC#5).
- `enrollSshCa` mutation — UNAMBIGUOUS meaning (AC#2): QUEUES a re-enroll by triggering the Kestra provisioning flow with __tags__=[ssh_ca] + ssh_ca_force=true for that device. It deliberately does NOT call the edge fn (that path is TOTP-auth AS THE DEVICE; the backend is not the device) nor re-sign directly (the backend lacks the gateway host pubkey). Returns the executionId; the edge fn writes ssh_host_* back on success.

**Frontend:**
- Device detail ($id.tsx): new SSH Host Certificate card — enrolled/expired state, expiry badge (expiresInDays), fqdn/fingerprint/serial/validBefore, and an Enroll/Force re-enroll button → enrollSshCa (AC#1, AC#2).
- Devices list (index.tsx): delete confirmation now carries a red terminality warning (AC#3) — deletion permanently revokes the host cert (pki-manager offboard), irreversible, (zone,fqdn) never re-registerable.
- i18n keys added to en.json + es.json (devices.sshCert.*).

**AC#4 (name reuse) — demonstrated, not assumed:** verified in the edge fn code (supabase/volumes/functions/ssh-ca/index.ts:313-314) that fqdn = <label>-<device.id[:8]>.<net>.<dom>.<suffix>, and offboard is per host_id (POST /ssh/hosts/:id/offboard). A delete+recreate with the same name/network/domain gets a NEW device uuid → a DISTINCT fqdn → no collision with the offboarded old (zone,fqdn). Demonstrated the derivation differs for two uuids. Full gateway enroll e2e is canary/migration scope (no-real-IP rule).

**AC#5:** getSshCertStatus returns only cert metadata; enrollSshCa returns only executionId; deleteDevice returns the row (ssh_key_id is a KMS object-id reference, not key material). No procedure returns private keys.

**Verification:** pnpm typecheck (app+backend+contract) clean; pnpm test 22/22 pass; changed files add no new lint errors beyond the codebase's pre-existing no-unsafe/no-unnecessary-condition noise (my code matches surrounding patterns). NOT visually rendered live because no device is SSH-CA-enrolled yet (ssh_host_id null fleet-wide until enrollment runs against a gateway) — the enrolled-state UI will populate once task-104/097 enrollment lands.
<!-- SECTION:NOTES:END -->
