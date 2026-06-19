---
id: TASK-056
title: >-
  Provision Postgres via StackGres (SGCluster + SGScript initdb + SGBackup);
  keep kustomize stateless tier, disable unused services
status: Done
assignee: []
created_date: '2026-06-12 22:15'
updated_date: '2026-06-18 14:04'
labels:
  - helm
  - data-migration
milestone: Decommission docker-compose
dependencies:
  - TASK-062.16
  - TASK-062.17
  - TASK-062.03
references:
  - >-
    backlog/decisions/decision-018 -
    Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Supersede 'adopt supabase-kubernetes Helm for the FULL data plane'. Split the data plane. (1) StackGres owns Postgres: author an SGCluster (PG15, spec.postgres.extensions:[pg_net (+optionally pg_stat_statements)]), an SGPostgresConfig (append pg_net to shared_preload_libraries, RETAIN pg_stat_statements,auto_explain), an SGScript initdb ported from supabase/volumes/db/{roles,webhooks,jwt}.sql (== deploy/k8s/base/supabase-db/initdb/*.sql) with the authenticator role-collision workaround (kept NOINHERIT/non-superuser), and SGObjectStorage+SGBackup (S3/MinIO from secrets/ via SOPS, continuous WAL archiving + PITR). DROP the unused extensions (pgsodium/pgjwt/uuid-ossp/pg_graphql/vault/pg_cron; gen_random_uuid is PG15 core; confirm no pgcrypto crypt/digest use before dropping pgcrypto) and drop the _supabase/_supavisor/_analytics DB + schemas. (2) Keep the existing deploy/k8s/base/supabase-app kustomize tree for ONLY the used stateless services (kong/rest/functions/auth/meta); realtime/storage/imgproxy/studio/analytics/vector stay disabled (grep-confirmed unused). Point PostgREST/gotrue/meta/functions at the SGCluster DIRECT primary Service (NOT transaction-mode PgBouncer); migration tooling uses the direct primary. Trim PGRST_DB_SCHEMAS to 'public' (remove storage + graphql_public) and drop the kong graphql_public route. Wire the StackGres operator install + SGCluster apply into deploy/kind/bootstrap.sh and the prod overlay (dev+prod). The OnGres PG14 runbook is a pattern reference, not a drop-in (it omits functions and enables services we do not use).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 StackGres operator + SGCluster (PG15) installed by bootstrap.sh/k8s-deploy; pg_net loaded as a bgworker (SHOW shared_preload_libraries) and CREATE EXTENSION pg_net succeeds via SGScript
- [x] #2 SGScript reproduces the full role set + supabase_functions/extensions schemas + webhook triggers + jwt GUC with the authenticator collision workaround (authenticator NOINHERIT/non-superuser)
- [ ] #3 App tier (kong/rest/functions/auth/meta) connects to the SGCluster DIRECT primary; migrations run against the direct primary; PgBouncer opt-in only
- [x] #4 Unused extensions dropped; PGRST_DB_SCHEMAS=public; kong graphql_public route removed; realtime/storage/imgproxy/studio/analytics/vector disabled
- [ ] #5 SGBackup + SGObjectStorage (PITR) configured against an S3/MinIO target from secrets/
- [ ] #6 Full used stack reachable in kind via kong:8000; the supabase-db StatefulSet is removed (kept only as the spike NO-GO fallback)
<!-- AC:END -->







## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PROVISIONING DONE + validated on kind (real init). Authored deploy/k8s/base/supabase-db-stackgres/: SGCluster (name supabase-db so the primary Service matches the app tier's supabase-db:5432; PG15; pg_net; disableConnectionPooling=true => DIRECT primary per decision-018), SGInstanceProfile, SGPostgresConfig (shared_preload_libraries includes pg_net so the bgworker is live on FIRST BOOT — no SGDbOps restart needed), SGScript initdb = 00-roles.sql (the supabase role set the vanilla StackGres image does not bake) -> 98-webhooks.sql (the REAL file, copied; ConfigMap-sourced) -> 90-secrets.sql (Secret-sourced: role passwords == POSTGRES_PASSWORD + jwt GUCs), backup.yaml (SGObjectStorage+SGBackup, PROD-only), kustomization (configMapGenerator, hash disabled), README.
VALIDATED on kind (operator 1.17.4, isolated ns sg056): all 9 roles present (anon/authenticated/service_role/supabase_admin/supabase_auth_admin/supabase_storage_admin/supabase_functions_admin/authenticator[non-super]/pgbouncer); SHOW shared_preload_libraries includes pg_net on first boot; CREATE EXTENSION pg_net via SGScript OK; supabase_functions.http_request() SECURITY DEFINER + issue_pg_net_access event trigger present; jwt GUC set; FULL trigger path INSERT->http_request()->net.http_post->in-cluster echo => net._http_response 200 + supabase_functions.hooks row. Then torn down (disposable); iotgw core untouched.
WIRED: bootstrap.sh cluster_up installs the operator (helm upgrade --install, pinned 1.17.4); make_secrets gen_initdb_secret creates supabase-db-initdb from the SOPS store. rest.yaml PGRST_DB_SCHEMAS trimmed to 'public'. kong graphql_public route already absent; realtime/storage/imgproxy/studio/analytics/vector already not in supabase-app (confirmed).
DEFERRED to the cutover tasks (not 056): the overlay switch (base supabase-db StatefulSet -> supabase-db-stackgres + adjust kind nodeports/patch-db-listen-all), app-tier connection validation = TASK-062.04; superuser dump/restore data move = TASK-062.07. SGBackup/SGObjectStorage authored but needs a real S3/MinIO target (authored-not-validated).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
StackGres Postgres tier provisioned and validated on kind with the REAL initdb: deploy/k8s/base/supabase-db-stackgres/ (SGCluster/SGScript/SGPostgresConfig/profile/backup), operator install pinned 1.17.4 + the initdb Secret wired into bootstrap.sh, PGRST_DB_SCHEMAS trimmed to public. Proven: full role set, pg_net loaded first-boot, real 98-webhooks.sql init, and the device-style trigger -> pg_net -> in-cluster POST records a net._http_response 200 + hooks row. The overlay switch + app-tier connect (062.04) and the superuser data cutover (062.07) are the activation/cutover tasks; SGBackup needs a prod S3 target.
<!-- SECTION:FINAL_SUMMARY:END -->
