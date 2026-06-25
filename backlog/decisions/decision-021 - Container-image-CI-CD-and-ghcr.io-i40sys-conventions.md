---
id: decision-021
title: Container image CI/CD + ghcr.io/i40sys conventions
date: '2026-06-25 06:00'
status: accepted
---
## Context

The platform builds **three custom container images**; today all three are built
locally by `deploy/kind/bootstrap.sh` (tagged `:local`) and `kind load`-ed into
the cluster. There is **no registry pipeline**: the prod kustomize overlay
(`deploy/k8s/overlays/prod/kustomization.yaml`) still points the functions image
at `registry.invalid/iotgw-functions:REPLACE_WITH_RELEASE_TAG` and the two UI
images at `:local`/`imagePullPolicy: Never` — the open `TODO(task-062.03)`.

The repository has been migrated off Gitea (`git.oriolrius.cat`) to the
public-capable GitHub account **`i40sys`** (`github.com/i40sys/iotgw-ng`). That
unlocks GitHub Actions + GitHub Container Registry (`ghcr.io`) as the build/push
plane, but also raises the supply-chain bar: anything published from a
public-capable namespace should be scannable, signed, and provenanced.

Every **other** image the stack runs is an **upstream pull-only** image with no
CI of ours: `kestra`, `postgres` (kestra-postgres), `ghcr.io/cosmian/kms`,
`supabase/postgres` (via StackGres), `gotrue` (auth), `postgrest` (rest), `kong`,
`headlamp`, `ingress-nginx`, `kindest/node`, and the `supabase/edge-runtime`
base. None of these get a CI pipeline here — we only pin and pull them.

This ADR fixes the conventions so every downstream task (reusable-workflow,
the three image callers, Trivy/cosign/SBOM/provenance, the prod overlay, the
release runbook) cites one source of truth. Builds on `decision-014` (secrets:
SOPS+age — only `*.enc.*` ciphertext is publishable) and `decision-020`
(namespace-per-subproject — the consuming Deployments live in `supabase-app` and
`iotgw-ui`). Resolves the conventions half of `TODO(task-062.03)`; tracked under
milestone **Container image CI/CD (ghcr.io/i40sys)** (`task-067`).

## Decision

### Registry namespace and the three custom images

All custom images publish to **`ghcr.io/i40sys`** (lowercase). Exactly three:

| Image | Build context | Dockerfile |
|---|---|---|
| `ghcr.io/i40sys/iotgw-functions` | `supabase/volumes` | `deploy/k8s/base/supabase-app/Dockerfile.functions` |
| `ghcr.io/i40sys/iotgw-ui-backend` | `iotgw-ui` | `iotgw-ui/apps/backend/.docker/Dockerfile` |
| `ghcr.io/i40sys/iotgw-ui-frontend` | `iotgw-ui` | `iotgw-ui/apps/app/.docker/Dockerfile` |

The functions context is `supabase/volumes` (NOT repo root, NOT `supabase/`) so
the Dockerfile's `COPY functions/ ...` resolves to `supabase/volumes/functions/`.

**Upstream pull-only (NO CI here):** `kestra`, `postgres`, `ghcr.io/cosmian/kms`,
`supabase/postgres`, `gotrue`, `postgrest`, `kong`, `headlamp`, `ingress-nginx`,
`kindest/node`, and the `supabase/edge-runtime:v1.74.0` base. We pin and pull
them; we do not rebuild or republish them.

### Tag strategy

`docker/metadata-action` emits, for each image:

- `type=sha` — an **immutable** `sha-<gitsha>` tag (the canonical CI build id).
- `type=ref,event=branch` — the branch name (e.g. `main`) for convenience.
- `type=semver,pattern={{version}}` and `{{major}}.{{minor}}` — from `vX.Y.Z`
  git tags (release tags).
- `type=raw,value=latest,enable={{is_default_branch}}` — a moving `latest` on
  the default branch, for dev convenience only.

**Rule: prod NEVER references `:latest` or any mutable tag.** The prod overlay
pins every custom image by **`sha256` digest** (see below). `:latest` exists for
local/dev pulls, never for what prod runs.

### OCI labels

`docker/metadata-action` stamps the standard `org.opencontainers.image.*` labels
(source, revision, created, version, title, description) onto every image, so the
provenance of any pulled digest is self-describing.

### Platform: linux/amd64 only

Builds are **`linux/amd64` only** — no `arm64`, no multi-arch manifest, no
`docker/setup-qemu-action`. Rationale: the kind nodes (`kindest/node`) and the
target servers are all x86_64; multi-arch would double build time and pull QEMU
emulation for zero consumers. If an arm64 target ever appears, this is revisited.

### Supply-chain policy

Every image, on every real push (not PR builds), runs through, **all bound to the
`sha256` digest** from `docker/build-push-action`'s `outputs.digest`:

1. **Trivy** vulnerability scan (`aquasecurity/trivy-action`), severity
   `HIGH,CRITICAL`, `ignore-unfixed: true`, scanning the pushed image **by
   digest** from ghcr, emitting SARIF uploaded to the GitHub **Security >
   Code scanning** tab (per-image `category` so the three don't overwrite each
   other). A repo-root `.trivyignore` documents accepted/un-actionable CVEs. The
   initial rollout is **fail-open** (`exit-code: 0`) so findings are visible
   without blocking the first releases; flip to fail-closed once triaged.
2. **cosign keyless signing** (`sigstore/cosign-installer`, cosign v3 line) via
   GitHub OIDC — `cosign sign --yes ghcr.io/i40sys/<image>@<digest>`. No
   long-lived keys. Signs the **digest**, never a tag.
3. **SBOM (SPDX-JSON)** via `anchore/sbom-action` (Syft) + signed attestation
   via `actions/attest-sbom`, `push-to-registry: true`, `subject-name` carrying
   **no tag**, `subject-digest` = the pushed digest.
4. **SLSA build provenance** via `actions/attest-build-provenance`,
   `push-to-registry: true`, same `subject-name` (no tag) + `subject-digest`.

Consumers verify with `cosign verify ... --certificate-identity-regexp` scoped to
`https://github.com/i40sys/iotgw-ng/.github/workflows/*` and
`--certificate-oidc-issuer https://token.actions.githubusercontent.com`, and with
`gh attestation verify oci://ghcr.io/i40sys/<image>@<digest> -R i40sys/iotgw-ng`.

The per-job `permissions:` blocks the workflows declare are: `contents: read`,
`packages: write`, `id-token: write`, `security-events: write`,
`attestations: write`. A `workflow_call` reusable workflow cannot escalate beyond
the caller's grant, so each thin caller declares the same block.

### Prod overlay pins by digest

`deploy/k8s/overlays/prod/kustomization.yaml` resolves all three custom images to
`ghcr.io/i40sys/*` **pinned by `@sha256:<digest>`** (kustomize `images[].digest`),
never by tag. A new `vX.Y.Z` release's published digests are copied into the
overlay's `images:` block as the release step. kind stays **build-local** by
default, with an opt-in registry-pull path that uses the same ghcr digests so a
developer can validate exactly what prod runs.

### ghcr visibility / imagePullSecret

The three ghcr packages SHOULD be **public** (no pull secret needed in-cluster).
If kept **private**, the prod overlay and the kind registry-pull path must add a
`dockerconfigjson` `imagePullSecret` (sourced from the SOPS store, per
`decision-014`) in the consuming namespaces (`supabase-app`, `iotgw-ui`).

### Frontend image is environment-specific

`iotgw-ui-frontend` bakes `VITE_API_URL` into the JS bundle at build time
(`import.meta.env`). The published image is therefore **environment-specific**:
prod requires a release-tag rebuild with the prod backend URL as a `--build-arg`,
not promotion of one image across environments.

## Consequences

- **One build engine.** A single reusable `workflow_call` workflow
  (`.github/workflows/build-image.yml`) carries the build + the four
  supply-chain layers; three thin callers
  (`backend-image.yml`/`frontend-image.yml`/`functions-image.yml`) only set
  `image-name`/`context`/`dockerfile`/`build-args` and propagate permissions.
- **`task-062.03` resolved.** The prod overlay stops pointing at
  `registry.invalid`; `deploy/README.md`'s "authored, not validated" row flips.
- **Digest discipline.** Because prod pins by digest, a release is a deliberate
  "copy the published digests into the overlay" step — there is no silent
  `:latest` drift, and `cosign`/`gh attestation verify` bind to the same digest.
- **Hard pre-migration gate.** Publishing from `ghcr.io/i40sys` is gated on the
  full-history secret audit (`task-067.03`) and `BACKUP/` removal
  (`task-067.02`) being green, since the repo namespace is public-capable.
- **Secret scanning is ongoing.** A repo-root `.gitleaks.toml` (allowlisting only
  `*.enc.*` SOPS ciphertext) backs a `secret-scan` CI gate + a pre-commit hook
  (`task-067.04`), so no plaintext secret can re-enter now that history lives on
  GitHub.
- References: `decision-014` (secrets/SOPS), `decision-020` (namespaces),
  `task-062.03` (the TODO this resolves). Tracked as milestone
  **Container image CI/CD (ghcr.io/i40sys)** (`task-067`).
