---
id: TASK-135
title: Remove the legacy (unsealed) vpn reply and devices.totp_counter
status: To Do
assignee: []
created_date: '2026-09-25 17:28'
labels:
  - security
  - cleanup
dependencies: []
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of decision-033: once every live image in use sends reply_key, drop the code-encrypted reply fallback, then drop the unused totp_counter column.
<!-- SECTION:DESCRIPTION:END -->
