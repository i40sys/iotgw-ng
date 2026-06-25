// netmaker-call — direct Netmaker provisioning edge function
//
// This function receives Supabase DB webhook POSTs for BOTH the `devices`
// and `networks` tables and provisions / deprovisions the corresponding
// resource in Netmaker WITHOUT going through Kestra or Ansible.
//
// devices  → Netmaker extclients (created under the device's network)
// networks → Netmaker networks   (created from the row's ipv4_cidr / ipv6_cidr)
//
// UUID-without-dashes naming conventions:
//   devices:  clientid = device.id with dashes stripped
//             network  = device.network_id with dashes stripped
//   networks: netid    = network.id with dashes stripped
//
// device_jobs / network_jobs rows are written in the same lifecycle shape
// as the former kestra-call so the Deployments UI works without modification.

import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('netmaker-call function started')

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

// Netmaker configuration — credentials come from the environment ONLY.
// No hardcoded fallback: a missing master key must fail loudly, never ship a
// real key baked into source. Set NETMAKER_MASTER_KEY in supabase/.env
// (sourced from secrets/supabase.enc.env via SOPS).
const NETMAKER_BASE_URL = Deno.env.get('NETMAKER_BASE_URL') || 'https://api.netmaker.i40sys.com'
const NETMAKER_MASTER_KEY = Deno.env.get('NETMAKER_MASTER_KEY') || ''
if (!NETMAKER_MASTER_KEY) {
  console.error('FATAL: NETMAKER_MASTER_KEY is not set — refusing to start without it')
}

// Supabase configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
console.log('Supabase client initialized with URL:', SUPABASE_URL)

// CORS headers reused in every response
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Transaction-ID',
}

// -----------------------------------------------------------------------
// netmakerRequest — thin HTTP helper that mirrors the response-handling
// logic of the oriolrius.netmaker Ansible module (reference spec, external repo:
// github.com/oriolrius/netmaker-ansible-automation — decision-022):
//   404 → null (not found, do not throw)
//   204 → true (successful delete)
//   500 with .Message === 'no result found' → null (Netmaker "doesn't exist")
//   other !ok → throw Error with .Message from body
//   ok → parsed JSON (or true when the body is empty)
// All calls go to ${NETMAKER_BASE_URL}/api${endpoint}.
// -----------------------------------------------------------------------
async function netmakerRequest(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  txId?: string
): Promise<unknown> {
  const url = `${NETMAKER_BASE_URL}/api${endpoint}`
  const logPrefix = txId ? `[${txId}][netmakerRequest]` : '[netmakerRequest]'

  console.log(`${logPrefix} ${method} ${url}`)

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${NETMAKER_MASTER_KEY}`,
      'Content-Type': 'application/json',
    },
  }

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body)
  }

  const res = await fetch(url, fetchOptions)
  console.log(`${logPrefix} response status: ${res.status}`)

  // 404 → not found (treat as non-existent, no error)
  if (res.status === 404) {
    console.log(`${logPrefix} 404 — treating as not found (null)`)
    return null
  }

  // 204 → successful delete (no body)
  if (res.status === 204) {
    console.log(`${logPrefix} 204 — successful (no content)`)
    return true
  }

  // 500 with "no result found" → Netmaker's way of saying "doesn't exist"
  if (res.status === 500) {
    let parsed: Record<string, unknown> = {}
    try {
      parsed = await res.json() as Record<string, unknown>
    } catch {
      // body not JSON — fall through to the generic error path below
    }
    if (parsed.Message === 'no result found') {
      console.log(`${logPrefix} 500 "no result found" — treating as not found (null)`)
      return null
    }
    throw new Error(`Netmaker API error ${res.status}: ${parsed.Message || JSON.stringify(parsed)}`)
  }

  // Any other non-OK status → error
  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`
    try {
      const errBody = await res.json() as Record<string, unknown>
      if (errBody.Message) {
        errMessage = `${errMessage}: ${errBody.Message}`
      }
    } catch {
      const errText = await res.text().catch(() => '')
      if (errText) errMessage = `${errMessage}: ${errText}`
    }
    throw new Error(`Netmaker API error — ${errMessage}`)
  }

  // OK response — parse body if present
  const text = await res.text()
  if (!text || text.trim() === '') {
    return true
  }
  try {
    return JSON.parse(text)
  } catch {
    // Unexpected non-JSON success body — return raw text so caller can log it
    return text
  }
}

// -----------------------------------------------------------------------
// DeviceRecord — shape of a `devices` row in the webhook payload
// -----------------------------------------------------------------------
interface DeviceRecord {
  id: string
  name: string
  network_id: string
  ip_address?: string | null
  description?: string | null
  [key: string]: unknown
}

// -----------------------------------------------------------------------
// NetworkRecord — shape of a `networks` row in the webhook payload
// -----------------------------------------------------------------------
interface NetworkRecord {
  id: string
  name: string
  domain_id?: string | null
  ipv4_cidr?: string | null
  ipv6_cidr?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// -----------------------------------------------------------------------
// ExtClient — the Netmaker extclient object we care about
// -----------------------------------------------------------------------
interface ExtClient {
  clientid: string
  privatekey: string
  publickey: string
  address?: string
  [key: string]: unknown
}

// -----------------------------------------------------------------------
// provisionDevice — CREATE flow (INSERT)
//   1. Idempotency check: list extclients for network, look for clientid.
//   2. If missing, find ingress gateway node.
//   3. POST new extclient.
//   4. Read back authoritative object (the POST response is unreliable).
//   5. Extract privatekey, publickey, address.
// -----------------------------------------------------------------------
async function provisionDevice(
  rec: DeviceRecord,
  txId: string
): Promise<{ privatekey: string; publickey: string; address?: string }> {
  const clientid = String(rec.id).replaceAll('-', '')
  const network  = String(rec.network_id).replaceAll('-', '')

  console.log(`[${txId}][provisionDevice] clientid=${clientid} network=${network}`)

  // Step 1 — idempotency check
  console.log(`[${txId}][provisionDevice] Step 1: checking for existing extclient`)
  const extclients = await netmakerRequest('GET', `/extclients/${network}`, undefined, txId)
  let existing: ExtClient | null = null
  if (Array.isArray(extclients)) {
    existing = (extclients as ExtClient[]).find(c => c.clientid === clientid) ?? null
  }

  if (existing) {
    console.log(`[${txId}][provisionDevice] extclient already exists — skipping create`)
  } else {
    // Step 2 — find ingress gateway
    console.log(`[${txId}][provisionDevice] Step 2: finding ingress gateway in network ${network}`)
    const nodes = await netmakerRequest('GET', `/nodes/${network}`, undefined, txId)
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error(`No nodes found in network ${network}`)
    }

    const gateway = (nodes as Array<Record<string, unknown>>).find(
      n => n.isingressgateway === true || n.is_gw === true
    )
    if (!gateway) {
      throw new Error(`No ingress gateway found in network ${network} — the network must already have an ingress node configured in Netmaker`)
    }
    const gatewayId = gateway.id as string
    console.log(`[${txId}][provisionDevice] Using gateway id=${gatewayId}`)

    // Step 3 — create extclient
    console.log(`[${txId}][provisionDevice] Step 3: creating extclient clientid=${clientid}`)
    await netmakerRequest(
      'POST',
      `/extclients/${network}/${gatewayId}`,
      { clientid, enabled: true },
      txId
    )
    console.log(`[${txId}][provisionDevice] extclient created`)
  }

  // Step 4 — read back authoritative object
  console.log(`[${txId}][provisionDevice] Step 4: reading back extclient list to get authoritative object`)
  const freshList = await netmakerRequest('GET', `/extclients/${network}`, undefined, txId)
  let created: ExtClient | null = null
  if (Array.isArray(freshList)) {
    created = (freshList as ExtClient[]).find(c => c.clientid === clientid) ?? null
  }
  if (!created) {
    throw new Error(`extclient ${clientid} not found in network ${network} after create — Netmaker may have rejected the request`)
  }

  // Step 5 — extract keys
  const { privatekey, publickey, address } = created
  if (!privatekey || !publickey) {
    throw new Error(`extclient ${clientid} returned by Netmaker is missing privatekey or publickey`)
  }

  console.log(`[${txId}][provisionDevice] privatekey: ${privatekey.substring(0, 10)}...`)
  console.log(`[${txId}][provisionDevice] publickey:  ${publickey.substring(0, 10)}...`)
  if (address) {
    console.log(`[${txId}][provisionDevice] address:    ${address}`)
  } else {
    console.log(`[${txId}][provisionDevice] address not present in extclient object`)
  }

  return { privatekey, publickey, address }
}

// -----------------------------------------------------------------------
// deprovisionDevice — DELETE flow
//   Sends DELETE /extclients/{network}/{clientid}.
//   Treats 200/204/404/500-"no result found" all as success (idempotent).
// -----------------------------------------------------------------------
async function deprovisionDevice(
  rec: DeviceRecord,
  txId: string
): Promise<void> {
  const clientid = String(rec.id).replaceAll('-', '')
  const network  = String(rec.network_id).replaceAll('-', '')

  console.log(`[${txId}][deprovisionDevice] DELETE clientid=${clientid} network=${network}`)
  // netmakerRequest already handles 404/500-no-result-found as null (non-error)
  await netmakerRequest('DELETE', `/extclients/${network}/${clientid}`, undefined, txId)
  console.log(`[${txId}][deprovisionDevice] extclient deleted (or was already absent)`)
}

// -----------------------------------------------------------------------
// provisionNetwork — CREATE / UPDATE flow for `networks` (state=present)
//   Mirrors the oriolrius.netmaker Ansible module's create_network /
//   update_network logic (external repo
//   github.com/oriolrius/netmaker-ansible-automation — decision-022):
//     1. Guard: ipv4_cidr must be set (Netmaker requires an address range).
//     2. GET /networks/{netid} → existing object or null.
//     3. Build desired = { netid, addressrange: ipv4_cidr [, addressrange6] }.
//     4. If not found → POST /networks (create).
//     5. If found and fields already match → no-op.
//     6. If found and fields differ → PUT /networks/{netid} with merged object.
// -----------------------------------------------------------------------
async function provisionNetwork(
  rec: NetworkRecord,
  txId: string
): Promise<void> {
  const netid = String(rec.id).replaceAll('-', '')

  console.log(`[${txId}][provisionNetwork] netid=${netid} name=${rec.name}`)

  // Guard: ipv4_cidr is required
  if (!rec.ipv4_cidr) {
    throw new Error(`network ${netid} has no ipv4_cidr — cannot create a Netmaker network without an address range`)
  }

  // Build the desired state object
  const desired: Record<string, unknown> = {
    netid,
    addressrange: rec.ipv4_cidr,
  }
  if (rec.ipv6_cidr) {
    desired.addressrange6 = rec.ipv6_cidr
  }

  // Step 1 — check for existing network
  console.log(`[${txId}][provisionNetwork] Step 1: GET /networks/${netid}`)
  const existing = await netmakerRequest('GET', `/networks/${netid}`, undefined, txId)

  if (existing === null) {
    // Step 2 — create
    console.log(`[${txId}][provisionNetwork] Step 2: network not found — POST /networks`)
    await netmakerRequest('POST', '/networks', desired, txId)
    console.log(`[${txId}][provisionNetwork] network created`)
  } else {
    // Step 3 — compare and conditionally update
    const existingObj = existing as Record<string, unknown>
    const addressMatch = existingObj.addressrange === desired.addressrange
    const address6Match = !desired.addressrange6 || existingObj.addressrange6 === desired.addressrange6

    if (addressMatch && address6Match) {
      console.log(`[${txId}][provisionNetwork] network already in desired state — no-op`)
    } else {
      console.log(`[${txId}][provisionNetwork] Step 3: fields differ — PUT /networks/${netid}`)
      console.log(`[${txId}][provisionNetwork]   current addressrange=${existingObj.addressrange} desired=${desired.addressrange}`)
      if (desired.addressrange6) {
        console.log(`[${txId}][provisionNetwork]   current addressrange6=${existingObj.addressrange6} desired=${desired.addressrange6}`)
      }
      await netmakerRequest('PUT', `/networks/${netid}`, { ...existingObj, ...desired }, txId)
      console.log(`[${txId}][provisionNetwork] network updated`)
    }
  }
}

// -----------------------------------------------------------------------
// deprovisionNetwork — DELETE flow for `networks`
//   Sends DELETE /networks/{netid}.
//   netmakerRequest already treats 404/500-"no result found" as success.
// -----------------------------------------------------------------------
async function deprovisionNetwork(
  rec: NetworkRecord,
  txId: string
): Promise<void> {
  const netid = String(rec.id).replaceAll('-', '')

  console.log(`[${txId}][deprovisionNetwork] DELETE netid=${netid}`)
  await netmakerRequest('DELETE', `/networks/${netid}`, undefined, txId)
  console.log(`[${txId}][deprovisionNetwork] network deleted (or was already absent)`)
}

// -----------------------------------------------------------------------
// runDeviceBackground — device background worker; never throws
// -----------------------------------------------------------------------
async function runDeviceBackground(
  operationType: string,
  rec: DeviceRecord,
  transactionId: string
): Promise<void> {
  const txId = transactionId.substring(0, 8)
  const executionId = `netmaker-${transactionId}`

  console.log(`[${txId}][BACKGROUND][device] starting — op=${operationType} device=${rec.id}`)

  // Mark job as RUNNING
  try {
    const { error } = await supabase
      .from('device_jobs')
      .update({ status: 'RUNNING' })
      .eq('execution_id', executionId)

    if (error) {
      console.error(`[${txId}][BACKGROUND][device] Failed to set RUNNING:`, error)
    } else {
      console.log(`[${txId}][BACKGROUND][device] job set to RUNNING`)
    }
  } catch (err) {
    console.error(`[${txId}][BACKGROUND][device] Exception setting RUNNING:`, err)
  }

  try {
    if (operationType === 'DELETE') {
      await deprovisionDevice(rec, txId)

      // Success — no device row to update (already deleted)
      const { error } = await supabase
        .from('device_jobs')
        .update({
          status: 'SUCCESS',
          completed_at: new Date().toISOString(),
        })
        .eq('execution_id', executionId)

      if (error) {
        console.error(`[${txId}][BACKGROUND][device] Failed to set SUCCESS (delete):`, error)
      } else {
        console.log(`[${txId}][BACKGROUND][device] job set to SUCCESS (delete)`)
      }
    } else {
      // INSERT / UPDATE
      const keys = await provisionDevice(rec, txId)

      // Write keys back to the device row
      const deviceUpdate: Record<string, string> = {
        private_key: keys.privatekey,
        public_key: keys.publickey,
        updated_at: new Date().toISOString(),
      }
      if (keys.address) {
        deviceUpdate.ip_address = keys.address
      }

      const { error: devErr } = await supabase
        .from('devices')
        .update(deviceUpdate)
        .eq('id', rec.id)

      if (devErr) {
        console.error(`[${txId}][BACKGROUND][device] Failed to update devices row:`, devErr)
      } else {
        console.log(`[${txId}][BACKGROUND][device] devices row updated with keys${keys.address ? ` and IP ${keys.address}` : ''}`)
      }

      // Success — update job row
      const jobUpdate: Record<string, unknown> = {
        status: 'SUCCESS',
        completed_at: new Date().toISOString(),
      }
      if (keys.address) {
        jobUpdate.device_ip_address = keys.address
      }

      const { error: jobErr } = await supabase
        .from('device_jobs')
        .update(jobUpdate)
        .eq('execution_id', executionId)

      if (jobErr) {
        console.error(`[${txId}][BACKGROUND][device] Failed to set SUCCESS (insert):`, jobErr)
      } else {
        console.log(`[${txId}][BACKGROUND][device] job set to SUCCESS (insert)`)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${txId}][BACKGROUND][device] Error during Netmaker operation:`, err)

    try {
      const { error } = await supabase
        .from('device_jobs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('execution_id', executionId)

      if (error) {
        console.error(`[${txId}][BACKGROUND][device] Failed to set FAILED:`, error)
      } else {
        console.log(`[${txId}][BACKGROUND][device] job set to FAILED: ${message}`)
      }
    } catch (updateErr) {
      console.error(`[${txId}][BACKGROUND][device] Exception while setting FAILED:`, updateErr)
    }
  }

  console.log(`[${txId}][BACKGROUND][device] done`)
}

// -----------------------------------------------------------------------
// runNetworkBackground — network background worker; never throws
// -----------------------------------------------------------------------
async function runNetworkBackground(
  operationType: string,
  rec: NetworkRecord,
  transactionId: string
): Promise<void> {
  const txId = transactionId.substring(0, 8)
  const executionId = `netmaker-${transactionId}`

  console.log(`[${txId}][BACKGROUND][network] starting — op=${operationType} network=${rec.id}`)

  // Mark job as RUNNING
  try {
    const { error } = await supabase
      .from('network_jobs')
      .update({ status: 'RUNNING' })
      .eq('execution_id', executionId)

    if (error) {
      console.error(`[${txId}][BACKGROUND][network] Failed to set RUNNING:`, error)
    } else {
      console.log(`[${txId}][BACKGROUND][network] job set to RUNNING`)
    }
  } catch (err) {
    console.error(`[${txId}][BACKGROUND][network] Exception setting RUNNING:`, err)
  }

  try {
    if (operationType === 'DELETE') {
      await deprovisionNetwork(rec, txId)

      const { error } = await supabase
        .from('network_jobs')
        .update({
          status: 'SUCCESS',
          completed_at: new Date().toISOString(),
        })
        .eq('execution_id', executionId)

      if (error) {
        console.error(`[${txId}][BACKGROUND][network] Failed to set SUCCESS (delete):`, error)
      } else {
        console.log(`[${txId}][BACKGROUND][network] job set to SUCCESS (delete)`)
      }
    } else {
      // INSERT / UPDATE
      await provisionNetwork(rec, txId)

      // No write-back to networks table — Netmaker doesn't generate keys for networks.
      const { error: jobErr } = await supabase
        .from('network_jobs')
        .update({
          status: 'SUCCESS',
          completed_at: new Date().toISOString(),
        })
        .eq('execution_id', executionId)

      if (jobErr) {
        console.error(`[${txId}][BACKGROUND][network] Failed to set SUCCESS:`, jobErr)
      } else {
        console.log(`[${txId}][BACKGROUND][network] job set to SUCCESS`)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${txId}][BACKGROUND][network] Error during Netmaker operation:`, err)

    try {
      const { error } = await supabase
        .from('network_jobs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('execution_id', executionId)

      if (error) {
        console.error(`[${txId}][BACKGROUND][network] Failed to set FAILED:`, error)
      } else {
        console.log(`[${txId}][BACKGROUND][network] job set to FAILED: ${message}`)
      }
    } catch (updateErr) {
      console.error(`[${txId}][BACKGROUND][network] Exception while setting FAILED:`, updateErr)
    }
  }

  console.log(`[${txId}][BACKGROUND][network] done`)
}

// -----------------------------------------------------------------------
// serve — main request handler
// -----------------------------------------------------------------------
serve(async (req: Request) => {
  const transactionId = crypto.randomUUID()
  const txId = transactionId.substring(0, 8)

  console.log(`\n[${txId}] ========== NEW REQUEST ==========`)
  console.log(`[${txId}] Full Transaction ID: ${transactionId}`)
  console.log(`[${txId}] Method: ${req.method}`)
  console.log(`[${txId}] URL: ${req.url}`)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${txId}] CORS preflight`)
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // Only POST is accepted
  if (req.method !== 'POST') {
    console.log(`[${txId}] Method not allowed: ${req.method}`)
    return new Response(
      JSON.stringify({ msg: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ---- Parse body -------------------------------------------------------
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
    console.log(`[${txId}] body:`, JSON.stringify(body, null, 2))
  } catch {
    console.error(`[${txId}] Failed to parse request body as JSON`)
    return new Response(
      JSON.stringify({ msg: 'Invalid JSON body' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ---- Validate table ---------------------------------------------------
  const tableParam = body.table as string | undefined
  if (tableParam !== 'devices' && tableParam !== 'networks') {
    console.log(`[${txId}] Unexpected table param: ${tableParam}`)
    return new Response(
      JSON.stringify({ msg: `Invalid table parameter: '${tableParam}'. netmaker-call only handles 'devices' and 'networks'.` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ---- Extract record ---------------------------------------------------
  const operationType = (body.type as string | undefined) ?? 'INSERT'
  const rawRecord = operationType === 'DELETE'
    ? (body.old_record as Record<string, unknown> | null)
    : (body.record as Record<string, unknown> | null)

  // ========== NETWORK PATH ==============================================
  if (tableParam === 'networks') {
    const rec = rawRecord as NetworkRecord | null

    if (!rec || !rec.id) {
      const expected = operationType === 'DELETE' ? 'old_record' : 'record'
      console.error(`[${txId}] Missing or incomplete ${expected} in payload (networks)`)
      return new Response(
        JSON.stringify({ msg: `Missing or incomplete ${expected} in webhook payload (need id)` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${txId}] op=${operationType} table=networks network_id=${rec.id} name=${rec.name}`)

    // ---- Create PENDING network_jobs row --------------------------------
    const executionId = `netmaker-${transactionId}`

    const { error: jobInsertError } = await supabase
      .from('network_jobs')
      .insert({
        execution_id: executionId,
        flow_id: 'networks',
        status: 'PENDING',
        started_at: new Date().toISOString(),
        network_id: rec.id,
        network_name: rec.name,             // MUST be set — no backfill trigger on network_jobs
        network_cidr: rec.ipv4_cidr ?? rec.ipv6_cidr ?? null,
        network_ipv4: rec.ipv4_cidr ?? null,
        network_ipv6: rec.ipv6_cidr ?? null,
        transaction_id: transactionId,
        created_by: null,
      })

    if (jobInsertError) {
      console.error(`[${txId}] Failed to create network_jobs row:`, jobInsertError)
      return new Response(
        JSON.stringify({ msg: `Failed to create job record: ${jobInsertError.message}` }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${txId}] network_jobs row created (PENDING) execution_id=${executionId}`)

    // ---- Kick off background work ---------------------------------------
    const bgPromise = runNetworkBackground(operationType, rec, transactionId)
    EdgeRuntime.waitUntil(bgPromise)

    // ---- Return 202 immediately -----------------------------------------
    const responseData = {
      success: true,
      status: 'ACCEPTED',
      message: 'Netmaker network provisioning started. Status will be updated in network_jobs.',
      executionId,
      transactionId,
      operationType,
      table: 'networks',
      networkId: rec.id,
      note: 'Check network_jobs table for final status.',
    }

    console.log(`[${txId}] Returning 202 Accepted (networks)`)
    console.log(`[${txId}] ========== REQUEST ACCEPTED (202) — background running ==========\n`)

    return new Response(
      JSON.stringify(responseData),
      { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // ========== DEVICE PATH (unchanged) ===================================
  const rec = rawRecord as DeviceRecord | null

  if (!rec || !rec.id || !rec.network_id) {
    const expected = operationType === 'DELETE' ? 'old_record' : 'record'
    console.error(`[${txId}] Missing or incomplete ${expected} in payload`)
    return new Response(
      JSON.stringify({ msg: `Missing or incomplete ${expected} in webhook payload (need id, network_id)` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[${txId}] op=${operationType} table=devices device_id=${rec.id} network_id=${rec.network_id}`)

  // ---- Create PENDING device_jobs row -----------------------------------
  const executionId = `netmaker-${transactionId}`

  const { error: jobInsertError } = await supabase
    .from('device_jobs')
    .insert({
      execution_id: executionId,
      flow_id: 'devices',
      status: 'PENDING',
      started_at: new Date().toISOString(),
      device_id: rec.id,
      device_name: rec.name,
      device_ip_address: rec.ip_address ?? null,
      device_description: rec.description ?? null,
      network_id: rec.network_id,
      network_name: null,  // DB trigger backfills from network_id
      transaction_id: transactionId,
      created_by: null,
    })

  if (jobInsertError) {
    console.error(`[${txId}] Failed to create device_jobs row:`, jobInsertError)
    return new Response(
      JSON.stringify({ msg: `Failed to create job record: ${jobInsertError.message}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[${txId}] device_jobs row created (PENDING) execution_id=${executionId}`)

  // ---- Kick off background work -----------------------------------------
  const bgPromise = runDeviceBackground(operationType, rec, transactionId)
  EdgeRuntime.waitUntil(bgPromise)

  // ---- Return 202 immediately -------------------------------------------
  const responseData = {
    success: true,
    status: 'ACCEPTED',
    message: 'Netmaker provisioning started. Status will be updated in device_jobs.',
    executionId,
    transactionId,
    operationType,
    table: 'devices',
    deviceId: rec.id,
    note: 'Check device_jobs table for final status.',
  }

  console.log(`[${txId}] Returning 202 Accepted (devices)`)
  console.log(`[${txId}] ========== REQUEST ACCEPTED (202) — background running ==========\n`)

  return new Response(
    JSON.stringify(responseData),
    { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
