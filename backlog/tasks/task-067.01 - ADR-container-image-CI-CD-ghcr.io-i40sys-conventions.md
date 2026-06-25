---
id: TASK-067.01
title: 'ADR: container image CI/CD + ghcr.io/i40sys conventions'
status: Done
assignee: []
created_date: '2026-06-23 08:01'
updated_date: '2026-06-25 05:00'
labels:
  - adr
  - cicd
  - supply-chain
  - ghcr
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies: []
references:
  - backlog/decisions/decision-021
  - backlog/decisions/decision-014 - Secrets-Management-with-SOPS-and-age.md
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
  - deploy/k8s/overlays/prod/kustomization.yaml
  - deploy/k8s/base/supabase-app/Dockerfile.functions
  - iotgw-ui/apps/backend/.docker/Dockerfile
  - iotgw-ui/apps/app/.docker/Dockerfile
  - task-062.03
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 'Container image CI/CD (ghcr.io/i40sys)' milestone needs a ratified decision record so every downstream task (reusable-workflow, *-image, trivy/sbom/cosign, prod-overlay) cites one source of truth instead of re-litigating conventions. Author a new ADR (backlog/decisions/decision-021) that fixes: the ghcr.io/i40sys namespace and the three custom image names (iotgw-functions, iotgw-ui-backend, iotgw-ui-frontend); the tag strategy (immutable type=sha + semver release tags from git tags, never :latest in prod); OCI labels via docker/metadata-action; the supply-chain policy (Trivy HIGH/CRITICAL gate, cosign keyless OIDC signing, SBOM + SLSA provenance attestations); linux/amd64-only builds (no multi-arch/QEMU); and that the prod kustomize overlay pins images by sha256 DIGEST. This resolves the conventions half of TODO(task-062.03) and is the foundation the reusable-workflow depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new ADR file exists at backlog/decisions/decision-021 - *.md following the format of existing decisions (decision-014/decision-020) with Context / Decision / Consequences sections.
- [x] #2 The ADR names the registry namespace ghcr.io/i40sys and the exact three image names: ghcr.io/i40sys/iotgw-functions, ghcr.io/i40sys/iotgw-ui-backend, ghcr.io/i40sys/iotgw-ui-frontend, and explicitly lists every other image (kestra, postgres, ghcr.io/cosmian/kms, supabase/postgres, gotrue, postgrest, kong, headlamp, ingress-nginx, kindest/node, supabase/edge-runtime base) as upstream pull-only with no CI.
- [x] #3 The ADR ratifies the tag strategy: immutable type=sha tag + type=semver release tags from git vX.Y.Z tags, with an explicit rule that prod NEVER references :latest or a mutable tag.
- [x] #4 The ADR mandates linux/amd64-only builds (no arm64/multi-arch, no setup-qemu) with the rationale that kind nodes and servers are x86_64.
- [x] #5 The ADR records the supply-chain policy: Trivy vuln scan (severity HIGH,CRITICAL, ignore-unfixed) with SARIF to GitHub code scanning, cosign keyless OIDC signing of the image DIGEST, and SBOM + SLSA build-provenance attestations bound to the digest.
- [x] #6 The ADR states the prod kustomize overlay (deploy/k8s/overlays/prod/kustomization.yaml) pins images by sha256 DIGEST, not by tag, and notes ghcr packages must be public or require an imagePullSecret.
- [x] #7 The ADR references decision-014 (secrets), decision-020 (namespaces), task-062.03, and is linked from the milestone.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read decision-014 and decision-020 for the house ADR format and cross-references.
2. Draft backlog/decisions/decision-021 with Context (Gitea->i40sys migration, ghcr.io/i40sys target, no CI today) and Decision sections.
3. Enumerate the 3 custom images + their contexts/Dockerfiles and the upstream pull-only list.
4. Specify tag strategy (sha + semver, no :latest in prod), OCI labels, amd64-only, and the supply-chain gates (Trivy/cosign/SBOM/provenance).
5. State the digest-pinning rule for the prod overlay and the ghcr visibility/imagePullSecret consequence.
6. Add the decision to backlog via the Backlog.md CLI and cross-link task-062.03.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authored backlog/decisions/decision-021 (Container image CI/CD + ghcr.io/i40sys conventions): ghcr.io/i40sys namespace + the 3 image names, upstream pull-only list, tag strategy (sha + semver, no :latest in prod), OCI labels, linux/amd64-only, supply-chain policy (Trivy/cosign/SBOM/SLSA), digest-pinned prod overlay + ghcr visibility/imagePullSecret note. Cross-links decision-014/020 + task-062.03. Added to CLAUDE.md Critical Docs table.
<!-- SECTION:NOTES:END -->
