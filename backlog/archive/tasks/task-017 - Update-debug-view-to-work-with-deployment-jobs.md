---
id: task-017
title: Update debug view to work with deployment jobs
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:55"
updated_date: "2025-10-02 05:40"
labels:
  - frontend
dependencies:
  - task-013
  - task-015
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Modify the deployment debug log view to integrate with the deployment_jobs table. The debug view should be accessible from deployment job history and display execution logs with proper context about the job metadata.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Debug route accepts executionId parameter and loads job record from deployment_jobs table
- [x] #2 Debug header displays job metadata including deployment name, device, and execution timestamps
- [x] #3 Component gracefully handles cases where job record exists but logs are not yet available
- [x] #4 Existing log parsing and Ansible output rendering continues to work correctly
- [x] #5 Navigation from jobs list to debug view passes executionId correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Fetch deployment job record using getDeploymentJobByExecutionId tRPC procedure
2. Update debug header to display job metadata (deployment name, device name, timestamps)
3. Add graceful handling for missing logs (job exists but logs not available)
4. Ensure existing log parsing and Ansible rendering continues to work
5. Test navigation from jobs list to debug view with executionId parameter
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Updated the deployment debug view to integrate with the deployment_jobs table:

1. Added a new query to fetch deployment job metadata using the getDeploymentJobByExecutionId tRPC procedure
2. Separated the original logs query from the job query to allow independent error handling
3. Redesigned the header section to display comprehensive job metadata including:
   - Deployment name and version
   - Device name and IP address
   - Network and domain information
   - Execution timestamps (started and completed)
   - Job status with visual badge
   - Execution ID
4. Implemented graceful error handling:
   - Shows job metadata even if logs fail to load
   - Displays a warning message when logs are unavailable
   - Shows appropriate empty state messages
5. Added status badge components with icons (Loader2, CheckCircle, XCircle, Clock) for visual feedback
6. Maintained all existing log parsing functionality including:
   - Ansible task collapsing/expanding
   - Color-coded output rendering
   - Message classification
   - Expand all / Collapse all buttons
7. Navigation from the deployment jobs list already correctly passes the executionId parameter

The implementation ensures backward compatibility while adding rich context from the deployment_jobs table. The debug view now provides a complete picture of the deployment execution with full metadata context.

<!-- SECTION:NOTES:END -->
