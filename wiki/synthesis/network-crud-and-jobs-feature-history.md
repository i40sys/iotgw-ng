---
title: Domains/Networks/Devices CRUD & Jobs — Feature History
category: synthesis
tags: [type/task, provisioning/devices, provisioning/networks, data/supabase, app/iotgw-ui, status/current]
relationships:
  - target: "[[concepts/domains-networks-devices]]"
    type: implements
sources:
  - backlog/completed/task-007 - Create-domains-table-schema-and-migration.md
  - backlog/completed/task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage.md
  - backlog/completed/task-028 - Fix-Supabase-row-level-security-for-database-queries.md
  - backlog/completed/task-001 - Create-network_jobs-table-schema.md
  - backlog/completed/task-031 - Add-search-filters-to-devices-view.md
summary: The completed-task arc that built the Domains→Networks→Devices CRUD stack, the *_jobs audit tables, and the RLS fix — the feature foundation under the provisioning call chain.
provenance:
  extracted: 0.82
  inferred: 0.12
  ambiguous: 0.06
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Domains/Networks/Devices CRUD & Jobs — Feature History

The completed-task foundation under [[concepts/domains-networks-devices]] and
[[concepts/provisioning-call-chain]]. All tasks **Done**.

## The CRUD stack (completed/ feature series)

Built per-entity following one repeated pattern (schema → generated types →
shared contract → tRPC router → UI):

- **Domains** (task-007..016): table + migration, contract types, backend router,
  i18n, route/page, forms, detail view with edit/delete, error handling.
- **Networks** (task-017..026): schema, types, contract, tRPC CRUD router, list +
  form + dialog components + hooks, integrated into the domain detail page, network
  count on the domain list.
- **Devices** (task-027): the network-related devices table with `ip_address`
  unique-per-network, CASCADE delete, full tRPC CRUD, masked key inputs.

> [!warning] Device key columns later superseded
> task-027 added `private_key`/`public_key` columns "for secure key storage."
> decision-010 later superseded this — SSH keys moved to Cosmian KMS, devices hold
> only `ssh_key_id` ([[concepts/ssh-key-management-kms]]). The WireGuard
> private/public keys written by `netmaker-call` are a separate extclient concern.

## The RLS fix (task-028)

RLS had to be manually disabled after every DB reset. Fixed two ways: the backend
context prefers `SUPABASE_SERVICE_KEY` (service role **bypasses RLS** — the
recommended backend approach), and a migration adds permissive `anon`-role
policies on domains/networks/devices so the backend works with just the anon key.
This is the practical realization of the RLS model in [[entities/supabase]].

## The `*_jobs` audit tables (completed task-001..003 network_jobs series)

`network_jobs` (and `device_jobs`) mirror the `deployment_jobs` shape:
execution-tracking fields (`execution_id`, `flow_id`, `status`, `started_at`,
`completed_at`, `error_message`, `transaction_id`) + denormalized network snapshot
fields, RLS-enabled, indexed, granted to all roles. These are the rows the
`netmaker-call` chain writes (PENDING → SUCCESS/FAILED) and the UI polls
([[concepts/provisioning-call-chain]], [[references/database-migrations-webhooks]]).

## Other completed UI work

Theme conversion to dark-blue (task-022), Font Awesome icons (task-023), menu
cleanup (task-029), welcome/home page with version display (task-030), device
search filters (task-031). The Deployments wizard steps (task-005..010 of the
feature series) realize [[references/deployments-page-behavior]].

## Sources

- completed/ tasks 007/027/028/031 + the network_jobs series (task-001..003).
- Related: [[concepts/domains-networks-devices]], [[concepts/provisioning-call-chain]], [[entities/supabase]], [[synthesis/deployments-feature-history]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/completed/task-007 - Create-domains-table-schema-and-migration|task-007 - Create-domains-table-schema-and-migration]]
- [[_sources/completed/task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage|task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage]]
- [[_sources/completed/task-028 - Fix-Supabase-row-level-security-for-database-queries|task-028 - Fix-Supabase-row-level-security-for-database-queries]]
- [[_sources/completed/task-001 - Create-network_jobs-table-schema|task-001 - Create-network_jobs-table-schema]]
- [[_sources/completed/task-031 - Add-search-filters-to-devices-view|task-031 - Add-search-filters-to-devices-view]]
