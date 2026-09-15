---
title: Secret Exposure & Rotation Runbook
category: synthesis
tags: [secrets/sops, vpn/netmaker, status/current]
sources:
  - backlog/decisions/decision-014-secrets-management-with-sops-age-and-credential-rotation-runbook.md
  - backlog/docs/netmaker-credential-handling.md
relationships:
  - target: "[[concepts/secrets-management-sops-age]]"
    type: related_to
summary: The 2026-06-12 sweep found 88 real secrets; this is the consolidated COMPROMISED-value list and rotation runbook, including why the Netmaker master key is the one we cannot rotate.
visibility: internal
provenance:
  extracted: 0.85
  inferred: 0.08
  ambiguous: 0.07
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Secret Exposure & Rotation Runbook

A workspace-wide credential sweep (2026-06-12) found **88 confirmed real
secrets** — many hardcoded in git-tracked source, not just gitignored `.env`
files. Adopting SOPS+age ([[concepts/secrets-management-sops-age]]) stops *new*
leakage but does **not** undo prior exposure: compromised values stay valid until
rotated at their upstream service.

## The compromised set (rotate at the upstream, then `secrets.sh edit`)

Critical/high highlights from decision-014:

- **Netmaker master key** — *not rotatable by us* (see below).
- **Supabase `JWT_SECRET`** (+ re-mint `ANON_KEY`/`SERVICE_ROLE_KEY`),
  **`POSTGRES_PASSWORD`** — critical; the whole stack ran on published upstream
  defaults.
- **Kestra basic-auth** (personal account `oriol@joor.net`) — high.
- **Google Gemini key**, **OpenAI key**, **GitHub PATs ×3**, **Notion token** — high/medium.
- **Traefik TLS leaf key**, **WireGuard device/extclient keys** — medium (some
  already redacted; the WireGuard key in [[references/openwrt-wireguard-config]]).
- **SSH keys in Kestra `_files/keys`** (one is the operator's personal,
  world-readable, pushed to devices) — high; needs a dedicated fleet keypair.
- Supabase `SECRET_KEY_BASE`/`VAULT_ENC_KEY`/`DB_ENC_KEY`/dashboard pw — medium
  (note: `VAULT_ENC_KEY`/`DB_ENC_KEY` rotation requires re-encrypting existing
  data).

## The Netmaker master-key exception

> [!warning] Do NOT rotate the Netmaker master key
> `api.netmaker.i40sys.com` is a **SHARED PRODUCTION** server managing other
> networks; rotating its `MASTER_KEY` would disrupt them. The "rotate the leaked
> key" remediation is the **wrong action** here. The real mitigation: move *our*
> consumers to a **scoped, revocable Netmaker API key** (`POST /api/v1/api_keys`,
> non-disruptive), so a leak of our credential is limited and independently
> revocable (task-061). See [[entities/netmaker]].

The key now lives in **one** place — `secrets/supabase.enc.env` — after the
duplicate `secrets/netmaker.enc.env` was removed
([[synthesis/netmaker-collection-externalization]]).

## Git history

The Traefik leaf key and redacted doc keys remain reachable from earlier commits.
Before the repo gets a public remote: either rewrite history (`git
filter-repo`/BFG) **or** ensure the relevant items are rotated so the historical
blobs are worthless. (The repo later moved to public `i40sys/iotgw-ng`, gated on a
full-history secret audit — [[references/container-image-cicd]].)

## Sources

- decision-014 (rotation runbook), netmaker-credential-handling.md.
- Related: [[concepts/secrets-management-sops-age]], [[entities/netmaker]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-014-secrets-management-with-sops-age-and-credential-rotation-runbook|decision-014-secrets-management-with-sops-age-and-credential-rotation-runbook]]
- [[_sources/docs/netmaker-credential-handling|netmaker-credential-handling]]
