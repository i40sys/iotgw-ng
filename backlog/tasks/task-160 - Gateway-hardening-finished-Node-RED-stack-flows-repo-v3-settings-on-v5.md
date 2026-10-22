---
id: TASK-160
title: 'Gateway hardening + finished Node-RED stack (flows repo, v3 settings on v5)'
status: Done
assignee: []
created_date: '2026-10-22 10:21'
updated_date: '2026-10-22 10:52'
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
- [x] #1 ManagementIPs built only from management_cidrs, validated in preflight, fw4 check passes (harness)
- [x] #2 vscode and containers_exporter images pinned by tag+digest; both stacks come up in the harness
- [x] #3 No ignored fatal on a first install of any docker stack (ignored=0 in the harness)
- [x] #4 Node-RED flows repo: controller-side clone (optional read token never on the gateway), projects mode active, local editor changes kept (harness test_nodered_flows)
- [x] #5 v3 customizations audited and ported to Node-RED 5.0.9 (admin login, per-gateway credentialSecret, editor/runtime settings), checked in the harness
- [x] #6 Configuration panel actions are buttons with the same enable rules (unit tests)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done in v0.8.0**, deployed to OVH; flows 3cf4b76 (iotgw-kestra PR #1, 13/13 harness tests green in CI).

**Security findings (user action):**
- A private SSH key is committed in sabatligats/iotgw_nodered; its public key is on the sabatligats GitHub account. Revoke it.
- The sabatligats/flows.iot-gw_maq0..5 repos hold plaintext flows_cred.json (v3 had credential encryption off). Rotate those credentials.

**Open decisions:**
- The flows repos live in the private sabatligats org: use `github_org: sabatligats` plus a read-only token.
- Optional `nodered_credential_secret` so flow credentials survive a reinstall.
<!-- SECTION:NOTES:END -->
