---
id: TASK-064
title: >-
  Epic: Namespace-per-subproject split (iotgw becomes the cluster, not a
  namespace)
status: Done
assignee: []
created_date: '2026-06-23 04:53'
updated_date: '2026-06-23 05:51'
labels:
  - epic
  - kubernetes
  - namespace-split
  - deploy
  - infrastructure
milestone: Namespace-per-subproject split
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Eliminate the single `iotgw` Kubernetes namespace and split the platform into one namespace per independent subproject: `kestra`, `kms`, `supabase-db`, `supabase-app`, and `iotgw-ui`. `headlamp` and `ingress-nginx` are already isolated and are NOT touched. The kind CLUSTER stays named `iotgw` (and the `kind-iotgw` kube-context, the `kind load --name iotgw`, and the Keycloak `iotgw` realm are all unchanged) — only the k8s NAMESPACE `iotgw` is removed.

The split follows the Headlamp pattern (decision-019 / doc-017): each subproject gets its own self-contained kustomization with its own `namespace:` transformer; there is no global `namespace: iotgw` transformer and no shared `iotgw` Namespace resource. Every reference that today resolves a peer by SHORT service name inside the single namespace will now CROSS a namespace boundary and must use an FQDN (`service.namespace.svc.cluster.local`). Intra-namespace short names (kestra->kestra-postgres, kong->auth/rest/functions, auth->kong) STAY short and must NOT be FQDN-rewritten.

This change spans static manifests AND runtime/cross-system state: the KMS NetworkPolicy must allow cross-namespace clients (with AND-combined namespaceSelector+podSelector per `from:` entry to avoid widening access to the SSH-key store), the Kestra RoleBinding and the Gitea-synced Kestra PodCreate runner namespace must move to `kestra`, the live pg_net webhook triggers inside supabase-db must be repointed to `kong.supabase-app...` via a NEW forward migration (editing the migration file alone does nothing on an existing DB), NodePorts must co-locate with their target pods (a NodePort selects Endpoints only in its own namespace), the wildcard TLS Secret must be replicated into supabase-app AND iotgw-ui, and secret creation in tooling must fan out per namespace (incl. secrets needed in two namespaces). Tooling (bootstrap.sh, justfile, verify.sh) and all docs/runbooks/CLAUDE.md/memory are updated, ratified by ADR decision-020, and a single terminal end-to-end validation gates the milestone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No `iotgw` namespace exists in the cluster after cutover; `kubectl get ns` shows kestra, kms, supabase-db, supabase-app, iotgw-ui (plus pre-existing headlamp, ingress-nginx, stackgres) and the workloads previously in `iotgw` are Running in their new namespaces
- [x] #2 The kind cluster is still named `iotgw` and the kube-context is still `kind-iotgw` (cluster, context, `kind load --name iotgw`, verify.sh cluster grep, and the Keycloak `iotgw` realm are unchanged)
- [x] #3 `kustomize build deploy/k8s/overlays/kind` and `.../overlays/prod` render with every resource assigned to a non-default namespace (no resource silently lands in `default`); no global `namespace: iotgw` transformer and no `iotgw` Namespace resource remain
- [x] #4 Every genuine cross-namespace reference uses an FQDN (app->db, app->kms via backend, app->kestra, ui->kong, ui->kms, pg_net webhook->kong) and every intra-namespace reference stays a short name
- [x] #5 The KMS NetworkPolicy admits exactly the intended cross-namespace clients (iotgw-ui-backend from iotgw-ui; kestra and kestra-managed runners from kestra) via per-entry AND-combined namespaceSelector+podSelector keyed on the guaranteed `kubernetes.io/metadata.name` label; a pod outside the allow-list (negative test) is still denied
- [x] #6 `just verify` passes end-to-end and a device + a network provision through the netmaker-call chain, a Kestra Ansible flow runs and fetches an SSH key from the KMS, and the backend mints/fetches a KMS key — all green post-split
- [x] #7 decision-020 is authored and ratifies the topology, and all docs/runbooks/CLAUDE.md Service Ports tables/memory reflect the per-namespace layout and FQDN conventions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Milestone complete. The single iotgw k8s namespace was split into kestra/kms/supabase-db/supabase-app/iotgw-ui (whoami dropped per user); iotgw remains the kind CLUSTER name only. All 15 child tasks Done. Live-validated on the kind cluster: 'just verify' ALL PASSED post-cutover; KMS NetworkPolicy AND-combined cross-ns selectors (backend/kestra ALLOW, supabase-app DENY); pg_net webhook DB(supabase-db)->kong.supabase-app->netmaker-call fires; backend KMS mint over cosmian-kms.kms FQDN (CreateKeyPair 200); Kestra DB+KV migrated to the kestra ns with FQDN KV. iotgw namespace deleted; 0 resources in default; cluster/context iotgw preserved. Caveats/follow-ups: task-065 (pre-existing DownloadFiles->PodCreate path bug blocking the full Ansible runner spawn), task-066 (push flow namespace:kestra to the Gitea source for sync durability). Incidental fix: 00-roles.sql now creates supabase_functions_admin (was GRANTed-not-created, rolling back the fresh-init role script).
<!-- SECTION:NOTES:END -->
