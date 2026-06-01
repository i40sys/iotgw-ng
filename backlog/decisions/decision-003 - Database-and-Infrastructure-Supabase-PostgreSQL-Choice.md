---
id: decision-003
title: Database and Infrastructure - Supabase PostgreSQL Choice
date: "2025-08-24 11:59"
status: approved
---

## Context

The IoT Gateway system requires:

- Reliable data storage for device configurations, sensor data, and user management
- Real-time capabilities for live device monitoring
- Authentication and authorization for user access
- Integration with external workflow systems (Kestra)
- Database-level security with row-level access control
- Scalable architecture that can handle growth
- Fast development iterations with minimal DevOps overhead

Options considered: Self-hosted PostgreSQL, AWS RDS, Firebase, PlanetScale, Supabase.

## Decision

**Primary Database**: Supabase (managed PostgreSQL)

- Fully managed PostgreSQL with built-in authentication
- Real-time subscriptions via WebSocket for live data updates
- Row Level Security (RLS) for fine-grained access control
- Built-in REST API generation for rapid prototyping
- Edge functions for custom business logic

**Security Model**: Row Level Security (RLS)

- Database-enforced security policies instead of application-level checks
- Policies defined at the table level for consistent access control
- User context passed through to database for secure data filtering

**Integration Architecture**:

- **Kestra Integration**: Database triggers and HTTP extension for workflow automation
- **External API Calls**: PostgreSQL HTTP extension enables direct API calls from database functions
- **Real-time Updates**: Supabase real-time subscriptions for device status changes

**Type Safety**: Generated TypeScript types

- Supabase CLI generates TypeScript definitions from database schema
- Shared contract package (@iotgw/supabase-contract) provides consistent types
- Database schema changes automatically propagate to frontend and backend

**Migration Strategy**: SQL migrations with version control

- All schema changes versioned in SQL migration files
- Rollback capabilities for safer deployments
- Database schema as code for consistency across environments

## Consequences

**Positive:**

- Rapid development with built-in authentication and real-time features
- Strong security model with database-enforced policies
- Excellent TypeScript integration with generated types
- Minimal DevOps overhead with managed infrastructure
- Native PostgreSQL compatibility allows advanced SQL features
- Built-in monitoring and analytics dashboard

**Negative:**

- Vendor lock-in to Supabase ecosystem
- Limited control over database configuration and optimization
- Potential cost scaling with usage
- Learning curve for RLS policy design

**Risks:**

- Supabase service availability and reliability
- Migration complexity if switching providers becomes necessary
- RLS performance implications with complex policies
- Potential limitations in advanced PostgreSQL features

**Implementation Guidelines:**

- Always use RLS policies instead of application-level security checks
- Generated types should be the single source of truth for database schema
- Database functions should handle complex business logic where appropriate
- Use Supabase real-time subscriptions for live data updates
