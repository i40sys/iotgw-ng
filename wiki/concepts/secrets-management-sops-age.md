---
title: Secrets Management with SOPS + age
category: concepts
tags: [secrets/sops, infra/kubernetes, status/current]
relationships:
  - target: "[[synthesis/secret-exposure-rotation-runbook]]"
    type: related_to
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
sources:
  - backlog/decisions/decision-014 - Secrets-Management-with-SOPS-and-age.md
summary: SOPS + age is the single secrets mechanism — encrypted *.enc.{env,yaml} are committed, plaintext never is; tools/secrets/secrets.sh renders .env and emits k8s Secrets.
provenance:
  extracted: 0.9
  inferred: 0.05
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: core
created: 2026-06-26
updated: 2026-06-26
---

# Secrets Management with SOPS + age

Before this decision there was **no secrets-management mechanism** — secrets were
either in uncontrolled gitignored `.env` files or hardcoded in git-tracked source
(a 2026-06-12 sweep found **88 confirmed real secrets**, including hardcoded
Netmaker master keys, Kestra basic-auth, TLS private keys, and the whole Supabase
stack running on published upstream default secrets). The exposure side of this
is catalogued in [[synthesis/secret-exposure-rotation-runbook]].

## Decision: SOPS + age

1. **Encrypted source of truth** under `secrets/*.enc.{env,yaml}`, encrypted to
   one **age** recipient (public key committed in `.sops.yaml`; private key at
   `~/.config/sops/age/keys.txt`, never committed). Encrypted files **are**
   committed — safe at rest.
2. **No secret in tracked source.** Compose files, edge-function source, backend
   routers and docs read secrets from the environment, rendered from `secrets/`
   on demand.
3. **`tools/secrets/secrets.sh`** is the interface:
   - `render` — produce a plaintext `.env` for pnpm-dev consumers.
   - `edit` / `reencrypt` — manage encrypted files.
   - `check` — round-trip + cleartext-leak audit.
   - `k8s` — emit a `kubectl` Secret manifest from an encrypted env file (the
     bridge to the k8s migration).
4. **Templates** (`.env.example`) committed with keys only, value `CHANGEME`.

This is dev-first and production-aligned: the same encrypted files feed local
kind (`secrets.sh k8s`) and any future prod cluster (swap the age recipient for a
KMS/cluster key via `sops updatekeys`).

> [!note] Runtime evolution
> docker-compose was decommissioned ([[synthesis/docker-compose-decommission]]).
> The rendered-`.env` step is now only for pnpm-dev consumers; the platform's
> secrets are created as **k8s Secrets** straight from the SOPS store by
> `deploy/kind/bootstrap.sh make_secrets`. "Render the `.env` then `docker
> compose up`" becomes "create the Secret then `kubectl rollout restart`".

## Residual risk

The age private key is a new single point of trust (must be backed up out-of-band,
e.g. Bitwarden). **Encryption stops new leakage but does not undo prior
exposure** — compromised values remain valid until rotated at their upstream
service. Git history still contains old secrets until rotated or rewritten. The
full rotation runbook is in [[synthesis/secret-exposure-rotation-runbook]].

A repo-root `.gitleaks.toml` (allowlisting only `*.enc.*` ciphertext) backs a
`secret-scan` CI gate + pre-commit hook so no plaintext secret can re-enter
(decision-021, [[references/container-image-cicd]]).

## Sources

*Original backlog documents this page distills (browsable in-vault via `_sources/`).*

- [[_sources/decisions/decision-014 - Secrets-Management-with-SOPS-and-age|decision-014 - Secrets-Management-with-SOPS-and-age]]
