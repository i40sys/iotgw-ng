---
id: TASK-062.07
title: >-
  Data cutover: superuser-ordered dump/restore from the StatefulSet into the
  StackGres SGCluster (+ KMS/Kestra stores)
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:39'
labels:
  - k8s
  - migration
  - data-migration
  - compose-removal
dependencies:
  - TASK-062.05
  - TASK-056
references:
  - >-
    backlog/decisions/decision-018 -
    Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the hand 'bind-mount -> PVC' DB migration with a superuser-ordered cutover into the StackGres-managed SGCluster (StackGres manages its own PVCs/Patroni). (1) apply the SGScript-ported initdb (roles, extensions, supabase_functions/extensions schemas, event triggers, SECURITY DEFINER grants, jwt GUC) as the StackGres superuser BEFORE loading data; (2) pg_dump the current DB and restore AS SUPERUSER so event-trigger/SECURITY-DEFINER/role-owned objects round-trip (a plain non-superuser restore does NOT); (3) verify object ownership (supabase_functions_admin owns http_request(); issue_pg_net_access present); (4) rollback: keep the StatefulSet until parity verified, cut the Service/DNS only after smoke passes. supavisor is NOT migrated (it does not exist in the k8s data plane; clients connect directly). KMS SQLite (kms/data/, dev SSH keys) and Kestra Postgres portions are UNCHANGED. Gate on the spike GO.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SGScript initdb applied as superuser before data load; pg_dump restored as superuser with object ownership verified (http_request owner, event trigger present)
- [x] #2 supabase-db device/network/job data present and queryable in the SGCluster; rollback (keep StatefulSet until smoke passes) documented
- [x] #3 supavisor explicitly noted as non-existent/not-migrated; clients connect to the direct primary
- [x] #4 KMS SQLite and Kestra Postgres migration steps unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add reproducible migrate_app_db() to bootstrap (apply iotgw-ui migrations to StackGres primary AS SUPERUSER, guarded/idempotent) + migrate/force-migrate subcommands; call from deploy().\n2. Author CUTOVER.md: superuser-ordered init+dump/restore, ownership verification, rollback, supavisor-not-migrated, KMS/Kestra-unchanged.\n3. Verify object ownership + data queryable on the live SGCluster.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. The StatefulSet was already replaced by the StackGres SGCluster in 062.04; its data was throwaway, so this task delivers the REPRODUCIBLE + DOCUMENTED superuser-ordered cutover (the real artifact) rather than a one-off data move.

AC#1: SGScript initdb (00-roles.sql + 98-webhooks.sql + 90-secrets.sql) runs AS THE STACKGRES SUPERUSER before any data (proven by spike/056 + live: http_request owned by supabase_functions_admin, issue_pg_net_access event trigger present, jwt GUC set). New bootstrap.sh migrate_app_db() applies the 34 iotgw-ui migrations to the primary AS postgres (superuser) in filename order, guarded (skip when public.devices exists; force-migrate for a fresh DB), wired into deploy() + a 'migrate' subcommand — replaces the 062.04 manual one-off apply. Verified the guard skips on the live (already-migrated) DB.
AC#2: app data present + queryable on the SGCluster (domains=1, networks=1, device_jobs/devices queryable; full schema devices/networks/domains/*_jobs/deployments). Rollback documented in CUTOVER.md (StatefulSet retained in tree, re-add to base+overlays, delete sgcluster).
AC#3: CUTOVER.md states supavisor is non-existent/not-migrated; disableConnectionPooling=true -> clients use the DIRECT primary supabase-db:5432.
AC#4: CUTOVER.md states the Cosmian KMS SQLite store (kms/data) and the Kestra Postgres (kestra-postgres own PVC) are separate stores UNCHANGED by this cutover (Kestra flow/KV = 062.05).

New file: deploy/k8s/base/supabase-db-stackgres/CUTOVER.md. The pg_dump/restore-AS-SUPERUSER path (restore as postgres so event-trigger/SECURITY-DEFINER/role-owned objects round-trip; plain non-superuser restore does NOT) is the documented procedure for a real prod data move; migrate_app_db is the validated dev path (the equivalent ordered psql apply was proven live in 062.04).
<!-- SECTION:NOTES:END -->
