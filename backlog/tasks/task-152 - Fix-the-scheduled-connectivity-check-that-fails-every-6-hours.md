---
id: TASK-152
title: Fix the scheduled connectivity-check that fails every 6 hours
status: Done
assignee: []
created_date: '2026-09-29 15:06'
updated_date: '2026-09-29 15:29'
labels:
  - kestra
  - ovh
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** The `connectivity-check` flow's `schedule` trigger (`0 */6 * * *`) runs with no per-device `json_data` since task-092 moved it to a backend-driven payload, so every scheduled run fails (runner pod exit 4). It failed the same way on kind, and now fails on OVH (e.g. 2026-09-29 12:00 UTC). The runner log also shows the `kestra` ServiceAccount cannot list `events` in its namespace.

**Decide:** remove the schedule (checks stay on-demand from the UI), or replace it with a backend-driven periodic sweep over provisioned devices. Never target the banned ranges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No more failed scheduled connectivity-check executions (schedule removed or per-device sweep working)
- [x] #2 kestra-pod-runner Role allows listing events (or the warning is otherwise resolved)
- [x] #3 Change released through iotgw-kestra and synced on OVH
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Schedule removed (2026-09-29).**

**Decision:** remove, not replace. The cron run could only use the dummy `0.0.0.0` default (no device identity) and failed by design every 6 h; real checks are per device and on demand from the UI. A periodic sweep would be a new feature, not a fix.

**What changed:**
- i40sys/iotgw-kestra `9a705c1`: `connectivity-check-flow.yaml` without `triggers:` (+ wording). Registered via the Kestra API (`PUT /api/v1/main/flows/iotgw-ng/connectivity-check`, validate first) on **OVH and kind** — revision 9, 0 triggers; the trigger is gone from `/triggers/search`.
- `deploy/k8s/base/kestra/kestra-rbac.yaml`: `kestra-pod-runner` may get/list/watch `events` (applied on OVH via `tf.sh platform apply`, on kind via kubectl); `auth can-i list events` = yes on both.
- `deploy/kind/bootstrap.sh` / `deploy/README.md`: kind now only disables `ssh-ca-renewal` (connectivity-check has no schedule).
<!-- SECTION:NOTES:END -->
