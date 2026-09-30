# Release runbook — custom container images (ghcr.io/i40sys)

Source of truth for conventions: **[decision-021](../backlog/decisions/decision-021%20-%20Container-image-CI-CD-ghcr.io-i40sys-conventions.md)**.
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

Before tagging, commit the component version bumps and release notes at
`deploy/releases/vX.Y.Z.md`, run the relevant checks, and merge into `main`.
The Git tag is the product version; frontend/backend package versions advance
independently when those components change (decision-036).

```bash
git switch main
git pull --ff-only origin main
git tag -a v1.2.3 -m "v1.2.3: concise description of the release"
git push origin v1.2.3
```

The `live-image` workflow creates the GitHub release and attaches its binaries,
checksums and overlay archives. When the matching notes file exists in the tag,
the workflow uses it as the release body, including when rerunning against an
existing release. Older tags without a notes file retain generated notes.
Wait for the image and live-image workflows to finish before treating the
release artifacts as ready; publishing a tag does not roll out the platform.

The tag triggers the three caller workflows → build + push + Trivy + cosign +
SBOM/provenance. Tags emitted (decision-021): immutable `sha-<gitsha>`, `1.2.3`
and `1.2` (docker/metadata-action semver — **without** the git tag's `v`), and
`latest` on `main`. **Prod never references a tag — only digests.**

## 2. Read the published digests

```bash
for img in iotgw-functions iotgw-ui-backend iotgw-ui-frontend; do
  echo -n "$img  "
  docker buildx imagetools inspect ghcr.io/i40sys/$img:1.2.3 \
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

## Live image + chainloader (netboot, task-149)

Every `v*` tag also publishes the provisioning boot chain:

- **Live image** — `live-image.yml` (`image` job) pushes the bootable image to
  `ghcr.io/i40sys/iotgw-live-image:<X.Y.Z>` as an OCI artifact (public) with
  build provenance, and attaches `live-image-oci.txt` (`ref@digest`) and
  `live-image-SHA256SUMS` to the release.
- **Chainloader** — `netboot-chainloader.yml` attaches `ipxe.efi`,
  `undionly.kpxe`, `ipxe-usb.img` and `chainloader-SHA256SUMS`.

To serve a new live image from the OVH netboot, pin its digest (never a tag):

```bash
ref="$(gh release download vX.Y.Z -R i40sys/iotgw-ng -p live-image-oci.txt -O -)"
gh attestation verify "oci://$ref" -R i40sys/iotgw-ng
# deploy/k8s/overlays/ovh/kustomization.yaml -> netboot patch value: "$ref"
deploy/terraform/ovh/tf.sh platform apply
```

The netboot's init container pulls that digest and checks every file against
the artifact's `SHA256SUMS` before nginx serves it.

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

## Product identity in Edge Manager (decision-036)

The badge beside Edge Manager identifies a **declared product release**. The
About dialog also reports the browser/backend builds and any recorded component
image observations. UI/backend package versions remain independent; they are
not the product release number.

New frontend/backend images embed their package version, full Git revision,
release tag, build time and dirty state. CI supplies this automatically. For a
manual image build, pass `IOTGW_BUILD_REVISION=<full Git SHA>`,
`IOTGW_BUILD_RELEASE=vX.Y.Z` and `IOTGW_BUILD_DIRTY=false` **only for a clean tagged
build**. Local kind builds pass their local revision and dirty state. Without
provenance the About dialog reports unknown/unverified fields.

After building/verifying the images and pinning their digests, declare the
release from the intended overlay (Python 3 + PyYAML and kubectl are required):

```bash
python3 deploy/release-manifest.py generate \
  --release vX.Y.Z \
  --overlay deploy/k8s/overlays/ovh \
  --environment production \
  --flows-revision <full-commit-of-the-separate-iotgw-kestra-repository> \
  --output deploy/k8s/overlays/ovh/release-manifest.json
```

Use a real existing `vX.Y.Z` tag. The tool reads UI/backend package versions and
the migration target from that tag, and image references from the rendered
overlay. It does not resolve registry provenance: continue verifying the pinned
images/signatures as described above. Omit `--flows-revision` if it is unknown;
never substitute the monorepo SHA for the separate workflow source. Check the
result into Git with the image pins. Freeze a published release's intended
component set; create a new release for a changed combination.

Each overlay owns its `release-manifest.json` and creates the `iotgw-release`
ConfigMap. The checked-in initial value `null` means no release is declared.
The backend reads `/etc/iotgw-release/manifest.json` through an optional,
read-only directory mount. An unset/missing/invalid manifest does not prevent
the backend from starting. For OVH, publish through the existing Terraform
platform apply; do not separately `kubectl apply` Terraform-owned resources.
For kind/prod-sketch, use their normal overlay deployment path.

After rollout, record a **read-only image/readiness snapshot**, explicitly
choosing the correct Kubernetes context:

```bash
python3 deploy/release-manifest.py verify \
  --context <cluster-context> \
  --manifest deploy/k8s/overlays/ovh/release-manifest.json \
  --output deploy/k8s/overlays/ovh/release-manifest.json
```

A reference mismatch or incomplete rollout records the evidence and exits 1;
a read/validation failure exits 2. Review the result and republish the updated
manifest through the same deployment owner to expose it in the UI. ConfigMap
projection can take time; no application restart is required for metadata-only
updates. Repeat after a rollback and retain the previous declaration/snapshot.

The timestamp denotes the observation, not the original deployment time.
Matching mutable tags are still marked unverified for image content. Workflow
revisions and migration filenames are declared targets, not proof that Kestra
or PostgreSQL applied them. The About dialog states these limits. Its **Copy
diagnostic information** action includes only identity metadata, never process
environment variables, credentials, pod logs or the rendered overlay.

For local development, Vite shows `DEV · <commit>` (`*` for local changes at
startup); restart Vite after changing commits to refresh that identity. The
backend's development identity is independent. A development UI connected to a
released backend remains visibly marked DEV.
