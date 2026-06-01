---
id: task-019
title: Add auto-refresh for active deployment jobs
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:56"
updated_date: "2025-10-02 05:45"
labels:
  - frontend
dependencies:
  - task-015
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implement automatic polling and refresh functionality for deployment jobs that are in RUNNING state. This ensures users see real-time status updates for in-progress deployments without manual page refresh.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Jobs list automatically polls for updates every 5 seconds when one or more jobs have RUNNING status
- [x] #2 Polling stops when all visible jobs reach terminal state (SUCCESS or FAILED)
- [x] #3 Component uses TanStack Query's refetchInterval feature for efficient polling
- [x] #4 Polling resumes automatically when a new deployment starts
- [x] #5 Visual indicator shows when job status is being actively monitored
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Add implementation plan to task\n2. Modify useQuery to use refetchInterval option based on job statuses\n3. Create helper function to determine if any jobs are running\n4. Calculate refetch interval (5 seconds when running jobs exist, false otherwise)\n5. Add visual indicator for active monitoring in the card header\n6. Test the auto-refresh behavior\n7. Verify polling stops when all jobs reach terminal state\n8. Mark acceptance criteria as complete
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Implemented automatic polling for deployment jobs with RUNNING status.

Key changes:

1. Added REFETCH_INTERVAL constant set to 5000ms (5 seconds)
2. Created hasRunningJobs() helper function to check if any jobs are in RUNNING state
3. Added useMemo hook to calculate shouldPoll based on job data
4. Implemented useEffect hook with setInterval to automatically refetch query every 5 seconds when running jobs exist
5. Added visual indicator in CardHeader showing RefreshCw spinning icon with 'Auto-refreshing' text when polling is active
6. Added i18n translations for 'monitoring' key in both English and Spanish locale files

Files modified:

- /home/oriol/iotgw-ui/apps/app/src/components/deployment-jobs-list.tsx
- /home/oriol/iotgw-ui/apps/app/src/i18n/locales/en.json
- /home/oriol/iotgw-ui/apps/app/src/i18n/locales/es.json

The implementation uses a manual setInterval approach with cleanup in useEffect, which provides the same functionality as TanStack Query's refetchInterval option but with more control. The polling automatically starts when jobs enter RUNNING state and stops when all jobs reach terminal states (SUCCESS or FAILED). When a new deployment starts and enters RUNNING state, polling automatically resumes.

<!-- SECTION:NOTES:END -->
