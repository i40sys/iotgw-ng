---
id: TASK-146
title: Replace the administrative ACME email in the ymbihq ClusterIssuers
status: Done
assignee: []
created_date: '2026-09-29 10:37'
updated_date: '2026-09-29 16:08'
labels:
  - security
  - ovh
  - external
dependencies:
  - TASK-142
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** `letsencrypt-prod` / `letsencrypt-staging` on the OVH cluster (managed in the `~/k8s` repo, not here) use a reserved administrative address as the ACME contact, which must not be used in any system. iotgw uses its own `letsencrypt-iotgw` without an email.

**Scope:** `~/k8s` cert-manager ClusterIssuer manifests (repo `oriolrius/k8s`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Replacement contact chosen by the user (or email removed)
- [x] #2 ClusterIssuers updated in ~/k8s and applied; hl.joor.net cert still renews
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**ClusterIssuers without ACME email (2026-09-29).**

- User choice: **no email** (like `letsencrypt-iotgw`).
- `~/k8s` `dc8c1bb`: `cert-manager/clusterissuers-ovh-ymbihq.yaml` — `email` removed from `letsencrypt-prod` / `letsencrypt-staging`; `privateKeySecretRef` rotated to `*-account-key-noemail` so the ACME **accounts** carry no contact (removing only the field would keep it on the old account). Applied to `ovh-ymbihq`.
- Verified: both issuers Ready; prod registered `acct/3805736676` with no email; a throwaway Certificate for `hl.joor.net` issued via the new account (Let's Encrypt YR1), then deleted; hl.joor.net 200.
- The old accounts' key secrets remain unused in `cert-manager` (their LE registrations still list the old contact; they are no longer used for anything).
- infra-kb `c453bd0` updated.
<!-- SECTION:NOTES:END -->
