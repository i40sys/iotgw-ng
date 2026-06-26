# Vault Conventions — iotgw-ng Knowledge Base

Owner-specific conventions for this vault. These override framework defaults for
all obsidian-wiki skills (ingest, query, lint, cross-linker, …) for the session.

## What this vault is

A distilled knowledge base for the **iotgw-ng** platform (IoT Gateway Next
Generation). The **sole source layer is the project `backlog/`** directory:

- `backlog/decisions/`  — ADRs (decision-0xx). Highest-authority source.
- `backlog/docs/`       — validated architecture docs (doc-0xx).
- `backlog/milestones/` — milestone definitions.
- `backlog/tasks/`      — active tasks (task-0xx).
- `backlog/completed/`  — finished tasks (keep their outcomes/notes).
- `backlog/archive/`    — superseded tasks/milestones (mark as historical).

The repo `README.md` and `CLAUDE.md` are context, not primary sources — consult
them for naming/architecture but cite the backlog file a fact comes from.

## Project scoping

Everything belongs to one project: **iotgw-ng**. Maintain a single
`projects/iotgw-ng.md` hub page. Do not create per-other-project pages.

## Distillation rules

- **Distill by topic, not one-page-per-file.** A decision/doc/task cluster about
  the same subject (e.g. "Kubernetes migration", "SSH key management in KMS",
  "device provisioning call chain") becomes ONE concept/synthesis page that
  cites every backlog file it draws from — not one page per task.
- **Decisions are authoritative.** When a task note and a decision disagree, the
  decision (ADR) wins unless a later task explicitly supersedes it; flag the
  contradiction with an Obsidian callout.
- **Preserve provenance.** Every page's `sources:` lists the backlog file(s) by
  relative path (e.g. `backlog/decisions/decision-015 - ...md`). Use
  `^[inferred]` for synthesized claims and `^[ambiguous]` for unresolved ones.
- **Lifecycle:** tag pages from `archive/` or superseded ADRs with
  `status/historical`; current ones `status/current`.

## Category routing for this domain

- `concepts/`    — architecture patterns & ideas (call chain, namespace-per-subproject, secrets-with-SOPS).
- `entities/`    — concrete things: Netmaker, Cosmian KMS, Kestra, Supabase, kind, ingress-nginx, edge functions, StackGres.
- `references/`  — lookups: service ports, image conventions, CLI/runbook commands, schemas.
- `synthesis/`   — cross-cutting analyses spanning multiple decisions/docs.
- `skills/`      — how-to procedures (deploy on kind, rotate secrets, run a flow).
- `projects/`    — the single `iotgw-ng.md` hub.

## Vocabulary (canonical spellings)

Netmaker, WireGuard, Cosmian KMS, KMIP, Kestra, Ansible, Supabase, PostgreSQL,
StackGres, edge function (`netmaker-call`), kind, kustomize, ingress-nginx,
SOPS, age, OpenWRT, tRPC, Fastify, pg_net, TOTP, ghcr.io/i40sys.
