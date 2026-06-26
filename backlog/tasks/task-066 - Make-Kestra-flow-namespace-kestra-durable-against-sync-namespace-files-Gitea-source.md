---
id: TASK-066
title: >-
  Make Kestra flow namespace:kestra durable against sync-namespace-files (Gitea
  source)
status: Done
assignee: []
created_date: '2026-06-23 05:50'
updated_date: '2026-06-25 15:27'
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
- [x] #1 Confirmed whether sync-namespace-files reverts the flow PodCreate namespace from the Gitea source
- [ ] #2 If it does: the namespace:kestra change is pushed to git.oriolrius.cat/oriolrius/iotgw-kestra and a sync run leaves the live flows on namespace:kestra
- [x] #3 Re-scoped (sync does NOT revert — verified): align the canonical Gitea source git.oriolrius.cat/oriolrius/iotgw-kestra to the live state — set PodCreate namespace:kestra (was iotgw) in connectivity-check-flow.yaml, install-flow.yaml, Flow.yaml, ideally bundled with the TASK-065 leading-slash inputFiles fix in one commit.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-06-25 (reframed per the workflow assessment).**

**AC#1 — verified: sync-namespace-files does NOT revert flow definitions.** It runs only `io.kestra.plugin.git.SyncNamespaceFiles` (file blobs); no `SyncFlows` task exists; flows load from Postgres. Three daily syncs (06-23/24/25) post-dated the live namespace change and the flow stayed rev 2 / `namespace: kestra`. So the original "urgent revert" risk is empirically false; AC#2 (conditional on a revert) is moot.

**AC#3 (reframed, the real residual) — done:** aligned the canonical Gitea source `git.oriolrius.cat/oriolrius/iotgw-kestra` to the live state. Set PodCreate `namespace: iotgw -> kestra` in connectivity-check-flow.yaml, install-flow.yaml, Flow.yaml (+ a decision-020 explanatory comment). Surgical: flow-namespace and DownloadFiles-namespace (`iotgw-ng`) untouched; the leading-slash `inputFiles` (TASK-065) intentionally NOT changed — left for separate research per the owner's call.

**Commit:** gitea `c7690d0` ("fix(flows): set PodCreate namespace iotgw -> kestra (align with live cluster)"), pushed to `main` (was `31e561c`). Verified by fresh re-clone: HEAD=c7690d0, zero remaining `namespace: iotgw` lines. No live Kestra DB change needed (already `kestra` rev 2); no sync re-run required.

Closes the source-of-truth divergence footgun (a future SyncFlows / manual import / DB rebuild can no longer deploy runner pods into the deleted `iotgw` namespace).
<!-- SECTION:NOTES:END -->
