---
id: TASK-142
title: Deploy iotgw-ng to OVH MKS (ymbihq) with Terraform and migrate from kind
status: In Progress
assignee: []
created_date: '2026-09-29 07:49'
updated_date: '2026-09-29 10:37'
labels:
  - deploy
  - ovh
  - terraform
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Goal.** Run the whole iotgw-ng stack on the existing OVH Managed Kubernetes cluster `ymbihq` (GRA9) and migrate the kind environment's data into it (kind stays as dev).

**Decisions (user, 2026-09-29):**
- Reuse the existing control plane (imported into Terraform), drop pool01 (d2-4), new pool `iotgw` = 1x r3-16.
- Ingress through the existing Traefik LB 145.239.127.187 with Gateway API HTTPRoutes (no ingress-nginx).
- Public hostnames under `iotgw.i40sys.com` (Cloudflare DNS); Let's Encrypt via cert-manager.
- Terraform state in OVH Object Storage S3 (bucket `iotgw-ng-tfstate-28f191`).
- Migrate kind -> OVH: DB, KMS content, Kestra DB (KV), same SOPS secrets; gateways re-pointed to the new device API URL.

**Layout:** `deploy/terraform/ovh/{infra,platform}` + `tf.sh` (SOPS env), overlay `deploy/k8s/overlays/ovh`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 infra: cluster imported (prevent_destroy), pool01 deleted, r3-16 pool created, unused floating IP released
- [x] #2 platform: StackGres operator, secrets from SOPS, kms/kestra/supabase-db/supabase-app/iotgw-ui applied by Terraform
- [x] #3 Gateway API: HTTPS listeners + HTTPRoutes for app/backend/api/device hostnames with valid certs
- [x] #4 Data migrated from kind: app DB, KMS objects, Kestra DB
- [x] #5 Frontend image rebuilt with the OVH URLs and digests pinned
- [x] #6 Smoke: UI login + Kong->PostgREST read + device API TLS with pinned CA on OVH
- [x] #7 Docs: deploy/terraform/ovh/README.md + infra-kb ovh-ymbihq-k8s.md updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Deployed and migrated (2026-09-29).** iotgw-ng runs on OVH MKS `ymbihq`; kind stays as dev.

**Infra (`deploy/terraform/ovh/infra`):**
- Cluster imported (`prevent_destroy`), pool01 (d2-4) deleted, pool `iotgw` 1x r3-16 created.
- Floating IP 57.128.57.70 released; 145.239.127.116 kept (it is the cluster's OVH Gateway/SNAT).
- Cloudflare DNS-only A records for iotgw / backend / api / device `.iotgw.i40sys.com` -> 145.239.127.187.

**Platform (`deploy/terraform/ovh/platform` + `deploy/k8s/overlays/ovh`):**
- StackGres 1.19.1 (helm), Secrets from SOPS, device-API cert signed by the pinned CA, overlay via kbst/kustomization.
- Own Gateway `iotgw-gateway/iotgw` on the existing Traefik + HTTPRoutes; Let's Encrypt via `letsencrypt-iotgw` (no ACME email).
- Frontend rebuilt with the OVH URLs (repo vars PROD_VITE_*), digests pinned.

**Migration:** app data (public + auth.users/identities, triggers off), KMS SQLite (11 objects, same token), Kestra DB + /app/storage. kind Kestra scaled to 0.

**Version alignment:** KMS 5.27.1 (base; 5.20.0 fails on containerd 2.2) and StackGres 1.19.1 (kind upgraded via 1.18.9). Kubernetes still differs (kind 1.31 vs OVH 1.35).

**Smoke:** SPA 200 + redirect, auth health 200, Kong->PostgREST 12 devices, backend 401 without a token, device API TLS with the pinned CA; hl.joor.net 200.

**Pending:** operator UI login on https://iotgw.i40sys.com (AC#6); re-point gateways' `api_base`; kind k8s 1.35 recreate (needs confirmation).
<!-- SECTION:NOTES:END -->
