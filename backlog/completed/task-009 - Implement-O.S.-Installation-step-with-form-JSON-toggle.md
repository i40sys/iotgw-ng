---
id: task-009
title: Implement O.S. Installation step with form/JSON toggle
status: Done
assignee:
  - '@claude'
created_date: '2025-11-26 06:28'
updated_date: '2025-12-01 05:22'
labels:
  - frontend
  - deployments
dependencies:
  - task-005
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the second deployment step with form fields for OpenWRT version and target disk. Include FORM/JSON toggle using react-hook-form, with form values synced to the shared deployment JSON.

Reference: doc-011 for target disk help table.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Form displays OpenWRT version field with default 23.05.4
- [x] #2 Form displays target disk field with default /dev/nvme0n1
- [x] #3 Help section shows target disk reference table
- [x] #4 FORM/JSON toggle switches between form view and Monaco editor
- [x] #5 Form values sync bidirectionally with deployment JSON
- [x] #6 Versions pane auto-expands when JSON mode is active
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create OsInstallationStep component with form fields for OpenWRT version and target disk
2. Add FORM/JSON toggle using Switch component
3. Integrate Monaco editor for JSON mode
4. Implement bidirectional sync between form values and deployment JSON
5. Add Collapsible component with target disk reference table
6. Add translations for all new UI text
7. Integrate component in deployments page
8. Wire up onModeChange callback to auto-expand Versions pane
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created:
- `apps/app/src/components/deployment-steps/os-installation-step.tsx` - OsInstallationStep component with:
  - Form fields for OpenWRT version (default: 23.05.4) and target disk (default: /dev/nvme0n1)
  - FORM/JSON toggle using Switch component
  - Monaco editor integration for JSON mode
  - Bidirectional sync between form values and deployment JSON using react-hook-form
  - Collapsible help section with target disk reference table
- `apps/app/src/components/ui/collapsible.tsx` - Collapsible UI component using Radix UI primitives

Modified:
- `apps/app/src/routes/deployments/index.tsx` - Integrated OsInstallationStep component, added auto-expand Versions pane on JSON mode
- `apps/app/src/i18n/locales/en.json` - Added translations for form mode, JSON mode, form fields, and help section
- `apps/app/src/i18n/locales/es.json` - Added Spanish translations

Dependencies added:
- `@radix-ui/react-collapsible` - For collapsible help section

The component syncs form values to the `osInstallation` section of the deployment JSON, maintaining compatibility with the existing configuration structure.
<!-- SECTION:NOTES:END -->
