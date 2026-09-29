---
id: TASK-140
title: Improve responsive inventory tables for domains networks and devices
status: Done
assignee:
  - '@codex'
created_date: '2026-09-28 07:46'
updated_date: '2026-09-28 08:09'
labels:
  - frontend
  - ux
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the approved jobs-page presentation to all three Inventory lists, making resource details, filters, sorting, and actions usable on desktop and mobile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Domains, Networks, and Devices have readable desktop tables and responsive cards without horizontal overflow or loss of identifiers, descriptions, address ranges, counts, dates, or device key/provisioning status.
- [x] #2 Search, contextual filters, result counts, empty states, and sorting work on small screens and preserve existing URL-driven network/device navigation.
- [x] #3 Create/edit/delete dialogs and detail, deploy, one-time-code, and job links remain available with accessible labels and existing confirmation behavior.
- [x] #4 English and Spanish layouts and interactions pass browser checks; frontend tests, type/build checks and changed-file lint are run, with unrelated pre-existing failures recorded.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect inventory tables, route filters, and CRUD/device actions.
2. Add shared responsive list controls and table/card presentation while keeping existing handlers and permissions.
3. Validate layouts and actions with isolated browser fixtures and run appropriate frontend checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a shared inventory toolbar, desktop table, responsive cards, localized dates, and labeled row actions for /domains, /networks, and /devices. Long names, full resource IDs, descriptions, IPv4/IPv6 ranges, network counts, timestamps, and SSH/WireGuard/provisioning states remain visible. Searches now include IDs and addresses; contextual filters, result counts, clear/reset, refresh, and sorting work in both layouts. English and Spanish labels are included.

Preserved all CRUD payloads and confirmation steps, URL network filters and device-create preselection, deployment/detail/job links, one-time-code retrieval, automatic provisioning polling, immutable network ranges, and masked private keys. Dialog fields stack and long device forms scroll on small screens. The shared actions menu avoids a Radix pointer-lock conflict when opening and closing row dialogs.

Validation:
- 60 browser layout combinations passed with isolated fixtures: 3 lists, English/light and Spanish/dark, and widths 320/390/640/768/820/1024/1100/1120/1280/1440. No page, table, or content overflow; inspected desktop, tablet, mobile, and dialog screenshots.
- 30 browser interaction scenarios passed across the runs: 12 list/language/viewport scenarios covering search, sorting, contextual filters, links, keyboard menus, edit/delete/create dialogs and refresh; 2 URL/preselection cases; 3 empty inventories; 1 null-data and live provisioning transition; 9 intercepted CRUD requests; 3 one-time-code cases. All mutations used mock API responses.
- pnpm test:run: 30 tests passed, including 3 new inventory-search regression tests.
- Final pnpm build passed; existing large-chunk warning remains.
- Changed-file ESLint and Prettier checks passed; git diff --check passed.
- pnpm typecheck passed. The stronger tsc -p tsconfig.app.json --noEmit still reports app/backend errors outside the changed inventory files: 140 diagnostics versus 152 before these edits; no diagnostics in the changed inventory files.
- Full frontend lint remains blocked outside the changed files: 357 errors / 11 warnings, down from the pre-change 375 / 13.

Browser harnesses and screenshots: /tmp/inventory-browser.mjs, /tmp/check-inventory-layouts.mjs, /tmp/check-inventory-interactions.mjs, /tmp/check-inventory-actions.mjs, /tmp/inventory-*.png. Type/lint/build logs are under /tmp/inventory-*. Existing unrelated workspace changes and the previous uncommitted jobs-page work are preserved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Domains, Networks, and Devices now share readable responsive tables/cards, complete resource details, accessible filters/sorting/actions, and mobile-friendly dialogs. Verified layouts and interactions with mock data; build and 30 tests pass. Existing broader lint/type failures are recorded.
<!-- SECTION:FINAL_SUMMARY:END -->
