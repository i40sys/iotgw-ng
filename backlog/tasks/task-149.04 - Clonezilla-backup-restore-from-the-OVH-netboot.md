---
id: TASK-149.04
title: Clonezilla backup/restore from the OVH netboot
status: To Do
assignee: []
created_date: '2026-09-29 14:18'
labels:
  - netboot
  - clonezilla
dependencies: []
parent_task_id: TASK-149
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What.** Keep the Clonezilla `backup` / `restore` / `clonezilla-debian` entries working when served from OVH. Today they preload `http://netboot.joor.net/boot.tgz` and `<maquina_id>.tgz` (m0, m5, esade10, …) from y0 and run `/etc/rc.local`.

**To resolve:**
- What `boot.tgz` / `<id>.tgz` contain (scripts, image-repository location, credentials) — anything secret must not end up in a public artifact or a public URL.
- Where the disk images live and whether they are reachable from customer sites (they are not served by netboot).
- Move the preload scripts into the repo (secret-free) and serve them from the OVH netboot; per-machine data stays private.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Contents of boot.tgz and per-machine tgz inventoried; secrets moved out
- [ ] #2 Backup and restore run from the OVH menu against the image repository
- [ ] #3 Destructive restore keeps its confirmation prompt
<!-- AC:END -->
