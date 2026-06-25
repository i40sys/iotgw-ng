# Secrets management (SOPS + age)

All secrets in this workspace are encrypted at rest with **[SOPS](https://github.com/getsops/sops)** using an **[age](https://github.com/FiloSottile/age)** recipient. Encrypted files (`*.enc.env`, `*.enc.yaml`) are committed; the matching **private key is never committed**.

> See `backlog/decisions/decision-014` for the rationale and the rotation runbook for every credential that was previously exposed.

## Layout

| File | Decrypts to (local dev) | Contents |
|---|---|---|
| `supabase.enc.env` | `supabase/.env` | Whole self-hosted Supabase env (DB/JWT/dashboard/realtime/logflare + `NETMAKER_*`, `KESTRA_*`, `OPENAI_API_KEY`, MinIO) |
| `kestra.enc.env` | `kestra/.env` | Kestra Postgres password, Gemini API key, basic-auth user/pass |
| `netmaker.enc.env` | `ansible/netmaker/.env` | Netmaker master key for the Ansible collection |
| `iotgw-ui-root.enc.env` | `iotgw-ui/.env` | `DATABASE_URL` for type generation |
| `iotgw-ui-backend.enc.env` | `iotgw-ui/apps/backend/.env` | Supabase service key + Kestra creds for the backend |
| `traefik-tls.enc.yaml` | (manual) | Ingress TLS cert/key/CA, ex-`traefik-poc` (**compromised — regenerate**) |

`.sops.yaml` at the repo root defines the creation rules and the age recipient.

## One-time setup (new machine / new contributor)

1. Install the tools (no root needed):
   ```bash
   # age + age-keygen and sops to ~/.local/bin (see decision-014 for exact versions)
   ```
2. Obtain the age **private** key out-of-band (Bitwarden / secure channel) and place it at:
   ```
   ~/.config/sops/age/keys.txt      # chmod 600
   ```
   The public recipient (safe to share) is in `.sops.yaml`.
3. Render the plaintext env files the stacks consume:
   ```bash
   tools/secrets/secrets.sh render          # all
   tools/secrets/secrets.sh render supabase # one
   ```

## Daily workflow

```bash
tools/secrets/secrets.sh render <name>     # decrypt -> consuming .env (gitignored)
tools/secrets/secrets.sh edit   <name>     # edit secret in $EDITOR, re-encrypts on save
tools/secrets/secrets.sh reencrypt <name>  # capture changes you made to the .env back into the enc file
tools/secrets/secrets.sh check             # round-trip + cleartext-leak audit of every enc file
tools/secrets/secrets.sh k8s <name> <ns> <secret>   # emit a k8s Secret manifest (stdout)
```

## Rules

- **Never** commit a plaintext `.env`, `*.key`, `*.pem`, or a decrypted secret. `.gitignore` enforces this; `tools/secrets/secrets.sh check` audits it.
- **Never** reintroduce an inline secret into tracked source (compose files, edge-function source, docs). They read from the environment, which is rendered from here.
- **Rotating the age key**: add the new recipient to `.sops.yaml`, run `sops updatekeys secrets/<file>` for every file, distribute the new private key, then drop the old recipient.
- **Rotating a credential value**: rotate it at the upstream service first, then `secrets.sh edit <name>` (or update the `.env` and `reencrypt`).

## ⚠️ Compromised credentials

Everything captured here from the pre-existing deployment is **already exposed** (it was in tracked source, git history, or the `i40sys/iotgw-kestra` remote). Encrypting it stops *new* leakage but does not undo the old one. The rotation checklist in `backlog/decisions/decision-014` lists every value that must be rotated at its upstream service (Netmaker master key, Kestra password, Gemini/OpenAI keys, GitHub PATs, Supabase JWT secret + re-minted anon/service keys, the Traefik TLS leaf, and the WireGuard/SSH keys).
