---
id: task-002
title: Implement tRPC procedures for deployments CRUD operations
status: Done
assignee:
  - "@myself"
created_date: "2025-09-24 04:53"
updated_date: "2025-09-24 05:17"
labels:
  - backend
  - api
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Create tRPC router with all necessary procedures for managing deployment configurations

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 tRPC router 'deployments' created with query and mutation procedures
- [x] #2 Procedure to create new deployment configuration implemented
- [x] #3 Procedure to list deployments with filtering by device implemented
- [x] #4 Procedure to get specific deployment by id implemented
- [x] #5 Procedure to update deployment configuration implemented
- [x] #6 Procedure to delete deployment implemented
- [x] #7 Procedure to get deployment versions for a device implemented
- [x] #8 Input validation with Zod schemas for all procedures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create deployments router file following project patterns\n2. Implement create deployment procedure using create_deployment_form RPC\n3. Implement list deployments procedure using get_deployment_forms RPC with filtering\n4. Implement get deployment by ID using get_deployment_form_by_id RPC\n5. Implement update deployment using update_deployment_form RPC\n6. Implement delete deployment using delete_deployment_form RPC\n7. Implement get deployment versions procedure using get_deployment_forms with device filtering\n8. Add proper Zod input validation schemas for all procedures\n9. Integrate router into main router configuration\n10. Test all procedures with proper error handling
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Successfully implemented comprehensive tRPC procedures for deployments CRUD operations:

Implementation Details:

- Created deployments router at /home/oriol/iotgw-ui/apps/backend/src/routers/deployments.ts
- Integrated with main router configuration in router.ts
- All procedures use the existing Supabase RPC functions for data operations

Procedures Implemented:

1. createDeployment - Creates new deployment configurations using create_deployment_form RPC
2. listDeployments - Lists deployments with optional filtering by device_id, search, pagination
3. getDeployment - Fetches single deployment by ID using get_deployment_form_by_id RPC
4. updateDeployment - Updates existing deployment using update_deployment_form RPC
5. deleteDeployment - Deletes deployment using delete_deployment_form RPC
6. getDeploymentVersions - Gets all deployments for a specific device

Input Validation:

- Comprehensive Zod schemas for all input parameters
- Custom JSON schema matching database Json type for configuration field
- Proper nullable/optional field handling
- Required field validation with meaningful error messages

Error Handling:

- Structured error responses using TRPCError with appropriate codes
- Foreign key constraint handling for device relationships
- Not found error handling for non-existent deployments
- Comprehensive logging for debugging and monitoring

Code Quality:

- Follows project patterns established in existing routers
- TypeScript strict typing throughout
- ESLint compliant (nullish coalescing operators)
- Proper error propagation and logging
- Consistent with CLAUDE.md guidelines

Files Modified:

- /home/oriol/iotgw-ui/apps/backend/src/routers/deployments.ts (created)
- /home/oriol/iotgw-ui/apps/backend/src/routers/router.ts (updated to include deployments router)
<!-- SECTION:NOTES:END -->
