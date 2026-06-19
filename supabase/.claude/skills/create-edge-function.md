---
description: Create a new Supabase edge function with proper TypeScript structure
---

# Create Edge Function Skill

You are helping create a new Supabase edge function. Follow these steps:

1. **Ask for function details** (if not provided):
   - Function name (lowercase, hyphenated)
   - Description of what the function does
   - Whether it needs JWT verification
   - Expected input parameters
   - Expected response format
   - Any external API integrations

2. **Create the function directory and file**:
   - Create directory: `volumes/functions/<function-name>/`
   - Create `volumes/functions/<function-name>/index.ts`

3. **Generate function code** with this structure:
   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

   console.log('<function-name> function started')

   // Type definitions
   interface RequestBody {
     // Define expected input
   }

   interface ResponseBody {
     // Define response structure
   }

   serve(async (req: Request) => {
     // Handle CORS preflight
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

     try {
       // Parse request
       const body = await req.json() as RequestBody

       // Your logic here

       // Return success
       return new Response(
         JSON.stringify({ success: true, data: {} }),
         {
           status: 200,
           headers: {
             'Content-Type': 'application/json',
             'Access-Control-Allow-Origin': '*',
           },
         }
       )
     } catch (error) {
       console.error('Error:', error)
       return new Response(
         JSON.stringify({
           success: false,
           error: error instanceof Error ? error.message : 'Internal server error'
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
   ```

4. **If the function needs environment variables**:
   - List the required variables
   - Show how to access them: `Deno.env.get('VAR_NAME')`
   - Remind to add them to .env file

5. **Create a README** at `volumes/functions/<function-name>/README.md`:
   - Function description
   - Request format with example
   - Response format with example
   - Environment variables needed
   - Testing instructions

6. **Provide testing instructions**:
   ```bash
   # Edge function code is baked into the iotgw-functions:local image, so a code
   # change needs a rebuild + kind load before the rollout picks it up.
   deploy/kind/bootstrap.sh functions
   kubectl -n iotgw rollout restart deploy/functions

   # Test the function
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"key":"value"}'

   # View logs
   kubectl -n iotgw logs -f deploy/functions
   ```

7. **Important notes**:
   - The main function routes requests to individual functions by path
   - JWT verification is controlled globally by FUNCTIONS_VERIFY_JWT in .env
   - Use TypeScript interfaces for type safety
   - Always include proper error handling
   - Log important operations for debugging
   - Include CORS headers for browser access
