---
id: TASK-125.02
title: Single iotgw binary with subcommands (merge iotgw-bootstrap + iotgw-status)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 07:00'
updated_date: '2026-09-24 09:19'
labels:
  - live-image
  - openwrt
dependencies: []
parent_task_id: TASK-125
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**decision-032 §1.** One binary, one release, one pinned version.

- Subcommands (final names during implementation): `status`, `daemon`, `vpn status|refresh`, `ssh status|refresh`, `internet lan|vpn|auto`, `hold enable|disable`.
- Live image keeps working: `iotgw-bootstrap` / `iotgw-status` become modes (compat aliases/symlinks allowed).
- Reuse `internal/*`; CI still publishes a static x86_64 build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single static binary exposes the subcommands above
- [ ] #2 Live image boots and provisions exactly as before using the new binary (bootstrap steps + dashboard + [i])
- [ ] #3 live-image CI publishes the single binary; README updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented.** `cmd/iotgw` + `internal/cli`: one static binary; subcommands status, daemon, vpn status|refresh, ssh status|refresh, internet lan|vpn|auto, hold enable|disable|status, bootstrap, version. Invoked as `iotgw-bootstrap` / `iotgw-status` (argv[0], symlinks in the live overlay) it behaves like the former binaries.

**Verified:** unit tests (cli dispatch/usage), `just dist` builds iotgw-linux-{amd64,arm64} + overlays with the symlinks; README updated.

**Pending:**
- AC#2: not yet booted on a real live image (needs `just deploy-stage` on the netboot host). The live code path is unchanged apart from the shared devapi/wgconf packages and the BusyBox-safe `ip route` parsing.
- AC#3: CI publishing verified only once main is pushed.
<!-- SECTION:NOTES:END -->
