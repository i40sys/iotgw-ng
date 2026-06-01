---
id: doc-016
title: Kestra Notification Automation Pattern
type: documentation
created_date: "2025-10-22"
---

## Context

Automation pattern for triggering Kestra workflows on database changes using Supabase-native features without requiring separate listener processes.

## Executive Summary

This document details the automation pattern for triggering Kestra workflows when database tables (networks, devices) are modified. The pattern uses Supabase Database Webhooks to call the existing kestra-call edge function, achieving real-time, automated workflow execution without external services or custom code.

## Complete Automation Flow

```
Network/Device Table Change
    ↓
Supabase Database Webhook (configured in dashboard)
    ↓
HTTP POST to kestra-call Edge Function
    ↓
Kestra Workflow Execution
    ↓
network_jobs/device_jobs table updated
```

## Components

### 1. Kestra-Call Edge Function

**Location**: `/home/oriol/iotgw-ng/supabase/volumes/functions/kestra-call/index.ts`

**Key Features**:

- Accepts POST requests with `table` parameter ('networks' or 'devices')
- Maps table to Kestra namespace and flowId:
  - `networks` → `iotgw-ng/networks`
  - `devices` → `iotgw-ng/devices`
- Supports `transaction_id` tracking via:
  - HTTP header: `X-Transaction-ID`
  - Request body: `transaction_id` field
- Executes Kestra flows and polls for completion (max 2 minutes)
- Returns execution status with outputs and task results

**API Contract**:

```typescript
// Request
POST /functions/v1/kestra-call
Headers:
  Content-Type: application/json
  Authorization: Bearer <anon-key>
  X-Transaction-ID: uuid (optional)

Body:
{
  "table": "networks" | "devices",  // REQUIRED
  "transaction_id": "uuid",          // Optional (prefer header)
  "inputs": {                        // Optional inputs for Kestra flow
    "record": {
      "id": "uuid",
      "name": "string",
      // ... other fields from NEW
    }
  }
}

// Response (Success)
{
  "success": true,
  "execution": { /* KestraExecutionStatus */ },
  "executionId": "string",
  "transactionId": "uuid",
  "finalState": "SUCCESS" | "FAILED" | "RUNNING",
  "isCompleted": boolean,
  "outputs": { /* flow outputs */ },
  "taskOutputs": [
    {
      "taskId": "string",
      "state": "string",
      "outputs": {}
    }
  ],
  "message": "string",
  "kestraUrl": "http://..."
}
```

### 2. Edge Function Modifications for Job Tracking

The kestra-call edge function needs to be enhanced to create and update records in the `network_jobs` table by calling the RPC functions created in task-002.

#### Required Changes

**1. Add Supabase Client**

The edge function needs a Supabase client to call RPC functions:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Get Supabase credentials from environment
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**2. Create Job Record Before Execution**

Before calling Kestra, create a network_jobs record:

```typescript
// After extracting table and validating it's 'networks'
if (tableParam === "networks") {
  namespace = "iotgw-ng";
  flowId = "networks";

  // Extract network data from webhook payload
  const networkRecord = body.inputs?.record;
  if (!networkRecord) {
    throw new Error("Missing network record data in webhook payload");
  }

  // Create network_jobs record BEFORE executing Kestra workflow
  console.log(
    `${txnPrefix}[REQUEST ${requestId}] Creating network_jobs record...`,
  );

  const { data: jobData, error: jobError } = await supabase.rpc(
    "create_network_job",
    {
      p_execution_id: "pending", // Will be updated after Kestra execution starts
      p_flow_id: flowId,
      p_status: "PENDING",
      p_started_at: new Date().toISOString(),
      p_network_id: networkRecord.id,
      p_network_name: networkRecord.name,
      p_transaction_id: transactionId,
      p_network_cidr: networkRecord.ipv4_cidr || networkRecord.ipv6_cidr,
      p_network_ipv4: networkRecord.ipv4_cidr,
      p_network_ipv6: networkRecord.ipv6_cidr,
      p_created_by: null, // Or extract from auth context if available
    },
  );

  if (jobError) {
    console.error(
      `${txnPrefix}[REQUEST ${requestId}] Failed to create network_jobs record:`,
      jobError,
    );
    throw new Error(`Failed to create job record: ${jobError.message}`);
  }

  console.log(
    `${txnPrefix}[REQUEST ${requestId}] Created network_jobs record:`,
    jobData,
  );
}
```

**3. Update Job Record After Kestra Execution Starts**

After Kestra returns the execution ID, update the record:

```typescript
// Execute Kestra flow
console.log(`${txnPrefix}[REQUEST ${requestId}] Executing Kestra flow...`);
const executionResult = await executeKestraFlow(
  namespace,
  flowId,
  body.inputs || {},
  transactionId,
);

const executionId = executionResult.id;
console.log(
  `${txnPrefix}[REQUEST ${requestId}] Kestra execution started: ${executionId}`,
);

// Update network_jobs record with real execution_id and RUNNING status
if (tableParam === "networks") {
  console.log(
    `${txnPrefix}[REQUEST ${requestId}] Updating network_jobs with execution_id...`,
  );

  const { data: updateData, error: updateError } = await supabase.rpc(
    "update_network_job_status",
    {
      p_execution_id: executionId,
      p_status: "RUNNING",
      p_completed_at: null,
      p_error_message: null,
    },
  );

  if (updateError) {
    console.error(
      `${txnPrefix}[REQUEST ${requestId}] Failed to update job with execution_id:`,
      updateError,
    );
    // Don't fail the request - job tracking is best effort
  } else {
    console.log(
      `${txnPrefix}[REQUEST ${requestId}] Updated network_jobs with execution_id: ${executionId}`,
    );
  }
}
```

**4. Update Job Record After Completion**

After polling completes, update with final status:

```typescript
// Poll for completion
console.log(
  `${txnPrefix}[REQUEST ${requestId}] Polling for execution completion...`,
);
const finalStatus = await pollExecutionUntilComplete(
  namespace,
  flowId,
  executionId,
  transactionId,
);

// Determine final state
const finalStates = ["SUCCESS", "FAILED", "KILLED"];
const isCompleted = finalStates.includes(finalStatus.state.current);

// Update network_jobs with final status
if (tableParam === "networks") {
  console.log(
    `${txnPrefix}[REQUEST ${requestId}] Updating network_jobs with final status...`,
  );

  const { data: finalUpdateData, error: finalUpdateError } = await supabase.rpc(
    "update_network_job_status",
    {
      p_execution_id: executionId,
      p_status: finalStatus.state.current,
      p_completed_at: finalStatus.state.endDate || new Date().toISOString(),
      p_error_message:
        finalStatus.state.current === "FAILED"
          ? "Execution failed - check Kestra logs"
          : null,
    },
  );

  if (finalUpdateError) {
    console.error(
      `${txnPrefix}[REQUEST ${requestId}] Failed to update job with final status:`,
      finalUpdateError,
    );
  } else {
    console.log(
      `${txnPrefix}[REQUEST ${requestId}] Updated network_jobs with final status: ${finalStatus.state.current}`,
    );
  }
}
```

**5. Handle Errors and Edge Cases**

Add error handling for job creation failures:

```typescript
try {
  // ... existing code ...
} catch (error) {
  const txnPrefix = transactionIdFromHeader
    ? `[TXN:${transactionIdFromHeader}]`
    : "";

  console.error(
    `${txnPrefix}[REQUEST ${requestId}] Error in kestra-call:`,
    error,
  );

  // Try to update job record with error status if we have an execution_id
  if (executionId && tableParam === "networks") {
    try {
      await supabase.rpc("update_network_job_status", {
        p_execution_id: executionId,
        p_status: "FAILED",
        p_completed_at: new Date().toISOString(),
        p_error_message: error instanceof Error ? error.message : String(error),
      });
    } catch (updateError) {
      console.error(
        `${txnPrefix}[REQUEST ${requestId}] Failed to update job with error status:`,
        updateError,
      );
    }
  }

  // Return error response
  return new Response(
    JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
      transactionId: transactionIdFromHeader,
    }),
    {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
```

#### Complete Modified Flow

```
1. Webhook fires → POST to kestra-call edge function
   ↓
2. Extract network record from webhook payload
   ↓
3. CREATE network_jobs record (status: PENDING, execution_id: 'pending')
   ↓
4. Execute Kestra workflow via executeKestraFlow()
   ↓
5. UPDATE network_jobs record (execution_id: real_id, status: RUNNING)
   ↓
6. Poll Kestra for completion (pollExecutionUntilComplete)
   ↓
7. UPDATE network_jobs record (status: SUCCESS/FAILED, completed_at: timestamp)
   ↓
8. Return response to webhook
```

#### Code Example: Complete Modified Handler

```typescript
serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  const transactionIdFromHeader = req.headers.get("X-Transaction-ID");
  const txnPrefix = transactionIdFromHeader
    ? `[TXN:${transactionIdFromHeader}]`
    : "";

  console.log(
    `\n${txnPrefix}[REQUEST ${requestId}] ========== NEW REQUEST ==========`,
  );

  if (req.method === "OPTIONS") {
    // ... CORS handling ...
  }

  if (req.method !== "POST") {
    // ... method check ...
  }

  try {
    const body = await req.json();
    const transactionId = transactionIdFromHeader || body.transaction_id;
    const tableParam = body.table;

    if (!tableParam) {
      return new Response(
        JSON.stringify({ error: "Missing required field: table" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let namespace: string;
    let flowId: string;
    let executionId: string | undefined;

    // Map table to Kestra flow
    switch (tableParam) {
      case "networks":
        namespace = "iotgw-ng";
        flowId = "networks";

        // Extract network data from webhook payload
        const networkRecord = body.inputs?.record;
        if (!networkRecord) {
          throw new Error("Missing network record in webhook payload");
        }

        // STEP 1: Create initial network_jobs record
        console.log(`${txnPrefix} Creating network_jobs record...`);
        const { data: jobData, error: jobError } = await supabase.rpc(
          "create_network_job",
          {
            p_execution_id: "pending",
            p_flow_id: flowId,
            p_status: "PENDING",
            p_started_at: new Date().toISOString(),
            p_network_id: networkRecord.id,
            p_network_name: networkRecord.name,
            p_transaction_id: transactionId,
            p_network_cidr: networkRecord.ipv4_cidr || networkRecord.ipv6_cidr,
            p_network_ipv4: networkRecord.ipv4_cidr,
            p_network_ipv6: networkRecord.ipv6_cidr,
          },
        );

        if (jobError) {
          throw new Error(`Failed to create job record: ${jobError.message}`);
        }

        console.log(
          `${txnPrefix} Created network_jobs record with id: ${jobData[0]?.id}`,
        );
        break;

      case "devices":
        namespace = "iotgw-ng";
        flowId = "devices";
        // Similar logic for devices...
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Invalid table: ${tableParam}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    // STEP 2: Execute Kestra workflow
    console.log(`${txnPrefix} Executing Kestra flow...`);
    const executionResult = await executeKestraFlow(
      namespace,
      flowId,
      body.inputs || {},
      transactionId,
    );

    executionId = executionResult.id;
    console.log(`${txnPrefix} Kestra execution started: ${executionId}`);

    // STEP 3: Update with real execution_id
    if (tableParam === "networks") {
      await supabase.rpc("update_network_job_status", {
        p_execution_id: executionId,
        p_status: "RUNNING",
      });
      console.log(`${txnPrefix} Updated job with execution_id: ${executionId}`);
    }

    // STEP 4: Poll for completion
    console.log(`${txnPrefix} Polling for completion...`);
    const finalStatus = await pollExecutionUntilComplete(
      namespace,
      flowId,
      executionId,
      transactionId,
    );

    // STEP 5: Update with final status
    if (tableParam === "networks") {
      await supabase.rpc("update_network_job_status", {
        p_execution_id: executionId,
        p_status: finalStatus.state.current,
        p_completed_at: finalStatus.state.endDate || new Date().toISOString(),
        p_error_message:
          finalStatus.state.current === "FAILED"
            ? "Workflow execution failed"
            : null,
      });
      console.log(
        `${txnPrefix} Updated job with final status: ${finalStatus.state.current}`,
      );
    }

    // STEP 6: Return response
    return new Response(
      JSON.stringify({
        success: true,
        executionId: executionId,
        transactionId: transactionId,
        finalState: finalStatus.state.current,
        message: `Kestra workflow completed with status: ${finalStatus.state.current}`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error(`${txnPrefix} ERROR:`, error);

    // Try to update job with error if we have execution_id
    if (executionId && tableParam === "networks") {
      try {
        await supabase.rpc("update_network_job_status", {
          p_execution_id: executionId,
          p_status: "FAILED",
          p_completed_at: new Date().toISOString(),
          p_error_message:
            error instanceof Error ? error.message : String(error),
        });
      } catch (updateError) {
        console.error(
          `${txnPrefix} Failed to update job with error:`,
          updateError,
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        transactionId: transactionIdFromHeader,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
```

#### Key Considerations

1. **Transaction ID Flow**:

   - Webhook generates transaction_id (or use header from webhook)
   - Pass to Kestra workflow inputs
   - Store in network_jobs for correlation
   - Include in all logs for traceability

2. **Error Resilience**:

   - Job tracking failures should not fail the webhook
   - Always try to update job status even on errors
   - Log all failures for debugging

3. **Webhook Payload Structure**:

   - Ensure webhook sends `inputs.record` with network data
   - Include all fields needed for network_jobs (id, name, cidrs)
   - Operation type (INSERT/UPDATE) can be included but not required

4. **Status Mapping**:

   - Kestra: CREATED, RUNNING, SUCCESS, FAILED, KILLED
   - network_jobs: PENDING, RUNNING, SUCCESS, FAILED
   - Map appropriately during updates

5. **Idempotency**:
   - create_network_job will fail if execution_id already exists
   - This is intentional to prevent duplicates
   - Consider using a temporary execution_id like 'pending-{timestamp}' initially

## Implementation: Supabase Database Webhooks

**Why Database Webhooks?**

- ✅ No code required - configured via Supabase Dashboard
- ✅ Automatically retries failed requests
- ✅ Built-in logging and monitoring
- ✅ Easy to enable/disable
- ✅ No database migrations needed
- ✅ Fully serverless - no external processes

### Setup Steps

1. **Navigate to Supabase Dashboard**:

   - Go to Database → Webhooks
   - Click "Create a new hook"

2. **Configure Webhook**:

   - **Name**: `kestra-networks-webhook`
   - **Table**: `public.networks`
   - **Events**: `INSERT`, `UPDATE`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://<your-project>.supabase.co/functions/v1/kestra-call`
   - **HTTP Headers**:
     ```json
     {
       "Content-Type": "application/json",
       "Authorization": "Bearer <your-anon-key>"
     }
     ```

3. **Webhook Payload Template**:

   ```json
   {
     "table": "networks",
     "transaction_id": "{{ uuid_generate_v4() }}",
     "inputs": {
       "record": {
         "id": "{{ record.id }}",
         "name": "{{ record.name }}",
         "ipv4_cidr": "{{ record.ipv4_cidr }}",
         "ipv6_cidr": "{{ record.ipv6_cidr }}",
         "domain_id": "{{ record.domain_id }}"
       },
       "operation": "{{ operation }}",
       "old_record": "{{ old_record }}"
     }
   }
   ```

4. **Test the Webhook**:

   - Use the "Send a test request" button in dashboard
   - Or insert/update a network record to trigger it

5. **Monitor**:
   - View webhook logs in Database → Webhooks → Logs tab
   - Check edge function logs for execution details

#### For Devices Table

Repeat the same setup for `public.devices` table with:

- **Name**: `kestra-devices-webhook`
- **Table**: `public.devices`
- **Payload**: Replace `"table": "networks"` with `"table": "devices"`

## Deployment & Testing

### Provisioning Steps

1. Navigate to Supabase Dashboard → Database → Webhooks
2. Create webhook as described above (for networks table)
3. Create webhook for devices table (same process, different table name)
4. Test using dashboard test button
5. Verify in webhook logs

**No migrations required! No code to deploy!**

### Test Procedure

#### Test 1: Insert Test

```sql
-- Insert a test network
INSERT INTO public.networks (domain_id, name, ipv4_cidr)
VALUES (
  (SELECT id FROM public.domains LIMIT 1),
  'test-network-trigger',
  '10.0.0.0/24'
);
```

**Expected result**:

1. Webhook fires on INSERT
2. HTTP POST sent to kestra-call edge function
3. Kestra workflow executes
4. `network_jobs` table receives new record
5. Check webhook logs in Supabase Dashboard → Database → Webhooks → Logs

#### Test 2: Update Test

```sql
-- Update the network
UPDATE public.networks
SET ipv4_cidr = '10.0.1.0/24'
WHERE name = 'test-network-trigger';
```

**Expected result**: Same as Test 1

#### Test 3: Validation Queries

```sql
-- Check network_jobs for recent executions
SELECT
  id,
  execution_id,
  flow_id,
  status,
  started_at,
  completed_at,
  network_name,
  transaction_id
FROM public.network_jobs
ORDER BY started_at DESC
LIMIT 10;

-- Check webhook execution logs in Dashboard:
-- Supabase Dashboard → Database → Webhooks → Logs
-- Filter by webhook name or status (success/failure)
```

## Best Practices

### 1. Error Handling

- Automatically retries failed requests (exponential backoff)
- View failed requests in webhook logs in Supabase Dashboard
- Can disable webhook temporarily if persistent failures occur
- Monitor edge function logs for detailed error traces

### 2. Transaction ID Tracking

Always include transaction_id for end-to-end traceability:

```
1. Database change occurs
   ↓
2. Trigger/Webhook generates transaction_id (uuid_generate_v4())
   ↓
3. Edge function receives transaction_id
   ↓
4. Kestra workflow logs with [TXN:uuid] prefix
   ↓
5. network_jobs table stores transaction_id
   ↓
6. Full traceability from trigger to completion
```

### 3. Payload Structure

**Minimum required payload**:

```json
{
  "table": "networks", // REQUIRED: Target table
  "transaction_id": "uuid" // REQUIRED: For tracking
}
```

**Recommended payload** (pass full record for Kestra):

```json
{
  "table": "networks",
  "transaction_id": "uuid",
  "inputs": {
    "record": {
      "id": "uuid",
      "name": "string",
      "ipv4_cidr": "string",
      "ipv6_cidr": "string",
      "domain_id": "uuid"
    },
    "operation": "INSERT|UPDATE",
    "old_record": {
      /* previous values if UPDATE */
    }
  }
}
```

### 4. Security Considerations

- Use Authorization header with anon key (public, safe for webhooks)
- Rate limiting handled automatically by Supabase
- Webhook logs are secure and only visible to project owners
- Edge function validates all incoming requests

### 5. Monitoring & Observability

- **Webhook Logs**: Dashboard → Database → Webhooks → Logs tab
- Shows all webhook attempts, status codes, responses
- Filter by status (success/failure)
- **Edge Function Logs**: Monitor in Supabase Functions logs
- **Job Tracking**: Query `network_jobs` table for execution history
- Set up alerts for failed webhooks if needed

### 6. Performance Considerations

- Async by default - doesn't block database transactions
- Automatically queued and processed by Supabase
- Built-in rate limiting prevents overwhelming edge function
- No performance impact on INSERT/UPDATE operations

## Alternative Approaches Considered

### 1. pg_net Extension (Async HTTP from Triggers)

**Pros**:

- Full control over when and how HTTP call is made
- Can add custom logic/validation before calling
- Can batch multiple changes

**Cons**:

- ❌ Requires migration and custom function code
- ❌ Manual retry logic needed
- ❌ More code to maintain
- ❌ Less visible/monitorable than webhooks

**Decision**: Rejected - Database Webhooks provide same functionality with zero code.

### 2. pg_notify + Separate Listener Process

**Pros**:

- Traditional pub/sub pattern
- Can handle multiple subscribers

**Cons**:

- ❌ Requires separate long-running process
- ❌ Additional infrastructure (Docker/systemd)
- ❌ More complex deployment
- ❌ Connection management overhead

**Decision**: Rejected - requires external service.

### 3. Polling-Based Change Detection

**Pros**:

- No trigger required
- Works with read-only replicas

**Cons**:

- ❌ Latency (polling interval)
- ❌ Database load from frequent queries
- ❌ Misses rapid changes

**Decision**: Rejected - real-time requirement.

### 4. Direct HTTP Extension (Blocking)

**Pros**:

- Simple to implement

**Cons**:

- ❌ Blocks transaction for up to 2 minutes
- ❌ Poor user experience
- ❌ Can cause database connection exhaustion

**Decision**: Rejected - blocking behavior unacceptable.

## Open Questions

1. **Trigger Filtering**: Should we trigger on all updates or only specific column changes?

   - Recommendation: Start with all updates; add column filtering in webhook if noise becomes an issue

2. **Webhook Retries**: How many retries before giving up?

   - Handled automatically by Supabase with exponential backoff
   - Monitor webhook logs for persistent failures

3. **Batch Processing**: Should we batch multiple rapid changes?
   - Each change triggers one webhook (no built-in batching)
   - For high-frequency updates, consider debouncing at the application layer
   - Recommendation: Start without batching; monitor webhook volume

## References

- [Supabase Database Webhooks Documentation](https://supabase.com/docs/guides/database/webhooks)
- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Kestra API Documentation](https://kestra.io/docs/api-reference/)
- Task-001: Create network_jobs table schema
- Task-002: Create RPC functions for network_jobs table

## Conclusion

This automation pattern provides a robust, scalable solution for triggering Kestra workflows on database changes using Supabase Database Webhooks. The approach enables real-time workflow execution with full traceability via transaction_id, without requiring external services or custom code.

The pattern is:

- **Serverless**: No separate processes to manage
- **Zero Code**: Configured entirely in Supabase Dashboard
- **Reliable**: Built-in retry mechanisms with exponential backoff
- **Traceable**: transaction_id enables end-to-end correlation
- **Scalable**: Async processing, automatically queued
- **Maintainable**: No custom trigger functions or migrations
- **Observable**: Built-in webhook logs and monitoring
- **Extensible**: Easy to add new tables or workflows

**Next steps**:

1. Configure webhook in Supabase Dashboard for networks table
2. Configure webhook for devices table (same process)
3. Modify kestra-call edge function to create/update network_jobs records
4. Test with sample data (insert/update network record)
5. Monitor webhook logs and network_jobs table
6. Deploy to production and monitor execution
