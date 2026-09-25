---
id: TASK-132.02
title: >-
  Backend: KMS seed lifecycle, getDeviceCode/rotateDeviceCode, internal
  candidates + enroll-code endpoints
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
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
- [ ] #1 The seed is never returned or persisted outside the KMS
- [ ] #2 getDeviceCode offers the next step's code when the current one is spent; rotate gives a new seed
- [ ] #3 Internal endpoints reject a missing/wrong bearer; unit tests cover code computation against RFC 6238 vectors
<!-- AC:END -->
