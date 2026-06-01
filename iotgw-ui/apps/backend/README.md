# IoT Gateway Backend

This service acts as a middleware to interact with Supabase, providing a tRPC API for client applications with real-time capabilities and type-safe endpoints.

## Features

- **tRPC API**: Type-safe API endpoints with Fastify adapter
- **WebSocket Support**: Real-time subscriptions for live data updates
- **Supabase Integration**: Database access and authentication
- **Structured Procedures**: Standardized error handling and logging
- **Clean Architecture**: Separation of concerns with utility helpers

## Directory Structure

- `src/context.ts`: Request context creation for tRPC
- `src/logger.ts`: Logging configuration with different environment modes
- `src/routers/`: tRPC router definitions
  - `router.ts`: Main router combining all sub-routers
  - `devices.ts`: Device-related API endpoints
  - `misc.ts`: Miscellaneous API endpoints
  - `trpc.ts`: tRPC procedure definitions and middleware
- `src/server.ts`: Fastify server setup with tRPC plugin
- `src/utils/`: Helper utilities
  - `query-helper.ts`: Standardized query procedure creation
  - `mutation-helper.ts`: Standardized mutation procedure creation

## Key Concepts

### tRPC Procedures

The backend uses a standardized approach to create tRPC procedures:

- `createQueryProcedure`: Factory for read operations with standardized error handling
- `createMutationProcedure`: Factory for write operations with standardized error handling

Example:

```typescript
export const getDevices = createQueryProcedure(
  "getDevices",
  z.object({
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),
  async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("devices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });

    return data;
  },
);
```

### Error Handling

The backend includes a standardized error handling pattern:

1. Try/catch blocks in procedure helpers
2. Conversion to tRPC errors for consistent client responses
3. Detailed error logging with context

### Supabase Connection

The backend connects to Supabase using:

- Environment variables for configuration
- Context creation for every request
- Helper functions for abstracting database operations

## Development

To start the development server:

```bash
# From the backend directory
pnpm dev

# From the root directory
pnpm backend
```

## Environment Variables

Create a `.env` file with these variables:

```
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
PORT=4444 (optional, defaults to 4444)
NODE_ENV=development (or production/test)
```

## Adding New Endpoints

1. Define a new procedure in the appropriate router file:

   - Use `createQueryProcedure` for read operations
   - Use `createMutationProcedure` for write operations

2. Add the procedure to the router export

3. For new resource types, create a dedicated router file and add it to the main router
