---
id: TASK-067
title: 'Epic: Container image CI/CD (GitHub Actions -> ghcr.io/i40sys)'
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
labels:
  - cicd
  - ghcr
  - supply-chain
  - epic
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
references:
  - task-062.03
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/kind/bootstrap.sh
  - ansible/netmaker/.github/workflows/publish-collection.yml
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stand up CI/CD for the three custom container images the platform builds (iotgw-functions, iotgw-ui-backend, iotgw-ui-frontend); every other image (kestra, postgres, ghcr.io/cosmian/kms, supabase/postgres, gotrue, postgrest, kong, headlamp, ingress-nginx, kindest/node, supabase/edge-runtime base) is an upstream pull-only image with no CI. Today all three are built locally by deploy/kind/bootstrap.sh and `kind load`-ed; there is no registry pipeline and the prod overlay still points at registry.invalid (the open TODO task-062.03). On GitHub Actions pushing to ghcr.io/i40sys this epic delivers: a reusable build-and-push workflow + one thin caller per image (linux/amd64), a supply-chain layer (Trivy CVE gate, cosign keyless signing, SBOM + SLSA provenance), and the deploy-side wiring (prod overlay pinned by digest, opt-in kind registry-pull). It is gated by pre-migration secret hygiene (full-history secret audit + removal of BACKUP/) because the repos are moving from Gitea to the public-capable GitHub org i40sys. Resolves task-062.03.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 15 subtasks are Done; the milestone 'Container image CI/CD (ghcr.io/i40sys)' shows complete.
- [x] #2 Pre-migration gate is green: the full-history secret audit passes and BACKUP/ is removed/relocated before any push to the i40sys GitHub org.
- [x] #3 All three custom images (iotgw-functions, iotgw-ui-backend, iotgw-ui-frontend) build and push to ghcr.io/i40sys (linux/amd64 only) via a reusable GitHub Actions workflow on main/tag.
- [x] #4 Supply-chain gates run on every image: Trivy HIGH/CRITICAL scan with SARIF to the Security tab, cosign keyless signature, and SBOM + SLSA provenance attestations, all bound to the image digest.
- [x] #5 deploy/k8s/overlays/prod/kustomization.yaml pulls all three images from ghcr.io/i40sys pinned by sha256 digest (no registry.invalid, no :local, no :latest), resolving task-062.03; kind keeps build-local with an opt-in registry-pull path.
- [x] #6 Docs/runbook updated: deploy/README.md status flipped, root CLAUDE.md image table updated, and a release + cosign/gh-attestation verify runbook published, cross-linking the new ADR (decision-021).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Hygiene gate: ADR (decision-021), remove BACKUP/, full-history secret audit + scan-CI, i40sys GitHub+ghcr setup.
2. Build core: reusable build-and-push workflow + one caller per image.
3. Supply-chain: Trivy scan, SBOM/provenance, cosign keyless signing layered onto the reusable workflow.
4. Consume + docs: wire the prod overlay to ghcr digests, opt-in kind registry-pull, release/verify runbook.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-06-25.** All 15 subtasks complete; milestone live-validated on the
now-PUBLIC `github.com/i40sys/iotgw-ng`.

**Delivered:**
- 3 custom images build+push to `ghcr.io/i40sys` (linux/amd64) via the reusable
  `build-image.yml` + 3 callers.
- Supply chain green per image: Trivy→SARIF (Security tab), cosign v3 signature
  (verified), SBOM + SLSA provenance (`gh attestation verify` exit 0).
- `secret-scan` gitleaks gate is a required check; native secret scanning + push
  protection on.
- prod overlay pins all 3 by `@sha256` (placeholder until a vX.Y.Z release);
  `bootstrap.sh` has the opt-in registry-pull path.
- `decision-021` + `deploy/RELEASE.md` published.

**Pre-migration gate:** full-history secret audit clean (0 findings) incl.
rotating+scrubbing the live Kestra pw + OpenRouter key; `BACKUP/` (untracked,
never published) deleted.

**Resolves** task-062.03. **Follow-ups:** task-067.18 (PROD_VITE_API_URL).
<!-- SECTION:NOTES:END -->
