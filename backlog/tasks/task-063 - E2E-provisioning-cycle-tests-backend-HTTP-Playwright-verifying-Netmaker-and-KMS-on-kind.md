---
id: TASK-063
title: >-
  E2E provisioning-cycle tests (backend HTTP + Playwright) verifying Netmaker
  and KMS on kind
status: Done
assignee: []
created_date: '2026-06-19 06:22'
updated_date: '2026-06-19 06:22'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add end-to-end tests that exercise the full network+device provisioning cycle against the live kind cluster and assert the real systems are ready, not just a 202. Driven by the iotgw-ng device-provisioning investigation: a device created in the UI appeared not to provision, which traced to a stale seeded network (__test_net) never provisioned in Netmaker; with a freshly-created network the whole cycle succeeds. Also exposes the device SSH public key over tRPC (KMS round-trip) and revokes the KMS key on device delete (was leaking).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backend e2e (apps/backend/e2e, pnpm test:e2e) creates a network -> network_jobs SUCCESS, creates a device -> ssh_key_id minted + device_jobs SUCCESS, asserts Netmaker WireGuard config (ip_address+public_key) and a KMS round-trip (getDeviceSshPublicKey returns ssh-ed25519), then tears both down
- [x] #2 Browser e2e (apps/app/e2e, Playwright) provisions a fresh network via API, creates the device through the UI, and asserts the same Netmaker+KMS outcomes
- [x] #3 New tRPC endpoint getDeviceSshPublicKey round-trips to Cosmian KMS
- [x] #4 deleteDevice revokes+destroys the device SSH key in KMS (best-effort)
- [x] #5 Both suites excluded from the hermetic pnpm test; wired into just e2e and just bootstrap
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and verified against the running kind cluster. Backend e2e drives the deployed backend over node:http with an explicit Host header to the nginx ingress (KMS only works in-cluster; the task-057 NetworkPolicy blocks its NodePort from the host). Playwright uses Chromium --host-resolver-rules to map the ingress vhosts to 127.0.0.1. Added tRPC getDeviceSshPublicKey (devices router) -> kms.getDeviceSshPublicKey; wired destroyDeviceSshKey into deleteDevice (verified 'Revoked device SSH key in KMS' in backend logs). Rebuilt+reloaded iotgw-ui-backend:local into kind. Both suites green; unit tests still hermetic (e2e excluded via vitest config); 0 leftover rows after runs. Root cause of the original report: __test_net was a stale DB seed never provisioned in Netmaker -> 'No nodes found in network'; fresh networks provision cleanly.
<!-- SECTION:NOTES:END -->
