---
id: task-003
title: Create UI section for network_jobs
status: Done
assignee:
  - "@myself"
created_date: "2025-10-22 07:40"
updated_date: "2025-10-22 10:27"
labels:
  - frontend
  - ui
  - react
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create a new UI component to display network job execution history, similar to deployment-jobs-list.tsx component

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Component created at apps/app/src/components/network-jobs-list.tsx
- [x] #2 Component displays network jobs in a table with columns: status, network, domain, started_at, completed_at, actions
- [x] #3 Status badges with icons (running, success, failed, pending) using Font Awesome icons
- [x] #4 Pagination implemented (10 jobs per page)
- [x] #5 Auto-refresh polling when jobs are in 'RUNNING' state (5-second interval)
- [x] #6 View logs button opens Kestra execution debug view
- [x] #7 Optional filtering by network_id prop
- [x] #8 Uses tRPC listNetworkJobs query with proper loading/error states
- [x] #9 Translation keys added to i18n locale files (en.json, es.json)
- [ ] #10 Component integrated into appropriate page/route
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Review deployment-jobs-list.tsx component structure
2. Check tRPC procedures for network jobs
3. Create network-jobs-list.tsx component with table layout
4. Implement status badges with Font Awesome icons
5. Add pagination (10 per page)
6. Implement auto-refresh for running jobs
7. Add view logs button with Kestra integration
8. Add translation keys
9. Integrate component into appropriate route
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created network-jobs-list.tsx component with:

- Component displays network jobs in a table with columns: status, network (with IPv4/IPv6 info), started_at, completed_at, actions
- Status badges with Font Awesome icons (faSpinner, faCircleCheck, faCircleXmark, faClock)
- Pagination implemented (10 jobs per page with navigation controls)
- Auto-refresh polling when jobs are in 'RUNNING' state (5-second interval)
- View logs button opens Kestra execution debug view (default: /networks/debug/{execution_id})
- Optional filtering by network_id prop
- Uses tRPC listNetworkJobs query with proper loading/error states
- Translation keys added to i18n locale files (en.json and es.json) with all required translations
- Added listNetworkJobs tRPC procedure to apps/backend/src/routers/networks.ts

Component is ready to be integrated into any appropriate page/route as needed (e.g., a dedicated network jobs page or as part of the networks detail view).

<!-- SECTION:NOTES:END -->
