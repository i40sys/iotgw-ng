---
id: task-011
title: Add Supabase RPC functions for deployment jobs operations
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:55"
updated_date: "2025-10-02 05:15"
labels:
  - database
  - backend
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create Supabase RPC (stored procedure) functions to handle CRUD operations for deployment_jobs table. These functions will be called by the tRPC backend to manage deployment execution history with proper data validation and error handling.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 update_deployment_job_status RPC accepts execution_id, status, completed_at, error_message and updates only the execution status fields
- [x] #2 get_deployment_jobs RPC accepts optional device_id, status, limit, offset filters and returns paginated job records with all denormalized snapshot data

- [x] #3 create_deployment_job RPC accepts all denormalized data (execution_id, flow_id, status, device snapshot, network snapshot, domain snapshot, deployment snapshot with configuration_json) and returns created record
- [x] #4 get_deployment_job_by_execution_id RPC accepts execution_id and returns full job record with all snapshot data
- [x] #5 All RPC functions include proper error handling and return appropriate status codes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create migration file for RPC functions following naming convention\n2. Implement create_deployment_job RPC function to insert new job records with all denormalized data\n3. Implement update_deployment_job_status RPC function to update execution status fields\n4. Implement get_deployment_jobs RPC function with pagination and filtering\n5. Implement get_deployment_job_by_execution_id RPC function\n6. Add proper error handling and grants for all RPC functions\n7. Test type checking to ensure integration with existing code
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created migration file /home/oriol/iotgw-ui/supabase/migrations/20251002051400_deployment_jobs_rpc_functions.sql with four RPC functions for deployment jobs operations.

Key implementation details:

1. create_deployment_job - Inserts new job records with complete denormalized data

   - Accepts all 21 parameters (execution tracking + device + network + domain + deployment snapshots)
   - Returns the created record using RETURNING clause
   - Handles unique_violation errors (duplicate execution_id) with specific error code 23505
   - Includes comprehensive error handling with proper PostgreSQL error codes

2. update_deployment_job_status - Updates only execution status fields

   - Accepts execution_id, status, completed_at (optional), error_message (optional)
   - Uses coalesce() to preserve existing completed_at if not provided
   - Raises P0002 error code when execution_id not found
   - Returns updated record for verification

3. get_deployment_jobs - Retrieves jobs with filtering and pagination

   - Supports optional filtering by device_id and status
   - Implements pagination with limit (default 100) and offset (default 0)
   - Orders results by started_at DESC for chronological display
   - Returns all denormalized snapshot data

4. get_deployment_job_by_execution_id - Retrieves single job by execution ID
   - Fetches complete job record with all snapshot data
   - Raises P0002 error when execution_id not found
   - Essential for status polling and detail views

All functions follow established patterns:

- Use 'security definer' for proper RLS enforcement
- Include comprehensive error handling with specific PostgreSQL error codes
- Grant execute permissions to authenticated, anon, and service_role
- Use 'returns setof' pattern for consistent return type handling
- Include detailed JSDoc-style comments for documentation

Type checking passes successfully with no errors.

<!-- SECTION:NOTES:END -->
