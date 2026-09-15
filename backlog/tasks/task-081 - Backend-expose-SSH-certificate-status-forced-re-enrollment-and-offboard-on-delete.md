---
id: TASK-081
title: >-
  Backend: expose SSH certificate status, forced re-enrollment, and
  offboard-on-delete
status: To Do
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 The UI shows, per device, whether it is enrolled and when its host certificate expires
- [ ] #2 enrollSshCa has one unambiguous meaning, documented, and it works
- [ ] #3 Deleting a device offboards its pki-manager host, and the confirmation says that this is irreversible
- [ ] #4 Deleting and re-creating a device with the same name, in the same network and domain, enrolls successfully — demonstrated, not assumed
- [ ] #5 No procedure returns private key material
<!-- AC:END -->
