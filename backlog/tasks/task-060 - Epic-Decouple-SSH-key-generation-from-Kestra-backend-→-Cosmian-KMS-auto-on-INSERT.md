---
id: TASK-060
title: >-
  Epic: Decouple SSH-key generation from Kestra (backend → Cosmian KMS, auto on
  INSERT)
status: Done
assignee: []
created_date: '2026-06-17 04:53'
updated_date: '2026-06-18 05:01'
labels:
  - epic
  - ssh
  - kms
  - devices
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Relocate SSH-key *generation* off the legacy Kestra `iotgw-ng/devices` flow and onto a direct Cosmian KMS call from the iotgw-ui backend, generated automatically when a device row is created. This unblocks removing the now-redundant Kestra `devices`/`networks` flows (which only do Netmaker provisioning already covered by the `netmaker-call` edge function, and carry a hardcoded Netmaker master key).

## Background (current reality, 2026-06-17)
- `generateMissingSshKey` (apps/backend/src/routers/devices.ts) POSTs to the Kestra `iotgw-ng/devices` flow and polls it. That flow runs `device_update.yml` = pure Netmaker extclient provisioning; it does NO KMS/SSH work. The backend then stamps a synthetic `ssh_key_id = device_ssh_<id>` — no real KMS key is ever created.
- decision-010 originally placed key *generation* in the `devices` flow (never wired) and key *deployment* (export → PKCS8→OpenSSH convert → push to OpenWRT via Ansible) in the install/provisioning flows.

## Target design
- Key *generation*: backend calls Cosmian KMS directly (`cosmian kms ec keys create -t ssh-key-ed25519 --curve ed25519 device_ssh_<id>` semantics, via REST or CLI), writes `ssh_key_id`. Auto on device INSERT (backend create path); `generateMissingSshKey` remains the on-demand backfill/force-regenerate path.
- Key *deployment*: unchanged — stays in the install/provisioning Kestra flows (Ansible/SSH to the gateway).
- Remove the legacy Kestra `devices`/`networks` flows once generation+provisioning are fully off Kestra.

## References
- decision-010 (SSH key mgmt via Cosmian KMS), doc-016 (provisioning automation pattern), kms/ssh-test + kms/src/kms_tools/convert_keys.py (the KMS recipe), netmaker-call (the analogous direct-call migration).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DONE. SSH-key generation decoupled from Kestra and moved to a direct backend->Cosmian KMS path (auto on device INSERT + generateMissingSshKey backfill/force); legacy Kestra devices/networks flows removed; docs/ADR updated; verified end-to-end against the kind stack; kind Kestra basic-auth fixed. The only Netmaker-master-key item could not be a rotation (shared production service); reframed as a scoped-API-key hardening follow-up (task-061).
<!-- SECTION:NOTES:END -->
