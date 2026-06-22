---
id: TASK-062.04
title: >-
  Validate the Supabase app tier (kong/auth/rest/meta/functions) on kind against
  the StackGres SGCluster
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:03'
labels:
  - k8s
  - migration
  - supabase
  - compose-removal
dependencies:
  - TASK-056
references:
  - >-
    backlog/decisions/decision-018 -
    Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scope from validating against the hand-authored supabase-db StatefulSet to validating against the StackGres SGCluster (per the rewritten task-056), for the dev+prod topology. Confirm PostgREST (authenticator -> direct primary), gotrue, meta, and edge functions connect to the SGCluster direct primary; confirm the netmaker-call webhook fires end-to-end (device/network INSERT -> pg_net net.http_post -> /functions/v1/netmaker-call). Keep the existing compose-caveat resolution scope (Kong envsubst substitution, auth/rest env parity). If the spike is NO-GO, fall back to validating against the StatefulSet (this task original form).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 App tier reaches the StackGres SGCluster (direct primary) on kind; all pods Ready
- [x] #2 A device and a network create/delete drives the pg_net webhook to netmaker-call end-to-end (net._http_response + *_jobs rows)
- [x] #3 Compose caveats from the original task (Kong envsubst substitution, auth/rest env parity) remain resolved
- [x] #4 Documented fallback to the StatefulSet path if the spike is NO-GO
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Install StackGres operator 1.17.4 (helm) into the live kind cluster.\n2. Switch DB tier kustomize: drop supabase-db StatefulSet from base; add supabase-db-stackgres to kind+prod overlays; drop patch-db-listen-all; repoint supabase-db-nodeport selector to StackGres primary labels.\n3. Generate initdb Secret/ConfigMap; apply overlay; wait SGCluster primary Ready; fix bootstrap deploy() wait.\n4. Validate app tier (authenticator/gotrue/meta/functions) against the SGCluster direct primary + reuse tools/smoke-pgnet.sh for the webhook e2e; confirm Kong envsubst + auth/rest parity; document StatefulSet fallback.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done & validated live (delegated to k8s-operator, independently re-verified). The kind cluster now runs the StackGres SGCluster 'supabase-db' (PG 15.14, 1 instance, supabase-db-0 4/4 Running) as the DB tier; the StatefulSet is removed from the overlays but kept in the tree as the rollback.

Files changed: base/kustomization.yaml (drop supabase-db StatefulSet), overlays/kind+prod/kustomization.yaml (add supabase-db-stackgres), overlays/kind/nodeports.yaml (supabase-db-nodeport selector -> stackgres.io/cluster-name=supabase-db,role=primary; endpoint verified = primary pod IP), drop patch-db-listen-all (StackGres/patroni manages listen_addresses), bootstrap.sh deploy() waits on the SGCluster primary + gen_initdb_secret JWT_EXP pipefail fix, sql/00-roles.sql (+GRANT CREATE ON SCHEMA public for PG15; +CREATE SCHEMA auth for GoTrue), tools/smoke-pgnet.sh (StackGres pod-label discovery + --no-psqlrc banner fix).

AC#1: app tier kong/auth/rest/meta/functions all 1/1 Ready; PostgREST authenticator connects to the SGCluster DIRECT primary (disableConnectionPooling=true) — 'authenticator|PostgreSQL 15.14 (OnGres)'; gotrue ran 69 migrations; meta connects; supabase role set present. Both overlays render (kind 32 objects, prod 28). SHOW shared_preload_libraries includes pg_net (loaded first-boot, no SGDbOps restart needed).
AC#2: tools/smoke-pgnet.sh passes against StackGres — device + network INSERT each produce net._http_response HTTP 202 + a *_jobs row (re-verified independently: ids 18/19). Kong logs confirm 'POST /functions/v1/netmaker-call 202' from pg_net/0.2 bgworker.
AC#3: Kong render-config initContainer runs envsubst over the template (${SUPABASE_ANON_KEY}/${SUPABASE_SERVICE_KEY}/dashboard creds from supabase-env Secret) — parity with compose; auth/rest env parity holds (PGRST_DB_SCHEMAS=public is the intended decision-018 trim).
AC#4: spike was GO so StackGres is primary; StatefulSet rollback documented (re-add base/supabase-db to base+overlays, re-add patch-db-listen-all, delete sgcluster).

CAVEATS for downstream (062.07/062.11): (a) the fresh StackGres DB needs the iotgw-ui/supabase/migrations applied on first boot — applied manually this run; a migration step should be added to bootstrap (feeds 062.07 cutover). (b) Editing 00-roles.sql/98-webhooks.sql re-runs the SGScript (brief password-reset window) — rollout-restart rest after managedSql completedAt.
<!-- SECTION:NOTES:END -->
