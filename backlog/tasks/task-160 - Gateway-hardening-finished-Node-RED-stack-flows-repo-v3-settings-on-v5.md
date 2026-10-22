---
id: TASK-160
title: 'Gateway hardening + finished Node-RED stack (flows repo, v3 settings on v5)'
status: To Do
assignee: []
created_date: '2026-10-22 10:21'
labels:
  - provisioning
  - nodered
  - security
  - ui
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Scope (v0.8.0):** follow-ups from the 2026-10-22 review.

- **Firewall:** the management allow-list comes only from the deployment (`management_cidrs`); the hard-coded 10.2.0.47/32 is gone.
- **Pins:** code-server and containers_exporter are pinned by tag and digest instead of `:latest`.
- **Log noise:** no red, ignored `fatal: … is not a directory` on a first install.
- **Node-RED:** the flows-repo path is finished, without any credential on the gateway; the v3 customizations are audited and ported to v5.
- **UI:** the Configuration panel's "⋯" actions are now buttons at the bottom of the panel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ManagementIPs built only from management_cidrs, validated in preflight, fw4 check passes (harness)
- [ ] #2 vscode and containers_exporter images pinned by tag+digest; both stacks come up in the harness
- [ ] #3 No ignored fatal on a first install of any docker stack (ignored=0 in the harness)
- [ ] #4 Node-RED flows repo: controller-side clone (optional read token never on the gateway), projects mode active, local editor changes kept (harness test_nodered_flows)
- [ ] #5 v3 customizations audited and ported to Node-RED 5.0.9 (admin login, per-gateway credentialSecret, editor/runtime settings), checked in the harness
- [ ] #6 Configuration panel actions are buttons with the same enable rules (unit tests)
<!-- AC:END -->
