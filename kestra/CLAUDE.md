# Kestra — Workflow Orchestration

Self-hosted Kestra instance that runs flows triggered by the Supabase `kestra-call` edge function. Flows execute Ansible playbooks inside `cytopia/ansible:latest-tools` Docker runners.

## Layout

- `docker-compose.yml` — Kestra server + PostgreSQL backing store.
- `data/main/iotgw-ng/` — namespace workspace (Kestra 1.2+ stores files in DB, not filesystem; this dir is the *source* synced to the DB).
- `data/main/iotgw-ng/_files/` — **the actual flow and playbook sources** (Flow.yaml, device_update.yml, network_update.yml, i11_provisioning_iotgw.yaml, etc.). See its own [CLAUDE.md](data/main/iotgw-ng/_files/CLAUDE.md).
- `data/main/iotgw-ng/{devices,networks,install,provisioning,connectivity-check}/executions/` — runtime execution state (do not edit).
- `kestra-ansible-reporter/` — helper for reporting Ansible task output back to Kestra.

## Flows triggered from upstream

| Flow (namespace `iotgw-ng`) | Triggered by | Runs playbook |
|---|---|---|
| `devices` | kestra-call edge fn on `devices` INSERT/UPDATE/DELETE | `device_update.yml` / `device_delete.yml` |
| `networks` | kestra-call edge fn on `networks` INSERT/UPDATE/DELETE | `network_update.yml` / `network_delete.yml` |
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

- Kestra basic auth: `oriol@joor.net` (hardcoded in edge function — see `supabase/volumes/functions/kestra-call/`).
- Ansible playbooks use `oriolrius.netmaker` collection (see `ansible/netmaker/`) to call the Netmaker API at `api.netmaker.i40sys.com`.
- `GITHUB_ACCESS_TOKEN` stored in Kestra KV store for git sync.

## Call chain context

This is step 6–8 in the full chain. See the root [CLAUDE.md](../CLAUDE.md) for the end-to-end picture.

## References

- [doc-016](../iotgw-ui/backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) — how kestra-call triggers flows here
- [doc-014 OpenWRT Wireguard](../iotgw-ui/backlog/docs/doc-014%20OpenWRT%20Wireguard.md) — device-side WireGuard config produced by these playbooks
