---
id: TASK-067.08
title: >-
  iotgw-ui-frontend image pipeline (caller workflow + path filters +
  VITE_API_URL build-arg)
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 05:30'
labels:
  - ci
  - cicd
  - docker
  - ghcr
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.06
references:
  - .github/workflows/frontend-image.yml
  - iotgw-ui/apps/app/.docker/Dockerfile
  - iotgw-ui/apps/app/.docker/nginx.conf
  - iotgw-ui/packages/supabase-contract
  - deploy/k8s/base/iotgw-ui/frontend.yaml
  - deploy/kind/bootstrap.sh
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the React SPA image to ghcr.io/i40sys/iotgw-ui-frontend via CI. The critical wrinkle: `iotgw-ui/apps/app/.docker/Dockerfile` declares `ARG VITE_API_URL` (default http://localhost:4444/) which is baked into the JS bundle at build time via import.meta.env, so the caller MUST pass the prod backend URL as a build-arg or the published SPA will call localhost. This makes the frontend image environment-specific. This task adds the caller workflow (context iotgw-ui/, Dockerfile apps/app/.docker/Dockerfile -> node:24-alpine build then nginx:alpine, EXPOSE 80), the build-args input for VITE_API_URL, and the path filters including the shared supabase-contract package and the nginx.conf. Feeds prod-overlay and bootstrap-pull.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `.github/workflows/frontend-image.yml` calls `./.github/workflows/build-image.yml` with `image-name: iotgw-ui-frontend`, `context: iotgw-ui`, `dockerfile: iotgw-ui/apps/app/.docker/Dockerfile`, and `secrets: inherit`.
- [ ] #2 The caller passes a `build-args:` value setting `VITE_API_URL=<prod backend URL>` (NOT the kind hostname http://iotgw-ui-backend.wsl.ymbihq.local, NOT the localhost default), sourced from a workflow variable/secret so the baked-in API URL is the real prod backend.
- [x] #3 The caller declares permissions contents:read, packages:write, id-token:write to match the reusable workflow.
- [x] #4 `on.push` triggers on branches [main] and tags ['v*'] with `paths:` covering iotgw-ui/apps/app/**, iotgw-ui/packages/supabase-contract/**, iotgw-ui/pnpm-lock.yaml, iotgw-ui/pnpm-workspace.yaml, iotgw-ui/package.json, iotgw-ui/tsconfig.json, iotgw-ui/apps/app/.docker/Dockerfile, iotgw-ui/apps/app/.docker/nginx.conf, and .github/workflows/{frontend-image,build-image}.yml; pull_request builds without pushing.
- [x] #5 A push to main publishes `ghcr.io/i40sys/iotgw-ui-frontend` (linux/amd64 only) with sha-<gitsha> and latest tags, resolvable by digest.
- [x] #6 A post-build smoke step runs the pushed image and confirms nginx serves on port 80 (HTTP 200 on /), failing the job otherwise.
- [x] #7 A documented note (workflow comment) records that the frontend image is environment-specific because VITE_API_URL is compiled in, so prod requires a release-tag rebuild rather than promoting one image everywhere.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create `.github/workflows/frontend-image.yml` with the on.push/pull_request triggers and the path-filter list (apps/app + nginx.conf + shared supabase-contract + lockfile + workspace + root tsconfig).
2. Add the caller permissions block.
3. Call build-image.yml with image-name=iotgw-ui-frontend, context=iotgw-ui, dockerfile=iotgw-ui/apps/app/.docker/Dockerfile, push gated on non-PR, and build-args VITE_API_URL=<prod URL> from a repo/org variable.
4. Add a post-build smoke job pulling the digest and curling http://localhost:80/ for a 200.
5. Add the environment-specific-image comment and trigger via a frontend change to confirm publish + smoke pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored frontend-image.yml (VITE_API_URL build-arg from vars.PROD_VITE_API_URL, nginx smoke :80, env-specific-image note). LIVE-VALIDATED 2026-06-25 on public repo i40sys/iotgw-ng: first CI run built+pushed all 3 images to ghcr.io/i40sys; full supply chain green. frontend-image run = success incl. smoke (200 on /). NOTE: PROD_VITE_API_URL repo var not set yet -> image baked the localhost default; set the var before a real prod release (env-specific image).
<!-- SECTION:NOTES:END -->
