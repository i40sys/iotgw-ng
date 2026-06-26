---
title: Domains, Networks, Devices Hierarchy
category: concepts
tags: [provisioning/devices, provisioning/networks, data/postgres, data/supabase, status/current]
relationships:
  - target: "[[concepts/provisioning-call-chain]]"
    type: related_to
  - target: "[[concepts/ssh-key-management-kms]]"
    type: related_to
sources:
  - backlog/docs/doc-008 - Domains-Networks-and-Devices-Architecture.md
  - backlog/completed/task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage.md
  - backlog/completed/task-028 - Fix-Supabase-row-level-security-for-database-queries.md
summary: The three-level org model — Domain → Network(s) → Device(s) — with cascade-delete FKs, scoped uniqueness, RLS, and a tRPC router per entity.
provenance:
  extracted: 0.85
  inferred: 0.05
  ambiguous: 0.1
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Domains, Networks, Devices Hierarchy

The platform organizes IoT infrastructure as a strict hierarchy:

```
Domain
  └── Network(s)
        └── Device(s)
```

- **Domain** — top-level org unit (e.g. "production"); globally unique `name`.
- **Network** — a subnet within a domain; carries `ipv4_cidr` / `ipv6_cidr`;
  `name` unique **within** a domain.
- **Device** — an IoT endpoint/gateway on a network; `ip_address` unique
  **within** a network (not globally).

## Data model & constraints

- All relations use `ON DELETE CASCADE` FKs: deleting a domain removes its
  networks and devices; deleting a network removes its devices. No orphans.
- Unique indexes: `domains(name)`, `networks(domain_id, name)`,
  `devices(network_id, ip_address)`.
- All tables enforce **Row Level Security** (RLS) — DB-level access control, not
  app-level checks (see [[entities/supabase]]).

> [!warning] SSH key columns superseded
> doc-008 shows `private_key`/`public_key` columns on `devices`. Per
> **decision-010** (authoritative), SSH key material is **no longer stored in the
> database** — devices hold only an `ssh_key_id` reference and the key lives in
> Cosmian KMS. The DB columns reflect the historical model. The WireGuard
> `private_key`/`public_key`/`ip_address` written back by `netmaker-call` are a
> separate concern (extclient keys), distinct from the SSH keys.
> See [[concepts/ssh-key-management-kms]].

## API & frontend

- One tRPC router per entity (`domains.ts`, `networks.ts`, `devices.ts`) with
  full CRUD plus scoped list procedures (`listByDomain`, `listByNetwork`).
- Comprehensive Zod validation at the router boundary; `TRPCError` on DB
  failures.
- Frontend mirrors the hierarchy (DomainList → DomainDetail → NetworkList → …)
  with TanStack Query for server state.

## Implementation history

The per-entity CRUD stack, the RLS fix (task-028: service-role bypass + anon
policies), and the `*_jobs` audit tables were built across the completed-task
series — see [[synthesis/network-crud-and-jobs-feature-history]].

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/docs/doc-008 - Domains-Networks-and-Devices-Architecture|doc-008 - Domains-Networks-and-Devices-Architecture]]
- [[_sources/completed/task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage|task-027 - Implement-new-devices-table-with-network-relationship-and-secure-key-storage]]
- [[_sources/completed/task-028 - Fix-Supabase-row-level-security-for-database-queries|task-028 - Fix-Supabase-row-level-security-for-database-queries]]
