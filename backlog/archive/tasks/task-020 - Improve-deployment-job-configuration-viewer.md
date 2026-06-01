---
id: task-020
title: Improve deployment job configuration viewer
status: Done
assignee:
  - "@myself"
created_date: "2025-10-02 07:32"
updated_date: "2025-10-02 07:36"
labels:
  - frontend
  - enhancement
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Replace the basic alert() popup for viewing deployment configurations with a proper modal dialog similar to the debug log viewer. The current implementation shows configuration JSON in an alert box, which is not user-friendly for viewing complex JSON structures.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Create a dedicated configuration viewer modal component
- [x] #2 Modal displays JSON in a formatted, syntax-highlighted view (using Monaco editor or similar)
- [x] #3 Modal includes a header showing deployment name and version
- [x] #4 Add copy-to-clipboard button for the configuration JSON
- [x] #5 Modal is responsive and works well on mobile and desktop
- [x] #6 Replace alert() call in DeploymentJobsList with modal trigger
- [x] #7 Add proper close button and ESC key support
- [x] #8 Include i18n translations for modal UI elements
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Create DeploymentConfigViewer modal component similar to DeploymentStatusDialog\n2. Use Monaco editor (like JsonEditor) for syntax-highlighted JSON display\n3. Add modal header with deployment name and version from job data\n4. Add copy-to-clipboard functionality for the configuration\n5. Implement responsive design with proper close button and ESC key support\n6. Update DeploymentJobsList to use the modal instead of alert()\n7. Add i18n translations for all UI elements (en.json and es.json)\n8. Test the modal on both desktop and mobile
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Successfully implemented a professional configuration viewer modal to replace the basic alert() popup.

Key Changes:

1. Created DeploymentConfigViewer Component (deployment-config-viewer.tsx):

   - Modal dialog using Shadcn Dialog component
   - Monaco Editor integration for syntax-highlighted JSON display
   - Dark mode support with dynamic theme detection
   - Copy-to-clipboard functionality with user feedback (toast notifications)
   - Responsive design (max-w-4xl, max-h-90vh) that works on mobile and desktop
   - Read-only editor configuration to prevent accidental modifications
   - Proper header showing deployment name and version

2. Updated DeploymentJobsList Component:

   - Replaced alert() call with modal trigger
   - Added state management for modal (configModalOpen, selectedConfig)
   - Integrated DeploymentConfigViewer component
   - Maintained backward compatibility with onViewConfig prop
   - Fixed linting issues (void floating promises, nullish coalescing)

3. Added i18n Translations:
   - English (en.json): Full set of translations for modal UI
   - Spanish (es.json): Complete Spanish translations
   - Translation keys: title, description, readOnly, copy, copied, copiedToClipboard, copyFailed

Files Modified:

- /home/oriol/iotgw-ui/apps/app/src/components/deployment-config-viewer.tsx (new)
- /home/oriol/iotgw-ui/apps/app/src/components/deployment-jobs-list.tsx
- /home/oriol/iotgw-ui/apps/app/src/i18n/locales/en.json
- /home/oriol/iotgw-ui/apps/app/src/i18n/locales/es.json

Technical Details:

- Monaco Editor: vs-dark theme for dark mode, light theme for light mode
- Dialog: ESC key support is built-in through Shadcn Dialog component
- Close button: Explicitly added in footer with proper i18n
- Error handling: Try-catch blocks for JSON stringification and clipboard operations
- Responsive: 4xl max-width ensures good viewing on large screens, flex layout adapts to mobile
<!-- SECTION:NOTES:END -->
