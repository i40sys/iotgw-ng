---
id: task-026
title: Add network count to domain list view
status: Done
assignee: []
created_date: "2025-08-24 16:50"
updated_date: "2025-08-24 17:47"
labels:
  - frontend
  - enhancement
dependencies:
  - task-025
---

## Description

Enhance the domain list component to display the number of networks associated with each domain

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Domain list items show network count badge or text
- [ ] #2 Network count is fetched efficiently without N+1 query issues
- [ ] #3 Count updates automatically when networks are added or removed
- [ ] #4 Display handles zero networks gracefully
- [ ] #5 Network count styling is consistent with existing domain card design
<!-- AC:END -->
