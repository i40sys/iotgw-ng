---
name: database-migrations
description: This skill provides guidance for managing database schema changes with Supabase migrations including creating, testing, and deploying migrations. Use when modifying database schema or managing database versioning.
---

# Database Migrations with Supabase

Manage database schema changes in a versioned, reproducible way.

## Supabase CLI Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to project
supabase link --project-ref <project-id>

# Start local development
supabase start
```

## Creating Migrations

### Generate Migration File

```bash
# Create a new migration
supabase migration new add_users_table

# Creates: supabase/migrations/<timestamp>_add_users_table.sql
```

### Migration File Structure

```sql
-- supabase/migrations/20240101000000_add_users_table.sql

-- Create table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- Add RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

### Auto-Generate from Diff

```bash
# Make changes in Supabase Studio or locally
# Then generate migration from diff

supabase db diff --schema public -f add_new_column

# Or compare with linked project
supabase db diff --linked
```

## Common Migration Patterns

### Add Column

```sql
-- Add column with default
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';

-- Add column not null (need default or backfill)
ALTER TABLE devices
ADD COLUMN firmware_version TEXT;

UPDATE devices SET firmware_version = '1.0.0' WHERE firmware_version IS NULL;

ALTER TABLE devices
ALTER COLUMN firmware_version SET NOT NULL;
```

### Rename Column

```sql
-- Rename column
ALTER TABLE users
RENAME COLUMN name TO full_name;
```

### Add Foreign Key

```sql
-- Add foreign key with cascade
ALTER TABLE devices
ADD CONSTRAINT devices_network_id_fkey
FOREIGN KEY (network_id)
REFERENCES networks(id)
ON DELETE CASCADE;
```

### Create Enum Type

```sql
-- Create enum
CREATE TYPE device_status AS ENUM ('online', 'offline', 'maintenance', 'unknown');

-- Use in table
ALTER TABLE devices
ADD COLUMN status device_status DEFAULT 'unknown';

-- Add value to existing enum (Postgres 9.1+)
ALTER TYPE device_status ADD VALUE 'error';
```

### Add Index

```sql
-- B-tree index (default)
CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_network_id_idx
ON devices(network_id);

-- Partial index
CREATE INDEX CONCURRENTLY IF NOT EXISTS active_devices_idx
ON devices(network_id)
WHERE status = 'online';

-- Composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_network_status_idx
ON devices(network_id, status);

-- GIN index for JSONB
CREATE INDEX CONCURRENTLY IF NOT EXISTS devices_metadata_idx
ON devices USING GIN (metadata);
```

### Create Function

```sql
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Row Level Security

```sql
-- Enable RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see devices in their domains
CREATE POLICY "domain_isolation"
ON devices FOR ALL
USING (
  domain_id IN (
    SELECT domain_id FROM domain_users
    WHERE user_id = auth.uid()
  )
);

-- Policy: Service role bypasses RLS
CREATE POLICY "service_role_bypass"
ON devices FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

## Type Generation

```bash
# Generate TypeScript types from database
supabase gen types typescript --local > src/types/database.types.ts

# Or from linked project
supabase gen types typescript --linked > src/types/database.types.ts

# In package.json
{
  "scripts": {
    "generate:types": "supabase gen types typescript --local > packages/contract/src/database.types.ts"
  }
}
```

## Running Migrations

### Local Development

```bash
# Apply all pending migrations
supabase db push

# Reset database and reapply all migrations
supabase db reset

# Check migration status
supabase migration list
```

### Remote/Production

```bash
# Push to linked project (careful!)
supabase db push --linked

# Or use Supabase Dashboard
# Project Settings > Database > Migrations
```

## Safe Migration Practices

### Idempotent Migrations

```sql
-- Use IF NOT EXISTS / IF EXISTS
CREATE TABLE IF NOT EXISTS users (...);
DROP TABLE IF EXISTS old_users;

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- For columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'new_column'
  ) THEN
    ALTER TABLE users ADD COLUMN new_column TEXT;
  END IF;
END $$;
```

### Non-Blocking Operations

```sql
-- CONCURRENTLY for indexes (doesn't lock table)
CREATE INDEX CONCURRENTLY idx_name ON table(column);

-- For production, always use CONCURRENTLY
DROP INDEX CONCURRENTLY IF EXISTS old_idx;
```

### Backward Compatible Changes

```sql
-- Step 1: Add nullable column
ALTER TABLE users ADD COLUMN phone TEXT;

-- Step 2: Backfill data (in application or migration)
UPDATE users SET phone = '' WHERE phone IS NULL;

-- Step 3: (Later migration) Add NOT NULL
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

### Dangerous Operations

```sql
-- ⚠️ These can cause issues in production:

-- Locking operations
ALTER TABLE large_table ADD COLUMN new_col TEXT NOT NULL DEFAULT 'value';
-- Fix: Add nullable, backfill, then add constraint

-- Dropping columns
ALTER TABLE users DROP COLUMN important_data;
-- Fix: Rename to _deprecated first, drop later

-- Changing column types
ALTER TABLE users ALTER COLUMN id TYPE BIGINT;
-- Fix: Add new column, migrate data, drop old
```

## Rollback Strategy

```sql
-- Include rollback in comments
-- Migration: Add status column
ALTER TABLE devices ADD COLUMN status TEXT DEFAULT 'unknown';

-- Rollback:
-- ALTER TABLE devices DROP COLUMN status;
```

```bash
# Supabase doesn't have built-in rollback
# Create a new migration to undo changes

supabase migration new rollback_add_status
```

## Testing Migrations

```bash
# Test locally first
supabase start
supabase db reset  # Apply all migrations fresh

# Run your application tests
pnpm test

# Check for issues
supabase db lint
```

## Seed Data

```sql
-- supabase/seed.sql
-- Runs after migrations on db reset

INSERT INTO domains (id, name) VALUES
  ('d1', 'Default Domain'),
  ('d2', 'Test Domain');

INSERT INTO users (id, email, full_name) VALUES
  ('u1', 'admin@example.com', 'Admin User'),
  ('u2', 'user@example.com', 'Regular User');
```

## Migration Workflow

### Development

1. Make changes locally (Studio or migration file)
2. `supabase db diff -f migration_name`
3. Review generated SQL
4. `supabase db reset` to test
5. Run application tests
6. Commit migration file

### Production

1. Test migration on staging first
2. Schedule maintenance window for large migrations
3. Backup database
4. Apply migration
5. Verify application works
6. Generate and update types

## Best Practices

1. **One change per migration** - Easier to debug and rollback
2. **Descriptive names** - `add_devices_status_column` not `update`
3. **Test locally first** - Always run `db reset` before pushing
4. **Use transactions** - Wrap related changes
5. **Backup before production** - Always
6. **Idempotent migrations** - Safe to run multiple times
7. **Document rollbacks** - Include in comments
8. **Update types** - Regenerate after migration
