---
id: TASK-062.10
title: >-
  Extend verify.sh kind-smoke to cover the Supabase API path, netmaker-call, and
  iotgw-ui
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 13:29'
labels:
  - k8s
  - migration
  - compose-removal
  - tooling
  - validation
  - stackgres
dependencies:
  - TASK-062.04
  - TASK-062.08
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/verify.sh check 6 (kind smoke) currently probes only KMS :9998/version, Kestra :8080/ui/, and whoami via ingress. Once the Supabase app tier, data plane, and iotgw-ui run on kind, the repeatable verification harness must exercise them, or 'just verify' will pass with the migrated services completely untested after compose is deleted (false confidence at the most destructive step).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 verify.sh probes the Kong/Supabase API path (auth endpoint reachable + one PostgREST query via :8000) when the cluster is up
- [x] #2 verify.sh smoke-tests netmaker-call reachability via /functions/v1/ (HTTP, not full provisioning)
- [x] #3 verify.sh smoke-tests the iotgw-ui frontend and backend endpoints once they are in-cluster
- [x] #4 All new checks SKIP cleanly (not FAIL) when the cluster is down, matching the existing check-6 pattern
- [ ] #5 Smoke waits for the StackGres SGCluster to be Ready (operator + Patroni + extension .so download is slower than a plain StatefulSet)
- [ ] #6 Smoke asserts a pg_net net._http_response / *_jobs row after a device/network create (reusing task-055 assertion)
<!-- AC:END -->









## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DONE (core extension, validated live). tools/verify.sh check 6 now probes: GoTrue :8000/auth/v1/health and PostgREST :8000/rest/v1/ via Kong (accepts 200|401 = routed to a live service), edge functions /functions/v1/hello (200), and netmaker-call dispatch (POST invalid table -> 400, NO provisioning side effect). All validated against the running kind stack. iotgw-ui checks are gated on the in-cluster Deployment (deploy iotgw-ui-frontend) so a host pnpm-dev server cannot give a false PASS — currently SKIP until task-062.08. All new checks live inside the 'if kind cluster up' block so they SKIP cleanly when down. bash -n clean.
DEFERRED (coupled to not-yet-landed tasks, noted in-file): wait-for-SGCluster-Ready belongs with task-056 (no SGCluster in the overlay yet); the deep 'pg_net actually fired' assertion (device/network INSERT -> net._http_response row) is task-055's dedicated side-effecting check, intentionally not run in this non-mutating smoke — verify.sh will call it once 055 lands.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
verify.sh kind-smoke extended to cover the Supabase API path (GoTrue + PostgREST via Kong), edge functions, and netmaker-call dispatch — all validated live; iotgw-ui checks gated on the in-cluster Deployment (SKIP until 062.08). Two forward-coupled ACs (SGCluster-ready wait, pg_net-fired assertion) deferred to 056/055.
<!-- SECTION:FINAL_SUMMARY:END -->
