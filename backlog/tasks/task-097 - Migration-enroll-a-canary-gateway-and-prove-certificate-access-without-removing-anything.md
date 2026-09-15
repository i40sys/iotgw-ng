---
id: TASK-097
title: >-
  Migration: enroll a canary gateway and prove certificate access without
  removing anything
status: To Do
assignee: []
created_date: '2026-09-14 05:31'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - migration
milestone: m-1
dependencies:
  - TASK-089
  - TASK-096
references:
  - >-
    backlog/decisions/decision-027-ssh-ca-migration-plan-authorized-keys-to-certificate-coexistence-and-cutover.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-027 phases 1-2 on a single **OpenWRT gateway** that has console or physical access. Additive only: nothing is removed.

**Prerequisite this task cannot start without:** an installed OpenWRT gateway. As of 2026-09-14 none was available — the only hardware to hand was a live-booted Clonezilla machine, which is a different OS with a different init system.

**What is already proven, so do not redo it:**
- The full bundle -> sshd -> certificate-login chain works: proven twice, once against a Debian container and once against a real live-booted machine (10.2.0.210). Certificate-only login, break-glass alongside, uncertified key refused, principal mismatch refused, host cert verified via `@cert-authority` with no `known_hosts` entry added.
- Enrollment through the `ssh-ca` edge function against live pki.joor.net works, is idempotent, fails closed on an unlinked domain and rejects a bad TOTP.

**What is therefore actually under test here, and only here — the OpenWRT specifics:**
- does `/etc/init.d/sshd reload` exist and actually reload (the init script name differs from Debian's `ssh`);
- does inserting `Include /etc/ssh/sshd_config.d/*.conf` at BOF work on OpenWRT's upstream `sshd_config`;
- is `/usr/sbin/sshd` at that path for `sshd -t` / `sshd -T`;
- is `ssh-keygen -t ecdsa` available (needs the `openssh-keygen` package);
- does the rollback path actually restore access when `sshd -t` fails.

**The acceptance evidence is the sshd log line**, not "the login worked" — a lingering raw key produces the latter. Requires `LogLevel VERBOSE`; on OpenWRT confirm where those logs land (`logread`, or rsyslog from `tasks/syslog.yaml`) before starting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The canary presents a valid host certificate with the expected principals and validity
- [ ] #2 A certificate-only login from a machine that has never held a raw key for that gateway succeeds, evidenced by the sshd certificate-acceptance log line
- [ ] #3 Connecting by the certified name produces no host-key prompt and adds no known_hosts entry
- [ ] #4 The break-glass raw-key path still works after all of the above
- [ ] #5 Rollback is demonstrated: a deliberately broken drop-in leaves the gateway reachable and the running sshd config intact
- [ ] #6 Each OpenWRT-specific assumption (init script name, Include insertion, sshd path, openssh-keygen) is confirmed or corrected in tasks/ssh_ca.yaml
<!-- AC:END -->
