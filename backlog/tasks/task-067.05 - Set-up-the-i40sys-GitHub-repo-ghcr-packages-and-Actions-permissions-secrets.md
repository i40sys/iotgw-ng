---
id: TASK-067.05
title: 'Set up the i40sys GitHub repo, ghcr packages, and Actions permissions/secrets'
status: To Do
assignee: []
created_date: '2026-06-23 08:01'
labels:
  - github
  - ghcr
  - cicd
  - infra
milestone: Container image CI/CD (ghcr.io/i40sys)
dependencies:
  - TASK-067.03
  - TASK-067.02
references:
  - ghcr.io/i40sys
  - .github/workflows/
  - deploy/k8s/overlays/prod/kustomization.yaml
  - iotgw-ui/apps/app/.docker/Dockerfile
  - task-062.03
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
parent_task_id: TASK-067
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The build pipelines cannot push to ghcr.io/i40sys until the GitHub org repo and package plumbing exist, so this task provisions them as a prerequisite of reusable-workflow. Create/confirm the i40sys GitHub repo (the migration target off Gitea git.oriolrius.cat) and the three ghcr packages (iotgw-functions, iotgw-ui-backend, iotgw-ui-frontend), set their visibility (public, or document the imagePullSecret requirement if private), grant the repo Actions the per-pillar permissions the workflows need (contents:read, packages:write, id-token:write, security-events:write, attestations:write), and address the known ghcr first-push gotcha (GITHUB_TOKEN package writes only fully apply on the default branch; the new package may need 'Manage Actions access' to allow the repo). This depends on the secret-audit and backup-removal gates being green so the repo is safe to create public.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The i40sys GitHub org repo exists (migrated from ssh://git@git.oriolrius.cat:222/oriolrius/iotgw-ng.git) and is created/pushed ONLY after secret-audit and backup-removal are confirmed green.
- [ ] #2 The three ghcr packages ghcr.io/i40sys/iotgw-functions, ghcr.io/i40sys/iotgw-ui-backend, ghcr.io/i40sys/iotgw-ui-frontend exist (lowercase names) with visibility set to public — or, if private, the required cluster imagePullSecret is documented for prod-overlay/bootstrap-pull.
- [ ] #3 Repo/org Actions permissions are configured to allow GITHUB_TOKEN with packages:write, and the new-package first-push gotcha is resolved via org Package settings 'Manage Actions access' allowing the repo.
- [ ] #4 A reference list of the per-job permissions blocks the workflows must declare is recorded: contents:read, packages:write, id-token:write, security-events:write, attestations:write.
- [ ] #5 Any required Actions secrets/variables are provisioned (e.g. GITLEAKS_LICENSE if the gitleaks-action path is chosen, and the prod VITE_API_URL value for the frontend build-arg) or explicitly documented as not-needed.
- [ ] #6 It is verified (a trivial test push by digest, or documented preconditions) that a workflow can authenticate to ghcr.io and push to all three packages from the default branch.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm secret-audit + backup-removal gates are green before creating the public repo.
2. Create the i40sys GitHub repo and migrate from the Gitea origin.
3. Trigger/create the three ghcr packages and set visibility (public preferred); document imagePullSecret if private.
4. Configure repo/org Actions permissions for GITHUB_TOKEN packages:write and resolve the new-package 'Manage Actions access' gotcha.
5. Record the per-pillar permissions block the reusable workflow needs (contents/packages/id-token/security-events/attestations).
6. Provision Actions secrets/variables (GITLEAKS_LICENSE if used, prod VITE_API_URL) or note none required.
7. Verify a ghcr push works from the default branch.
<!-- SECTION:PLAN:END -->
