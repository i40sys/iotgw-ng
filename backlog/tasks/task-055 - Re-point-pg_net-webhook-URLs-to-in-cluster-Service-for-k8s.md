---
id: TASK-055
title: >-
  Re-point + validate pg_net webhook URLs to the in-cluster Service, asserting
  net.http_post actually fires
status: Done
assignee: []
created_date: '2026-06-12 22:15'
updated_date: '2026-06-18 17:27'
labels:
  - supabase
  - pg_net
  - k8s
  - migration
  - compose-removal
milestone: Decommission docker-compose
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Engine-neutral core (applies to the current StatefulSet too — do NOT gate on the StackGres spike): re-run the devices/networks webhook migrations (iotgw-ui/supabase/migrations/20260610000000 and 20260610000001) so the trigger target moves from http://wsl.ymbihq.local:8000/functions/v1/netmaker-call to the in-cluster kong/functions Service URL. ADD a hard assertion that the pg_net bgworker actually FIRES (not just that the URL string changed): a device INSERT and a network INSERT must each produce a row in net._http_response AND a corresponding device_jobs/network_jobs row. Closes the silent-failure hole (a net.http_post failure leaves the trigger returning NEW with no error). This assertion is reused by the spike and by TASK-062.10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Webhook trigger URLs parameterized/re-pointed to the in-cluster kong Service per environment
- [x] #2 A device INSERT and a network INSERT each produce a net._http_response row AND a corresponding *_jobs row
- [x] #3 Validation runs in kind as part of the smoke path and is reusable by the spike
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-point tracked source migrations 20260610000000/01 from compose host wsl.ymbihq.local:8000 to in-cluster kong:8000 (engine-neutral Service DNS).\n2. Author tools/smoke-pgnet.sh: side-effect-free assertion that a device+network INSERT each drive net.http_post -> net._http_response (202) + a *_jobs row.\n3. Wire the assertion into tools/verify.sh kind smoke (reusable by spike/062.10).\n4. Validate live on the kind cluster.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done & validated live on the iotgw kind cluster.

AC#1 — re-pointed both tracked source migrations (iotgw-ui/supabase/migrations/20260610000000_repoint_devices_webhook_to_netmaker.sql and 20260610000001_repoint_networks_webhook_to_netmaker.sql) from the host-routed compose URL http://wsl.ymbihq.local:8000 to the in-cluster Service DNS http://kong:8000/functions/v1/netmaker-call. 'kong:8000' resolves on BOTH the supabase compose network and the k8s Service, so it is engine-neutral and a fresh apply reproduces the live k8s trigger state (live DB already had kong:8000; tracked source was stale — that gap is now closed).

AC#2 — new tools/smoke-pgnet.sh does a FRESH device INSERT and network INSERT and asserts each produces (a) a net._http_response row with HTTP 202 (tied via supabase_functions.hooks.request_id) AND (b) a corresponding device_jobs/network_jobs row. Validated live twice: net._http_response id=11 (network) and id=12 (device), both 202 + job rows. Closes the silent-failure hole — net._http_response had 0 rows at start (TTL-cleaned), proving a URL-string check alone is insufficient. Side-effect-free vs production Netmaker: the network row uses NULL ipv4_cidr (provisionNetwork throws before any POST /networks) and the device attaches to that un-provisioned network (provisionDevice finds no Netmaker network); both test rows + all their *_jobs rows are cleaned up by id (covers the async delete-webhook job rows too). Verified zero residue after run.

AC#3 — wired into tools/verify.sh kind smoke right after the netmaker-call dispatch check (skippable via SKIP_PGNET_SMOKE=1). The script is standalone and reusable by the StackGres spike and task-062.10's extended smoke.
<!-- SECTION:NOTES:END -->
