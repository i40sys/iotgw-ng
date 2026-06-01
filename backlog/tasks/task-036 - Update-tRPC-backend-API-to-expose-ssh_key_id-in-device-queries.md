---
id: TASK-036
title: Update tRPC backend API to expose ssh_key_id in device queries
status: Done
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-03 05:51'
labels:
  - backend
  - trpc
  - api
  - kms
dependencies:
  - TASK-032
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - apps/backend/src/routers/devices.ts
  - apps/backend/src/routers/deployments.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify the tRPC backend routers to include `ssh_key_id` in device-related queries and mutations. The API must expose the KMS reference (not key material) for UI display and deployment operations.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), the `ssh_key_id` field stores a reference to the device's SSH key in Cosmian KMS. The backend API needs to expose this field for frontend display and pass it to Kestra during deployment execution.

## Technical Implementation

### Update devices.ts Router

File: `apps/backend/src/routers/devices.ts`

1. **Update device queries** to include ssh_key_id:

```typescript
// In listDevices, getDevice, etc.
const { data, error } = await supabase
  .from("devices")
  .select("id, name, description, ip_address, network_id, ssh_key_id, created_at, updated_at")
  // ...
```

2. **Add ssh_key_id to response types** (if manually typed):

```typescript
interface DeviceResponse {
  id: string;
  name: string;
  description: string | null;
  ip_address: string;
  network_id: string;
  ssh_key_id: string | null;  // NEW: KMS key reference
  created_at: string;
  updated_at: string;
}
```

### Update deployments.ts Router

File: `apps/backend/src/routers/deployments.ts`

1. **Include ssh_key_id in device fetch** for deployment execution:

```typescript
// In executeKestraDeployment
const { data: deviceData, error: deviceError } = await supabase
  .from("devices")
  .select("id, name, description, ip_address, network_id, ssh_key_id")
  .eq("id", input.device_id)
  .single();

// Validate SSH key exists before deployment
if (!deviceData.ssh_key_id) {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Device ${input.device_id} does not have an SSH key configured. Please wait for key generation or regenerate.`,
  });
}
```

2. **Pass ssh_key_id to Kestra**:

```typescript
// Add to form data for Kestra execution
const configWithSshKey = {
  ...configToUse,
  target_ip: deviceData.ip_address,
  ssh_key_id: deviceData.ssh_key_id,  // NEW: Pass KMS key reference
};
```

3. **Include in deployment_jobs snapshot**:

```typescript
const { error: jobError } = await supabase.rpc("create_deployment_job", {
  // ... existing params
  p_ssh_key_id: deviceData.ssh_key_id,  // NEW: Capture in job snapshot
});
```

### New Query: Check SSH Key Status

Add a procedure to check SSH key status:

```typescript
checkSshKeyStatus: createQueryProcedure(
  "check_ssh_key_status",
  z.object({ device_id: z.string().min(1) }),
  async ({ ctx, input }) => {
    const { supabase } = ctx;
    
    const { data, error } = await supabase
      .from("devices")
      .select("ssh_key_id")
      .eq("id", input.device_id)
      .single();
    
    if (error) throw new TRPCError({ code: "NOT_FOUND" });
    
    return {
      hasSshKey: !!data.ssh_key_id,
      sshKeyId: data.ssh_key_id,
    };
  }
)
```

## Security Note

The API exposes `ssh_key_id` (the KMS reference) but NEVER the actual key material. The private key never leaves KMS except during deployment to the device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Device list queries include ssh_key_id field
- [x] #2 Device detail query includes ssh_key_id field
- [x] #3 executeKestraDeployment validates ssh_key_id exists before deployment
- [x] #4 executeKestraDeployment passes ssh_key_id to Kestra inputs
- [x] #5 deployment_jobs record captures ssh_key_id in snapshot
- [x] #6 New checkSshKeyStatus procedure added for frontend status checks
- [x] #7 TRPCError thrown with clear message if ssh_key_id missing during deployment
- [x] #8 TypeScript types correctly reflect ssh_key_id as string | null
- [x] #9 API never exposes actual key material, only KMS reference
- [x] #10 Zod schemas updated if manual validation used
- [x] #11 Unit tests cover ssh_key_id handling in all affected procedures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect existing device queries and deployment execution flow in backend\n2. Add ssh_key_id to select fields and types/zod schemas\n3. Add ssh_key_id validation and pass-through to Kestra inputs and deployment_jobs snapshot\n4. Add checkSshKeyStatus procedure and tests\n5. Run relevant tests/lint
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added ssh_key_id validation and pass-through in Kestra deployment execution, including deployment_jobs snapshot. Added checkSshKeyStatus query and deployment_jobs ssh_key_id migration + updated Supabase types. Tests: pnpm --filter @iotgw/backend test:run -- --runTestsByPath src/routers/__tests__/sshKeyId.test.ts
<!-- SECTION:NOTES:END -->
