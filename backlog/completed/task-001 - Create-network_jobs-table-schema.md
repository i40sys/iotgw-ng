---
id: task-001
title: Create network_jobs table schema
status: Done
assignee:
  - "@myself"
created_date: "2025-10-22 07:39"
updated_date: "2025-10-22 10:22"
labels:
  - database
  - migration
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create a new migration for the network_jobs table, inspired by the deployment_jobs table schema. This table will track network-related job executions from Kestra workflows.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Migration file created in supabase/migrations/ following naming convention YYYYMMDDHHMMSS_create_network_jobs.sql
- [x] #2 Table includes all deployment_jobs fields plus transaction_id (uuid type) field
- [x] #3 Table has denormalized network snapshot fields (network_id, network_name, network_cidr, network_ipv4, network_ipv6)
- [x] #4 Table includes execution tracking fields (id, execution_id, flow_id, status, started_at, completed_at, error_message, transaction_id)
- [x] #5 Row Level Security (RLS) enabled with appropriate policies for authenticated users
- [x] #6 Indexes created for performance (status, network_id, started_at, created_at)
- [x] #7 Permissions granted to all roles (anon, authenticated, postgres, service_role)
- [x] #8 Migration successfully applied to Supabase using 'pnpm db:push' or supabase CLI
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Review deployment_jobs migration structure
2. Create new migration file with timestamp naming convention
3. Define network_jobs table with execution tracking, transaction_id, and denormalized network fields
4. Enable RLS with policies for authenticated users
5. Create performance indexes
6. Grant permissions to all roles
7. Apply migration to Supabase
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created migration file supabase/migrations/20251022120000_create_network_jobs.sql with:

- All execution tracking fields (id, execution_id, flow_id, status, started_at, completed_at, error_message)
- Added transaction_id field (uuid type)
- Denormalized network snapshot fields (network_id, network_name, network_cidr, network_ipv4, network_ipv6)
- Enabled RLS with policies for authenticated users (select, insert, update, delete)
- Created indexes for performance (status, network_id, started_at, created_at)
- Granted permissions to all roles (anon, authenticated, postgres, service_role)
- Migration successfully applied to Supabase using pnpm db:migrate
<!-- SECTION:NOTES:END -->
