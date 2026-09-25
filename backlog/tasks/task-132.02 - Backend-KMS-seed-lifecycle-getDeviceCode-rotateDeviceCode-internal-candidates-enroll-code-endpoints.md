---
id: TASK-132.02
title: >-
  Backend: KMS seed lifecycle, getDeviceCode/rotateDeviceCode, internal
  candidates + enroll-code endpoints
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
labels:
  - backend
  - kms
  - security
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §1/§2. services/device-code.ts: create/rotate the Cosmian symmetric seed (device_totp_<uuid>_<n>), compute RFC 6238 codes in memory; seed on device create + lazily; tRPC getDeviceCode/rotateDeviceCode (replace incrementTotpCounter); POST /internal/device-auth/candidates (DEVICE_AUTH_TOKEN) and /internal/devices/enroll-code (OPS_CERT_MINT_TOKEN).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The seed is never returned or persisted outside the KMS
- [x] #2 getDeviceCode offers the next step's code when the current one is spent; rotate gives a new seed
- [x] #3 Internal endpoints reject a missing/wrong bearer; unit tests cover code computation against RFC 6238 vectors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done.** `services/device-code.ts` (seed create/rotate/get via KMIP, RFC 6238 in memory), tRPC getDeviceCode/rotateDeviceCode, `/internal/device-auth/candidates` + `/internal/devices/enroll-code` (constant-time bearer).
- KMIP verified against the real Cosmian: Create SymmetricKey AES-256 (TransparentSymmetricKey, usage mask 384), Get Raw → 32 bytes.
- Tests: RFC 6238/4226 vectors, next-step behaviour, rotation, bearer 503/401 (backend 34 tests).
- Live: gw-c3 seed `device_totp_9a8ce31d-…_1` created lazily; getDeviceCode returns `next:true` after the current step was used.
<!-- SECTION:NOTES:END -->
