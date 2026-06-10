# netmaker-call — Direct Netmaker Provisioning (Devices + Networks)

**This function bypasses Kestra and Ansible entirely.**  
It receives Supabase DB webhook POSTs for BOTH the `devices` and `networks` tables and calls the Netmaker REST API directly.

- `devices` → Netmaker **extclients** (WireGuard clients under a network)
- `networks` → Netmaker **networks** (the overlay network itself)

## Purpose

Replaces the `kestra-call` path for both device and network operations:

```
DB trigger (devices, INSERT or DELETE)
  → POST /functions/v1/netmaker-call
  → Netmaker REST API (extclients)
  → UPDATE devices SET private_key, public_key, ip_address   (INSERT only)
  → UPDATE device_jobs SET status = SUCCESS/FAILED

DB trigger (networks, INSERT / UPDATE / DELETE)
  → POST /functions/v1/netmaker-call
  → Netmaker REST API (networks)
  → No write-back to networks table (UPDATE-safe, no trigger loop)
  → UPDATE network_jobs SET status = SUCCESS/FAILED
```

## Triggers

This function is the webhook target for BOTH the `devices` and `networks` tables.

**devices** — INSERT and DELETE events:
- INSERT: `{ type:"INSERT", table:"devices", schema:"public", record:{id, name, network_id, ...}, old_record:null }`
- DELETE: `{ type:"DELETE", table:"devices", record:null, old_record:{id, name, network_id, ...} }`

**networks** — INSERT, UPDATE, and DELETE events:
- INSERT/UPDATE: `{ type:"INSERT"|"UPDATE", table:"networks", schema:"public", record:{id, name, domain_id, ipv4_cidr, ipv6_cidr, ...}, old_record:... }`
- DELETE: `{ type:"DELETE", table:"networks", record:null, old_record:{id, name, domain_id, ipv4_cidr, ipv6_cidr, ...} }`

If `table` is not `"devices"` or `"networks"` the function returns 400 immediately.

## Dispatch logic

The handler reads `body.table`, validates it against the allow-list `['devices', 'networks']`, then routes:
- `devices` → device path (extclient create/delete, `device_jobs` tracking)
- `networks` → network path (network create/update/delete, `network_jobs` tracking)

## Netmaker API endpoints used

All calls go to `${NETMAKER_BASE_URL}/api<endpoint>`.  
Headers on every call: `Authorization: Bearer <NETMAKER_MASTER_KEY>`, `Content-Type: application/json`.

### Device (extclient) endpoints

| Method | Endpoint | When |
|--------|----------|------|
| GET | `/extclients/{network}` | Idempotency check + authoritative read-back |
| GET | `/nodes/{network}` | Locate the ingress gateway |
| POST | `/extclients/{network}/{gatewayId}` | Create extclient |
| DELETE | `/extclients/{network}/{clientid}` | Remove extclient |

### Network endpoints

| Method | Endpoint | When |
|--------|----------|------|
| GET | `/networks/{netid}` | Check existence and read current state |
| POST | `/networks` | Create new network |
| PUT | `/networks/{netid}` | Update existing network (merged object) |
| DELETE | `/networks/{netid}` | Remove network |

## UUID-without-dashes naming convention

Netmaker identifiers are Supabase UUIDs with **all dashes stripped**:

```ts
// devices
const clientid = String(rec.id).replaceAll('-', '')
const network  = String(rec.network_id).replaceAll('-', '')

// networks
const netid = String(rec.id).replaceAll('-', '')
```

This mirrors the convention used by the `oriolrius.netmaker` Ansible collection.

## Environment variables

| Variable | Default (fallback in code) | Notes |
|---|---|---|
| `SUPABASE_URL` | `''` | Injected by docker-compose |
| `SUPABASE_SERVICE_ROLE_KEY` | `''` | Service role — bypasses RLS |
| `NETMAKER_BASE_URL` | `https://api.netmaker.i40sys.com` | Override in docker-compose env |
| `NETMAKER_MASTER_KEY` | `***REMOVED-DECOMMISSIONED***` | **Footgun — see below** |

To add or change env vars: edit the `functions:` service `environment:` block in `supabase/docker-compose.yml`.

## device_jobs lifecycle

Mirrors kestra-call so the Deployments UI (which calls `get_device_jobs` RPC) requires no changes.

| Phase | status | Notes |
|---|---|---|
| Row inserted synchronously before 202 | `PENDING` | `execution_id = "netmaker-<uuid>"` |
| Background task starts | `RUNNING` | First thing runDeviceBackground() does |
| Netmaker call succeeds | `SUCCESS` | For INSERT: also updates `device_ip_address` in the job row |
| Any thrown error | `FAILED` | `error_message` set to the exception message |

The `network_name` column in `device_jobs` is left `null` on insert — a DB trigger backfills it from `network_id` (same as kestra-call).

## network_jobs lifecycle

Mirrors the device lifecycle. The Deployments UI reads these via the `get_network_jobs` RPC.

| Phase | status | Notes |
|---|---|---|
| Row inserted synchronously before 202 | `PENDING` | `execution_id = "netmaker-<uuid>"` |
| Background task starts | `RUNNING` | First thing runNetworkBackground() does |
| Netmaker call succeeds | `SUCCESS` | |
| Any thrown error | `FAILED` | `error_message` set to the exception message |

**network_jobs has no backfill trigger for `network_name`.** The function sets `network_name` explicitly from `rec.name` when inserting the PENDING row. `network_cidr`, `network_ipv4`, and `network_ipv6` are also set from the record at insert time.

## Device INSERT flow (CREATE extclient)

1. GET `/extclients/{network}` — find any existing entry with matching `clientid` (idempotent).
2. If not found: GET `/nodes/{network}` — pick the first node where `isingressgateway === true || is_gw === true`; that node's `id` is the gateway.
3. POST `/extclients/{network}/{gatewayId}` with `{ clientid, enabled: true }`.
4. GET `/extclients/{network}` again — find the authoritative object by `clientid`. The POST response is NOT used for key extraction (Netmaker does not always return the full object).
5. Extract `privatekey`, `publickey`, `address` (IP may be absent — tolerated).
6. UPDATE `devices` SET `private_key`, `public_key`, `updated_at`, and `ip_address` (if address present).

## Device DELETE flow (REMOVE extclient)

DELETE `/extclients/{network}/{clientid}`. The `netmakerRequest` helper treats HTTP 404 and HTTP 500 with `Message: "no result found"` as success (idempotent). No device row to update — it is already gone.

## Network INSERT / UPDATE flow (state present — create or update)

1. Guard: `ipv4_cidr` must be non-null/non-empty; if missing, throw and set job FAILED.
2. Build desired = `{ netid, addressrange: ipv4_cidr }` (plus `addressrange6: ipv6_cidr` if set).
3. GET `/networks/{netid}` — check if network exists.
4. If null (not found) → POST `/networks` with desired body.
5. If exists and `addressrange` (and `addressrange6` if provided) already match → no-op.
6. If exists and fields differ → PUT `/networks/{netid}` with `{ ...existingObject, ...desired }` (mirrors the Ansible module's `update_network`).

No write-back to the `networks` table — the function never UPDATEs `networks`. This makes it safe to fire on UPDATE events without creating a trigger loop.

## Network DELETE flow (state absent)

DELETE `/networks/{netid}`. Idempotent via the same 404/500-"no result found" handling.

## Known footguns

1. **Master key is hardcoded as a fallback.** `NETMAKER_MASTER_KEY` has a non-empty default value in the source. If the env var is absent the real key is exposed in the source file. Externalise properly before production — ensure the env var is always set in docker-compose and remove the default.

2. **Ingress gateway dependency (devices).** The target network must already exist in Netmaker with at least one node configured as an ingress gateway. If there is no ingress gateway the INSERT flow throws `"No ingress gateway found in network <id>"` and the job is set to FAILED. The error message is surfaced in `device_jobs.error_message`.

3. **`ipv4_cidr` required for network create.** If a `networks` row has no `ipv4_cidr`, the INSERT/UPDATE flow throws `"network <netid> has no ipv4_cidr — cannot create a Netmaker network without an address range"` and sets the job FAILED.

4. **Read-back after create (devices).** The function never trusts the POST `/extclients/…` response for WireGuard keys. It always does a second GET to find the canonical object. If that second GET still cannot locate the extclient the job is set to FAILED.

5. **No polling / no timeout.** Unlike kestra-call, there is no long-running poll loop. The entire Netmaker operation is synchronous inside the background function and completes in one or two HTTP round-trips. The worker timeout in `main/index.ts` (60s) is far more than enough.

6. **DELETE uses `old_record`.** Standard Supabase webhook shape for DELETE events has `record: null`. The function reads from `old_record`. A misconfigured webhook that sends DELETE without `old_record` returns 400.

## Restart and verify

```bash
cd /home/oriol/iotgw-ng/supabase && docker compose restart functions
docker compose logs -f supabase-edge-functions
```

Smoke-test — device INSERT:
```bash
curl -X POST http://wsl.ymbihq.local:8000/functions/v1/netmaker-call \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "devices",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "name": "zz-test-device",
      "network_id": "00000000-0000-0000-0000-000000000002"
    },
    "old_record": null
  }'
```

Smoke-test — network INSERT:
```bash
curl -X POST http://wsl.ymbihq.local:8000/functions/v1/netmaker-call \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "networks",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000003",
      "name": "zz-test-network",
      "ipv4_cidr": "10.99.0.0/24"
    },
    "old_record": null
  }'
```

The response is 202 immediately. Check `device_jobs` / `network_jobs` for the final status.
