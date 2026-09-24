---
id: TASK-125.02
title: Single iotgw binary with subcommands (merge iotgw-bootstrap + iotgw-status)
status: To Do
assignee: []
created_date: '2026-09-24 07:00'
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
- [ ] #1 A single static binary exposes the subcommands above
- [ ] #2 Live image boots and provisions exactly as before using the new binary (bootstrap steps + dashboard + [i])
- [ ] #3 live-image CI publishes the single binary; README updated
<!-- AC:END -->
