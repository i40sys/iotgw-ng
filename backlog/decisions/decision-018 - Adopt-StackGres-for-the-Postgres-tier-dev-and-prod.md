---
id: decision-018
title: Adopt StackGres for the Postgres tier (dev and prod)
date: '2026-06-18 13:20'
status: accepted
---
## Context

The Supabase data tier was authored in k8s as a single hand-rolled
`supabase-db` StatefulSet (`deploy/k8s/base/supabase-db/`): one Postgres pod,
no operator-managed backups, no PITR, no HA/failover, no monitoring. For a
platform whose entire device/network provisioning chain runs through the
database (`pg_net` webhooks → `netmaker-call`), that is thin for production.

`StackGres` (OnGres' AGPLv3 Postgres operator) provides Patroni HA/failover
(K8s API as DCS), `SGBackup`/`SGObjectStorage` continuous WAL archiving + PITR,
Prometheus metrics, and managed PgBouncer — all OSS, no paywall. The open
question was whether our **Supabase-specific** requirements survive StackGres's
own (non-`supabase/postgres`) image: above all `pg_net` (a background-worker
extension) and our privileged initdb (roles, `SECURITY DEFINER` webhook fn,
event trigger, JWT GUC).

The `TASK-062.16` spike answered this on a real StackGres PG15 SGCluster in
kind: **GO**. `pg_net` installs and — once added to `shared_preload_libraries`
+ an `SGDbOps` restart — its bgworker fires; the full trigger →
`supabase_functions.http_request()` → `net.http_post` → in-cluster POST chain
records a `net._http_response` 200; and the initdb (roles incl. a low-privilege
`authenticator`, the SECURITY DEFINER fn, event trigger, JWT GUC) reproduces via
an `SGScript` run as the StackGres superuser.

## Decision

Provision the Postgres tier with **StackGres in both kind-dev and prod**
(`dev+prod`), superseding the hand-authored `supabase-db` StatefulSet.

1. **SGCluster (PG15)** with `pg_net` in `spec.postgres.extensions`. Because
   StackGres does **not** auto-add `pg_net` to `shared_preload_libraries`, set it
   explicitly in an `SGPostgresConfig` (retaining the auto-managed
   `pg_stat_statements, auto_explain`) and apply it with an `SGDbOps op:restart`.
2. **Init via `SGScript`** ported **verbatim** from
   `supabase/volumes/db/{roles,webhooks,jwt}.sql` (==
   `deploy/k8s/base/supabase-db/initdb/*.sql`), run as the StackGres superuser.
   The spike confirmed two non-obvious must-haves these files already contain:
   `net.http_get/http_post` must be `SECURITY DEFINER`, and
   `supabase_functions_admin` must own/be-granted its schema and objects.
   `authenticator` is kept **NOINHERIT / non-superuser** (we do **not** copy the
   OnGres example's SUPERUSER grant); reconcile the PgBouncer name collision via
   drop-then-recreate.
3. **Direct primary connection.** The app tier (PostgREST/auth/meta/functions)
   and migration tooling connect to the SGCluster **direct primary** Service.
   StackGres's transaction-mode PgBouncer is **opt-in only** — today's clients
   use no pooler, and transaction pooling would change prepared-statement /
   `SET ROLE` semantics they have never been tested against.
4. **Trim the surface.** Drop unused extensions (`pgsodium`, `pgjwt`,
   `uuid-ossp`, `pg_graphql`, `vault`, `pg_cron` — `gen_random_uuid()` is PG15
   core; confirm no `pgcrypto` use before dropping it) and set
   `PGRST_DB_SCHEMAS=public` (drop `storage`, `graphql_public`). Realtime/storage
   /imgproxy/studio/analytics/vector stay disabled (grep-confirmed unused).
5. **Stateless tier stays kustomize.** Keep `deploy/k8s/base/supabase-app/`
   (kong/rest/auth/meta/functions); do **not** adopt the `supabase-kubernetes`
   Helm chart unless it demonstrably reduces maintenance (it omits `functions`
   and enables services we do not use).
6. **Backups/HA/monitoring:** wire `SGObjectStorage`+`SGBackup` (S3/MinIO from
   the SOPS store, PITR), Patroni HA (1 instance in kind, ≥2 in prod), and the
   Prometheus exporter.
7. **Operator version is pinned.** v1.18.8 is **broken on k8s 1.31** (its
   install hook emits a legacy `SGConfig` rejected by strict decoding);
   **v1.17.4 installs clean** and is the validated baseline. Re-test newer 1.18.x
   before bumping. Choose the `pg_net` build deliberately (the 1.17.4 catalog
   ships an old `pg_net` 0.2; the 1.18 catalog has 0.18–0.20).
8. **Licensing:** StackGres OSS (AGPLv3) self-hosted as an internal gateway does
   not trigger AGPL distribution obligations.
9. **Fallback (if a future regression breaks `pg_net` on StackGres):**
   CloudNativePG (reported to run the real `supabase/postgres` image), a custom
   StackGres extension image, or the retained `supabase-db` StatefulSet.

## Consequences

**Positive**
- Operator-managed HA, PITR/backups, and monitoring the StatefulSet never had —
  the main reason to migrate.
- Smaller, intentional Postgres surface (only the extensions/schemas actually
  used).

**Negative / cost**
- Operator complexity (CRDs/controllers/webhooks, Patroni + sidecars per pod,
  extension `.so` download at pod start → a network dependency and slower kind
  bootstrap), and an init that must be ported and kept in sync with the real
  `*.sql`.
- Data cutover from the StatefulSet is a superuser-ordered dump/restore
  (`TASK-062.07`), not a trivial volume copy.

**Neutral**
- `dev+prod` parity means the `SGScript` path is exercised in CI/kind (the
  reason we chose it over a prod-only split), at the cost of a heavier local
  bring-up.

## References
- `TASK-062.16` (spike, GO) — evidence; artifacts in `deploy/k8s/spike-stackgres/`
- `decision-016` (edge functions), `decision-017` (compose decommission), `decision-015` (k8s migration)
- Milestone tasks: `TASK-056` (provision), `TASK-062.04` (validate), `TASK-062.07` (data cutover), `TASK-055` (webhook)
