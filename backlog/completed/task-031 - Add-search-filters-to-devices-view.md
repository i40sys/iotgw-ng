---
id: task-031
title: Add search filters to devices view
status: Done
assignee: []
created_date: "2025-09-23 05:01"
updated_date: "2025-09-24 04:04"
labels:
  - frontend
  - ui
  - enhancement
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Implement two search box filters for the devices view to improve user experience when browsing through device lists. The filters should allow users to search by network name and device name, following the same UI pattern as the existing domain filter in the networks view to maintain consistency across the application.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Users can filter devices by network name using a search input
- [x] #2 Users can filter devices by device name using a search input
- [x] #3 Filter UI matches the existing search pattern from networks view (Search icon, Input with placeholder, Clear button)
- [x] #4 Filtered results show count information (e.g., 'Showing X of Y devices')
- [x] #5 No results state displays appropriate message when filters return no matches
- [x] #6 Clear functionality resets both filters and shows all devices
- [x] #7 Filters work independently and can be combined
<!-- AC:END -->
