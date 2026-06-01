---
id: task-005
title: Refactor deployment page to use tab-based step navigation
status: Done
assignee: []
created_date: '2025-11-26 06:27'
updated_date: '2025-11-26 06:34'
labels:
  - frontend
  - deployments
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the current single "Configuration" accordion content with a four-tab step navigation system. Each tab represents a deployment phase: Booting Live, O.S. Installation, Rebooting, and Provisioning & Configuration Management.

Reference: doc-011 (Deployment Section Redesign specification)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Four tabs render inside the Configuration accordion section
- [x] #2 Tab state persists during session
- [x] #3 Active tab is visually distinguished
- [x] #4 Tabs are navigable via click
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create Tabs UI component based on shadcn/ui pattern with Radix UI primitives
2. Create DeploymentStepTabs component with four tabs (Booting Live, O.S. Installation, Rebooting, Provisioning)
3. Replace Configuration accordion content with the new tab system
4. Add state management for active tab (useState)
5. Add translations for step labels in en.json and es.json
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created:
- `apps/app/src/components/ui/tabs.tsx` - Generic Tabs UI component using @radix-ui/react-tabs
- `apps/app/src/components/deployment-step-tabs.tsx` - DeploymentStepTabs component with four steps

Modified:
- `apps/app/src/routes/deployments/index.tsx` - Integrated tab navigation inside Configuration accordion, added activeDeploymentStep state
- `apps/app/src/i18n/locales/en.json` - Added step translations
- `apps/app/src/i18n/locales/es.json` - Added Spanish step translations

The tabs display with step numbers (1-4), icons, and labels. The active tab is visually distinguished with primary color styling. Tab state persists during session via useState.
<!-- SECTION:NOTES:END -->
