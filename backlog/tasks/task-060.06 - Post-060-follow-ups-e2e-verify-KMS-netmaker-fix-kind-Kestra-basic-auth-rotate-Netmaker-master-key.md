---
id: TASK-060.06
title: >-
  Post-060 follow-ups: e2e verify KMS/netmaker, fix kind Kestra basic-auth,
  rotate Netmaker master key
status: Done
assignee: []
created_date: '2026-06-17 05:38'
updated_date: '2026-06-18 05:01'
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
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#3 (rotate the Netmaker master key) is SUPERSEDED/won't-do: Netmaker (api.netmaker.i40sys.com) is a shared PRODUCTION service that also manages other networks, so we do not rotate its MASTER_KEY — doing so would disrupt those networks. AC removed. The real, non-disruptive mitigation (move our consumers to a scoped, revocable Netmaker API key) is tracked as task-061; the constraint + consumer map + local swap mechanics are documented in backlog/docs/netmaker-credential-handling.md and decision-014 (rotation row 1). AC#1 (e2e KMS + netmaker pipeline) and AC#2 (kind Kestra basic-auth) are both done and verified.
<!-- SECTION:NOTES:END -->
