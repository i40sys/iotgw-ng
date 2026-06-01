---
id: TASK-044
milestone: CRUD networks
parent_task_id: TASK-052
title: >-
  Propagate ipv6_cidr through network_update.yml to Netmaker (dual-stack
  support)
status: To Do
assignee: []
created_date: '2026-04-22 05:05'
labels:
  - networks
  - netmaker
  - kestra
  - ansible
dependencies: []
references:
  - kestra/data/main/iotgw-ng/_files/network_update.yml
  - ansible/netmaker/galaxy.yml
  - backlog/docs/doc-008 - Domains-Networks-and-Devices-Architecture.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
network_update.yml only sends record.ipv4_cidr to oriolrius.netmaker.netmaker_management. The schema, edge function and network_jobs table all carry ipv6_cidr already (verified). IPv6-only and dual-stack networks are silently broken.

## Change
In network_update.yml: pass ipv6 range when present. Likely 'addressrange6' parameter on the netmaker_management module — verify against the oriolrius.netmaker collection (ansible/netmaker/galaxy.yml + plugins/). Wrap with 'when: record.ipv6_cidr is not none and record.ipv6_cidr | length > 0'. Same change applied in the GitHub repo i40sys/iotgw-kestra (the actual source — see task-049) and synced via sync-namespace-files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 IPv4-only network: regression — still creates with the v4 range only
- [ ] #2 IPv6-only network: creates a Netmaker network with the v6 range and no v4
- [ ] #3 Dual-stack network: creates with both ranges
- [ ] #4 Playbook updated in github.com/i40sys/iotgw-kestra and deployed via sync-namespace-files (verified via API drift check)
- [ ] #5 oriolrius.netmaker collection version pinned in beforeCommands if needed for ipv6 support
<!-- AC:END -->
