---
id: TASK-067.09
title: >-
  iotgw-functions image pipeline (caller workflow + path filters, context
  supabase/volumes)
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
  - .github/workflows/functions-image.yml
  - deploy/k8s/base/supabase-app/Dockerfile.functions
  - supabase/volumes/functions
  - deploy/k8s/overlays/kind/kustomization.yaml
  - deploy/k8s/overlays/prod/kustomization.yaml
  - task-062.03
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the Deno edge-functions image to ghcr.io/i40sys/iotgw-functions via CI so prod resolves the registry.invalid/REPLACE_WITH_RELEASE_TAG placeholder to a real digest. The Dockerfile `deploy/k8s/base/supabase-app/Dockerfile.functions` is a single `COPY functions/ /home/deno/functions/` on top of `supabase/edge-runtime:v1.74.0`, and its build context MUST be `supabase/volumes` (so `functions/` resolves to supabase/volumes/functions/, NOT repo root). This task adds the caller workflow with that non-obvious context, path filters scoped to the edge functions, and tracks the pinned base image so it stays bumpable. Feeds prod-overlay (which the kind overlay renames supabase/edge-runtime:v1.74.0 -> the functions image) and bootstrap-pull.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `.github/workflows/functions-image.yml` calls `./.github/workflows/build-image.yml` with `image-name: iotgw-functions`, `context: supabase/volumes`, `dockerfile: deploy/k8s/base/supabase-app/Dockerfile.functions`, and `secrets: inherit`.
- [x] #2 The context is `supabase/volumes` (NOT repo root, NOT supabase/) so the Dockerfile's `COPY --chown=deno:deno functions/ /home/deno/functions/` resolves to supabase/volumes/functions/.
- [x] #3 The caller declares permissions contents:read, packages:write, id-token:write to match the reusable workflow.
- [x] #4 `on.push` triggers on branches [main] and tags ['v*'] with `paths:` covering supabase/volumes/functions/**, deploy/k8s/base/supabase-app/Dockerfile.functions, and .github/workflows/{functions-image,build-image}.yml; pull_request builds without pushing.
- [x] #5 A push to main publishes `ghcr.io/i40sys/iotgw-functions` (linux/amd64 only) with sha-<gitsha> and latest tags, resolvable by digest.
- [x] #6 The pinned base `supabase/edge-runtime:v1.74.0` is recorded (workflow comment or a note) as the bumpable version, so a runtime upgrade is a single tracked change rather than a silent latest pull.
- [x] #7 A post-build smoke step runs the pushed image and asserts the edge-runtime starts with the baked functions present at /home/deno/functions/ (e.g. container starts and the functions dir is non-empty), failing the job otherwise.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create `.github/workflows/functions-image.yml` with on.push/pull_request triggers and paths supabase/volumes/functions/** plus the Dockerfile.
2. Add the caller permissions block.
3. Call build-image.yml with image-name=iotgw-functions, context=supabase/volumes, dockerfile=deploy/k8s/base/supabase-app/Dockerfile.functions, push gated on non-PR, secrets: inherit.
4. Add a workflow comment pinning/tracking supabase/edge-runtime:v1.74.0 as the bumpable base.
5. Add a post-build smoke job confirming the runtime starts and /home/deno/functions/ is populated.
6. Trigger via a functions change to confirm publish + smoke pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored functions-image.yml (context supabase/volumes, bumpable base note, smoke asserts /home/deno/functions non-empty). LIVE-VALIDATED 2026-06-25 on public repo i40sys/iotgw-ng: first CI run built+pushed all 3 images to ghcr.io/i40sys; full supply chain green. functions-image run = success incl. smoke. ghcr.io/i40sys/iotgw-functions published.
<!-- SECTION:NOTES:END -->
