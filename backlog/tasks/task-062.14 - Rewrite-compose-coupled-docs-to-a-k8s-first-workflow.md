---
id: TASK-062.14
title: Rewrite compose-coupled docs to a k8s-first workflow
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 19:49'
labels:
  - docs
  - migration
  - compose-removal
dependencies:
  - TASK-062.13
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the compose-coupled docs so contributors are not pointed at deleted stacks: root README (drop the compose quickstart) and CLAUDE.md (Service Ports + 'bringing up a stack'), supabase/CLAUDE.md, kestra/CLAUDE.md, kms/CLAUDE.md + README + DOCKER_FIXES.md (obsolete) + ssh-test/pki-test READMEs, supabase/volumes/functions/CLAUDE.md + netmaker-call/CLAUDE.md (env-injection + restart workflow), the .claude agents (retire/fold stack-operator into k8s-operator; update supabase-function-developer), and the _supabase-notes skill files; add forward-notes on decision-013/014 + doc-010/doc-016. Update .env.example comments and drop the vestigial iotgw-ui/.gitignore docker-compose.override.yml line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No tracked doc instructs 'docker compose up/down/restart/logs' for the platform stacks (excluding historical ADRs, which get forward-notes)
- [x] #2 stack-operator agent retired or folded into k8s-operator; k8s-operator made the sole stack operator
- [x] #3 kms/DOCKER_FIXES.md deleted/archived; .env.example compose comments updated to the k8s/Secret model
- [x] #4 supabase functions CLAUDE.md + netmaker-call CLAUDE.md describe k8s env-injection + image bake/rollout, not the compose bind-mount restart workflow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite root + subproject docs (README/CLAUDE.md/functions) to k8s-first.\n2. Retire stack-operator agent into k8s-operator.\n3. Archive kms/DOCKER_FIXES.md; update .env.example comments; drop .gitignore compose line.\n4. Forward-notes on historical ADRs/docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to backlog-docs-architect, verified). AC#1: git grep confirms NO tracked doc instructs 'docker compose up/down/restart/logs' for a platform stack (root README/CLAUDE.md, supabase/kestra/kms CLAUDE.md+README, _supabase-notes + supabase/.claude skills all rewritten to kubectl/just/StackGres; historical ADRs/docs decision-013/014 + doc-010/016 got forward-notes, not gutted). AC#2: stack-operator.md rewritten to a RETIRED tombstone redirecting to k8s-operator; k8s-operator made the sole stack operator; supabase-function-developer + kestra-expert agents de-compose'd. AC#3: kms/DOCKER_FIXES.md archived with an OBSOLETE forward-note; kestra/.env.example + kms/.env.example comments moved to the k8s/Secret model; iotgw-ui/.gitignore docker-compose.override.yml line dropped. AC#4: supabase/volumes/functions/CLAUDE.md + netmaker-call/CLAUDE.md now describe k8s env-injection (supabase-env Secret) + image bake/kind-load/rollout-restart, not the compose bind-mount restart. Residual 'docker compose' hits are all intentional (forward-notes/tombstone + the standalone kms/ssh-test/docker-test SSH-auth test fixture, which 062.15 removes). Secret hygiene still clean; docs-only, no cluster touched.
<!-- SECTION:NOTES:END -->
