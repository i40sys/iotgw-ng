---
id: TASK-067.18
title: Set repo var PROD_VITE_API_URL before cutting a real prod frontend release
status: To Do
assignee: []
created_date: '2026-06-25 08:21'
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
- [ ] #1 The GitHub Actions repo VARIABLE PROD_VITE_API_URL is set on i40sys/iotgw-ng (Settings > Secrets and variables > Actions > Variables) to the real public prod backend URL (https, trailing slash to match the Dockerfile default form).
- [ ] #2 It is NOT the localhost default and NOT the kind hostname iotgw-ui-backend.wsl.ymbihq.local.
- [ ] #3 A frontend-image release build (vX.Y.Z tag) bakes that URL — verified by inspecting the published bundle / a request from the running SPA hitting the prod backend, not localhost.
- [ ] #4 The prod overlay's iotgw-ui-frontend entry is pinned to that release build's digest (env-specific image per decision-021).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decide the real public prod backend URL (depends on the prod ingress hostname — undefined while the prod overlay is still a sketch).
2. `gh variable set PROD_VITE_API_URL -R i40sys/iotgw-ng -b '<https url>'`.
3. Cut a vX.Y.Z tag; the frontend-image workflow bakes the URL.
4. Verify the published bundle calls the prod backend; pin its digest in the prod overlay.
<!-- SECTION:PLAN:END -->
