# Netmaker master key rotation runbook (task-060.06 AC#3)

> **PREPARED, NOT EXECUTED.** This document was produced by the rotation-prep
> investigation. **Do not run any step until a human has generated a NEW master
> key on the Netmaker server.** No real key value appears anywhere in this file.
>
> The compromised key (`NBMtSWau…GtjH5`, full value in `decision-014` item 1) was
> hardcoded in the now-removed `device_*/network_*` Kestra playbooks and lived in
> the `i40sys/iotgw-kestra` GitHub history. Treat as fully exposed.

## What is BLOCKED on external action (cannot be done from this repo)

The Netmaker **MASTER_KEY is a server-side config value** (`MASTER_KEY` /
`NETMAKER_MASTER_KEY` env on the Netmaker server at
`api.netmaker.i40sys.com`, which we do **not** control from this workspace).
Truly invalidating the old key and minting a new one requires changing that
external server's configuration and restarting its `netmaker` service. That step
is **out of scope for this repo** and must be performed by whoever administers
the Netmaker host.

- Generate a strong random replacement (e.g. `openssl rand -hex 24` on a
  trusted machine) — but apply it on the Netmaker server, not here.
- The API is reachable from here (`GET /api/server/health` → 200), but we do
  **not** authenticate with the master key and we do **not** mutate anything.

### Future design note (investigation only — do NOT implement now)

Netmaker exposes a scoped **API keys** feature (`POST /api/v1/api_keys`,
auth-required; `/api/v1/users` returns 401 confirming the standard API surface
is present on this server). A future hardening could replace the all-powerful
master key in the `netmaker-call` edge function and the Ansible collection with a
narrower, individually-revocable API key, so a leak no longer means full admin.
That is a separate task, not part of this rotation.

## What is AUTOMATABLE locally (run ONLY after the new key exists)

Once a human has the NEW key value, everything below is mechanical and lives in
this repo. Two consumer surfaces hold the key, so **both** SOPS files change:

1. `secrets/supabase.enc.env` → `NETMAKER_MASTER_KEY`  (edge function consumer)
2. `secrets/netmaker.enc.env`  → `NETMAKER_MASTER_KEY`  (Ansible collection consumer)

### Step A — update the SOPS store (both files)

```bash
# Edits open in $EDITOR; paste the NEW value for NETMAKER_MASTER_KEY, save.
# sops re-encrypts in place on save. Do NOT echo the key to the shell/history.
tools/secrets/secrets.sh edit supabase     # change NETMAKER_MASTER_KEY
tools/secrets/secrets.sh edit netmaker      # change NETMAKER_MASTER_KEY

# Verify round-trip + that the OLD-key sentinel is gone from cleartext:
tools/secrets/secrets.sh check              # must print OK, no LEAK lines
```

### Step B — re-render the consuming plaintext .env files

```bash
just secrets-render                          # or: tools/secrets/secrets.sh render
# lands: supabase/.env  and  ansible/netmaker/.env  (both gitignored, chmod 600)
```

### Step C — refresh the kind Secret(s)

The kind cluster reads `NETMAKER_MASTER_KEY` only from the **`supabase-env`**
Secret (there is no separate netmaker Secret). Re-apply it from the updated SOPS
store:

```bash
# Option 1 — the bootstrap helper (recreates supabase-env AND kestra-env):
deploy/kind/bootstrap.sh secrets

# Option 2 — just the one Secret, in place:
tools/secrets/secrets.sh k8s supabase iotgw supabase-env | kubectl apply -f -
```

### Step D — restart the consumers so they pick up the new value

```bash
# kind: the edge-function pod reads the Secret at startup
kubectl -n iotgw rollout restart deployment/functions
kubectl -n iotgw rollout status  deployment/functions

# docker-compose path (if running the compose stack instead of kind):
cd supabase && docker compose up -d functions    # re-reads supabase/.env
# (Ansible collection needs no restart — `just` reads ansible/netmaker/.env per run)
```

### Step E — verify the OLD key no longer works / new key does

```bash
# (run by a human; the OLD key must now be rejected by Netmaker)
# 1. Old key rejected (expect 401/403):
#    curl -s -o /dev/null -w '%{http_code}\n' \
#      -H "Authorization: Bearer <OLD_KEY>" https://api.netmaker.i40sys.com/api/networks
# 2. New key accepted (expect 200): same call with the NEW key.
# 3. App-level: create + delete a test network in the UI; network_jobs -> SUCCESS.
```

## Consumers checklist (everything that must be updated on rotation)

| Consumer | Reads key from | Update mechanism |
|---|---|---|
| `netmaker-call` edge function (`supabase/volumes/functions/netmaker-call/index.ts`) | `NETMAKER_MASTER_KEY` env, injected (kind) from `supabase-env` Secret / (compose) from `supabase/.env` | Step A (supabase) → B → C → D |
| `oriolrius.netmaker` Ansible collection (`ansible/netmaker/`) | `ansible/netmaker/.env` (`NETMAKER_MASTER_KEY`, loaded by `ansible/netmaker/justfile`) ← `secrets/netmaker.enc.env` | Step A (netmaker) → B |
| kind `supabase-env` Secret (ns `iotgw`) | `secrets/supabase.enc.env` via `secrets.sh k8s` | Step C |
| ~~Kestra `device_*/network_*` playbooks~~ | (removed in task-060.04) | n/a — no longer a consumer |

## Notes

- **Two files, same var name.** `NETMAKER_MASTER_KEY` is duplicated in
  `secrets/supabase.enc.env` and `secrets/netmaker.enc.env`. Both must get the
  SAME new value, or the edge function and the Ansible collection will disagree.
- After rotation, git history still contains the old key, but it is then
  worthless. No history rewrite is required for this item.
