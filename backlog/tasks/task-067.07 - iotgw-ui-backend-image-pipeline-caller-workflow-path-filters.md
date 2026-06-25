---
id: TASK-067.07
title: iotgw-ui-backend image pipeline (caller workflow + path filters)
status: To Do
assignee: []
created_date: '2026-06-23 08:01'
labels:
  - ci
  - cicd
  - docker
  - ghcr
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.06
references:
  - .github/workflows/backend-image.yml
  - iotgw-ui/apps/backend/.docker/Dockerfile
  - iotgw-ui/packages/supabase-contract
  - iotgw-ui/pnpm-lock.yaml
  - deploy/k8s/base/iotgw-ui/backend.yaml
  - deploy/kind/bootstrap.sh
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the Fastify/tRPC backend image to ghcr.io/i40sys/iotgw-ui-backend via CI so prod can pull a release-pinned digest instead of relying on bootstrap.sh's local `iotgw-ui-backend:local` + `kind load`. This task adds a thin caller workflow that invokes the reusable build-image workflow with context `iotgw-ui/` (the pnpm workspace root) and Dockerfile `iotgw-ui/apps/backend/.docker/Dockerfile` (node:24-alpine multi-stage builder->production, EXPOSE 4444), gated by monorepo path filters that include the shared `packages/supabase-contract` and the lockfile so a contract change still rebuilds the backend. A basic post-build smoke check confirms the published container starts. Feeds the prod-overlay and bootstrap-pull tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `.github/workflows/backend-image.yml` calls `./.github/workflows/build-image.yml` (uses:) with `image-name: iotgw-ui-backend`, `context: iotgw-ui`, `dockerfile: iotgw-ui/apps/backend/.docker/Dockerfile`, and `secrets: inherit`.
- [ ] #2 The caller declares the same `permissions:` block the reusable workflow requires (contents:read, packages:write, id-token:write) since workflow_call cannot escalate beyond the caller grant.
- [ ] #3 `on.push` triggers on branches [main] and tags ['v*'] with `paths:` covering iotgw-ui/apps/backend/**, iotgw-ui/packages/supabase-contract/**, iotgw-ui/pnpm-lock.yaml, iotgw-ui/pnpm-workspace.yaml, iotgw-ui/package.json, iotgw-ui/tsconfig.json, iotgw-ui/apps/backend/.docker/Dockerfile, and .github/workflows/{backend-image,build-image}.yml.
- [ ] #4 A pull_request trigger builds without pushing (`push: ${{ github.event_name != 'pull_request' }}` passed to the reusable workflow), so PRs validate the Dockerfile without publishing.
- [ ] #5 A push to main publishes `ghcr.io/i40sys/iotgw-ui-backend` with at least a `sha-<gitsha>` tag and `latest`, resolvable by digest in the GitHub Packages UI.
- [ ] #6 A post-build smoke step runs the just-pushed image by digest and asserts the container starts and listens on 4444 (e.g. `docker run -d` then a TCP/health probe on the EXPOSEd port), failing the job if it does not come up.
- [ ] #7 No arm64/multi-arch artifacts are produced (linux/amd64 only, inherited from the reusable workflow).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create `.github/workflows/backend-image.yml` with the on.push/pull_request triggers and the full path-filter list (apps/backend plus shared supabase-contract + lockfile + workspace + root tsconfig).
2. Add the caller `permissions:` block matching the reusable workflow.
3. Call build-image.yml with image-name=iotgw-ui-backend, context=iotgw-ui, dockerfile=iotgw-ui/apps/backend/.docker/Dockerfile, push gated on non-PR, secrets: inherit.
4. Add a post-build smoke job that pulls the digest and runs the container, probing port 4444.
5. Trigger via a backend-only change and confirm the package + tags appear and the smoke check passes.
<!-- SECTION:PLAN:END -->
