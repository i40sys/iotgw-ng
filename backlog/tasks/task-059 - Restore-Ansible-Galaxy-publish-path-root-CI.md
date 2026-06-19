---
id: TASK-059
title: Restore Ansible Galaxy publish path (root CI)
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ansible/netmaker/.github/workflows/publish-collection.yml is dead in the monorepo (no subproject remote). Either add a root-level CI that publishes oriolrius.netmaker on a path/tag filter, or keep manual publishing documented. See decision-013 Q2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 publish path decided and documented/automated
<!-- AC:END -->
