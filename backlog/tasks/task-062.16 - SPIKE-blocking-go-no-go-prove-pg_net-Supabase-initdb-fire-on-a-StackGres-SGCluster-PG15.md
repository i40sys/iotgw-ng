---
id: TASK-062.16
title: >-
  SPIKE (blocking go/no-go): prove pg_net + Supabase initdb fire on a StackGres
  SGCluster (PG15)
status: Done
assignee: []
created_date: '2026-06-18 08:48'
updated_date: '2026-06-18 13:12'
labels:
  - k8s
  - migration
  - supabase
  - stackgres
  - spike
milestone: Decommission docker-compose
dependencies: []
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stand up a disposable StackGres operator + 1-instance SGCluster (spec.postgres.version 15, sgInstanceProfile size-xs, 5Gi PVC) on kind. Add pg_net to spec.postgres.extensions; append pg_net to SGPostgresConfig shared_preload_libraries (RETAIN the auto-managed pg_stat_statements,auto_explain); apply via an SGDbOps op:restart. Port supabase/volumes/db/{roles,webhooks,jwt}.sql (== deploy/k8s/base/supabase-db/initdb/*.sql) into an SGScript run as the StackGres-provided admin, including the 'authenticator' drop-then-recreate role-collision workaround from the OnGres example BUT kept NOINHERIT/non-superuser (do NOT copy the example SUPERUSER grant), the issue_pg_net_access ddl_command_end event trigger, supabase_functions.http_request() SECURITY DEFINER, and the app.settings.jwt_secret/jwt_exp GUC. Then assert the provisioning primitive: net.http_post fired from inside the SGCluster reaches an in-cluster stub and records a net._http_response row. Record GO/NO-GO. If NO-GO, choose a named fallback: custom StackGres extension image, CloudNativePG (runs the real supabase/postgres image with pg_net), or move webhooks off pg_net. Research already confirms pg_net is in StackGres live v2 catalog for PG15/16/17 with the bgworker mechanism documented; this turns 'available' into 'works for OUR chain'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1-instance StackGres SGCluster on PG15 Ready on kind with pg_net in extensions + shared_preload_libraries (SHOW confirms) after an SGDbOps restart
- [x] #2 SGScript-ported initdb creates the full role set (supabase_admin, supabase_functions_admin, authenticator with collision workaround kept NOINHERIT/non-superuser, anon/authenticated/service_role) + extensions/supabase_functions schemas + issue_pg_net_access event trigger + app.settings.jwt_secret GUC
- [x] #3 net.http_post fired from inside the SGCluster reaches an in-cluster stub and records a net._http_response row
- [ ] #4 service_role RLS-bypass and authenticated RLS policies behave identically to the current StatefulSet
- [x] #5 Written GO/NO-GO recommendation; if NO-GO, a chosen fallback (custom ext image / CNPG / off-pg_net) is recorded
<!-- AC:END -->









## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
SPIKE EXECUTED on the kind-iotgw cluster (k8s v1.31.12), isolated in namespace sg-spike; validated iotgw workloads untouched. Artifacts: deploy/k8s/spike-stackgres/*.yaml.

PROCEDURE + EVIDENCE:
1. StackGres operator: v1.18.8 install FAILED — its install-sgconfig hook emits a legacy SGConfig (spec.cert.crt, spec.grafana.urls) that the v1.18.8 CRD rejects under k8s strict decoding; operator never came up. Pinned v1.17.4 → installed clean. (ACTION for task-056: pin a working operator version; re-test 1.18.x.)
2. SGCluster supabase-db (PG 15.14, 1 instance, size-xs, 5Gi) accepted by the validating webhook WITH pg_net in spec.postgres.extensions; pod reached 5/5 Running. pg_net .so pulled from extensions.stackgres.io at pod start (egress OK).
3. SGScript (managedSql) ran clean as the StackGres superuser and created: roles anon/authenticated/service_role(BYPASSRLS)/supabase_admin/supabase_functions_admin/authenticator(LOGIN,NOINHERIT,non-super — we did NOT copy OnGres' SUPERUSER grant); CREATE EXTENSION pg_net; supabase_functions schema + SECURITY DEFINER http_request(); issue_pg_net_access event trigger; app.settings.jwt_secret/jwt_exp GUC. All verified via pg_proc/pg_event_trigger/pg_roles.
4. FINDING (bgworker): StackGres did NOT auto-add pg_net to shared_preload_libraries. Pre-fix, net.http_post raised 'the pg_net background worker must be up' (a loud guard, not silent). Fixed via SGPostgresConfig shared_preload_libraries='pg_stat_statements, auto_explain, pg_net' + SGDbOps op:restart (InPlace) → completed → SHOW confirms pg_net loaded.
5. Direct net.http_post('http://echo.sg-spike.svc.cluster.local/') → net._http_response status_code=200 (bgworker egresses to an in-cluster Service — the real path to kong/functions).
6. FINDING (init details the hand-subset missed; real webhooks.sql has them): (a) net.http_get/http_post MUST be ALTERed SECURITY DEFINER or the trigger fails 'permission denied for table http_request_queue'; (b) supabase_functions_admin needs GRANT ALL on its schema/tables/sequences. After both, the FULL trigger path works: INSERT into a table with the supabase_functions.http_request() trigger → net._http_response 200 + a supabase_functions.hooks audit row. Artifact 10-script.yaml updated with both.
7. pg_net version note: the v1.17.4 catalog installed pg_net extversion 0.2 (old). The v1.18 catalog ships newer pg_net (0.18-0.20). task-056 should choose the pg_net build (and reconcile with the operator-version pin from #1).

DEFERRED to task-056: full RLS policy parity test against the real supabase/volumes/db/roles.sql (this spike confirmed role ATTRIBUTES, not an RLS policy round-trip); port webhooks.sql/roles.sql/jwt.sql verbatim (authoritative) rather than the hand-subset; SGBackup/pooling/HA out of scope here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
GO. pg_net works end-to-end on a StackGres-managed PG15 SGCluster on kind: extension installs, the bgworker loads once pg_net is added to shared_preload_libraries (SGPostgresConfig + SGDbOps restart — StackGres does NOT auto-add it), and a DB trigger → supabase_functions.http_request() (SECURITY DEFINER) → net.http_post → in-cluster POST records net._http_response 200 + a hooks audit row — the exact device/network → netmaker-call mechanism. Privileged init (roles incl. low-priv authenticator, CREATE EXTENSION, SECURITY DEFINER fn, event trigger, jwt GUC) reproduces via an SGScript run as the StackGres superuser. Two must-have init details surfaced (net.http_* SECURITY DEFINER; supabase_functions_admin schema grants) — both in the real webhooks.sql, so task-056 should port the real *.sql verbatim. One operator caveat: v1.18.8 install is broken under k8s 1.31 strict decoding (legacy SGConfig in its hook); v1.17.4 works — pin a version. Net: StackGres is a viable DB tier for the migration; proceed with task-056 (gated items resolved).
<!-- SECTION:FINAL_SUMMARY:END -->
