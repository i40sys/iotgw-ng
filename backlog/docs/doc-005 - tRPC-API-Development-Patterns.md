---
id: doc-005
title: tRPC API Development Patterns
type: documentation
created_date: "2025-08-24 12:17"
---

# tRPC API Development Patterns

## Overview

This document proFvides comprehensive guidelines for developing tRPC APIs in the IoT Gateway project, including standardized procedure creation, error handling patterns, Supabase integration, and best practices for type-safe API development.

## Table of Contents

1. [Core tRPC Setup and Architecture](#core-trpc-setup-and-architecture)
2. [Query Procedure Patterns](#query-procedure-patterns)
3. [Mutation Procedure Patterns](#mutation-procedure-patterns)
4. [Error Handling Patterns](#error-handling-patterns)
5. [Supabase Integration Patterns](#supabase-integration-patterns)
6. [Subscription Patterns](#subscription-patterns)
7. [Frontend Integration Patterns](#frontend-integration-patterns)
8. [Testing Patterns](#testing-patterns)
9. [Performance Optimization](#performance-optimization)
10. [Security Considerations](#security-considerations)

## Core tRPC Setup and Architecture

### Project Structure

```
apps/backend/src/
├── context.ts           # Context creation with Supabase client
├── routers/
│   ├── trpc.ts         # Core tRPC setup and middleware
│   ├── router.ts       # Main app router combining sub-routers
│   ├── domains.ts      # Domain management endpoints
│   ├── networks.ts     # Network management endpoints
│   ├── devices.ts      # Device management endpoints
│   └── misc.ts         # Miscellaneous endpoints
└── utils/
    ├── query-helper.ts    # Standardized query procedure factory
    └── mutation-helper.ts # Standardized mutation procedure factory
```

### Core tRPC Initialization

```typescript
// apps/backend/src/routers/trpc.ts
import { initTRPC } from "@trpc/server";
import type { Context } from "../context";

export const t = initTRPC.context<Context>().create();

// Middleware to ensure Supabase client is available
export const supabaseMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.supabase) {
    throw new Error("Supabase client not available in context");
  }
  return next({
    ctx: {
      ...ctx,
      supabase: ctx.supabase,
    },
  });
});

// Create a tRPC procedure builder that ensures Supabase is available
export const supabaseProcedure = t.procedure.use(supabaseMiddleware);
```

### Context Creation Pattern

```typescript
// apps/backend/src/context.ts
import { type CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@iotgw/supabase-contract";

// Single Supabase client instance
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false }, // Backend doesn't need session persistence
  },
);

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user = { name: req.headers.username ?? "anonymous" };
  return { req, res, user, supabase };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

### App Router Pattern

```typescript
// apps/backend/src/routers/router.ts
import { t } from "./trpc";
import { devicesRouter } from "./devices";
import { domainsRouter } from "./domains";
import { networksRouter } from "./networks";
import { miscRouter } from "./misc";

export const appRouter = t.router({
  ...miscRouter,
  ...devicesRouter,
  ...domainsRouter,
  ...networksRouter,
});

export type AppRouter = typeof appRouter;
```

## Query Procedure Patterns

### Standardized Query Helper

```typescript
// apps/backend/src/utils/query-helper.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../logger";
import type { Context } from "../context";
import { supabaseProcedure } from "../routers/trpc";

export interface HandlerInput<T> {
  input: T;
  ctx: Context;
}

/**
 * Helper function to create a standardized query procedure
 * for Supabase operations with error handling
 */
export const createQueryProcedure = <T extends z.ZodType<unknown>, TOutput>(
  functionName: string,
  inputSchema: T,
  handler: (opts: HandlerInput<z.infer<T>>) => Promise<TOutput>,
) => {
  const procedure = supabaseProcedure.input(inputSchema);

  return procedure.query(async (opts) => {
    try {
      return await handler({
        input: opts.input as z.infer<T>,
        ctx: opts.ctx,
      });
    } catch (error) {
      logger.error(
        { error, functionName, input: opts.input },
        "Error in query procedure",
      );

      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error in ${functionName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        cause: error,
      });
    }
  });
};
```

### Query Usage Patterns

#### Basic List Query

```typescript
// Get all devices
export const getDevices = createQueryProcedure(
  "get_devices",
  z.object({}).optional(),
  async ({ ctx }) => {
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

    logger.info(`Successfully fetched ${data?.length ?? 0} devices`);
    return data ?? [];
  },
);
```

#### Single Item Query with Validation

```typescript
// Get single device by ID
export const getDevice = createQueryProcedure(
  "get_device",
  z.object({
    id: z.string().uuid("Invalid device ID format"),
  }),
  async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("devices")
      .select("*")
      .eq("id", input.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.id} not found`,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data;
  },
);
```

#### Paginated Query

```typescript
export const getDevicesPaginated = createQueryProcedure(
  "get_devices_paginated",
  z.object({
    page: z.number().min(0).default(0),
    pageSize: z.number().min(1).max(1000).default(50),
    filters: z
      .object({
        status: z
          .array(z.enum(["online", "offline", "maintenance", "unknown"]))
          .optional(),
        hostname: z.string().optional(),
      })
      .optional(),
    sortBy: z
      .enum(["hostname", "ip_address", "status", "last_seen_at"])
      .default("last_seen_at"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
  async ({ ctx, input }) => {
    const { page, pageSize, filters = {}, sortBy, sortOrder } = input;
    const offset = page * pageSize;

    let query = ctx.supabase
      .from("devices")
      .select("*", { count: "exact" })
      .range(offset, offset + pageSize - 1)
      .order(sortBy, { ascending: sortOrder === "asc" });

    // Apply filters conditionally
    if (filters.status?.length) {
      query = query.in("status", filters.status);
    }
    if (filters.hostname) {
      query = query.ilike("hostname", `%${filters.hostname}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return {
      devices: data ?? [],
      totalCount: count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    };
  },
);
```

#### RPC Function Query

```typescript
export const getDevicesViaRPC = createQueryProcedure(
  "get_devices_rpc",
  z.object({
    limit_param: z.number().min(1).max(1000).optional(),
    offset_param: z.number().min(0).optional(),
  }),
  async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase.rpc("get_devices", input);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `RPC call failed: ${error.message}`,
      });
    }

    return data ?? [];
  },
);
```

## Mutation Procedure Patterns

### Standardized Mutation Helper

```typescript
// apps/backend/src/utils/mutation-helper.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../logger";
import type { Context } from "../context";
import { supabaseProcedure } from "../routers/trpc";

export interface HandlerInput<T> {
  input: T;
  ctx: Context;
}

/**
 * Helper function to create a standardized mutation procedure
 * for Supabase operations with error handling
 */
export const createMutationProcedure = <T extends z.ZodType<unknown>, TOutput>(
  functionName: string,
  inputSchema: T,
  handler: (opts: HandlerInput<z.infer<T>>) => Promise<TOutput>,
) => {
  const procedure = supabaseProcedure.input(inputSchema);

  return procedure.mutation(async (opts) => {
    try {
      return await handler({
        input: opts.input as z.infer<T>,
        ctx: opts.ctx,
      });
    } catch (error) {
      logger.error(
        { error, functionName, input: opts.input },
        "Error in mutation procedure",
      );

      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error in ${functionName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        cause: error,
      });
    }
  });
};
```

### Mutation Usage Patterns

#### Create Operation

```typescript
export const createDeviceLog = createMutationProcedure(
  "create_device_log",
  z.object({
    hostname: z.string().min(1, "Hostname is required").max(255),
    ipAddress: z.string().ip("Invalid IP address format"),
    metadata: z.record(z.any()).optional(), // JSONB field
  }),
  async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("device_creation_log")
      .insert({
        hostname: input.hostname,
        ip_address: input.ipAddress,
        metadata: input.metadata,
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

    logger.info(
      `Successfully created device log entry for IP ${input.ipAddress}`,
    );
    return data;
  },
);
```

#### Update Operation

```typescript
export const updateDeviceStatus = createMutationProcedure(
  "update_device_status",
  z.object({
    deviceId: z.string().uuid(),
    status: z.enum(["online", "offline", "maintenance", "unknown"]),
    lastSeenAt: z.string().datetime().optional(),
  }),
  async ({ ctx, input }) => {
    const updateData: any = {
      status: input.status,
    };

    if (input.lastSeenAt) {
      updateData.last_seen_at = input.lastSeenAt;
    } else if (input.status === "online") {
      updateData.last_seen_at = new Date().toISOString();
    }

    const { data, error } = await ctx.supabase
      .from("devices")
      .update(updateData)
      .eq("id", input.deviceId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Device with ID ${input.deviceId} not found`,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    logger.info(`Updated device ${input.deviceId} status to ${input.status}`);
    return data;
  },
);
```

#### Delete Operation

```typescript
export const deleteDevice = createMutationProcedure(
  "delete_device",
  z.object({
    deviceId: z.string().uuid(),
  }),
  async ({ ctx, input }) => {
    // Check if device exists first
    const { data: existingDevice, error: checkError } = await ctx.supabase
      .from("devices")
      .select("id, hostname")
      .eq("id", input.deviceId)
      .single();

    if (checkError || !existingDevice) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Device with ID ${input.deviceId} not found`,
      });
    }

    const { error } = await ctx.supabase
      .from("devices")
      .delete()
      .eq("id", input.deviceId);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete device: ${error.message}`,
      });
    }

    logger.info(
      `Successfully deleted device ${existingDevice.hostname} (${input.deviceId})`,
    );
    return { success: true, deletedDevice: existingDevice };
  },
);
```

#### Batch Operation

```typescript
export const updateMultipleDeviceStatuses = createMutationProcedure(
  "update_multiple_device_statuses",
  z.object({
    updates: z
      .array(
        z.object({
          deviceId: z.string().uuid(),
          status: z.enum(["online", "offline", "maintenance", "unknown"]),
        }),
      )
      .min(1)
      .max(100), // Limit batch size
  }),
  async ({ ctx, input }) => {
    const results = [];
    const errors = [];

    // Process updates in sequence to avoid overwhelming the database
    for (const update of input.updates) {
      try {
        const { data, error } = await ctx.supabase
          .from("devices")
          .update({
            status: update.status,
            last_seen_at:
              update.status === "online" ? new Date().toISOString() : undefined,
          })
          .eq("id", update.deviceId)
          .select("id, hostname, status")
          .single();

        if (error) {
          errors.push({ deviceId: update.deviceId, error: error.message });
        } else {
          results.push(data);
        }
      } catch (error) {
        errors.push({
          deviceId: update.deviceId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logger.info(
      `Batch update completed: ${results.length} success, ${errors.length} errors`,
    );

    return {
      updated: results,
      errors: errors,
      totalRequested: input.updates.length,
    };
  },
);
```

## Error Handling Patterns

### Standard Error Codes and Usage

#### Common tRPC Error Codes

```typescript
// Error code usage guidelines

// BAD_REQUEST - Invalid input, validation errors
throw new TRPCError({
  code: "BAD_REQUEST",
  message: "Invalid input parameters",
  cause: validationError,
});

// UNAUTHORIZED - Authentication required
throw new TRPCError({
  code: "UNAUTHORIZED",
  message: "Authentication required",
});

// FORBIDDEN - User doesn't have permission
throw new TRPCError({
  code: "FORBIDDEN",
  message: "Insufficient permissions to access this resource",
});

// NOT_FOUND - Resource doesn't exist
throw new TRPCError({
  code: "NOT_FOUND",
  message: "Resource not found",
});

// CONFLICT - Resource already exists or conflict
throw new TRPCError({
  code: "CONFLICT",
  message: "Device with this hostname already exists",
});

// INTERNAL_SERVER_ERROR - Database errors, unexpected errors
throw new TRPCError({
  code: "INTERNAL_SERVER_ERROR",
  message: "Database operation failed",
  cause: supabaseError,
});

// TOO_MANY_REQUESTS - Rate limiting
throw new TRPCError({
  code: "TOO_MANY_REQUESTS",
  message: "Too many requests, please try again later",
});
```

#### Supabase Error Translation

```typescript
export function translateSupabaseError(error: any): TRPCError {
  // PostgreSQL error codes
  if (error.code) {
    switch (error.code) {
      case "23505": // unique_violation
        return new TRPCError({
          code: "CONFLICT",
          message: "Resource already exists",
          cause: error,
        });

      case "23503": // foreign_key_violation
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid reference to related resource",
          cause: error,
        });

      case "23514": // check_violation
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Data validation failed",
          cause: error,
        });
    }
  }

  // Supabase specific error codes
  switch (error.code) {
    case "PGRST116": // No rows returned
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found",
        cause: error,
      });

    case "PGRST301": // Row level security violation
      return new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied by security policy",
        cause: error,
      });

    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message || "Database operation failed",
        cause: error,
      });
  }
}

// Usage in procedures
const { data, error } = await ctx.supabase.from("devices").insert(deviceData);

if (error) {
  throw translateSupabaseError(error);
}
```

### Custom Error Classes

```typescript
// Custom error types for domain-specific errors
export class DeviceNotFoundError extends TRPCError {
  constructor(deviceId: string) {
    super({
      code: "NOT_FOUND",
      message: `Device with ID ${deviceId} not found`,
    });
  }
}

export class DeviceAlreadyExistsError extends TRPCError {
  constructor(hostname: string) {
    super({
      code: "CONFLICT",
      message: `Device with hostname ${hostname} already exists`,
    });
  }
}

export class DeviceOfflineError extends TRPCError {
  constructor(deviceId: string, lastSeen: string) {
    super({
      code: "PRECONDITION_FAILED",
      message: `Device ${deviceId} is offline (last seen: ${lastSeen})`,
    });
  }
}
```

## Supabase Integration Patterns

### Row Level Security Integration

```typescript
// Procedures that work with RLS policies
export const getUserDevices = createQueryProcedure(
  "get_user_devices",
  z.object({
    userId: z.string().uuid().optional(),
  }),
  async ({ ctx, input }) => {
    // RLS policies will automatically filter results based on authenticated user
    const { data, error } = await ctx.supabase
      .from("devices")
      .select(
        `
        *,
        device_assignments!inner (
          user_id
        )
      `,
      )
      .eq("device_assignments.user_id", input.userId || ctx.user.id);

    if (error) {
      throw translateSupabaseError(error);
    }

    return data;
  },
);
```

### Complex Joins and Relations

```typescript
export const getDeviceWithLogs = createQueryProcedure(
  "get_device_with_logs",
  z.object({
    deviceId: z.string().uuid(),
    limit: z.number().min(1).max(100).default(10),
  }),
  async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("devices")
      .select(
        `
        *,
        device_creation_log (
          id,
          hostname,
          ip_address,
          created_at
        )
      `,
      )
      .eq("id", input.deviceId)
      .order("created_at", {
        ascending: false,
        referencedTable: "device_creation_log",
      })
      .limit(input.limit, { referencedTable: "device_creation_log" })
      .single();

    if (error) {
      throw translateSupabaseError(error);
    }

    return data;
  },
);
```

### Real-time Triggers Integration

```typescript
// Procedure that triggers real-time updates
export const createDeviceWithNotification = createMutationProcedure(
  "create_device_with_notification",
  z.object({
    hostname: z.string().min(1),
    ipAddress: z.string().ip(),
    notifyChannels: z.array(z.string()).default(["device-updates"]),
  }),
  async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("devices")
      .insert({
        hostname: input.hostname,
        ip_address: input.ipAddress,
        status: "unknown",
      })
      .select()
      .single();

    if (error) {
      throw translateSupabaseError(error);
    }

    // Trigger real-time notifications to specified channels
    for (const channel of input.notifyChannels) {
      await ctx.supabase.channel(channel).send({
        type: "broadcast",
        event: "device_created",
        payload: { device: data },
      });
    }

    logger.info(`Created device ${data.hostname} with notifications`);
    return data;
  },
);
```

## Subscription Patterns

### Basic Subscription

```typescript
export const subscribeToDeviceChanges = t.procedure.subscription(() => {
  return observable<DeviceChangeEvent>((emit) => {
    const onDeviceChange = (data: DeviceChangeEvent) => {
      emit.next(data);
    };

    // Subscribe to device changes event emitter
    deviceEventEmitter.on("deviceChange", onDeviceChange);

    // Cleanup function
    return () => {
      deviceEventEmitter.off("deviceChange", onDeviceChange);
    };
  });
});
```

### Filtered Subscription

```typescript
export const subscribeToDeviceStatus = t.procedure
  .input(
    z.object({
      deviceId: z.string().uuid(),
      statusFilter: z
        .array(z.enum(["online", "offline", "maintenance", "unknown"]))
        .optional(),
    }),
  )
  .subscription(({ input }) => {
    return observable<DeviceStatusUpdate>((emit) => {
      const onStatusUpdate = (data: DeviceStatusUpdate) => {
        // Filter by device ID
        if (data.deviceId !== input.deviceId) return;

        // Filter by status if specified
        if (input.statusFilter && !input.statusFilter.includes(data.status))
          return;

        emit.next(data);
      };

      deviceEventEmitter.on("statusUpdate", onStatusUpdate);

      return () => {
        deviceEventEmitter.off("statusUpdate", onStatusUpdate);
      };
    });
  });
```

## Frontend Integration Patterns

### Query Usage

```typescript
// Basic query usage
const { data: devices, isLoading, error } = trpc.getDevices.useQuery();

// Query with parameters
const { data: device } = trpc.getDevice.useQuery(
  {
    id: deviceId,
  },
  {
    enabled: !!deviceId, // Only run query if deviceId exists
  },
);

// Paginated query with state management
const [page, setPage] = useState(0);
const { data: paginatedDevices } = trpc.getDevicesPaginated.useQuery({
  page,
  pageSize: 20,
  filters: { status: ["online", "offline"] },
});
```

### Mutation Usage

```typescript
// Basic mutation
const createDeviceLogMutation = trpc.createDeviceLog.useMutation({
  onSuccess: (data) => {
    toast.success(`Device log created: ${data.hostname}`);
    // Invalidate related queries
    trpc.getDevices.invalidate();
  },
  onError: (error) => {
    toast.error(error.message);
  },
});

// Optimistic updates
const updateDeviceStatusMutation = trpc.updateDeviceStatus.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await trpc.getDevices.cancel();

    // Snapshot previous value
    const previousDevices = trpc.getDevices.getData();

    // Optimistically update
    trpc.getDevices.setData(
      undefined,
      (old) =>
        old?.map((device) =>
          device.id === newData.deviceId
            ? { ...device, status: newData.status }
            : device,
        ) ?? [],
    );

    return { previousDevices };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    trpc.getDevices.setData(undefined, context?.previousDevices);
  },
  onSettled: () => {
    // Refetch after mutation
    trpc.getDevices.invalidate();
  },
});
```

### Subscription Usage

```typescript
// Basic subscription
const { data: deviceChanges } = trpc.subscribeToDeviceChanges.useSubscription(
  undefined,
  {
    onData: (data) => {
      console.log("Device change:", data);
    },
    onError: (error) => {
      console.error("Subscription error:", error);
    },
  },
);

// Subscription with automatic state updates
const [devices, setDevices] = useState<Device[]>([]);

trpc.subscribeToDeviceChanges.useSubscription(undefined, {
  onData: (payload) => {
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
});
```

## Implemented Router Patterns

### Domains Router

The domains router manages top-level organizational units in the IoT Gateway hierarchy.

```typescript
// apps/backend/src/routers/domains.ts
import { createRouter } from "../routers/trpc";
import { createQueryProcedure, createMutationProcedure } from "../utils";
import { z } from "zod";

export const domainsRouter = createRouter({
  // List all domains
  domains: {
    list: createQueryProcedure(
      "list_domains",
      z.object({}).optional(),
      async ({ ctx }) => {
        const { data, error } = await ctx.supabase
          .from("domains")
          .select("*")
          .order("name");

        if (error) throw convertSupabaseError(error);
        return data ?? [];
      },
    ),

    // Get single domain by ID
    getById: createQueryProcedure(
      "get_domain",
      z.object({ id: z.string().uuid() }),
      async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
          .from("domains")
          .select("*")
          .eq("id", input.id)
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Create new domain
    create: createMutationProcedure(
      "create_domain",
      z.object({
        name: z.string().min(1).max(100),
        display_name: z.string().min(1).max(200),
      }),
      async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
          .from("domains")
          .insert(input)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Update domain
    update: createMutationProcedure(
      "update_domain",
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        display_name: z.string().min(1).max(200).optional(),
      }),
      async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const { data, error } = await ctx.supabase
          .from("domains")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Delete domain (cascades to networks and devices)
    delete: createMutationProcedure(
      "delete_domain",
      z.object({ id: z.string().uuid() }),
      async ({ ctx, input }) => {
        const { error } = await ctx.supabase
          .from("domains")
          .delete()
          .eq("id", input.id);

        if (error) throw convertSupabaseError(error);
        return { success: true };
      },
    ),
  },
});
```

### Networks Router

The networks router manages network segments within domains, supporting IPv4 and IPv6 CIDR notation.

```typescript
// apps/backend/src/routers/networks.ts
import { createRouter } from "../routers/trpc";
import { createQueryProcedure, createMutationProcedure } from "../utils";
import { z } from "zod";

// CIDR validation regex patterns
const IPV4_CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const IPV6_CIDR_REGEX = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}\/\d{1,3}$/;

export const networksRouter = createRouter({
  networks: {
    // List all networks
    list: createQueryProcedure(
      "list_networks",
      z.object({}).optional(),
      async ({ ctx }) => {
        const { data, error } = await ctx.supabase
          .from("networks")
          .select("*, domains(*)")
          .order("name");

        if (error) throw convertSupabaseError(error);
        return data ?? [];
      },
    ),

    // List networks by domain
    listByDomain: createQueryProcedure(
      "list_networks_by_domain",
      z.object({ domain_id: z.string().uuid() }),
      async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
          .from("networks")
          .select("*")
          .eq("domain_id", input.domain_id)
          .order("name");

        if (error) throw convertSupabaseError(error);
        return data ?? [];
      },
    ),

    // Create network with CIDR validation
    create: createMutationProcedure(
      "create_network",
      z.object({
        domain_id: z.string().uuid(),
        name: z.string().min(1).max(100),
        ipv4_cidr: z.string().regex(IPV4_CIDR_REGEX).nullable().optional(),
        ipv6_cidr: z.string().regex(IPV6_CIDR_REGEX).nullable().optional(),
      }),
      async ({ ctx, input }) => {
        // Verify domain exists
        const { data: domain } = await ctx.supabase
          .from("domains")
          .select("id")
          .eq("id", input.domain_id)
          .single();

        if (!domain) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Domain not found",
          });
        }

        const { data, error } = await ctx.supabase
          .from("networks")
          .insert(input)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Update network
    update: createMutationProcedure(
      "update_network",
      z.object({
        id: z.string().uuid(),
        domain_id: z.string().uuid().optional(),
        name: z.string().min(1).max(100).optional(),
        ipv4_cidr: z.string().regex(IPV4_CIDR_REGEX).nullable().optional(),
        ipv6_cidr: z.string().regex(IPV6_CIDR_REGEX).nullable().optional(),
      }),
      async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const { data, error } = await ctx.supabase
          .from("networks")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Delete network (cascades to devices)
    delete: createMutationProcedure(
      "delete_network",
      z.object({ id: z.string().uuid() }),
      async ({ ctx, input }) => {
        const { error } = await ctx.supabase
          .from("networks")
          .delete()
          .eq("id", input.id);

        if (error) throw convertSupabaseError(error);
        return { success: true };
      },
    ),
  },
});
```

### Devices Router

The devices router manages IoT devices within networks, including secure key management.

```typescript
// apps/backend/src/routers/devices.ts
import { createRouter } from "../routers/trpc";
import { createQueryProcedure, createMutationProcedure } from "../utils";
import { z } from "zod";

// IP address validation regex
const IP_ADDRESS_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export const devicesRouter = createRouter({
  devices: {
    // List all devices with network info
    list: createQueryProcedure(
      "list_devices",
      z.object({
        network_id: z.string().uuid().optional(),
        name: z.string().optional(),
        ip_address: z.string().optional(),
      }),
      async ({ ctx, input }) => {
        let query = ctx.supabase
          .from("devices")
          .select("*, networks(*, domains(*))");

        if (input.network_id) {
          query = query.eq("network_id", input.network_id);
        }
        if (input.name) {
          query = query.ilike("name", `%${input.name}%`);
        }
        if (input.ip_address) {
          query = query.eq("ip_address", input.ip_address);
        }

        const { data, error } = await query.order("name");

        if (error) throw convertSupabaseError(error);
        return data ?? [];
      },
    ),

    // Create device with IP uniqueness check within network
    create: createMutationProcedure(
      "create_device",
      z.object({
        network_id: z.string().uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        ip_address: z.string().regex(IP_ADDRESS_REGEX),
        private_key: z.string().optional(),
        public_key: z.string().optional(),
      }),
      async ({ ctx, input }) => {
        // Check if IP is unique within the network
        const { data: existing } = await ctx.supabase
          .from("devices")
          .select("id")
          .eq("network_id", input.network_id)
          .eq("ip_address", input.ip_address)
          .single();

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `IP address ${input.ip_address} is already in use in this network`,
          });
        }

        // Encrypt private key if provided (placeholder for actual encryption)
        const deviceData = {
          ...input,
          private_key: input.private_key ? encryptKey(input.private_key) : null,
        };

        const { data, error } = await ctx.supabase
          .from("devices")
          .insert(deviceData)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Update device
    update: createMutationProcedure(
      "update_device",
      z.object({
        id: z.string().uuid(),
        network_id: z.string().uuid().optional(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        ip_address: z.string().regex(IP_ADDRESS_REGEX).optional(),
        private_key: z.string().optional(),
        public_key: z.string().optional(),
      }),
      async ({ ctx, input }) => {
        const { id, ...updates } = input;

        // If IP address is being changed, check uniqueness
        if (updates.ip_address) {
          const { data: device } = await ctx.supabase
            .from("devices")
            .select("network_id")
            .eq("id", id)
            .single();

          if (device) {
            const { data: existing } = await ctx.supabase
              .from("devices")
              .select("id")
              .eq("network_id", updates.network_id ?? device.network_id)
              .eq("ip_address", updates.ip_address)
              .neq("id", id)
              .single();

            if (existing) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `IP address ${updates.ip_address} is already in use in this network`,
              });
            }
          }
        }

        // Encrypt private key if being updated
        if (updates.private_key) {
          updates.private_key = encryptKey(updates.private_key);
        }

        const { data, error } = await ctx.supabase
          .from("devices")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw convertSupabaseError(error);
        return data;
      },
    ),

    // Delete device
    delete: createMutationProcedure(
      "delete_device",
      z.object({ id: z.string().uuid() }),
      async ({ ctx, input }) => {
        const { error } = await ctx.supabase
          .from("devices")
          .delete()
          .eq("id", input.id);

        if (error) throw convertSupabaseError(error);
        return { success: true };
      },
    ),
  },
});
```

### Error Conversion Helper

All routers use a centralized error conversion helper to map Supabase errors to tRPC errors:

```typescript
// apps/backend/src/utils/error-converter.ts
import { TRPCError } from "@trpc/server";

export function convertSupabaseError(error: any): TRPCError {
  // Handle specific Postgres error codes
  switch (error.code) {
    case "23505": // Unique violation
      return new TRPCError({
        code: "CONFLICT",
        message: error.message || "Resource already exists",
      });

    case "23503": // Foreign key violation
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Referenced resource does not exist",
      });

    case "23502": // Not null violation
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Required field is missing",
      });

    case "PGRST116": // No rows found
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Resource not found",
      });

    case "42501": // Insufficient privilege
      return new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });

    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message || "An unexpected error occurred",
      });
  }
}
```

## Testing Patterns

### Unit Testing Procedures

```typescript
// __tests__/procedures/devices.test.ts
import { createContext } from "../../src/context";
import { appRouter } from "../../src/routers/router";
import { TRPCError } from "@trpc/server";

const mockSupabaseClient = {
  from: jest.fn(),
  rpc: jest.fn(),
};

const createMockContext = (overrides = {}) => ({
  req: {} as any,
  res: {} as any,
  user: { name: "test-user" },
  supabase: mockSupabaseClient as any,
  ...overrides,
});

describe("Device procedures", () => {
  let ctx: any;
  let caller: any;

  beforeEach(() => {
    ctx = createMockContext();
    caller = appRouter.createCaller(ctx);
    jest.clearAllMocks();
  });

  describe("getDevice", () => {
    it("should return device when found", async () => {
      const mockDevice = { id: "123", hostname: "test-device" };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockDevice,
              error: null,
            }),
          }),
        }),
      });

      const result = await caller.getDevice({ id: "123" });
      expect(result).toEqual(mockDevice);
    });

    it("should throw NOT_FOUND when device not found", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: "PGRST116" },
            }),
          }),
        }),
      });

      await expect(caller.getDevice({ id: "nonexistent" })).rejects.toThrow(
        TRPCError,
      );
    });
  });
});
```

### Integration Testing

```typescript
// __tests__/integration/devices.integration.test.ts
import { createServer } from "../helpers/create-test-server";
import { createTRPCClient } from "@trpc/client";

describe("Device Integration Tests", () => {
  let server: any;
  let client: any;

  beforeAll(async () => {
    server = await createServer();
    client = createTRPCClient({
      url: `http://localhost:${server.port}`,
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("should create and retrieve device log", async () => {
    // Create device log
    const createResult = await client.createDeviceLog.mutate({
      hostname: "integration-test",
      ipAddress: "192.168.1.100",
    });

    expect(createResult).toHaveProperty("id");
    expect(createResult.hostname).toBe("integration-test");

    // Verify it appears in device list
    const devices = await client.getDevices.query();
    const foundDevice = devices.find((d: any) => d.id === createResult.id);
    expect(foundDevice).toBeDefined();
  });
});
```

## Performance Optimization

### Database Query Optimization

```typescript
// Use select to limit returned fields
export const getDevicesMinimal = createQueryProcedure(
  "get_devices_minimal",
  z.object({}).optional(),
  async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("devices")
      .select("id, hostname, status, last_seen_at") // Only select needed fields
      .order("last_seen_at", { ascending: false })
      .limit(100); // Limit results

    if (error) throw translateSupabaseError(error);
    return data ?? [];
  },
);

// Use indexes efficiently
export const getDevicesByStatus = createQueryProcedure(
  "get_devices_by_status",
  z.object({
    status: z.enum(["online", "offline", "maintenance", "unknown"]),
    limit: z.number().min(1).max(1000).default(50),
  }),
  async ({ ctx, input }) => {
    // This query will use idx_devices_status_active index
    const { data, error } = await ctx.supabase
      .from("devices")
      .select("*")
      .eq("status", input.status)
      .order("last_seen_at", { ascending: false })
      .limit(input.limit);

    if (error) throw translateSupabaseError(error);
    return data ?? [];
  },
);
```

### Caching Strategies

```typescript
// Server-side caching for expensive operations
import { LRUCache } from "lru-cache";

const deviceStatsCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

export const getDeviceStatistics = createQueryProcedure(
  "get_device_statistics",
  z.object({}).optional(),
  async ({ ctx }) => {
    const cacheKey = "device_stats";
    const cached = deviceStatsCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Expensive aggregation query
    const { data, error } = await ctx.supabase.rpc(
      "calculate_device_statistics",
    );

    if (error) throw translateSupabaseError(error);

    deviceStatsCache.set(cacheKey, data);
    return data;
  },
);
```

## Security Considerations

### Input Validation

```typescript
// Comprehensive input validation
const createDeviceSchema = z.object({
  hostname: z
    .string()
    .min(1, "Hostname required")
    .max(253, "Hostname too long")
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/,
      "Invalid hostname format",
    ),
  ipAddress: z
    .string()
    .ip("Invalid IP address")
    .refine((ip) => !ip.startsWith("127."), "Localhost not allowed"),
  macAddress: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, "Invalid MAC address")
    .optional(),
});
```

### Rate Limiting

```typescript
// Rate limiting middleware
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimitMiddleware = t.middleware(({ ctx, next }) => {
  const clientIP = ctx.req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;

  const clientData = rateLimitMap.get(clientIP) || {
    count: 0,
    resetTime: now + windowMs,
  };

  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + windowMs;
  }

  if (clientData.count >= maxRequests) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });
  }

  clientData.count++;
  rateLimitMap.set(clientIP, clientData);

  return next();
});

// Apply to sensitive procedures
export const rateLimitedProcedure = supabaseProcedure.use(rateLimitMiddleware);
```

### Authentication Integration

```typescript
// Authentication middleware (for future use)
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const token = ctx.req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication token required",
    });
  }

  try {
    const {
      data: { user },
      error,
    } = await ctx.supabase.auth.getUser(token);

    if (error || !user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid authentication token",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: user,
      },
    });
  } catch (error) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication verification failed",
    });
  }
});

export const authenticatedProcedure = supabaseProcedure.use(authMiddleware);
```

---

This comprehensive documentation provides a complete foundation for developing consistent, secure, and performant tRPC APIs in the IoT Gateway project. The patterns ensure type safety, proper error handling, and optimal integration with Supabase while maintaining scalability and maintainability.
