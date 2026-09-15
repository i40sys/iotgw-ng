---
id: TASK-101
title: 'Cleanup: resolve the stale menu.ipxe / about.ipxe edge functions'
status: Done
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-15 05:11'
labels:
  - ssh-ca
  - cleanup
  - edge-function
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
There are two copies of the iPXE boot menu and only one of them is real.

**The served one:** `assets/config/menu.ipxe` on `y0` (10.2.0.3), with `set site_name netboot.joor.net`, dated Nov 2025. This is what a PXE-booting gateway actually gets, from the `darkhttpd` container.

**The stale duplicates:** `supabase/volumes/functions/menu.ipxe/index.ts` and `about.ipxe/index.ts` in this repo, which hardcode `set site_name 10.2.0.47:8000` and are baked into the `iotgw-functions` image on every build. They are **not on the boot path**. They also differ in content, so reading the repo copy gives a wrong picture of how a gateway boots — which is exactly what happened while tracing the live-image layer for decision-023.

Either promote the edge functions to the single source of truth (y0 chains to them, and the ipxe menu becomes reviewable in git) or delete them so the repo stops implying something false.

Found adjacent to this milestone rather than as part of it — it is a correctness-of-the-map problem, not an SSH CA problem, which is why it is low priority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 There is exactly one source of truth for the iPXE menu, and it is the one actually served to a PXE-booting machine
- [x] #2 A machine still PXE-boots successfully after the change
- [x] #3 No repo file describes a boot path that is not the real one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Resolved 2026-09-15.** Deleted the stale supabase/volumes/functions/{menu.ipxe,about.ipxe} edge functions and corrected functions/CLAUDE.md.

- AC#1: single source of truth = assets/config/menu.ipxe on y0 (10.2.0.3), served by darkhttpd as netboot.joor.net/config/menu.ipxe — verified reachable this session.
- AC#2: boot path unaffected by construction — the deleted functions hardcoded site_name 10.2.0.47:8000, were not referenced by main/ dispatcher, kong, or kustomize, and were never chained from y0; the served y2 menu is unchanged and confirmed live. (No hardware PXE boot performed; the change is provably boot-path-neutral.)
- AC#3: functions/CLAUDE.md no longer lists them as served boot configs; it records they were removed and points to the real y0 menu. Other backlog docs (decision-023/025) already describe the repo copies correctly as stale duplicates.

Dockerfile.functions COPYs the whole functions/ dir, so removal just drops them from the image with no build change.
<!-- SECTION:NOTES:END -->
