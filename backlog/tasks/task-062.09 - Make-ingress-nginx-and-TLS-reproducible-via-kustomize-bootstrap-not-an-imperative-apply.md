---
id: TASK-062.09
title: >-
  Make ingress-nginx and TLS reproducible via kustomize/bootstrap, not an
  imperative apply
status: Done
assignee: []
created_date: '2026-06-18 05:43'
updated_date: '2026-06-18 18:50'
labels:
  - k8s
  - migration
  - ingress
milestone: Decommission docker-compose
dependencies:
  - TASK-062.08
parent_task_id: TASK-062
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ingress-nginx is installed imperatively by bootstrap.sh (kubectl apply of a remote URL), so 'kubectl apply -k' alone does not reproduce the cluster. Pin/vendor the ingress-nginx install (or manage via Helm/kustomize) and wire real Ingress hostnames + cert-manager/SOPS TLS for the app tier and iotgw-ui (prod overlay only sketches ingress-prod.yaml, commented out).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ingress-nginx installation is pinned and reproducible (vendored manifest or Helm), not a live remote URL fetch
- [x] #2 Ingress hostnames route to kong and the iotgw-ui frontend/backend on kind
- [x] #3 Prod overlay ingress-prod.yaml + TLS wiring is real (uncommented) with certs from the SOPS store / kms pki-test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vendor/pin ingress-nginx manifest; repoint bootstrap off the live remote URL.\n2. Add a kong Ingress; verify kong + iotgw-ui hosts route live.\n3. Author real (uncommented) prod-overlay TLS from the SOPS/kms pki-test certs; render-validate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (delegated to k8s-operator, verified). AC#1: ingress-nginx pinned to v1.12.1, vendored at deploy/k8s/ingress-nginx/deploy-ingress-nginx-v1.12.1.yaml (16.4KB); bootstrap.sh cluster_up() now applies the vendored local file — NO https://kind.sigs.k8s.io remote fetch remains (dry-run=server confirmed no-op vs the live controller, no pod restarts). AC#2: new deploy/k8s/base/supabase-app/ingress-kong.yaml (host api.wsl.ymbihq.local -> kong:8000), in the supabase-app kustomization; live routing verified through ingress-nginx — api host /rest/v1/ => 401 (Kong key-auth enforced = routed), iotgw-ui.wsl.ymbihq.local => 200 (SPA), iotgw-ui-backend host /trpc => 404 NOT_FOUND (tRPC alive). AC#3: deploy/k8s/overlays/prod/ingress-prod.yaml is a real (uncommented) strategic-merge patch adding spec.tls (Secret iotgw-wildcard-tls) + ssl-redirect to all three app-tier Ingresses; cert source = secrets/traefik-tls.enc.yaml (SOPS; wildcard *.wsl.ymbihq.local signed by the kms/pki-test CA, exp 2026-10-09), TLS Secret provisioning documented in the file header (no cert-manager; alternative noted). Renders: kind 45 objs, prod 39 objs with 3 TLS hosts. Prod is authored-validated-by-render only (no prod cluster).
<!-- SECTION:NOTES:END -->
