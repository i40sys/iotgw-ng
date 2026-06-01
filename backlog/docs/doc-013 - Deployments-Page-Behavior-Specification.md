---
id: doc-013
title: Deployments Page Behavior Specification
type: other
created_date: '2025-12-02 06:25'
---
# Deployments Page Behavior Specification

This document describes the expected behavior of the Deployments page, including all panes, steps, and state management.

---

## Page Structure

The Deployments page has 3 main areas:

```
┌─────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENTS PAGE                         │
├─────────────────────────────────────────────┬───────────────────┤
│                                             │                   │
│  ┌─────────────────────────────────────┐   │  ┌─────────────┐  │
│  │      BASIC INFORMATION PANE         │   │  │  VERSIONS   │  │
│  │      (Accordion - collapsible)      │   │  │    PANE     │  │
│  │                                     │   │  │ (collapsible)│  │
│  │  - Domain filter                    │   │  │             │  │
│  │  - Network filter                   │   │  │  - Version  │  │
│  │  - Device selection                 │   │  │    list     │  │
│  │  - Deployment name                  │   │  │  - Default  │  │
│  │  - Description                      │   │  │    config   │  │
│  └─────────────────────────────────────┘   │  └─────────────┘  │
│                                             │                   │
│  ┌─────────────────────────────────────┐   │                   │
│  │      CONFIGURATION PANE             │   │                   │
│  │      (Accordion - collapsible)      │   │                   │
│  │                                     │   │                   │
│  │  ┌─────────────────────────────┐   │   │                   │
│  │  │  STEP TABS (1-2-3-4)        │   │   │                   │
│  │  │  1. Booting Live            │   │   │                   │
│  │  │  2. O.S. Installation       │   │   │                   │
│  │  │  3. Rebooting               │   │   │                   │
│  │  │  4. Provisioning            │   │   │                   │
│  │  └─────────────────────────────┘   │   │                   │
│  │                                     │   │                   │
│  │  [Step Content Area]               │   │                   │
│  │                                     │   │                   │
│  └─────────────────────────────────────┘   │                   │
│                                             │                   │
├─────────────────────────────────────────────┴───────────────────┤
│                    BOTTOM ACTION BAR                             │
│  [Reset] [Delete]        [New Version] [Save] [Deploy/Install]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment Steps

| Step | Name              | Purpose                       | Deploy Button                               |
| ---- | ----------------- | ----------------------------- | ------------------------------------------- |
| 1    | Booting Live      | Boot device from PXE/Live USB | DISABLED                                    |
| 2    | O.S. Installation | Install operating system      | "Install" → calls `iotgw-ng/install`     |
| 3    | Rebooting         | Wait for device reboot        | DISABLED                                    |
| 4    | Provisioning      | Configure/provision device    | "Deploy" → calls `iotgw-ng/provisioning` |

---

## Current State Behavior (AS-IS)

### On Page Load

- Load settings from localStorage (if exists)
- If URL has `?deviceId=xxx`, use URL param (takes priority)
- Initialize UI with persisted or default values

### Default State (No localStorage)

- Device: Not selected (placeholder shown)
- Domain: "All Domains"
- Network: "All Networks"
- Version: None selected
- Step: 1 (Booting Live)
- Basic Info pane: **EXPANDED**
- Configuration pane: **EXPANDED**
- Versions pane: **COLLAPSED**

### When User Selects a Device

1. Auto-select domain and network based on device
2. Versions pane: **EXPANDED**
3. Set version selection to the latest available version
4. If there is no version available create the first version with default data and select this new version
5. Load form data (name, description, JSON) from selected version
6. Select Step 1 (Booting Live)
7. Save to localStorage

### When User Clicks a Step Tab

| Going to Step         | Versions Pane | Version Auto-Select |
| --------------------- | ------------- | ------------------- |
| 1 (Booting Live)      | EXPAND        | No                  |
| 2 (O.S. Installation) | EXPAND        | No                  |
| 3 (Rebooting)         | EXPAND        | No                  |
| 4 (Provisioning)      | EXPAND        | No                  |

**Version Auto-Select Logic (Steps 2 & 4):**

1. If valid version already selected → proceed
2. If no version selected:
   - Fetch versions for device
   - If versions exist → auto-select latest (highest version number)
   - If no versions → create first version with default config; and select this version

### When User Clicks Reset Button

1. Clear localStorage
2. Clear all selections: device, domain, network, version
3. Reset form: name="", description="", JSON=default config
4. Move to Step 1
5. Collapse Versions pane
6. Expand Basic Info and Configuration panes

### Deploy/Install Button Behavior

| Step | Button State | Button Text    | Kestra Flow                     |
| ---- | ------------ | -------------- | ------------------------------- |
| 1    | ENABLED      | "Check Online" | `iotgw-ng/connectivity-check` |
| 2    | ENABLED      | "Install"      | `iotgw-ng/install`            |
| 3    | ENABLED      | "Check Online" | `iotgw-ng/connectivity-check` |
| 4    | ENABLED      | "Deploy"       | `iotgw-ng/provisioning`       |

---

## Data Persistence (localStorage)

**Key:** `iotgw-deployment-settings`

**Persisted Values:**

```typescript
{
  // Selections
  selectedDeviceId?: string;
  selectedDomainId?: string;
  selectedNetworkId?: string;
  selectedVersion?: DeploymentVersion;
  
  // Form data
  formName: string;
  formDescription: string;
  configurationJson: string;
  
  // UI state
  activeDeploymentStep: "booting-live" | "os-installation" | "rebooting" | "provisioning";
  isVersionsPanelCollapsed: boolean;
  accordionValue: string[]; // ["basic-info"] or ["basic-info", "configuration"]
}
```

## Component Files

| Component      | File Path                                                             |
| -------------- | --------------------------------------------------------------------- |
| Main Page      | `apps/app/src/routes/deployments/index.tsx`                         |
| Actions Panel  | `apps/app/src/components/deployment-actions-panel.tsx`              |
| Step Tabs      | `apps/app/src/components/deployment-step-tabs.tsx`                  |
| Version List   | `apps/app/src/components/version-list-panel.tsx`                    |
| Settings Hook  | `apps/app/src/hooks/use-deployment-settings.ts`                     |
| Booting Step   | `apps/app/src/components/deployment-steps/booting-live-step.tsx`    |
| Install Step   | `apps/app/src/components/deployment-steps/os-installation-step.tsx` |
| Rebooting Step | `apps/app/src/components/deployment-steps/rebooting-step.tsx`       |
