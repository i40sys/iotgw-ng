// kestra-dispatch — edge-function→Kestra durable-execution handoff
//
// Receives Supabase DB webhook POSTs for the `deployments` table (INSERT only)
// and dispatches the corresponding long-running work as a Kestra flow execution.
//
// This is the "thin handoff" pattern per decision-016 §6:
//   webhook → kestra-dispatch → DB lookups (device/network/domain)
//   → insert deployment_jobs PENDING row (synchronous, before 202)
//   → return 202 immediately
//   → background: POST /api/v1/{tenant}/executions/{namespace}/{flowId}
//   → update job row with real Kestra execution_id (via error_message field)
//   → Kestra flow finishes → writes back deployment_jobs status via PostgREST
//
// PENDING row uses `kestra-dispatch-<uuid>` as its execution_id (the
// placeholder). The real Kestra execution UUID is inserted as a SEPARATE row
// once the trigger call succeeds. The Kestra write-back task reconciles the
// real row to SUCCESS/FAILED.
//
// Env required:
//   SUPABASE_URL           — http://kong:8000 (in-cluster)
//   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
//   KESTRA_BASE_URL        — http://kestra:8080 (in-cluster Service)
//   KESTRA_USER            — basic-auth username
//   KESTRA_PASSWORD        — basic-auth password
// Env optional:
//   KESTRA_DISPATCH_FLOW_ID — override the target flow (default: k8s-ansible-runner-test)
//   KESTRA_TENANT           — Kestra tenant (default: main)
//   KESTRA_NAMESPACE        — Kestra namespace (default: iotgw-ng)

import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('kestra-dispatch function started')

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

// Kestra configuration — all credentials from env, no inline fallbacks for secrets.
const KESTRA_BASE_URL = Deno.env.get('KESTRA_BASE_URL') || ''
const KESTRA_USER = Deno.env.get('KESTRA_USER') || ''
const KESTRA_PASSWORD = Deno.env.get('KESTRA_PASSWORD') || ''
const KESTRA_TENANT = Deno.env.get('KESTRA_TENANT') || 'main'
const KESTRA_NAMESPACE = Deno.env.get('KESTRA_NAMESPACE') || 'iotgw-ng'
// Default to the test flow; set KESTRA_DISPATCH_FLOW_ID='provisioning' for real deploys.
const KESTRA_DISPATCH_FLOW_ID = Deno.env.get('KESTRA_DISPATCH_FLOW_ID') || 'k8s-ansible-runner-test'

if (!KESTRA_BASE_URL) {
  console.error('FATAL: KESTRA_BASE_URL is not set')
}
if (!KESTRA_USER || !KESTRA_PASSWORD) {
  console.error('FATAL: KESTRA_USER / KESTRA_PASSWORD are not set')
}

// Supabase configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
console.log('Supabase client initialized with URL:', SUPABASE_URL)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Transaction-ID',
}

// -----------------------------------------------------------------------
// DeploymentRecord — shape of a `deployments` row in the webhook payload
// -----------------------------------------------------------------------
interface DeploymentRecord {
  id: string
  device_id: string
  name: string
  configuration: Record<string, unknown>
  version: string
  short?: string | null
  description?: string | null
  created_at?: string | null
  created_by?: string | null
  [key: string]: unknown
}

// Snapshot of the entities we look up before creating the job row
interface DeploymentContext {
  device: {
    id: string
    name: string
    description: string | null
    ip_address: string | null
    network_id: string
    ssh_key_id: string | null
  }
  network: {
    id: string
    name: string
    ipv4_cidr: string | null
    ipv6_cidr: string | null
    domain_id: string
  }
  domain: {
    id: string
    name: string
    display_name: string
  }
}

// -----------------------------------------------------------------------
// fetchDeploymentContext — resolve device → network → domain for a deployment
// -----------------------------------------------------------------------
async function fetchDeploymentContext(
  rec: DeploymentRecord,
  txId: string
): Promise<DeploymentContext> {
  console.log(`[${txId}] fetching device ${rec.device_id}`)
  const { data: device, error: deviceErr } = await supabase
    .from('devices')
    .select('id, name, description, ip_address, network_id, ssh_key_id')
    .eq('id', rec.device_id)
    .single()

  if (deviceErr || !device) {
    throw new Error(`Device ${rec.device_id} not found: ${deviceErr?.message ?? 'null'}`)
  }

  console.log(`[${txId}] fetching network ${device.network_id}`)
  const { data: network, error: networkErr } = await supabase
    .from('networks')
    .select('id, name, ipv4_cidr, ipv6_cidr, domain_id')
    .eq('id', device.network_id)
    .single()

  if (networkErr || !network) {
    throw new Error(`Network ${device.network_id} not found: ${networkErr?.message ?? 'null'}`)
  }

  console.log(`[${txId}] fetching domain ${network.domain_id}`)
  const { data: domain, error: domainErr } = await supabase
    .from('domains')
    .select('id, name, display_name')
    .eq('id', network.domain_id)
    .single()

  if (domainErr || !domain) {
    throw new Error(`Domain ${network.domain_id} not found: ${domainErr?.message ?? 'null'}`)
  }

  return { device, network, domain }
}

// -----------------------------------------------------------------------
// insertJobRow — insert a deployment_jobs row via the create_deployment_job RPC
// -----------------------------------------------------------------------
async function insertJobRow(
  executionId: string,
  status: string,
  rec: DeploymentRecord,
  ctx: DeploymentContext,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase.rpc('create_deployment_job', {
    p_execution_id: executionId,
    p_flow_id: `${KESTRA_NAMESPACE}/${KESTRA_DISPATCH_FLOW_ID}`,
    p_status: status,
    p_started_at: new Date().toISOString(),
    p_device_id: ctx.device.id,
    p_device_name: ctx.device.name,
    p_device_description: ctx.device.description ?? '',
    p_device_ip_address: ctx.device.ip_address ?? '0.0.0.0',
    p_network_id: ctx.network.id,
    p_network_name: ctx.network.name,
    p_network_cidr: '',
    p_network_ipv4: ctx.network.ipv4_cidr ?? '',
    p_network_ipv6: ctx.network.ipv6_cidr ?? '',
    p_domain_id: ctx.domain.id,
    p_domain_name: ctx.domain.name,
    p_domain_display_name: ctx.domain.display_name,
    p_deployment_id: rec.id,
    p_deployment_name: rec.name,
    p_deployment_version: rec.version,
    p_configuration_json: rec.configuration ?? {},
    p_ssh_key_id: ctx.device.ssh_key_id ?? null,
  })
  if (error) {
    throw new Error(`Failed to insert deployment_jobs row (exec=${executionId}): ${error.message}`)
  }
}

// -----------------------------------------------------------------------
// triggerKestraFlow — POST to Kestra REST API to start a flow execution.
//   Returns the Kestra execution id (string) on success.
//   Throws on HTTP error.
//
//   Endpoint: POST /api/v1/{tenant}/executions/{namespace}/{flowId}
//   Auth: HTTP Basic (KESTRA_USER / KESTRA_PASSWORD).
//   Body: omitted for flows with no inputs (e.g. k8s-ansible-runner-test).
// -----------------------------------------------------------------------
async function triggerKestraFlow(
  flowId: string,
  inputs: Record<string, string> | null,
  txId: string
): Promise<string> {
  const url = `${KESTRA_BASE_URL}/api/v1/${KESTRA_TENANT}/executions/${KESTRA_NAMESPACE}/${flowId}`
  const authHeader = 'Basic ' + btoa(`${KESTRA_USER}:${KESTRA_PASSWORD}`)

  console.log(`[${txId}][triggerKestraFlow] POST ${url}`)

  let body: BodyInit | undefined
  const headers: Record<string, string> = {
    Authorization: authHeader,
  }

  if (inputs && Object.keys(inputs).length > 0) {
    // Flows with inputs get multipart/form-data (same pattern as the backend
    // executeKestraDeployment in deployments.ts:~748).
    const formData = new FormData()
    for (const [key, value] of Object.entries(inputs)) {
      formData.append(key, value)
    }
    body = formData
    // Do NOT set Content-Type — FormData sets it with boundary automatically.
  }
  // Flows with no inputs (e.g. k8s-ansible-runner-test): body is omitted.

  const res = await fetch(url, { method: 'POST', headers, body })

  console.log(`[${txId}][triggerKestraFlow] response status: ${res.status}`)

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable>')
    throw new Error(`Kestra trigger failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as Record<string, unknown>
  const executionId = data.id as string | undefined
  if (!executionId) {
    throw new Error(`Kestra response did not contain an execution id: ${JSON.stringify(data)}`)
  }

  console.log(`[${txId}][triggerKestraFlow] execution id: ${executionId}`)
  return executionId
}

// -----------------------------------------------------------------------
// runDispatchBackground — triggers Kestra and inserts the real durable
// deployment_jobs row keyed by the Kestra execution UUID.
//
// Called via EdgeRuntime.waitUntil() after the 202 is sent.
// If the trigger call itself fails, the placeholder PENDING row inserted
// before 202 is set to FAILED (no silent loss — AC #4).
//
// On success, a second row is inserted with the Kestra execution UUID.
// Kestra's write-back task is responsible for setting that row SUCCESS/FAILED.
// -----------------------------------------------------------------------
async function runDispatchBackground(
  rec: DeploymentRecord,
  ctx: DeploymentContext,
  pendingExecId: string,
  transactionId: string
): Promise<void> {
  const txId = transactionId.substring(0, 8)

  console.log(`[${txId}][BACKGROUND] starting — deployment=${rec.id} placeholder=${pendingExecId}`)

  try {
    // Trigger the Kestra flow
    const kestraExecId = await triggerKestraFlow(KESTRA_DISPATCH_FLOW_ID, null, txId)

    // Insert the durable row keyed by the Kestra execution UUID
    console.log(`[${txId}][BACKGROUND] inserting durable job row exec=${kestraExecId}`)
    await insertJobRow(kestraExecId, 'PENDING', rec, ctx)

    // Mark the placeholder as RUNNING and record the Kestra execution id in
    // the error_message field (re-purposed as a cross-reference for tracing).
    const { error: phErr } = await supabase
      .from('deployment_jobs')
      .update({
        status: 'RUNNING',
        error_message: `Kestra execution: ${kestraExecId}`,
      })
      .eq('execution_id', pendingExecId)

    if (phErr) {
      console.error(`[${txId}][BACKGROUND] failed to update placeholder:`, phErr)
    } else {
      console.log(`[${txId}][BACKGROUND] placeholder promoted to RUNNING (ref: ${kestraExecId})`)
    }

    console.log(`[${txId}][BACKGROUND] done — Kestra exec ${kestraExecId} PENDING in deployment_jobs`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${txId}][BACKGROUND] error:`, err)

    // Set the placeholder row to FAILED — no silent loss (AC #4)
    try {
      const { error: failErr } = await supabase
        .from('deployment_jobs')
        .update({
          status: 'FAILED',
          completed_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('execution_id', pendingExecId)

      if (failErr) {
        console.error(`[${txId}][BACKGROUND] failed to set FAILED:`, failErr)
      } else {
        console.log(`[${txId}][BACKGROUND] placeholder set to FAILED: ${message}`)
      }
    } catch (updateErr) {
      console.error(`[${txId}][BACKGROUND] exception while setting FAILED:`, updateErr)
    }
  }

  console.log(`[${txId}][BACKGROUND][kestra-dispatch] done`)
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
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ msg: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
    console.log(`[${txId}] body:`, JSON.stringify(body, null, 2))
  } catch {
    return new Response(
      JSON.stringify({ msg: 'Invalid JSON body' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Validate table allow-list
  const tableParam = body.table as string | undefined
  if (tableParam !== 'deployments') {
    return new Response(
      JSON.stringify({ msg: `Invalid table parameter: '${tableParam}'. kestra-dispatch only handles 'deployments'.` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Only INSERT is handled (no loop risk — we never UPDATE the deployments table)
  const operationType = (body.type as string | undefined) ?? 'INSERT'
  if (operationType !== 'INSERT') {
    return new Response(
      JSON.stringify({ msg: `kestra-dispatch handles INSERT only, got: ${operationType}` }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  const rec = body.record as DeploymentRecord | null
  if (!rec || !rec.id || !rec.device_id) {
    return new Response(
      JSON.stringify({ msg: 'Missing or incomplete record in webhook payload (need id, device_id)' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[${txId}] op=INSERT table=deployments deployment_id=${rec.id} device_id=${rec.device_id}`)

  // Fetch the deployment context (device → network → domain) synchronously.
  // We need this to insert the PENDING placeholder row before returning 202,
  // and we pass the already-fetched data to the background to avoid duplicate
  // DB round-trips.
  let ctx: DeploymentContext
  try {
    ctx = await fetchDeploymentContext(rec, txId)
  } catch (ctxErr) {
    const message = ctxErr instanceof Error ? ctxErr.message : String(ctxErr)
    console.error(`[${txId}] Context lookup failed: ${message}`)
    return new Response(
      JSON.stringify({ msg: `Failed to resolve deployment context: ${message}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  // Insert PENDING placeholder row synchronously before 202.
  // execution_id uses a local UUID prefix to distinguish it from the real
  // Kestra execution UUID that is inserted in the background.
  const pendingExecId = `kestra-dispatch-${transactionId}`

  const { error: jobInsertError } = await supabase.rpc('create_deployment_job', {
    p_execution_id: pendingExecId,
    p_flow_id: `${KESTRA_NAMESPACE}/${KESTRA_DISPATCH_FLOW_ID}`,
    p_status: 'PENDING',
    p_started_at: new Date().toISOString(),
    p_device_id: ctx.device.id,
    p_device_name: ctx.device.name,
    p_device_description: ctx.device.description ?? '',
    p_device_ip_address: ctx.device.ip_address ?? '0.0.0.0',
    p_network_id: ctx.network.id,
    p_network_name: ctx.network.name,
    p_network_cidr: '',
    p_network_ipv4: ctx.network.ipv4_cidr ?? '',
    p_network_ipv6: ctx.network.ipv6_cidr ?? '',
    p_domain_id: ctx.domain.id,
    p_domain_name: ctx.domain.name,
    p_domain_display_name: ctx.domain.display_name,
    p_deployment_id: rec.id,
    p_deployment_name: rec.name,
    p_deployment_version: rec.version,
    p_configuration_json: rec.configuration ?? {},
    p_ssh_key_id: ctx.device.ssh_key_id ?? null,
  })

  if (jobInsertError) {
    console.error(`[${txId}] Failed to create placeholder job row:`, jobInsertError)
    return new Response(
      JSON.stringify({ msg: `Failed to create job record: ${jobInsertError.message}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[${txId}] deployment_jobs PENDING placeholder created exec=${pendingExecId}`)

  // Kick off background: trigger Kestra, write real job row, update placeholder
  const bgPromise = runDispatchBackground(rec, ctx, pendingExecId, transactionId)
  EdgeRuntime.waitUntil(bgPromise)

  // Return 202 immediately
  const responseData = {
    success: true,
    status: 'ACCEPTED',
    message: 'Kestra flow dispatch started. Status will be updated in deployment_jobs.',
    pendingExecutionId: pendingExecId,
    transactionId,
    operationType,
    table: 'deployments',
    deploymentId: rec.id,
    flowId: KESTRA_DISPATCH_FLOW_ID,
    note: 'Check deployment_jobs table for final status (keyed by Kestra execution UUID).',
  }

  console.log(`[${txId}] Returning 202 Accepted (kestra-dispatch)`)
  console.log(`[${txId}] ========== REQUEST ACCEPTED (202) — background running ==========\n`)

  return new Response(
    JSON.stringify(responseData),
    { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  )
})
