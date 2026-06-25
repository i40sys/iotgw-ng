---
id: TASK-067.11
title: >-
  SBOM (SPDX) + SLSA provenance attestations attached to each ghcr image by
  digest
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
labels:
  - ci
  - supply-chain
  - security
  - ghcr
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.06
references:
  - .github/workflows/build-and-push.yml
  - deploy/k8s/base/supabase-app/Dockerfile.functions
  - iotgw-ui/apps/backend/.docker/Dockerfile
  - iotgw-ui/apps/app/.docker/Dockerfile
  - task-062.03
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
To give consumers a verifiable bill of materials and build provenance for the 3 custom images, generate an SBOM and a SLSA build-provenance attestation per image and attach them (push-to-registry) to the ghcr.io/i40sys image DIGEST. Layer this into the reusable build-and-push workflow: optionally enable BuildKit-native sbom:true + provenance:mode=max on docker/build-push-action@v7 for fast inline (unsigned) attestations, but the authoritative, cryptographically-signed attestations come from anchore/sbom-action (Syft, SPDX-JSON) + actions/attest-sbom@v2 and actions/attest-build-provenance@v3, all bound to subject-digest with subject-name carrying NO tag. This unblocks the docs-runbook 'gh attestation verify' instructions and the public-migration supply-chain posture. Note: storage of org-owned attestations works because i40sys is a GitHub org.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For each image the reusable workflow generates an SPDX-JSON SBOM via anchore/sbom-action@v0 scanning ghcr.io/i40sys/<image>@${{ steps.build.outputs.digest }} (the pushed digest), producing an sbom file under 16MB.
- [x] #2 actions/attest-sbom@v2 attaches the SBOM with subject-name: ghcr.io/i40sys/<image> (NO tag), subject-digest: ${{ steps.build.outputs.digest }}, and push-to-registry: true, so the attestation is stored as an OCI referrer next to the image.
- [x] #3 actions/attest-build-provenance@v3 produces a SLSA provenance attestation with the same subject-name (no tag) + subject-digest and push-to-registry: true.
- [x] #4 The job declares permissions: id-token: write, attestations: write, packages: write, contents: read, and the per-image caller workflows propagate them (a reusable workflow cannot escalate beyond the caller's grant).
- [x] #5 Attestation steps run only on real pushes (not PR builds) and never sign/attest by a mutable tag — all bind to the sha256 digest from steps.build.outputs.digest.
- [x] #6 After a build on main, gh attestation verify oci://ghcr.io/i40sys/<image>@<digest> -R i40sys/iotgw-ng succeeds for at least one of the 3 images, confirming both the SBOM and provenance attestations are retrievable and valid.
- [x] #7 If BuildKit-native sbom:true + provenance:mode=max is also enabled on docker/build-push-action@v7, a code comment documents that those native attestations are UNSIGNED and the actions/attest-* path is the cryptographically verifiable one.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In the reusable workflow, after build/push, add anchore/sbom-action@v0 to generate sbom.spdx.json from the image digest.
2. Add actions/attest-sbom@v2 (subject-name no-tag, subject-digest, push-to-registry: true) to sign+attach the SBOM.
3. Add actions/attest-build-provenance@v3 with the same subject-name/digest and push-to-registry: true.
4. Set job permissions id-token/attestations/packages/contents and ensure caller workflows grant them via the permissions block.
5. Optionally enable BuildKit-native sbom:true + provenance:mode=max on the build-push step, with a comment noting they are unsigned (inline transparency only).
6. Guard all attestation steps behind the push condition (skip on PR / push:false).
7. Build on main and verify with gh attestation verify oci://ghcr.io/i40sys/<image>@<digest> -R i40sys/iotgw-ng.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**SBOM + provenance attestations in `build-image.yml`:**

- `anchore/sbom-action@v0` (SPDX-JSON) → `actions/attest-sbom@v2` +
  `actions/attest-build-provenance@v3` — `subject-name` no-tag, `subject-digest`,
  `push-to-registry`.
- BuildKit-native `sbom`/`provenance` also on (documented as **unsigned**).

**Live-validated 2026-06-25:** both attest steps success;
`gh attestation verify oci://ghcr.io/i40sys/iotgw-functions@sha256:43773c86… -R i40sys/iotgw-ng`
exits 0 (`slsa.dev/provenance/v1`).
<!-- SECTION:NOTES:END -->
