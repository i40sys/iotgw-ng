---
id: TASK-062.01
title: >-
  Authorize docker-compose decommission (supersede the parallel-paths ADR
  stance)
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 13:22'
labels:
  - migration
  - compose-removal
  - decision
  - docs
dependencies: []
references:
  - >-
    backlog/decisions/decision-017 -
    Authorize-docker-compose-Decommission-and-make-Kubernetes-the-sole-supported-runtime.md
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-013/015 frame docker-compose and kind/k8s as co-equal parallel dev paths; no existing ADR mandates compose deletion. Author a new decision (or amend decision-015) making kind/k8s the single supported bring-up path and authorizing eventual deletion of all compose files and compose-coupled just recipes. Capture the policy and the validated-parity preconditions (Supabase app tier validated, Helm data plane, Kestra runner+flows, webhooks repointed, iotgw-ui in k8s).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New decision file under backlog/decisions/ authorizes removing all docker-compose stacks and supersedes the parallel-paths stance
- [x] #2 Decision lists the parity preconditions that must be met before any deletion
- [x] #3 decision-013 and decision-015 carry a forward-note linking to the new decision (history not rewritten)
<!-- AC:END -->







## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
decision-017 authorizes making Kubernetes the sole supported runtime and deleting all docker-compose stacks as the terminal step of TASK-062, gated on validated k8s parity (preconditions enumerated). Supersedes the co-equal-parallel-paths stance; forward-notes added to decision-013 and decision-015.
<!-- SECTION:FINAL_SUMMARY:END -->
