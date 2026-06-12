# Cosmian KMS

Self-hosted Cosmian KMS for SSH key and X.509 PKI management. Full details in [README.md](README.md).

## Role in iotgw-ng

This KMS is the authoritative store for device SSH keys. The Supabase `devices` table stores only `ssh_key_id` — the actual key material lives here. Reference architecture in [iotgw-ui decision-010](../backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md).

The `pki-test/` CA also mints the certs consumed by `traefik-poc/`.

> **SECURITY**: The KMS currently runs with NO authentication and NO TLS while holding all device SSH private keys — acceptable only for local dev. Production needs an `[authentication]` block plus a NetworkPolicy to restrict access (see decision-015 k8s notes).

## Stack

- Cosmian KMS 5.20.0 (Docker, port 9998, SQLite backend at `data/kms.db`) — pin the compose image to `ghcr.io/cosmian/kms:5.20.0` (currently `:latest`); the k8s manifest already pins 5.20.0
- Cosmian CLI 1.9.0 at `contrib/cosmian`
- Python (uv) for `src/kms_tools/convert_keys.py` (PKCS8 ↔ OpenSSH)
- Pre-commit + commitizen for conventional commits

## Quick commands

```bash
docker compose up -d                       # start KMS
./contrib/cosmian kms server-version       # verify
uv sync                                    # install Python deps
uv run convert-keys pkcs8-to-ssh in.pem out  # convert exported key
cd ssh-test/docker-test && ./test-ssh-keys.sh test  # full SSH auth test
```

## Integration points

- **Kestra install/provisioning flows** are intended/in-flight (tasks 034-041) to call the CLI to generate per-device SSH keys, export as OpenSSH, push public key to OpenWRT device. No `cosmian:9998` reference exists in the Kestra namespace files yet.
- **Traefik PoC** reads `pki-test/` outputs (`server.crt`, `server.key`, `ca.crt`) for TLS termination — see [../traefik-poc/CLAUDE.md](../traefik-poc/CLAUDE.md).
- **SSH key lifecycle**: in-flight work tracked in iotgw-ui backlog task-034..041.

## Release

`uv run cz bump` → auto-detects semver from conventional commits → `git push --tags`.
