---
id: doc-010
title: Database Migration and Webhook Management Guide
type: other
created_date: '2025-11-17 11:14'
---

# Database Migration and Webhook Management Guide

## Overview

This guide explains how to manage database migrations and webhooks in the IOTGW-UI project. The project uses Supabase for database management, and webhooks are configured to trigger Kestra workflows when devices or networks are created/updated.

## Key Concepts

### Database Migrations

- **Location**: `supabase/migrations/`
- **Naming**: Timestamps in format `YYYYMMDDHHMMSS_description.sql`
- **Order**: Migrations are applied in chronological order based on filename
- **Tool**: Supabase CLI

### Database Webhooks

- **Storage**: Stored in Supabase's control plane (not in database)
- **Configuration**: Created via Supabase Management API
- **Purpose**: Trigger Kestra workflows when devices/networks change
- **Tables**: `devices` and `networks`

## Common Operations

### 1. Reset Database (Migrations Only)

Resets the database and applies all migrations from scratch:

```bash
pnpm db:reset
```

This will:
- Drop all database objects
- Reapply all migrations in `supabase/migrations/`
- Run seed data (if exists)

**Note**: This does NOT configure webhooks.

### 2. Reset Database + Setup Webhooks (Full Reset)

Complete database and webhook setup:

```bash
# Set required environment variables
export SUPABASE_ACCESS_TOKEN="sbp_xxxxx"  # From https://supabase.com/dashboard/account/tokens
export SUPABASE_PROJECT_REF="your-ref"     # From project URL
export SUPABASE_ANON_KEY="eyJhbGci..."     # From Project Settings → API

# Run full reset
pnpm db:reset:full
```

This will:
1. Reset database and apply migrations
2. Configure webhooks for devices and networks tables

**Use this when**:
- Setting up a new environment
- After major schema changes
- When webhooks are not working

### 3. Setup Webhooks Only

If database is already set up and you only need to configure webhooks:

```bash
export SUPABASE_ACCESS_TOKEN="sbp_xxxxx"
export SUPABASE_PROJECT_REF="your-ref"
export SUPABASE_ANON_KEY="eyJhbGci..."

pnpm setup:webhooks
```

### 4. Apply New Migrations (Forward Only)

Push new migrations without resetting:

```bash
pnpm db:migrate
```

**Warning**: This is forward-only. It doesn't handle migration rollbacks.

### 5. Generate TypeScript Types

After schema changes, regenerate TypeScript types:

```bash
pnpm generate:contract
```

This updates `packages/supabase-contract/src/database.types.ts` with the latest schema.

## Getting Required Credentials

### SUPABASE_ACCESS_TOKEN

1. Go to https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Give it a name (e.g., "Webhook Setup")
4. Copy the token (starts with `sbp_`)

### SUPABASE_PROJECT_REF

Found in multiple places:
- Your project URL: `https://<PROJECT_REF>.supabase.co`
- Dashboard → Project Settings → General → Reference ID

### SUPABASE_ANON_KEY

1. Dashboard → Project Settings → API
2. Under "Project API keys"
3. Copy the `anon` `public` key

## Webhook Configuration

### What Webhooks Do

When a device or network is created/updated:
1. Webhook fires automatically
2. Calls `kestra-call` edge function
3. Edge function creates a job record (`device_jobs` or `network_jobs`)
4. Executes corresponding Kestra workflow
5. Updates job record with execution status

### Webhook Details

**Devices Webhook**:
- Name: `kestra-devices-webhook`
- Table: `public.devices`
- Events: INSERT, UPDATE
- Endpoint: `/functions/v1/kestra-call`

**Networks Webhook**:
- Name: `kestra-networks-webhook`
- Table: `public.networks`
- Events: INSERT, UPDATE
- Endpoint: `/functions/v1/kestra-call`

### Verifying Webhooks

1. **Check webhook logs**:
   - Dashboard → Database → Webhooks → Logs
   - Should show successful POST requests

2. **Verify job records**:
   ```sql
   SELECT * FROM device_jobs ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM network_jobs ORDER BY created_at DESC LIMIT 5;
   ```

3. **Test manually**:
   ```sql
   INSERT INTO devices (network_id, name, description)
   VALUES ('<network-uuid>', 'test-device', 'Test webhook');
   ```

## Troubleshooting

### Database Reset Fails

**Symptom**: `pnpm db:reset` fails with connection error

**Solution**:
1. Check `DATABASE_URL` in `.env` file
2. Verify database is accessible
3. Check `PGSSLMODE=disable` is set

### Webhook Setup Fails (401 Unauthorized)

**Symptom**: `Failed to list webhooks: 401`

**Solution**:
- Token is invalid or expired
- Generate new token from https://supabase.com/dashboard/account/tokens

### Webhook Setup Fails (404 Not Found)

**Symptom**: `Failed to create webhook: 404`

**Solution**:
- `SUPABASE_PROJECT_REF` is incorrect
- Verify in Dashboard → Project Settings

### Webhooks Not Triggering

**Symptoms**:
- Creating/editing devices doesn't create job records
- No entries in webhook logs

**Solutions**:
1. Verify webhooks are configured:
   ```bash
   pnpm setup:webhooks
   ```

2. Check `kestra-call` edge function is deployed

3. Verify webhook logs in Dashboard for errors

4. Check edge function logs for error messages

### Type Errors After Migration

**Symptom**: TypeScript errors after schema changes

**Solution**:
```bash
pnpm generate:contract
pnpm typecheck
```

## Development Workflow

### Adding a New Migration

1. Create migration file:
   ```bash
   touch supabase/migrations/$(date +%Y%m%d%H%M%S)_your_migration_name.sql
   ```

2. Write SQL in the migration file

3. Test locally:
   ```bash
   pnpm db:reset
   ```

4. Generate types:
   ```bash
   pnpm generate:contract
   ```

5. Verify no type errors:
   ```bash
   pnpm typecheck
   ```

6. Commit migration file to git

### Deploying to Production

```bash
# 1. Set production credentials
export SUPABASE_ACCESS_TOKEN="prod-token"
export SUPABASE_PROJECT_REF="prod-ref"
export SUPABASE_ANON_KEY="prod-anon-key"

# 2. Run full reset (database + webhooks)
pnpm db:reset:full

# 3. Verify
# Check Dashboard → Database → Webhooks
# Test by creating a device/network
```

## File Locations

- **Migrations**: `supabase/migrations/*.sql`
- **Webhook Setup Script**: `scripts/setup-webhooks.ts`
- **Full Reset Script**: `scripts/reset-database-and-webhooks.sh`
- **Database Config**: `.env` (DATABASE_URL)
- **Generated Types**: `packages/supabase-contract/src/database.types.ts`

## Related Documentation

- **Decision-008**: Kestra Notification Automation Pattern
- **Supabase CLI**: https://supabase.com/docs/guides/cli
- **Supabase Management API**: https://supabase.com/docs/reference/api/introduction
- **Database Webhooks**: https://supabase.com/docs/guides/database/webhooks

## Quick Reference

```bash
# Database only
pnpm db:reset              # Reset DB + apply migrations

# Database + Webhooks (requires env vars)
pnpm db:reset:full         # Full reset + webhook setup

# Webhooks only (requires env vars)
pnpm setup:webhooks        # Configure webhooks

# Types
pnpm generate:contract     # Regenerate TS types

# Verification
pnpm typecheck             # Check for type errors
```

## Environment Variables Summary

```bash
# Required for db:reset
DATABASE_URL="postgresql://..."  # In .env file

# Required for webhook operations
SUPABASE_ACCESS_TOKEN="sbp_..."
SUPABASE_PROJECT_REF="your-ref"
SUPABASE_ANON_KEY="eyJhbGci..."
```
