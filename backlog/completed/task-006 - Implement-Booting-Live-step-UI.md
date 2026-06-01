---
id: task-006
title: Implement Booting Live step UI
status: Done
assignee: []
created_date: '2025-11-26 06:28'
updated_date: '2025-11-27 05:26'
labels:
  - frontend
  - deployments
dependencies:
  - task-005
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the first deployment step with instructions for USB boot preparation, credentials display (reusing TOTP logic from DeviceTOTPDialog), and USB image download link.

Reference: doc-011 (Deployment Section Redesign specification)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Instruction text block displays USB preparation steps
- [x] #2 Username format shows as device_name@network_id[:8]
- [x] #3 TOTP password display reuses existing DeviceTOTPDialog logic inline
- [x] #4 USB boot image download link is displayed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review DeviceTOTPDialog component to understand TOTP logic
2. Create BootingLiveStep component in deployment-steps folder
3. Add instructions text block with USB preparation steps
4. Add credentials section with username (device_name@network_id[:8]) and TOTP password
5. Integrate TOTP generation/display logic from DeviceTOTPDialog
6. Add USB boot image download link
7. Add translations for all new text (en.json, es.json)
8. Integrate component into deployments page replacing placeholder
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created:
- `apps/app/src/components/deployment-steps/booting-live-step.tsx` - Full implementation with:
  - USB Boot Preparation instructions (3-step grid layout with gradient background)
  - USB Boot Image download section with faSdCard icon (left column)
  - Device Credentials panel with faKey icon (right column)
  - Username format: device_name@network_id[:8]
  - TOTP password display with progress bar and regenerate button
  - Copy-to-clipboard for both username and password
  - FontAwesome icons for each section header (faListOl, faSdCard, faKey)

Layout structure:
- Full-width "USB Boot Preparation" pane at top with 3-column step cards
- Two-column layout below: USB Boot Image (left) + Device Credentials (right)

Modified:
- `apps/app/src/routes/deployments/index.tsx` - Replaced placeholder with BootingLiveStep component, passing device data
- `apps/app/src/i18n/locales/en.json` - Added 18 new translation keys for step UI
- `apps/app/src/i18n/locales/es.json` - Added Spanish translations
<!-- SECTION:NOTES:END -->
