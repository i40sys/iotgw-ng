---
id: TASK-035
title: Update kestra-call Edge Function to handle ssh_key_id in device jobs
status: To Do
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-02 05:24'
labels:
  - edge-function
  - supabase
  - kms
  - kestra
dependencies:
  - TASK-032
  - TASK-040
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - supabase/volumes/functions/kestra-call/index.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify the Supabase Edge Function `kestra-call` to include `ssh_key_id` tracking in device job records and pass it to Kestra workflow execution.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), when devices are created, the Kestra workflow generates an SSH key in KMS. The Edge Function needs to track this in the `device_jobs` table and ensure the `ssh_key_id` is available for subsequent operations.

## Technical Implementation

### Update device_jobs Table Schema

First, ensure `device_jobs` table has `ssh_key_id` column (may need migration):

```sql
ALTER TABLE device_jobs ADD COLUMN ssh_key_id VARCHAR(255) NULL;
```

### Update Edge Function

File: `supabase/volumes/functions/kestra-call/index.ts`

1. **Extract ssh_key_id from device record** when processing INSERT webhook:

```typescript
// After device lookup
const deviceRecord = (body as any).record;
const sshKeyId = deviceRecord.ssh_key_id || null;

console.log(`[${txId}] Device SSH Key ID: ${sshKeyId || 'Not yet generated'}`);
```

2. **Include in job creation**:

```typescript
const { data: deviceJobData, error: deviceJobError } = await supabase
  .from('device_jobs')
  .insert({
    execution_id: `pending-${transactionId}`,
    flow_id: flowId,
    status: 'PENDING',
    started_at: new Date().toISOString(),
    device_id: deviceId,
    device_name: deviceRecord.name || null,
    device_ip_address: deviceRecord.ip_address || null,
    ssh_key_id: sshKeyId,  // NEW: Include SSH key reference
    // ... other fields
  })
```

3. **Pass to Kestra execution** (for provisioning flows):

```typescript
const kestraInputs = {
  ...body,
  device_id: deviceId,
  ssh_key_id: sshKeyId,
  // ... other inputs
};

const executionResult = await executeKestraFlow(
  namespace,
  flowId,
  kestraInputs,
  transactionId
);
```

4. **Update job after key generation**:

When the Kestra workflow completes and returns the generated `ssh_key_id`, update the job record:

```typescript
// In background polling completion handler
if (finalStatus.outputs?.ssh_key_id) {
  await supabase
    .from('device_jobs')
    .update({ ssh_key_id: finalStatus.outputs.ssh_key_id })
    .eq('execution_id', executionId);
}
```

## Logging Enhancements

Add detailed logging for SSH key tracking:

```typescript
console.log(`[${txId}] SSH Key Generation:`);
console.log(`[${txId}]   Initial Key ID: ${sshKeyId || 'None'}`);
console.log(`[${txId}]   Expected Key ID: device_ssh_${deviceId}`);
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 device_jobs table has ssh_key_id column (migration if needed)
- [ ] #2 Edge Function extracts ssh_key_id from device record on INSERT webhook
- [ ] #3 ssh_key_id included in device_jobs insert statement
- [ ] #4 ssh_key_id passed to Kestra workflow execution inputs
- [ ] #5 Background polling updates job with generated ssh_key_id from Kestra outputs
- [ ] #6 Logging includes ssh_key_id tracking information
- [ ] #7 kestra-call_delete Edge Function also handles ssh_key_id (for key revocation tracking)
- [ ] #8 Error handling for missing or invalid ssh_key_id scenarios
- [ ] #9 TypeScript interfaces updated for ssh_key_id field
<!-- AC:END -->
