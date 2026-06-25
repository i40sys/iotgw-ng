---
id: TASK-067.12
title: Cosign keyless (OIDC) signing of each image digest + documented verify command
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 05:30'
labels:
  - ci
  - security
  - supply-chain
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
To let consumers cryptographically verify that the 3 images came from this repo's CI (and pave the way for admission-controller verification), add cosign keyless signing of each image DIGEST using GitHub OIDC — no long-lived keys or secrets. Layer sigstore/cosign-installer@v4.1.0 plus a `cosign sign --yes ghcr.io/i40sys/<image>@<digest>` step into the reusable build-and-push workflow, signing by digest (never by mutable tag). Deliver the canonical `cosign verify` command (certificate-identity-regexp scoped to https://github.com/i40sys/iotgw-ng/.github/workflows/* and certificate-oidc-issuer https://token.actions.githubusercontent.com) so the docs-runbook can publish a consumer verification recipe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reusable workflow installs cosign via sigstore/cosign-installer@v4.1.0 (cosign v3 line; keyless is the default — no COSIGN_EXPERIMENTAL env var is set).
- [x] #2 A signing step runs cosign sign --yes ghcr.io/i40sys/<image>@${{ steps.build.outputs.digest }}, signing the DIGEST and never a tag, for each of the 3 images.
- [x] #3 The job grants permissions: id-token: write and packages: write (and caller workflows propagate them); signing is skipped on pull_request / fork builds where the OIDC token is unavailable.
- [x] #4 After a build on main, the signature is published to ghcr as ghcr.io/i40sys/<image>:sha256-<digest>.sig (the cosign .sig referrer is present for the signed image).
- [x] #5 A working consumer verify command is captured (in the workflow comments and handed to docs-runbook): cosign verify ghcr.io/i40sys/<image>@<digest> --certificate-identity-regexp '^https://github.com/i40sys/iotgw-ng/.github/workflows/.+@refs/.+' --certificate-oidc-issuer 'https://token.actions.githubusercontent.com', and running it against a freshly-signed image exits 0.
- [x] #6 The runbook note records the exact cosign version installed so signer/verifier stay on compatible releases (cosign v3 Rekor v2 / RFC3161 timestamp handling skew is called out).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add sigstore/cosign-installer@v4.1.0 to the reusable workflow before the sign step.
2. Add a cosign sign --yes step targeting ghcr.io/i40sys/<image>@${{ steps.build.outputs.digest }} (digest, never tag).
3. Ensure job permissions id-token: write + packages: write and propagate from caller workflows; guard the step so it only runs on push (not PR/fork).
4. Build on main and confirm the sha256-<digest>.sig referrer appears in ghcr.
5. Write and validate the cosign verify command (certificate-identity-regexp + certificate-oidc-issuer) and hand it, plus the pinned cosign version, to docs-runbook.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
sigstore/cosign-installer@v4.1.0 (cosign v3) + 'cosign sign --yes <image>@<digest>' (digest, guarded on push) in build-image.yml. LIVE-VALIDATED 2026-06-25 on public repo i40sys/iotgw-ng: first CI run built+pushed all 3 images to ghcr.io/i40sys; full supply chain green. sign step success; .sig referrer present (sha256-43773c86...); 'cosign verify' with the i40sys identity-regexp + token.actions issuer = VERIFIED with cosign v3 (v2 gave 'no signatures found' — the documented v2/v3 skew; verifier must be v3).
<!-- SECTION:NOTES:END -->
