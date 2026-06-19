---
id: TASK-058
title: Decide git history scrub vs rotation before first remote push
status: To Do
assignee: []
created_date: '2026-06-12 22:15'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The consolidated repo history (commits 9d325f5/e56d1f5) still contains the old Traefik TLS key and redacted WireGuard keys. The repo has no remote yet. Before pushing, either rotate those secrets (decision-014) so the blobs are worthless, or rewrite history with git-filter-repo/BFG. See decision-013 Q6 and decision-014.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision recorded
- [ ] #2 if push planned, history handled
<!-- AC:END -->
