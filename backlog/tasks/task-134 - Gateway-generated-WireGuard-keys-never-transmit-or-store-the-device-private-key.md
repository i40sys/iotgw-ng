---
id: TASK-134
title: >-
  Gateway-generated WireGuard keys: never transmit or store the device private
  key
status: To Do
assignee: []
created_date: '2026-09-25 17:28'
labels:
  - security
  - vpn
  - netmaker
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of decision-033: the gateway generates its WireGuard key pair and sends only the public key; netmaker-call registers it (verify the Netmaker ext-client API accepts a client public key); drop devices.private_key.
<!-- SECTION:DESCRIPTION:END -->
