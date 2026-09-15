---
id: TASK-084
title: >-
  Backend: expose SSH certificate status, forced re-enrollment, and
  offboard-on-delete
status: To Do
assignee: []
created_date: '2026-09-14 05:29'
labels:
  - ssh-ca
  - backend
milestone: m-1
dependencies: []
references:
  - "backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md"
  - "backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md"
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tRPC surface for the new devices columns: a getSshCertStatus query and an enrollSshCa mutation (force re-enroll). Device deletion additionally calls pki-manager offboard-host. Note decision-028 §10: offboard is TERMINAL and the (zone,fqdn) pair can never be re-registered, so the FQDN derivation must tolerate a device name being reused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The UI can show, per device, whether it is enrolled and when its host certificate expires
- [ ] #2 Deleting a device offboards its pki-manager host, and the terminal nature of that is surfaced in the confirmation
- [ ] #3 Re-creating a device with a previously used name still enrolls successfully
- [ ] #4 No procedure ever returns private key material
<!-- AC:END -->
