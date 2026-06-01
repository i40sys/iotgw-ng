---
id: task-007
title: Add backend procedure for device connectivity check
status: Done
assignee: []
created_date: '2025-11-26 06:28'
updated_date: '2025-11-27 08:30'
labels:
  - backend
  - deployments
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a new tRPC procedure that performs ping and Ansible connectivity checks against a device. This will be called by the "Check Online" button in Steps 1 and 3.

The procedure should execute via Kestra workflow or direct SSH commands and return structured results including ping output and ansible ping output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tRPC procedure checkDeviceConnectivity exists in devices router
- [x] #2 Procedure accepts deviceId and returns ping result and ansible result
- [x] #3 Errors are properly handled and returned in structured format
- [x] #4 Results include raw output for tooltip display
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add checkDeviceConnectivity procedure to devices router
2. Define Zod schemas for input (deviceId) and output (ping/ansible results with raw output)
3. Implement Kestra workflow execution for ping check
4. Implement Kestra workflow execution for ansible ping check
5. Add proper error handling and structured response format
6. Run typecheck to verify implementation
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `checkDeviceConnectivity` mutation procedure in the devices router (`apps/backend/src/routers/devices.ts:541-818`).

**Implementation details:**
- Added new tRPC mutation procedure `checkDeviceConnectivity` that accepts `deviceId` as input
- Fetches device information from Supabase to get IP address
- Handles case where device has no IP configured with structured error response
- Executes connectivity check via Kestra workflow at `iotgw-ng/connectivity-check`
- Polls Kestra API for execution completion (30 second timeout, 1 second intervals)
- Returns structured result with:
  - `success`: boolean - overall success (both ping and ansible must succeed)
  - `ping`: object with `success`, `error`, `rawOutput`, `latency`
  - `ansible`: object with `success`, `error`, `rawOutput`

**Kestra output parsing:**
- ICMP Ping: Extracted from `icmp_ping` task's `outputs.vars.outputs` array, looking for item with `rc === 0` and `cmd` containing "ping"
- Ansible: Extracted from `install_openwrt` task's `outputs.exitCode === 0` and `state.current === "SUCCESS"`
- Latency parsed from stdout using regex `time[=<](\d+(?:\.\d+)?)\s*ms`

**Debug logging:**
- Added comprehensive debug logging to `connectivity-debug.log` for troubleshooting
- Logs all Kestra API calls, poll responses, and parsed results
<!-- SECTION:NOTES:END -->
