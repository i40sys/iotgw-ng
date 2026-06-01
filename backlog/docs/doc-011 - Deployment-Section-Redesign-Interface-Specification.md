---
id: doc-011
title: Deployment Section Redesign - Interface Specification
type: other
created_date: '2025-11-26 06:26'
---
# Deployment Section Redesign Specification

## Overview

Transform the Deployment section from a single configuration view into a **four-step wizard** guiding users through the device deployment lifecycle.

## Page Structure

### Layout
- **Main Area (Left)**: Four sequential steps displayed as tabs within the current "Configuration" pane
- **Versions Pane (Right)**: Collapsible panel, collapsed by default, auto-expands for steps 2 and 4

### Four Deployment Steps

1. **Booting Live** - Prepare device for OS installation
2. **Operating System Installation** - Configure and install OpenWRT
3. **Rebooting** - Verify successful boot from installed OS  
4. **Provisioning & Configuration Management** - Apply software configuration

## Shared Requirements

All steps:
- Access the same deployment JSON
- Can write updates back to the JSON
- Steps 2 and 4 have FORM/JSON toggle using react-hook-form

---

## Step 1: Booting Live

### Purpose
Ensure device is running in live mode from USB so OS can be installed.

### UI Elements

1. **Instruction Text Block**:
   - Download USB image instructions
   - Write to USB pendrive using standard tools (Etcher, Rufus)
   - Boot device from USB
   - Credentials display:
     - Username: `device_name@network_id[:8]`
     - Password: TOTP (reuse existing DeviceTOTPDialog component logic)
   - Note about regenerating TOTP if credentials fail

2. **Check Online Button**:
   - Performs connectivity check
   - Shows green tick icon on success (with tooltip showing PING result)
   - Shows red cross icon on failure (with tooltip showing error details)
   - Tooltip content includes:
     - PING test result
     - Ansible connection result

3. **USB Boot Images Section**:
   - Download link for the USB image

---

## Step 2: Operating System Installation

### Purpose
Define where and how the operating system will be deployed.

### UI Elements

1. **Form Fields** (both required):
   - OpenWRT version (default: `23.05.4`)
   - Target Disk (default: `/dev/nvme0n1`)

2. **Help Section** - Target Disk Reference Table:
   | Device | Usage |
   |--------|-------|
   | `/dev/sda` | Legacy SCSI/SATA, some VMs |
   | `/dev/nvme0n1` | NVMe PCIe SSD |
   | `/dev/mmcblk0` | eMMC storage |
   | `/dev/vda` | KVM/QEMU virtio |
   | `/dev/xvda` | Xen paravirtualized |
   | `/dev/hda` | Legacy IDE/PATA |

3. **FORM/JSON Toggle**:
   - Switch between form mode and raw JSON editor
   - Versions pane auto-expands when JSON mode active
   - JSON editor uses existing Monaco-based editor

### Data Handling
- Values stored in shared deployment JSON structure
- Form populates from JSON and writes back to JSON
- Uses react-hook-form for form state management

---

## Step 3: Rebooting

### Purpose
Confirm device boots correctly into newly installed OS.

### UI Elements

1. **Instructions Text Block**:
   - Remove the USB pendrive
   - Boot from disk (usually default behavior)
   - Click "Check System Online" button after boot

2. **Check System Online Button**:
   - Same behavior as Step 1's Check Online button
   - Shows connectivity status with tooltips

---

## Step 4: Provisioning & Configuration Management

### Purpose
Apply software and configuration provisioning.

### Current Implementation

1. **FORM/JSON Toggle**:
   - Form mode shows "Under construction" message
   - JSON mode shows existing Monaco-based editor

2. **Version History Access**:
   - Versions pane auto-expands
   - Full access to deployment version history

### Future Expansion
Form mode will eventually provide guided UI for provisioning configuration.

---

## Technical Requirements

### Backend
- New tRPC procedure for device connectivity check (ping + Ansible)
- Returns structured result with ping output and ansible output

### Frontend
- react-hook-form integration for form handling
- Form-to-JSON and JSON-to-form conversion
- Reuse DeviceTOTPDialog logic for credentials display
- Tab-based step navigation within existing accordion
- Conditional Versions pane expansion based on active step

### Existing Components to Reuse
- `DeviceTOTPDialog` - TOTP generation logic
- `JsonEditor` - Monaco-based JSON editor
- `VersionListPanel` - Version selection panel
- `Switch` UI component - For FORM/JSON toggle
- `Form` components - react-hook-form integration
