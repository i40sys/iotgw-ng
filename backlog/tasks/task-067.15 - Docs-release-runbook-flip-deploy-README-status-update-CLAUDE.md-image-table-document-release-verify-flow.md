---
id: TASK-067.15
title: >-
  Docs + release runbook: flip deploy/README status, update CLAUDE.md image
  table, document release/verify flow
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 05:31'
labels:
  - docs
  - ghcr
  - supply-chain
  - cicd
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.13
  - TASK-067.12
  - TASK-067.10
  - TASK-067.11
  - TASK-067.14
references:
  - deploy/README.md
  - CLAUDE.md
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/kind/bootstrap.sh
  - task-062.03
  - decision-020
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the prod overlay pulls real ghcr.io/i40sys digests and the supply-chain gates (Trivy, cosign, SBOM/provenance) are live, the docs must catch up. This task flips deploy/README.md's TASK-062.03 'authored, not validated' rows to validated, updates the root CLAUDE.md service/image table to reference ghcr.io/i40sys instead of locally-built :local images, and writes a release runbook covering: cutting a release (tag -> CI build/push/sign), how published tags/digests flow into the prod overlay (the digest-pin update flow), how to `cosign verify` and `gh attestation verify` an image, and where Trivy SARIF + SBOMs live (GitHub Security tab / OCI referrers). It cross-links the new image CI/CD ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deploy/README.md's 'prod edge-functions image (registry pull)' row (line 126) and the TASK-062.03 reference (around line 139) are flipped from 🟡 'authored, not validated' to a validated state describing ghcr.io/i40sys digest-pinned pulls.
- [x] #2 The root CLAUDE.md service/image table (and any :local image references) is updated to state the three custom images are published to ghcr.io/i40sys/iotgw-functions, /iotgw-ui-backend, /iotgw-ui-frontend (amd64-only) and pulled by the prod overlay, while kind defaults to build-local.
- [x] #3 A release runbook documents the end-to-end flow: push a vX.Y.Z git tag -> caller workflows build+push+sign -> copy the published @sha256 digests into deploy/k8s/overlays/prod/kustomization.yaml -> deploy; it states images are pinned by digest, never :latest.
- [x] #4 The runbook gives the exact consumer verification commands: `cosign verify ghcr.io/i40sys/<image>@sha256:... --certificate-identity-regexp '...i40sys/iotgw-ng/.github/workflows/...' --certificate-oidc-issuer https://token.actions.githubusercontent.com` and `gh attestation verify oci://ghcr.io/i40sys/<image>@<digest> -R i40sys/iotgw-ng`, and pins the cosign version (sigstore/cosign-installer@v4.1.0 line).
- [x] #5 The runbook documents where supply-chain evidence lives: Trivy SARIF in the GitHub Security/code-scanning tab, and SBOM (SPDX) + SLSA provenance as signed OCI referrer attestations next to each image digest.
- [x] #6 The new image CI/CD ADR is cross-linked from deploy/README.md and CLAUDE.md, and the runbook notes the build-local-vs-registry-pull kind toggle from the bootstrap-pull task; `just verify` (docs/render checks) still passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Edit deploy/README.md: flip the line 126 status row and update the line 139 TASK-062.03 sentence to describe the validated ghcr.io/i40sys digest-pinned pull.
2. Update the root CLAUDE.md service/image table to reference ghcr.io/i40sys image names (amd64-only) and the kind build-local default.
3. Write the release runbook: tag -> CI -> digest -> prod overlay update -> deploy, emphasizing digest pinning.
4. Add the cosign verify + gh attestation verify command blocks with the i40sys identity regexp and pinned cosign version.
5. Document Trivy SARIF (Security tab) and SBOM/provenance (OCI referrers) locations.
6. Cross-link the image CI/CD ADR and the bootstrap-pull toggle; run `just verify`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
deploy/README.md row 126 flipped to 'wired' (ghcr.io/i40sys digest pulls) + the edge-functions caveat updated; root CLAUDE.md adds a 'Custom container images' note + decision-021 in Critical Docs; deploy/RELEASE.md is the full release+verify runbook (tag->CI->digest->overlay->deploy; cosign verify + gh attestation verify commands w/ i40sys identity regexp + pinned cosign-installer@v4.1.0; Trivy SARIF + SBOM/provenance locations; kind build-local-vs-registry toggle). ADR cross-linked from README + CLAUDE.md + RELEASE.md.
<!-- SECTION:NOTES:END -->
