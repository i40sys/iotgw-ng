---
id: decision-002
title: Backend Architecture - Fastify and tRPC API Design
date: "2025-08-24 11:59"
status: approved
---

## Context

The IoT Gateway backend needs to handle:

- High-throughput data from multiple IoT devices
- Real-time WebSocket connections for live device monitoring
- Type-safe API contracts between frontend and backend
- Integration with external systems (Supabase, Kestra workflows)
- Structured logging for debugging and monitoring
- Fast startup times for development

Requirements include performance, type safety, developer productivity, and maintainability.

## Decision

**HTTP Server**: Fastify instead of Express

- Superior performance with lower overhead and faster JSON serialization
- Built-in TypeScript support and plugin ecosystem
- Native schema validation and serialization
- Excellent WebSocket support via @fastify/websocket

**API Layer**: tRPC v11 for type-safe APIs

- End-to-end type safety from database to frontend
- Automatic API client generation with TypeScript inference
- Integrated with TanStack Query for optimal frontend caching
- Procedure-based architecture with input/output validation using Zod

**API Architecture Pattern**:

- Router-based organization grouping related endpoints
- Separation of query (read) and mutation (write) procedures
- Helper functions `createQueryProcedure` and `createMutationProcedure` for consistent patterns
- Centralized error handling with proper tRPC error codes

**Logging**: Pino structured logging

- High-performance JSON logging for production
- Pretty printing in development
- Structured fields for better log analysis

**Validation**: Zod schemas throughout

- Shared validation schemas between frontend and backend
- Runtime type checking with compile-time TypeScript inference
- Database input/output validation

## Consequences

**Positive:**

- Excellent performance for IoT data throughput
- Complete type safety eliminates API contract bugs
- Fast development with automatic client generation
- Strong WebSocket support for real-time features
- Structured logging improves debugging and monitoring

**Negative:**

- tRPC learning curve for developers familiar with REST
- Less ecosystem maturity compared to Express
- Potential vendor lock-in to tRPC ecosystem

**Risks:**

- tRPC v11 breaking changes as it's relatively new
- Fastify plugin compatibility issues
- Performance optimization may require Fastify-specific knowledge

**Implementation Guidelines:**

- All API endpoints must use tRPC procedures with Zod validation
- Group related endpoints in dedicated router files
- Use helper functions for consistent error handling
- Implement proper logging at procedure boundaries
