# iotgw-ng — Monorepo Workspace

This root **is a single git repository** (a monorepo) holding the whole IoT
Gateway Next Generation platform. The seven former nested repos were
consolidated into this one (`decision-012`), and the organization was finalized
in `decision-013`. There is no per-subproject `.git`. Start with
[README.md](README.md) for the repo map and `just` orchestrator.

> Operate from the root via `just` (e.g. `just up-all`, `just dev`,
> `just kind-up`), or `cd` into a stack before running `docker compose`/`pnpm`.

## The Real Call Chain

When a user creates/updates a **device or network** in the UI, this is what
actually happens (devices and networks now provision **directly via the
`netmaker-call` edge function**, not through Kestra — commits f309e78/124e70e,
migrations 20260610000000/01):

```
1. UI (React)                          iotgw-ui/apps/app/
       ↓ tRPC call
2. Backend (Fastify/tRPC, :4444)       iotgw-ui/apps/backend/src/routers/
       ↓ supabase.from().insert()
3. Supabase PostgreSQL                 supabase/volumes/db/
       ↓ AFTER INSERT/UPDATE/DELETE trigger (pg_net)
4. Webhook: POST /functions/v1/netmaker-call
       ↓
5. Edge Function "netmaker-call"       supabase/volumes/functions/netmaker-call/
       • Creates {device|network}_jobs row (status PENDING)
       • Calls the Netmaker REST API directly (no Kestra, no Ansible)
       • Returns 202 Accepted; finishes work in EdgeRuntime.waitUntil()
       ↓
6. Netmaker API (api.netmaker.i40sys.com)
       • Creates extclient / network → returns WireGuard keys + IP
       ↓
7. UPDATE devices SET private_key, public_key, ip_address (device INSERT only)
8. UPDATE {device|network}_jobs SET status = SUCCESS/FAILED
9. UI polls jobs table via tRPC → updates UI
```

**Kestra is still used** for the OpenWRT side (NOT device/network provisioning):
- `install` / `provisioning` / `connectivity-check` flows run Ansible
  (`cytopia/ansible`) against gateways, **fetching** device SSH keys from
  **Cosmian KMS** (`kms/`) to deploy them onto the gateway.
- SSH-key **generation** is **not** a Kestra step: the iotgw-ui backend mints
  keys directly in Cosmian KMS via its KMIP REST API
  (`apps/backend/src/services/kms.ts`), automatically when a device is created
  and on demand via `generateMissingSshKey`. Devices store only `ssh_key_id`
  (`decision-010`, `task-060`).
- The Kestra `devices` / `networks` flows and the `kestra-call` edge function
  are **removed** — device/network provisioning runs through `netmaker-call`
  and SSH-key generation through the backend→KMS path.
- **TLS certs**: `kms/pki-test/` mints certs, consumed by the k8s Ingress
  (the former `traefik-poc/` PoC has been removed — see `deploy/`).

## Critical Validated Docs (in `backlog/`)

Source of truth for cross-project behavior — read before modifying an
integration point:

| Doc | Topic |
|---|---|
| **decision-013** | [Monorepo organization](backlog/decisions/decision-013%20-%20Monorepo-Organization-Single-Repo-with-Logical-Grouping.md) |
| **decision-014** | [Secrets management (SOPS+age) + rotation runbook](backlog/decisions/decision-014%20-%20Secrets-Management-with-SOPS-and-age.md) |
| **decision-015** | [Kubernetes migration with kind](backlog/decisions/decision-015%20-%20Kubernetes-Migration-with-local-kind.md) |
| **doc-016** | [Database-change provisioning automation pattern](backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) (current: DB trigger → `netmaker-call` → Netmaker REST) |
| **decision-010** | [SSH key management via Cosmian KMS](backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md) |
| **decision-009** | [TOTP authentication for device VPN access](backlog/decisions/decision-009%20-%20TOTP-Authentication-for-Device-VPN-Access.md) |
| **doc-008** | [Domains → Networks → Devices hierarchy](backlog/docs/doc-008%20-%20Domains-Networks-and-Devices-Architecture.md) |
| **doc-010** | [DB migration + webhook management](backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) |
| **doc-013** | [Deployments page behavior spec](backlog/docs/doc-013%20-%20Deployments-Page-Behavior-Specification.md) |

In-flight SSH-key-in-KMS work spans **task-032 through task-041**
(032/036/037/040/041 Done). The network-CRUD epic is task-042..052. Manage
tasks with the Backlog.md CLI (`backlog task list --plain`).

## Subprojects

All live in this one repo (no separate remotes). Pre-consolidation `.git`
archives are in `BACKUP/git-archives/` (the reversibility net).

| Folder | Role | Entry CLAUDE.md |
|--------|------|------------------|
| `iotgw-ui/` | React app + Fastify/tRPC backend + contract (pnpm) | [iotgw-ui/CLAUDE.md](iotgw-ui/CLAUDE.md) |
| `supabase/` | self-hosted Supabase stack | [supabase/CLAUDE.md](supabase/CLAUDE.md) |
| `supabase/volumes/functions/` | Deno edge functions | [supabase/volumes/functions/CLAUDE.md](supabase/volumes/functions/CLAUDE.md) |
| `kestra/` | workflow orchestration (flow source in DB + `i40sys/iotgw-kestra`) | [kestra/CLAUDE.md](kestra/CLAUDE.md) |
| `ansible/netmaker/` | `oriolrius.netmaker` collection (published to Galaxy) | [ansible/netmaker/CLAUDE.md](ansible/netmaker/CLAUDE.md) |
| `kms/` | Cosmian KMS (device SSH keys + PoC PKI) | [kms/CLAUDE.md](kms/CLAUDE.md) |
| `deploy/` | Kubernetes (kustomize) + local kind; TLS terminates at the Ingress (replaced the former `traefik-poc/`) | [deploy/README.md](deploy/README.md) |
| `secrets/` | SOPS+age encrypted secrets | [secrets/README.md](secrets/README.md) |
| `tools/` | `secrets.sh`, `verify.sh` | — |
| `backlog/` | ADRs, docs, tasks (Backlog.md CLI) | — |

> A frozen stack snapshot is at `BACKUP/supabase-2025-10-20/` (gitignored —
> do not edit).

## Working Instructions

- **Secrets**: real values are SOPS-encrypted in `secrets/`. Run
  `just secrets-render` before bringing up a stack. **Never** commit a
  plaintext `.env`/key or hardcode a secret in tracked source (`decision-014`).
- Cross-project changes follow the call chain top-down: schema
  (`iotgw-ui/supabase/migrations/`) → contract types
  (`iotgw-ui/packages/supabase-contract`) → backend/edge function → (for
  OpenWRT) Kestra flow → Ansible.
- Run `just verify` for a repeatable check (secret hygiene, SOPS round-trip,
  kustomize render, ui typecheck+tests, kind smoke).
- Task management goes through the `backlog` CLI against `backlog/`.

## Service Ports (host `wsl.ymbihq.local`)

Same ports whether you run docker-compose (`just up-all`) or kind
(`just kind-up`; NodePorts/ingress map to these host ports):

| Service | Port |
|---------|------|
| Supabase Kong API (edge fns via `/functions/v1/*`) | 8000 |
| Supabase DB (via supavisor / NodePort) | 5432 |
| Supabase Studio (compose: via Kong + basic-auth; no own port) | — |
| iotgw-ui frontend (Vite) | 5173 |
| iotgw-ui backend (tRPC + WS) | 4444 |
| Kestra UI/API | 8080 |
| Cosmian KMS | 9998 |
| Ingress / Traefik HTTP / HTTPS | 80 / 443 |
