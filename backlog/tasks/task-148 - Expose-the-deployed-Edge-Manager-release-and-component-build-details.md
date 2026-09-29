---
id: TASK-148
title: Expose the deployed Edge Manager release and component build details
status: Done
assignee: []
created_date: '2026-09-29 11:28'
updated_date: '2026-09-29 15:06'
labels:
  - frontend
  - backend
  - release
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Identify the deployed product.** Show a compact release badge next to Edge Manager and an accessible deployment-details dialog with copyable diagnostics.

**Scope:**
- Stamp frontend/backend builds and declare the product release in a deployment manifest.
- Separate declared component versions, observed build identities and verification evidence.
- Document the release contract and rollout workflow in an accepted backlog decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The brand shows a release or development build identifier and opens responsive, translated deployment details with copyable diagnostics.
- [x] #2 Frontend and backend identities are stamped during builds; development has a Git revision and production never substitutes a package version for a product release.
- [x] #3 An authenticated endpoint reads validated, allowlisted deployment metadata and identifies UI/backend mismatches without exposing configuration secrets.
- [x] #4 A documented manifest-generation and verification workflow records exact component image references and distinguishes unverified declarations from deployment evidence.
- [x] #5 An accepted backlog decision documents version ownership, release identity, limitations and upgrade steps; relevant tests and checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define release/build metadata and the verification contract.
2. Implement build stamping, authenticated metadata and the header dialog.
3. Connect container builds and manifest tooling; document the decision and runbook.
4. Verify release, development, missing metadata and mixed-version cases, plus responsive interactions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented; browser review pending.** Product release identity and component diagnostics are ready on feat/deployments-ux-refactor.

**What changed:**
- Header badge and translated About dialog with source/build details, declared component versions, mismatch indicators and copy/manual-copy diagnostics.
- Shared build stamping for Vite and the backend, wired through Docker, CI and kind builds. The prior package-derived product labels were removed.
- Authenticated, allowlisted metadata endpoint and per-overlay optional ConfigMap manifests.
- Release declaration and read-only Kubernetes image snapshot tooling; accepted decision-036 and deploy/RELEASE.md document identity ownership, verification limits and rollout.

**Verified:**
- Frontend Vitest: 45 passed. Backend Vitest: 56 passed.
- Build metadata: 3 Node tests. Release manifest tool: 4 Python tests.
- Frontend and backend builds pass; production backend bundle keeps its identity when runtime build variables change.
- All three Kubernetes overlays render their ConfigMap and backend mount correctly. Example manifest generation succeeds without a cluster call.
- Changed-source ESLint, Prettier, shell syntax and git whitespace checks pass.
- Standard workspace typecheck passes. Direct app checking reports the same 119 diagnostics as an isolated checkout of current HEAD, with no added diagnostics by file/code.

**Pending verification:**
- The new Playwright scenario covers the badge/dialog/copy fallback at 360, 768, 1024 and 1440 px. Chromium cannot launch in this session: sandbox_host_linux.cc exits with Operation not permitted. AC1 and AC5 remain unchecked until that browser check runs. No application failure was reached by that test.
- Run: cd iotgw-ui/apps/app && pnpm exec playwright test --config playwright.deployments.config.ts --grep 'version badge'.

**Tooling note:**
- The workspace makes .git read-only, and Backlog creation needs a lock inside .git. Tasks/decision scaffolds were generated through the Backlog CLI in a temporary repository snapshot and their Markdown outputs copied into this workspace; task updates also use that CLI snapshot.

**Release preparation (2026-09-29):**
- Prepared product release v0.5.0, following the latest published v0.4.1. Bumped frontend 0.10.2 -> 0.11.0 and backend 1.0.0 -> 1.1.0; the workspace package version is not the product identity.
- Added deploy/releases/v0.5.0.md covering the deployment workspace, product diagnostics, OVH configuration, upgrade procedure and outstanding verification.
- The existing live-image release step now reads the committed notes file for its tag, updates those notes on reruns, and retains generated notes for tags without a file. Verified all four combinations of existing/new release and present/absent notes with a stubbed gh CLI; no remote write was performed.
- Re-ran workspace typecheck, build metadata tests, package-version stamping assertions, changed-file formatting, workflow shell syntax and whitespace checks successfully.
- Publication is blocked by this session's access: git add fails with Read-only file system when creating .git/index.lock, terminal GitHub connectivity is unavailable, and the GitHub connector reports push=false for i40sys/iotgw-ng. No new commit, push, merge, tag or GitHub release was made. Changes remain on feat/deployments-ux-refactor; resume publication from a session with writable Git metadata and authorized GitHub write access.
- Browser ACs remain pending as recorded above; release preparation does not count as browser validation.

**Closed 2026-09-29.** Browser verification now done: `playwright.deployments.config.ts` 14/14 passed in Chromium, including the version-badge scenario (responsive details + manual copy). decision-036 accepted; shipped in v0.5.0 (PR #1). Rolling the release out to OVH is a separate task.
<!-- SECTION:NOTES:END -->
