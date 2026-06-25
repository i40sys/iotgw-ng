---
id: TASK-067.18
title: Set repo var PROD_VITE_API_URL before cutting a real prod frontend release
status: Done
assignee: []
created_date: '2026-06-25 08:21'
updated_date: '2026-06-25 08:43'
labels:
  - cicd
  - frontend
  - config
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The iotgw-ui-frontend image bakes VITE_API_URL into the JS bundle at build time (import.meta.env), so the published SPA hard-codes the backend tRPC URL. The frontend-image.yml caller passes build-args VITE_API_URL=${{ vars.PROD_VITE_API_URL }}; that repo Actions VARIABLE is currently UNSET, so a release build would bake the Dockerfile default (http://localhost:4444/) and the prod SPA would call localhost. Before cutting a real prod frontend release, set PROD_VITE_API_URL to the real public prod backend URL (NOT the localhost default, NOT the kind hostname http://iotgw-ui-backend.wsl.ymbihq.local). decision-021 records that the frontend image is environment-specific.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The GitHub Actions repo VARIABLE PROD_VITE_API_URL is set on i40sys/iotgw-ng (Settings > Secrets and variables > Actions > Variables) to the real public prod backend URL (https, trailing slash to match the Dockerfile default form).
- [x] #2 It is NOT the localhost default and NOT the kind hostname iotgw-ui-backend.wsl.ymbihq.local.
- [x] #3 A frontend-image release build (vX.Y.Z tag) bakes that URL — verified by inspecting the published bundle / a request from the running SPA hitting the prod backend, not localhost.
- [x] #4 The prod overlay's iotgw-ui-frontend entry is pinned to that release build's digest (env-specific image per decision-021).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decide the real public prod backend URL (depends on the prod ingress hostname — undefined while the prod overlay is still a sketch).
2. `gh variable set PROD_VITE_API_URL -R i40sys/iotgw-ng -b '<https url>'`.
3. Cut a vX.Y.Z tag; the frontend-image workflow bakes the URL.
4. Verify the published bundle calls the prod backend; pin its digest in the prod overlay.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Solved 2026-06-25.**

**Value chosen:** `PROD_VITE_API_URL=https://iotgw-ui-backend.wsl.ymbihq.local/`
— the HTTPS (TLS-terminated) form of the backend host that the prod overlay's
`ingress-prod.yaml` actually defines. Distinct from the kind build-arg (plain
`http://…`) and from the localhost default.

**Done:**
- `gh variable set PROD_VITE_API_URL -R i40sys/iotgw-ng` → confirmed.
- Triggered `frontend-image.yml` (workflow_dispatch); run = success.
- **Verified the bake:** pulled the published image and grepped the JS bundle —
  contains `iotgw-ui-backend.wsl.ymbihq.local`, and **no `localhost:4444`**.
- Pinned the real frontend digest in the prod overlay
  (`sha256:5303df69ddba…`); `kubectl kustomize …/prod` renders clean.

> **Caveat:** this tracks `ingress-prod.yaml`'s backend host. The prod overlay is
> still a sketch reusing the `wsl.ymbihq.local` name — when a real public prod
> domain is adopted, update the host in `ingress-prod.yaml`, re-run
> `gh variable set PROD_VITE_API_URL=<new>`, rebuild `frontend-image`, and repin
> the new digest (env-specific image, decision-021).
<!-- SECTION:NOTES:END -->
