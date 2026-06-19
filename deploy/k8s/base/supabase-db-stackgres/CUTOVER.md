# Postgres data cutover → StackGres SGCluster (task-062.07)

How the Supabase Postgres data plane moves onto the StackGres-managed
`supabase-db` SGCluster (decision-018), and how to roll back. The DB tier switch
itself (overlay + operator) is task-062.04; this document is the **data** move and
the **superuser ordering** that makes role-owned / `SECURITY DEFINER` / event-trigger
objects round-trip.

## Why ordering + superuser matters

StackGres owns its PVCs/Patroni; you do **not** copy a bind-mount into a PVC. The
target is initialized by the **SGScript** (`sgscript.yaml`, run by StackGres **as the
cluster superuser** on first boot) in this order, *before any application data*:

1. `sql/00-roles.sql` — the supabase role set (`anon`, `authenticated`,
   `service_role` BYPASSRLS, `supabase_admin`, `supabase_auth_admin`,
   `supabase_storage_admin`, `supabase_functions_admin`, `authenticator`
   LOGIN/NOINHERIT/**non-superuser**, `pgbouncer`) + `GRANT CREATE ON SCHEMA public`
   (PG15 dropped the default PUBLIC CREATE) + `CREATE SCHEMA auth` (GoTrue expects it).
2. `sql/98-webhooks.sql` — `pg_net` extension, the `supabase_functions` schema, the
   `supabase_functions.http_request()` trigger fn **`SECURITY DEFINER`** owned by
   `supabase_functions_admin`, the `net.http_*` `SECURITY DEFINER` ALTERs, and the
   `issue_pg_net_access` **event trigger** (event triggers require a superuser).
3. `90-secrets.sql` (from the `supabase-db-initdb` Secret, `bootstrap.sh
   gen_initdb_secret`) — role LOGIN passwords (== `POSTGRES_PASSWORD`) + the
   `app.settings.jwt_secret` / `jwt_exp` GUCs.

`shared_preload_libraries` already includes `pg_net` (`instanceprofile-pgconfig.yaml`)
so the bgworker is live on first boot — **no** SGDbOps restart needed.

A plain **non-superuser** `pg_restore` does **NOT** reproduce the event trigger,
the `SECURITY DEFINER` ownership, or the role-owned objects — it silently drops or
mis-owns them and the device/network → `pg_net` → `netmaker-call` path breaks.
Always restore connected **as `postgres`** (the StackGres superuser).

## Application schema

The app tables (`devices`, `networks`, `domains`, `device_jobs`, `network_jobs`,
`deployments`, `deployment_jobs`, `device_creation_log`) are **not** in the SGScript —
they come from `iotgw-ui/supabase/migrations/`.

- **Reproducible (validated):** `deploy/kind/bootstrap.sh migrate` →
  `migrate_app_db()` applies every migration **as `postgres` (superuser)** in
  filename order, guarded so it is skipped when `public.devices` already exists
  (`force-migrate` re-applies into a fresh DB). `deploy()` calls it after the
  primary is Ready. This replaces the one-off manual psql apply (the 062.04 caveat).

## Moving REAL data from a legacy `supabase-db` StatefulSet (documented procedure)

For the dev/kind cutover the StatefulSet data is throwaway, so the schema is
rebuilt with `migrate_app_db` (above). When there **is** data to preserve (e.g. a
prod cutover), do a **superuser-ordered** dump/restore. The target SGCluster must
already be initialized by the SGScript (roles/extensions/event-trigger/jwt GUC):

```bash
SRC=<legacy supabase-db StatefulSet pod>        # source (kept running until smoke passes)
DST=$(kubectl -n iotgw get pod -l stackgres.io/cluster-name=supabase-db,role=primary \
        -o jsonpath='{.items[0].metadata.name}')

# 1. Dump as superuser, preserving ownership + ACLs (do NOT use --no-owner).
#    Exclude objects the SGScript already created so the restore does not collide:
kubectl -n iotgw exec "$SRC" -- pg_dump -U postgres -d postgres -Fc \
  --exclude-schema='supabase_functions' --exclude-schema='net' \
  > /tmp/supabase.dump

# 2. Restore AS SUPERUSER (connect as postgres) so role grants round-trip.
kubectl -n iotgw exec -i "$DST" -c patroni -- \
  pg_restore -U postgres -d postgres --no-privileges=false --exit-on-error /tmp/supabase.dump

# 3. Re-point the device/network webhooks to the in-cluster Kong Service (task-055)
#    — the repointed migrations (20260610000000/01) carry http://kong:8000 already,
#    so this is implicit when the migrations are part of the dump.
```

`supavisor` (the Supabase connection pooler) is **not migrated — it does not exist
in this k8s data plane**. `disableConnectionPooling=true` on the SGCluster → clients
connect to the **direct primary** `supabase-db:5432`. (The StackGres-managed
PgBouncer is opt-in and not enabled.)

The **Cosmian KMS SQLite store** (`kms/data/`, device SSH private keys) and the
**Kestra Postgres** (`kestra-postgres` StatefulSet — its own PVC) are **separate
stores, UNCHANGED by this cutover**. KMS is a StatefulSet+PVC already; Kestra
flow/KV migration is task-062.05.

## Verify object ownership (must pass post-cutover)

Live-verified on the kind SGCluster:

```bash
DST=$(kubectl -n iotgw get pod -l stackgres.io/cluster-name=supabase-db,role=primary -o jsonpath='{.items[0].metadata.name}')
kubectl -n iotgw exec "$DST" -c patroni -- psql -U postgres -d postgres --no-psqlrc -At -c "
  select pg_get_userbyid(proowner) from pg_proc
    where proname='http_request' and pronamespace='supabase_functions'::regnamespace;   -- supabase_functions_admin
  select evtname from pg_event_trigger where evtname='issue_pg_net_access';             -- issue_pg_net_access
  select current_setting('app.settings.jwt_secret', true) <> '';                        -- t
"
```

Then assert the live webhook path still fires: `tools/smoke-pgnet.sh` (device +
network INSERT → `net._http_response` 202 + `*_jobs` row).

## Rollback (keep the StatefulSet until parity is proven)

`base/supabase-db/` (StatefulSet + Service + initdb) is retained in the tree, wired
into no overlay. To revert the DB tier to the hand-authored StatefulSet:

1. `deploy/k8s/base/kustomization.yaml`: re-add `- supabase-db`.
2. `deploy/k8s/overlays/{kind,prod}/kustomization.yaml`: remove
   `../../base/supabase-db-stackgres`; re-add the `patch-db-listen-all.yaml` patch
   (kind only).
3. `kubectl -n iotgw delete sgcluster supabase-db` (frees the `supabase-db` Service
   name), then `kubectl apply -k deploy/k8s/overlays/kind`.

The `supabase-db:5432` Service name is identical for both tiers, so the app tier
needs no change either direction.
