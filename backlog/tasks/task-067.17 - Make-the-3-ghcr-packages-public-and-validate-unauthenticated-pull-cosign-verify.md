---
id: TASK-067.17
title: >-
  Make the 3 ghcr packages public and validate unauthenticated pull + cosign
  verify
status: Done
assignee: []
created_date: '2026-06-25 08:10'
updated_date: '2026-06-25 08:10'
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
DONE 2026-06-25. User flipped all 3 packages to public via the package Settings UI (no REST/GraphQL endpoint for user container-pkg visibility — PATCH /user/packages/container/<p> returns 404). VALIDATED logged OUT of ghcr: anonymous token + manifest GET for iotgw-functions/iotgw-ui-backend/iotgw-ui-frontend :latest all return HTTP 200; anonymous cosign v3 verify of ghcr.io/i40sys/iotgw-functions@sha256:43773c86... against identity-regexp ^https://github.com/i40sys/iotgw-ng/.github/workflows/.+@refs/.+ + token.actions issuer = OK. => prod overlay (067.13) needs NO imagePullSecret; the private-package fallback is moot. Cross-ref task-067.16 (the security incident).
<!-- SECTION:NOTES:END -->
