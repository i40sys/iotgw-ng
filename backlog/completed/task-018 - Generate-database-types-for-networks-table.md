---
id: task-018
title: Generate database types for networks table
status: Done
assignee: []
created_date: "2025-08-24 16:49"
updated_date: "2025-08-24 17:12"
labels:
  - backend
  - types
dependencies:
  - task-017
priority: high
---

## Description

Update the shared contract package to include the new networks table types by running the generate contract command

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Networks table types are generated in the contract package
- [ ] #2 NetworksTable interface includes all columns with correct TypeScript types
- [ ] #3 Generated types include proper relationships to DomainsTable
- [ ] #4 Package builds successfully with new types
<!-- AC:END -->
