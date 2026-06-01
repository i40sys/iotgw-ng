# Cosmian KMS

Self-hosted Cosmian KMS for SSH key and X.509 PKI management. Full details in [README.md](README.md).

## Role in iotgw-ng

This KMS is the authoritative store for device SSH keys. The Supabase `devices` table stores only `ssh_key_id` — the actual key material lives here. Reference architecture in [iotgw-ui decision-010](../iotgw-ui/backlog/decisions/decision-010%20-%20ADR-001-SSH-Key-Management-with-Cosmian-KMS.md).

The `pki-test/` CA also mints the certs consumed by `traefik-poc/`.

## Stack

- Cosmian KMS 5.9.0 (Docker, port 9998, SQLite backend at `data/kms.db`)
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

- **Kestra install/provisioning flows** call the CLI to generate per-device SSH keys, export as OpenSSH, push public key to OpenWRT device.
- **Traefik PoC** reads `pki-test/` outputs (`server.crt`, `server.key`, `ca.crt`) for TLS termination — see [../traefik-poc/CLAUDE.md](../traefik-poc/CLAUDE.md).
- **SSH key lifecycle**: in-flight work tracked in iotgw-ui backlog task-034..041.

## Release

`uv run cz bump` → auto-detects semver from conventional commits → `git push --tags`.
