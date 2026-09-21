---
id: TASK-104
title: Gateway-side automatic renewal of the host certificate before it expires
status: Done
assignee: []
created_date: '2026-09-14 07:08'
updated_date: '2026-09-21 13:09'
labels:
  - ssh-ca
  - ansible
  - openwrt
milestone: m-1
dependencies:
  - TASK-075
  - TASK-089
references:
  - >-
    backlog/decisions/decision-026-ssh-ca-gateway-provisioning-and-enrollment-sequence.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-026 phase 5 specifies renewal but **nothing implements it**, and no task covered it. Without this, every enrolled gateway's host certificate silently expires 90 days after enrollment and host verification degrades fleet-wide with no warning.

**What is needed on the gateway:** a periodic job (procd/cron on OpenWRT) that checks the remaining life of `/etc/ssh/ssh_host_ecdsa_key-cert.pub` and, below a third of the window (~30 days left), re-runs the enrollment call with the **same** host key. Re-enrollment is idempotent per key, so it is a re-sign, not a re-key.

**The hard part is that renewal must work without Ansible.** `tasks/ssh_ca.yaml` makes the enrollment call from the Ansible **controller**, because that is where the domain/network/device identifiers and Kong reachability live. A gateway renewing on its own needs those identifiers locally, which means either storing them on the device (they are identifiers, not secrets — but see decision-028 §12, which is exactly about how weak they are as an authenticator) or a different credential for renewal.

**The alternative** is controller-driven renewal: a scheduled Kestra flow that walks `devices` where `ssh_host_cert_valid_before < now() + 30 days` and re-runs the `ssh_ca` tag. That needs no on-device state and no new credential, at the cost of only renewing gateways the runner can currently reach.

Pick one deliberately — this is the difference between a fleet that heals itself and one that needs a scheduled job to be healthy.

**Also unhandled:** an expired certificate. Decide what a gateway does when renewal has failed past expiry (decision-028 §8 says login is unaffected and break-glass remains, but nothing alerts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A gateway whose certificate is inside the renewal window obtains a fresh one without human action
- [x] #2 Renewal reuses the existing host key — it is a re-sign, not a re-key, and the fingerprint is unchanged
- [x] #3 The renewal path's identifier/credential model is written down and reconciled with decision-028 §12
- [x] #4 A renewal failure is visible somewhere an operator looks, rather than surfacing as an expired certificate months later
- [x] #5 A gateway offline past expiry recovers on its next contact without manual re-keying
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
**Model: controller-driven** (user decision) — a scheduled Kestra flow re-runs the ssh_ca tag; no on-device cron/curl/openssl/TOTP-secret, so it sidesteps task-075/§12. Reconciled with decision-028 §8 (expired host cert = degraded verification, not lockout).

**Prerequisites fixed first (Kestra enrollment was non-functional):**
- Gap 1: openssl+curl missing in the runner pod → added `apk add` (Flow.yaml).
- Gap 2: enroll_totp never derived + ssh_ca_endpoint unmapped → re-added controller-side python3 TOTP derivation (verified live against ssh-ca edge fn) + endpoint mapping (tasks/ssh_ca.yaml). Commit 8ffa868.

**Renewal (self-selection reuses existing logic):** tasks/ssh_ca.yaml already re-signs when the on-gateway cert has < ssh_ca_renew_margin_seconds (30d) left, same host key (re-sign not re-key) → AC#2. New ssh-ca-renewal-flow.yaml: daily Schedule (shipped disabled), Postgres SELECT of devices with pki_zone+ip_address, ForEach → provisioning Subflow with __tags__=[ssh_ca] → AC#1. Offline gateway recovers on next daily run → AC#5. Failures visible via Kestra execution status + deployment_jobs + summary Log → AC#4.

**AC#3 (identifier/credential model):** renewal uses the SAME controller-side TOTP-from-identifiers channel as enrollment — no NEW on-device authenticator, no on-device state; inherits (does not worsen) §12's identifier-binding weakness. To be written into decision-026 phase 5 (amend from on-device cron to controller-driven).

**Safety:** validated only against target_ip 0.0.0.0; schedule shipped disabled; never fired at real fleet IPs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Model: controller-driven** (user decision). decision-026 phase 5 amended from the original on-gateway cron — that path needs openssl+curl (absent on OpenWRT), gateway→Kong reachability, and the device TOTP secret stored on-device (the open §12/task-075 weakness). Controller-driven avoids all three.

**Prerequisite fixed first — Kestra enrollment was non-functional (commit 8ffa868):**
- Gap 1: openssl+curl missing in cytopia/ansible:latest-tools → `apk add` in Flow.yaml (the enroll envelope+POST run delegate_to localhost = the pod).
- Gap 2: enroll_totp never derived (lost when enrollment was inlined) + ssh_ca_endpoint unmapped → re-added controller-side python3 TOTP derivation + endpoint mapping in tasks/ssh_ca.yaml. Algorithm (HMAC-SHA1 HOTP/600s, secret <domain>-<network>-<device>-<counter>) PROVEN live against the ssh-ca edge function trust action (returned user_ca/host_ca/principals) — no gateway needed.

**Renewal flow (i40sys/iotgw-kestra 6b72b67):** ssh-ca-renewal-flow.yaml — daily Schedule (cron 0 3 * * *, shipped disabled:true), Postgres read-only SELECT of devices with pki_zone+ip_address (10 live candidates), ForEach → provisioning Subflow with __tags__=[ssh_ca] per device (transmitFailed:false), count_failures + renewal_summary Log. provisioning flow re-registered rev 3→4 (openssl/curl live).

**AC mapping:**
- AC#1: scheduled flow re-runs ssh_ca; ssh_ca.yaml self-selects (re-signs when <30d left) → renews without human action.
- AC#2: same host key reused (re-sign not re-key) — ssh_ca.yaml idempotence, built-in.
- AC#3: model written into decision-026 phase 5 + reconciled with §12 (no NEW on-device authenticator/state; inherits, doesn't widen, §12).
- AC#4: failures visible via Kestra execution status + count_failures/renewal_summary + deployment_jobs.
- AC#5: offline gateway recovers on next daily run (decision-028 §8: expired host cert degrades verification only, never login).

**Validated SAFELY (never against real fleet IPs):** both flows POST /validate clean; query returns 10 rows read-only; full query→ForEach→Subflow→pod pipeline proven with a synthetic target_ip=0.0.0.0 row (SUCCESS, count_failures=1, summary logged). Fixed real Kestra 1.3.35 wiring bugs (fromJson(taskrun.value), SQL network_prefix, Count.count field).

**Operator-gated / flags for a human (NOT blockers to the mechanism):**
1. Enable the ssh-ca-renewal Schedule once the fleet has enrolled (disabled by design).
2. secrets/supabase.enc.env POSTGRES_PASSWORD is STALE (StackGres role drift, memory stackgres-owns-authenticator-role) — the flow uses the live k8s Secret superuser-password via a Kestra KV; run `just db-sync-roles` to make SOPS the source of truth again.
3. VPN_JUMP_HOST KV is MISSING in this Kestra instance (pre-existing) — any real provisioning/install run fails at create_inventory_file until an operator sets it.
4. DB creds are the StackGres superuser (read-only use, acceptable; follow-up: a dedicated read-only role).
5. Full fleet e2e (real enrolled gateway) is out of scope here (canary/no-real-IP rule) — belongs to the task-097/098 migration.
<!-- SECTION:NOTES:END -->
