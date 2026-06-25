# Netmaker credential handling (task-060.06 AC#3 disposition)

> **Netmaker (`api.netmaker.i40sys.com`) is a SHARED PRODUCTION service that
> also manages other networks.** We do **not** control it and we do **not**
> rotate its `MASTER_KEY`: rotating the master key would invalidate it for every
> other network/integration on that server and disrupt production. So the
> original "rotate the leaked master key" remediation **does not apply here** —
> it is the wrong action for this environment.

## The situation

The Netmaker master key (`NBMtSWau…GtjH5`, full value recorded only in
`decision-014` item 1 / the `tools/verify.sh` leak sentinel) leaked via the git
history of the now-removed `device_*/network_*` Kestra playbooks (task-060.04)
and the `i40sys/iotgw-kestra` repo. It is therefore exposed — but because it is a
**shared production credential outside our control**, its exposure is owned at
the Netmaker-admin level and cannot be remediated by rotating it for development.

For day-to-day use the key remains valid and is stored encrypted (SOPS+age) in
this repo; that is the accepted state.

## The real mitigation (recommended, tracked separately)

Stop using the all-powerful master key in **our** consumers and use a **scoped,
revocable Netmaker API key** instead. Then a leak of *our* credential is limited
in scope and can be revoked independently — **without touching the production
master key or the other networks**. Creating a scoped API key
(`POST /api/v1/api_keys`) is non-disruptive (it does not affect existing
networks), unlike rotating the master key.

This is a hardening **design** change to `netmaker-call` and the
`oriolrius.netmaker` Ansible collection (now external —
`github.com/oriolrius/netmaker-ansible-automation`, `decision-022`), tracked as
its own backlog task — not part of task-060. It still requires a Netmaker admin
to mint the scoped key, but that action does not disturb other networks.

## Where the Netmaker credential lives + who consumes it

| Consumer | Reads credential from | Notes |
|---|---|---|
| `netmaker-call` edge function (`supabase/volumes/functions/netmaker-call/index.ts`) | `NETMAKER_MASTER_KEY` env (kind: `supabase-env` Secret) ← `secrets/supabase.enc.env` | fails loud if unset (no fallback); **the only in-repo consumer** |
| kind `supabase-env` Secret (ns `supabase-app`) | `secrets/supabase.enc.env` via `secrets.sh k8s` | the only Secret carrying it (the `netmaker-call` function reads it in `supabase-app`; `decision-020`) |
| `oriolrius.netmaker` Ansible collection — **now external** (`github.com/oriolrius/netmaker-ansible-automation`, `decision-022`) | its own `.env` on whoever runs it; **no longer rendered from this repo** | reference-only for this platform; removed from the monorepo in `task-068` |
| ~~Kestra `device_*/network_*` playbooks~~ | (removed in task-060.04) | no longer a consumer |

> **Footgun resolved (`decision-022`, `task-068`):** the key used to be
> duplicated as `NETMAKER_MASTER_KEY` in **both** `secrets/supabase.enc.env` and
> `secrets/netmaker.enc.env`. When the Ansible collection was re-externalized,
> `secrets/netmaker.enc.env` (which rendered only to `ansible/netmaker/.env`) was
> removed. The live key now lives in **one** place — `secrets/supabase.enc.env` —
> so there is no longer a pair to keep in sync.

## Local credential-swap mechanics (for when we adopt a scoped API key)

If/when a Netmaker admin provides a **scoped API key** to replace the master key
in our consumers, the local side is mechanical (never echo the key to the shell):

```bash
# A) update the SOPS store — one place now (the Ansible collection is external)
tools/secrets/secrets.sh edit supabase     # set NETMAKER_MASTER_KEY (the scoped key)
tools/secrets/secrets.sh check              # round-trip OK; no LEAK lines

# B) refresh the kind Secret (only supabase-env carries it)
deploy/kind/bootstrap.sh secrets
#   or: tools/secrets/secrets.sh k8s supabase supabase-app supabase-env | kubectl apply -f -

# C) restart the consumer so it re-reads the Secret
kubectl -n supabase-app rollout restart deployment/functions
kubectl -n supabase-app rollout status  deployment/functions

# D) verify: create + delete a test network in the UI -> network_jobs SUCCESS
#   (the external oriolrius.netmaker collection keeps its own .env, set wherever
#    it is run — it is no longer wired from this repo)
```

Adopting a narrower key may also require updating the consumer code if the
scoped key uses a different header/auth scheme than the master key — that is part
of the hardening task, not a config-only swap.
