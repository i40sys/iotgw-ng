---
id: TASK-039
title: Update kestra-call_delete Edge Function for SSH key revocation
status: To Do
assignee: []
created_date: '2026-03-02 05:24'
updated_date: '2026-03-02 05:24'
labels:
  - edge-function
  - supabase
  - kms
  - security
dependencies:
  - TASK-032
  - TASK-040
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - supabase/volumes/functions/kestra-call_delete/index.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify the Supabase Edge Function `kestra-call_delete` to trigger SSH key revocation in Cosmian KMS when a device is deleted.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), when a device is deleted, its SSH key should be revoked in KMS for security purposes. The delete Edge Function already handles device deletion webhooks and can trigger key revocation as part of the workflow.

## Technical Implementation

### Update Delete Edge Function

File: `supabase/volumes/functions/kestra-call_delete/index.ts`

1. **Extract ssh_key_id from old_record**:

```typescript
// For DELETE operations, Supabase sends old_record
const deviceRecord = (body as any).old_record || (body as any).record;
const sshKeyId = deviceRecord.ssh_key_id || null;

console.log(`[${txId}] Device to delete - ID: ${deviceId}, SSH Key ID: ${sshKeyId || 'None'}`);
```

2. **Add key revocation to Kestra inputs**:

```typescript
// Include ssh_key_id in Kestra workflow inputs for revocation
const kestraInputs = {
  ...body,
  table: 'devices',
  operation: 'DELETE',
  device_id: deviceId,
  ssh_key_id: sshKeyId,  // NEW: Include for key revocation
  revoke_ssh_key: sshKeyId ? true : false,  // Flag to trigger revocation
};
```

3. **Track in device_jobs**:

```typescript
const { data: deviceJobData, error: deviceJobError } = await supabase
  .from('device_jobs')
  .insert({
    execution_id: `pending-${transactionId}`,
    flow_id: flowId,
    status: 'PENDING',
    operation_type: 'DELETE',  // NEW: Track operation type
    device_id: deviceId,
    device_name: deviceRecord.name || null,
    ssh_key_id: sshKeyId,  // NEW: Track key being revoked
    // ... other fields
  })
```

### Update Kestra devices Delete Flow

Add key revocation task to the Kestra workflow:

```yaml
- id: revoke_ssh_key
  type: io.kestra.plugin.scripts.shell.Commands
  description: Revoke SSH key in KMS
  runIf: "{{ inputs.ssh_key_id != null and inputs.revoke_ssh_key == true }}"
  commands:
    - |
      echo "Revoking SSH key: {{ inputs.ssh_key_id }}"
      cosmian kms ec keys revoke \
        -k "{{ inputs.ssh_key_id }}" \
        --revocation-reason "cessation_of_operation" \
        --compromise-occurrence-date "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      
      echo "SSH key revoked successfully"
```

### Error Handling

- Key revocation failure should not block device deletion
- Log revocation failures for manual follow-up
- Mark job as "completed with warnings" if key revocation fails

```typescript
// In background polling completion handler
if (finalStatus.outputs?.ssh_key_revocation_failed) {
  console.warn(`[${txId}][BACKGROUND] SSH key revocation failed for ${sshKeyId}`);
  // Update job with warning
  await supabase
    .from('device_jobs')
    .update({
      status: 'SUCCESS_WITH_WARNINGS',
      error_message: `Device deleted but SSH key revocation failed: ${finalStatus.outputs.revocation_error}`
    })
    .eq('execution_id', executionId);
}
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Edge Function extracts ssh_key_id from old_record on device DELETE
- [ ] #2 ssh_key_id passed to Kestra workflow for revocation
- [ ] #3 Kestra workflow includes revoke_ssh_key task with conditional execution
- [ ] #4 Key revoked with cessation_of_operation reason
- [ ] #5 Revocation timestamp recorded in KMS
- [ ] #6 device_jobs table tracks ssh_key_id and operation_type (DELETE)
- [ ] #7 Revocation failure does not block device deletion
- [ ] #8 Warning status recorded if revocation fails
- [ ] #9 Logging includes ssh_key_id and revocation status
- [ ] #10 Edge Function handles devices without ssh_key_id gracefully
<!-- AC:END -->
