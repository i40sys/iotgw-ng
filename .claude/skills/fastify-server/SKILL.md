---
name: fastify-server
description: This skill provides guidance for building Fastify server applications with plugins, hooks, routes, middleware, and proper error handling. Use when working with Fastify backend code, API endpoints, or server configuration.
---

# Fastify Server Framework

Fast and low overhead web framework for Node.js with built-in TypeScript support.

## Context7 Library ID

For up-to-date documentation: `/fastify/fastify`

Related plugins:
- `/fastify/fastify-websocket` - WebSocket support
- `/fastify/fastify-cors` - CORS handling
- `/fastify/fastify-multipart` - File uploads

## Core Concepts

### Server Initialization

```typescript
import Fastify, { FastifyInstance } from "fastify";

const server: FastifyInstance = Fastify({
  logger: true, // Enable built-in Pino logger
  trustProxy: true, // When behind a proxy
});

// Start server
server.listen({ port: 3000, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Server listening on ${address}`);
});
```

### Plugin System

Fastify uses encapsulated plugins for modularity:

```typescript
import fp from "fastify-plugin";

// Encapsulated plugin (isolated scope)
async function myPlugin(fastify: FastifyInstance, opts: object) {
  fastify.decorate("utility", () => "helper");

  fastify.get("/plugin-route", async (request, reply) => {
    return { status: "ok" };
  });
}

// Shared plugin (exposes decorators to parent)
export default fp(myPlugin, {
  name: "my-plugin",
  fastify: "5.x",
});

// Registration
server.register(myPlugin, { prefix: "/api" });
```

### Route Definition

```typescript
// Short-hand declaration
server.get("/", async (request, reply) => {
  return { hello: "world" };
});

// Full declaration with schema
server.route({
  method: "POST",
  url: "/users",
  schema: {
    body: {
      type: "object",
      required: ["name", "email"],
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
      },
    },
    response: {
      201: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
  handler: async (request, reply) => {
    const { name, email } = request.body as { name: string; email: string };
    reply.code(201);
    return { id: "123", name };
  },
});
```

### Hooks Lifecycle

Hooks execute in this order:

1. `onRequest` - Before routing
2. `preParsing` - Before body parsing
3. `preValidation` - Before schema validation
4. `preHandler` - Before route handler
5. `preSerialization` - Before response serialization
6. `onSend` - Before sending response
7. `onResponse` - After response sent
8. `onError` - On error

```typescript
// Application-level hook
server.addHook("onRequest", async (request, reply) => {
  request.startTime = Date.now();
});

// Route-level hook
server.route({
  method: "GET",
  url: "/protected",
  preHandler: async (request, reply) => {
    const token = request.headers.authorization;
    if (!token) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  },
  handler: async () => ({ data: "secret" }),
});

// Plugin-scoped hook
server.register(async (instance) => {
  instance.addHook("preHandler", async (request, reply) => {
    // Only applies to routes in this plugin
  });

  instance.get("/scoped", async () => ({ scoped: true }));
});
```

### Decorators

Extend Fastify instance, request, or reply:

```typescript
// Instance decorator
server.decorate("db", databaseConnection);

// Request decorator
server.decorateRequest("user", null);

// Reply decorator
server.decorateReply("sendSuccess", function (data: unknown) {
  return this.code(200).send({ success: true, data });
});

// TypeScript declaration merging
declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseConnection;
  }
  interface FastifyRequest {
    user: User | null;
  }
  interface FastifyReply {
    sendSuccess(data: unknown): FastifyReply;
  }
}
```

### Error Handling

```typescript
import { FastifyError } from "fastify";

// Custom error handler
server.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error);

  if (error.validation) {
    return reply.code(400).send({
      error: "Validation Error",
      details: error.validation,
    });
  }

  reply.code(error.statusCode || 500).send({
    error: error.message,
  });
});

// Not found handler
server.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: "Route not found",
    path: request.url,
  });
});

// Throwing errors in handlers
import { createError } from "@fastify/error";

const NotFoundError = createError("NOT_FOUND", "Resource %s not found", 404);

server.get("/items/:id", async (request) => {
  const item = await findItem(request.params.id);
  if (!item) {
    throw new NotFoundError(request.params.id);
  }
  return item;
});
```

### Request Validation with TypeBox

```typescript
import { Type, Static } from "@sinclair/typebox";

const UserSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  email: Type.String({ format: "email" }),
  age: Type.Optional(Type.Integer({ minimum: 0 })),
});

type User = Static<typeof UserSchema>;

server.post<{ Body: User }>("/users", {
  schema: {
    body: UserSchema,
  },
  handler: async (request) => {
    const user = request.body; // Typed as User
    return { created: user };
  },
});
```

### CORS Configuration

```typescript
import cors from "@fastify/cors";

server.register(cors, {
  origin: ["https://example.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
});
```

### WebSocket Support

```typescript
import websocket from "@fastify/websocket";

server.register(websocket);

server.get("/ws", { websocket: true }, (socket, request) => {
  socket.on("message", (message) => {
    socket.send(`Echo: ${message}`);
  });

  socket.on("close", () => {
    request.log.info("WebSocket closed");
  });
});
```

## Best Practices

1. **Use plugins for organization** - Group related routes and logic
2. **Leverage schema validation** - Auto-generates OpenAPI docs
3. **Use decorators sparingly** - Avoid polluting the instance
4. **Handle errors consistently** - Use custom error handler
5. **Log appropriately** - Use built-in Pino logger
6. **Type everything** - Use TypeScript generics for request/reply

## Common Patterns in This Project

### tRPC Integration

This project uses tRPC with Fastify adapter. Routes are defined in tRPC routers, not Fastify routes directly.

### Structured Logging

```typescript
// Use request-scoped logger
request.log.info({ userId: user.id }, "User authenticated");
request.log.error({ error, context: "payment" }, "Payment failed");
```

### Graceful Shutdown

```typescript
const signals = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`Received ${signal}, shutting down`);
    await server.close();
    process.exit(0);
  });
});
```
