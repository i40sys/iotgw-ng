---
id: decision-014
title: Secrets Management with SOPS + age (and credential rotation runbook)
date: '2026-06-12 22:00'
status: accepted
---

## Context

A workspace-wide credential sweep (2026-06-12, recorded in
`BACKUP/claude-workspace-map-2026-06-12.json`) found **88 confirmed real
secrets**. The serious ones were not just sitting in gitignored `.env`
files — they were hardcoded in **git-tracked source**:

- Netmaker master key `NBMtSWau…GtjH5` in `netmaker-call/index.ts` (fallback
  default), its `CLAUDE.md`, ~75 versioned Kestra playbooks, and mirrored to
  the `i40sys/iotgw-kestra` GitHub remote.
- Kestra basic-auth `oriol@joor.net` / `***REMOVED-ROTATED-KESTRA-PW***` in **~10 tracked
  files** (3 edge functions, 2 backend routers across 7 call sites, agent
  docs, test docs).
- A Google Gemini API key and the Kestra Postgres password inline in tracked
  `kestra/docker-compose.yml`.
- A real RSA TLS **private key** inline in tracked `traefik-poc/docker-compose.yml`
  (also recoverable from this repo's history blob `9d325f5:traefik-poc/server.key`).
- Real WireGuard device private keys in tracked `doc-014`,
  `kestra-call/DEVICE_KEY_EXTRACTION.md`, and `iotgw-ui/supabase/seed.sql`.
- The entire self-hosted Supabase stack running on **published upstream
  default secrets** (POSTGRES_PASSWORD, JWT_SECRET, demo anon/service_role
  JWTs, dashboard password, SECRET_KEY_BASE, VAULT_ENC_KEY, PG_META_CRYPTO_KEY,
  DB_ENC_KEY) on a LAN-exposed instance.
- GitHub PATs (×3), a Notion token, a Kutt key, OpenAI/OpenRouter keys, and
  reused personal SSH keys living in the (gitignored, but remote-mirrored)
  Kestra runtime volume.

There was **no secrets-management mechanism** — secrets were either in
gitignored `.env` files (uncontrolled, no shared source of truth) or hardcoded.

## Decision

Adopt **SOPS + age** as the single secrets mechanism for the whole workspace.

1. **Encrypted source of truth** under `secrets/*.enc.{env,yaml}`, encrypted
   to one age recipient (public key committed in `.sops.yaml`; private key at
   `~/.config/sops/age/keys.txt`, never committed). Encrypted files **are**
   committed — they are safe at rest.
2. **No secret in tracked source.** Compose files, edge-function source,
   backend routers, agent docs and example docs read secrets from the
   environment; the environment is rendered from `secrets/` on demand.
3. **`tools/secrets/secrets.sh`** is the interface: `render`, `edit`,
   `reencrypt`, `check` (round-trip + cleartext-leak audit), and `k8s`
   (emit a `kubectl` Secret manifest from an encrypted env file — the bridge
   to the k8s migration, `decision-015`).
4. **Templates** (`.env.example`) are committed with keys only, value
   `CHANGEME`.

This is **dev-first and production-aligned**: the same encrypted files feed
local docker-compose, local kind (`secrets.sh k8s`), and any future prod
cluster (swap the age recipient for a KMS/cluster key via `sops updatekeys`).

## What was implemented (2026-06-12)

- `.sops.yaml`, `secrets/README.md`, `tools/secrets/secrets.sh`.
- Encrypted: `supabase`, `kestra`, `netmaker`, `kestra-reporter`,
  `iotgw-ui-root`, `iotgw-ui-backend` (env), and `traefik-tls` (yaml).
- De-hardcoded (now read from env, plaintext removed from tracked files):
  - `netmaker-call/index.ts` — master-key fallback removed; fails loud if unset.
  - `kestra-call/index.ts`, `kestra-call_delete/index.ts`,
    `kestra-call.old/index.ts` — `KESTRA_USER`/`KESTRA_PASSWORD` from env.
  - `iotgw-ui` backend `devices.ts` + `deployments.ts` (7 sites) — env creds.
  - `kestra/docker-compose.yml` — `${KESTRA_POSTGRES_PASSWORD}`,
    `${KESTRA_GEMINI_API_KEY}`; image pinned `kestra:1.3.22`, `postgres:18`
    (was `:latest`/untagged); stale `docker-compose.yml.bak` deleted.
  - `supabase/docker-compose.s3.yml` — `${MINIO_ROOT_USER/PASSWORD}`.
  - `supabase/docker-compose.yml` — `${DB_ENC_KEY}`.
  - `traefik-poc/docker-compose.yml` — inline TLS key → gitignored `./server.key`.
  - Redacted real keys in `doc-014`, `DEVICE_KEY_EXTRACTION.md`, `seed.sql`,
    `task-045`, `vpn-totp-manual-test.md`, and the footgun notes in the
    `netmaker-call` / `kestra-call` CLAUDE.md and `kestra-expert.md`.
- `.gitignore` updated to keep `*.enc.*` tracked while all plaintext stays out.

`tools/secrets/secrets.sh check` passes (all files round-trip, zero cleartext).

## ⚠️ Rotation runbook — these values are COMPROMISED

Encryption stops *new* leakage; it does **not** undo exposure that already
happened (tracked source, this repo's git history, and the
`i40sys/iotgw-kestra` remote). Every value below must be **rotated at its
upstream service**, then updated via `secrets.sh edit <name>`.

| # | Secret | Severity | Rotate where | Then update |
|---|---|---|---|---|
| 1 | Netmaker master key | **critical** | Netmaker admin (`api.netmaker.i40sys.com`) | `secrets.sh edit supabase` + `netmaker`; re-run Kestra `sync-namespace-files` after scrubbing playbooks (task-045) |
| 2 | Supabase `JWT_SECRET` (+ re-mint `ANON_KEY`/`SERVICE_ROLE_KEY`) | **critical** | regenerate secret; re-issue both JWTs | `secrets.sh edit supabase` + `iotgw-ui-backend`; restart stack |
| 3 | Supabase `POSTGRES_PASSWORD` | **critical** | `ALTER ROLE` on the DB; update all service roles | `secrets.sh edit supabase` |
| 4 | Kestra basic-auth password (`oriol@joor.net`) | **high** (personal account) | Kestra user settings | `secrets.sh edit kestra` + `supabase` + `kestra-reporter` + `iotgw-ui-backend` |
| 5 | Google Gemini API key | **high** | Google AI Studio | `secrets.sh edit kestra` |
| 6 | OpenAI key (`sk-proj-…`) | **high** | OpenAI dashboard | `secrets.sh edit supabase` |
| 7 | OpenRouter key (commented) | medium | OpenRouter | delete from env |
| 8 | GitHub PATs ×3 (`ghp_4G56…`, `ghp_9vDn…`, `ghp_UktR…`) | **high** | GitHub token settings (i40sys) | Kestra KV `GITHUB_ACCESS_TOKEN`; playbook `glpi-agent.yaml`; skills `.env` |
| 9 | Notion token (`secret_iuvD…`) | medium | Notion integrations | Kestra namespace `templates/notion.json.j2` |
| 10 | Kutt API key | low | Kutt | Kestra playbook `i01_get_link_from_json.yaml` |
| 11 | Traefik TLS leaf key (CN=wsl.ymbihq.local) | medium | regenerate via `kms/pki-test` | replace `traefik-poc/server.key`; `secrets.sh reencrypt`… (it's a PoC) |
| 12 | WireGuard device key (doc-014 / seed) | medium | rotate/delete extclient in Netmaker | already redacted in repo |
| 13 | WireGuard extclient key (DEVICE_KEY_EXTRACTION) | medium | rotate/delete extclient | already redacted |
| 14 | SSH keys in Kestra `_files/keys`, `files/credentials` (one is the operator's personal key, world-readable, pushed to devices) | **high** | new dedicated fleet keypair; remove personal key from fleet use | re-key devices; update Kestra namespace files |
| 15 | Supabase `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `DB_ENC_KEY`, dashboard password, Logflare tokens | medium | regenerate random | `secrets.sh edit supabase` (note: `VAULT_ENC_KEY`/`DB_ENC_KEY` rotation requires re-encrypting existing vault/realtime data) |
| 16 | Kestra Postgres password (`k3str4`) | low (internal) | `ALTER ROLE` | `secrets.sh edit kestra` |
| 17 | MinIO creds (S3 overlay) | low (dev) | MinIO | `secrets.sh edit supabase` |

**Git history**: the Traefik leaf key and the redacted doc keys remain
reachable from earlier commits (`9d325f5`, `e56d1f5`) on this branch/`main`.
Since the root repo has **no remote** (`decision-012` open question 4),
exposure is local-only today. Before the repo ever gets a remote, either
rewrite history (`git filter-repo`/BFG) **or** ensure items 11–13 above are
rotated so the historical blobs are worthless. Tracked as a backlog task.

## Consequences

**Positive**: one encrypted source of truth; secrets out of all tracked
source; reproducible local + k8s secret provisioning; auditable
(`secrets.sh check`); clear rotation path.

**Negative / residual risk**: the age private key is a new single point of
trust (must be backed up out-of-band, e.g. Bitwarden). The compromised values
remain valid until rotated (items above) — encryption is necessary but not
sufficient. Git history still contains old secrets until rotated or rewritten.

## References

- `secrets/README.md` — operational guide.
- `.sops.yaml`, `tools/secrets/secrets.sh`.
- `decision-012` — single-repo consolidation (history/remote context).
- `decision-015` — k8s migration (consumes `secrets.sh k8s`).
- `backlog/tasks/task-045` — externalize Netmaker master key from playbooks.
- `BACKUP/claude-workspace-map-2026-06-12.json` — full sweep evidence.
