---
description: Create a Supabase edge function that interacts with the PostgreSQL database
---

# Edge Function with Database Access Skill

You are helping create a Supabase edge function that interacts with the database. Follow these steps:

1. **Plan the database interaction**:
   - What data needs to be read/written?
   - What tables are involved?
   - Are there RLS policies to consider?
   - Does it need transactions?

2. **Choose database client**:

   **Option A: Use Supabase Client** (recommended):
   - Full type safety
   - Automatic RLS enforcement
   - Built-in auth context

   **Option B: Use postgres client directly**:
   - More control
   - Bypasses RLS (uses service role)
   - Better for admin operations

3. **Create function with Supabase client**:

   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   console.log('<function-name> function started')

   interface RequestBody {
     // Define your request structure
   }

   serve(async (req: Request) => {
     // Handle CORS
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
       // Get Supabase URL and keys from environment
       const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
       const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

       // Create Supabase client
       const supabase = createClient(supabaseUrl, supabaseKey)

       // Parse request
       const body = await req.json() as RequestBody

       // Query database
       const { data, error } = await supabase
         .from('table_name')
         .select('*')
         .eq('column', body.value)

       if (error) {
         console.error('Database error:', error)
         throw error
       }

       // Return results
       return new Response(
         JSON.stringify({ success: true, data }),
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

4. **Create function with postgres client**:

   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts'

   console.log('<function-name> function started')

   // Create connection pool (reused across requests)
   const pool = new postgres.Pool({
     user: 'postgres',
     password: Deno.env.get('POSTGRES_PASSWORD'),
     database: 'postgres',
     hostname: Deno.env.get('POSTGRES_HOST') || 'db',
     port: 5432,
   }, 3) // pool size

   serve(async (req: Request) => {
     // Handle CORS
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

     // Get connection from pool
     const connection = await pool.connect()

     try {
       const body = await req.json()

       // Execute query
       const result = await connection.queryObject`
         SELECT * FROM table_name
         WHERE column = ${body.value}
       `

       return new Response(
         JSON.stringify({ success: true, data: result.rows }),
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
     } finally {
       // Always release connection back to pool
       connection.release()
     }
   })
   ```

5. **Common database operations**:

   **SELECT**:
   ```typescript
   // Supabase client
   const { data, error } = await supabase
     .from('devices')
     .select('id, name, status')
     .eq('user_id', userId)
     .order('created_at', { ascending: false })
     .limit(10)

   // Postgres client
   const result = await connection.queryObject`
     SELECT id, name, status
     FROM devices
     WHERE user_id = ${userId}
     ORDER BY created_at DESC
     LIMIT 10
   `
   ```

   **INSERT**:
   ```typescript
   // Supabase client
   const { data, error } = await supabase
     .from('devices')
     .insert({ name: 'Device 1', user_id: userId })
     .select()

   // Postgres client
   const result = await connection.queryObject`
     INSERT INTO devices (name, user_id)
     VALUES (${name}, ${userId})
     RETURNING *
   `
   ```

   **UPDATE**:
   ```typescript
   // Supabase client
   const { data, error } = await supabase
     .from('devices')
     .update({ status: 'inactive' })
     .eq('id', deviceId)
     .select()

   // Postgres client
   const result = await connection.queryObject`
     UPDATE devices
     SET status = ${status}, updated_at = NOW()
     WHERE id = ${deviceId}
     RETURNING *
   `
   ```

   **DELETE**:
   ```typescript
   // Supabase client
   const { error } = await supabase
     .from('devices')
     .delete()
     .eq('id', deviceId)

   // Postgres client
   await connection.queryObject`
     DELETE FROM devices WHERE id = ${deviceId}
   `
   ```

   **TRANSACTION**:
   ```typescript
   // Postgres client only
   try {
     await connection.queryObject`BEGIN`

     await connection.queryObject`
       INSERT INTO table1 (col) VALUES (${val})
     `

     await connection.queryObject`
       UPDATE table2 SET col = ${val} WHERE id = ${id}
     `

     await connection.queryObject`COMMIT`
   } catch (error) {
     await connection.queryObject`ROLLBACK`
     throw error
   }
   ```

6. **Handle authentication context**:

   ```typescript
   // Get user from JWT token
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   const authHeader = req.headers.get('Authorization')
   if (!authHeader) {
     return new Response(
       JSON.stringify({ error: 'Missing authorization header' }),
       { status: 401 }
     )
   }

   const token = authHeader.replace('Bearer ', '')
   const supabase = createClient(supabaseUrl, supabaseAnonKey, {
     global: { headers: { Authorization: authHeader } }
   })

   const { data: { user }, error } = await supabase.auth.getUser(token)
   if (error || !user) {
     return new Response(
       JSON.stringify({ error: 'Invalid token' }),
       { status: 401 }
     )
   }

   // Now use user.id for queries
   ```

7. **Environment variables needed**:
   - `SUPABASE_URL`: http://kong:8000
   - `SUPABASE_SERVICE_ROLE_KEY`: From .env
   - `SUPABASE_ANON_KEY`: From .env (for client auth)
   - `POSTGRES_PASSWORD`: From .env (for direct connection)
   - `POSTGRES_HOST`: Usually 'db'

8. **Error handling**:
   ```typescript
   try {
     const { data, error } = await supabase.from('table').select()

     if (error) {
       console.error('Database error:', error)
       return new Response(
         JSON.stringify({
           success: false,
           error: 'Database query failed',
           details: error.message
         }),
         { status: 500 }
       )
     }

     return new Response(
       JSON.stringify({ success: true, data }),
       { status: 200 }
     )
   } catch (error) {
     console.error('Unexpected error:', error)
     return new Response(
       JSON.stringify({ success: false, error: 'Internal server error' }),
       { status: 500 }
     )
   }
   ```

9. **Testing**:
   ```bash
   # Test with service role key (bypasses RLS)
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"test":"data"}'

   # Test with user token (enforces RLS)
   curl -X POST http://localhost:8000/functions/v1/<function-name> \
     -H "Authorization: Bearer ${USER_JWT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"test":"data"}'
   ```

10. **Best practices**:
    - Use Supabase client for user-scoped operations (RLS applies)
    - Use postgres client for admin operations (bypasses RLS)
    - Always use connection pooling
    - Release connections in finally blocks
    - Log database errors for debugging
    - Validate input before queries
    - Use parameterized queries (template literals) to prevent SQL injection
    - Handle RLS policy violations gracefully
    - Set appropriate timeouts

## Database Connection Checklist

- [ ] Choose appropriate client (Supabase vs Postgres)
- [ ] Configure connection with environment variables
- [ ] Implement connection pooling
- [ ] Add proper error handling
- [ ] Release connections properly
- [ ] Consider RLS policies
- [ ] Handle authentication context
- [ ] Validate input data
- [ ] Use transactions where needed
- [ ] Add appropriate logging
- [ ] Test with different user contexts
