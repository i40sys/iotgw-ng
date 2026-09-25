---
id: TASK-132.01
title: 'DB: seed reference, single-use code ledger, lockout and renew RPCs'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
labels:
  - database
  - security
dependencies: []
parent_task_id: TASK-132
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-033 §1/§3/§5. Migration adding devices.totp_seed_id/totp_seed_rotated_at/totp_failures/totp_locked_until/ssh_renew_last_ts, table device_otp_uses, SECURITY DEFINER RPCs consume_device_otp, record_device_otp_failure, consume_device_renew (service_role only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Migration applies on the kind StackGres DB and contract types are regenerated
- [ ] #2 consume_device_otp refuses a reused or older step per device+seed+purpose, atomically
- [ ] #3 5 failures lock the device for 15 min; renew timestamps are monotonic
<!-- AC:END -->
