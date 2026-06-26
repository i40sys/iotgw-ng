---
title: Supabase
category: entities
tags: [data/supabase, data/postgres, data/edge-functions, status/current]
relationships:
  - target: "[[entities/stackgres]]"
    type: uses
  - target: "[[concepts/provisioning-call-chain]]"
    type: related_to
sources:
  - backlog/decisions/decision-003 - Database-and-Infrastructure-Supabase-PostgreSQL-Choice.md
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
  - backlog/decisions/decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
  - backlog/docs/doc-003 - Supabase-RLS-Policy-Implementation-Patterns.md
summary: The self-hosted Supabase stack — PostgreSQL + RLS + the Kong/auth/rest/meta/functions app tier; trimmed to essentials (no studio/realtime/storage/analytics) and split across supabase-db / supabase-app namespaces.
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Supabase

The platform runs a **self-hosted Supabase** stack as its database + API tier.
PostgreSQL is the primary data store; **Row Level Security (RLS)** enforces access
at the DB level (decision-003, doc-003).

## What is and isn't deployed

The stack is **intentionally trimmed** (decision-018): the **app tier** is
`kong`, `auth` (GoTrue), `rest` (PostgREST), `meta`, `functions` (edge runtime).
**Studio, realtime, storage, imgproxy, analytics, supavisor, and vector are NOT
deployed** (grep-confirmed unused). The app tier connects to the **direct
primary** — no pooler.

## Namespaces & ports

Split per [[concepts/namespace-per-subproject]]:

- **`supabase-db`** — the Postgres tier (now a StackGres `SGCluster`, see
  [[entities/stackgres]]). Port 5432 (NodePort 30543).
- **`supabase-app`** — Kong API gateway (:8000, NodePort 30800), edge functions
  via `/functions/v1/*`.

## Role in the platform

- **Provisioning origin:** a `pg_net` row trigger POSTs to the `netmaker-call`
  edge function ([[concepts/provisioning-call-chain]]).
- **Migrations + webhooks** are SQL migrations in `iotgw-ui/supabase/migrations/`
  ([[references/database-migrations-webhooks]]).
- **Generated types:** the Supabase schema generates `database.types.ts` consumed
  by the contract package ([[concepts/iotgw-ui-architecture]]).

> [!note] Postgres tier migrated to StackGres
> decision-003 chose "managed Supabase Postgres," but this is a **self-hosted**
> deployment and the Postgres tier moved to a **StackGres**-managed `SGCluster`
> (decision-018) for HA/PITR/backups/monitoring. The Supabase *app* services
> stay kustomize-managed; only Postgres is StackGres-owned.

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-003 - Database-and-Infrastructure-Supabase-PostgreSQL-Choice|decision-003 - Database-and-Infrastructure-Supabase-PostgreSQL-Choice]]
- [[_sources/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration|decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration]]
- [[_sources/decisions/decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod|decision-018 - Adopt-StackGres-for-the-Postgres-tier-dev-and-prod]]
- [[_sources/docs/doc-003 - Supabase-RLS-Policy-Implementation-Patterns|doc-003 - Supabase-RLS-Policy-Implementation-Patterns]]
