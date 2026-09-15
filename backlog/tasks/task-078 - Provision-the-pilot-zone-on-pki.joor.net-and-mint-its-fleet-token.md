---
id: TASK-078
title: Provision the pilot zone on pki.joor.net and mint its fleet token
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - pki-manager
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 0 against the live instance, for a single non-production pilot zone (user-approved scope: one pilot zone only; the default zone is not touched). Create the zone, its User CA and Host CA, the iotgw-admin and iotgw-ops principals, and a fleet token scoped to the Host CA with op-set sign-host,register-host-pubkey,get-principals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /api/v1/ssh/zones lists the pilot zone and GET /api/v1/ssh/cas shows exactly one active user CA and one active host CA in it
- [x] #2 The two principals exist in the pilot zone
- [x] #3 The fleet token is stored SOPS-encrypted in secrets/ and never appears in tracked plaintext (just secrets-check passes)
- [x] #4 The pre-existing default zone, its CAs and its hosts are unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** Pilot zone provisioned on the live pki.joor.net.

**Created (zone `iotgw-lab`, id `5392febe-f34f-4048-8d30-041dd32031ab`):**
- User CA `iotgw-lab-users` — `515ce7b1-bc80-4fba-a882-6ca68acb0f4c`, ECDSA-P256, `SHA256:SoEpWf/BPhnax7K9kSrrzU00xou9ttvOccGPJ5u2yJs`
- Host CA `iotgw-lab-hosts` — `f3a2fbda-af32-4f83-8e02-069c485fd88c`, ECDSA-P256, `SHA256:1Fn5S99s64nIYLSYPZAvp8U8+dMQdS3U26OWP6W1MKo`
- Principals `iotgw-admin`, `iotgw-ops`
- Fleet token `pkimg_t5fEjS…` scoped to the Host CA, op-set `sign-host,register-host-pubkey,get-principals`

**Secrets:** `PKI_BASE_URL` + `PKI_FLEET_TOKENS` (JSON zone→token map) appended to `secrets/supabase.enc.env`; `secrets.sh check` passes and no `pkimg_` string appears in the ciphertext.

**Two earlier tokens were minted and revoked** (`pkimg_QCPAjs`, `pkimg_wtqNtC`) — the first because its plaintext was lost to a failed SOPS write, the second because a verification diff echoed it. Only `pkimg_t5fEjS` is active.

**Blast radius check:** the pre-existing `default` zone is untouched — its CAs, its 4 hosts and the legacy unscoped public trust routes (`/ssh/trusted-user-ca-keys`, `/ssh/host-ca-keys`, `/ssh/cert-authority`) still serve exactly what they did before.

**Side effect to be aware of:** pki.joor.net now has TWO zones, so `pki-manager`'s fail-closed zone resolution is live — any *unscoped* create/issue call now errors instead of silently picking a zone. Legacy unscoped **read** routes still serve the default zone.
<!-- SECTION:NOTES:END -->
