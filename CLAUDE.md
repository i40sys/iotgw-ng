# iotgw-ng — Monorepo Workspace

This root **is a single git repository** (a monorepo) holding the whole IoT
Gateway Next Generation platform. The seven former nested repos were
consolidated into this one (`decision-012`), and the organization was finalized
in `decision-013`. There is no per-subproject `.git`. Start with
[README.md](README.md) for the repo map and `just` orchestrator.

> The platform runs on **Kubernetes (kind locally)** — `docker-compose` was
> decommissioned in the task-062 milestone (`decision-017`). Operate from the
> root via `just` (e.g. `just bootstrap`, `just dev`, `just kind-up` +
> `just k8s-deploy`), or `cd` into a stack before running `kubectl`/`pnpm`.

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
- The `oriolrius.netmaker` Ansible collection **no longer lives in this repo**:
  it was re-externalized to `github.com/oriolrius/netmaker-ansible-automation`
  (published to Ansible Galaxy as `oriolrius.netmaker`; `decision-022`,
  `task-068`). Kestra still installs it **from Galaxy** by FQCN at runtime for
  the OpenWRT flows; `netmaker-call` mirrors its Netmaker REST contract. There is
  no in-repo Ansible source.
- **TLS certs**: `kms/pki-test/` mints certs, consumed by the k8s Ingress
  (the former `traefik-poc/` PoC has been removed — see `deploy/`).

## The SSH-CA Access Path (gateway SSH is certificate-based)

Gateway SSH access is moving from hardcoded `authorized_keys` to **SSH
certificates** issued by **pki-manager** (`pki.joor.net`), **one zone per iotgw-ng
domain** (`decision-024`). A gateway presents a **host certificate**; operators and
the automation present **user certificates**. During the migration the break-glass
`authorized_keys` path is kept **alongside** the certificate path, never as the
primary mechanism (`decision-027`). iotgw-ng implements **no PKI of its own** — it
only calls pki-manager.

```
Domain created (UI → backend)
   → backend services/pki.ts creates the domain's pki-manager ZONE + user CA +
     host CA + principals (iotgw-admin, iotgw-ops), persists the ids on the
     `domains` row (pki_zone/pki_user_ca_id/pki_host_ca_id). task-080.

Gateway enrollment (the gateway's `iotgw ssh refresh`; driven by Ansible
tasks/ssh_ca.yaml in provisioning, or by the operator on the console / LuCI)
   1. gateway generates its own ecdsa-P256 HOST key (private half never leaves)
   2. POST the host pubkey to the `ssh-ca` EDGE FUNCTION — the ONLY bridge between
      a device and pki-manager; the gateway never sees the fleet token.
      FIRST enrollment: authenticated with a single-use device one-time code
      (backend-issued for provisioning, or typed by the operator; decision-033 —
      the gateway cannot compute codes). RENEWAL: signed with the enrolled host
      key, no code (`ssh-ca renew`); the daemon renews by itself.
   3. ssh-ca signs it with the domain's Host CA and returns the host cert + the
      User CA anchor + principals; the agent installs them + two sshd drop-ins
      (50- break-glass authorized_keys, 60- HostCertificate/TrustedUserCAKeys),
      validates `sshd -t`, reloads (never restart), fail-safe rollback.

Operator / automation access
   • trust a domain's Host CA:  scripts/ssh-ca/trust.sh  (writes an @cert-authority
     known_hosts line, so any gateway in the zone verifies with no per-host pins)
   • get a user certificate:    scripts/ssh-ca/user-cert.sh
   • Kestra connectivity-check VERIFIES the gateway host cert (StrictHostKeyChecking
     + @cert-authority + HostKeyAlias + HostKeyAlgorithms=…-cert-v01), task-093.
```

The `ssh-ca` edge function reads its zone-scoped **fleet token** from `PKI_FLEET_TOKENS`
(sign-host only); the **backend** holds a broader OIDC admin credential
(`PKI_OIDC_*`, a Keycloak service account) to create zones (`decision-028 §9`). See
the operator runbook: [`scripts/ssh-ca/README.md`](scripts/ssh-ca/README.md).

## Critical Validated Docs (in `backlog/`)

Source of truth for cross-project behavior — read before modifying an
integration point:

| Doc | Topic |
|---|---|
| **decision-013** | [Monorepo organization](backlog/decisions/decision-013-monorepo-organization-single-repo-with-logical-grouping-finalizes-decision-012.md) |
| **decision-014** | [Secrets management (SOPS+age) + rotation runbook](backlog/decisions/decision-014-secrets-management-with-sops-age-and-credential-rotation-runbook.md) |
| **decision-015** | [Kubernetes migration with kind](backlog/decisions/decision-015-kubernetes-migration-kustomize-with-a-local-kind-cluster-for-testing.md) |
| **decision-020** | [Namespace-per-subproject topology (`iotgw` is the cluster, not a namespace)](backlog/decisions/decision-020-namespace-per-subproject-topology-iotgw-is-the-cluster-not-a-namespace.md) |
| **decision-021** | [Container image CI/CD + ghcr.io/i40sys conventions (3 custom images, digest-pinned, signed)](backlog/decisions/decision-021-container-image-ci-cd-ghcr-io-i40sys-conventions.md) |
| **doc-016** | [Database-change provisioning automation pattern](backlog/docs/doc-016-database-change-provisioning-automation-pattern.md) (current: DB trigger → `netmaker-call` → Netmaker REST) |
| **decision-010** | [SSH key management via Cosmian KMS](backlog/decisions/decision-010-ssh-key-management-with-cosmian-kms.md) |
| **decision-033** | [Device one-time codes from a KMS-held random seed](backlog/decisions/decision-033%20-%20Device-one-time-codes-from-a-KMS-held-random-seed-operator-entered-single-use.md) — operator-entered, single-use; sealed VPN reply; host-key SSH renewal (supersedes decision-009) |
| **decision-024** | [SSH-CA target architecture — iotgw-ng consumes pki-manager, one zone per domain](backlog/decisions/decision-024-ssh-ca-target-architecture-iotgw-ng-consumes-pki-manager-one-zone-per-domain.md) (+ current-state `decision-023`, change map `decision-025`, provisioning sequence `decision-026`, migration plan `decision-027`, open decisions `decision-028`) |
| **doc-008** | [Domains → Networks → Devices hierarchy](backlog/docs/doc-008-domains-networks-and-devices-architecture.md) |
| **doc-010** | [DB migration + webhook management](backlog/docs/doc-010-database-migration-and-webhook-management-guide.md) |
| **doc-013** | [Deployments page behavior spec](backlog/docs/doc-013-deployments-page-behavior-specification.md) |

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
| `kms/` | Cosmian KMS (device SSH keys + PoC PKI) | [kms/CLAUDE.md](kms/CLAUDE.md) |
| `deploy/` | Kubernetes (kustomize) + local kind; TLS terminates at the Ingress (replaced the former `traefik-poc/`) | [deploy/README.md](deploy/README.md) |
| `secrets/` | SOPS+age encrypted secrets | [secrets/README.md](secrets/README.md) |
| `tools/` | `secrets.sh`, `verify.sh` | — |
| `backlog/` | ADRs, docs, tasks (Backlog.md CLI) | — |

> A frozen stack snapshot is at `BACKUP/supabase-2025-10-20/` (gitignored —
> do not edit).

### Custom container images (`decision-021`, `task-067`)

The platform builds exactly **three** custom images, published by GitHub Actions
to **`ghcr.io/i40sys`** (linux/amd64; Trivy + cosign keyless + SBOM/provenance):
`iotgw-functions`, `iotgw-ui-backend`, `iotgw-ui-frontend`. The **prod** overlay
pulls them **pinned by `@sha256` digest** (never `:latest`); **kind** defaults to
**build-local** (`bootstrap.sh` → `:local` + `kind load`), with an opt-in
`IOTGW_IMAGE_SOURCE=registry` path. Every other image (kestra, postgres,
cosmian/kms, supabase/postgres, gotrue, postgrest, kong, headlamp, ingress-nginx,
kindest/node, supabase/edge-runtime base) is **upstream pull-only, no CI**.
Release + verify runbook: [deploy/RELEASE.md](deploy/RELEASE.md).

## Working Instructions

- **Secrets**: real values are SOPS-encrypted in `secrets/`. Run
  `just secrets-render` before bringing up a stack. **Never** commit a
  plaintext `.env`/key or hardcode a secret in tracked source (`decision-014`).
- Cross-project changes follow the call chain top-down: schema
  (`iotgw-ui/supabase/migrations/`) → contract types
  (`iotgw-ui/packages/supabase-contract`) → backend/edge function → (for
  OpenWRT) Kestra flow → Ansible.
- **`authenticator` is co-owned by StackGres — never just `ALTER ROLE` it.**
  Patroni reconciles that role's password from the `roles-update-sql` blob in
  the operator-managed `supabase-db` Secret **on a schedule**, not only at pod
  restart, so a hand-set password silently reverts within hours. The symptom is
  always the same chain: PostgREST CrashLoops on `password authentication
  failed for user "authenticator"` → Kong 502 → the UI shows *"Failed to fetch
  X: An invalid response was received from the upstream server"*. SOPS is the
  source of truth (`sgcluster.yaml` → `spec.configurations.credentials`), but
  StackGres does **not** push a credentials change down to the live role — run
  **`just db-sync-roles`** after rotating `POSTGRES_PASSWORD` (`just k8s-deploy`
  does it automatically). Before re-setting any Postgres role password, check
  whether the operator owns it:
  `kubectl -n supabase-db get secret supabase-db -o jsonpath='{.data.roles-update-sql}' | base64 -d`.
- Run `just verify` for a repeatable check (secret hygiene, SOPS round-trip,
  kustomize render, ui typecheck+tests, kind smoke).
- **Pod `Running` is not "working."** `just k8s-smoke` now asserts the app-tier
  Deployments are `Available` and does a real `Kong → PostgREST → Postgres`
  read; a green pod list alone hid a dead PostgREST for 23h.
- Task management goes through the `backlog` CLI against `backlog/`.

## Service Ports (host `wsl.ymbihq.local`)

The kind cluster maps these host ports via NodePorts/ingress (`deploy/kind/cluster.yaml`).
The platform is split into one k8s **namespace per subproject** (`decision-020`):

| Service | Namespace | Port | via |
|---------|-----------|------|-----|
| Supabase Kong API (edge fns via `/functions/v1/*`) | `supabase-app` | 8000 | NodePort 30800 |
| Supabase Postgres (StackGres `supabase-db` primary, direct — no pooler) | `supabase-db` | 5432 | NodePort 30543 |
| Kestra UI/API | `kestra` | 8080 | NodePort 30808 |
| Cosmian KMS | `kms` | 9998 | NodePort 30998 (host path blocked by the task-057 NetworkPolicy; reached in-cluster) |
| iotgw-ui frontend (Vite) | `iotgw-ui` | 5173 | NodePort / ingress hostname |
| iotgw-ui backend (tRPC + WS) | `iotgw-ui` | 4444 | NodePort / ingress hostname |
| Ingress (iotgw-ui, …) HTTP / HTTPS | `supabase-app` / `iotgw-ui` | 80 / 443 | ingress-nginx |

> **Cross-namespace** service calls use the FQDN
> `service.namespace.svc.cluster.local` (e.g. `kong.supabase-app.svc.cluster.local:8000`,
> `cosmian-kms.kms.svc.cluster.local:9998`, `kestra.kestra.svc.cluster.local:8080`);
> **intra-namespace** calls keep short Service names (`decision-020`). `iotgw` remains the
> kind **cluster** name (and the Keycloak realm) — it is no longer a namespace.

> Supabase Studio, realtime, storage, imgproxy, analytics, supavisor and vector
> are **intentionally not deployed** (`decision-018`); the app tier connects to
> the direct primary at `supabase-db.supabase-db.svc.cluster.local:5432`. See `deploy/README.md`.
