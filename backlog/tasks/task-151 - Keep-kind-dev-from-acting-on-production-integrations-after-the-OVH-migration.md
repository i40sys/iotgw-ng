---
id: TASK-151
title: Keep kind (dev) from acting on production integrations after the OVH migration
status: To Do
assignee: []
created_date: '2026-09-29 15:06'
labels:
  - kind
  - safety
  - ovh
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** Since task-142, OVH is the real environment, but kind still holds a copy of the same data and the same credentials: its DB triggers call the real Netmaker (`netmaker-call`), its backend creates real pki-manager zones, and its Kestra (scaled to 0 by hand) would resume the schedules (connectivity-check, ssh-ca-renewal, namespace sync) against real gateways on the next `just k8s-deploy`. Two environments driving the same Netmaker / pki-manager / gateways can create duplicates or undo each other.

**Direction:** make kind explicitly dev-safe — e.g. dev-only credentials or disabled integrations (Netmaker, pki-manager, device-API exposure), Kestra schedules disabled in kind, dev seed data instead of the production copy — and document it in deploy/README.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kind cannot create/modify real Netmaker networks or extclients (dev credentials or integration disabled)
- [ ] #2 kind Kestra schedules are disabled by configuration, not by a manual scale-down, and survive just k8s-deploy
- [ ] #3 kind uses dev data/seeds, not the production copy; documented in deploy/README.md
<!-- AC:END -->
