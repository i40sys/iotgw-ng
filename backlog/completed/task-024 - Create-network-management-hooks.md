---
id: task-024
title: Create network management hooks
status: Done
assignee: []
created_date: "2025-08-24 16:50"
updated_date: "2025-08-24 17:36"
labels:
  - frontend
  - hooks
dependencies:
  - task-020
---

## Description

Implement custom React hooks for network CRUD operations using tRPC client with proper caching and error handling

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 useNetworks hook fetches networks by domain ID with proper loading states
- [ ] #2 useCreateNetwork hook handles network creation with optimistic updates
- [ ] #3 useUpdateNetwork hook handles network updates with cache invalidation
- [ ] #4 useDeleteNetwork hook handles deletion with proper confirmation flow
- [ ] #5 All hooks follow existing tRPC patterns and handle errors consistently
<!-- AC:END -->
