# kestra-call — Critical Integration Point

**This function is the seam between Supabase and Kestra.** Changing its contract breaks the end-to-end flow from UI to Ansible.

## Authoritative spec

See [iotgw-ui doc-016](../../../../backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) — this function's API contract, trigger configuration, and polling behavior are documented there. Update that doc whenever you change this function.

## What it does

1. Receives Supabase webhook POST (from `devices` or `networks` table trigger, see `supabase/volumes/db/webhooks.sql`).
2. Creates a row in `device_jobs` / `network_jobs` with `status = 'PENDING'` and a pre-generated `transaction_id`.
3. Calls Kestra `POST /api/v1/main/executions/iotgw-ng/{devices|networks}` with the webhook body as `json_data`.
4. Updates the job row with real `execution_id` and `status = 'RUNNING'`.
5. `EdgeRuntime.waitUntil()` keeps the function alive to poll Kestra every 5s (max 24 attempts = 2min, bounded by Supabase edge timeout).
6. On `SUCCESS`: parses Kestra logs for the Ansible task "Retrieve created device", extracts WireGuard `privatekey`/`publickey`/`address`, and writes them back into `devices`.
7. Always returns **202 Accepted** immediately; final status lands in the jobs table asynchronously.

## Known footguns

- **Kestra basic-auth credentials are environment-only** (`KESTRA_USER` / `KESTRA_PASSWORD`, sourced from `supabase/.env` ← `secrets/supabase.enc.env`). They are no longer hardcoded in the source. The previously-committed password is compromised and must be rotated on the Kestra instance — see `backlog/decisions/decision-014`.
- **Log-parsing is brittle**: the key extraction supports two Kestra log formats (JSON task output + legacy text). If Kestra upgrades change log structure, `extractDeviceKeysFromLogs()` breaks silently — check the function's own logs.
- **DELETE operations** use `old_record` instead of `record`. See the `type === 'DELETE'` branches.
- **Table parameter is mandatory** and must be `'networks'` or `'devices'`. Anything else → 400.

## Touching this code

- Restart required after editing: `cd ../../../.. && docker compose restart functions`
- Test: `curl -X POST http://wsl.ymbihq.local:8000/functions/v1/kestra-call -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d '{"table":"devices","record":{...}}'`
- Logs show per-transaction ID (first 8 chars) for tracing. Full trans-ID is stored in the jobs row for UI correlation.
