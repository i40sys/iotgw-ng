---
id: task-002
title: Create RPC functions for network_jobs table
status: Done
assignee:
  - "@myself"
created_date: "2025-10-22 07:39"
updated_date: "2025-10-22 10:24"
labels:
  - database
  - migration
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create RPC functions to handle CRUD operations for network_jobs table, similar to deployment_jobs_rpc_functions.sql

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Migration file created: YYYYMMDDHHMMSS_network_jobs_rpc_functions.sql
- [x] #2 create_network_job function implemented with all required parameters including transaction_id
- [x] #3 update_network_job_status function created to update status, completed_at, and error_message
- [x] #4 get_network_jobs function with filtering by network_id, status, limit, and offset
- [x] #5 get_network_job_by_execution_id function to retrieve job by Kestra execution ID
- [x] #6 All functions use security definer and proper error handling
- [x] #7 Execute permissions granted to authenticated, anon, and service_role
- [x] #8 Migration successfully applied to Supabase
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Review deployment_jobs RPC functions structure
2. Create migration file with timestamp naming convention
3. Implement create_network_job function with all required parameters including transaction_id
4. Implement update_network_job_status function
5. Implement get_network_jobs function with network_id filtering
6. Implement get_network_job_by_execution_id function
7. Grant execute permissions to all roles
8. Apply migration to Supabase
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created migration file supabase/migrations/20251022120100_network_jobs_rpc_functions.sql with:

- create_network_job function with all required parameters (execution_id, flow_id, status, started_at, network_id, network_name) and optional parameters (transaction_id, network_cidr, network_ipv4, network_ipv6, created_by)
- update_network_job_status function to update status, completed_at, and error_message
- get_network_jobs function with filtering by network_id, status, limit, and offset
- get_network_job_by_execution_id function to retrieve job by Kestra execution ID
- All functions use security definer and proper error handling with specific error codes
- Execute permissions granted to authenticated, anon, and service_role
- Migration successfully applied to Supabase
<!-- SECTION:NOTES:END -->
