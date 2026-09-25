---
id: TASK-132.06
title: >-
  Kestra/Ansible: first SSH enrollment via a backend-issued code; renewals via
  the agent; no derived codes
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
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
- [ ] #1 No flow derives a TOTP
- [ ] #2 A provisioning run enrolls a not-yet-enrolled gateway on hardware
<!-- AC:END -->
