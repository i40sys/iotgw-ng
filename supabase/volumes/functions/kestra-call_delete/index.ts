import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('kestra-call_delete function started')

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
  const username = 'oriol@joor.net'
  const password = '***REMOVED-ROTATED-KESTRA-PW***'
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
  return statusData
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
    console.log(`[${txId}][pollExecutionUntilComplete] Initial execution ${executionId} state: ${initialStatus.state.current}`)

    const finalStates = ['SUCCESS', 'FAILED', 'KILLED']
    if (finalStates.includes(initialStatus.state.current)) {
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
      console.log(`[${txId}][pollExecutionUntilComplete] Polling execution ${executionId}, current state: ${status.state.current}, attempt: ${attempts}/${maxAttempts}`)

      // Log task states if available
      if (status.taskRunList && status.taskRunList.length > 0) {
        console.log(`[${txId}][pollExecutionUntilComplete] Task states:`)
        status.taskRunList.forEach(task => {
          console.log(`[${txId}][pollExecutionUntilComplete]   - ${task.taskId}: ${task.state.current}`)
        })
      }
      
      // Check if execution is complete (either SUCCESS, FAILED, or KILLED)
      const finalStates = ['SUCCESS', 'FAILED', 'KILLED']
      if (finalStates.includes(status.state.current)) {
        console.log(`[${txId}][pollExecutionUntilComplete] Execution ${executionId} completed with state: ${status.state.current}`)
        if (status.state.duration) {
          console.log(`[${txId}][pollExecutionUntilComplete] Total execution duration: ${status.state.duration}`)
        }
        return status
      }
      
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
  const username = 'oriol@joor.net'
  const password = '***REMOVED-ROTATED-KESTRA-PW***'
  const credentials = btoa(`${username}:${password}`)
  console.log(`[${txId}][executeKestraFlow] Using basic auth with username: ${username}`)
  
  try {
    console.log(`[${txId}][executeKestraFlow] Sending POST request to Kestra API...`)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
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

// EDGE function main handler
serve(async (req: Request) => {
  // Generate a transaction ID
  const transactionId = crypto.randomUUID()
  const txId = transactionId.substring(0, 8)
  
  console.log(`\n[${txId}] ========== NEW DELETE REQUEST ==========`)
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
        'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Transaction-ID',
      },
    })
  }
  
  // Allow POST or DELETE requests
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    console.log(`[${txId}] Method not allowed: ${req.method}`)
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST or DELETE.' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
  
  try {
    // Parse request body
    console.log(`[${txId}] Parsing request body...`)
    const body = await req.json() as KestraExecutionRequest & { 
      table?: string
      transaction_id?: string
      network_id?: string
      old_record?: any
    }
    console.log(`[${txId}] Request body:`, JSON.stringify(body, null, 2))

    // Determine namespace and flowId for delete operation
    let namespace: string
    let flowId: string
    let executionId: string | undefined
    let tableParam: string | undefined
    let networkId: string | undefined
    let deviceId: string | undefined

    console.log(`[${txId}] Determining namespace and flowId for delete operation...`)
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
        // For DELETE operations, Supabase sends old_record
        const networkRecord = (body as any).old_record || (body as any).record
        if (!networkRecord) {
          console.log(`[${txId}] Missing network record in webhook payload`)
          throw new Error('Missing network record in webhook payload (expected old_record or record)')
        }

        networkId = networkRecord.id || body.network_id
        if (!networkId) {
          console.log(`[${txId}] Missing network_id`)
          throw new Error('Missing network_id in request')
        }

        console.log(`[${txId}] Network to delete - ID: ${networkId}, Name: ${networkRecord.name || 'N/A'}`)

        // STEP 1: Create initial network_jobs record for delete operation
        console.log(`[${txId}] Creating network_jobs record for delete operation...`)
        console.log(`[${txId}] Full Transaction ID being saved: ${transactionId}`)

        const { data: jobData, error: jobError } = await supabase
          .from('network_jobs')
          .insert({
            execution_id: `pending-${transactionId}`,
            flow_id: flowId,
            status: 'PENDING',
            started_at: new Date().toISOString(),
            network_id: networkId,
            network_name: networkRecord.name || null,
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
        // For DELETE operations, Supabase sends old_record
        const deviceRecord = (body as any).old_record || (body as any).record
        if (!deviceRecord) {
          console.log(`[${txId}] Missing device record in webhook payload`)
          throw new Error('Missing device record in webhook payload (expected old_record or record)')
        }

        deviceId = deviceRecord.id || body.device_id
        if (!deviceId) {
          console.log(`[${txId}] Missing device_id`)
          throw new Error('Missing device_id in request')
        }

        console.log(`[${txId}] Device to delete - ID: ${deviceId}, Name: ${deviceRecord.name || 'N/A'}`)

        // STEP 1: Create initial device_jobs record for delete operation
        console.log(`[${txId}] Creating device_jobs record for delete operation...`)
        console.log(`[${txId}] Full Transaction ID being saved: ${transactionId}`)

        const { data: deviceJobData, error: deviceJobError } = await supabase
          .from('device_jobs')
          .insert({
            execution_id: `pending-${transactionId}`,
            flow_id: flowId,
            status: 'PENDING',
            started_at: new Date().toISOString(),
            device_id: deviceId,
            device_name: deviceRecord.name || null,
            device_ip_address: deviceRecord.ip_address || null,
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
    
    // STEP 2: Execute Kestra delete flow
    console.log(`[${txId}] Executing Kestra delete flow...`)
    const executionResult = await executeKestraFlow(
      namespace,
      flowId,
      body || {},
      transactionId
    )

    console.log(`[${txId}] Kestra delete flow started with execution ID: ${executionResult.id}`)
    console.log(`[${txId}] Initial execution result:`, JSON.stringify(executionResult, null, 2))

    // Extract execution ID from the response
    executionId = executionResult.id

    // STEP 3: Update network_jobs or device_jobs record with real execution_id and RUNNING status
    if (tableParam === 'networks' && networkId) {
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
        console.error(`[${txId}] Failed to update network job with execution_id:`, updateError)
        // Don't fail the request - job tracking is best effort
      } else {
        console.log(`[${txId}] Updated network_jobs with execution_id: ${executionId}`)
      }
    } else if (tableParam === 'devices' && deviceId) {
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
              ? 'Delete workflow execution failed - check Kestra logs'
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
              ? 'Delete workflow execution failed - check Kestra logs'
              : null
          })
          .eq('execution_id', executionId)
          .select()

        if (finalUpdateError) {
          console.error(`[${txId}][BACKGROUND] Failed to update device job with final status:`, finalUpdateError)
        } else {
          console.log(`[${txId}][BACKGROUND] Successfully updated device_jobs with final status: ${finalStatus.state.current}`)
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
      message: 'Delete workflow execution started successfully. Status will be updated in background.',
      executionId: executionId,
      transactionId: transactionId,
      namespace: namespace,
      flowId: flowId,
      networkId: networkId,
      deviceId: deviceId,
      state: 'RUNNING',
      kestraUrl: `${KESTRA_BASE_URL}/ui/main/executions/${namespace}/${flowId}/${executionId}`,
      note: `Check ${jobsTableName} table for final status or use the Kestra URL to monitor execution`
    }

    console.log(`[${txId}] Returning 202 Accepted response`)
    console.log(`[${txId}] Full Transaction ID in response: ${transactionId}`)
    console.log(`[${txId}] Response data:`, JSON.stringify(responseData, null, 2))
    console.log(`[${txId}] ========== DELETE REQUEST ACCEPTED (202) - Background polling continuing ==========\n`)

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
    console.error(`[${txId}] Error in kestra-call_delete function:`, error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorDetails = error instanceof Error ? error.toString() : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error(`[${txId}] Error message: ${errorMessage}`)
    console.error(`[${txId}] Error details: ${errorDetails}`)
    if (errorStack) {
      console.error(`[${txId}] Error stack:`, errorStack)
    }

    // Try to update job record with error status if we have an execution_id
    try {
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
    console.log(`[${txId}] ========== DELETE REQUEST FAILED ==========\n`)
    
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
