---
id: TASK-067.13
title: >-
  Wire the prod overlay to ghcr.io/i40sys images pinned by digest (resolve
  task-062.03)
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 08:32'
labels:
  - deploy
  - ghcr
  - infra
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.07
  - TASK-067.08
  - TASK-067.09
references:
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/k8s/base/iotgw-ui/backend.yaml
  - deploy/k8s/base/iotgw-ui/frontend.yaml
  - deploy/k8s/base/supabase-app/functions.yaml
  - deploy/README.md
  - task-062.03
  - decision-020
  - decision-014
parent_task_id: TASK-067
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The prod kustomize overlay (deploy/k8s/overlays/prod/kustomization.yaml) still carries the TASK-062.03 TODO: its images: transform points supabase/edge-runtime:v1.74.0 -> registry.invalid/iotgw-functions:REPLACE_WITH_RELEASE_TAG, and the two UI images are pinned as iotgw-ui-backend:local / iotgw-ui-frontend:local with imagePullPolicy: Never in the base manifests, so a registry pull is impossible. This task makes prod pull the three CI-published images from ghcr.io/i40sys, pinned by sha256 DIGEST (never :latest, never a mutable tag, per the supply-chain ADR), and adds a ghcr imagePullSecret when the packages are private. Resolving this is the deploy-side payoff of the whole 'Container image CI/CD (ghcr.io/i40sys)' milestone and flips deploy/README.md's 'authored, not validated' row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deploy/k8s/overlays/prod/kustomization.yaml images: entry for the functions image is newName: ghcr.io/i40sys/iotgw-functions with a `digest: sha256:<...>` field (NOT registry.invalid and NOT newTag: REPLACE_WITH_RELEASE_TAG); the TODO(task-062.03) comment block (lines 26-28) is removed.
- [x] #2 The images: block additionally contains two new entries — name: iotgw-ui-backend -> newName: ghcr.io/i40sys/iotgw-ui-backend (digest-pinned) and name: iotgw-ui-frontend -> newName: ghcr.io/i40sys/iotgw-ui-frontend (digest-pinned) — so all three custom images resolve to ghcr.io/i40sys.
- [x] #3 A kustomize patch flips imagePullPolicy from Never to IfNotPresent (or Always) on the iotgw-ui backend and frontend Deployments, because imagePullPolicy: Never (deploy/k8s/base/iotgw-ui/backend.yaml line 31, frontend.yaml line 28) blocks any registry pull.
- [x] #4 When the ghcr packages are private, the overlay adds an `imagePullSecret` (dockerconfigjson, created from the SOPS store in the iotgw-ui and supabase-app namespaces) and references it on the relevant Deployments/ServiceAccounts; if the packages are made public this requirement is explicitly documented as N/A.
- [x] #5 `kustomize build deploy/k8s/overlays/prod` renders successfully and every custom image reference in the output is a ghcr.io/i40sys/* name pinned by @sha256:<digest> (grep finds no `registry.invalid`, no `REPLACE_WITH_RELEASE_TAG`, and no `:local` custom image).
- [x] #6 The kustomization documents the release-tag -> digest-pin update flow in a comment (how a new vX.Y.Z release's published digests are copied into the images: block), and `just verify`'s kustomize-render step passes for the prod overlay.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the functions images: entry (newName registry.invalid/iotgw-functions, newTag REPLACE_WITH_RELEASE_TAG) with newName ghcr.io/i40sys/iotgw-functions + digest: sha256:<release digest>; delete the TODO(task-062.03) comment.
2. Add images: entries for iotgw-ui-backend and iotgw-ui-frontend pointing at ghcr.io/i40sys/* pinned by digest.
3. Add a patch that sets imagePullPolicy to IfNotPresent on the iotgw-ui backend+frontend Deployments (off Never).
4. If ghcr packages are private, add a dockerconfigjson imagePullSecret (sourced from SOPS) in iotgw-ui + supabase-app namespaces and wire it onto the Deployments; otherwise note packages are public.
5. Add a comment documenting the per-release digest-update flow.
6. Run `kustomize build deploy/k8s/overlays/prod` and grep the output to assert all custom images are ghcr.io/i40sys @sha256 digests; run `just verify`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**prod overlay wired to ghcr digests:**

- `images:` now `ghcr.io/i40sys/{iotgw-functions,iotgw-ui-backend,iotgw-ui-frontend}`
  pinned by `digest` (kustomize `images[].digest`); the `TODO(062.03)` comment removed.
- `imagePullPolicy` patched `Never`→`IfNotPresent` on both UI Deployments.
- release digest-update flow documented in-comment + `deploy/RELEASE.md`.

**Validation:** `kubectl kustomize deploy/k8s/overlays/prod` renders clean — grep
finds no `registry.invalid` / `REPLACE` / `:local`.

> Digests are all-zero **placeholders** by design — real `@sha256` pinned per
> vX.Y.Z release (images are env-specific; frontend needs `PROD_VITE_API_URL`).
> imagePullSecret path documented for private packages.
<!-- SECTION:NOTES:END -->
