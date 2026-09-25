---
id: TASK-132.03
title: 'UI: show backend-issued codes; no browser-side TOTP'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
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
- [x] #1 The browser never computes a code or sees a seed
- [x] #2 Reset code rotates the seed and shows the new code
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `use-device-code` hook; device dialog + booting-live step show backend codes (validity, next-code notice); Reset code → rotateDeviceCode; `otpauth` removed.
- Deployed bundle: getDeviceCode/rotateDeviceCode present, no TOTP library, no `combinedSecret`. App tests 12/12.
<!-- SECTION:NOTES:END -->
