---
id: TASK-062.17
title: >-
  ADR: adopt StackGres for the Postgres tier (dev+prod) — direct-primary,
  kustomize stateless tier, CNPG fallback
status: Done
assignee: []
created_date: '2026-06-18 08:48'
updated_date: '2026-06-18 13:22'
labels:
  - stackgres
  - migration
  - decision
  - docs
  - supabase
dependencies:
  - TASK-062.16
references:
  - >-
    backlog/decisions/decision-018 -
    Adopt-StackGres-for-the-Postgres-tier-dev-and-prod.md
parent_task_id: TASK-062
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record the decision to provision Postgres via StackGres in BOTH kind-dev and prod (chosen dev+prod scope), superseding the hand-authored supabase-db StatefulSet. Capture: pg_net confirmed in StackGres live v2 catalog for PG15/16/17; the app tier connects to the SGCluster DIRECT primary endpoint (SGPoolingConfig/PgBouncer is opt-in ONLY — the current k8s clients use no pooler and connect directly to :5432, so transaction-mode pooling must not be introduced silently); migration/DDL tooling always uses the direct primary; drop unused extensions (pgsodium/pgjwt/uuid-ossp/pg_graphql/vault/pg_cron; gen_random_uuid is PG15 core; verify no pgcrypto crypt/digest use first) and trim PGRST_DB_SCHEMAS to 'public' (remove storage + graphql_public); keep the existing deploy/k8s/base/supabase-app kustomize tree for the stateless services and do NOT adopt the supabase-kubernetes Helm chart unless it demonstrably reduces maintenance (the OnGres example omits functions and enables realtime/storage/studio we do not use); AGPLv3 self-host note (internal gateway, no distribution trigger); PG15 vs 16/17 choice; NO-GO fallback (CloudNativePG). Gated on the spike GO.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADR added under backlog/decisions/ recording StackGres for the Postgres tier (dev+prod), superseding the supabase-db StatefulSet
- [x] #2 Records: direct-primary connection (pooler opt-in), dropped extensions, PGRST_DB_SCHEMAS=public, kustomize-over-Helm for stateless tier, AGPL self-host note, PG version choice, CNPG fallback
- [x] #3 Linked from the StackGres data-plane tasks (056, 062.02, 062.04, 062.07)
<!-- AC:END -->







## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
decision-018 records adopting StackGres for the Postgres tier (dev+prod), superseding the supabase-db StatefulSet — backed by the TASK-062.16 spike GO. Captures direct-primary connection (pooler opt-in), dropped extensions + PGRST_DB_SCHEMAS=public, kustomize-over-Helm stateless tier, AGPL self-host, operator version pin (1.17.4 works; 1.18.8 broken on k8s 1.31), pg_net build choice, and the CNPG fallback. Linked from tasks 056/062.02/062.04/062.07.
<!-- SECTION:FINAL_SUMMARY:END -->
