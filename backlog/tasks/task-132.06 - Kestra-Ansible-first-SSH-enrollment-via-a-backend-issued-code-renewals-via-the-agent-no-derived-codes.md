---
id: TASK-132.06
title: >-
  Kestra/Ansible: first SSH enrollment via a backend-issued code; renewals via
  the agent; no derived codes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
labels:
  - kestra
  - ansible
  - ssh-ca
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §2/§5. tasks/ssh_ca.yaml: enrolled gateway → iotgw ssh refresh (renew); not enrolled → code from backend /internal/devices/enroll-code, then iotgw ssh refresh -otp. Remove the controller-side TOTP derivation and totp_counter from install/renewal flows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No flow derives a TOTP
- [x] #2 A provisioning run enrolls a not-yet-enrolled gateway on hardware
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done** (iotgw-kestra 450fba4, 74f331a; install flow rev 8, renewal flow rev 6, namespace files synced).
- `ssh_ca.yaml`: enrolled → `iotgw ssh refresh` (no code); not enrolled → backend enroll-code → code handed over in a root-only file → `iotgw ssh refresh -otp`. No TOTP derivation anywhere; totp_counter removed from flows/template.
- Gotcha fixed: the gekmihesg.openwrt module shim has no `command: argv`.
- Hardware: gw-c3 made un-enrolled (cert moved aside + Reset SSH enrollment) → provisioning exec 5Iu4rch9HalXjYSLd5lFHH (ssh_ca only) enrolled it, assert passed; re-run 4dFi4xjoL301w4iOXQSUDh took the no-code renew path; code file removed.
<!-- SECTION:NOTES:END -->
