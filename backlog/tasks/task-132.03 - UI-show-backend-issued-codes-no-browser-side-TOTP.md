---
id: TASK-132.03
title: 'UI: show backend-issued codes; no browser-side TOTP'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
labels:
  - frontend
  - security
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §2. device-totp-dialog and booting-live-step fetch the code from getDeviceCode and rotate with rotateDeviceCode; the otpauth derivation is removed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser never computes a code or sees a seed
- [ ] #2 Reset code rotates the seed and shows the new code
<!-- AC:END -->
