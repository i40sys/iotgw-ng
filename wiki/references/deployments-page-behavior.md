---
title: Deployments Page Behavior
category: references
tags: [app/frontend, provisioning/openwrt, orchestration/kestra, status/current]
sources:
  - backlog/docs/doc-013 - Deployments-Page-Behavior-Specification.md
  - backlog/docs/doc-011 - Deployment-Section-Redesign-Interface-Specification.md
  - backlog/archive/tasks/task-001 - Create-database-schema-for-deployments-table.md
relationships:
  - target: "[[entities/kestra]]"
    type: uses
summary: The four-step deployment wizard (Booting Live → OS Install → Rebooting → Provisioning), its button→Kestra-flow mapping, and the localStorage-persisted state model.
provenance:
  extracted: 0.9
  inferred: 0.03
  ambiguous: 0.07
base_confidence: 0.55
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Deployments Page Behavior

The Deployments page is a **four-step wizard** guiding a device through its
deployment lifecycle, with a collapsible Versions pane. Buttons trigger Kestra
OpenWRT flows ([[entities/kestra]]).

## Steps → Kestra flow mapping

| Step | Name | Button | Kestra flow |
|---|---|---|---|
| 1 | Booting Live | "Check Online" | `iotgw-ng/connectivity-check` |
| 2 | O.S. Installation | "Install" | `iotgw-ng/install` |
| 3 | Rebooting | "Check Online" | `iotgw-ng/connectivity-check` |
| 4 | Provisioning | "Deploy" | `iotgw-ng/provisioning` |

- **Step 1 (Booting Live):** USB image + boot instructions; credentials = username
  `device_name@network_id[:8]`, password = TOTP (reuses `DeviceTOTPDialog`,
  [[concepts/totp-device-vpn-auth]]).
- **Steps 2 & 4** have a FORM/JSON toggle (Monaco editor) over a shared
  deployment JSON; the Versions pane auto-expands.

## State (localStorage)

Key `iotgw-deployment-settings`. Persists selections (device/domain/network/version),
form data (name/description/configurationJson), and UI state (active step,
Versions-pane collapse, accordion). On load, a URL `?deviceId=` param takes
priority over persisted state. Selecting a device auto-selects its domain/network,
expands the Versions pane, and auto-selects the latest version (creating a first
default version if none exists).

## Key component files

`apps/app/src/routes/deployments/index.tsx`,
`components/deployment-actions-panel.tsx`, `deployment-step-tabs.tsx`,
`version-list-panel.tsx`, `hooks/use-deployment-settings.ts`,
`components/deployment-steps/*`.

## Implementation history

The deployments table, the wizard, and the `deployment_jobs` tracking were built
in the archived `task-001..021` epic ([[synthesis/deployments-feature-history]]);
`deployment_jobs` is the precedent the `network_jobs`/`device_jobs` schema mirrors.

## Sources

- doc-013 (behavior spec), doc-011 (redesign interface spec); archive/tasks/task-001..021.
- Related: [[entities/kestra]], [[concepts/totp-device-vpn-auth]], [[concepts/iotgw-ui-architecture]], [[synthesis/deployments-feature-history]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/docs/doc-013 - Deployments-Page-Behavior-Specification|doc-013 - Deployments-Page-Behavior-Specification]]
- [[_sources/docs/doc-011 - Deployment-Section-Redesign-Interface-Specification|doc-011 - Deployment-Section-Redesign-Interface-Specification]]
- [[_sources/archive/tasks/task-001 - Create-database-schema-for-deployments-table|task-001 - Create-database-schema-for-deployments-table]]
