---
id: TASK-069
title: >-
  Inject device SSH key from Cosmian KMS into Kestra OpenWRT runner pods
  (task-065 AC#3)
status: Done
assignee: []
created_date: '2026-06-25 16:29'
updated_date: '2026-06-25 17:29'
labels:
  - kestra
  - kms
  - security
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to task-065. The install/provisioning/connectivity-check flows SSH into gateways using keys/id_rsa, but nothing injects it: the iotgw-ng namespace blob carries files/credentials/id_rsa (a static committed key) but no keys/id_rsa, and the flows have no KMS-fetch step; with set -e the pods now reach PodCreate then fail at 'chmod 600 keys/id_rsa'. Per decision-010 device SSH keys live in Cosmian KMS (minted by the iotgw-ui backend via KMIP REST; devices store ssh_key_id). The runner pod (label app.kubernetes.io/managed-by=kestra, already admitted to KMS by the task-057 NetworkPolicy) must fetch the device private key from cosmian-kms.kms.svc.cluster.local:9998 over the FQDN and write keys/id_rsa (chmod 600) before ansible runs — in the pod, not the Kestra server task. Mirror to canonical Gitea + live Kestra DB; do NOT change RBAC/NetworkPolicy; verify on the live kind cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A runner pod fetches the device SSH private key from cosmian-kms.kms over the FQDN and writes keys/id_rsa mode 600
- [x] #2 The 3 flows receive/derive the device ssh_key_id needed to fetch the correct key
- [x] #3 connectivity-check reaches ansible-playbook using the KMS-sourced key (UNREACHABLE on a dummy host acceptable)
- [x] #4 A sanitized, secret-free PUBLIC copy is prepared (KMS-fetch is the authoritative key source; static private key removed from the public copy). Gitea, being private+trusted, retains its secrets per policy.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implementation 2026-06-25 (AC#1-3 DONE, verified live; AC#4 = public-copy scope):**

**Root cause:** the flows SSH with keys/id_rsa but nothing injected it (no keys/id_rsa namespace file; the committed files/credentials/id_rsa is a different path and unused). Per decision-010 device keys live in Cosmian KMS (minted by the iotgw-ui backend; devices store ssh_key_id = KMIP UniqueIdentifier `device_ssh_<deviceId>`).

**Fix — in-pod KMS fetch (reuses the backend kms.ts contract):**
- New repo-root helper `fetch_kms_key.py`: issues the KMIP 2.1 `Get` (KeyFormatType=PKCS8) to `cosmian-kms.kms.svc.cluster.local:9998/kmip/2_1` with `Authorization: Bearer $KMS_AUTH_TOKEN`, reads the `KeyMaterial` node (hex PKCS8 DER — found by tag, NOT by type since it comes back as a ByteString node), and writes an OpenSSH `keys/id_rsa` (mode 600) via python3 + `cryptography` (49.0.0, pre-installed in the image's `/opt/venv` — zero installs). Fails loudly; no static fallback.
- All 3 flows: added container `env` SSH_KEY_ID (non-secret KMIP id, Pebble-rendered from the flow input) + KMS_AUTH_TOKEN (secretKeyRef `kms-auth`, never inlined), and run the fetch (guarded by non-empty SSH_KEY_ID) before `chmod 600 keys/id_rsa`. install/provisioning take ssh_key_id from json_data (backend-packed, deployments.ts); connectivity-check gained an `ssh_key_id` input.
- `kms-auth` Secret bridged into the `kestra` namespace (was iotgw-ui only) — made reproducible in deploy/kind/bootstrap.sh `gen_kms_auth_secret()` (now applies to NS_UI + NS_KESTRA).
- connectivity-check stages only {connectivity_check.yml, fetch_kms_key.py}; the helper sits at repo ROOT because the PodCreate fileSidecar uploads root files fine but SUBDIRECTORY files via a lagging tar that never lands (task-065 residual).

**Propagation:** canonical Gitea git.oriolrius.cat/oriolrius/iotgw-kestra (commits f165949, 427f1ec, c975efc) + namespace-files sync + live Kestra DB PUT (connectivity-check rev 6, install/provisioning rev 5).

**Verified live (kind):**
- AC#1 ✓ — a managed-by=kestra pod fetched dev00's key over the FQDN (HTTP 200) and ssh-keygen validated the materialized keys/id_rsa (mode 600); proven standalone AND inside the flow.
- AC#2 ✓ — the flow-spawned pod's env shows SSH_KEY_ID=device_ssh_<deviceId> (from the input) and KMS_AUTH_TOKEN from secretKeyRef kms-auth (plugin-kubernetes v1.9.1 honors env/valueFrom).
- AC#3 ✓ — real connectivity-check run (target_ip=0.0.0.0 dummy, ssh_key_id=<device key>): pod log "Fetching device SSH key ... from Cosmian KMS ... / materialized keys/id_rsa", then ansible-playbook launched and hit `UNREACHABLE! ... connect to host 0.0.0.0 port 22` — exactly as expected with no real target. (NEVER ran against a real/banned target IP.)

**AC#4 (no private key in the PUBLIC copy):** Gitea is private+trusted (keeps secrets); the KMS-fetch is now the authoritative key source so files/credentials/id_rsa is dead weight. Removal/exclusion of the static key is handled in the sanitized public GitHub copy (separate deliverable, in progress) — not by scrubbing Gitea history.

**Residual:** the fileSidecar marker write lags ~4.5 min in kind/WSL2 (task-065 residual); the KMS fetch + ansible launch are unaffected once the pod starts.

**Public copy (AC#4) DONE 2026-06-25:** Per the Gitea-private/GitHub-public policy, the canonical Gitea repo retains its secrets (private+trusted); the requirement is a clean PUBLIC copy. Built a sanitized, fresh-history copy at /tmp/iotgw-kestra-public: removed files/credentials/ (the OpenSSH private key), templates/notion.json.j2, contrib/gather_packages.yml, real inventory/{iotgw,test}.yaml, playbooks/test.yaml, .claude/, files/pre-push; scrubbed PAT/Notion/Kutt/EMQX/webhook literals → REDACTED_* and bastion IP/netmaker/customer-domains/email → RFC5737 + example.com. KMS-fetch is now the authoritative key source so the static key is gone from the public copy. Exhaustive adversarial re-audit (workflow): **GO — 0 blocking, 0 real secrets**. Fresh git init, single commit (274f3f8), NOT pushed and no remote created (awaiting user go). Conscious sign-off noted: the public copy still names the i40sys org/repos + internal cluster FQDN (non-secret public identities).
<!-- SECTION:NOTES:END -->
