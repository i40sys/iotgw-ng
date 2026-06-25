# Release runbook — custom container images (ghcr.io/i40sys)

Source of truth for conventions: **[decision-021](../backlog/decisions/decision-021%20-%20Container-image-CI-CD-and-ghcr.io-i40sys-conventions.md)**.
Milestone: `TASK-067` (Container image CI/CD). Resolves `TASK-062.03`.

The platform builds **three** custom images; everything else is upstream
pull-only (kestra, postgres, cosmian/kms, supabase/postgres, gotrue, postgrest,
kong, headlamp, ingress-nginx, kindest/node, supabase/edge-runtime base — no CI).

| Image | Context | Dockerfile | Caller workflow |
|---|---|---|---|
| `ghcr.io/i40sys/iotgw-functions` | `supabase/volumes` | `deploy/k8s/base/supabase-app/Dockerfile.functions` | `.github/workflows/functions-image.yml` |
| `ghcr.io/i40sys/iotgw-ui-backend` | `iotgw-ui` | `iotgw-ui/apps/backend/.docker/Dockerfile` | `.github/workflows/backend-image.yml` |
| `ghcr.io/i40sys/iotgw-ui-frontend` | `iotgw-ui` | `iotgw-ui/apps/app/.docker/Dockerfile` | `.github/workflows/frontend-image.yml` |

All builds are **linux/amd64 only**. The reusable engine
`.github/workflows/build-image.yml` runs the supply-chain layers on every real
push, **all bound to the `sha256` digest**: Trivy (HIGH/CRITICAL → SARIF to the
Security tab), cosign keyless signature, SBOM (SPDX) + SLSA provenance signed
attestations (pushed as OCI referrers).

> **Frontend caveat:** `iotgw-ui-frontend` bakes `VITE_API_URL` into the JS
> bundle at build time. It is **environment-specific** — set the prod backend URL
> in the repo variable `PROD_VITE_API_URL`; prod needs a release-tag rebuild, not
> image promotion.

## 1. Cut a release

```bash
git tag v1.2.3
git push origin v1.2.3
```

The tag triggers the three caller workflows → build + push + Trivy + cosign +
SBOM/provenance. Tags emitted (decision-021): immutable `sha-<gitsha>`, `v1.2.3`,
`1.2`, and `latest` on `main`. **Prod never references a tag — only digests.**

## 2. Read the published digests

```bash
for img in iotgw-functions iotgw-ui-backend iotgw-ui-frontend; do
  echo -n "$img  "
  docker buildx imagetools inspect ghcr.io/i40sys/$img:v1.2.3 \
    --format '{{json .Manifest.Digest}}'
done
# or, via the API:
#   gh api /users/i40sys/packages/container/<img>/versions --jq '.[0].name'
```

## 3. Pin the digests in the prod overlay

Paste each `sha256:…` into the `digest:` fields of
`deploy/k8s/overlays/prod/kustomization.yaml` (the `images:` block). Then:

```bash
kubectl kustomize deploy/k8s/overlays/prod | grep -E 'image: ghcr.io/i40sys'
# every custom image must be ghcr.io/i40sys/* @sha256:<digest> — no :latest, no :local
```

## 4. Verify before deploy

**cosign** (signer/verifier on the same v3 line —
`sigstore/cosign-installer@v4.1.0`):

```bash
cosign verify ghcr.io/i40sys/iotgw-ui-backend@sha256:<digest> \
  --certificate-identity-regexp '^https://github.com/i40sys/iotgw-ng/.github/workflows/.+@refs/.+' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com'
```

**SBOM + provenance attestations** (org/user attestation store on i40sys):

```bash
gh attestation verify oci://ghcr.io/i40sys/iotgw-ui-backend@sha256:<digest> -R i40sys/iotgw-ng
```

## 5. Deploy

```bash
kubectl apply -k deploy/k8s/overlays/prod
```

> ghcr packages should be **public** (no pull secret). If kept **private**, add a
> `dockerconfigjson` imagePullSecret (from the SOPS store, `decision-014`) in the
> `iotgw-ui` and `supabase-app` namespaces and reference it on the Deployments.

## Where the supply-chain evidence lives

- **Trivy CVEs** → GitHub repo **Security → Code scanning** (per-image category;
  allowlist un-actionable CVEs in repo-root `.trivyignore`). Rollout is fail-open
  (`exit-code: 0` in `build-image.yml`); flip to `1` to gate releases.
- **cosign signatures** → `ghcr.io/i40sys/<image>:sha256-<digest>.sig` referrer.
- **SBOM (SPDX) + SLSA provenance** → signed OCI referrers next to each digest
  (verify with `gh attestation verify`).

## kind: build-local vs registry-pull

kind defaults to **build-local** (`bootstrap.sh` builds the three images `:local`
and `kind load`s them). To validate the published prod images on kind instead:

```bash
IOTGW_IMAGE_SOURCE=registry IOTGW_IMAGE_REF=v1.2.3 deploy/kind/bootstrap.sh deploy
# private packages: also set GHCR_VISIBILITY=private GHCR_USER=… GHCR_TOKEN=…
```

It pulls `ghcr.io/i40sys/*` at the ref, retags to `:local`, and `kind load`s them
so the kind overlay is unchanged. Remember the frontend's baked `VITE_API_URL`
won't match the local kind hostname (`TASK-067.14`).
