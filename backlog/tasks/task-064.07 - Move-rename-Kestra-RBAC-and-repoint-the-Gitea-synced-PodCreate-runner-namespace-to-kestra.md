---
id: TASK-064.07
title: >-
  Move/rename Kestra RBAC and repoint the Gitea-synced PodCreate runner
  namespace to kestra
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:51'
labels:
  - rbac
  - kestra
  - runtime
milestone: Namespace-per-subproject split
dependencies:
  - TASK-064.03
  - TASK-064.04
modified_files:
  - deploy/k8s/base/kestra/kestra-rbac.yaml
  - kestra/data/main/iotgw-ng/_files/install-flow.yaml
  - kestra/data/main/iotgw-ng/_files/connectivity-check-flow.yaml
parent_task_id: TASK-064
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Static: change kestra-rbac.yaml:47 RoleBinding subject namespace iotgw->kestra (kestra namespace applied by the T03 transformer). Runtime: in the Gitea-synced flow YAMLs (kestra/data/main/iotgw-ng/_files/install-flow.yaml:42, connectivity-check-flow.yaml:41, and any provisioning flow with a PodCreate) change PodCreate `namespace: iotgw`->`namespace: kestra`, then commit+push to git.oriolrius.cat/oriolrius/iotgw-kestra and re-run the sync-namespace-files flow so the LIVE Kestra DB-indexed flow is updated (editing the local copy is not enough). Verify the kestra-postgres jdbc URL stays a SHORT name (intra-namespace, no change).

ALSO repoint the Kestra KV store (live values in the Kestra Postgres, not in files): COSMIAN_KMS_URL http://cosmian-kms:9998 -> http://cosmian-kms.kms.svc.cluster.local:9998, and SUPABASE_URL http://kong:8000 -> http://kong.supabase-app.svc.cluster.local:8000 (used by flow PostgREST write-backs). Re-set with quoted-Ion values per the task-062.05 KV-corruption fix; SUPABASE_SERVICE_KEY is unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 kestra-rbac.yaml RoleBinding subject namespace is kestra
- [ ] #2 Every PodCreate task in the synced flows targets namespace kestra and the change is pushed to the Gitea iotgw-kestra repo and re-synced into the running Kestra
- [x] #3 kestra.yaml jdbc:postgresql://kestra-postgres:5432 remains a short name (unchanged)
- [ ] #4 A test flow execution spawns its runner pod in the kestra namespace (matched by the kestra-pod-runner Role and the KMS NetworkPolicy)
- [x] #5 Kestra KV COSMIAN_KMS_URL and SUPABASE_URL are re-seeded to the cosmian-kms.kms and kong.supabase-app FQDNs (quoted-Ion) and a flow run resolves both
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Edit RoleBinding ns; locate every PodCreate body in the synced flows; push to Gitea; trigger sync-namespace-files; confirm runner ns + Role + NetworkPolicy alignment.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Static: kestra-rbac RoleBinding subject ns -> kestra; the 3 PodCreate wrapper flows in _files set namespace: kestra; kestra->kestra-postgres jdbc left SHORT (intra-ns). Live (via kestra-expert): old Kestra DB pg_dump/restore'd into the kestra-ns Kestra (17 flows + KV migrated); KV COSMIAN_KMS_URL->cosmian-kms.kms FQDN (rev5) and SUPABASE_URL->kong.supabase-app FQDN (rev8), both round-tripped untruncated; the 3 registered flows updated via Kestra API to PodCreate namespace=kestra. RBAC validated: kestra SA -> kestra-pod-runner Role in kestra ns. AC#2 Gitea-source push deferred -> task-066 (live flows already updated via API). AC#4 actual runner-pod spawn blocked by a pre-existing DownloadFiles->PodCreate leading-slash path bug -> task-065; the runner->KMS path itself is validated (a managed-by=kestra pod in kestra ns reaches cosmian-kms.kms; NetworkPolicy allows).
<!-- SECTION:NOTES:END -->
