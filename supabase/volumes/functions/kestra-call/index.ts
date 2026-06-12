import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('kestra-call function started')

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

// Kestra configuration
const KESTRA_BASE_URL = Deno.env.get('KESTRA_BASE_URL') || 'http://wsl.ymbihq.local:8080'

// Supabase configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
console.log('Supabase client initialized with URL:', SUPABASE_URL)

interface KestraExecutionRequest {
  namespace: string
  flowId: string
  inputs?: Record<string, any>
}

interface KestraExecutionResponse {
  id: string
  namespace: string
  flowId: string
  flowRevision: number
  inputs?: Record<string, any>
  labels?: Array<{
    key: string
    value: string
  }>
  state: {
    current: string
    histories: Array<{
      state: string
      date: string
    }>
    startDate: string
    duration?: string
  }
  originalId: string
  deleted: boolean
  metadata?: Record<string, any>
  url?: string
}

interface KestraExecutionStatus {
  id: string
  namespace: string
  flowId: string
  state: {
    current: string
    histories: Array<{
      state: string
      date: string
    }>
    startDate: string
    endDate?: string
    duration?: string
  }
  outputs?: Record<string, any>
  taskRunList?: Array<{
    id: string
    taskId: string
    state: {
      current: string
    }
    outputs?: Record<string, any>
  }>
}

async function getExecutionStatus(
  namespace: string,
  flowId: string,
  executionId: string,
  transactionId?: string
): Promise<KestraExecutionStatus> {
  const txId = transactionId ? transactionId.substring(0, 8) : ''
  const url = `${KESTRA_BASE_URL}/api/v1/main/executions/${executionId}`
  console.log(`[${txId}][getExecutionStatus] Fetching status for execution ${executionId}`)
  console.log(`[${txId}][getExecutionStatus] URL: ${url}`)

  // Basic authentication credentials
  const username = Deno.env.get('KESTRA_USER') || ''
  const password = Deno.env.get('KESTRA_PASSWORD') || ''
  const credentials = btoa(`${username}:${password}`)
  console.log(`[${txId}][getExecutionStatus] Using basic auth with username: ${username}`)

  console.log(`[${txId}][getExecutionStatus] Sending GET request...`)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
    },
  })

  console.log(`[${txId}][getExecutionStatus] Response status: ${response.status}`)
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[${txId}][getExecutionStatus] Error response: ${errorText}`)
    throw new Error(`Kestra API error getting status: ${response.status} - ${errorText}`)
  }
  
  const statusData = await response.json() as KestraExecutionStatus
  console.log(`[${txId}][getExecutionStatus] Status retrieved - State: ${statusData.state.current}, Duration: ${statusData.state.duration || 'N/A'}`)
  console.log(`[${txId}][getExecutionStatus] Full state object:`, JSON.stringify(statusData.state, null, 2))
  return statusData
}

interface DeviceKeys {
  privatekey: string
  publickey: string
  address?: string
}

async function extractDeviceKeysFromLogs(
  executionId: string,
  transactionId?: string
): Promise<DeviceKeys | null> {
  const txId = transactionId ? transactionId.substring(0, 8) : ''
  const url = `${KESTRA_BASE_URL}/api/v1/logs/${executionId}`
  console.log(`[${txId}][extractDeviceKeys] Fetching logs for execution ${executionId}`)

  // Basic authentication credentials
  const username = Deno.env.get('KESTRA_USER') || ''
  const password = Deno.env.get('KESTRA_PASSWORD') || ''
  const credentials = btoa(`${username}:${password}`)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
      },
    })

    if (!response.ok) {
      console.error(`[${txId}][extractDeviceKeys] Failed to fetch logs: ${response.status}`)
      return null
    }

    const logs = await response.json()
    console.log(`[${txId}][extractDeviceKeys] Fetched ${logs.length} log entries`)

    // Look for JSON-formatted Ansible task output containing "Retrieve created device"
    // New Kestra format has JSON messages with task info
    for (const log of logs) {
      const message = log.message || ''

      // Try to parse the message as JSON
      try {
        const taskData = JSON.parse(message)

        // Check if this is the "Retrieve created device" task
        if (taskData.task === 'Retrieve created device' && taskData.hosts) {
          console.log(`[${txId}][extractDeviceKeys] Found "Retrieve created device" task in JSON format`)

          // Extract resource from the first host result
          const hostResult = taskData.hosts[0]
          if (hostResult?.status === 'ok' && hostResult?.result?.resource) {
            const resource = hostResult.result.resource

            const privatekey = resource.privatekey
            const publickey = resource.publickey
            const ipAddress = [
              resource.address,
              resource.ip_address,
              resource.ipAddress,
              resource.ipaddress,
              resource.ip,
              resource.ipv4_address,
              resource.ipv4,
              resource?.endpoint?.address,
              resource?.interface?.address
            ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)

            if (!privatekey || !publickey) {
              console.log(`[${txId}][extractDeviceKeys] Keys not found in resource object`)
              console.log(`[${txId}][extractDeviceKeys] Resource keys:`, Object.keys(resource))
              return null
            }

            console.log(`[${txId}][extractDeviceKeys] Successfully extracted keys from JSON format`)
            console.log(`[${txId}][extractDeviceKeys] Private key: ${privatekey.substring(0, 10)}...`)
            console.log(`[${txId}][extractDeviceKeys] Public key: ${publickey.substring(0, 10)}...`)
            if (ipAddress) {
              console.log(`[${txId}][extractDeviceKeys] Device IP address: ${ipAddress}`)
            } else {
              console.log(`[${txId}][extractDeviceKeys] Device IP address not present in resource payload`)
            }

            return {
              privatekey,
              publickey,
              address: ipAddress
            }
          }
        }
      } catch {
        // Not a JSON message, continue to check for old text format
      }
    }

    // Fallback: Try the old text-based format for backward compatibility
    console.log(`[${txId}][extractDeviceKeys] JSON format not found, trying legacy text format...`)

    // Filter for Ansible logs (docker-java-stream threads)
    const ansibleLogs = logs.filter((log: any) =>
      log.thread?.startsWith('docker-java-stream')
    )
    console.log(`[${txId}][extractDeviceKeys] Found ${ansibleLogs.length} Ansible log entries`)

    // Find the "Retrieve created device" task in old text format
    let retrieveTaskStartIndex = -1
    for (let i = 0; i < ansibleLogs.length; i++) {
      const message = ansibleLogs[i].message || ''
      if (message.includes('TASK [Retrieve created device]')) {
        retrieveTaskStartIndex = i
        console.log(`[${txId}][extractDeviceKeys] Found "Retrieve created device" task at index ${i}`)
        break
      }
    }

    if (retrieveTaskStartIndex === -1) {
      console.log(`[${txId}][extractDeviceKeys] "Retrieve created device" task not found in logs`)
      return null
    }

    // Collect all log lines from this task until the next TASK or PLAY RECAP
    const taskLines: string[] = []
    for (let i = retrieveTaskStartIndex; i < ansibleLogs.length; i++) {
      const message = ansibleLogs[i].message || ''

      // Stop at the next task or play recap
      if (i > retrieveTaskStartIndex &&
          (message.startsWith('TASK ') || message.startsWith('PLAY RECAP'))) {
        break
      }

      taskLines.push(message)
    }

    console.log(`[${txId}][extractDeviceKeys] Collected ${taskLines.length} lines from the task`)

    // Join all lines and look for the resource JSON object
    const fullTaskOutput = taskLines.join('\n')

    // Find the "resource": { ... } section
    let jsonStartIndex = fullTaskOutput.indexOf('"resource": {')
    if (jsonStartIndex === -1) {
      console.log(`[${txId}][extractDeviceKeys] Could not find resource object start`)
      return null
    }

    // Find the closing brace for the resource object
    let braceCount = 0
    let inResource = false
    let jsonEndIndex = -1

    for (let i = jsonStartIndex; i < fullTaskOutput.length; i++) {
      const char = fullTaskOutput[i]
      if (char === '{') {
        braceCount++
        inResource = true
      } else if (char === '}') {
        braceCount--
        if (inResource && braceCount === 0) {
          jsonEndIndex = i + 1
          break
        }
      }
    }

    if (jsonEndIndex === -1) {
      console.log(`[${txId}][extractDeviceKeys] Could not find resource object end`)
      return null
    }

    let resourceJsonStr = fullTaskOutput.substring(jsonStartIndex, jsonEndIndex)
    console.log(`[${txId}][extractDeviceKeys] Extracted resource section (${resourceJsonStr.length} chars)`)

    // Clean up: remove timestamp lines that might be embedded
    resourceJsonStr = resourceJsonStr.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?\s*/gm, '')

    // Wrap in braces to make it a valid JSON object
    resourceJsonStr = '{' + resourceJsonStr + '}'

    try {
      const parsed = JSON.parse(resourceJsonStr)
      const resource = parsed.resource

      if (!resource) {
        console.log(`[${txId}][extractDeviceKeys] Parsed JSON but "resource" key not found`)
        return null
      }

      const privatekey = resource.privatekey
      const publickey = resource.publickey
      const ipAddress = [
        resource.address,
        resource.ip_address,
        resource.ipAddress,
        resource.ipaddress,
        resource.ip,
        resource.ipv4_address,
        resource.ipv4,
        resource?.endpoint?.address,
        resource?.interface?.address
      ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)

      if (!privatekey || !publickey) {
        console.log(`[${txId}][extractDeviceKeys] Keys not found in resource object`)
        console.log(`[${txId}][extractDeviceKeys] Resource keys:`, Object.keys(resource))
        return null
      }

      console.log(`[${txId}][extractDeviceKeys] Successfully extracted keys from legacy format`)
      console.log(`[${txId}][extractDeviceKeys] Private key: ${privatekey.substring(0, 10)}...`)
      console.log(`[${txId}][extractDeviceKeys] Public key: ${publickey.substring(0, 10)}...`)
      if (ipAddress) {
        console.log(`[${txId}][extractDeviceKeys] Device IP address: ${ipAddress}`)
      } else {
        console.log(`[${txId}][extractDeviceKeys] Device IP address not present in resource payload`)
      }

      return {
        privatekey,
        publickey,
        address: ipAddress
      }
    } catch (parseError) {
      console.error(`[${txId}][extractDeviceKeys] Failed to parse resource JSON:`, parseError)
      console.error(`[${txId}][extractDeviceKeys] JSON string (first 500 chars):`, resourceJsonStr.substring(0, 500))
      return null
    }
  } catch (error) {
    console.error(`[${txId}][extractDeviceKeys] Error extracting device keys:`, error)
    return null
  }
}

async function pollExecutionUntilComplete(
  namespace: string,
  flowId: string,
  executionId: string,
  transactionId?: string
): Promise<KestraExecutionStatus> {
  const txId = transactionId ? transactionId.substring(0, 8) : ''
  const waitTime = 5000 // 5 seconds between attempts
  const maxAttempts = 24 // 2 minutes max to stay within Supabase timeout
  let attempts = 0

  console.log(`[${txId}][pollExecutionUntilComplete] Starting polling for execution ${executionId}`)
  console.log(`[${txId}][pollExecutionUntilComplete] Max attempts: ${maxAttempts}, Namespace: ${namespace}, FlowId: ${flowId}`)
  
  // First check immediately to see if it's already complete
  try {
    console.log(`[${txId}][pollExecutionUntilComplete] Performing initial status check...`)
    const initialStatus = await getExecutionStatus(namespace, flowId, executionId, transactionId)
    const currentState = initialStatus.state.current.toUpperCase()
    console.log(`[${txId}][pollExecutionUntilComplete] Initial execution ${executionId} state: ${initialStatus.state.current} (normalized: ${currentState})`)

    const finalStates = ['SUCCESS', 'FAILED', 'KILLED', 'WARNING']
    if (finalStates.includes(currentState)) {
      console.log(`[${txId}][pollExecutionUntilComplete] Execution ${executionId} already completed with state: ${initialStatus.state.current}`)
      return initialStatus
    }
    console.log(`[${txId}][pollExecutionUntilComplete] Execution not yet complete, will continue polling...`)
  } catch (error) {
    console.log(`[${txId}][pollExecutionUntilComplete] Initial status check failed for ${executionId}, will start polling:`, error)
  }
  
  while (attempts < maxAttempts) {
    console.log(`[${txId}][pollExecutionUntilComplete] Waiting ${waitTime}ms before attempt ${attempts + 1}...`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
    attempts++

    console.log(`[${txId}][pollExecutionUntilComplete] Attempt ${attempts}/${maxAttempts} - Checking execution status...`)
    try {
      const status = await getExecutionStatus(namespace, flowId, executionId, transactionId)
      const currentState = status.state.current.toUpperCase()
      console.log(`[${txId}][pollExecutionUntilComplete] Polling execution ${executionId}, current state: ${status.state.current} (normalized: ${currentState}), attempt: ${attempts}/${maxAttempts}`)

      // Log task states if available
      if (status.taskRunList && status.taskRunList.length > 0) {
        console.log(`[${txId}][pollExecutionUntilComplete] Task states:`)
        status.taskRunList.forEach(task => {
          console.log(`[${txId}][pollExecutionUntilComplete]   - ${task.taskId}: ${task.state.current}`)
        })
      }
      
      // Check if execution is complete (either SUCCESS, FAILED, KILLED, or WARNING)
      const finalStates = ['SUCCESS', 'FAILED', 'KILLED', 'WARNING']
      if (finalStates.includes(currentState)) {
        console.log(`[${txId}][pollExecutionUntilComplete] ✅ Execution ${executionId} completed with state: ${status.state.current}`)
        if (status.state.duration) {
          console.log(`[${txId}][pollExecutionUntilComplete] Total execution duration: ${status.state.duration}`)
        }
        return status
      }
      
      console.log(`[${txId}][pollExecutionUntilComplete] State ${currentState} not in final states, continuing to poll...`)
    } catch (error) {
      console.error(`[${txId}][pollExecutionUntilComplete] Error polling execution ${executionId} on attempt ${attempts}:`, error)
      
      // If we can't get status, continue trying (don't increment attempts twice)
    }
  }
  
  // If we reach here, the execution didn't complete within our timeout
  // Get the last known status and return it with a warning
  console.log(`[${txId}][pollExecutionUntilComplete] Max attempts (${maxAttempts}) reached without completion`)
  try {
    console.log(`[${txId}][pollExecutionUntilComplete] Fetching final status before timeout...`)
    const lastStatus = await getExecutionStatus(namespace, flowId, executionId, transactionId)
    console.log(`[${txId}][pollExecutionUntilComplete] Execution ${executionId} did not complete within timeout. Last known state: ${lastStatus.state.current}`)
    return lastStatus
  } catch (error) {
    console.error(`[${txId}][pollExecutionUntilComplete] Failed to get final status:`, error)
    throw new Error(`Execution ${executionId} did not complete within the timeout period and status could not be retrieved`)
  }
}

async function executeKestraFlow(
  namespace: string,
  flowId: string,
  inputs: Record<string, any> = {},
  transactionId?: string
): Promise<KestraExecutionResponse> {
  const txId = transactionId ? transactionId.substring(0, 8) : ''
  const url = `${KESTRA_BASE_URL}/api/v1/main/executions/${namespace}/${flowId}`

  console.log(`[${txId}][executeKestraFlow] Starting execution of Kestra flow`)
  console.log(`[${txId}][executeKestraFlow] Namespace: ${namespace}`)
  console.log(`[${txId}][executeKestraFlow] Flow ID: ${flowId}`)
  console.log(`[${txId}][executeKestraFlow] URL: ${url}`)
  console.log(`[${txId}][executeKestraFlow] Inputs:`, JSON.stringify(inputs, null, 2))

  // Create FormData for multipart/form-data request
  const formData = new FormData()
  
  // Add inputs as JSON data in the json_data field
  const jsonData = JSON.stringify(inputs)
  formData.append('json_data', jsonData)
  console.log(`[${txId}][executeKestraFlow] FormData created with json_data field (${jsonData.length} bytes)`)
  
  // Basic authentication credentials
  const username = Deno.env.get('KESTRA_USER') || ''
  const password = Deno.env.get('KESTRA_PASSWORD') || ''
  const credentials = btoa(`${username}:${password}`)
  console.log(`[${txId}][executeKestraFlow] Using basic auth with username: ${username}`)
  
  try {
    console.log(`[${txId}][executeKestraFlow] Sending POST request to Kestra API...`)
    console.log(`[${txId}][executeKestraFlow] Request details:`)
    console.log(`[${txId}][executeKestraFlow]   Method: POST`)
    console.log(`[${txId}][executeKestraFlow]   URL: ${url}`)
    console.log(`[${txId}][executeKestraFlow]   Headers:`)
    console.log(`[${txId}][executeKestraFlow]     Authorization: Basic ${username}:****** (${credentials.length} chars)`)
    console.log(`[${txId}][executeKestraFlow]     Content-Type: multipart/form-data (auto-set by FormData)`)
    console.log(`[${txId}][executeKestraFlow]   Body (FormData):`)
    console.log(`[${txId}][executeKestraFlow]     json_data: ${jsonData}`)
    console.log(`[${txId}][executeKestraFlow]     json_data size: ${jsonData.length} bytes`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // Don't set Content-Type manually when using FormData
        // Fetch will automatically set multipart/form-data with boundary
        'Authorization': `Basic ${credentials}`,
      },
      body: formData,
    })

    console.log(`[${txId}][executeKestraFlow] Response received - Status: ${response.status} ${response.statusText}`)
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${txId}][executeKestraFlow] Error response body:`, errorText)
      throw new Error(`Kestra API error: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    console.log(`[${txId}][executeKestraFlow] Raw Kestra response:`, JSON.stringify(result, null, 2))
    
    // Check if the response has the expected structure
    if (!result.id) {
      console.error(`[${txId}][executeKestraFlow] Unexpected response structure from Kestra API - missing 'id' field`)
      throw new Error(`Unexpected Kestra API response structure: ${JSON.stringify(result)}`)
    }

    console.log(`[${txId}][executeKestraFlow] Kestra execution started successfully`)
    console.log(`[${txId}][executeKestraFlow] Execution ID: ${result.id}`)
    console.log(`[${txId}][executeKestraFlow] Initial state: ${result.state?.current || 'N/A'}`)

    return result as KestraExecutionResponse
  } catch (error) {
    console.error(`[${txId}][executeKestraFlow] Error calling Kestra:`, error)
    throw error
  }
}

// EDGE function call is processed from here:
serve(async (req: Request) => {
  // Generate a trasaction ID
  const transactionId = crypto.randomUUID()
  const txId = transactionId.substring(0, 8)
  
  console.log(`\n[${txId}] ========== NEW REQUEST ==========`)
  console.log(`[${txId}] Full Transaction ID: ${transactionId}`)
  console.log(`[${txId}] Method: ${req.method}`)
  console.log(`[${txId}] URL: ${req.url}`)
  console.log(`[${txId}] Headers:`, Object.fromEntries(req.headers.entries()))

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log(`[${txId}] Handling CORS preflight request`)
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Transaction-ID',
      },
    })
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log(`[${txId}] Method not allowed: ${req.method}`)
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
  
  let executionId: string | undefined
  let tableParam: string | undefined

  try {
    // Parse request body
    console.log(`[${txId}] Parsing request body...`)
    const body = await req.json() as KestraExecutionRequest & { table?: string; transaction_id?: string }
    console.log(`[${txId}] Request body:`, JSON.stringify(body, null, 2))

    // Determine namespace and flowId based on table parameter (mandatory)
    // Table can be at top level or nested in inputs
  let namespace: string
  let flowId: string

    console.log(`[${txId}] Determining namespace and flowId...`)
    tableParam = body.table || body.inputs?.table
    
    if (!tableParam) {
      console.log(`[${txId}] Missing required table parameter`)
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field: table parameter is required (at top level or in inputs). Must be "networks" or "devices"' 
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }
    
    console.log(`[${txId}] Using table parameter: ${tableParam}`)
    switch (tableParam) {
      case 'networks':
        namespace = 'iotgw-ng'
        flowId = 'networks'
        console.log(`[${txId}] Mapped to namespace: ${namespace}, flowId: ${flowId}`)

        // Extract network data from webhook payload
        // Expect Supabase realtime webhook format: record at top level.
        const networkRecord = (body as any).record
        if (!networkRecord) {
          console.log(`[${txId}] Missing top-level record in webhook payload`)
          throw new Error('Missing top-level record in webhook payload (expected Supabase realtime format)')
        }
        // console.log(`[${txId}] Network record source: top-level record`)
        // console.log(`[${txId}] Network record:`, JSON.stringify(networkRecord, null, 2))

        // STEP 1: Create initial network_jobs record BEFORE executing Kestra workflow
        console.log(`[${txId}] Creating network_jobs record...`)
        console.log(`[${txId}] Full Transaction ID being saved: ${transactionId}`)
        console.log(`[${txId}] Network record:`, JSON.stringify(networkRecord, null, 2))

        const { data: jobData, error: jobError } = await supabase
          .from('network_jobs')
          .insert({
            execution_id: `pending-${transactionId}`,
            flow_id: flowId,
            status: 'PENDING',
            started_at: new Date().toISOString(),
            network_id: networkRecord.id,
            network_name: networkRecord.name,
            transaction_id: transactionId || null,
            network_cidr: networkRecord.ipv4_cidr || networkRecord.ipv6_cidr || null,
            network_ipv4: networkRecord.ipv4_cidr || null,
            network_ipv6: networkRecord.ipv6_cidr || null,
            created_by: null
          })
          .select()
          .single()

        if (jobError) {
          console.error(`[${txId}] Failed to create network_jobs record:`, jobError)
          throw new Error(`Failed to create job record: ${jobError.message}`)
        }

        console.log(`[${txId}] Created network_jobs record with transaction_id: ${jobData.transaction_id}`)
        console.log(`[${txId}] Full job data:`, jobData)
        break
      case 'devices':
        namespace = 'iotgw-ng'
        flowId = 'devices'
        console.log(`[${txId}] Mapped to namespace: ${namespace}, flowId: ${flowId}`)

        // Extract device data from webhook payload
        // For DELETE operations, use old_record instead of record
        const operationType = (body as any).type
        const deviceRecord = operationType === 'DELETE'
          ? (body as any).old_record
          : (body as any).record

        if (!deviceRecord) {
          console.log(`[${txId}] Missing device record in webhook payload (type: ${operationType})`)
          throw new Error(`Missing ${operationType === 'DELETE' ? 'old_record' : 'record'} in webhook payload`)
        }

        console.log(`[${txId}] Operation type: ${operationType}`)

        // STEP 1: Create initial device_jobs record BEFORE executing Kestra workflow
        console.log(`[${txId}] Creating device_jobs record...`)
        console.log(`[${txId}] Full Transaction ID being saved: ${transactionId}`)
        console.log(`[${txId}] Device record:`, JSON.stringify(deviceRecord, null, 2))

        const { data: deviceJobData, error: deviceJobError } = await supabase
          .from('device_jobs')
          .insert({
            execution_id: `pending-${transactionId}`,
            flow_id: flowId,
            status: 'PENDING',
            started_at: new Date().toISOString(),
            device_id: deviceRecord.id,
            device_name: deviceRecord.name,
            device_ip_address: deviceRecord.ip_address,
            device_description: deviceRecord.description || null,
            network_id: deviceRecord.network_id,
            network_name: deviceRecord.network?.name || 'Unknown',
            transaction_id: transactionId || null,
            created_by: null
          })
          .select()
          .single()

        if (deviceJobError) {
          console.error(`[${txId}] Failed to create device_jobs record:`, deviceJobError)
          throw new Error(`Failed to create job record: ${deviceJobError.message}`)
        }

        console.log(`[${txId}] Created device_jobs record with transaction_id: ${deviceJobData.transaction_id}`)
        console.log(`[${txId}] Full job data:`, deviceJobData)
        break
      default:
        console.log(`[${txId}] Invalid table parameter: ${tableParam}`)
        return new Response(
          JSON.stringify({ 
            error: `Invalid table parameter: ${tableParam}. Must be 'networks' or 'devices'` 
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        )
    }
    
    // STEP 2: Execute Kestra flow
    console.log(`[${txId}] Executing Kestra flow...`)
    const executionResult = await executeKestraFlow(
      namespace,
      flowId,
      body || {},
      transactionId
    )

    console.log(`[${txId}] Kestra flow started with execution ID: ${executionResult.id}`)
    console.log(`[${txId}] Initial execution result:`, JSON.stringify(executionResult, null, 2))

    // Extract execution ID from the response
    executionId = executionResult.id

    // STEP 3: Update network_jobs or device_jobs record with real execution_id and RUNNING status
    let networkId: string | undefined
    let deviceId: string | undefined

    if (tableParam === 'networks') {
      networkId = (body as any).record.id
      console.log(`[${txId}] Updating network_jobs with execution_id...`)

      const { data: updateData, error: updateError } = await supabase
        .from('network_jobs')
        .update({
          execution_id: executionId,
          status: 'RUNNING'
        })
        .eq('execution_id', `pending-${transactionId}`)
        .eq('network_id', networkId)
        .select()

      if (updateError) {
        console.error(`[${txId}] Failed to update job with execution_id:`, updateError)
        // Don't fail the request - job tracking is best effort
      } else {
        console.log(`[${txId}] Updated network_jobs with execution_id: ${executionId}`)
      }
    } else if (tableParam === 'devices') {
      // For DELETE operations, use old_record instead of record
      const bodyType = (body as any).type
      deviceId = bodyType === 'DELETE'
        ? (body as any).old_record?.id
        : (body as any).record?.id
      console.log(`[${txId}] Updating device_jobs with execution_id...`)

      const { data: updateData, error: updateError } = await supabase
        .from('device_jobs')
        .update({
          execution_id: executionId,
          status: 'RUNNING'
        })
        .eq('execution_id', `pending-${transactionId}`)
        .eq('device_id', deviceId)
        .select()

      if (updateError) {
        console.error(`[${txId}] Failed to update device job with execution_id:`, updateError)
        // Don't fail the request - job tracking is best effort
      } else {
        console.log(`[${txId}] Updated device_jobs with execution_id: ${executionId}`)
      }
    }

    // STEP 4: Start background polling (don't await!)
    console.log(`[${txId}] Starting background polling for execution ${executionId}`)

    const backgroundPolling = pollExecutionUntilComplete(
      namespace,
      flowId,
      executionId,
      transactionId
    ).then(async (finalStatus) => {
      console.log(`[${txId}][BACKGROUND] Polling completed. Final state: ${finalStatus.state.current}`)

      // Update network_jobs or device_jobs with final status
      if (tableParam === 'networks' && executionId) {
        console.log(`[${txId}][BACKGROUND] Updating network_jobs with final status...`)

        const { data: finalUpdateData, error: finalUpdateError } = await supabase
          .from('network_jobs')
          .update({
            status: finalStatus.state.current,
            completed_at: finalStatus.state.endDate || new Date().toISOString(),
            error_message: finalStatus.state.current === 'FAILED'
              ? 'Workflow execution failed - check Kestra logs'
              : null
          })
          .eq('execution_id', executionId)
          .select()

        if (finalUpdateError) {
          console.error(`[${txId}][BACKGROUND] Failed to update network job with final status:`, finalUpdateError)
        } else {
          console.log(`[${txId}][BACKGROUND] Successfully updated network_jobs with final status: ${finalStatus.state.current}`)
        }
      } else if (tableParam === 'devices' && executionId) {
        console.log(`[${txId}][BACKGROUND] Updating device_jobs with final status...`)

        const { data: finalUpdateData, error: finalUpdateError } = await supabase
          .from('device_jobs')
          .update({
            status: finalStatus.state.current,
            completed_at: finalStatus.state.endDate || new Date().toISOString(),
            error_message: finalStatus.state.current === 'FAILED'
              ? 'Workflow execution failed - check Kestra logs'
              : null
          })
          .eq('execution_id', executionId)
          .select()

        if (finalUpdateError) {
          console.error(`[${txId}][BACKGROUND] Failed to update device job with final status:`, finalUpdateError)
        } else {
          console.log(`[${txId}][BACKGROUND] Successfully updated device_jobs with final status: ${finalStatus.state.current}`)
        }

        // If the execution was successful, extract device keys from logs and update the device
        if (finalStatus.state.current === 'SUCCESS') {
          console.log(`[${txId}][BACKGROUND] Execution succeeded, attempting to extract device keys...`)
          
          try {
            const deviceKeys = await extractDeviceKeysFromLogs(executionId, transactionId)
            
            if (deviceKeys) {
              console.log(`[${txId}][BACKGROUND] Successfully extracted device keys, updating device record...`)
              
              // Get the device_id from the job record
              const { data: jobRecord } = await supabase
                .from('device_jobs')
                .select('device_id')
                .eq('execution_id', executionId)
                .single()

              if (jobRecord?.device_id) {
                const deviceUpdatePayload: Record<string, string> = {
                  private_key: deviceKeys.privatekey,
                  public_key: deviceKeys.publickey,
                  updated_at: new Date().toISOString()
                }

                if (deviceKeys.address) {
                  deviceUpdatePayload.ip_address = deviceKeys.address
                }

                const { error: deviceUpdateError } = await supabase
                  .from('devices')
                  .update(deviceUpdatePayload)
                  .eq('id', jobRecord.device_id)

                if (deviceUpdateError) {
                  console.error(`[${txId}][BACKGROUND] Failed to update device with keys:`, deviceUpdateError)
                } else {
                  if (deviceKeys.address) {
                    console.log(`[${txId}][BACKGROUND] Successfully updated device with keys and IP ${deviceKeys.address}`)
                  } else {
                    console.log(`[${txId}][BACKGROUND] Successfully updated device with private and public keys`)
                  }

                  if (deviceKeys.address) {
                    const { error: jobIpUpdateError } = await supabase
                      .from('device_jobs')
                      .update({
                        device_ip_address: deviceKeys.address
                      })
                      .eq('execution_id', executionId)

                    if (jobIpUpdateError) {
                      console.error(`[${txId}][BACKGROUND] Failed to sync device_jobs IP address:`, jobIpUpdateError)
                    } else {
                      console.log(`[${txId}][BACKGROUND] Synced device_jobs record with IP ${deviceKeys.address}`)
                    }
                  }
                }
              } else {
                console.error(`[${txId}][BACKGROUND] Could not find device_id in job record`)
              }
            } else {
              console.log(`[${txId}][BACKGROUND] Could not extract device keys from logs`)
            }
          } catch (keyExtractionError) {
            console.error(`[${txId}][BACKGROUND] Error during key extraction process:`, keyExtractionError)
          }
        }
      }

      console.log(`[${txId}][BACKGROUND] Background polling completed successfully`)
    }).catch(async (error) => {
      console.error(`[${txId}][BACKGROUND] Error in background polling:`, error)

      // Try to update job with error status
      if (tableParam === 'networks' && executionId) {
        try {
          await supabase
            .from('network_jobs')
            .update({
              status: 'FAILED',
              completed_at: new Date().toISOString(),
              error_message: error instanceof Error ? error.message : 'Background polling failed'
            })
            .eq('execution_id', executionId)

          console.log(`[${txId}][BACKGROUND] Updated network job with error status`)
        } catch (updateError) {
          console.error(`[${txId}][BACKGROUND] Failed to update network job with error:`, updateError)
        }
      } else if (tableParam === 'devices' && executionId) {
        try {
          await supabase
            .from('device_jobs')
            .update({
              status: 'FAILED',
              completed_at: new Date().toISOString(),
              error_message: error instanceof Error ? error.message : 'Background polling failed'
            })
            .eq('execution_id', executionId)

          console.log(`[${txId}][BACKGROUND] Updated device job with error status`)
        } catch (updateError) {
          console.error(`[${txId}][BACKGROUND] Failed to update device job with error:`, updateError)
        }
      }
    })

    // Keep the function alive until background work completes
    EdgeRuntime.waitUntil(backgroundPolling)

    // STEP 5: Return 202 Accepted immediately
    const jobsTableName = tableParam === 'devices' ? 'device_jobs' : 'network_jobs'
    const responseData = {
      success: true,
      status: 'ACCEPTED',
      message: 'Workflow execution started successfully. Status will be updated in background.',
      executionId: executionId,
      transactionId: transactionId,
      namespace: namespace,
      flowId: flowId,
      state: 'RUNNING',
      kestraUrl: `${KESTRA_BASE_URL}/ui/main/executions/${namespace}/${flowId}/${executionId}`,
      note: `Check ${jobsTableName} table for final status or use the Kestra URL to monitor execution`
    }

    console.log(`[${txId}] Returning 202 Accepted response`)
    console.log(`[${txId}] Full Transaction ID in response: ${transactionId}`)
    console.log(`[${txId}] Response data:`, JSON.stringify(responseData, null, 2))
    console.log(`[${txId}] ========== REQUEST ACCEPTED (202) - Background polling continuing ==========\n`)

    // Return 202 Accepted response immediately
    return new Response(
      JSON.stringify(responseData),
      {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
    
  } catch (error) {
    console.error(`[${txId}] ========== ERROR ==========`)
    console.error(`[${txId}] Error in kestra-call function:`, error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorDetails = error instanceof Error ? error.toString() : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error(`[${txId}] Error message: ${errorMessage}`)
    console.error(`[${txId}] Error details: ${errorDetails}`)
    if (errorStack) {
      console.error(`[${txId}] Error stack:`, errorStack)
    }

    // Try to update job record with error status if we have an execution_id
    // Note: executionId and tableParam need to be accessed from the outer scope
    // We use a try-catch to access them safely since they may not be defined
    try {
      // Access the variables from function scope
      const scopeExecutionId = typeof executionId !== 'undefined' ? executionId : undefined
      const scopeTableParam = typeof tableParam !== 'undefined' ? tableParam : undefined

      if (scopeExecutionId && scopeTableParam === 'networks') {
        console.log(`[${txId}] Attempting to update network job with error status...`)

        const { data: errorUpdateData, error: errorUpdateError } = await supabase
          .from('network_jobs')
          .update({
            status: 'FAILED',
            completed_at: new Date().toISOString(),
            error_message: errorMessage
          })
          .eq('execution_id', scopeExecutionId)
          .select()

        if (errorUpdateError) {
          console.error(`[${txId}] Failed to update network job with error status:`, errorUpdateError)
        } else {
          console.log(`[${txId}] Updated network job with error status`)
        }
      } else if (scopeExecutionId && scopeTableParam === 'devices') {
        console.log(`[${txId}] Attempting to update device job with error status...`)

        const { data: errorUpdateData, error: errorUpdateError } = await supabase
          .from('device_jobs')
          .update({
            status: 'FAILED',
            completed_at: new Date().toISOString(),
            error_message: errorMessage
          })
          .eq('execution_id', scopeExecutionId)
          .select()

        if (errorUpdateError) {
          console.error(`[${txId}] Failed to update device job with error status:`, errorUpdateError)
        } else {
          console.log(`[${txId}] Updated device job with error status`)
        }
      }
    } catch (updateError) {
      console.error(`[${txId}] Exception while updating job with error:`, updateError)
    }
    
    // Return appropriate status code based on error type
    let statusCode = 500
    if (errorMessage.includes('timeout') || errorMessage.includes('did not complete')) {
      statusCode = 408 // Request timeout
      console.log(`[${txId}] Returning 408 Request Timeout`)
    } else if (errorMessage.includes('Kestra API error')) {
      statusCode = 502 // Bad gateway
      console.log(`[${txId}] Returning 502 Bad Gateway`)
    } else {
      console.log(`[${txId}] Returning 500 Internal Server Error`)
    }
    
    const errorResponse = {
      success: false,
      error: errorMessage,
      details: errorDetails,
      transactionId: transactionId
    }
    
    console.log(`[${txId}] Error response:`, JSON.stringify(errorResponse, null, 2))
    console.log(`[${txId}] ========== REQUEST FAILED ==========\n`)
    
    return new Response(
      JSON.stringify(errorResponse),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
