---
id: task-012
title: Update deployment execution to persist jobs to database
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 04:55"
updated_date: "2025-10-02 05:22"
labels:
  - backend
dependencies:
  - task-010
  - task-011
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Modify the executeKestraDeployment tRPC mutation to gather device, network, domain, and deployment configuration data and create a complete deployment_jobs snapshot record when execution starts. Update job status during polling. This ensures all executions are persisted with full denormalized context.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Mutation fetches device record from database to gather device snapshot (name, description, ip_address)
- [x] #2 Mutation fetches network record via device.network_id to gather network snapshot (name, cidr, ipv4, ipv6)
- [x] #3 Mutation fetches domain record via network.domain_id to gather domain snapshot (name, display_name)
- [x] #4 Mutation retrieves deployment configuration_json to include in snapshot
- [x] #5 Job record created with all denormalized snapshots immediately after Kestra execution starts with status RUNNING
- [x] #6 Status polling updates job record with completed_at and error_message when execution finishes (SUCCESS/FAILED)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Analyze existing executeKestraDeployment mutation structure and dependencies\n2. Add Supabase context to mutation (change from async ({ input }) to async ({ ctx, input }))\n3. Implement device record fetch using supabase.from('devices').select() with required fields\n4. Implement network record fetch via device.network_id relationship\n5. Implement domain record fetch via network.domain_id relationship\n6. Retrieve deployment configuration from deployments table\n7. Call create_deployment_job RPC after Kestra execution starts with all denormalized snapshots\n8. Update checkKestraExecutionStatus to call update_deployment_job_status RPC when execution completes\n9. Fix type errors related to database schema and column name mismatches\n10. Run typecheck to verify implementation correctness
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Successfully updated executeKestraDeployment mutation and checkKestraExecutionStatus procedure to persist deployment job records with complete denormalized snapshots.

Key implementation details:

1. executeKestraDeployment Mutation:

   - Added Supabase context (ctx) to access database client
   - Implemented sequential data fetching for device, network, domain, and deployment records
   - Fetches device data including network_id for relationship traversal
   - Fetches network data including domain_id for further relationship traversal
   - Fetches domain data for complete organizational context
   - Retrieves deployment configuration from deployments table
   - Creates deployment_jobs record via create_deployment_job RPC immediately after Kestra execution starts
   - Job creation includes all denormalized snapshots (device, network, domain, deployment) with status RUNNING
   - Job creation errors are logged but don't fail the Kestra execution (execution already started)

2. checkKestraExecutionStatus Procedure:

   - Added Supabase context (ctx) for database access
   - Implemented status update logic when execution completes (SUCCESS or FAILED)
   - Calls update_deployment_job_status RPC with completed_at timestamp and error_message
   - Status update errors are logged but don't fail the status check operation
   - Preserves existing status checking functionality

3. Database Schema Mapping:

   - Resolved column name mismatches between networks table and deployment_jobs table
   - Networks table uses ipv4_cidr and ipv6_cidr (updated schema)
   - Deployment_jobs table uses network_cidr, network_ipv4, network_ipv6 (snapshot fields)
   - Mapped ipv4_cidr -> network_ipv4, ipv6_cidr -> network_ipv6
   - Set network_cidr to empty string as legacy field (networks now use separate CIDR fields)

4. Type Safety:
   - Fixed database-overrides.types.ts to include all tables (deployment_form, deployment_jobs, deployments)
   - Handled nullable fields appropriately (description, CIDR fields) with fallback to empty strings
   - All TypeScript type checks pass successfully

Files modified:

- /home/oriol/iotgw-ui/apps/backend/src/routers/deployments.ts (executeKestraDeployment, checkKestraExecutionStatus)
- /home/oriol/iotgw-ui/packages/supabase-contract/src/database-overrides.types.ts (added new tables to type exports)

The implementation ensures complete historical preservation of deployment execution context while maintaining backward compatibility with existing Kestra integration.

<!-- SECTION:NOTES:END -->
