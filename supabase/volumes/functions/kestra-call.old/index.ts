import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

console.log('kestra-call function started')

// Kestra configuration
const KESTRA_BASE_URL = Deno.env.get('KESTRA_BASE_URL') || 'http://wsl.ymbihq.local:8080'

interface KestraExecutionRequest {
  namespace: string
  flowId: string
  inputs?: Record<string, any>
}

interface KestraExecutionResponse {
  id: string
  namespace: string
  flowId: string
  state: string
  created: string
  updated: string
  labels?: Record<string, string>
  inputs?: Record<string, any>
  outputs?: Record<string, any>
}

async function executeKestraFlow(
  namespace: string,
  flowId: string,
  inputs: Record<string, any> = {}
): Promise<KestraExecutionResponse> {
  const url = `${KESTRA_BASE_URL}/api/v1/main/executions/${namespace}/${flowId}`
  
  // Create FormData for multipart/form-data request
  const formData = new FormData()
  
  // Add inputs as JSON data in the json_data field
  formData.append('json_data', JSON.stringify(inputs))
  
  console.log(`Calling Kestra flow: ${namespace}/${flowId}`)
  console.log('Inputs:', inputs)
  console.log('URL:', url)
  
  // Basic authentication credentials
  const username = 'oriol@joor.net'
  const password = '***REMOVED-ROTATED-KESTRA-PW***'
  const credentials = btoa(`${username}:${password}`)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        // Don't set Content-Type manually when using FormData
        // Fetch will automatically set multipart/form-data with boundary
        'Authorization': `Basic ${credentials}`,
      },
      body: formData,
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Kestra API error: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json() as KestraExecutionResponse
    console.log('Kestra execution started:', result.id)
    
    return result
  } catch (error) {
    console.error('Error calling Kestra:', error)
    throw error
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
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
  
  try {
    // Parse request body
    const body = await req.json() as KestraExecutionRequest
    
    // Validate required fields
    if (!body.namespace || !body.flowId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: namespace and flowId are required' 
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
    
    // Execute Kestra flow
    const result = await executeKestraFlow(
      body.namespace,
      body.flowId,
      body.inputs || {}
    )
    
    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        execution: result,
        message: `Kestra flow ${body.namespace}/${body.flowId} executed successfully`
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
    
  } catch (error) {
    console.error('Error in kestra-call function:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorDetails = error instanceof Error ? error.toString() : String(error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorDetails
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
