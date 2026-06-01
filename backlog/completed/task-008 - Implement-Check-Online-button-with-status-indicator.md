---
id: task-008
title: Implement Check Online button with status indicator
status: Done
assignee: []
created_date: '2025-11-26 06:28'
updated_date: '2025-11-27 06:09'
labels:
  - frontend
  - deployments
dependencies:
  - task-007
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the "Check Online" button to Booting Live step that calls the connectivity check backend procedure. Display green tick on success, red cross on failure, with tooltips showing ping and ansible results.

This button will be inside a transaprent pane below 'Device Credentials' pane. The title of this new pane will be 'Ensure connectivity and reachable status' with the proper awesome icon

Depends on: Backend connectivity check procedure task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Check Online button triggers connectivity check mutation
- [x] #2 Green tick icon displays on successful check with tooltip showing ping result
- [x] #3 Red cross icon displays on failed check with tooltip showing error details
- [x] #4 Tooltip shows both PING and Ansible connection results
- [x] #5 Loading state shown while check is in progress
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add Check Online button to BootingLiveStep component below Device Credentials
2. Create new pane with title 'Ensure connectivity and reachable status' with icon
3. Implement connectivity check mutation using trpc.checkDeviceConnectivity
4. Add state for tracking check results (success/failure, ping/ansible data)
5. Display green check icon on success, red X on failure
6. Add tooltips showing ping and ansible results
7. Add loading spinner while check is in progress
8. Run typecheck to verify implementation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Check Online button with connectivity status indicator in `apps/app/src/components/deployment-steps/booting-live-step.tsx`.

**Implementation details:**
- Added new "Ensure Connectivity and Reachable Status" section below Device Credentials
- Section is centered at 60% width like the credentials section
- Uses faWifi icon for section header
- "Check Online" button triggers `checkDeviceConnectivity` mutation
- Loading state shows spinner icon and "Checking connectivity..." text
- Success: Green check circle icon (faCircleCheck)
- Failure: Red X circle icon (faCircleXmark)
- Tooltip on hover shows:
  - PING result (success/failed) with latency if available
  - Raw ping output in scrollable pre block
  - Ansible result (success/failed)
  - Raw ansible output in scrollable pre block
- Toast notifications for success/failure

**Files modified:**
- `apps/app/src/components/deployment-steps/booting-live-step.tsx` - Added connectivity check mutation, state, and UI
- `apps/app/src/i18n/locales/en.json` - Added 10 new translation keys
- `apps/app/src/i18n/locales/es.json` - Added Spanish translations
<!-- SECTION:NOTES:END -->
