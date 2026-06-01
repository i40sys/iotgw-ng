---
id: TASK-051
milestone: CRUD networks
parent_task_id: TASK-052
title: End-to-end verification of network CRUD against running stack
status: To Do
assignee: []
created_date: '2026-04-22 05:07'
labels:
  - networks
  - kestra
  - supabase
  - qa
dependencies:
  - TASK-042
  - TASK-043
  - TASK-044
  - TASK-045
references:
  - supabase/volumes/functions/kestra-call/index.ts
  - kestra/data/main/iotgw-ng/_files/network_update.yml
  - kestra/data/main/iotgw-ng/_files/network_delete.yml
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prove the post-fix stack actually works for all CRUD operations and address combinations.

## Steps in the running stack (UI -> Supabase -> Kestra -> Netmaker)
1. CREATE network via UI
   - Observe network_jobs row appears with status PENDING -> RUNNING -> SUCCESS
   - Observe Kestra execution against iotgw-ng/networks (else branch)
   - Observe network exists in Netmaker (https://api.netmaker.i40sys.com)
2. UPDATE network (CIDR change; rename per task-046 outcome)
   - Observe new job, observe reconciliation
3. DELETE network via UI
   - Observe network_jobs row, Kestra DELETE branch executed, network removed from Netmaker
4. Repeat 1-3 for: IPv4-only, IPv6-only, dual-stack

## Output
Short report attached to the task notes; defects filed as follow-up tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All four scenarios (IPv4-only, IPv6-only, dual-stack, mixed flows) pass for CREATE/UPDATE/DELETE
- [ ] #2 Test report appended to Implementation Notes with execution IDs and Netmaker observations
- [ ] #3 Any defects discovered are filed as new backlog tasks under the same milestone
<!-- AC:END -->
