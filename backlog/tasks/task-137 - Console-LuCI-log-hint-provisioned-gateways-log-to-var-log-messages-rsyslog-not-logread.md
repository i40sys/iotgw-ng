---
id: TASK-137
title: >-
  Console/LuCI log hint: provisioned gateways log to /var/log/messages
  (rsyslog), not logread
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 18:27'
updated_date: '2026-09-25 22:12'
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
- [x] #1 The console hint and README name the right log on provisioned and unprovisioned gateways
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done (v0.4.0).** On OpenWRT the console shows `grep iotgw /var/log/messages` when /usr/sbin/rsyslogd exists, else `logread -e iotgw`; README/LuCI/init script name both; the live image shows `journalctl -t iotgw -t iotgw-bootstrap`.
<!-- SECTION:NOTES:END -->
