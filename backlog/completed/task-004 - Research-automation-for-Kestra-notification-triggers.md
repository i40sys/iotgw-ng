---
id: task-004
title: Research automation for Kestra notification triggers
status: Done
assignee:
  - "@myself"
created_date: "2025-10-22 07:40"
updated_date: "2025-10-22 10:30"
labels:
  - research
  - automation
  - database
  - kestra
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Research and document the automation pattern for provisioning Kestra notification infrastructure. This includes a PostgreSQL trigger function, a plpgsql notify function, and integration with the existing kestra-call edge function. The goal is to automate the creation of these artifacts so that network changes automatically trigger Kestra workflows.

## Existing Artifacts to Analyze

### Edge Function: kestra-call

Location: /home/oriol/iotgw-ng/supabase/volumes/functions/kestra-call/index.ts

- Accepts POST requests with table parameter ('networks' or 'devices')
- Maps table parameter to Kestra namespace and flowId
- Supports transaction_id tracking via header (X-Transaction-ID) or body
- Executes Kestra flows and polls for completion
- Returns execution status and outputs

### Trigger Pattern to Create

Based on deployment_jobs pattern, we need:

1. **plpgsql Function: notify_kestra_networks**
   - Triggered on INSERT/UPDATE of networks table
   - Calls pg_notify() to send notification
   - Includes transaction_id in notification payload
2. **Trigger: trg_networks_notify_kestra**

   - AFTER INSERT OR UPDATE on networks table
   - Executes notify_kestra_networks function

3. **Integration with kestra-call edge function**
   - Listen to pg_notify channel
   - Call edge function with table='networks' parameter
   - Pass transaction_id for tracking

## Reference Pattern

The deployment system in apps/backend/src/routers/deployments.ts:592-776 shows how to:

- Call kestra-call edge function via HTTP
- Create job records (create_deployment_job RPC)
- Pass transaction_id for correlation
- Handle execution status updates
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Document the complete flow: networks table change → trigger → notify_kestra_networks → pg_notify → listener → kestra-call edge function → Kestra workflow execution
- [x] #2 Create migration template for notify_kestra_networks plpgsql function that uses pg_notify() with transaction_id in JSON payload
- [x] #3 Create migration template for trg_networks_notify_kestra trigger (AFTER INSERT OR UPDATE on networks)
- [x] #4 Document how to set up a listener service that subscribes to pg_notify channel and calls the kestra-call edge function
- [x] #5 Provide test procedure: insert/update network record, verify trigger fires, verify kestra-call receives notification with correct table='networks' parameter
- [x] #6 Create validation test that checks if trigger and function exist in database using SQL queries
- [x] #7 Document provisioning steps for deploying these artifacts to production Supabase instance
- [x] #8 Include code examples from existing kestra-call edge function (handles transaction_id tracking)
- [x] #9 Research best practices for pg_notify channel naming and payload structure
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Read kestra-call edge function to understand API
2. Analyze deployment execution pattern for reference
3. Research pg_notify and trigger patterns
4. Document complete automation flow
5. Create migration templates for trigger and notify function
6. Document listener service setup
7. Create test procedures and validation queries
8. Document best practices and provisioning steps
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Created comprehensive decision document (doc-016) covering:

1. Complete automation flow documented with diagram and detailed component breakdown
2. Migration templates created for:
   - notify_kestra_networks() plpgsql function with pg_notify() and transaction_id
   - trg_networks_notify_kestra trigger (AFTER INSERT OR UPDATE)
3. Listener service documented with two implementation options:
   - Node.js listener (recommended)
   - Python listener (alternative)
     Both include automatic reconnection, error handling, and transaction_id forwarding
4. Test procedures provided with 3 test scenarios:
   - Manual notification test
   - Insert/Update test
   - Validation queries
5. Validation SQL queries provided to check trigger and function existence
6. Provisioning steps documented for database migrations and listener deployment
7. Kestra-call edge function integration documented with API contract and transaction_id tracking
8. Best practices documented for:
   - Channel naming convention (use single 'kestra_notifications' channel)
   - Payload structure (always include table, operation, transaction_id, timestamp)
   - Error handling & retry logic
   - Monitoring & observability
   - Security considerations

All research complete. Ready for implementation when needed.

<!-- SECTION:NOTES:END -->
