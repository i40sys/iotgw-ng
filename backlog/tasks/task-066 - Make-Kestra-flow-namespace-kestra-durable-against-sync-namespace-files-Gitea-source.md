---
id: TASK-066
title: >-
  Make Kestra flow namespace:kestra durable against sync-namespace-files (Gitea
  source)
status: To Do
assignee: []
created_date: '2026-06-23 05:50'
labels:
  - kestra
  - durability
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During task-064.07 the live Kestra flows (install/connectivity-check/provisioning) had their PodCreate 'namespace: iotgw' updated to 'namespace: kestra' via the Kestra API (PUT /api/v1/flows/iotgw-ng/*), and the local kestra/data/main/iotgw-ng/_files/*.yaml copies were edited. The canonical Gitea source repo git.oriolrius.cat/oriolrius/iotgw-kestra was NOT updated. Verify whether the sync-namespace-files flow re-registers/overwrites these flows from the Gitea source on its next run (daily 6 AM / webhook); if so, push the namespace:kestra change to the Gitea repo so the live flows are not reverted to the now-deleted iotgw namespace.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Confirmed whether sync-namespace-files reverts the flow PodCreate namespace from the Gitea source
- [ ] #2 If it does: the namespace:kestra change is pushed to git.oriolrius.cat/oriolrius/iotgw-kestra and a sync run leaves the live flows on namespace:kestra
<!-- AC:END -->
