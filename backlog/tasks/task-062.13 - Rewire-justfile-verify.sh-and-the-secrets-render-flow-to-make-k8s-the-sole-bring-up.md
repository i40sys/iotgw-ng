---
id: TASK-062.13
title: >-
  Rewire justfile, verify.sh, and the secrets render flow to make k8s the sole
  bring-up
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:29'
labels:
  - k8s
  - migration
  - compose-removal
  - tooling
dependencies:
  - TASK-062.11
  - TASK-062.10
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove compose orchestration from the justfile: delete the compose_stacks var and the up/down/up-all/down-all recipes, rewrite status to use kubectl, and repoint bootstrap (currently depends on up-all) to kind-up/k8s-deploy/k8s-smoke. Prune tools/secrets/secrets.sh DEST[] of compose-only .env targets (supabase/.env, kestra/.env) while keeping pnpm-dev consumers, and confirm tools/verify.sh covers the app tier + iotgw-ui. Do this atomically with (or immediately before) deletion so no recipe references a deleted compose file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 justfile compose_stacks var + up/down/up-all/down-all recipes removed; status uses kubectl; bootstrap chains kind-up/k8s-deploy/k8s-smoke
- [x] #2 secrets.sh render map pruned of compose-only targets (supabase/.env, kestra/.env); k8s Secret path remains the in-cluster source
- [x] #3 'just verify' passes and covers the supabase app tier + iotgw-ui in kind
- [x] #4 No just recipe references a docker-compose file
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. justfile: drop compose_stacks + up/down/up-all/down-all; status -> kubectl; bootstrap -> kind-up/k8s-deploy/k8s-smoke.\n2. secrets.sh: prune compose-only render targets (supabase/.env, kestra/.env); keep k8s + pnpm-dev paths.\n3. Confirm just verify covers app tier + iotgw-ui; no recipe references compose.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. AC#1: justfile rewritten — removed compose_stacks var + the up/down/up-all/down-all recipes; status now runs 'kubectl -n iotgw get pods'; bootstrap now chains 'kind-up k8s-deploy k8s-smoke' (was 'secrets-render up-all status'). AC#2: tools/secrets/secrets.sh DEST render-map pruned of the compose-only targets [supabase]=supabase/.env and [kestra]=kestra/.env (kept netmaker, kestra-reporter, iotgw-ui-root, iotgw-ui-backend pnpm-dev consumers); the k8s Secret path ('secrets.sh k8s <name> …') reads secrets/<name>.enc.env DIRECTLY (not via DEST), verified it still emits the supabase-env Secret. AC#3: 'just verify' passes (ALL VERIFICATIONS PASSED) and covers the app tier (Kong GoTrue/PostgREST/functions/netmaker-call) + iotgw-ui (via ingress) + pg_net fire in kind. AC#4: grep confirms NO docker-compose reference in any just recipe. just --list renders cleanly.
<!-- SECTION:NOTES:END -->
