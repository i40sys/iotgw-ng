# Kestra — Workflow Orchestration

Self-hosted Kestra instance that runs the `install` / `provisioning` / `connectivity-check` flows (OpenWRT config; these **fetch** device SSH keys from Cosmian KMS to deploy them). Device/network provisioning moved to the Supabase `netmaker-call` edge function (direct Netmaker REST), and SSH-key **generation** moved to the iotgw-ui backend (direct Cosmian KMS, `task-060`); the `devices` / `networks` flows here were **removed** (`task-060.04`). Flows execute Ansible playbooks inside `cytopia/ansible:latest-tools` Docker runners.

## Layout

- `docker-compose.yml` — Kestra server + PostgreSQL backing store.
- `data/main/iotgw-ng/` — namespace workspace (Kestra 1.2+ stores files in DB, not filesystem; this dir is the *source* synced to the DB).
- `data/main/iotgw-ng/_files/` — **NOT** the authoritative flow source. Flows live in Kestra's PostgreSQL DB; this dir is a write-through side effect of the local-storage driver (only the `provisioning` `Flow.yaml` is actually on disk). See its own [CLAUDE.md](data/main/iotgw-ng/_files/CLAUDE.md). (task-049 tracks fixing this.)
- `data/main/iotgw-ng/{devices,networks,install,provisioning,connectivity-check}/executions/` — runtime execution state (do not edit).
- `kestra-ansible-reporter/` — helper for reporting Ansible task output back to Kestra.

## Flows triggered from upstream

| Flow (namespace `iotgw-ng`) | Triggered by | Runs playbook |
|---|---|---|
| ~~`devices`~~ | **REMOVED** (`task-060.04`) — provisioning → `netmaker-call`, SSH-key gen → backend→KMS | ~~`device_update.yml` / `device_delete.yml`~~ (deleted) |
| ~~`networks`~~ | **REMOVED** (`task-060.04`) — provisioning → `netmaker-call` | ~~`network_update.yml` / `network_delete.yml`~~ (deleted) |
| `provisioning` | manual / backend tRPC deployment call | `i11_provisioning_iotgw.yaml` |
| `install` | manual | `d01_install_owrt.yml` |
| `connectivity-check` | scheduled / on-demand | `connectivity_check.yml` |
| `sync-namespace-files` | daily 6 AM + GitHub webhook | syncs this dir from `github.com/i40sys/iotgw-kestra` |

## Critical: Kestra 1.2 namespace files behavior

Filesystem changes under `data/main/iotgw-ng/_files/` are **NOT** auto-reflected in the Kestra runtime. After editing:
- Either trigger the `sync-namespace-files` flow, or
- Use the `/sync-kestra` skill (commits, pushes to GitHub, triggers sync).

Skills config at `data/main/iotgw-ng/_files/.claude/skills/`.

## Auth & integration

- Kestra basic auth: credentials read from env (`KESTRA_USER` / `KESTRA_PASSWORD`), sourced from `secrets/kestra.enc.env` (SOPS+age, decision-014). No longer hardcoded in the edge function.
- Ansible playbooks use `oriolrius.netmaker` collection (see `ansible/netmaker/`) to call the Netmaker API at `api.netmaker.i40sys.com`.
- `GITHUB_ACCESS_TOKEN` stored in Kestra KV store for git sync.

## Call chain context

This is step 6–8 in the **LEGACY** device/network path. Current device/network provisioning goes through the `netmaker-call` edge function (direct Netmaker REST), not Kestra. See the root [CLAUDE.md](../CLAUDE.md) for the end-to-end picture.

## References

- [doc-016](../backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) — the current DB-trigger → netmaker-call provisioning pattern (and where Kestra still fits)
- [doc-014 OpenWRT Wireguard](../backlog/docs/doc-014%20OpenWRT%20Wireguard.md) — device-side WireGuard config produced by these playbooks
