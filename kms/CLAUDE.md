# Cosmian KMS

Self-hosted Cosmian KMS for SSH key and X.509 PKI management. Full details in [README.md](README.md).

## Role in iotgw-ng

This KMS is the authoritative store for device SSH keys. The Supabase `devices` table stores only `ssh_key_id` — the actual key material lives here. Reference architecture in [iotgw-ui decision-010](../backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md).

The `pki-test/` CA also mints the certs used for TLS termination at the k8s
Ingress (which replaced the former `traefik-poc/` PoC).

> **SECURITY (task-057)**: In the k8s/kind deployment the KMS now requires
> **API-token authentication** and is fronted by a **NetworkPolicy** — it no
> longer runs open. (TLS still terminates at the Ingress; in-cluster KMS traffic
> is plaintext but locked down by the NetworkPolicy.) Details:
>
> - **Auth — Cosmian KMS 5.20 API token** (`[http] api_token_id` in
>   `deploy/k8s/base/kms/configmap.yaml`). The server fetches the symmetric key
>   `iotgw_api_token`, base64-encodes its raw bytes (lowercased), and requires
>   every request to present it as `Authorization: Bearer <token>`. `/version`
>   and `/health` stay public (so k8s probes work); the KMIP endpoint
>   (`/kmip/2_1`) returns **401** without the token. The token VALUE is a secret:
>   it lives in the SOPS store (`secrets/iotgw-ui-backend.enc.env` →
>   `KMS_AUTH_TOKEN`), is bridged into the `kms-auth` k8s Secret, and injected
>   into the iotgw-ui backend Deployment (`KMS_AUTH_TOKEN` env). The key is
>   provisioned idempotently by `deploy/kind/bootstrap.sh kms-auth` (run while
>   the KMS is still open — chicken-and-egg).
> - **NetworkPolicy** (`deploy/k8s/base/kms/networkpolicy.yaml`) default-denies
>   ingress to `:9998` except from its now **cross-namespace** clients: the
>   **iotgw-ui-backend** pod (namespace `iotgw-ui`), the **kestra** pod, and
>   **kestra-spawned Ansible runner pods** (`app.kubernetes.io/managed-by: kestra`,
>   namespace `kestra`) — each allow rule combines `namespaceSelector` AND
>   `podSelector` in one `from:` peer (`decision-020`). Clients reach the KMS at
>   the FQDN `cosmian-kms.kms.svc.cluster.local:9998`. The kind cluster's
>   `kindnet` CNI **does enforce** this (verified live); host→NodePort traffic is
>   consequently blocked, so the `/version` smoke falls back to an in-cluster
>   check. Prod enforces identically via Calico/Cilium.
> - **Kestra/Ansible KMS-fetch path**: the install/provisioning/connectivity
>   flows fetch device SSH keys from the KMS via Ansible. With auth on, that
>   Ansible KMS-fetch role MUST present `KMS_AUTH_TOKEN` as
>   `Authorization: Bearer <token>` on its KMS calls. The token is the same value
>   in the SOPS store; surface it to the flows via the Kestra KV store or a
>   mounted Secret (the Kestra flows are owned by another task — task-054 — and
>   are intentionally NOT edited here).

## Stack

- Cosmian KMS 5.20.0 (deployed on the kind cluster, port 9998, SQLite backend on a PVC) — the k8s manifest pins `ghcr.io/cosmian/kms:5.20.0` (`deploy/k8s/base/kms/`)
- Cosmian CLI 1.9.0 at `contrib/cosmian`
- Python (uv) for `src/kms_tools/convert_keys.py` (PKCS8 ↔ OpenSSH)
- Pre-commit + commitizen for conventional commits

## Quick commands

```bash
just bootstrap                             # bring the platform (incl. KMS) up on kind
kubectl -n kms rollout status deploy/cosmian-kms   # KMS up?
./contrib/cosmian kms server-version       # verify (note: :9998 host path is
                                           #   blocked by the task-057 NetworkPolicy;
                                           #   the KMS is reached in-cluster)
uv sync                                    # install Python deps
uv run convert-keys pkcs8-to-ssh in.pem out  # convert exported key
```

## Integration points

- **Kestra install/provisioning flows** are intended/in-flight (tasks 034-041) to call the CLI to generate per-device SSH keys, export as OpenSSH, push public key to OpenWRT device. No `cosmian:9998` reference exists in the Kestra namespace files yet.
- **TLS termination** consumes `pki-test/` outputs (`server.crt`, `server.key`, `ca.crt`) at the k8s Ingress; the cert/key/CA are stored encrypted in `secrets/traefik-tls.enc.yaml`. The former compose-based `traefik-poc/` PoC has been removed.
- **SSH key lifecycle**: in-flight work tracked in iotgw-ui backlog task-034..041.

## Release

`uv run cz bump` → auto-detects semver from conventional commits → `git push --tags`.
