---
id: TASK-073
title: >-
  Resolve decision-028 §7: fate of devices.ssh_key_id and the shared
  /root/.ssh/id_rsa
status: To Do
assignee: []
created_date: '2026-09-14 05:28'
updated_date: '2026-09-14 07:35'
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
- [ ] #1 Each of the twelve key_file references is classified as a live remote docker connection or inert config, by inspection on a real gateway
- [ ] #2 decision-028 §7 records the chosen option for the KMS key and its status flips to DECIDED
- [ ] #3 decision-010 is amended or explicitly superseded for the parts the choice invalidates
- [ ] #4 The decision is applied to both playbook copies, preserving their intentional divergence
<!-- AC:END -->
