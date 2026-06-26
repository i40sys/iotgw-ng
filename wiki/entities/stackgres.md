---
title: StackGres
category: entities
tags: [data/postgres, infra/kubernetes, status/current]
relationships:
  - target: "[[entities/supabase]]"
    type: related_to
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/decisions/decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
summary: OnGres' AGPL Postgres operator; manages the supabase-db SGCluster in dev+prod with Patroni HA, PITR/backups, monitoring, and the supabase init ported into an SGScript — pg_net the critical compatibility item.
provenance:
  extracted: 0.88
  inferred: 0.05
  ambiguous: 0.07
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# StackGres

**StackGres** (OnGres' AGPLv3 Postgres operator) replaces the hand-rolled
`supabase-db` StatefulSet for the Postgres tier, in **both kind-dev and prod**
(decision-018). It provides Patroni HA/failover (k8s API as DCS),
`SGBackup`/`SGObjectStorage` continuous WAL archiving + PITR, Prometheus metrics,
and managed PgBouncer — all OSS, no paywall.

## Why it works for Supabase (the spike answered GO)

The open question was whether Supabase-specific requirements survive StackGres's
own image — above all **`pg_net`** (a background-worker extension) and the
privileged initdb. The `TASK-062.16` spike on a real StackGres PG15 SGCluster in
kind proved **GO**:

- `pg_net` installs; once added to `shared_preload_libraries` (via an
  `SGPostgresConfig`, applied with an `SGDbOps op:restart`) its bgworker fires and
  the full trigger → `http_request()` → `net.http_post` chain records a
  `net._http_response`.
- The initdb (roles, the `SECURITY DEFINER` webhook fn, event trigger, JWT GUC)
  reproduces via an **`SGScript`** run as the StackGres superuser.

## Key decisions

- **SGCluster (PG15)** with `pg_net` in `spec.postgres.extensions` (StackGres does
  NOT auto-add it to `shared_preload_libraries` — set explicitly).
- **Direct primary connection** — app tier + migrations use the direct primary
  Service; transaction-mode PgBouncer is opt-in only (prepared-statement / `SET
  ROLE` hazards).
- **Trim the surface** — drop unused extensions (`pgsodium`, `pgjwt`,
  `uuid-ossp`, `pg_graphql`, `vault`, `pg_cron`); `PGRST_DB_SCHEMAS=public`.
- **Operator version pinned: v1.17.4** (v1.18.8 is **broken on k8s 1.31** — its
  install hook emits a legacy `SGConfig` rejected by strict decoding). Choose the
  `pg_net` build deliberately (1.17.4 ships old `pg_net` 0.2).
- **Licensing:** AGPLv3 self-hosted as an internal gateway does not trigger AGPL
  distribution obligations.
- **Fallback if a regression breaks `pg_net`:** CloudNativePG, a custom StackGres
  extension image, or the retained StatefulSet.

Lives in the **`supabase-db`** namespace.

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod|decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod]]
- [[_sources/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration|decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration]]
