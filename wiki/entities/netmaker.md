---
title: Netmaker
category: entities
tags: [vpn/netmaker, vpn/wireguard, provisioning/networks, status/current]
relationships:
  - target: "[[concepts/provisioning-call-chain]]"
    type: related_to
sources:
  - backlog/decisions/decision-016 - Edge-Functions-Architecture-for-the-StackGres-Data-Plane-Migration.md
  - backlog/docs/doc-016 - Kestra-Notification-Automation-Pattern.md
  - backlog/docs/netmaker-credential-handling.md
  - backlog/decisions/decision-022 - Re-externalize-the-oriolrius.netmaker-Ansible-collection.md
summary: The WireGuard VPN control plane (api.netmaker.i40sys.com) the platform provisions extclients and networks against — a SHARED PRODUCTION server outside our control.
provenance:
  extracted: 0.85
  inferred: 0.05
  ambiguous: 0.1
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Netmaker

**Netmaker** is the WireGuard-based VPN control plane the platform provisions
against. The hosted API is `api.netmaker.i40sys.com`.

## Role

- The `netmaker-call` edge function calls the **Netmaker REST API directly** to
  create/delete **extclients** (devices) and **networks**, returning WireGuard
  keys + IP that get written back to the `devices` row
  ([[concepts/provisioning-call-chain]]).
- For the OpenWRT side, Kestra installs the `oriolrius.netmaker` **Ansible
  collection from Galaxy** at runtime (the collection mirrors the same REST
  contract). The collection source is **external** —
  `github.com/oriolrius/netmaker-ansible-automation`
  ([[synthesis/netmaker-collection-externalization]]).

## Credential — shared, production, not rotatable

> [!warning] Master key is a shared production credential
> `api.netmaker.i40sys.com` is a **SHARED PRODUCTION service that also manages
> other networks**. We do **not** control it and we do **not** rotate its
> `MASTER_KEY` — rotating it would disrupt every other network on that server.
> The original "rotate the leaked master key" remediation **does not apply**.

The `NETMAKER_MASTER_KEY` leaked via git history (now-removed Kestra playbooks +
the `i40sys/iotgw-kestra` repo). It remains valid and is stored encrypted
(SOPS+age) in `secrets/supabase.enc.env` — the **only** in-repo consumer is the
`netmaker-call` edge function (fails loud if unset, no fallback). The real
mitigation (tracked, task-061) is to swap our consumers to a **scoped, revocable
Netmaker API key** (`POST /api/v1/api_keys`, non-disruptive), so a leak of *our*
credential is limited and independently revocable.

## Sources

- decision-016 (§4 security), doc-016, netmaker-credential-handling.md, decision-022.
- Related: [[entities/edge-functions]], [[concepts/secrets-management-sops-age]], [[synthesis/secret-exposure-rotation-runbook]].
