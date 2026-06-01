---
id: task-020
title: Implement network tRPC router with CRUD operations
status: Done
assignee: []
created_date: "2025-08-24 16:49"
updated_date: "2025-08-24 17:20"
labels:
  - backend
  - api
dependencies:
  - task-019
---

## Description

Create a new tRPC router for network operations including create, read, update, delete, and list procedures with proper Supabase integration

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Networks router exports all CRUD procedures (create, update, delete, getById, listByDomain)
- [ ] #2 All procedures use proper Zod input validation
- [ ] #3 Supabase queries handle errors correctly and convert to tRPC errors
- [ ] #4 Router is integrated into the main tRPC router
- [ ] #5 All procedures follow existing error handling patterns
<!-- AC:END -->
