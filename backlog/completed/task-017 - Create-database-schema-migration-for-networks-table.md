---
id: task-017
title: Create database schema migration for networks table
status: Done
assignee: []
created_date: "2025-08-24 16:49"
updated_date: "2025-08-24 16:56"
labels:
  - backend
  - database
dependencies: []
priority: high
---

## Description

Create a Supabase migration file to add the networks table with proper schema, constraints, and relationship to domains table

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Networks table exists with all required columns (id, domain_id, name, cidr, ipv4, ipv6, created_at, updated_at)
- [ ] #2 Foreign key constraint properly links domain_id to domains.id
- [ ] #3 Migration includes proper indexes for performance
- [ ] #4 Migration can be successfully applied and rolled back
<!-- AC:END -->
