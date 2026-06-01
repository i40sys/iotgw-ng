---
id: TASK-043
milestone: CRUD networks
parent_task_id: TASK-052
title: Fix kestra-call edge function to handle network DELETE payloads
status: To Do
assignee: []
created_date: '2026-04-22 05:05'
labels:
  - networks
  - supabase
  - edge-function
dependencies:
  - TASK-042
references:
  - supabase/volumes/functions/kestra-call/index.ts
  - kestra/data/main/iotgw-ng/_files/network_delete.yml
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mirror the devices DELETE handling inside the 'networks' branch of the kestra-call edge function so DELETE webhooks (which only carry old_record) don't throw 'Missing top-level record'.

## Background
Verified at supabase/volumes/functions/kestra-call/index.ts ~line 595: case 'networks' reads only (body as any).record. The devices branch (line ~640) already does:
  const op = (body as any).type
  const deviceRecord = op === 'DELETE' ? body.old_record : body.record
The networks branch must do the same. STEP 3 (lines ~720-740) and STEP 4 background polling (~778-798) also need the equivalent old_record fallback.

## Required because
Once task-042 lands and the DELETE trigger fires, the function will receive {type:'DELETE', table:'networks', old_record:{...}, record:null} and currently throws.

## Acceptance details
- 'PENDING' job row carries network_id/name/cidr/ipv4/ipv6 from old_record
- The execution is dispatched to flow iotgw-ng/networks (the flow already has a DELETE branch — verified at revision 58)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DELETE payload (record=null, old_record populated) creates a network_jobs row with the right network_id, network_name, network_cidr, network_ipv4, network_ipv6
- [ ] #2 Kestra execution is started against iotgw-ng/networks and reaches the DELETE branch (network_delete.yml runs)
- [ ] #3 Job transitions PENDING -> RUNNING -> SUCCESS and Netmaker no longer has the network
- [ ] #4 Existing INSERT and UPDATE behavior unchanged (regression check: create + edit a network end-to-end still works)
- [ ] #5 TypeScript: types and logging messages reflect the union (record OR old_record)
<!-- AC:END -->
