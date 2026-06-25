# iotgw-ng — IoT Gateway Next Generation

A single consolidated repository (a **monorepo**) for the whole IoT Gateway
platform: the management UI, the self-hosted backend services, the workflow
and key-management tiers, and the Kubernetes deployment definitions.

> **VCS topology:** one git repo at this root (no per-subproject `.git`).
> See `backlog/decisions/decision-012` (consolidation) and
> `backlog/decisions/decision-013` (this monorepo organization, finalized).

## Repository map

| Path | Group | What it is |
|---|---|---|
| `iotgw-ui/` | **app** | React 19 SPA + Fastify/tRPC backend + shared contract (pnpm workspace). The product UI. |
| `supabase/` | **platform** | Self-hosted Supabase (Postgres, Kong, GoTrue, edge functions…). System of record + webhook hub. |
| `kestra/` | **platform** | Kestra workflow orchestration (OpenWRT provisioning / install / connectivity flows). |
| `kms/` | **platform** | Cosmian KMS — authoritative store for device SSH keys + the PoC PKI. |
| `deploy/` | **infra** | Kubernetes manifests (kustomize) + local `kind` cluster + bootstrap. |
| `secrets/` | **infra** | SOPS+age encrypted secrets (the only secret source of truth). |
| `tools/` | **infra** | Workspace tooling (`secrets/secrets.sh`, …). |
| `backlog/` | **docs** | ADRs (`decisions/`), docs (`docs/`), tasks (Backlog.md CLI). |
| `.claude/` | **meta** | Claude Code agents, skills, settings for this workspace. |
| `BACKUP/` | (gitignored) | Pre-consolidation `.git` archives + DB snapshot. Reversibility net; do not delete. |

The call chain (UI → tRPC → Supabase → webhook → edge function → Netmaker/Kestra
→ Ansible → device) is documented in `CLAUDE.md`.

## Quickstart

The platform runs on **Kubernetes** (a local `kind` cluster for development);
docker-compose was decommissioned in the task-062 milestone (`decision-017`).

```bash
# 0. Tools: docker, pnpm, node 22, just, sops+age, kubectl, kind, helm
#    age private key must be at ~/.config/sops/age/keys.txt (see secrets/README.md)

just secrets-check      # audit the encrypted store

# Bring the whole platform up on kind — see deploy/README.md:
just bootstrap          # = kind-up + k8s-deploy + k8s-smoke
#   just kind-up        #   create the cluster (+ ingress-nginx + StackGres operator)
#   just k8s-deploy     #   create Secrets from SOPS, build/load images, apply the kind overlay
#   just k8s-smoke      #   smoke checks
just status             # pods in the iotgw namespace

# iotgw-ui dev servers (pnpm) — optional, for live frontend/backend work:
just secrets-render     # decrypt secrets/*.enc.env -> the pnpm-dev .env files
just dev                # iotgw-ui frontend + backend (Vite + tsx)
```

Run `just` with no args to list every recipe.

## Conventions

- **Always operate from this root** via `just` (`just bootstrap`, `just dev`,
  `just kind-up` + `just k8s-deploy`), or `cd` into the relevant stack before
  running `kubectl` / `pnpm` directly.
- **Never commit a plaintext secret.** Everything secret lives encrypted in
  `secrets/`; `.gitignore` + `just secrets-check` enforce it. See
  `backlog/decisions/decision-014`.
- **Task management** goes through the Backlog.md CLI against `backlog/`
  (see `iotgw-ui/CLAUDE.md`).
- **Cross-project changes** follow the call chain top-down: schema
  (`iotgw-ui/supabase/migrations`) → contract types → backend/edge function →
  Kestra flow → Ansible.
