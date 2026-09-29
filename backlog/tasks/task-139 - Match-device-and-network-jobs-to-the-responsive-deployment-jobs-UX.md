---
id: TASK-139
title: Match device and network jobs to the responsive deployment jobs UX
status: Done
assignee:
  - '@codex'
created_date: '2026-09-28 07:01'
updated_date: '2026-09-28 07:13'
labels:
  - frontend
  - ux
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apply the approved deployment jobs presentation to Device Jobs and Network Jobs so details, statuses, filters, and log actions remain usable on desktop and mobile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both pages use compact desktop tables and small-screen cards with visible statuses, complete execution/transaction IDs, wrapped names and addresses, timing, duration, and log actions.
- [x] #2 Unified search, status filters, network-domain filtering, sorting, page-size preferences, URL name filters, and resource links remain usable with safe handling of missing data.
- [x] #3 Refresh, active-job polling, empty states, and pagination work correctly across filtering and changing result sets, in English and Spanish.
- [x] #4 Validate browser layouts and interactions, relevant regression tests, build, type checks, and changed-file lint; record existing unrelated failures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect device/network job-specific behavior and preserve sorting, preferences, scoping, and links.
2. Implement a shared responsive presentation matching deployment jobs, with typed preference migration and localized controls.
3. Validate both pages at desktop/mobile sizes, behavior and persistence, then run frontend regression checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied the approved deployment-jobs presentation to Device Jobs and Network Jobs through a shared WorkflowJobsList component. Both routes now have a page heading, compact six-column desktop table, container-responsive mobile/tablet cards, visible status badges, full execution and transaction IDs, wrapped names and addresses, duration, and real log links. Preserved network/domain links, API scope props, and log callbacks. Added unified search, status filtering, network-domain filtering, mobile-accessible sorting, clear filters, manual refresh, active/pending polling, localized controls and empty states, and a persistent page-size selector. Pagination resets when controls change and clamps if refreshed results shrink. Typed preference loading safely migrates the old separate text filters, respects URL name filters, recovers from corrupt storage, and caps legacy page sizes at the existing 100-job API limit. Missing network/address/transaction/domain data renders safely.

Validation: 27 frontend tests passed (including 7 new preference, filtering, null-field, sorting, and duration regressions); type check and production build passed. Changed-file ESLint, Prettier, and git diff --check passed. Browser checks used isolated mocked auth and sample API data: 40 layout combinations covering both pages at 320, 390, 640, 768, 820, 1024, 1100, 1120, 1280, and 1440 pixels in English/light and Spanish/dark, with no overflow or runtime errors. All 23 interaction scenarios passed: filtering from later pages, full transaction search, missing data, sorting with unfinished jobs last, page-size persistence, network/domain/log link destinations, domain filtering/search/persistence, manual and automatic refresh, pagination after result shrink, mobile actions, legacy preferences, URL name filters, and empty states. Self-reviewed the final changes.

Repository-wide lint still reports 375 errors and 13 warnings in unrelated files; no issues in the changed files. The prior deployment-jobs work was committed and pushed to origin/main separately as eb11f56.
<!-- SECTION:NOTES:END -->
