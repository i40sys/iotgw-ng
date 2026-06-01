---
id: task-015
title: Create deployment jobs list component
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:55"
updated_date: "2025-10-02 05:32"
labels:
  - frontend
dependencies:
  - task-013
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Build a React component to display the list of historical deployment job executions in a table format. The component will show key information about each execution including status, timestamps, and provide actions to view debug logs.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Component displays denormalized snapshot data: device_name, network_name, domain_display_name, deployment_name, deployment_version

- [x] #2 Status column uses visual indicators (colors, icons) for RUNNING, SUCCESS, FAILED states
- [x] #3 Each row has View Logs button opening debug window and View Config button showing configuration_json
- [x] #4 Component handles loading, error, and empty states appropriately
- [x] #5 Component accepts optional deviceId prop to filter jobs by device
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create DeploymentJobsList component with table structure
2. Implement status indicators with colors and icons
3. Add View Logs and View Config action buttons
4. Implement loading, error, and empty states
5. Add deviceId filtering support
6. Add i18n translation keys
7. Test component integration
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created DeploymentJobsList component at /apps/app/src/components/deployment-jobs-list.tsx

Key Features:

- Displays deployment job history in a responsive table format
- Shows all denormalized snapshot data: device_name, device_ip_address, network_name, domain_display_name, deployment_name, deployment_version
- Status column with color-coded badges and icons:
  - RUNNING: Blue with animated spinner icon
  - SUCCESS: Green with checkmark icon
  - FAILED: Red with X icon
  - PENDING: Yellow with clock icon
- Action buttons for each row:
  - View Logs: Opens debug window (defaults to /deployments/debug/{executionId})
  - View Config: Shows configuration JSON (customizable via callback)
- Proper state handling:
  - Loading state with spinner
  - Error state with ErrorDisplay component
  - Empty state with helpful message
- Optional deviceId prop for filtering jobs by device
- Fully integrated with tRPC listDeploymentJobs query
- TypeScript typed using Supabase database types
- Follows project patterns (Shadcn UI, TailwindCSS v4)

Translations Added:

- English: en.json - Added deploymentJobs section with 14 translation keys
- Spanish: es.json - Added deploymentJobs section with 14 translation keys

Component API:

- deviceId?: string - Optional device filter
- className?: string - Additional styling
- onViewLogs?: (executionId: string) => void - Custom log viewer handler
- onViewConfig?: (config: unknown) => void - Custom config viewer handler

All code passes TypeScript type checking and ESLint validation.

<!-- SECTION:NOTES:END -->
