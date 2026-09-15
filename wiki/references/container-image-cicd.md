---
title: Container Image CI/CD (ghcr.io/i40sys)
category: references
tags: [cicd/images, cicd/github-actions, infra/kubernetes, status/current]
sources:
  - backlog/decisions/decision-021-container-image-ci-cd-ghcr-io-i40sys-conventions.md
  - backlog/tasks/task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys.md
summary: The three custom images, their build contexts, the tag/digest strategy, and the Trivy+cosign+SBOM+SLSA supply-chain policy — everything else is upstream pull-only.
provenance:
  extracted: 0.92
  inferred: 0.03
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Container Image CI/CD (ghcr.io/i40sys)

The platform builds **exactly three custom images**, published by GitHub Actions
to **`ghcr.io/i40sys`** (lowercase, linux/amd64 only). Everything else is
**upstream pull-only** (no CI of ours).

## The three custom images

| Image | Build context | Dockerfile |
|---|---|---|
| `ghcr.io/i40sys/iotgw-functions` | `supabase/volumes` | `deploy/k8s/base/supabase-app/Dockerfile.functions` |
| `ghcr.io/i40sys/iotgw-ui-backend` | `iotgw-ui` | `iotgw-ui/apps/backend/.docker/Dockerfile` |
| `ghcr.io/i40sys/iotgw-ui-frontend` | `iotgw-ui` | `iotgw-ui/apps/app/.docker/Dockerfile` |

(The functions context is `supabase/volumes`, NOT repo root, so `COPY functions/
…` resolves correctly.)

**Upstream pull-only (no CI):** kestra, postgres, `ghcr.io/cosmian/kms`,
`supabase/postgres`, gotrue, postgrest, kong, headlamp, ingress-nginx,
kindest/node, and the `supabase/edge-runtime:v1.74.0` base.

## Tags & digest discipline

`docker/metadata-action` emits `type=sha` (immutable build id),
branch/semver/`latest` tags. **Rule: prod NEVER references `:latest` or any
mutable tag** — the prod overlay pins every custom image by **`@sha256` digest**.
kind defaults to **build-local** (`:local` + `kind load`), with an opt-in
`IOTGW_IMAGE_SOURCE=registry` path using the same ghcr digests.

## Supply-chain policy (every push, bound to the digest)

1. **Trivy** scan (`HIGH,CRITICAL`, `ignore-unfixed`), SARIF → Security tab;
   initial rollout fail-open.
2. **cosign keyless signing** via GitHub OIDC (signs the digest).
3. **SBOM (SPDX-JSON)** via Syft + signed attestation.
4. **SLSA build provenance** attestation.

Verify with `cosign verify … --certificate-identity-regexp
https://github.com/i40sys/iotgw-ng/.github/workflows/*` and `gh attestation
verify oci://ghcr.io/i40sys/<image>@<digest>`.

## Notes

- **One build engine:** a reusable `workflow_call` (`build-image.yml`) + three
  thin callers.
- **Frontend image is environment-specific** — `VITE_API_URL` is baked at build
  time, so prod needs a release-tag rebuild, not image promotion.
- **Hard pre-migration gate:** publishing from the public-capable `i40sys`
  namespace is gated on a full-history secret audit + `BACKUP/` removal being
  green; a `.gitleaks.toml` (allowlisting only `*.enc.*`) backs a CI gate +
  pre-commit hook.

## Implementation status

**Done (2026-06-25)** as the `TASK-067` milestone (18 subtasks), live on the now-
public `github.com/i40sys/iotgw-ng` — see [[synthesis/image-cicd-epic]] for what
shipped and the secret-audit gate that preceded going public.

## Sources

- decision-021, task-067. Related: [[concepts/secrets-management-sops-age]], [[concepts/namespace-per-subproject]], [[entities/edge-functions]], [[synthesis/image-cicd-epic]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-021-container-image-ci-cd-ghcr-io-i40sys-conventions|decision-021-container-image-ci-cd-ghcr-io-i40sys-conventions]]
- [[_sources/tasks/task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys|task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys]]
