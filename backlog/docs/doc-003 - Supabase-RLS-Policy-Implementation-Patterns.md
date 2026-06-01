---
id: doc-003
title: Supabase RLS Policy Implementation Patterns
type: documentation
created_date: "2025-08-24 12:12"
---

# Supabase RLS Policy Implementation Patterns

## Overview

This document provides comprehensive guidelines for implementing Row Level Security (RLS) policies, database schema design patterns, and integration with the backend API in the IoT Gateway project.

## Table of Contents

1. [RLS Policy Creation Patterns](#rls-policy-creation-patterns)
2. [Database Schema Design Guidelines](#database-schema-design-guidelines)
3. [Supabase Client Configuration Patterns](#supabase-client-configuration-patterns)
4. [Real-time Subscription Implementation Patterns](#real-time-subscription-implementation-patterns)
5. [Database Migration Workflow](#database-migration-workflow)
6. [Type Generation from Database Schema](#type-generation-from-database-schema)

## RLS Policy Creation Patterns

### Basic Policy Structure

All RLS policies in this project follow a standard pattern for consistency and security:

```sql
-- Enable RLS on table
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Create policy with clear naming convention
CREATE POLICY "policy_description_with_role_and_operation"
ON table_name
FOR operation
TO role_name
USING (condition)
WITH CHECK (condition);
```

### Access Level Patterns

#### 1. Authenticated Users - Full Access

For tables where authenticated users should have complete access:

```sql
CREATE POLICY "Allow authenticated users to manage device logs"
ON device_creation_log FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

**Use cases:**

- Internal logging tables
- System administration data
- Development/debugging tables

#### 2. Authenticated Users - Read-Only Access

For sensitive tables where authenticated users should only read:

```sql
CREATE POLICY "Allow authenticated users to read devices"
ON devices FOR SELECT
TO authenticated
USING (true);
```

**Use cases:**

- Device inventory data
- Configuration data
- Audit logs

#### 3. Row-Level Ownership (Future Pattern)

For user-specific data where access is limited by ownership:

```sql
CREATE POLICY "Users can access their own data"
ON user_devices FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**Implementation notes:**

- Add `user_id UUID REFERENCES auth.users(id)` column
- Use `auth.uid()` for current user identification
- Apply to tables with user-specific data

#### 4. Role-Based Access (Future Pattern)

For hierarchical access control:

```sql
CREATE POLICY "Admins can access all devices"
ON devices FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "Users can read assigned devices"
ON devices FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT device_id FROM user_device_assignments
    WHERE user_id = auth.uid()
  )
);
```

### Policy Naming Conventions

- Start with action: "Allow", "Restrict", "Enable"
- Include role: "authenticated users", "admins", "owners"
- Include operation: "to read", "to manage", "to create"
- Include resource: "devices", "device logs", "user data"

Examples:

- `"Allow authenticated users to read devices"`
- `"Allow admins to manage all devices"`
- `"Allow users to create their own device logs"`

## Database Schema Design Guidelines

### Table Structure Patterns

#### 1. Standard Audit Fields

All tables should include these standard fields:

```sql
CREATE TABLE example_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... business fields ...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. Hierarchical IoT Management Tables

The system implements a three-tier hierarchy for IoT management:

##### Domains Table (Top Level)

```sql
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,           -- System identifier (e.g., "production")
  display_name TEXT NOT NULL,          -- Human-readable name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
CREATE POLICY "Allow authenticated users to manage domains"
ON domains FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

##### Networks Table (Middle Level)

```sql
CREATE TABLE networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ipv4_cidr TEXT,                      -- IPv4 CIDR notation (e.g., "192.168.1.0/24")
  ipv6_cidr TEXT,                      -- IPv6 CIDR notation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: network names unique within a domain
  CONSTRAINT networks_domain_name_unique UNIQUE (domain_id, name)
);

-- Indexes for performance
CREATE INDEX idx_networks_domain_id ON networks(domain_id);
CREATE INDEX idx_networks_name ON networks(name);

-- RLS Policy
CREATE POLICY "Allow authenticated users to manage networks"
ON networks FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

##### Devices Table (Leaf Level)

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  ip_address TEXT NOT NULL,            -- IP address (unique within network)
  private_key TEXT,                    -- Encrypted private key for authentication
  public_key TEXT,                     -- Public key for verification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: IP addresses unique within a network
  CONSTRAINT devices_network_ip_unique UNIQUE (network_id, ip_address)
);

-- Indexes for performance
CREATE INDEX idx_devices_network_id ON devices(network_id);
CREATE INDEX idx_devices_name ON devices(name);
CREATE INDEX idx_devices_ip_address ON devices(ip_address);

-- RLS Policy
CREATE POLICY "Allow authenticated users to manage devices"
ON devices FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

#### 3. Logging Tables

For audit trails and event tracking:

```sql
CREATE TABLE device_creation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,
  event_data JSONB,          -- Flexible event data
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Index Patterns

Create indexes for common query patterns:

```sql
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_devices_ip_address ON devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen_at ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- RLS-supporting indexes
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id)
  WHERE user_id IS NOT NULL;

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_devices_status_last_seen
  ON devices(status, last_seen_at DESC);
```

### Data Type Guidelines

| PostgreSQL Type | TypeScript Override   | Use Case                   |
| --------------- | --------------------- | -------------------------- |
| `INET`          | `string`              | IP addresses               |
| `MACADDR`       | `string`              | MAC addresses              |
| `UUID`          | `string`              | Primary keys, foreign keys |
| `TIMESTAMPTZ`   | `string`              | Timestamps with timezone   |
| `JSONB`         | `Record<string, any>` | Flexible data structures   |
| `TEXT`          | `string`              | Variable-length strings    |
| `VARCHAR(n)`    | `string`              | Limited-length strings     |

## Supabase Client Configuration Patterns

### Backend Configuration

#### Environment Variables Setup

```bash
# .env file
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

#### Client Initialization

```typescript
// apps/backend/src/context.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false }, // Backend doesn't need session persistence
  },
);
```

#### Context Creation

```typescript
export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? "anonymous" };
  return { req, res, user, supabase };
}
```

### Frontend Configuration (Future)

For direct Supabase client usage on frontend:

```typescript
// Frontend client configuration
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";

const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  },
);
```

### Query Patterns

#### Standard Query with Error Handling

```typescript
export const getDevices = async (ctx: Context) => {
  const { data, error } = await ctx.supabase
    .from("devices")
    .select("*")
    .order("last_seen_at", { ascending: false });

  if (error) {
    logger.error({ error }, "Error fetching devices from Supabase");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to fetch devices: ${error.message}`,
      cause: error,
    });
  }

  return data;
};
```

#### Insert with Return Data

```typescript
export const createDeviceLog = async (ctx: Context, input: DeviceLogInput) => {
  const { data, error } = await ctx.supabase
    .from("device_creation_log")
    .insert({
      hostname: input.hostname,
      ip_address: input.ipAddress,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error }, "Error creating device log entry");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to create device log: ${error.message}`,
      cause: error,
    });
  }

  return data;
};
```

#### RPC Function Calls

```typescript
export const getDevicesViaRPC = async (ctx: Context) => {
  const { data, error } = await ctx.supabase.rpc("get_devices");

  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `RPC call failed: ${error.message}`,
    });
  }

  return data;
};
```

## Real-time Subscription Implementation Patterns

### WebSocket Setup (Backend)

```typescript
// apps/backend/src/server.ts
import websocket from "@fastify/websocket";

await fastify.register(websocket);

fastify.register(async function (fastify) {
  fastify.get("/devices-ws", { websocket: true }, (connection, req) => {
    // Set up Supabase real-time subscription
    const subscription = supabase
      .channel("devices-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        (payload) => {
          connection.socket.send(
            JSON.stringify({
              type: "device_change",
              payload: payload,
            }),
          );
        },
      )
      .subscribe();

    connection.socket.on("close", () => {
      subscription.unsubscribe();
    });
  });
});
```

### Frontend Subscription Pattern (Future)

```typescript
// Real-time subscription hook
export const useDevicesSubscription = () => {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const subscription = supabase
      .channel("devices-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setDevices((prev) => [payload.new as Device, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setDevices((prev) =>
              prev.map((device) =>
                device.id === payload.new.id ? (payload.new as Device) : device,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setDevices((prev) =>
              prev.filter((device) => device.id !== payload.old.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return devices;
};
```

## Database Migration Workflow

### Migration File Structure

```
supabase/
├── migrations/
│   ├── 20250603052016_public.sql          # Initial schema
│   ├── 20250604041158_public.sql          # Add credentials
│   └── 20250625000000_add_user_roles.sql  # Future migration
└── seed.sql                               # Sample data
```

### Migration Best Practices

#### 1. Migration Naming Convention

Format: `YYYYMMDDHHMMSS_descriptive_name.sql`

#### 2. Safe Migration Pattern

```sql
-- Safe column addition
ALTER TABLE devices ADD COLUMN IF NOT EXISTS new_field TEXT;

-- Safe index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table_name(column_name);

-- Safe policy creation
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name FOR SELECT TO authenticated USING (true);
```

#### 3. RLS Policy Updates

```sql
-- Always drop before recreating policies
DROP POLICY IF EXISTS "old_policy_name" ON table_name;
CREATE POLICY "new_policy_name" ON table_name FOR ALL TO authenticated
USING (improved_condition) WITH CHECK (improved_condition);
```

### Migration Commands

```bash
# Generate new migration
supabase db diff --db-url "postgresql://..." --schema public --debug -f migration_name

# Apply migrations
supabase db reset --db-url "postgresql://..."

# Dump data for backup
supabase db dump --data-only --db-url "postgresql://..." --schema public -f ./supabase/seed.sql
```

## Cascade Deletion and Relationship Patterns

### Hierarchical Cascade Deletion

The system implements CASCADE DELETE to maintain referential integrity across the hierarchy:

```sql
-- Domains → Networks → Devices cascade deletion chain
ALTER TABLE networks
  ADD CONSTRAINT networks_domain_id_fkey
  FOREIGN KEY (domain_id)
  REFERENCES domains(id)
  ON DELETE CASCADE;

ALTER TABLE devices
  ADD CONSTRAINT devices_network_id_fkey
  FOREIGN KEY (network_id)
  REFERENCES networks(id)
  ON DELETE CASCADE;
```

**Behavior:**

- Deleting a domain removes all its networks and devices
- Deleting a network removes all its devices
- No orphaned records possible

### Unique Constraints Across Relationships

Implement scoped uniqueness constraints to prevent conflicts:

```sql
-- Network names unique within a domain
ALTER TABLE networks
  ADD CONSTRAINT networks_domain_name_unique
  UNIQUE (domain_id, name);

-- IP addresses unique within a network (not globally)
ALTER TABLE devices
  ADD CONSTRAINT devices_network_ip_unique
  UNIQUE (network_id, ip_address);
```

**Benefits:**

- Allows same network name in different domains
- Allows same IP address in different networks
- Prevents conflicts within the same scope

### Trigger-Based Updates

Automatically update timestamps on modifications:

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_networks_updated_at BEFORE UPDATE ON networks
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

### Data Integrity Checks

Implement custom constraints for business rules:

```sql
-- Ensure CIDR notation is valid
ALTER TABLE networks
  ADD CONSTRAINT check_ipv4_cidr_format
  CHECK (ipv4_cidr ~ '^(\d{1,3}\.){3}\d{1,3}/\d{1,2}$' OR ipv4_cidr IS NULL);

ALTER TABLE networks
  ADD CONSTRAINT check_ipv6_cidr_format
  CHECK (ipv6_cidr ~ '^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}/\d{1,3}$' OR ipv6_cidr IS NULL);

-- Ensure IP address format is valid
ALTER TABLE devices
  ADD CONSTRAINT check_ip_address_format
  CHECK (ip_address ~ '^(\d{1,3}\.){3}\d{1,3}$');
```

## Type Generation from Database Schema

### Automatic Type Generation

#### 1. Generate Raw Types

```bash
# From packages/supabase-contract directory
pnpm generate  # Generates database.types.ts
```

#### 2. Type Override Pattern

```typescript
// packages/supabase-contract/src/database-overrides.types.ts
import type { Database as GeneratedDatabase } from "./database.types";

export type Database = {
  public: {
    Tables: {
      devices: Omit<
        GeneratedDatabase["public"]["Tables"]["devices"],
        "Row" | "Insert" | "Update"
      > & {
        Row: Omit<
          GeneratedDatabase["public"]["Tables"]["devices"]["Row"],
          "ip_address" | "mac_address"
        > & {
          ip_address: string | null; // Override INET
          mac_address: string | null; // Override MACADDR
        };
        // ... Insert and Update overrides
      };
    };
    // ... Views, Functions, etc.
  };
};
```

#### 3. Export Pattern

```typescript
// packages/supabase-contract/src/index.ts
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database-overrides.types";

export * from "./device.types"; // Domain-specific types
```

### Usage Patterns

#### Backend Usage

```typescript
import type { Database, Tables } from "@iotgw/supabase-contract";

type Device = Tables<"devices">;
type DeviceInsert = TablesInsert<"devices">;

const supabase = createClient<Database>(url, key);
```

#### Frontend Usage

```typescript
import type { Tables } from "@iotgw/supabase-contract";
import { trpc } from "@/utils/trpc";

type Device = Tables<"devices">;

const { data: devices } = trpc.getDevices.useQuery();
```

## Security Considerations

### 1. RLS Policy Testing

Always test RLS policies with different user contexts:

```sql
-- Test as authenticated user
SET LOCAL ROLE authenticated;
SELECT * FROM devices; -- Should return allowed data

-- Test as anonymous user
SET LOCAL ROLE anon;
SELECT * FROM devices; -- Should be restricted
```

### 2. Sensitive Data Handling

- Never store passwords in plain text
- Use RLS to restrict access to credential fields
- Consider separate tables for sensitive data

### 3. Performance Impact

- Monitor query performance with RLS enabled
- Create appropriate indexes to support policy conditions
- Use `EXPLAIN ANALYZE` to verify query plans

## Troubleshooting Common Issues

### 1. RLS Policy Not Working

- Verify policy is created correctly
- Check if RLS is enabled on table
- Test policy conditions in isolation

### 2. Type Mismatches

- Regenerate types after schema changes
- Verify override types match database reality
- Check for custom PostgreSQL types needing overrides

### 3. Performance Issues

- Add indexes for policy condition columns
- Monitor slow queries in Supabase dashboard
- Consider policy simplification for complex conditions

---

This documentation provides the foundation for implementing secure, performant, and maintainable Supabase patterns in the IoT Gateway project. Regular updates should be made as new patterns emerge and requirements evolve.
