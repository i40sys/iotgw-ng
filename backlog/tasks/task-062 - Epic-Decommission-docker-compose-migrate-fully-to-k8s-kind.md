---
id: TASK-062
title: 'Epic: Decommission docker-compose (migrate fully to k8s/kind)'
status: Done
assignee: []
created_date: '2026-06-18 05:41'
updated_date: '2026-06-18 19:59'
labels:
  - migration
  - compose-removal
  - k8s
  - epic
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove every docker-compose stack from the monorepo and run the whole platform on Kubernetes (kind locally; per decision-015). Analysis on 2026-06-18 (compose->k8s parity workflow) concluded compose must NOT be deleted immediately and removal must be the TERMINAL step gated on validated k8s parity. Hard gaps today: the full Supabase data plane (realtime/storage/imgproxy/analytics/supavisor/vector/studio) has NO k8s manifests (deferred to the unstarted supabase-kubernetes Helm chart, task-056); the Kestra Docker task runner that executes the OpenWRT Ansible flows mounts host docker.sock and has no k8s equivalent (task-054); the pg_net provisioning webhooks hardcode the compose host port :8000 (task-055); iotgw-ui (frontend+backend) runs off-cluster with zero k8s manifests; and the Supabase app tier (kong/auth/rest/meta/functions) is wired into the kind overlay but not yet certified at parity. No existing ADR mandates compose deletion (decision-013/015 treat compose and kind as co-equal), so the milestone also authorizes the policy. This epic groups the migration tasks; the terminal deletion task is gated on end-to-end parity validation plus the orchestrator/doc rewire. Absorbs existing tasks 054/055/056/057.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All child tasks of this milestone are Done
- [x] #2 Every docker-compose file is deleted and 'just bootstrap' brings the full stack up on kind with no compose reference
- [x] #3 git grep 'docker compose'/'docker-compose' returns only historical ADRs (with forward-notes), not live instructions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Epic complete — docker-compose decommissioned; the platform runs entirely on Kubernetes (kind locally).

AC#1: all child tasks Done — 062.01-062.18 + the absorbed 054/055/056/057, all ✔ Done.
AC#2: every docker-compose file deleted (062.15); 'just bootstrap' = 'kind-up k8s-deploy k8s-smoke' with no compose reference (verified) and brings up the full stack on kind — validated end-to-end at parity with compose (062.11: real device/network provision -> netmaker-call -> job SUCCESS; Ansible flow via the k8s PodCreate runner; backend KMS mint/fetch with auth; auth/rest/functions via Kong; 'just verify' all-green). Reproducibility caveat: Kestra flow/KV re-seed is a documented follow-up (062.05), not a compose dependency.
AC#3: git grep 'docker compose'/'docker-compose' over tracked source returns only historical ADRs (forward-noted) + decommission forward-notes + the stack-operator tombstone — no live instructions.

What landed: StackGres SGCluster DB tier (decision-018) replacing the StatefulSet; Supabase app tier validated on kind; Kestra Ansible flows on the k8s PodCreate runner (no docker.sock) with flows+KV in the k8s Postgres; iotgw-ui containerized + deployed; Cosmian KMS API-token auth + NetworkPolicy; reproducible vendored ingress-nginx + prod TLS; edge-function->Kestra durable-execution handoff (decision-016); pg_net webhook re-point + fire-assertion (055); justfile/secrets/docs rewired k8s-first; compose files staged then deleted with a recovery note.
<!-- SECTION:NOTES:END -->
