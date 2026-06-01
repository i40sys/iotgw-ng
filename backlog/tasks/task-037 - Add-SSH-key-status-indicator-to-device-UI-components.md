---
id: TASK-037
title: Add SSH key status indicator to device UI components
status: Done
assignee: []
created_date: '2026-03-02 05:23'
updated_date: '2026-03-03 05:58'
labels:
  - frontend
  - react
  - ui
  - kms
dependencies:
  - TASK-036
references:
  - >-
    backlog/decisions/decision-010 -
    ADR-001-SSH-Key-Management-with-Cosmian-KMS.md
  - backlog/docs/doc-006 - React-Component-Development-Guidelines.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the frontend device components to display the SSH key status, showing whether a device has a configured SSH key in KMS and providing visual feedback for key management.

## Background

As defined in decision-010 (ADR-001 - SSH Key Management with Cosmian KMS), SSH keys are managed in Cosmian KMS with only the reference stored in Supabase. The UI should indicate to users whether a device's SSH key has been generated and is ready for deployment.

## Technical Implementation

### Device List Component

File: `apps/app/src/components/devices/DeviceList.tsx` (or similar)

Add SSH key status badge/icon to device list items:

```tsx
import { KeyRound, KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DeviceRowProps {
  device: {
    id: string;
    name: string;
    ssh_key_id: string | null;
    // ... other fields
  };
}

function SshKeyStatus({ sshKeyId }: { sshKeyId: string | null }) {
  if (sshKeyId) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
            <KeyRound className="h-3 w-3" />
            SSH Key
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>SSH key configured</p>
          <p className="text-xs text-muted-foreground font-mono">{sshKeyId}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600">
          <KeyRound className="h-3 w-3" />
          No SSH Key
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>SSH key not yet generated</p>
        <p className="text-xs text-muted-foreground">Key will be created during device provisioning</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

### Device Detail View

File: `apps/app/src/components/devices/DeviceDetail.tsx` (or similar)

Add SSH key section to device detail panel:

```tsx
function DeviceSshKeySection({ device }: { device: Device }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          SSH Key Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        {device.ssh_key_id ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>SSH key configured in KMS</span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Key ID:</span>{" "}
              <code className="bg-muted px-1 py-0.5 rounded">{device.ssh_key_id}</code>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>SSH key will be generated during first deployment</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Deployment Dialog/Modal

Update deployment UI to show SSH key status before execution:

```tsx
function DeploymentPreflightCheck({ device }: { device: Device }) {
  const checks = [
    {
      label: "Device reachable",
      status: device.ip_address ? "ready" : "error",
    },
    {
      label: "SSH key configured",
      status: device.ssh_key_id ? "ready" : "warning",
      message: device.ssh_key_id 
        ? undefined 
        : "Key will be deployed from KMS during execution",
    },
    // ... other checks
  ];
  
  return (
    <div className="space-y-2">
      {checks.map((check) => (
        <PreflightCheckItem key={check.label} {...check} />
      ))}
    </div>
  );
}
```

## Internationalization

Add translation keys for SSH key status messages:

```json
{
  "device": {
    "sshKey": {
      "configured": "SSH key configured",
      "notConfigured": "SSH key not yet generated",
      "willBeGenerated": "Key will be created during device provisioning",
      "keyId": "Key ID"
    }
  }
}
```
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Device list shows SSH key status indicator (badge/icon) for each device
- [x] #2 Green indicator when ssh_key_id is present
- [x] #3 Amber/warning indicator when ssh_key_id is null
- [x] #4 Tooltip shows KMS key ID when available
- [x] #5 Device detail view has SSH Key Management section
- [x] #6 Section displays key ID in monospace/code format
- [x] #7 Clear messaging when key not yet generated
- [x] #8 Deployment dialog shows SSH key status in preflight checks
- [x] #9 Warning (not error) shown if key missing - deployment can still proceed
- [x] #10 Translation keys added for all SSH key status messages
- [x] #11 Components use consistent styling with existing UI patterns
- [x] #12 Accessible tooltips and status indicators
- [x] #13 Loading state handled during data fetch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Locate device list/detail/deployment UI components and current device data shape\n2. Add SSH key status indicator for list rows with tooltip\n3. Add SSH Key Management section in device detail\n4. Update deployment preflight checks to include SSH key status\n5. Add i18n keys and wire to UI\n6. Verify loading states and accessibility; update tests if present
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added SSH key status badge with tooltip in device list, SSH Key Management section in device details, and SSH key preflight status in connectivity check dialog. Added i18n keys for SSH key status messages (en/es).
<!-- SECTION:NOTES:END -->
