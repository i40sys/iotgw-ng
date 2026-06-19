---
id: TASK-046
milestone: CRUD networks
parent_task_id: TASK-052
title: Support network rename and CIDR-change semantics against Netmaker
status: To Do
assignee: []
created_date: '2026-04-22 05:06'
labels:
  - networks
  - netmaker
  - kestra
  - ansible
dependencies:
  - TASK-045
references:
  - kestra/data/main/iotgw-ng/_files/network_update.yml
  - backlog/docs/doc-008 - Domains-Networks-and-Devices-Architecture.md
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
network_update.yml uses name='{{ record.id | replace("-","") }}' (UUID-derived, immutable) with state: present. Consequences:
- Renaming a network in Supabase is a no-op against Netmaker (Netmaker netid never changes).
- CIDR changes are not actively reconciled — state: present is create-if-absent, not enforce-desired-state.

## Decide and implement
(a) Add real rename support — likely needs collection changes or a delete+recreate dance (with the data loss that implies for clients), OR
(b) Document that Netmaker netid is opaque/immutable and the user-visible name is Supabase-only; surface this in the UI (banner on the network detail page).

Either way, file an ADR in backlog/decisions/ and update doc-008.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR added under backlog/decisions/ describing the chosen approach and trade-offs
- [ ] #2 network_update.yml reflects the chosen behavior
- [ ] #3 doc-008 updated to match reality
- [ ] #4 If approach (b): UI shows banner 'Network identifier in Netmaker is immutable' on the detail page
- [ ] #5 Manual test: UPDATE webhook with renamed name AND with changed CIDR both produce the documented behavior
<!-- AC:END -->
