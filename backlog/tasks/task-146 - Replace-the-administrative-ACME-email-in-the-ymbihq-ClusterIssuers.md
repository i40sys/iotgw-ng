---
id: TASK-146
title: Replace the administrative ACME email in the ymbihq ClusterIssuers
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
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
- [ ] #1 Replacement contact chosen by the user (or email removed)
- [ ] #2 ClusterIssuers updated in ~/k8s and applied; hl.joor.net cert still renews
<!-- AC:END -->
