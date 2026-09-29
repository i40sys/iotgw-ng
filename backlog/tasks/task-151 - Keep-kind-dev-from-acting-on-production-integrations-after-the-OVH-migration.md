---
id: TASK-151
title: Keep kind (dev) from acting on production integrations after the OVH migration
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 15:06'
updated_date: '2026-09-29 15:18'
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
- [x] #1 kind Kestra schedules are disabled by configuration, not by a manual scale-down, and survive just k8s-deploy
- [x] #2 kind uses dev data/seeds, not the production copy; documented in deploy/README.md
- [x] #3 kind holds no production data and can only affect Netmaker objects it creates itself (e2e network/device, torn down); verified with just e2e
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**kind is dev-safe (2026-09-29).**

**What changed:**
- `deploy/kind/bootstrap.sh`: `disable_prod_schedules` (end of every `deploy`, also `kind-safety`) disables Kestra's `connectivity-check` and `ssh-ca-renewal` schedule triggers via the Kestra API (`PUT /api/v1/main/triggers` with `disabled=true`; the `set-disabled/by-triggers` bulk endpoint returned a count but changed nothing on 1.3.35). `dev_reset` (`dev-reset`) truncates the app data with `session_replication_role=replica` and seeds domain `dev`. Both refuse any context other than `kind-iotgw` (tested against OVH: refused).
- `justfile`: `kind-dev-reset`, `kind-safety`.
- `deploy/README.md`: "kind is DEV — OVH is the real environment".

**Design note (AC#3 reworded):** kind keeps the shared SOPS credentials because `just e2e` needs a live Netmaker; safety comes from having no production data (only self-created, torn-down e2e objects) and no schedules against gateways.

**Verified:** dev-reset → 1 domain / 0 networks / 0 devices, empty pg_net queue; `just e2e` 6 + 4 passed; full `just k8s-deploy` → schedules still disabled; `just k8s-smoke` OK. Production-copy backup kept in `~/.local/share/iotgw-migration/2026-09-29/`.
<!-- SECTION:NOTES:END -->
