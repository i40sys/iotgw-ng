---
id: TASK-041
title: Generate SSH key when missing
status: Done
assignee: []
created_date: '2026-03-03 06:02'
updated_date: '2026-03-03 06:07'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create or trigger SSH key generation when a device has no ssh_key_id, ensuring the key is created in KMS and the device record is updated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Workflow detects missing ssh_key_id and triggers key generation
- [x] #2 KMS key created with expected tags/naming
- [x] #3 Device record updated with new ssh_key_id
- [x] #4 Operation is idempotent and safe to retry
- [x] #5 Errors surface clear messages in logs and/or UI
- [x] #6 Tests or manual validation steps documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add backend mutation to trigger Kestra devices flow when ssh_key_id is missing\n2. Poll Kestra for completion and update device record with expected key ID\n3. Add UI action to generate key from device detail when missing\n4. Add translations and tests\n5. Document validation steps
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added backend mutation generateMissingSshKey to trigger Kestra devices flow when ssh_key_id is missing, poll for completion, and update device record with expected key ID (device_ssh_<device_id>). Added UI action in device details to trigger generation when missing with toast feedback. Tests: pnpm --filter @iotgw/backend test:run -- --runTestsByPath src/routers/__tests__/sshKeyId.test.ts
<!-- SECTION:NOTES:END -->
