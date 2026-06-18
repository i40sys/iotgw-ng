---
id: TASK-060.06
title: >-
  Post-060 follow-ups: e2e verify KMS/netmaker, fix kind Kestra basic-auth,
  rotate Netmaker master key
status: In Progress
assignee: []
created_date: '2026-06-17 05:38'
updated_date: '2026-06-18 04:56'
labels:
  - ssh
  - kms
  - kestra
  - security
  - verification
dependencies: []
parent_task_id: TASK-060
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Loose ends surfaced while implementing task-060 (backend→KMS SSH-key generation + legacy Kestra flow removal). The code is done, typechecks, and unit tests pass; these items need a running full stack and/or external access to close.

1. End-to-end verification (060.04 AC#3, 060.02/03): with supabase + iotgw-ui + KMS up, create/update/delete a device and a network; confirm netmaker-call provisions the extclient/network AND the backend mints the Cosmian KMS ed25519 key (ssh_key_id = device_ssh_<id>) on create; confirm generateMissingSshKey backfill + force work from the UI.
2. Fix kind Kestra basic-auth (060.04 AC#1/#4 verification was blocked): the running kestra pod returns 401 for all API calls — KESTRA_BASIC_AUTH_USERNAME/PASSWORD from the kestra-env Secret are not projected into the pod and KESTRA_CONFIGURATION has no basicAuth block. Edit deploy/k8s/base/kestra/kestra.yaml to add the basicAuth config + env refs, redeploy, then verify GET /api/v1/main/flows/iotgw-ng lists only install/provisioning/connectivity-check/sync-namespace-files (no devices/networks).
3. Rotate the Netmaker master key: ***REMOVED-DECOMMISSIONED*** was hardcoded in the (now-removed) device_*/network_* Kestra playbooks and lived in i40sys/iotgw-kestra history — treat as compromised. Rotate at the Netmaker dashboard, update secrets/netmaker.enc.env (SOPS) + secrets/supabase.enc.env if it carries NETMAKER_*, re-render, and update the kind Secret. (decision-014 rotation runbook.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Device + network create/update/delete verified end-to-end against the running stack (netmaker provisioning + KMS ssh_key_id on device create)
- [x] #2 kind Kestra basic-auth fixed; Kestra API lists only the KEEP flows (no devices/networks) — 060.04 AC#1/#4 confirmed via API
- [ ] #3 Netmaker master key rotated at the upstream and updated in the SOPS store; old key no longer valid
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#2 DONE & independently verified (2026-06-18). Root cause: Kestra 1.3.22 OSS always enforces auth via AuthenticationFilter; the DB basic-auth credential record was null because KESTRA_CONFIGURATION had no kestra.server.basic-auth block (so BasicAuthService.init() was a no-op) -> 401 for all /api/v1/**; also KESTRA_BASIC_AUTH_USERNAME/PASSWORD weren't projected into the pod. Fix (deploy/k8s/base/kestra/kestra.yaml +12-1): project both vars from the kestra-env Secret + add a kestra.server.basic-auth block referencing them via ${...} (no hardcoded creds). Redeployed. Verified: 401 without/wrong creds, 200 with the SOPS creds; GET /api/v1/main/flows/iotgw-ng -> [] (zero devices/networks flows in any namespace; only 6 tutorial examples) — also re-confirms 060.04 AC#1 via the API; idempotent; all iotgw pods Running.

AC#3 PREPARED but BLOCKED on external action (NOT checked). The Netmaker MASTER_KEY is server-side config on api.netmaker.i40sys.com (not controllable from this workspace); invalidating the old key + minting a new one requires changing that server + restarting netmaker. Mapped everything: the key lives in BOTH secrets/netmaker.enc.env and secrets/supabase.enc.env (must set the SAME new value in both), consumed by the netmaker-call edge fn (kind supabase-env Secret / compose supabase/.env) and the oriolrius.netmaker Ansible collection (ansible/netmaker/.env); only kind Secret carrying it is supabase-env. Full runbook (external step + local SOPS->render->k8s Secret->restart->verify) at backlog/docs/netmaker-master-key-rotation-runbook.md (no real key). NO mutation performed (verified: key unchanged in both files; only an unauthenticated GET /api/server/health). Once a new key is generated on the Netmaker server, the local steps are one pass.
<!-- SECTION:NOTES:END -->
