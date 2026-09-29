---
id: TASK-141
title: Refactor deployments into a guided device workspace
status: Done
assignee: []
created_date: '2026-09-29 05:23'
updated_date: '2026-09-29 10:11'
labels:
  - frontend
  - ux
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the deployments page with a coherent, responsive operator workflow: clear target selection, explicit saved configurations, four navigable stages, execution review, and accessible job history. Document the UX proposal and preserve backend operation contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Target device, network and domain remain unambiguous across filtering, deep links and reloads; merely selecting a device or stage never writes a deployment.
- [x] #2 Desktop and mobile layouts provide a readable four-stage workspace, explicit draft and saved states, discoverable version management and job history.
- [x] #3 Installation and provisioning show a review with target and configuration details, field validation and installation disk acknowledgement before execution; connectivity remains available.
- [x] #4 Unsaved changes are guarded when switching devices, versions or routes; failed saves preserve the draft; async results cannot attach a configuration to the wrong device.
- [x] #5 Document the proposal, verify behavioral tests and responsive browser interactions, and run frontend typecheck, lint and build.
- [x] #6 Configuration is the first workspace view, shows the current configuration name, keeps its fields visible at every screen size and preserves edits and stage selection when switching views.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the authenticated page, behavior specification and deployment contracts.
2. Replace the route monolith with a device-scoped workspace hook and focused target, configuration and review components.
3. Implement responsive stages, explicit persistence and safe execution review, retaining existing configuration editors and job history.
4. Validate real read-only rendering plus fixture-based save, switching and execution flows; document the proposal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the reviewable deployments workspace on feat/deployments-ux-refactor. Proposal: doc-019. Replaced the route monolith, global action bar, versions rail and shared settings state with a searchable target picker, visible target card, four readable stages, configuration sidebar, explicit save/version actions, per-device draft restoration, navigation protection, review dialogs and execution monitoring independent of dialog visibility. Retained schema-driven configuration, JSON import/editing, one-time codes, connectivity checks, job history and debug views. No backend/database/dependency changes.

Validation: frontend Vitest 37/37; isolated Playwright 13/13 (all external requests mocked), including save failures, device/version/route changes, installation acknowledgement, execution ordering, continued polling, legacy JSON text configurations, provisioning, late responses, reload, 360/390/768 px layouts and Spanish. ESLint passes for every changed source file. Production build passes with the existing large-chunk warning. Live authenticated desktop/mobile inspection made zero mutation requests and confirmed no horizontal overflow. No real gateway operation was started.

TypeScript: the standard typecheck script is insufficient for the app (empty solution files). Direct application check still reports 118 existing diagnostics versus 139 at HEAD/base; 21 removed, no additional diagnostics by file/code and none in changed files. This pre-existing whole-repo type debt is documented in doc-019.

Known platform limits: version allocation and optimistic concurrency remain backend concerns; duplicate-submission protection is local to this workspace. Read the proposal for persistence and rollout behavior.

Follow-up: moved Configuration out of the sidebar into the first workspace view, ahead of Setup and Device activity. The menu shows the live configuration name with an unnamed fallback and accessible truncation; the form is expanded at every width. Setup now uses the full workspace width, and drafts and the active stage survive switching views. Updated English/Spanish labels, review return wording and doc-019. Screenshot review also improved the selected-view contrast and stacked the target action on phones. Validation: all 13 isolated browser scenarios pass, including draft and field preservation across all three views; responsive and Spanish scenarios pass again after the final styling adjustments. Production build, changed-source ESLint and formatting pass. Workspace typecheck passes; direct application check remains exactly 118 pre-existing diagnostics with no additions or changes.

Cursor feedback follow-up: all three workspace view buttons now use cursor-pointer, so Configuration, Setup and Device activity show the hand cursor on hover.
<!-- SECTION:NOTES:END -->
