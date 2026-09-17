---
id: TASK-073
title: >-
  Resolve decision-028 §7: fate of devices.ssh_key_id and the shared
  /root/.ssh/id_rsa
status: In Progress
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-17 09:31'
labels:
  - ssh-ca
  - decision
  - kms
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-028-ssh-ca-open-security-and-architecture-decisions.md
  - >-
    backlog/decisions/decision-023-ssh-ca-migration-current-state-analysis-of-gateway-ssh-access.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two loose ends that have to be resolved together, because the answer to one changes the other.

**(1) The per-device Cosmian KMS key does nothing today.** decision-010 mints an Ed25519 key per device (`device_ssh_<id>`) and task-069 makes the Kestra runner fetch it as `keys/id_rsa` — but **nothing ever installs its public half into any gateway's `authorized_keys`**. decision-010's "3. Deploy to device" step was specified and never built. The flows only work because `keys/id_rsa` falls back to a personal key when `SSH_KEY_ID` is empty.

**(2) The shared `/root/.ssh/id_rsa` is load-bearing.** Twelve task files (`dockge`, `nodered`, `telegraf`, `firewall`, `vscode`, `duplicati`, `netxms-agent`, `uptime-kuma`, `plc_sniffer`, `observability`, `containers_exporter`, `glpi-agent`) reference it as a `key_file:` for `community.docker`. Whether those are live connections or vestigial config is **unverified** — and until it is, the shared key cannot be removed.

**How to do the inventory** (the previous wording said "inventory it" without saying how): on a real gateway, check whether each of those docker operations targets a remote host at all, or whether `key_file` is inert because the connection is over the local socket. `grep -n 'key_file' tasks/*.yaml` gives the list; the `docker_host`/`tlsverify` settings next to each one say whether a key is actually used.

**Options for the KMS key:** retire it (the runner moves to an `iotgw-ops` certificate); repurpose it as the gateway's **outbound** identity, replacing the shared key — which is what would finally remove decision-023 R1; or keep it as a per-device break-glass inbound key.

**Note the repo divergence:** the Kestra copy of `tasks/system.yaml` already gates the shared-key deployment behind `deploy_shared_ssh_key | default(false)`, the `owrt_iot_gw` copy does not. Whatever is decided must be applied to both, deliberately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the twelve key_file references is classified as a live remote docker connection or inert config, by inspection on a real gateway
- [x] #2 decision-028 §7 records the chosen option for the KMS key and its status flips to DECIDED
- [x] #3 decision-010 is amended or explicitly superseded for the parts the choice invalidates
- [ ] #4 The decision is applied to both playbook copies, preserving their intentional divergence
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Decision 2026-09-15 (decision-028 §7):** A+B — runner moves to iotgw-ops user cert (A); KMS per-device key repurposed as the gateway OUTBOUND identity replacing shared credentials/id_rsa (B); removes R1. Option C rejected. §7 → DECIDED. Open: AC#1 inventory the 12 key_file consumers on a real gateway; AC#3 amend/supersede decision-010; AC#4 apply to both playbook copies.

**AC#1 done 2026-09-16 — inventory complete; the task's premise was wrong.** The 14 `key_file: /root/.ssh/id_rsa` references (across dockge, nodered ×2, telegraf, firewall, vscode, duplicati, netxms-agent, uptime-kuma, plc_sniffer, observability, containers_exporter, glpi-agent, mosquitto) are **NOT `community.docker` connection keys** — there are ZERO of those and no `docker_host`/`tlsverify`/`ssh://` anywhere. All 14 are **`ansible.builtin.git` clone deploy keys**: the shared key is the gateway's **OUTBOUND** identity to `git clone` ~13 private `github.com/example-org/iotgw_*` repos (dockge, nodered, telegraf, bridge-nft, alloy, mosquitto, vscode, duplicati, netxms, uptime-kuma, plc_sniffer, containers-exporter, glpi-agent) during provisioning. So none are "inert" and none are "remote docker" — they are all **live outbound git-clone keys**. The determinant is static (the module is `ansible.builtin.git`), so there is no runtime ambiguity a live-gateway run would resolve. This confirms §7-B: repurposing the per-device KMS key as the gateway's git deploy key replaces exactly these uses and removes decision-023 R1.

**AC#3 done 2026-09-16** — `decision-010` amended: its "3. Deploy to device → authorized_keys" step is superseded (never built; inbound access is now certificate-based per decision-024) and the KMS key is redirected to the OUTBOUND git-deploy-key role per §7-B.

**AC#4 reframed (still open):** the task's "both playbook copies, preserving their intentional divergence" is now STALE — the `owrt_iot_gw` copy no longer exists; the authoritative playbooks are the `github.com/i40sys/iotgw-kestra` repo (the monorepo `kestra/data/main/iotgw-ng/_files/` is a stale write-through mirror). The shared-key DEPLOYMENT in `tasks/system.yaml` is already gated behind `deploy_shared_ssh_key | default(false)`. The remaining SUBSTANTIVE work (real implementation, external deps — not a doc close): (a) register each device's KMS public key as a **deploy key** on the ~13 `example-org/iotgw_*` repos (or one shared iotgw deploy key), and (b) switch the 14 `ansible.builtin.git` tasks off `/root/.ssh/id_rsa` to the per-device KMS key already fetched as `keys/id_rsa` (task-069). This touches real gateway provisioning + example-org GitHub, so it is tracked as the open implementation, not closed here.
<!-- SECTION:NOTES:END -->
