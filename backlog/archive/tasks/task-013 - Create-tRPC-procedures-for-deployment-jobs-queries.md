---
id: task-013
title: Create tRPC procedures for deployment jobs queries
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:55"
updated_date: "2025-10-02 05:25"
labels:
  - backend
dependencies:
  - task-010
  - task-011
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implement tRPC query procedures to fetch deployment job history from the database. These procedures will enable the frontend to display historical executions with filtering, sorting, and pagination capabilities.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 listDeploymentJobs query procedure accepts device_id, deployment_id, status, limit, offset parameters
- [x] #2 getDeploymentJob query procedure accepts job_id and returns full job details
- [x] #3 getDeploymentJobByExecutionId query procedure accepts execution_id for looking up jobs by Kestra execution ID
- [x] #4 All procedures use proper Zod schemas for input validation
- [x] #5 Procedures follow existing patterns using createQueryProcedure helper
- [x] #6 Error handling converts Supabase errors to appropriate TRPCError codes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create Zod input schemas for deployment jobs query procedures\n2. Implement listDeploymentJobs query procedure with filtering and pagination\n3. Implement getDeploymentJob query procedure for single job by ID\n4. Implement getDeploymentJobByExecutionId query procedure\n5. Add procedures to deployments router\n6. Test type checking to ensure no TypeScript errors
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Successfully implemented three tRPC query procedures for deployment jobs in /home/oriol/iotgw-ui/apps/backend/src/routers/deployments.ts:

1. listDeploymentJobs - Retrieves paginated deployment job history

   - Accepts optional filters: device_id, deployment_id, status
   - Implements pagination with limit (1-100, optional) and offset (min 0, optional)
   - Uses get_deployment_jobs RPC function with proper parameter mapping
   - Returns empty array when no jobs found
   - Comprehensive error handling with INTERNAL_SERVER_ERROR for failures

2. getDeploymentJob - Retrieves single job by job ID

   - Accepts job_id parameter (required, min 1 char)
   - Uses direct table access via supabase.from('deployment_jobs')
   - Returns full job record with all denormalized snapshot data
   - Handles PGRST116 error code (PostgREST not found) with NOT_FOUND TRPCError
   - Additional null check for extra safety

3. getDeploymentJobByExecutionId - Retrieves job by Kestra execution ID
   - Accepts execution_id parameter (required, min 1 char)
   - Uses get_deployment_job_by_execution_id RPC function
   - Handles P0002 error code from RPC function with NOT_FOUND TRPCError
   - Returns first element from array result (RPC returns setof)
   - Essential for status polling and execution tracking

All procedures follow established patterns:

- Created using createQueryProcedure helper function
- Zod schemas for input validation with descriptive error messages
- Proper error handling converting Supabase errors to TRPCError codes
- Consistent logging for operations (info for success, error for failures)
- Return type inference from handler functions
- Follow existing code style and structure

Type checking passes successfully with no errors.

<!-- SECTION:NOTES:END -->
