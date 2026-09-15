---
id: TASK-088
title: >-
  Secrets + deployment: PKI base URL and per-zone fleet tokens for the functions
  runtime
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - secrets
  - k8s
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add PKI_BASE_URL and the per-zone fleet token(s) to secrets/supabase.enc.env, and the OIDC service-account credentials to secrets/iotgw-ui-backend.enc.env (SOPS+age, decision-014). Re-render the Secrets, roll the consumers, and confirm the functions pod can actually reach pki.joor.net from the supabase-app namespace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The functions and backend pods receive the PKI configuration from k8s Secrets, with no plaintext in tracked source
- [x] #2 tools/secrets/secrets.sh check passes with no cleartext leak
- [x] #3 A request from inside the functions pod to the pki-manager API succeeds, proving egress from supabase-app is open
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.**

**What changed:** `PKI_BASE_URL` and `PKI_FLEET_TOKENS` added to `secrets/supabase.enc.env` (SOPS+age), surfaced to the functions Deployment via `secretKeyRef` with `optional: true`.

`PKI_FLEET_TOKENS` is a JSON map `{"<zone>":"pkimg_…"}` rather than one env var per zone, because the fleet grows one zone per domain and we do not want a new Secret key and a Deployment roll for each.

**Verified:** `tools/secrets/secrets.sh check` passes with no cleartext leak; `kubectl exec` into the functions pod shows `PKI_BASE_URL=https://pki.joor.net` and a populated `PKI_FLEET_TOKENS`; and a real enrollment round-trip to pki.joor.net succeeded from inside the pod, which proves egress from `supabase-app` is open.

**Not done here:** the OIDC service-account credentials for the iotgw-ui backend (`secrets/iotgw-ui-backend.enc.env`) — they belong to task-080, which is still To Do, and their scope is unresolved (decision-028 §9 / task-074).
<!-- SECTION:NOTES:END -->
