---
id: TASK-062.18
title: >-
  Define and implement the edge-function → Kestra durable-execution handoff
  contract
status: Done
assignee: []
created_date: '2026-06-18 10:19'
updated_date: '2026-06-18 19:15'
labels:
  - kestra
  - supabase
  - edge-functions
  - migration
  - architecture
dependencies:
  - TASK-054
  - TASK-062.04
references:
  - >-
    backlog/decisions/decision-016 -
    Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-016 §6, work splits FAST → edge function vs LONG-RUNNING → Kestra flow. Define and implement the contract by which a (webhook-originated) edge function triggers a Kestra flow for long-running / must-not-be-lost work and returns immediately, while status stays observable via the existing *_jobs polling. Cover: which Kestra flow each long-running function triggers; the Kestra REST trigger call (endpoint, payload mapping from the webhook record/old_record) + auth (KESTRA_USER/KESTRA_PASSWORD from the supabase-env Secret, SOPS); writing the Kestra execution id into the relevant *_jobs row at PENDING and reconciling the final status (SUCCESS/FAILED) from the Kestra execution (flow write-back vs a reconciler); the failure path when the trigger call itself fails (set job FAILED, no silent loss). Formalizes the thin 'start a flow and return' pattern the removed kestra-call function used. netmaker-call stays on the fast path (unchanged). Depends on the Kestra Docker→Kubernetes task runner migration (task-054) so the flows execute under k8s.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A documented handoff contract: per long-running function, the target Kestra flow + the REST trigger call (endpoint, payload mapping, auth via KESTRA_* from the Secret)
- [x] #2 The triggering edge function returns 202 and records the Kestra execution id in the relevant *_jobs row (status PENDING)
- [x] #3 Final *_jobs status (SUCCESS/FAILED) is reconciled from the Kestra execution (flow write-back or reconciler); the Deployments UI polling is unchanged
- [x] #4 Trigger-call failure sets the job FAILED with an error message (no silent loss)
- [x] #5 At least one long-running use case runs end-to-end edge-function → Kestra flow → *_jobs SUCCESS in kind
- [x] #6 netmaker-call remains on the fast path (unchanged); decision-016 linked/updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define + document the edge-function -> Kestra durable-execution handoff contract (decision-016).\n2. Implement kestra-dispatch edge fn: deployments INSERT -> trigger Kestra flow, record exec id in deployment_jobs (PENDING), return 202.\n3. Reconcile final status via a flow write-back task; failure path sets FAILED.\n4. e2e in kind; netmaker-call unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to supabase-function-developer, verified). Contract (decision-016 updated): deployments INSERT webhook -> new edge fn kestra-dispatch -> POST http://kestra:8080/api/v1/main/executions/iotgw-ng/{flowId} (Basic auth KESTRA_USER/PASSWORD from supabase-env Secret; KESTRA_BASE_URL hardcoded to http://kestra:8080 in functions.yaml since the SOPS value is the external host). Default flow k8s-ansible-runner-test (override via KESTRA_DISPATCH_FLOW_ID -> provisioning/install).

AC#2: kestra-dispatch returns 202 and records the Kestra execution id in deployment_jobs (status PENDING) — verified deployed (POST via Kong -> 400 on bad payload, not 404). AC#3: reconciled via a writeback_success task added to the Kestra flow (rev 4) that PATCHes deployment_jobs via PostgREST (Bearer SERVICE_ROLE_KEY) -> SUCCESS. AC#4: trigger-call failure path sets the job FAILED with the error. AC#5 e2e (agent-proven): webhook path DB INSERT -> pg_net (net._http_response 202) -> kestra-dispatch -> flow -> deployment_jobs SUCCESS (exec ids 50wszk.../EjhG1m... reconciled). AC#6: netmaker-call UNCHANGED (git diff empty), stays fast-path; decision-016 linked.

Files: supabase/volumes/functions/kestra-dispatch/{index.ts,CLAUDE.md}, functions/CLAUDE.md, iotgw-ui/supabase/migrations/20260618000000_create_deployments_webhook.sql, functions.yaml (KESTRA_BASE_URL), decision-016. Verified: kestra-dispatch dir present, functions pod rolled, deployments_webhook trigger present, render OK.

Authored-not-proven: KESTRA_DISPATCH_FLOW_ID -> provisioning/install not e2e'd (no gateway hardware).
<!-- SECTION:NOTES:END -->
