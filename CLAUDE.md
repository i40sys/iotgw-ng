# iotgw-ng — Multi-Project Workspace

This root is NOT a monorepo. It's a collection of independent projects that together form the IoT Gateway Next Generation platform. Each subproject has its own git repo, tooling, and CLAUDE.md.

## The Real Call Chain

When a user creates/updates a device or network in the UI, this is what actually happens:

```
1. UI (React)                          iotgw-ui/apps/app/
       ↓ tRPC call
2. Backend (Fastify/tRPC, :4444)       iotgw-ui/apps/backend/src/routers/
       ↓ supabase.from().insert()
3. Supabase PostgreSQL                 supabase/volumes/db/
       ↓ AFTER INSERT/UPDATE trigger (pg_net)
4. Webhook: POST /functions/v1/kestra-call
       ↓
5. Edge Function "kestra-call"         supabase/volumes/functions/kestra-call/
       • Creates {device|network}_jobs row (status PENDING)
       • POST to Kestra: /api/v1/main/executions/iotgw-ng/{devices|networks}
       • Starts background polling via EdgeRuntime.waitUntil()
       • Returns 202 Accepted immediately
       ↓
6. Kestra flow (namespace iotgw-ng)    kestra/data/main/iotgw-ng/_files/
       ↓ runs ansible-playbook via cytopia/ansible Docker image
7. Ansible playbook (device_update.yml, network_update.yml, etc.)
       ↓ uses oriolrius.netmaker collection
8. Netmaker API (api.netmaker.i40sys.com)
       • Creates extclient / network
       • Returns WireGuard keys + IP
       ↓
9. Edge function polls Kestra logs, extracts keys via "Retrieve created device" task output
       ↓
10. UPDATE devices SET private_key, public_key, ip_address
11. UPDATE {device|network}_jobs SET status = SUCCESS/FAILED
12. UI polls jobs table via tRPC → updates UI
```

**Parallel chains:**
- **SSH keys**: Kestra `install`/`provisioning` flows call Cosmian KMS (`kms/`) to generate SSH keys; devices table stores only `ssh_key_id`. See `decision-010`.
- **TLS certs**: `kms/pki-test/` mints certs; `traefik-poc/` consumes them for reverse proxy termination.

## Critical Validated Docs (in iotgw-ui/backlog/)

These are the source of truth for cross-project behavior. Read before modifying any integration point:

| Doc | Topic | Location |
|---|---|---|
| **doc-016** | Kestra notification automation pattern (webhook → edge fn → Kestra) | [iotgw-ui/backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md](iotgw-ui/backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) |
| **decision-010** | SSH key management via Cosmian KMS (ADR-001) | [iotgw-ui/backlog/decisions/decision-010 - ADR-001-SSH-Key-Management-with-Cosmian-KMS.md](iotgw-ui/backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md) |
| **decision-009** | TOTP authentication for device VPN access | [iotgw-ui/backlog/decisions/decision-009 - TOTP-Authentication-for-Device-VPN-Access.md](iotgw-ui/backlog/decisions/decision-009%20-%20TOTP-Authentication-for-Device-VPN-Access.md) |
| **doc-008** | Domains → Networks → Devices hierarchy & data models | [iotgw-ui/backlog/docs/doc-008 - Domains-Networks-and-Devices-Architecture.md](iotgw-ui/backlog/docs/doc-008%20-%20Domains-Networks-and-Devices-Architecture.md) |
| **doc-010** | DB migration + webhook management (includes the devices/networks webhook setup) | [iotgw-ui/backlog/docs/doc-010 - Database-Migration-and-Webhook-Management-Guide.md](iotgw-ui/backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) |
| **doc-013** | Deployments page behavior spec | [iotgw-ui/backlog/docs/doc-013 - Deployments-Page-Behavior-Specification.md](iotgw-ui/backlog/docs/doc-013%20-%20Deployments-Page-Behavior-Specification.md) |

Backlog tasks (task-034 through task-041) track the in-flight SSH-key-in-KMS work — check those before making changes there.

## Subprojects

| Folder | Git Remote | Entry CLAUDE.md |
|--------|-----------|------------------|
| `iotgw-ui/` | `i40sys/iotgw-ui` | [iotgw-ui/CLAUDE.md](iotgw-ui/CLAUDE.md) |
| `supabase/` | local only | [supabase/CLAUDE.md](supabase/CLAUDE.md) |
| `supabase/volumes/functions/` | — | [supabase/volumes/functions/CLAUDE.md](supabase/volumes/functions/CLAUDE.md) |
| `kestra/` | none (synced via `sync-namespace-files` flow) | [kestra/CLAUDE.md](kestra/CLAUDE.md) |
| `ansible/netmaker/` | `oriolrius/netmaker-ansible-automation` | [ansible/CLAUDE.md](ansible/CLAUDE.md) → [ansible/netmaker/CLAUDE.md](ansible/netmaker/CLAUDE.md) |
| `kms/` | `i40sys/iotgw-kms` | [kms/CLAUDE.md](kms/CLAUDE.md) |
| `traefik-poc/` | none | [traefik-poc/CLAUDE.md](traefik-poc/CLAUDE.md) |
| `supabase-2025-10-20/` | none | snapshot/backup — do not edit |

## Working Instructions

- **Always `cd` into the relevant subproject before running commands.** Do not run build, test, or service commands from this root.
- Read the subproject's CLAUDE.md before making changes.
- Cross-project changes follow the call chain top-down: schema (supabase/) → types (iotgw-ui/packages/supabase-contract) → backend/edge function → Kestra flow → Ansible playbook.
- Task management for `iotgw-ui/` goes through `backlog` CLI (see iotgw-ui/CLAUDE.md).

## Service Ports (local dev, host `wsl.ymbihq.local`)

| Service | Port |
|---------|------|
| Supabase Studio | 3000 |
| Supabase Kong API (edge fns via `/functions/v1/*`) | 8000 |
| Supabase DB (via supavisor) | 5432 |
| iotgw-ui frontend (Vite) | 5173 |
| iotgw-ui backend (tRPC + WS) | 4444 |
| Kestra UI/API | 8080 |
| Cosmian KMS | 9998 |
| Traefik HTTP / HTTPS | 80 / 443 |
