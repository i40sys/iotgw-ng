---
id: TASK-064.02
title: >-
  Decide whoami's home (drop, dedicated ns, or move to iotgw-ui) and capture the
  deny-path replacement
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:34'
labels:
  - decision
  - docs
  - networkpolicy
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.01
modified_files:
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make and record the whoami decision flagged across all lenses. whoami currently lives in the iotgw namespace and is the live NEGATIVE test for the KMS NetworkPolicy (a non-allowed pod denied on cosmian-kms:9998). Choose: drop entirely, give it a dedicated `whoami` namespace (headlamp parity), or co-locate in iotgw-ui. Whatever is chosen, name the replacement deny-path subject for the KMS NetworkPolicy validation (e.g. a supabase-app pod, intentionally off the allow-list).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The decision is recorded in decision-020 (or a linked note) with a one-line rationale
- [x] #2 If kept, the target namespace for whoami's Deployment/Service/Ingress is named; if dropped, base/whoami is slated for removal from kustomize
- [x] #3 A concrete replacement KMS-NetworkPolicy deny-path test subject is named for use by T04 and T15
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Resolve the open question; feed the outcome into T03 (kustomize) and T04/T15 (NetworkPolicy negative test).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
whoami DROPPED entirely per user (obsolete traefik-poc remnant). base/whoami removed from kustomize + smoke. KMS NetworkPolicy deny-path test subject = a supabase-app pod (validated: kong-labeled pod DENIED on cosmian-kms.kms:9998).
<!-- SECTION:NOTES:END -->
