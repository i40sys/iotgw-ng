---
description: Create and run database migrations for Supabase PostgreSQL
---

# Database Migration Skill

You are helping create or run database migrations for Supabase. Follow these steps:

1. **Understand the migration need**:
   - What schema changes are needed?
   - Is this a new table, column addition, index, constraint, etc.?
   - Is this migration for initialization or runtime change?

2. **Choose migration approach**:

   **For initialization** (runs on first db start):
   - Add SQL files to `volumes/db/`
   - Files run in alphanumeric order
   - Naming convention: `NN-description.sql` (e.g., `100-create-users-table.sql`)
   - Existing files: realtime.sql, webhooks.sql, roles.sql, jwt.sql, _supabase.sql, logs.sql, pooler.sql

   **For runtime changes** (live database):
   - Run SQL directly via psql
   - Or use Supabase Studio SQL Editor
   - Or create migration and apply manually

3. **Create migration file**:

   For initialization migrations in `volumes/db/`:
   ```sql
   -- Migration: <description>
   -- Created: <date>

   BEGIN;

   -- Your migration SQL here
   CREATE TABLE IF NOT EXISTS public.my_table (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     -- other columns
   );

   -- Indexes
   CREATE INDEX IF NOT EXISTS idx_my_table_created_at
     ON public.my_table(created_at);

   -- RLS (Row Level Security)
   ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

   -- Policies
   CREATE POLICY "Enable read access for authenticated users"
     ON public.my_table FOR SELECT
     TO authenticated
     USING (true);

   COMMIT;
   ```

4. **Best practices for migrations**:

   - Always use `IF NOT EXISTS` for idempotency
   - Wrap in BEGIN/COMMIT transaction
   - Add appropriate indexes
   - Enable RLS for security
   - Create necessary policies
   - Add comments for documentation
   - Use proper data types (UUID for IDs, TIMESTAMP WITH TIME ZONE for dates)
   - Set default values where appropriate

5. **Common patterns**:

   **Create table with RLS**:
   ```sql
   CREATE TABLE public.devices (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     data JSONB
   );

   ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can view their own devices"
     ON public.devices FOR SELECT
     TO authenticated
     USING (auth.uid() = user_id);
   ```

   **Add column**:
   ```sql
   ALTER TABLE public.devices
   ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
   ```

   **Create function**:
   ```sql
   CREATE OR REPLACE FUNCTION public.update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```

   **Create trigger**:
   ```sql
   CREATE TRIGGER update_devices_updated_at
     BEFORE UPDATE ON public.devices
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();
   ```

6. **Apply migration**:

   The DB is a StackGres SGCluster (`supabase-db`); psql runs inside the primary
   pod's `patroni` container. Resolve the primary pod first:
   ```bash
   PG=$(kubectl -n supabase-db get pod -l 'stackgres.io/cluster-name=supabase-db,role=master' \
          -o jsonpath='{.items[0].metadata.name}')
   ```

   **For the iotgw-ui migration set** (devices/networks/domains/*_jobs/etc.):
   ```bash
   # Applies iotgw-ui/supabase/migrations/ to the primary (idempotent)
   deploy/kind/bootstrap.sh migrate
   ```

   **For ad-hoc runtime migrations**:
   ```bash
   # Option 1: Via psql (pipe a file in)
   kubectl -n supabase-db exec -i "$PG" -c patroni -- psql -U postgres -d postgres < migration.sql

   # Option 2: Interactive psql
   kubectl -n supabase-db exec -it "$PG" -c patroni -- psql -U postgres -d postgres
   # Then paste SQL commands

   # Option 3: Via file
   cat migration.sql | kubectl -n supabase-db exec -i "$PG" -c patroni -- psql -U postgres -d postgres
   ```

7. **Verify migration**:
   ```bash
   # Connect to database
   kubectl -n supabase-db exec -it "$PG" -c patroni -- psql -U postgres -d postgres
   ```

   Then run:
   ```sql
   -- List tables
   \dt public.*

   -- Describe table
   \d public.my_table

   -- Check policies
   SELECT * FROM pg_policies WHERE tablename = 'my_table';

   -- Check if RLS is enabled
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public';
   ```

8. **Rollback** (if needed):
   ```sql
   -- Create rollback migration
   BEGIN;
   DROP TABLE IF EXISTS public.my_table CASCADE;
   COMMIT;
   ```

9. **Update PostgREST schema cache**:
   After schema changes, notify PostgREST:
   ```bash
   # Send NOTIFY to reload schema (run from the primary pod's patroni container)
   kubectl -n supabase-db exec -it "$PG" -c patroni -- psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"

   # Or restart the rest (PostgREST) deployment
   kubectl -n supabase-app rollout restart deploy/rest
   ```

10. **Document the migration**:
    - Add comments in SQL file
    - Update CLAUDE.md if it changes architecture
    - Note any breaking changes
    - Document new tables/columns

## Migration Checklist

- [ ] Migration has descriptive name
- [ ] Uses transactions (BEGIN/COMMIT)
- [ ] Uses IF NOT EXISTS for idempotency
- [ ] Includes appropriate indexes
- [ ] Enables RLS where needed
- [ ] Creates necessary policies
- [ ] Has proper data types
- [ ] Includes timestamps (created_at, updated_at)
- [ ] Foreign keys have ON DELETE actions
- [ ] Tested on local database
- [ ] PostgREST schema cache updated
- [ ] Changes documented

## Useful PostgreSQL Commands

```sql
-- List all tables
\dt *.*

-- List all schemas
\dn

-- List all functions
\df public.*

-- Show table structure
\d+ public.table_name

-- Show policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Show indexes
\di public.*

-- Show triggers
SELECT * FROM pg_trigger WHERE tgrelid = 'public.table_name'::regclass;
```
