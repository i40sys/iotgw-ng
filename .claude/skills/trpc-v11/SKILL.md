---
name: trpc-v11
description: This skill provides guidance for building end-to-end type-safe APIs with tRPC v11. It should be used when creating procedures (queries/mutations), defining routers, implementing middleware, handling errors, or integrating tRPC with TanStack Query on the client.
---

# tRPC v11 Development

This skill provides patterns for building fully type-safe APIs with tRPC v11, enabling seamless TypeScript integration between client and server.

## Purpose

To enable building APIs where types flow automatically from server to client, eliminating the need for manual type definitions or code generation.

## When to Use

- Creating backend API procedures (queries and mutations)
- Defining and composing routers
- Implementing authentication/authorization middleware
- Handling errors with typed error responses
- Setting up tRPC client with TanStack Query
- Building real-time subscriptions

## Server Setup

### Initialize tRPC

```typescript
// src/server/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

### Context Creation

```typescript
// src/server/context.ts
import { inferAsyncReturnType } from "@trpc/server";
import { createClient } from "@supabase/supabase-js";

export async function createContext({ req, res }: { req: Request; res: Response }) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  return {
    req,
    res,
    supabase,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
```

## Defining Procedures

### Query Procedure

```typescript
// src/server/routers/users.ts
import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const usersRouter = router({
  // Simple query
  list: publicProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("users")
      .select("*");

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data;
  }),

  // Query with input validation
  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("users")
        .select("*")
        .eq("id", input.id)
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return data;
    }),
});
```

### Mutation Procedure

```typescript
export const usersRouter = router({
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("users")
        .insert(input)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already exists",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const { data, error } = await ctx.supabase
        .from("users")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("users")
        .delete()
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),
});
```

## Middleware

### Authentication Middleware

```typescript
// src/server/trpc.ts
const isAuthenticated = middleware(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await ctx.supabase.auth.getUser(token);

  if (error || !user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid token",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user, // Add user to context
    },
  });
});

export const protectedProcedure = publicProcedure.use(isAuthenticated);
```

### Logging Middleware

```typescript
const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  console.log(`${type} ${path} - ${duration}ms`);

  return result;
});
```

## Router Composition

```typescript
// src/server/routers/_app.ts
import { router } from "../trpc";
import { usersRouter } from "./users";
import { postsRouter } from "./posts";
import { devicesRouter } from "./devices";

export const appRouter = router({
  users: usersRouter,
  posts: postsRouter,
  devices: devicesRouter,
});

// Export type for client
export type AppRouter = typeof appRouter;
```

## Client Setup

### tRPC Client with TanStack Query

```typescript
// src/client/trpc.ts
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        headers() {
          return {
            authorization: `Bearer ${getAuthToken()}`,
          };
        },
      }),
    ],
  });
}
```

### Provider Setup

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTRPCClient } from "./client/trpc";

const queryClient = new QueryClient();
const trpcClient = createTRPCClient();

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* App content */}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

## Client Usage

### Queries

```tsx
function UserList() {
  // Simple query
  const { data: users, isLoading } = trpc.users.list.useQuery();

  // Query with input
  const { data: user } = trpc.users.byId.useQuery({ id: "123" });

  // Conditional query
  const { data } = trpc.users.byId.useQuery(
    { id: userId },
    { enabled: !!userId }
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {users?.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### Mutations

```tsx
function CreateUserForm() {
  const utils = trpc.useUtils();

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      // Invalidate users list to refetch
      utils.users.list.invalidate();
    },
    onError: (error) => {
      console.error(error.message);
    },
  });

  const handleSubmit = (data: { name: string; email: string }) => {
    createUser.mutate(data);
  };

  return (
    <form onSubmit={/* ... */}>
      {createUser.isPending && <span>Creating...</span>}
      {createUser.isError && <span>{createUser.error.message}</span>}
      {/* Form fields */}
    </form>
  );
}
```

## Error Handling

### tRPC Error Codes

```typescript
// Available error codes
type TRPCErrorCode =
  | "PARSE_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "METHOD_NOT_SUPPORTED"
  | "UNPROCESSABLE_CONTENT"
  | "TOO_MANY_REQUESTS"
  | "CLIENT_CLOSED_REQUEST"
  | "INTERNAL_SERVER_ERROR";

// Throwing errors
throw new TRPCError({
  code: "NOT_FOUND",
  message: "Resource not found",
  cause: originalError, // Optional: chain errors
});
```

### Client Error Handling

```tsx
function Component() {
  const query = trpc.users.byId.useQuery({ id: "123" });

  if (query.error) {
    // Access typed error
    if (query.error.data?.code === "NOT_FOUND") {
      return <NotFoundPage />;
    }
    if (query.error.data?.code === "UNAUTHORIZED") {
      return <LoginPage />;
    }
    return <ErrorPage message={query.error.message} />;
  }

  return (/* ... */);
}
```

## Best Practices

1. **Keep procedures focused** - One operation per procedure
2. **Validate all inputs with Zod** - Never trust client data
3. **Use appropriate error codes** - Match HTTP semantics
4. **Compose routers logically** - Group by domain/feature
5. **Leverage middleware** - DRY auth, logging, rate limiting
6. **Export AppRouter type** - Single source of truth for client types
7. **Use utils for cache operations** - `trpc.useUtils()` for invalidation

## Integration with Context7

To fetch latest tRPC documentation, use:
- Library ID: `/trpc/trpc` or `/websites/trpc_io`
- Topics: "procedures", "routers", "middleware", "error handling"
