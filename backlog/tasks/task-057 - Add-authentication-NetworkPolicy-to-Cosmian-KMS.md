---
id: TASK-057
title: Add authentication + NetworkPolicy to Cosmian KMS
status: Done
assignee: []
created_date: '2026-06-12 22:15'
updated_date: '2026-06-18 19:04'
labels:
  - kms
milestone: Decommission docker-compose
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
KMS runs with NO auth and NO TLS while holding all device SSH private keys. For any non-local environment add a kms.toml [authentication] block (JWT/OIDC) and a k8s NetworkPolicy restricting :9998 to Kestra/edge-function pods. See decision-015 k8s notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 KMS requires auth
- [x] #2 NetworkPolicy restricts access
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Enable Cosmian KMS API-token auth ([http] api_token_id) — no OIDC; provision the token key, store in SOPS, inject KMS_AUTH_TOKEN into the backend.\n2. Author a NetworkPolicy restricting :9998 to the in-namespace KMS clients (backend, kestra, kestra-runner pods).\n3. Validate auth enforced + backend still mints + NP enforced; keep probes working.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to general-purpose, independently verified live). 

AC#1 (auth): Cosmian KMS 5.20 API-token auth via [http] api_token_id="iotgw_api_token" (deploy/k8s/base/kms/configmap.yaml) — no OIDC/IdP. The server requires Authorization: Bearer <token> where token = lowercase(base64(raw key bytes)) of the 'iotgw_api_token' symmetric key; /version + /health stay public (probes keep working). Token provisioned + stored in SOPS (secrets/iotgw-ui-backend.enc.env KMS_AUTH_TOKEN), bridged to a kms-auth k8s Secret, injected into the iotgw-ui backend Deployment. bootstrap.sh got kms_auth() (creates key + persists token) + gen_kms_auth_secret() (in make_secrets). VERIFIED live: KMIP without token -> 401; KMIP with the backend's token (len 44) -> 422 (auth ACCEPTED, body invalid — not a 401); /version -> 200; agent's backend in-pod KMIP createKeyPair+Get -> ROUNDTRIP_OK (ssh-ed25519 pubkey). The e2e SSH path is NOT broken.

AC#2 (NetworkPolicy): deploy/k8s/base/kms/networkpolicy.yaml default-denies ingress to cosmian-kms:9998 except in-namespace pods labelled app.kubernetes.io/name in {iotgw-ui-backend, kestra} or app.kubernetes.io/managed-by=kestra (the PodCreate Ansible runner pods). CORRECTION to my prior assumption: kindnet on THIS cluster DOES enforce NetworkPolicy — VERIFIED: NP-allowed backend -> KMS /version 200; NP-denied kong -> TIMEOUT. Consequence: host->NodePort :9998 is now blocked (SNAT source isn't an in-namespace pod); verify.sh + bootstrap smoke were updated to fall back to an in-cluster /version probe from the NP-allowed backend pod (the path the NP governs). Renders kind+prod OK; secrets.sh check OK.

AUTHORED-NOT-PROVEN: prod overlay (needs kms-auth Secret out-of-band + policy CNI; no prod cluster); the Kestra/Ansible KMS-fetch role must present KMS_AUTH_TOKEN as Bearer (documented in kms/CLAUDE.md + decision-015, NOT wired into the flows — owned by task-054; means the real OpenWRT provisioning flow's KMS fetch needs the token added before it can run under auth).
<!-- SECTION:NOTES:END -->
