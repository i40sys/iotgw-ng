---
id: TASK-093
title: >-
  Kestra/Ansible: verify gateway host certificates instead of
  StrictHostKeyChecking=no
status: To Do
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-16 08:00'
labels:
  - ssh-ca
  - kestra
  - ansible
  - security
milestone: m-1
dependencies:
  - TASK-089
  - TASK-097
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn on host verification for flows that talk to **provisioned gateways**, now that those gateways present host certificates.

**What disables it today, in five places:** `templates/inventory.j2`, and the generated inventories inside `Flow.yaml` (provisioning), `install-flow.yaml` and `connectivity-check-flow.yaml` — all carry `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`. The provisioning flow's **bastion `ProxyCommand`** carries the same flags a second time, for the hop through `216.45.62.117`, and that one is easy to miss.

**What to do instead:** generate a `known_hosts` file carrying the zone's `@cert-authority` line (the `ssh-ca` edge function already returns a ready-made `cert_authority` string in its bundle), write it alongside the inventory, and set `StrictHostKeyChecking=yes -o UserKnownHostsFile=<that file>`.

**The connect name has to match a certificate principal**, or verification falls back to TOFU and silently gains nothing. The inventory addresses gateways by IP; the edge function includes the IP as a host principal *for now*, but whether it stays is an open decision. So either set `HostKeyAlias` to the certified FQDN, or depend on that decision. `HostKeyAlias` is the more robust choice and is already the pattern in the operator `~/.ssh/config`.

**The bastion is a separate problem.** `216.45.62.117` is not an iotgw-ng gateway and has no certificate from our Host CA, so it cannot be verified this way. Decide explicitly whether it gets a pinned host key, its own certificate, or keeps TOFU with that documented — do not leave it silently disabled and call the task done.

**Out of scope:** the live-boot phase keeps TOFU until decision-028 §5 is resolved. Make that explicit in the flow rather than letting it fall out of a global flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flow against a provisioned gateway verifies its host certificate, and fails if the certificate is absent, expired or wrong
- [ ] #2 The connect name matches a certificate principal, verified by observing that no TOFU fallback occurred
- [x] #3 The bastion hop's verification posture is an explicit, documented choice
- [x] #4 The live-boot phase's TOFU is explicit in the flow, not a side effect of a global flag
- [x] #5 All five StrictHostKeyChecking=no sites are accounted for, including the ProxyCommand
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**2026-09-16 (i40sys/iotgw-kestra d7c57cd) — postures made explicit + verify primitive added; verification mechanism proven.**

- AC#5 (all sites accounted): templates/inventory.j2, Flow.yaml gateway hop, Flow.yaml bastion ProxyCommand, install-flow.yaml, connectivity-check-flow.yaml, network_reachability.yml — all 6 StrictHostKeyChecking=no sites now carry an explicit, documented posture.
- AC#4: install-flow TOFU is documented as intentional (live-boot phase, decision-028 §5).
- AC#3: bastion ProxyCommand (VPN_JUMP_HOST) TOFU is an accepted, documented choice (not our gateway, no cert from our Host CA); network_reachability VPN-server hop same.
- templates/inventory.j2 is now VERIFY-CAPABLE: given host_ca_known_hosts + cert_fqdn it emits StrictHostKeyChecking=yes + UserKnownHostsFile + GlobalKnownHostsFile=/dev/null + HostKeyAlias (no TOFU fallback); else documented TOFU. Both branches render-tested.
- **AC#1/#2 mechanism PROVEN** against the enrolled canary (direct ssh): correct @cert-authority + HostKeyAlias connects with 0 known_hosts pins; a WRONG CA fails ("No matching CA found. Retry with plain key" -> "Host key verification failed"). GlobalKnownHostsFile=/dev/null is required for isolation.

**AC#1/#2 not yet ticked**: no flow yet FETCHES the domain Host CA + certified FQDN to build the known_hosts and pass host_ca_known_hosts/cert_fqdn (connectivity-check + post-enroll provisioning). Deliberately not shipped untested to the real-fleet flows — needs that wiring + a Kestra run against an enrolled gateway (safe target: the lab canary 10.2.0.210, adapting away the bastion). Left as the closing step.

**2026-09-16 (i40sys/iotgw-kestra f91169a) — connectivity-check wired to verify; AC#1/#2 wiring shipped, Kestra validation run pending.**

- **connectivity-check** is the verifying flow (it runs against a PROVISIONED+ENROLLED gateway; provisioning is where the gateway enrolls pre-cert, so its gateway hop stays documented-TOFU — AC#3/#4).
- New flow inputs: `cert_fqdn` (the device's certified `ssh_host_fqdn`, a principal on its host cert), `pki_host_ca_id` (`domains.pki_host_ca_id`), `pki_base_url` (default `https://pki.joor.net`).
- When both `cert_fqdn` + `pki_host_ca_id` are set, the runner pod fetches the domain Host CA from the **public, id-addressed** pki route `$PKI_BASE_URL/ssh/cas/<id>/ca.pub` (no auth — same source as `scripts/ssh-ca/trust.sh`) and writes `@cert-authority <cert_fqdn> <hostCa>` → `keys/known_hosts`. The inventory then renders `StrictHostKeyChecking=yes -o UserKnownHostsFile=keys/known_hosts -o GlobalKnownHostsFile=/dev/null -o HostKeyAlias=<cert_fqdn>` — the pattern is the exact certified FQDN (a cert principal), so verification cannot fall back to TOFU. Empty inputs (scheduled cron, no device identity) keep TOFU — backward compatible.
- Locally verified: both jinja branches render valid inventory YAML with the expected `ansible_ssh_common_args`.
- **Still pending for AC#1/#2**: a Kestra validation run against the lab canary 10.2.0.210 — enroll (already done) → run connectivity-check with `target_ip=10.2.0.210`, `ssh_key_id=<device key>`, `cert_fqdn=<its ssh_host_fqdn>`, `pki_host_ca_id=<domain host CA>`, and observe host-cert acceptance with no known_hosts write; then flip the wrong-CA negative. Not run yet (guarded: canary access needs sign-off).
<!-- SECTION:NOTES:END -->
