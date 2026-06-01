---
id: task-010
title: Implement Rebooting step UI
status: Done
assignee: []
created_date: '2025-11-26 06:28'
updated_date: '2025-12-01 05:34'
labels:
  - frontend
  - deployments
dependencies:
  - task-005
  - task-007
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the third deployment step with instructions for removing USB, booting from disk, and a "Check System Online" button that reuses the same connectivity check logic from Step 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Instructions text displays USB removal and disk boot steps
- [x] #2 Check System Online button uses same connectivity check as Step 1
- [x] #3 Status indicator shows green tick or red cross with tooltips
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the Rebooting step UI (Step 3) with the following features:

1. **Created `rebooting-step.tsx` component** at `apps/app/src/components/deployment-steps/rebooting-step.tsx`
   - Three numbered instruction steps for USB removal and disk boot process
   - Reuses the same connectivity check mutation (`checkDeviceConnectivity`) from Step 1
   - Shows loading state with spinner and "Checking connectivity..." text

2. **Status indicator with tooltips**
   - Green check icon for successful connectivity
   - Red X icon for failed connectivity
   - Tooltip displays PING and ANSIBLE status (OK/FAILED) with execution ID

3. **Translations added** for both English and Spanish:
   - `rebootInstruction1`: "Remove the USB drive from the device"
   - `rebootInstruction2`: "Reboot the device and allow it to boot from the internal disk"
   - `rebootInstruction3`: "Wait for the device to come online with the newly installed system"
   - `checkSystemOnline`: "Verify System Status"
   - `checkSystemOnlineButton`: "Check System Online"

4. **Updated deployments index page** to import and use the new `RebootingStep` component instead of the placeholder text
<!-- SECTION:NOTES:END -->
