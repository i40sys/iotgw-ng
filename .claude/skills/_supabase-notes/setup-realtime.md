---
description: Set up real-time subscriptions for database tables
---

# Setup Realtime Subscriptions Skill

> **Note:** Supabase **realtime is intentionally not deployed** in the current
> k8s stack (decision-018 §4) — there is no `realtime` Deployment to talk to, so
> the live subscription path below will not work as-is on the deployed cluster.
> The conceptual content (publications, RLS, client patterns) is kept for
> reference and for the case where realtime is later deployed. Wherever a command
> would have targeted the realtime service, that is called out inline.

You are helping set up real-time subscriptions for Supabase tables. Follow these steps:

1. **Understand requirements**:
   - Which table(s) need real-time updates?
   - What operations to listen for? (INSERT, UPDATE, DELETE, all)
   - Should it be filtered by user or conditions?
   - Is RLS enabled on the table?

2. **Enable realtime for table**:

   Connect to database (StackGres SGCluster `supabase-db`):
   ```bash
   PG=$(kubectl -n iotgw get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' -o jsonpath='{.items[0].metadata.name}')
   kubectl -n iotgw exec -it "$PG" -c patroni -- psql -U postgres -d postgres
   ```

   Enable realtime publication:
   ```sql
   -- Add table to realtime publication
   ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;

   -- Or for all tables in public schema
   ALTER PUBLICATION supabase_realtime ADD TABLE ALL IN SCHEMA public;

   -- Check which tables are published
   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```

   Remove table from realtime:
   ```sql
   ALTER PUBLICATION supabase_realtime DROP TABLE public.your_table;
   ```

3. **Configure RLS for realtime**:

   Realtime respects RLS policies. Ensure appropriate policies exist:
   ```sql
   -- Enable RLS
   ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;

   -- Policy for users to see their own data in real-time
   CREATE POLICY "Users can subscribe to their own data"
   ON public.your_table FOR SELECT
   TO authenticated
   USING (auth.uid() = user_id);

   -- Policy for public data
   CREATE POLICY "Everyone can subscribe to public data"
   ON public.your_table FOR SELECT
   TO authenticated
   USING (is_public = true);
   ```

4. **Create edge function for realtime client**:

   Example client in `volumes/functions/realtime-demo/index.ts`:
   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req: Request) => {
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     )

     // Subscribe to changes
     const channel = supabase
       .channel('table-changes')
       .on(
         'postgres_changes',
         {
           event: '*',  // or 'INSERT', 'UPDATE', 'DELETE'
           schema: 'public',
           table: 'your_table'
         },
         (payload) => {
           console.log('Change received:', payload)
           // Handle the change
         }
       )
       .subscribe()

     return new Response('Subscribed to realtime updates')
   })
   ```

5. **Frontend client example** (for testing):

   Create a test HTML file:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>Realtime Test</title>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   </head>
   <body>
     <h1>Realtime Subscription Test</h1>
     <div id="logs"></div>

     <script>
       const supabase = window.supabase.createClient(
         'http://localhost:8000',
         'YOUR_ANON_KEY'
       )

       const channel = supabase
         .channel('table-changes')
         .on(
           'postgres_changes',
           {
             event: '*',
             schema: 'public',
             table: 'your_table'
           },
           (payload) => {
             console.log('Change:', payload)
             document.getElementById('logs').innerHTML +=
               `<p>${new Date().toISOString()}: ${JSON.stringify(payload)}</p>`
           }
         )
         .subscribe((status) => {
           console.log('Subscription status:', status)
         })

       // Cleanup on page unload
       window.addEventListener('beforeunload', () => {
         channel.unsubscribe()
       })
     </script>
   </body>
   </html>
   ```

6. **Common subscription patterns**:

   **Listen to all changes**:
   ```typescript
   supabase
     .channel('all-changes')
     .on('postgres_changes',
       { event: '*', schema: 'public', table: 'your_table' },
       (payload) => console.log(payload)
     )
     .subscribe()
   ```

   **Listen to inserts only**:
   ```typescript
   supabase
     .channel('inserts')
     .on('postgres_changes',
       { event: 'INSERT', schema: 'public', table: 'your_table' },
       (payload) => console.log('New row:', payload.new)
     )
     .subscribe()
   ```

   **Listen to updates**:
   ```typescript
   supabase
     .channel('updates')
     .on('postgres_changes',
       { event: 'UPDATE', schema: 'public', table: 'your_table' },
       (payload) => {
         console.log('Old:', payload.old)
         console.log('New:', payload.new)
       }
     )
     .subscribe()
   ```

   **Listen to deletes**:
   ```typescript
   supabase
     .channel('deletes')
     .on('postgres_changes',
       { event: 'DELETE', schema: 'public', table: 'your_table' },
       (payload) => console.log('Deleted:', payload.old)
     )
     .subscribe()
   ```

   **Filter by column value**:
   ```typescript
   supabase
     .channel('filtered')
     .on('postgres_changes',
       {
         event: '*',
         schema: 'public',
         table: 'your_table',
         filter: 'status=eq.active'
       },
       (payload) => console.log(payload)
     )
     .subscribe()
   ```

7. **Presence (track user presence)**:

   ```typescript
   const channel = supabase.channel('room-1')

   // Track this user's presence
   channel
     .on('presence', { event: 'sync' }, () => {
       const state = channel.presenceState()
       console.log('Online users:', state)
     })
     .on('presence', { event: 'join' }, ({ key, newPresences }) => {
       console.log('User joined:', newPresences)
     })
     .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
       console.log('User left:', leftPresences)
     })
     .subscribe(async (status) => {
       if (status === 'SUBSCRIBED') {
         await channel.track({
           user_id: 'user-123',
           online_at: new Date().toISOString()
         })
       }
     })
   ```

8. **Broadcast (send messages to all subscribers)**:

   ```typescript
   const channel = supabase.channel('room-1')

   // Listen for broadcasts
   channel
     .on('broadcast', { event: 'message' }, (payload) => {
       console.log('Received:', payload)
     })
     .subscribe()

   // Send broadcast
   channel.send({
     type: 'broadcast',
     event: 'message',
     payload: { text: 'Hello everyone!' }
   })
   ```

9. **Test realtime**:

   ```bash
   # In one terminal, tail the realtime logs.
   # NOTE: realtime is NOT deployed on this cluster (decision-018 §4). If it
   # were deployed, its logs would be: kubectl -n iotgw logs -f deploy/realtime

   # In another terminal, insert data
   PG=$(kubectl -n iotgw get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' -o jsonpath='{.items[0].metadata.name}')
   kubectl -n iotgw exec -it "$PG" -c patroni -- psql -U postgres -d postgres -c \
     "INSERT INTO public.your_table (name) VALUES ('test');"

   # Check if the change is broadcasted (only once realtime is deployed)
   ```

10. **Debugging realtime**:

    Check realtime service:
    ```bash
    # realtime is NOT deployed on this cluster (decision-018 §4). If it were
    # deployed, you would inspect it with:
    #   kubectl -n iotgw get pods -l app=realtime
    #   kubectl -n iotgw logs deploy/realtime
    ```

    Verify publication:
    ```sql
    -- Check publication exists
    SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

    -- Check tables in publication
    SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

    -- Check replication slot
    SELECT * FROM pg_replication_slots;
    ```

    Test subscription health:
    ```bash
    curl http://localhost:4000/api/tenants/realtime-dev/health \
      -H "Authorization: Bearer ${ANON_KEY}"
    ```

11. **Performance considerations**:
    - Limit number of subscriptions per client
    - Use filters to reduce unnecessary broadcasts
    - Unsubscribe when no longer needed
    - Use presence for user tracking, not database changes
    - Consider pagination for large datasets
    - Monitor realtime service memory usage

12. **Common issues**:

    **Subscription not receiving updates**:
    - Table not added to publication
    - RLS policy blocking access
    - Wrong schema or table name
    - Client not authenticated
    - Realtime service not healthy

    **Too many connections**:
    - Clean up unused subscriptions
    - Reuse channels when possible
    - Check connection limits in realtime config

## Realtime Checklist

- [ ] Table added to supabase_realtime publication
- [ ] RLS policies allow SELECT for intended users
- [ ] Realtime service is healthy
- [ ] Correct schema and table names
- [ ] Filters applied correctly
- [ ] Client properly authenticated
- [ ] Subscriptions cleaned up on disconnect
- [ ] Error handling in place
- [ ] Performance monitored

## Quick Reference

```sql
-- Enable realtime for table
ALTER PUBLICATION supabase_realtime ADD TABLE public.your_table;

-- Check publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Disable realtime for table
ALTER PUBLICATION supabase_realtime DROP TABLE public.your_table;
```

```typescript
// Subscribe to changes
const channel = supabase
  .channel('channel-name')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'your_table' },
    (payload) => console.log(payload)
  )
  .subscribe()

// Cleanup
channel.unsubscribe()
```
