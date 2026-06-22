---
id: TASK-063
title: Deploy Headlamp Kubernetes dashboard into the kind cluster
status: Done
assignee: []
created_date: '2026-06-22 05:30'
updated_date: '2026-06-22 19:55'
labels:
  - k8s
  - observability
dependencies: []
documentation:
  - >-
    backlog/decisions/decision-019 -
    Headlamp-SSO-via-Keycloak-OIDC-on-the-kube-apiserver.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the Headlamp web UI (https://headlamp.dev) as a kustomize-managed tier so operators have an in-cluster Kubernetes dashboard for the iotgw-ng platform. Mirror the existing whoami pattern: a base component (deploy/k8s/base/headlamp/) wired into the base kustomization and exposed through ingress-nginx on a dedicated host, in the iotgw namespace. Headlamp runs in-cluster (-in-cluster) with a ServiceAccount + ClusterRoleBinding for read access; login uses the SA bearer token (standard Headlamp auth).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deploy/k8s/base/headlamp/ exists with a kustomization.yaml and manifests (ServiceAccount, ClusterRole/Binding, Deployment, Service, Ingress)
- [x] #2 Headlamp is included in the base kustomization and renders cleanly via 'kustomize build deploy/k8s/overlays/kind'
- [x] #3 Deployed to the kind cluster: the headlamp pod is Ready in namespace iotgw
- [x] #4 Headlamp UI is reachable over ingress-nginx at host headlamp.wsl.ymbihq.local and the login SA token is documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create deploy/k8s/base/headlamp/{kustomization.yaml,headlamp.yaml} mirroring whoami: SA 'headlamp', ClusterRoleBinding to a read-scoped ClusterRole, Deployment (ghcr.io/headlamp-k8s/headlamp pinned, -in-cluster, port 4466, probes), Service :80->4466, Ingress host headlamp.wsl.ymbihq.local (ingressClassName nginx).\n2. Add '- headlamp' to deploy/k8s/base/kustomization.yaml.\n3. Validate render: kustomize build deploy/k8s/overlays/kind.\n4. Apply to kind, wait for Ready, smoke-test the ingress, capture the SA token for login.\n5. Document the host entry + token retrieval in deploy/README.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Auth hardened to Keycloak OIDC SSO (decision-019): realm iotgw + confidential client headlamp at iam.joor.net (groups mapper, group k8s-admins, user oriol). kube-apiserver OIDC flags in deploy/kind/cluster.yaml + applied live; RBAC ClusterRoleBinding oidc-k8s-admins binds oidc:k8s-admins->cluster-admin. Headlamp Deployment runs -oidc-* (client secret from SOPS secrets/headlamp-oidc.enc.env -> headlamp-oidc Secret). Validated: /config auth_type=oidc, /oidc 302->iam.joor.net, apiserver SelfSubjectReview maps id_token->oidc:oriol/oidc:k8s-admins, SSAR cluster-admin allowed; SA token fallback retained. Creds in Bitwarden 'Headlamp k8s SSO'. Runbook doc-017.
<!-- SECTION:NOTES:END -->
