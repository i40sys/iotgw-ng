---
title: Image CI/CD Epic (→ ghcr.io/i40sys)
category: synthesis
tags: [type/task, cicd/images, cicd/github-actions, secrets/sops, status/current]
relationships:
  - target: "[[references/container-image-cicd]]"
    type: implements
sources:
  - backlog/tasks/task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys.md
  - backlog/tasks/task-067.02 - Remove-BACKUP-and-relocate-the-reversibility-net-before-the-i40sys-migration.md
  - backlog/tasks/task-067.03 - Full-working-tree-git-history-secret-audit-and-remediation-gate.md
  - backlog/tasks/task-067.13 - Wire-the-prod-overlay-to-ghcr.io-i40sys-images-pinned-by-digest-resolve-task-062.03.md
  - backlog/tasks/task-067.16 - Post-public-secret-exposure-incident-literal-secret-tripwire-leak-credential-rotations.md
  - backlog/tasks/task-067.18 - Set-repo-var-PROD_VITE_API_URL-before-cutting-a-real-prod-frontend-release.md
summary: The TASK-067 milestone (18 subtasks, Done 2026-06-25) that built the ghcr.io/i40sys image pipeline + supply chain — gated on a full-history secret audit + BACKUP/ removal before going public.
visibility: internal
provenance:
  extracted: 0.85
  inferred: 0.07
  ambiguous: 0.08
base_confidence: 0.7
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Image CI/CD Epic (→ ghcr.io/i40sys)

The execution record behind [[references/container-image-cicd]]. The
**`TASK-067` milestone** (18 subtasks) is **Done (2026-06-25)**, live-validated on
the now-**public** `github.com/i40sys/iotgw-ng`. Resolves the long-standing
`task-062.03` (`registry.invalid` placeholder).

## Delivered

- 3 custom images build+push to `ghcr.io/i40sys` (linux/amd64) via a reusable
  `build-image.yml` + 3 thin callers (backend/frontend/functions).
- Supply chain green per image: **Trivy → SARIF** (Security tab), **cosign v3**
  signature (verified), **SBOM + SLSA provenance** (`gh attestation verify` exit 0).
- `secret-scan` **gitleaks** gate is a required check; GitHub-native secret
  scanning + push protection on.
- prod overlay pins all 3 by **`@sha256`** (placeholder until a `vX.Y.Z` release);
  `bootstrap.sh` has an opt-in registry-pull path; kind stays build-local.
- `decision-021` + `deploy/RELEASE.md` published.

## The hard pre-migration gate

Because the repo moved from private Gitea to the **public-capable** `i40sys`
GitHub org, publishing was gated on:

- **Full-history secret audit clean** (0 findings) — including rotating + scrubbing
  the live Kestra password + an OpenRouter key (task-067.03/067.16).
- **`BACKUP/` removed** (untracked, never published; the reversibility net was
  relocated) (task-067.02).

> [!note] Gitea-private / GitHub-public policy
> Gitea is private+trusted (secrets OK, no rotation); the public GitHub `i40sys`
> copy must be scrubbed + audited (GO/NO-GO) first. See
> [[synthesis/secret-exposure-rotation-runbook]].

## Open follow-up

- **task-067.18** — set repo var `PROD_VITE_API_URL` before cutting a real prod
  frontend release (the frontend image bakes the API URL at build time).

## Sources

- task-067 (epic) + .02/.03/.13/.16/.18; ratified by decision-021.
- Related: [[references/container-image-cicd]], [[synthesis/secret-exposure-rotation-runbook]], [[entities/edge-functions]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/tasks/task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys|task-067 - Epic-Container-image-CI-CD-GitHub-Actions-ghcr.io-i40sys]]
- [[_sources/tasks/task-067.02 - Remove-BACKUP-and-relocate-the-reversibility-net-before-the-i40sys-migration|task-067.02 - Remove-BACKUP-and-relocate-the-reversibility-net-before-the-i40sys-migration]]
- [[_sources/tasks/task-067.03 - Full-working-tree-git-history-secret-audit-and-remediation-gate|task-067.03 - Full-working-tree-git-history-secret-audit-and-remediation-gate]]
- [[_sources/tasks/task-067.13 - Wire-the-prod-overlay-to-ghcr.io-i40sys-images-pinned-by-digest-resolve-task-062.03|task-067.13 - Wire-the-prod-overlay-to-ghcr.io-i40sys-images-pinned-by-digest-resolve-task-062.03]]
- [[_sources/tasks/task-067.16 - Post-public-secret-exposure-incident-literal-secret-tripwire-leak-credential-rotations|task-067.16 - Post-public-secret-exposure-incident-literal-secret-tripwire-leak-credential-rotations]]
- [[_sources/tasks/task-067.18 - Set-repo-var-PROD_VITE_API_URL-before-cutting-a-real-prod-frontend-release|task-067.18 - Set-repo-var-PROD_VITE_API_URL-before-cutting-a-real-prod-frontend-release]]
