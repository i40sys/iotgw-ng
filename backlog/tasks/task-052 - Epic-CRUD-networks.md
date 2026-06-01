---
id: TASK-052
title: 'Epic: CRUD networks'
status: To Do
assignee: []
created_date: '2026-04-22 05:13'
labels:
  - epic
  - networks
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Umbrella task tracking the end-to-end fixes to the network CRUD pipeline (UI -> Supabase -> kestra-call edge fn -> Kestra flow iotgw-ng/networks -> Ansible -> Netmaker).

## Scope (subtasks)
- TASK-042 add DELETE webhook trigger for networks table
- TASK-043 fix kestra-call edge fn to handle network DELETE payloads
- TASK-044 propagate ipv6_cidr to Netmaker (dual-stack)
- TASK-045 externalize Netmaker master_key into Kestra KV
- TASK-046 network rename / CIDR-change semantics
- TASK-047 remove dead kestra-call_delete edge function
- TASK-048 reconcile divergent ansible/netmaker playbooks
- TASK-049 fix Kestra source-of-truth docs (CLAUDE.md vs _files/ vs GitHub)
- TASK-050 add drift check between i40sys/iotgw-kestra and Kestra API
- TASK-051 end-to-end verification of network CRUD

## Done when
All children are Done and TASK-051 verification report is attached.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 10 child tasks (TASK-042..TASK-051) are Done
- [ ] #2 TASK-051 verification report attached and shows green for IPv4-only / IPv6-only / dual-stack on CREATE / UPDATE / DELETE
- [ ] #3 No regression in device CRUD (smoke check)
<!-- AC:END -->
