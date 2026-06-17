---
id: TASK-060.01
title: Backend Cosmian KMS client + config for SSH key generation
status: To Do
assignee: []
created_date: '2026-06-17 04:53'
labels:
  - ssh
  - kms
  - backend
dependencies: []
parent_task_id: TASK-060
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a backend module that talks to the Cosmian KMS to create (and optionally export) an ed25519 SSH key for a device. This is the reusable primitive the auto-INSERT path and the on-demand backfill both call. No behavior wired yet.

Approach: prefer the KMS REST API (port 9998) from the Fastify backend; if the REST surface is awkward, shelling out to the bundled `cosmian` CLI is acceptable. Model the operations on kms/ssh-test/ and kms/src/kms_tools/convert_keys.py (PKCS8↔OpenSSH). KMS currently runs with no auth (dev) — design the client so a future [authentication] block / service credential can be added via env.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A backend service (e.g. src/services/kms.ts) exposes createDeviceSshKey(deviceId) returning the KMS object id (device_ssh_<id>) and getDeviceSshPublicKey(keyId) returning the OpenSSH public key
- [ ] #2 KMS connection is configured via env (e.g. KMS_URL), sourced from secrets/ (SOPS+age, decision-014) — never hardcoded
- [ ] #3 Idempotent: creating a key that already exists for a device is handled (reuse or force-regenerate) without error
- [ ] #4 Unit tests cover success, already-exists, and KMS-unreachable error paths (KMS mocked)
- [ ] #5 No change yet to device create or generateMissingSshKey behavior (wiring happens in dependent tasks)
<!-- AC:END -->
