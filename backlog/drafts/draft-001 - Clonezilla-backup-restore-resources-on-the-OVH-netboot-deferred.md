---
id: DRAFT-001
title: Clonezilla backup/restore resources on the OVH netboot (deferred)
status: To Do
assignee: []
created_date: '2026-09-29 14:18'
updated_date: '2026-09-29 14:40'
labels:
  - netboot
  - clonezilla
dependencies: []
parent_task_id: TASK-149
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Deferred by the user (2026-09-29).** The Clonezilla resources on y0 — `boot.tgz`, the per-machine `<maquina_id>.tgz` (m0, m5, esade10, …), the image repository mount points and the `/etc/rc.local` run — are **not migrated for a while**.

**Interim behaviour (done in TASK-149.02):** the OVH `menu.ipxe` keeps the `backup` / `restore` / `clonezilla-debian` entries, but the resource wiring is **commented out** with a pointer to this task:
- `ocs_preload1` (`boot.tgz`) and `ocs_preload2` (`<maquina_id>.tgz`), the `ocs_live_run="sudo /etc/rc.local"` hook, and any repository mount / `ocs_prerun` for the image store.
- The entries are therefore **expected to fail** (Clonezilla boots without its scripts / image repository). This is accepted.

**When resumed:**
- Inventory what `boot.tgz` / `<id>.tgz` contain (scripts, repository location, credentials); nothing secret in public artifacts or URLs.
- Decide where the disk images live and how customer sites reach them.
- Move secret-free scripts into the repo, serve them from the OVH netboot, uncomment the menu wiring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Contents of boot.tgz and per-machine tgz inventoried; secrets kept out of public artifacts
- [ ] #2 Clonezilla resources served from OVH and the commented menu wiring re-enabled
- [ ] #3 Backup and restore run from the OVH menu; restore keeps its confirmation prompt
<!-- AC:END -->
