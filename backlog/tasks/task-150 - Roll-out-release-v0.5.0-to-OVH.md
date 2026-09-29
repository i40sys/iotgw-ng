---
id: TASK-150
title: Roll out release v0.5.0 to OVH
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 15:06'
updated_date: '2026-09-29 15:12'
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
- [x] #1 OVH runs the v0.5.0 digests (signatures/attestations verified)
- [x] #2 ovh release-manifest.json declares v0.5.0 and the verify snapshot is recorded
- [x] #3 Edge Manager on https://iotgw.i40sys.com shows v0.5.0 in the badge/About dialog
- [x] #4 Smoke: login, Kong->PostgREST, device API TLS still pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**v0.5.0 is live on OVH (2026-09-29).**

**What changed:**
- `deploy/k8s/overlays/ovh/kustomization.yaml`: 0.5.0 digests for functions / backend / frontend.
- `deploy/k8s/overlays/ovh/release-manifest.json`: generated for v0.5.0 (environment production), then `verify --context ovh-ymbihq` snapshot recorded and republished via `tf.sh platform apply`.

**Verified:**
- cosign v3 signatures (keyless, workflow identity) and `gh attestation verify` for all three digests. Note: cosign **v3** is required locally — v2.x reports "no signatures found" for the v3 bundle format.
- Backend `getDeploymentInfo`: release v0.5.0, backend 1.1.0 @ 64fec1f, clean build; frontend bundle 0.11.0 / v0.5.0.
- Browser login on https://iotgw.i40sys.com: header shows "Edge Manager v0.5.0".
- Smoke: Kong->PostgREST 12 devices, device API with pinned CA answers, hl.joor.net 200.

**Flows revision** omitted from the manifest (the synced iotgw-kestra commit was not confirmed).
<!-- SECTION:NOTES:END -->
