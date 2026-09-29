---
id: TASK-152
title: Fix the scheduled connectivity-check that fails every 6 hours
status: To Do
assignee: []
created_date: '2026-09-29 15:06'
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
- [ ] #1 No more failed scheduled connectivity-check executions (schedule removed or per-device sweep working)
- [ ] #2 kestra-pod-runner Role allows listing events (or the warning is otherwise resolved)
- [ ] #3 Change released through iotgw-kestra and synced on OVH
<!-- AC:END -->
