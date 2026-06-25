---
id: TASK-067.17
title: >-
  Make the 3 ghcr packages public and validate unauthenticated pull + cosign
  verify
status: Done
assignee: []
created_date: '2026-06-25 08:10'
updated_date: '2026-06-25 08:17'
labels:
  - ghcr
  - cicd
  - validation
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PROBLEM: tasks 067.05/067.13/067.14 were marked Done assuming the 3 ghcr packages were public (so prod/kind pull needs no imagePullSecret and consumers can cosign-verify), but the packages were actually PRIVATE — they were created private by the first CI push and there is no REST endpoint to flip user-owned container-package visibility, so the "set public" step silently never happened. The cosign/gh-attestation verification in 067.12 only worked because I authenticated with the i40sys token; an unauthenticated consumer (and the digest-pinned prod overlay without a pull secret) would have failed. This task makes the packages actually public and PROVES unauthenticated pull + verify.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All 3 packages (iotgw-functions/iotgw-ui-backend/iotgw-ui-frontend) are visibility=public (flipped via the package Settings UI; no REST endpoint exists).
- [x] #2 Unauthenticated (logged-out) anonymous manifest pull of each package's :latest returns HTTP 200 — proving public access without an imagePullSecret.
- [x] #3 Anonymous cosign verify (no docker login) of a published digest succeeds against the i40sys workflow identity, so a public consumer can verify signatures.
- [x] #4 Records that the prod overlay (067.13) therefore needs NO imagePullSecret, resolving the documented private-package fallback.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Resolved 2026-06-25.** The 3 ghcr packages were created *private* by the first
CI push and stayed private — there is no REST/GraphQL endpoint to flip a
user-owned container package's visibility (`PATCH /user/packages/container/<p>`
returns 404). The user flipped them via the package **Settings → Change
visibility** UI.

**Validation (logged OUT of ghcr — fully anonymous):**

- Anonymous manifest `GET .../manifests/latest` → **HTTP 200** for all three:
  `iotgw-functions`, `iotgw-ui-backend`, `iotgw-ui-frontend`.
- Anonymous `cosign verify ghcr.io/i40sys/iotgw-functions@sha256:43773c86…`
  against identity-regexp `…/i40sys/iotgw-ng/.github/workflows/…` and the
  `token.actions.githubusercontent.com` issuer → **OK**.

**Consequence:** the prod overlay (067.13) needs **no** `imagePullSecret`; the
private-package fallback is now moot.

**See also:** task-067.16 (the security incident).
<!-- SECTION:NOTES:END -->
