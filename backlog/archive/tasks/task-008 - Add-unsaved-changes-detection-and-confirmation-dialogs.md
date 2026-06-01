---
id: task-008
title: Add unsaved changes detection and confirmation dialogs
status: Done
assignee:
  - "@myself"
created_date: "2025-09-24 04:54"
updated_date: "2025-09-24 05:16"
labels:
  - frontend
  - ui
  - ux
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implement detection of unsaved changes and show confirmation dialogs when user attempts to navigate away

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Unsaved changes detection implemented by comparing current editor content with saved version
- [x] #2 Confirmation dialog shown when switching between versions with unsaved changes
- [x] #3 Confirmation dialog shown when changing selected device with unsaved changes
- [x] #4 Dialog options include Save, Discard, and Cancel actions
- [x] #5 Browser navigation guard implemented to prevent accidental data loss
- [x] #6 Visual indicator shows when there are unsaved changes
- [x] #7 Proper state management for tracking dirty state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create a custom hook for unsaved changes detection\n2. Create a confirmation dialog component with Save, Discard, Cancel actions\n3. Add unsaved changes detection to JsonEditor component\n4. Add browser navigation guard using TanStack Router's beforeLoad\n5. Implement device selection change detection\n6. Add visual indicator for unsaved changes\n7. Integrate state management for tracking dirty state across components
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Comprehensive unsaved changes detection and protection system implemented:

**Key Features:**

1. **Custom Hooks Created:**

   - `useUnsavedChanges`: Core hook for tracking saved vs current values
   - `useNavigationGuard`: Browser beforeunload protection
   - `useUnsavedChangesGuard`: High-level hook combining both

2. **Dialog Component:**

   - `UnsavedChangesDialog`: Reusable confirmation dialog with Save/Discard/Cancel actions
   - Supports async save operations with loading states
   - Customizable titles and descriptions for different contexts

3. **Visual Indicators:**

   - JSON Editor shows yellow pulsing dot when unsaved changes exist
   - Integrated seamlessly into the existing editor toolbar

4. **Protection Points Implemented:**

   - Browser navigation (beforeunload event)
   - Device selection changes
   - Version switching
   - Form state management with comparison logic

5. **Integration in Deployments Page:**
   - Complete integration with existing form validation
   - Proper state management for dirty state tracking
   - Context-aware dialog messages for different scenarios

**Files Modified:**

- Created: `/src/hooks/use-unsaved-changes.ts`
- Created: `/src/hooks/use-navigation-guard.ts`
- Created: `/src/hooks/use-unsaved-changes-guard.ts`
- Created: `/src/components/ui/unsaved-changes-dialog.tsx`
- Enhanced: `/src/components/ui/json-editor.tsx` (visual indicator)
- Enhanced: `/src/components/devices/device-selection-panel.tsx` (callback support)
- Enhanced: `/src/routes/deployments/index.tsx` (full integration)
- Updated: i18n files (en.json, es.json) with new translations

**Technical Implementation:**

- Follows project TypeScript and React patterns
- Uses existing UI components (AlertDialog, Button, etc.)
- Proper error handling and async operation support
- Accessibility considerations (proper ARIA labels)
- Responsive design maintained

The implementation provides comprehensive protection against data loss while maintaining a smooth user experience with clear, actionable dialogs.

<!-- SECTION:NOTES:END -->
