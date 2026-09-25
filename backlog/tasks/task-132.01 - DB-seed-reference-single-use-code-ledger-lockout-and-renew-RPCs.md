---
id: TASK-132.01
title: 'DB: seed reference, single-use code ledger, lockout and renew RPCs'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 18:27'
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
- [x] #1 Migration applies on the kind StackGres DB and contract types are regenerated
- [x] #2 consume_device_otp refuses a reused or older step per device+seed+purpose, atomically
- [x] #3 5 failures lock the device for 15 min; renew timestamps are monotonic
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done (2026-09-25).** Migration `20260925000000_device_totp_seed.sql` applied to the kind StackGres DB; contract types updated.
- Verified in rolled-back transactions: reused / older step refused, other purpose/seed accepted; 5 failures lock 15 min; renew timestamps monotonic; RPC execute only for service_role, `authenticated` denied.
- Live: `device_otp_uses` recorded the gw-c3 vpn uses; replay refused.
<!-- SECTION:NOTES:END -->
