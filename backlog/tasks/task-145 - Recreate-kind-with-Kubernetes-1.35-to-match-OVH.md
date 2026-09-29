---
id: TASK-145
title: Recreate kind with Kubernetes 1.35 to match OVH
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
labels:
  - kind
  - versions
dependencies:
  - TASK-142
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** The user wants kind and OVH on the same versions when compatible. KMS (5.27.1) and StackGres (1.19.1) are aligned; Kubernetes is not: kind 1.31.12 vs OVH 1.35.2. A kind node image change needs a cluster recreate (local data is lost; backups in `~/.local/share/iotgw-migration/2026-09-29/`).

**Watch:** extraPortMappings, fresh-cluster bring-up races, kind's containerd version (OVH is 2.2).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 deploy/kind node image pinned to a 1.35.x kindest/node
- [ ] #2 just bootstrap passes on the recreated cluster (smoke + e2e)
- [ ] #3 Dev data restored or reseeded
<!-- AC:END -->
