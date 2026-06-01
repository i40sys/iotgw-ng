---
id: decision-005
title: Development Tooling - Build and Development Experience
date: "2025-08-24 11:59"
status: approved
---

## Context

The development team requires:

- Fast development iteration cycles
- Consistent code quality and formatting
- Type safety throughout the development process
- Easy process management for multiple services
- Optimized builds for production
- Modern JavaScript/TypeScript development experience

Key considerations:

- Multiple packages need coordinated development
- Both frontend and backend need hot reloading
- Code quality must be enforced consistently
- Build times should be minimized
- Development setup should be simple for new team members

## Decision

**Process Management**: mprocs for development coordination

- Concurrent execution of frontend, backend, and watch processes
- Visual process management with logs and status
- Simple configuration in mprocs.yaml
- Better than npm-run-all for complex multi-process scenarios

**TypeScript Execution**: tsx for development

- Fast TypeScript execution without compilation step
- Hot reloading for backend development
- Native ESM support
- Better performance than ts-node

**Code Quality Tools**:

- **ESLint + @typescript-eslint**: Comprehensive linting with TypeScript support
- **Prettier**: Consistent code formatting with Tailwind plugin
- **TypeScript**: Strict type checking with modern configurations

**Build Tools**:

- **Vite**: Frontend build tool with fast HMR and optimized production builds
- **tsdown**: Package building for shared libraries with dual ESM/CJS output
- **Native TypeScript**: Compilation for backend with incremental builds

**Development Commands Structure**:

```bash
pnpm dev        # Run all services concurrently with mprocs
pnpm backend    # Run only backend API
pnpm app        # Run only frontend
pnpm typecheck  # Type check all packages
pnpm lint       # Lint all packages
pnpm format     # Format all code
pnpm build      # Build all packages in dependency order
```

**Configuration Strategy**:

- Shared ESLint and Prettier configurations at workspace root
- TypeScript project references for incremental compilation
- Centralized tool configurations with workspace inheritance

**Type Generation**:

- Automated database type generation from Supabase schema
- tRPC client type generation at build time
- Watch mode for type regeneration during development

## Consequences

**Positive:**

- Excellent developer experience with fast iteration cycles
- Consistent code quality across the entire codebase
- Simple onboarding with minimal setup required
- Fast builds and type checking
- Hot reloading for both frontend and backend
- Coordinated process management for complex development scenarios

**Negative:**

- Tool complexity and configuration overhead
- Learning curve for developers unfamiliar with the toolchain
- Potential version conflicts between development dependencies
- Build system complexity with multiple tools

**Risks:**

- Tooling incompatibility issues as dependencies update
- Performance degradation with very large codebases
- Development server coordination failures
- Build configuration drift between packages

**Implementation Guidelines:**

- All code must pass linting and formatting checks before commits
- Type checking must be clean across all packages
- Development scripts should handle common workflow scenarios
- Tool configurations should be shared and consistent
- Build optimization should prioritize development speed over production size during development
