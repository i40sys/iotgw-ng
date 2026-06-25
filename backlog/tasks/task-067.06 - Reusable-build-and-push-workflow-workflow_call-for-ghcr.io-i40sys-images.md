---
id: TASK-067.06
title: Reusable build-and-push workflow (workflow_call) for ghcr.io/i40sys images
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
labels:
  - ci
  - cicd
  - docker
  - ghcr
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.01
  - TASK-067.05
references:
  - .github/workflows/build-image.yml
  - ansible/netmaker/.github/workflows/publish-collection.yml
  - deploy/kind/bootstrap.sh
  - task-062.03
  - decision-015
  - decision-020
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All three custom images (iotgw-functions, iotgw-ui-backend, iotgw-ui-frontend) need a single, shared CI build engine so the per-image callers stay thin and the supply-chain layers (Trivy, cosign, SBOM/provenance) bolt on in one place. This task creates `.github/workflows/build-image.yml` with `on: workflow_call`, taking inputs image-name, context, dockerfile, and optional build-args, that logs in to ghcr.io, derives tags/labels, builds a single linux/amd64 image with GHA layer caching, pushes it, and exposes the resulting image digest as a workflow output for downstream digest-pinning and signing. It is the foundation every other build/supply-chain task depends on and, together with ghcr-setup, unblocks task-062.03. No root `.github/` exists today, so this is created from scratch reusing the house style of `ansible/netmaker/.github/workflows/publish-collection.yml` (actions/checkout@v4, named steps, secrets.GITHUB_TOKEN).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `.github/workflows/build-image.yml` exists with `on: workflow_call` declaring string inputs `image-name`, `context`, `dockerfile`, and an optional `build-args` (multiline string), plus a boolean `push` defaulting to true.
- [x] #2 The workflow declares an output `digest` whose value is `steps.build.outputs.digest` from docker/build-push-action, so callers can pin/sign by digest.
- [x] #3 Steps use the researched pinned majors: actions/checkout@v4, docker/setup-buildx-action@v4, docker/login-action@v4 (registry ghcr.io, username github.actor, password secrets.GITHUB_TOKEN), docker/metadata-action@v5, docker/build-push-action@v7.
- [x] #4 metadata-action emits tags `type=sha`, `type=ref,event=branch`, `type=semver,pattern={{version}}` and `{{major}}.{{minor}}`, and `type=raw,value=latest,enable={{is_default_branch}}` for image `ghcr.io/i40sys/${{ inputs.image-name }}` plus the standard org.opencontainers.image.* labels.
- [x] #5 build-push-action sets `platforms: linux/amd64` only (no setup-qemu, no multi-arch), `cache-from: type=gha` and `cache-to: type=gha,mode=max`, passes `build-args: ${{ inputs.build-args }}`, and applies the metadata tags+labels.
- [x] #6 The job declares a `permissions:` block with at least `contents: read`, `packages: write`, and `id-token: write` (so downstream supply-chain tasks can attach cosign/attestations without re-plumbing permissions), and the login/push steps are guarded so pull_request events do not push.
- [ ] #7 `actionlint` (or `kustomize`-style yaml lint) passes on the new workflow and a manual run against one caller pushes a `ghcr.io/i40sys/<image>:sha-<gitsha>` tag that is resolvable by digest.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create `.github/workflows/` at the repo root (none exists today).
2. Author `build-image.yml` with `on: workflow_call` inputs (image-name, context, dockerfile, build-args, push) and an outputs.digest mapped to the build step.
3. Add the job `permissions:` block (contents:read, packages:write, id-token:write) and the env REGISTRY/IMAGE = ghcr.io/i40sys/<image-name>.
4. Wire steps: checkout@v4 -> setup-buildx-action@v4 -> login-action@v4 (guard on non-PR) -> metadata-action@v5 (tag/label set) -> build-push-action@v7 (linux/amd64, type=gha cache, build-args).
5. Reuse the named-step + annotation house style from ansible/netmaker/.github/workflows/publish-collection.yml.
6. Validate with actionlint and a trial caller run; confirm the pushed digest output is non-empty.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Authored `.github/workflows/build-image.yml`** (`workflow_call`):

- inputs `image-name`/`context`/`dockerfile`/`build-args`/`push`; output `digest`.
- `checkout@v4` → `setup-buildx@v4` → `login@v4` → `metadata@v5` → `build-push@v7`;
  linux/amd64; GHA cache.
- permissions: `contents`/`packages`/`id-token`/`security-events`/`attestations`.

**Live-validated 2026-06-25:** all 3 callers ran green on the public repo; the
`digest` output drives cosign + attest. *AC#7:* `actionlint` not run locally
(binary absent), but the 5 workflows pass `yaml.safe_load` and GitHub accepted/ran them.
<!-- SECTION:NOTES:END -->
