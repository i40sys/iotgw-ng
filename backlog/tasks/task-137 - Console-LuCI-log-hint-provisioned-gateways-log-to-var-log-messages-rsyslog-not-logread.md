---
id: TASK-137
title: >-
  Console/LuCI log hint: provisioned gateways log to /var/log/messages
  (rsyslog), not logread
status: To Do
assignee: []
created_date: '2026-09-25 18:27'
labels:
  - live-image
  - openwrt
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during task-132 (2026-09-25): once the provisioning syslog stack installs rsyslogd, it owns /dev/log and `logread` stops receiving messages — iotgw's lines are in /var/log/messages. The console Action panel and README say `logread -e iotgw`. Show both (or detect rsyslog).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The console hint and README name the right log on provisioned and unprovisioned gateways
<!-- AC:END -->
