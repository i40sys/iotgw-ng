---
name: supabase-postgresql
description: This skill provides guidance for working with Supabase client, PostgreSQL queries, Row Level Security (RLS), and database operations. Use when implementing database access, writing queries, or managing Supabase integration.
---

# Supabase and PostgreSQL

Supabase is an open-source Firebase alternative providing PostgreSQL database, authentication, and real-time subscriptions.

## Context7 Library IDs

For up-to-date documentation:
- `/supabase/supabase-js` - JavaScript client
- `/supabase/supabase` - Full platform docs
- `/supabase/cli` - Supabase CLI

## Client Initialization

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types"; // Generated types

const supabase: SupabaseClient<Database> = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// With service role (bypasses RLS - use carefully)
const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## Query Operations

### Select (Read)

```typescript
// Basic select
const { data, error } = await supabase
  .from("users")
  .select("*");

// Select specific columns
const { data } = await supabase
  .from("users")
  .select("id, email, full_name");

// Select with relationships (joins)
const { data } = await supabase
  .from("posts")
  .select(`
    id,
    title,
    content,
    author:users!author_id(id, email, full_name),
    comments(id, content, user:users(email)),
    tags(name)
  `);

// Single row
const { data } = await supabase
  .from("users")
  .select("*")
  .eq("id", userId)
  .single();

// Maybe single (returns null if not found, no error)
const { data } = await supabase
  .from("users")
  .select("*")
  .eq("id", userId)
  .maybeSingle();
```

### Insert (Create)

```typescript
// Insert single row
const { data, error } = await supabase
  .from("users")
  .insert({ email: "user@example.com", full_name: "John Doe" })
  .select()
  .single();

// Insert multiple rows
const { data, error } = await supabase
  .from("users")
  .insert([
    { email: "user1@example.com", full_name: "User One" },
    { email: "user2@example.com", full_name: "User Two" },
  ])
  .select();

// Upsert (insert or update on conflict)
const { data, error } = await supabase
  .from("users")
  .upsert(
    { id: existingId, email: "updated@example.com", full_name: "Updated" },
    { onConflict: "email" }
  )
  .select();
```

### Update

```typescript
// Update with condition
const { data, error } = await supabase
  .from("users")
  .update({ full_name: "New Name" })
  .eq("id", userId)
  .select()
  .single();

// Update multiple rows
const { data, error } = await supabase
  .from("posts")
  .update({ status: "archived" })
  .eq("author_id", userId)
  .lt("created_at", cutoffDate)
  .select();
```

### Delete

```typescript
// Delete with condition
const { data, error } = await supabase
  .from("users")
  .delete()
  .eq("id", userId)
  .select()
  .single();

// Delete multiple rows
const { error } = await supabase
  .from("sessions")
  .delete()
  .lt("expires_at", new Date().toISOString());
```

## Filtering

```typescript
// Equality
.eq("column", value)
.neq("column", value)

// Comparison
.gt("age", 18)      // greater than
.gte("age", 18)     // greater than or equal
.lt("age", 65)      // less than
.lte("age", 65)     // less than or equal

// Pattern matching
.like("name", "%john%")
.ilike("name", "%john%")  // case-insensitive

// Array operations
.in("status", ["active", "pending"])
.contains("tags", ["react", "typescript"])
.containedBy("tags", ["react", "typescript", "node"])

// JSON operations
.contains("metadata", { role: "admin" })

// Null checks
.is("deleted_at", null)
.not("deleted_at", "is", null)

// Text search
.textSearch("content", "react & typescript")

// Range operations
.range(0, 9)  // Pagination: rows 0-9

// Combining with OR
.or("status.eq.active,status.eq.pending")

// Complex filters
const { data } = await supabase
  .from("posts")
  .select("*")
  .eq("published", true)
  .gte("created_at", "2024-01-01")
  .or("status.eq.featured,priority.gte.5")
  .order("created_at", { ascending: false })
  .range(0, 9);
```

## RPC (Remote Procedure Calls)

Call PostgreSQL functions:

```typescript
// Define function in SQL
// CREATE FUNCTION calculate_user_stats(user_id UUID)
// RETURNS JSON AS $$
// ...
// $$ LANGUAGE plpgsql;

// Call from client
const { data, error } = await supabase
  .rpc("calculate_user_stats", {
    user_id: "123e4567-e89b-12d3-a456-426614174000",
  });

// RPC with filtering (if function returns table)
const { data } = await supabase
  .rpc("get_active_users")
  .eq("role", "admin")
  .limit(10);
```

## Real-time Subscriptions

```typescript
// Subscribe to all changes
const channel = supabase
  .channel("db-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "messages" },
    (payload) => {
      console.log("Change:", payload.eventType, payload.new);
    }
  )
  .subscribe();

// Subscribe to specific events
const channel = supabase
  .channel("inserts")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => {
      console.log("New message:", payload.new);
    }
  )
  .subscribe();

// Subscribe with filter
const channel = supabase
  .channel("user-updates")
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "users",
      filter: "status=eq.premium",
    },
    (payload) => {
      console.log("Premium user updated:", payload.new);
    }
  )
  .subscribe();

// Cleanup
supabase.removeChannel(channel);
```

## Row Level Security (RLS)

### Enable RLS

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

### Common Policy Patterns

```sql
-- Users can only read their own data
CREATE POLICY "Users can view own data"
ON users FOR SELECT
USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own data"
ON users FOR UPDATE
USING (auth.uid() = id);

-- Users can only insert as themselves
CREATE POLICY "Users can insert own data"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);

-- Role-based access
CREATE POLICY "Admins can view all"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Organization-based access
CREATE POLICY "Org members can view"
ON documents FOR SELECT
USING (
  organization_id IN (
    SELECT org_id FROM org_members WHERE user_id = auth.uid()
  )
);
```

## Error Handling

```typescript
import { PostgrestError } from "@supabase/supabase-js";

const { data, error } = await supabase
  .from("users")
  .select("*")
  .eq("id", userId)
  .single();

if (error) {
  // PostgrestError has: message, details, hint, code
  if (error.code === "PGRST116") {
    // No rows returned
    throw new NotFoundError("User not found");
  }
  if (error.code === "23505") {
    // Unique constraint violation
    throw new ConflictError("User already exists");
  }
  throw new DatabaseError(error.message);
}

// Type guard for error
function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}
```

## Type Generation

Generate TypeScript types from database schema:

```bash
# Generate types
npx supabase gen types typescript --project-id <project-id> > database.types.ts

# Or with local Supabase
npx supabase gen types typescript --local > database.types.ts
```

## Common Patterns in This Project

### Supabase Client in tRPC Context

```typescript
// Create client per-request in tRPC context
export const createContext = async ({ req }: { req: Request }) => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: req.headers.get("authorization") || "",
        },
      },
    }
  );

  return { supabase };
};
```

### Helper for Error Conversion

```typescript
import { TRPCError } from "@trpc/server";

function handleSupabaseError(error: PostgrestError): never {
  const errorMap: Record<string, { code: TRPCError["code"]; message: string }> = {
    "PGRST116": { code: "NOT_FOUND", message: "Resource not found" },
    "23505": { code: "CONFLICT", message: "Resource already exists" },
    "23503": { code: "BAD_REQUEST", message: "Referenced resource not found" },
    "42501": { code: "FORBIDDEN", message: "Permission denied" },
  };

  const mapped = errorMap[error.code] || {
    code: "INTERNAL_SERVER_ERROR",
    message: error.message,
  };

  throw new TRPCError({
    code: mapped.code,
    message: mapped.message,
    cause: error,
  });
}
```

## Best Practices

1. **Always handle errors** - Check error before using data
2. **Use generated types** - Regenerate after schema changes
3. **Select only needed columns** - Improves performance
4. **Use RLS** - Never trust client-side auth alone
5. **Use transactions for complex operations** - Via RPC functions
6. **Index filtered columns** - Especially those in RLS policies
