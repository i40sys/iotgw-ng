---
id: TASK-101
title: 'Cleanup: resolve the stale menu.ipxe / about.ipxe edge functions'
status: To Do
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 There is exactly one source of truth for the iPXE menu, and it is the one actually served to a PXE-booting machine
- [ ] #2 A machine still PXE-boots successfully after the change
- [ ] #3 No repo file describes a boot path that is not the real one
<!-- AC:END -->
