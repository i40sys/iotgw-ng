---
id: TASK-134
title: >-
  Gateway-generated WireGuard keys: never transmit or store the device private
  key
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 22:12'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — decision-035 §2.** The gateway keeps its WireGuard private key and sends wg_public_key; vpn updates the Netmaker ext client (PUT publickey — verified on Netmaker v1.0 with a throwaway client), clears devices.private_key and omits PrivateKey from the reply.
- gw-c3: refresh kept the key (Netmaker untouched, DB private_key → null); `-rotate-key` → gateway, Netmaker and DB all on the new public key, tunnel UP (handshake 9 s); private key only ever shown as <redacted>.
<!-- SECTION:NOTES:END -->
