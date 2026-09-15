---
id: TASK-082
title: 'DB: record per-device SSH-CA enrollment state on devices'
status: Done
assignee: []
created_date: '2026-09-14 05:29'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - database
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migration adding devices.ssh_host_id, ssh_host_fqdn, ssh_host_key_fingerprint, ssh_host_cert_serial, ssh_host_cert_valid_before, ssh_ca_enrolled_at. These drive the migration work queue, the renewal queue and the decision-027 phase 4 gate report. No certificate body and no key material is stored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A migration adds the columns and the work-queue/renewal-queue/gate-report queries in decision-027 return sensible results
- [x] #2 No column can hold private key material, and this is stated in the column comments
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** `iotgw-ui/supabase/migrations/20260914000001_add_ssh_ca_enrollment_to_devices.sql`.

**What changed:** `devices` gains `ssh_host_id`, `ssh_host_fqdn`, `ssh_host_key_fingerprint`, `ssh_host_cert_serial`, `ssh_host_cert_valid_before`, `ssh_ca_enrolled_at`, plus two partial indexes backing the decision-027 work queue and renewal queue.

**No key material:** every column comment states that the value is a reference or a public fingerprint. The gateway's host private key never leaves the gateway and the certificate body stays in pki-manager.

**Verified live:** after a real enrollment the row reads
`ssh_host_fqdn=iot-gateway-warehouse-ca4d0b74.warehouse-iot.warehouse.iotgw`,
`ssh_host_key_fingerprint=SHA256:btvKNbX7KoQU7zyI+uFrB7jt/KTZNlZBoW3b4yapbHw` (identical to `ssh-keygen -lf` on the gateway's public key), serial 1, `valid_before=2026-12-13`, `enrolled=t`.
<!-- SECTION:NOTES:END -->
