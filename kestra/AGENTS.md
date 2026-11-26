# Kestra — Workflow Orchestration

Self-hosted Kestra (**v1.3.35**, `deploy/k8s/base/kestra/kestra.yaml`) that runs the `install` / `provisioning` / `connectivity-check` flows (OpenWRT config; these **fetch** device SSH keys from Cosmian KMS to deploy them). Device/network provisioning moved to the Supabase `netmaker-call` edge function (direct Netmaker REST), and SSH-key **generation** moved to the iotgw-ui backend (direct Cosmian KMS, `apps/backend/src/services/kms.ts`); the `devices` / `networks` flows were **removed**. Flows execute Ansible playbooks via Kestra's **Kubernetes task runner** (`io.kestra.plugin.kubernetes.core.PodCreate`), which spawns `cytopia/ansible` pods in-cluster (the host Docker-socket runner is gone — `task-054`).

Kestra runs as a Deployment in the **`kestra` k8s namespace** (`deploy/k8s/base/kestra/`, `decision-020`); docker-compose was decommissioned (`decision-017`). Bring the platform up with `just bootstrap`; roll Kestra after a config change with `kubectl -n kestra rollout restart deploy/kestra`. The PodCreate-spawned Ansible runner pods land in the `kestra` namespace too.

## Layout

- **Flow + playbook source is NOT in this repo.** It lives in the public repo
  **`github.com/i40sys/iotgw-kestra`** (secret-free):
  - flow definitions: `Flow.yaml` (id `provisioning`), `install-flow.yaml`,
    `connectivity-check-flow.yaml`, `sync-namespace-files.yaml` (namespace `iotgw-ng`);
  - playbooks at the root (`i11_provisioning_iotgw.yaml`, `d01_install_owrt.yml`,
    `connectivity_check.yml`) and in `playbooks/`;
  - `tasks/` (e.g. `ssh_ca.yaml`, `ssh_ca_install.yaml`), `templates/`, `files/`,
    `vars/`, `fetch_kms_key.py` (KMS SSH-key fetch helper).
- `deploy/k8s/base/kestra/` (this repo) — Kestra server Deployment + its PostgreSQL backing store + the k8s task-runner RBAC + NetworkPolicy.
- `kestra/` (this folder) — `AGENTS.md`, [`TESTING.md`](TESTING.md) (CLI runbook), `.env.example` (secret template).
- `kestra/data/` — local runtime state only; **gitignored** (`/kestra/data/` in the root `.gitignore`). Not a flow source; do not edit.

## Flows

| Flow (namespace `iotgw-ng`) | Triggered by | Runs playbook |
|---|---|---|
| `provisioning` | manual / backend tRPC deployment call | `i11_provisioning_iotgw.yaml` |
| `install` | manual | `d01_install_owrt.yml` |
| `connectivity-check` | on demand, per device (iotgw-ui backend); **no schedule** (`task-152`) | `connectivity_check.yml` |
| `sync-namespace-files` | daily 6 AM (`Schedule` trigger only) | syncs namespace files from `github.com/i40sys/iotgw-kestra` |

### SSH-CA on the OpenWRT side (`decision-024`/`decision-026`/`decision-033`)

Gateway SSH is moving to **certificates** (see the root `AGENTS.md` → "The SSH-CA
Access Path"). The Kestra-relevant pieces:

- **`tasks/ssh_ca.yaml`** — idempotent gateway enrollment: generate an ecdsa-P256
  host key, POST it to the `ssh-ca` edge function, install the returned host cert +
  User CA anchor + two sshd drop-ins, gate on `sshd -t`, reload (never restart),
  fail-safe rollback. First enrollment uses a single-use **device one-time code**
  fetched from the iotgw-ui backend; an enrolled gateway renews with its host key
  (no code, no TOTP — `decision-033`). Break-glass `authorized_keys` is kept
  alongside. `openssl`/`curl` run on the CONTROLLER (the runner pod), not the
  gateway. Imported by `i11_provisioning_iotgw.yaml` (the `provisioning` flow, tag
  `ssh_ca`); `d01_install_owrt.yml` uses `tasks/ssh_ca_install.yaml`.
- **`connectivity-check`** VERIFIES the gateway host certificate when given a
  domain Host CA + certified FQDN (`StrictHostKeyChecking=yes` + `@cert-authority`
  known_hosts + `HostKeyAlias` + `HostKeyAlgorithms=…-cert-v01`); without them it
  falls back to no host-key check (`task-093`).
- **Runner-pod image:** `cytopia/ansible:2.18-tools` pinned by `@sha256` digest.
  It ships neither `openssl` nor `curl`; the flows add them with
  `apk add --no-cache openssl curl` before the playbook runs.

## Critical: namespace files behavior

Kestra 1.2+ stores namespace files in its DB, not the filesystem. A change pushed to
`github.com/i40sys/iotgw-kestra` is **NOT** live until the `sync-namespace-files`
flow runs (daily, or trigger it). That flow syncs FILES only, not flow
DEFINITIONS: the flows are registered via the Kestra API / bootstrap. The runner
pods also `git clone` the repo's `main` at run time. See [`TESTING.md`](TESTING.md).

## Auth & integration

- Kestra basic auth: `KESTRA_BASIC_AUTH_USERNAME` / `KESTRA_BASIC_AUTH_PASSWORD` (plus `KESTRA_POSTGRES_PASSWORD`, `KESTRA_GEMINI_API_KEY`), from the `kestra-env` Secret, rendered from `secrets/kestra.enc.env` (SOPS+age, `decision-014`).
- KMS access: runner pods read `KMS_AUTH_TOKEN` from the `kms-auth` Secret (namespace `kestra`) and `fetch_kms_key.py` sends it as `Authorization: Bearer <token>`.
- Runtime values come from the Kestra KV store (`{{ kv('X') }}`) or ansible extra-vars; nothing secret is in git.
- `sync-namespace-files` clones the public repo **without** credentials (no `GITHUB_ACCESS_TOKEN`).
- The `oriolrius.netmaker` collection (`decision-022`) is **not** used by these flows; Netmaker is called only by the `netmaker-call` edge function.

## Call chain context

Kestra is **not** on the device/network provisioning path (that is DB trigger →
`netmaker-call` → Netmaker REST). It runs only the OpenWRT-side flows above. See
the root [AGENTS.md](../AGENTS.md) for the end-to-end picture.

## References

- [doc-016](../backlog/docs/doc-016%20-%20Database-Change-Provisioning-Automation-Pattern.md) — the current DB-trigger → netmaker-call provisioning pattern (and where Kestra still fits)
- [doc-014 OpenWRT Wireguard](../backlog/docs/doc-014%20-%20OpenWRT-Wireguard-Setup-Guide.md) — device-side WireGuard config produced by these playbooks
- [TESTING.md](TESTING.md) — CLI runbook (safety rules, run/monitor/validate)
