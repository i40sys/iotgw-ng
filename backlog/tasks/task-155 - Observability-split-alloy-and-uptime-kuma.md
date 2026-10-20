---
id: TASK-155
title: 'Observability: split alloy and uptime-kuma'
status: Done
assignee: []
created_date: '2026-10-19 04:55'
updated_date: '2026-10-20 04:45'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Goal.** The `observability` provisioning stack mixed Grafana Alloy and Uptime Kuma. Split them into two tags, and make Uptime Kuma generic: monitor only the gateway's own services, not third-party ones (cloud, factory and internet groups).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Uptime Kuma has its own tag (uptime-kuma) and flag (uptime_kuma); observability is Alloy + the containers exporter
- [x] #2 Uptime Kuma monitors only the gateway's own services; the cloud, factory and internet groups and their fields are removed
- [x] #3 The stack deploys without the missing data_clean.tar.gz (admin created from the deployment's credentials)
- [x] #4 UI schema, stored deployments and preflight agree on the new contract
- [x] #5 Rolled out to OVH (release) and the iotgw-kestra change pushed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — released in v0.6.6 and rolled out to OVH (2026-10-20).**

**iotgw-kestra `1b59dec` (pushed at rollout):**
- `tasks/uptime-kuma.yaml` — own tag; starts kuma empty, `contrib/bootstrap-admin.js` creates the admin via Kuma's setup socket API, then AutoKuma
- `files/stacks/uptime/` — gateway-only monitors (containers, DNS, MQTT port, Alloy); pinned kuma 1.23.17 + autokuma `uptime-kuma-v1-2.0.0` (plain 2.x needs Kuma 2)
- `metrics.alloy.j2` — Kuma scrape only when `uptime_kuma` is on, with the admin login
- `tasks/preflight.yaml` — new contract entry and password checks

**Monorepo:** schema group/flag/fields + example + tests (`dcc02da`, `703da3a`), migration `20261020010000_split_uptime_kuma_from_observability.sql` applied on OVH, release `6588cd7`, deploy commit on main.

**Verified:** local Docker run of the stack (admin, monitors, /metrics auth); playbook syntax check; UI/backend tests; OVH snapshot ready; live bundle has the new fields; stored configs have no leftover keys.

**Not verified:** a run on a real gateway.
<!-- SECTION:NOTES:END -->
