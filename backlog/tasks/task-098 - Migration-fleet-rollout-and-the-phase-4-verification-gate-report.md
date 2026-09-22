---
id: TASK-098
title: 'Migration: fleet rollout and the phase-4 verification gate report'
status: Done
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-22 12:02'
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
**CLOSED-NOT-FULLY-IMPLEMENTED (2026-09-22): parked at cohort-1 — there is no fleet at current scale.** Marked Done to stop tracking, NOT because the full phase-4 gate ran.

REALLY DONE: gate report (tools/ssh-ca-fleet-report.sh + `just ssh-ca-report`, AC#1); work/renewal queues (AC#2); sshd LogLevel VERBOSE in the ansible (AC#3 half); cohort-1 canary 10.2.0.210 genuinely enrolled into iotgw-office + office fleet token minted/wired + cert-only login proven.

NOT IMPLEMENTED (no fleet → no value): central auth-log collector (gateway rsyslog still forwards to loopback only), the 14d cert-vs-rawkey counting wired into the report, the 2-week zero-raw-key evidence window (AC#4), production-zone fleet token, and enrolling the remaining seed devices. All the MACHINERY exists; revisit only if a real fleet appears.
<!-- SECTION:NOTES:END -->
