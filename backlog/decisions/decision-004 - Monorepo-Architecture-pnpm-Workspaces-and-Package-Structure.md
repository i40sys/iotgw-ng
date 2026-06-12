---
id: decision-004
title: Monorepo Architecture - pnpm Workspaces and Package Structure
date: "2025-08-24 11:59"
status: approved
---

> **Scope note:** This ADR concerns the **internal pnpm workspace within `iotgw-ui`** (its `apps/` and `packages/`), not the workspace-level monorepo organization. For the workspace-level monorepo, see decision-013.

## Context

The IoT Gateway system consists of multiple interconnected components:

- Frontend React application
- Backend API server
- Shared type definitions and contracts
- Database schema and migrations
- Development tooling and scripts

Key requirements:

- Type safety across frontend and backend boundaries
- Shared code reusability (types, utilities, validation schemas)
- Coordinated dependency management
- Consistent development environment across components
- Efficient build and deployment processes

Options considered: Separate repositories, Lerna, Nx, Rush, pnpm workspaces, Turborepo.

## Decision

**Package Manager**: pnpm with workspaces

- Superior performance with deduplicated node_modules structure
- Native workspace support with cross-package dependency linking
- Strict dependency isolation prevents phantom dependencies
- Efficient caching and fast installations

**Workspace Structure**:

```
packages/
  app/          # Frontend React application (@iotgw/app)
  backend/      # Fastify API server (@iotgw/backend)
  supabase-contract/  # Shared types and database contracts (@iotgw/supabase-contract)
```

**Package Naming Convention**:

- Scoped packages with `@iotgw/` prefix for clear ownership
- Descriptive names matching their purpose
- Consistent versioning across all packages

**Shared Contract Package**:

- Generated database types from Supabase schema
- Shared Zod validation schemas
- Common TypeScript types and interfaces
- Built with tsdown for dual ESM/CJS support

**Development Coordination**:

- **mprocs** for running multiple processes concurrently in development
- Root-level scripts for coordinated operations across packages
- Shared tooling configuration (ESLint, Prettier, TypeScript)

**Build System**:

- Independent build processes per package
- Contract package built first as dependency
- tsdown for optimized package building with tree shaking

## Consequences

**Positive:**

- Complete type safety between frontend and backend
- Simplified dependency management across components
- Fast installations and efficient disk usage
- Code sharing reduces duplication
- Atomic commits for cross-package changes
- Coordinated development environment

**Negative:**

- Added complexity compared to separate repositories
- Learning curve for developers unfamiliar with workspaces
- Build coordination complexity
- Potential for tight coupling between packages

**Risks:**

- Package versioning synchronization challenges
- Build dependency ordering requirements
- Development server coordination complexity
- Potential circular dependency issues

**Implementation Guidelines:**

- Shared code must be placed in appropriate workspace packages
- All cross-package dependencies must be declared in package.json
- Build order must respect dependency graph
- Use workspace protocols for internal package dependencies
- Maintain clear package boundaries and responsibilities
