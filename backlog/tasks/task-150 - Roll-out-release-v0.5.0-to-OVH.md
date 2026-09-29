---
id: TASK-150
title: Roll out release v0.5.0 to OVH
status: To Do
assignee: []
created_date: '2026-09-29 15:06'
labels:
  - ovh
  - release
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** v0.5.0 is tagged and published, but OVH still runs the v0.4.1 functions/backend digests plus a manually dispatched frontend build, and its `release-manifest.json` is `null` — the new badge/About dialog cannot show a declared release.

**Steps (deploy/RELEASE.md, decision-036):**
- Read the `0.5.0` digests of iotgw-functions / iotgw-ui-backend / iotgw-ui-frontend; verify cosign signatures + attestations.
- Pin them in `deploy/k8s/overlays/ovh/kustomization.yaml`.
- `python3 deploy/release-manifest.py generate --release v0.5.0 --overlay deploy/k8s/overlays/ovh --environment production [--flows-revision <iotgw-kestra commit>]`.
- `deploy/terraform/ovh/tf.sh platform apply` (Terraform owns the overlay — no direct kubectl apply).
- `release-manifest.py verify --context ovh-ymbihq …`, republish the snapshot, commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 OVH runs the v0.5.0 digests (signatures/attestations verified)
- [ ] #2 ovh release-manifest.json declares v0.5.0 and the verify snapshot is recorded
- [ ] #3 Edge Manager on https://iotgw.i40sys.com shows v0.5.0 in the badge/About dialog
- [ ] #4 Smoke: login, Kong->PostgREST, device API TLS still pass
<!-- AC:END -->
