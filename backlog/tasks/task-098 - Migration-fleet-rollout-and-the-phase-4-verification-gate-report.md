---
id: TASK-098
title: 'Migration: fleet rollout and the phase-4 verification gate report'
status: In Progress
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-22 09:21'
labels:
  - ssh-ca
  - migration
milestone: m-1
dependencies:
  - TASK-097
  - TASK-104
references:
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-027 phase 4. Roll enrollment out cohort by cohort, driven off `devices.ssh_ca_enrolled_at` rather than a spreadsheet, and build the gate report that decides when legacy keys may be removed.

The three queries the report is built from are already written in decision-027 ("Fleet state tracking"): the work queue (`ssh_ca_enrolled_at IS NULL`), the renewal queue (`ssh_host_cert_valid_before < now() + 30 days`), and the enrolled/total count.

**The hard part is AC#3, and it needs infrastructure that does not exist yet.** "Zero raw-key logins for two consecutive weeks" cannot be asserted from intent — it has to be read out of `sshd` logs, and distinguishing the two cases requires `LogLevel VERBOSE` on every gateway plus somewhere to collect the logs:
- certificate login -> `Accepted publickey ... ID <keyid> (serial N) CA ECDSA SHA256:...`
- raw break-glass key -> `Accepted publickey ... ED25519 SHA256:...` with no `ID`/`CA` fields

`tasks/syslog.yaml` already deploys rsyslog on gateways, so the collection path probably exists — confirm where those logs land before assuming this is free. If they are not collected, that is a prerequisite, not a detail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single report shows, per gateway: enrollment state, certificate expiry, last KRL pull, and whether the phase-4 checklist passes
- [x] #2 Gateways offline during rollout appear in a work queue and enroll on their next provisioning run
- [ ] #3 sshd LogLevel VERBOSE is in place fleet-wide and its logs are collected somewhere queryable
- [ ] #4 Certificate logins and raw-key logins can be counted separately from those logs, and the two-week zero-raw-key criterion can be evidenced rather than asserted
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Substantial progress; NOT Done — AC#3 collection + AC#4 evidence are gated on a central log collector (not in scope of the canary-only rollout) + 2 weeks of data.**

**AC#1 DONE — gate report:** tools/ssh-ca-fleet-report.sh (+ `just ssh-ca-report`) prints per-gateway enrollment state, cert expiry, days-left, phase-4 checklist + the work/renewal queues (decision-027). Live: Enrolled 2/10. Monorepo 77bda24.

**AC#2 DONE — work queue + offline enroll:** the report's work queue = devices with ssh_ca_enrolled_at IS NULL; offline gateways enroll on their next provisioning run (the renewal + provisioning ssh_ca path). 8 in the queue.

**AC#3 PARTIAL — sshd LogLevel VERBOSE:** added to iotgw-kestra tasks/system.yaml (validated edit; deploys on next system-tag run; branch feat/ssh-ca-fleet-rollout b0ea3fd). GAP: central log collection — gateway rsyslog currently forwards *.* to loopback @127.0.0.1:1514 only, not a queryable collector. A collector endpoint (SSH_LOG_COLLECTOR) + rsyslog repoint is still required.

**AC#4 NOT YET — cert-vs-rawkey evidence:** the exact 14d counting query is documented in the report (cert logins carry ID/serial/CA; raw keys don't). Needs AC#3 collection + 2 consecutive weeks of real traffic → cannot be produced instantly.

**COHORT-1 CANARY ENROLLED (real hardware, 2026-09-22):** 10.2.0.210 (iot-gateway-datacenter) enrolled into its declared iotgw-office zone. Prereq found + fixed: iotgw-office had NO ssh-ca fleet token (only iotgw-lab did) → minted an office sign-host fleet token, added to PKI_FLEET_TOKENS (SOPS), rolled functions. Enrolled via break-glass first-enroll (direct root; decision-027 phase 6 path — the cert-only Kestra runner can't bootstrap a never-trusted gateway), installed office host cert + iotgw-office User CA + auth_principals (sshd -t gate, break-glass kept). Proven: office iotgw-ops cert-only login → root. DB written back (ssh_ca_enrolled_at + ssh_host_pubkey for continuity).

**REMAINING for Done:** (1) stand up a central auth-log collector + repoint gateway rsyslog (AC#3); (2) wire the 14d cert-vs-rawkey counts into the report (AC#4); (3) 2-week zero-raw-key window; (4) enroll the rest of the fleet (needs each zone's fleet token — production still lacks one — + each gateway reachable/break-glass for first-enroll).
<!-- SECTION:NOTES:END -->
