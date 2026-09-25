---
id: TASK-133
title: TLS for the device API (vpn / ssh-ca edge functions)
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 17:28'
updated_date: '2026-09-25 22:12'
labels:
  - security
  - deploy
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of decision-033: the device API is plain HTTP (http://<host>:8000). Serve it over TLS for gateways and live images and pin the CA.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done — decision-035 §1.** Device-API CA + server cert (IP:10.2.0.47, DNS:api.wsl.ymbihq.local) in SOPS `secrets/device-api-tls.enc.yaml`; ingress-nginx default certificate; host-less Ingress exposing only /functions/v1/{vpn,ssh-ca}.
- Gateways pin /etc/iotgw/api-ca.pem (shipped in the agent package and the live overlay; install carries the live CA) and upgrade an http api_base to https (no fallback).
- Verified on gw-c3 (agent v0.4.0): vpn refresh + ssh renew over `https://10.2.0.47` "TLS, CA pinned … upgraded from http://10.2.0.47:8000"; a client without the CA is refused; QEMU e2e over HTTPS incl. wrong-CA refusal.
<!-- SECTION:NOTES:END -->
