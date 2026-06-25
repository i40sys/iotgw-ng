---
id: TASK-067.14
title: >-
  Add an opt-in ghcr-pull path to bootstrap.sh and the kind overlay (default
  stays build-local)
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
labels:
  - deploy
  - ghcr
  - ci
  - infra
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.07
  - TASK-067.08
  - TASK-067.09
references:
  - deploy/kind/bootstrap.sh
  - deploy/k8s/overlays/kind/kustomization.yaml
  - deploy/kind/cluster.yaml
  - iotgw-ui/apps/app/.docker/Dockerfile
  - decision-015
  - decision-014
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today deploy/kind/bootstrap.sh always builds the three custom images locally (build_functions at lines 174-185, build_iotgw_ui at lines 187-206) tagged :local and `kind load`s them, and the kind overlay (deploy/k8s/overlays/kind/kustomization.yaml) renames supabase/edge-runtime:v1.74.0 -> iotgw-functions:local. This task adds an OPT-IN registry-pull path so a developer can run kind against the published ghcr.io/i40sys images (validating exactly what prod will run) without changing the default build-local + kind-load behavior. When pulling private packages, the kind path must also provision a ghcr imagePullSecret.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deploy/kind/bootstrap.sh gains an opt-in toggle (e.g. an env var like IOTGW_IMAGE_SOURCE=registry or a --pull flag) that, when set, SKIPS build_functions/build_iotgw_ui and instead pulls ghcr.io/i40sys/iotgw-functions, /iotgw-ui-backend, /iotgw-ui-frontend at a caller-supplied tag/digest and `kind load`s (or relies on cluster pull) them.
- [x] #2 With the toggle unset, behavior is byte-for-byte unchanged: build_functions/build_iotgw_ui still `docker build ... -t <name>:local` and `kind load docker-image <name>:local --name iotgw` (default remains build-local).
- [x] #3 When the registry-pull path is active and the ghcr packages are private, bootstrap.sh creates a dockerconfigjson imagePullSecret in the iotgw-ui (and supabase-app) namespaces from the SOPS store; for public packages this is skipped and noted.
- [x] #4 The kind overlay images: transform (deploy/k8s/overlays/kind/kustomization.yaml, currently iotgw-functions:local) is parameterized or has a documented sibling so the pulled ghcr.io/i40sys/iotgw-functions name+digest is used in registry-pull mode while :local remains the default.
- [x] #5 The frontend caveat is honored: any pulled iotgw-ui-frontend image is documented as carrying its build-time-baked VITE_API_URL, so a registry-pull kind run uses an image built for a routable backend URL (not the local kind hostname); this is called out in bootstrap.sh comments.
- [ ] #6 `just kind-up` + the registry-pull path brings the stack up against ghcr images and the kind smoke check in `just verify` passes; the default build-local path is also re-verified to still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an IOTGW_IMAGE_SOURCE (or --pull) toggle to deploy/kind/bootstrap.sh, defaulting to build-local.
2. Add pull_functions/pull_iotgw_ui helpers that `docker pull` the ghcr.io/i40sys images at a supplied tag/digest and `kind load` them, gated on the toggle; leave build_functions/build_iotgw_ui as the default.
3. In registry-pull mode for private packages, create a dockerconfigjson imagePullSecret (from SOPS) in the iotgw-ui + supabase-app namespaces.
4. Parameterize or add a documented variant of the kind overlay images: entry so ghcr.io/i40sys/iotgw-functions (digest) is used when pulling.
5. Add comments documenting the VITE_API_URL baked-image caveat for the frontend.
6. Validate both paths via `just kind-up` and the `just verify` kind smoke check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Opt-in registry-pull path in `bootstrap.sh`:**

- `IOTGW_IMAGE_SOURCE` toggle — default **build-local** (byte-for-byte unchanged);
  `registry` pulls `ghcr.io/i40sys/*` at `IOTGW_IMAGE_REF`, retags `:local`, `kind
  load`s — via `provision_functions`/`provision_iotgw_ui`.
- `ghcr_login_if_private` for private packages.
- kind overlay documents the retag approach so `:local` stays the default.
- `VITE_API_URL` baked-image caveat in comments.

**Validation:** `bash -n` clean; both overlay paths render (default kind still
`:local`). Live registry-pull kind run not exercised here (needs public packages
or login).
<!-- SECTION:NOTES:END -->
