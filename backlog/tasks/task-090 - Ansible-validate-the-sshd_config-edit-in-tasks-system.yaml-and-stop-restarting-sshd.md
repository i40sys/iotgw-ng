---
id: TASK-090
title: >-
  Ansible: validate the sshd_config edit in tasks/system.yaml and stop
  restarting sshd
status: Done
assignee: []
created_date: '2026-09-14 05:30'
updated_date: '2026-09-14 07:35'
labels:
  - ssh-ca
  - ansible
  - security
milestone: m-1
dependencies: []
references:
  - >-
    backlog/decisions/decision-025-ssh-ca-change-map-per-component-current-vs-required-behaviour-and-ownership.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tasks/system.yaml edits /etc/ssh/sshd_config with lineinfile and NO validate:, then runs both reload and restart. A malformed edit therefore strands the gateway. Add validate: /usr/sbin/sshd -t -f %s, drop the restart, and make the change explicit about not weakening any existing setting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The sshd_config edit is validated before it is written, and a bad edit cannot reach the running daemon
- [x] #2 sshd is reloaded, not restarted, so in-flight sessions survive
- [x] #3 No existing sshd setting (PermitRootLogin, PasswordAuthentication, ciphers) is changed by this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done 2026-09-14.** Both copies: `owrt_iot_gw/playbooks/tasks/system.yaml` and the Kestra flow source (`~/iotgw-kestra`, commit `5cbde41`, not pushed).

**What changed:**
- The `sshd_config` `lineinfile` gained `validate: /usr/sbin/sshd -t -f %s`. It previously had none, so a malformed edit reached the running daemon (decision-023 R6).
- `/etc/init.d/sshd reload && /etc/init.d/sshd restart` became a single `reload`. A reload keeps in-flight sessions — including Ansible's own — and a reload of a bad config leaves the previous config running rather than dropping the daemon.

**AC#3:** no existing sshd setting is touched. `PermitRootLogin`, `PasswordAuthentication` and the cipher/kex settings are deliberately left exactly as they were; tightening them is a separate risk deferred to decision-027 phase 5 with explicit sign-off.

**Also marked, not changed:** the two tasks that copy the shared `credentials/id_rsa` now carry a DEPRECATED comment pointing at decision-027 phase 5.2/5.3 and decision-028 §7. They stay until the twelve task files that use `/root/.ssh/id_rsa` as a docker `key_file:` are re-pointed. Noted while doing this: the Kestra copy already gates them behind `deploy_shared_ssh_key | default(false)`, so the two playbook trees had silently diverged — recorded in decision-023.
<!-- SECTION:NOTES:END -->
