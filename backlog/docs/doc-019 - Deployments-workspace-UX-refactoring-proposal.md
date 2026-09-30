---
id: doc-019
title: "019: Deployments workspace UX refactoring proposal"
type: specification
created_date: '2026-09-29 05:46'
updated_date: '2026-09-29 07:42'
---
# 019: Deployments workspace UX refactoring proposal

Status: implemented for review on `feat/deployments-ux-refactor` (task-141). This proposal supersedes the page layout and interaction rules in doc-011/doc-013 on this branch. Backend execution, authentication, SSH-CA and configuration-schema contracts remain authoritative.

## What the page actually does

This is an operator workspace for one physical gateway. It combines four distinct activities: booting a live USB and obtaining a one-time login code; installing OpenWrt onto a disk; checking the installed system after reboot; and applying service configuration through provisioning. Installation, provisioning and connectivity checks run through Kestra. Device/network inventory provisioning follows the separate backend → Supabase → netmaker-call path described in CLAUDE.md.

A configuration version is a stored document, not proof that its contents were applied to the device. Job history is the evidence of execution. Likewise, passing form validation does not mean an installation or provisioning stage has completed.

Sources inspected: the authenticated localhost page, doc-013, frontend deployment route/components, backend `routers/deployments.ts`, the shared deployment-config schema/validator, and the repository CLAUDE.md files.

## Problems found

| Before | Consequence | Proposed behavior |
| --- | --- | --- |
| A large “Basic Information” accordion mixes domain/network filters, device selection, name and notes. | The operator must understand unrelated controls before reaching the workflow. | Start by choosing a gateway. Keep its name, IP, domain and network together in a target card. |
| Changing filters can hide the active device without clearing its selected ID. | The visible inventory and execution target can disagree. | Filters exist only inside a searchable device picker; the current target stays unchanged until a device is chosen. |
| Selecting a device or entering a configuration stage can create a saved version. | Navigation has surprising database side effects. | Navigation only reads data. New devices open a local draft; save is explicit. |
| Two resets have different scopes, and the footer contains reset, delete, new version, save and execution. | Destructive and routine actions compete; “Reset” can discard the entire workspace. | Name the action “Discard edits.” Put version operations in the configuration panel and deletion behind a specific confirmation. |
| The versions rail expands unpredictably and displays rotated text when collapsed. | It steals editing space and is difficult to discover on narrow screens. | Put version selection, name, notes and saving in a dedicated Configuration view before Setup and Device activity. |
| Deploy/install implicitly updates the selected saved version before starting. | The operator cannot clearly tell what will be saved or executed. | Show a review with the exact target and configuration. If edits need saving, label the final action “Save & install” / “Save & provision.” A failed save never starts execution. |
| Installation has no target-disk acknowledgement. | A destructive operation is too easy to launch without checking the disk. | Review the device, IP, release and disk, with explicit acknowledgement of data loss. |
| The unsaved guard does not actually block router navigation; failures can be swallowed. | Edits can disappear on navigation or failed save-and-continue. | Use the router blocker, keep failed saves open, and scope draft state to the selected device. |
| Execution polling stops when the dialog closes. | Monitoring is tied to a modal’s visibility. | Poll until a terminal status, independently of the dialog; offer “View progress” and device activity. |
| A valid form says “This step is complete.” | Validation is mistaken for device state. | Say “Configuration is valid for this stage.” Stage navigation never implies completion. |

## Information architecture

```text
Deployments                                      All deployment jobs
Target: gateway name · IP · domain / network      Change device

[ Configuration: essential-config ] [ Setup ] [ Device activity ]

Configuration view                 Setup view (full width)
  Saved version                      1 Boot live USB | 2 Install OpenWrt
  Saved / unsaved / draft             3 Reboot & verify | 4 Provision services
  Name, optional notes               Purpose and instructions
  Save · version actions             Relevant fields / live connection check
                                     Validation · Previous / Next / Review

Operation progress remains available from every workspace view.

Review → validate prerequisites → save if disclosed → start → monitor
```

Configuration is the first workspace menu option, followed by Setup and Device activity. Its label reflects the current saved or draft name as it is selected or edited: “Configuration: essential-config”; unnamed drafts show “Configuration.” Setup remains the initial view and honors stage deep links. Switching views preserves the draft and selected stage without saving.

On phones, Configuration takes the first menu row and Setup and Device activity share the next. Long names are truncated visually with the full label available to assistive technology and on hover. The Configuration form is fully visible when selected at every width. Setup uses the full workspace width; all four stage labels remain visible in a two-column grid on phones. The layout uses normal page scrolling, wrapping actions, and scrollable dialogs.

## Interaction contract

- No device selected: explain the workflow, then offer one primary action, “Choose device.” Existing gateways can go directly to provisioning.
- Device picker: search name/IP/network/domain; optional domain and network filters; explicit no-results and clear-filters states.
- Device identity comes from the selected inventory record. The boot username uses that record’s network, never the picker’s current filter.
- URL `deviceId` takes priority over remembered selection. `domainId`/`networkId` without a device scope the picker. An unavailable target shows a recovery state instead of silently selecting another device.
- Device configuration state is mounted with the device ID as its key. Late requests for one device cannot populate another device’s editor.
- Select the newest saved version numerically. A device with no versions starts a draft without any backend mutation.
- Saved record metadata and JSON `name`/`version` are synchronized on save. Creating a new version reads the latest version numbers first. Custom configuration fields are preserved.
- New drafts use the shared OpenWrt/provisioning schema defaults, not the old unrelated container-service template. Execution still validates only the stage being run.
- The configuration snapshot shown in review is the one sent to execution. Background version-list refreshes do not silently replace the loaded document.
- Drafts are cached per device in this tab’s session storage. They survive reloads and route changes. The target is remembered separately in local storage; the current stage is remembered per device for the tab. Explicit `step` deep links take priority.
- A legacy cached draft is migrated only when both its selected device and its version’s device match the current target. Its old copy is retired only after successful storage of the migrated draft.
- Device/version/route changes with edits offer keep editing, discard and continue, or save and continue. Save failure preserves the dialog, target and exact draft. Browser unload also warns about edits.
- Saving a configuration never changes the gateway. Installation/provisioning require a separate review and explicit final action.
- Review lists missing IP, missing SSH key, invalid JSON, missing name and schema field problems. Installation additionally shows the release and disk and requires disk acknowledgement.
- Installation/provisioning save only when necessary and disclosed; execution uses the resulting saved version. Duplicate submissions are suppressed while starting. An operation running in this workspace disables another launch until terminal status.
- The four stages remain freely navigable. Connectivity checks are scoped separately to live boot and reboot; an earlier stage’s result cannot be shown as the later stage’s result.
- Device activity retains the existing job filters, statuses, logs and links to the full history. Completed jobs remain the source of truth for what actually ran.
- User-facing workspace strings are provided in English and Spanish. Secrets remain handled by the existing schema editor and one-time-code components; review shows no configuration secret values.

## Implementation boundaries

The former route monolith is replaced by a small inventory/target route and focused components for the workspace, picker, configuration, review and connectivity stage. `use-deployment-workspace` owns draft/version persistence; `use-deployment-execution` owns execution polling. The old action-bar component, versions rail and global settings hook are removed.

The schema-driven form/JSON editors, import support, one-time-code access, live connectivity timeline, job history and debug views are retained. No database migration, new package, backend contract change, gateway deployment or infrastructure restart is required.

## Validation and review

Run from `iotgw-ui/apps/app` with the local dev server running:

```sh
pnpm test:run
pnpm exec playwright test --config playwright.deployments.config.ts
pnpm build
pnpm exec tsc -p tsconfig.app.json --noEmit
```

The Playwright suite intercepts all external API requests with fixtures. It covers workspace-view switching without losing names, field edits or stage selection, responsive long configuration names, selection without writes, save failure, device/version/route guards, disk acknowledgement, save-before-execute ordering, continued polling after closing progress, version metadata, draft restoration, late responses, mobile/tablet widths and Spanish actions. Live-browser inspection is read-only; installation/provisioning mutations are blocked during that inspection.

The repository’s existing `typecheck` script uses `tsc --noEmit` against a solution config with an empty `files` list. Direct application checking reveals pre-existing errors in other routes, shared components and backend type inclusion. The refactor is checked against an archived copy of the base commit so new diagnostics can be distinguished from that existing backlog. Final verification on this branch:

| Check | Result |
| --- | --- |
| Frontend unit tests | 37 passed |
| Isolated browser scenarios | 13 passed |
| ESLint for changed source files | Passed |
| Prettier and git whitespace checks | Passed |
| Production frontend build | Passed; existing large-chunk warning |
| Standard workspace `pnpm typecheck` | Passed, subject to the empty application solution-config limitation above |
| Direct application TypeScript check | 118 existing diagnostics, compared with 139 at the base commit; no additional errors by file/code, and none in changed files |
| Live inspection | Authenticated desktop and phone layouts; zero mutation requests; 390 px viewport with no horizontal overflow |

The fixture suite uses its own Playwright config and is excluded from the existing live-cluster tests. No additional package is needed. Validation details are also recorded in task-141.

Review the empty state, choose an existing gateway, inspect installation and provisioning, change versions with unsaved edits, and open device activity. This branch is an implementation proposal; no installation or provisioning was run against a real gateway.

## Remaining platform limits

The backend allocates version numbers from client input and does not provide a revision token for optimistic concurrency. This refactor reads fresh version numbers and preserves the reviewed snapshot, but concurrent operators can still race while saving. Cross-session execution locks and conflict detection require a separate backend contract change; the UI’s duplicate-submit guard is scoped to the current workspace.

Monitoring resumes through existing job reconciliation after leaving the workspace or reloading. An unknown launch outcome (for example, a lost response after the server accepted an operation) directs the operator to device activity before retrying; backend idempotency would be the stronger long-term guarantee.
