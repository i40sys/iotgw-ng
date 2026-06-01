---
id: doc-015
title: Claude Code Skills and Knowledge Requirements
type: documentation
created_date: "2025-10-21"
---

## Context

The iotgw-ui project uses a modern, complex technology stack spanning frontend, backend, database, and development tooling. For AI assistants like Claude Code to effectively contribute to this project, they need comprehensive knowledge across multiple domains and technologies. This document catalogs all the skills and knowledge areas required to work efficiently with this codebase.

## Technology Stack Overview

The project is built as a **full-stack TypeScript monorepo** with the following main components:

- **Frontend**: React 19 SPA with TanStack Router
- **Backend**: Fastify API server with tRPC v11
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Build System**: Vite (frontend) + esbuild (backend)
- **Package Manager**: pnpm with workspaces
- **Testing**: Vitest for both frontend and backend

## Required Skills and Knowledge Areas

### 1. Frontend Development

#### React 19 Ecosystem

- **React 19 fundamentals**: Hooks-based functional components, concurrent features
- **Component patterns**: Composition, props interfaces, forward refs, memo/callback optimization
- **Hooks**: useState, useEffect, useMemo, useCallback, useRef, useContext, custom hooks
- **React 19 features**: Understanding of new concurrent features and server components architecture (even if not used)

#### TanStack Router

- **File-based routing**: Understanding route structure in `/src/routes/`
- **Route definitions**: `__root.tsx`, dynamic routes (`$id.tsx`), nested routes
- **Type-safe routing**: Route parameters, search params, navigation with type inference
- **Route loaders and actions**: Data fetching patterns for routes
- **Route guards and redirects**: Protected routes and conditional navigation

#### TanStack Query (React Query)

- **Query management**: useQuery hook, query keys, stale time, cache time
- **Mutations**: useMutation, optimistic updates, invalidation patterns
- **Query utilities**: Prefetching, invalidation, manual updates
- **DevTools**: Understanding React Query DevTools for debugging
- **Integration with tRPC**: Using TanStack Query through tRPC hooks

#### State Management Patterns

- **Server state**: Managed via TanStack Query + tRPC
- **Local state**: React hooks (useState, useReducer)
- **Context API**: ThemeProvider, SidebarContext for global UI state
- **Form state**: React Hook Form for form management

#### Styling with Tailwind CSS v4

- **Tailwind v4 features**: Native OKLCH color format, custom variants
- **Utility-first CSS**: Understanding Tailwind class composition
- **Theme configuration**: CSS variables, light/dark mode with `next-themes`
- **Custom variants**: `@custom-variant dark` for dark mode
- **Class merging**: Using `cn()` utility (tailwind-merge + clsx)
- **Responsive design**: Mobile-first breakpoints (sm, md, lg, xl)

#### Shadcn/UI Component Library

- **Component architecture**: Radix UI primitives with Tailwind styling
- **Composition patterns**: `asChild` prop with Radix Slot
- **Variant management**: class-variance-authority (cva) for component variants
- **Accessibility**: Built-in ARIA patterns, keyboard navigation
- **Component customization**: Extending and customizing UI components
- **Key components**: Button, Dialog, AlertDialog, Form, Input, Select, Card, Badge, etc.

#### Form Management

- **React Hook Form**: Form registration, validation, error handling
- **Zod integration**: Schema-based validation with @hookform/resolvers
- **Form patterns**: Controlled/uncontrolled inputs, field arrays, dynamic forms
- **Error handling**: Displaying validation errors, form submission errors
- **Form state**: isSubmitting, isDirty, isValid states

#### Additional Frontend Libraries

- **Lucide React**: Icon library usage and patterns
- **FontAwesome**: Icon integration (@fortawesome/react-fontawesome)
- **Monaco Editor**: JSON editor integration (@monaco-editor/react)
- **Sonner**: Toast notifications (sonner library)
- **react-i18next**: Internationalization with i18next

### 2. Backend Development

#### Fastify Framework

- **Server setup**: Fastify server configuration and plugin system
- **Route handlers**: Defining routes and handling requests
- **Middleware**: Request/response lifecycle, hooks
- **Plugins**: @fastify/cors, @fastify/websocket
- **Error handling**: Error schemas and standardized responses
- **WebSocket support**: Real-time communication patterns

#### tRPC v11 Architecture

- **Core concepts**: Procedures, routers, context, middleware
- **Procedure types**: Queries, mutations, subscriptions
- **Type inference**: End-to-end type safety from server to client
- **Router composition**: Merging multiple routers
- **Error handling**: TRPCError with error codes
- **Input validation**: Zod schemas for procedure inputs
- **Context creation**: Request context with Supabase client

#### tRPC Helper Patterns

- **createQueryProcedure**: Standardized query procedure factory
- **createMutationProcedure**: Standardized mutation procedure factory
- **Error conversion**: Translating Supabase errors to tRPC errors
- **Middleware patterns**: Authentication, rate limiting (future)

#### Structured Logging with Pino

- **Pino setup**: Logger configuration and initialization
- **Logging patterns**: Structured logging with context
- **Log levels**: debug, info, warn, error
- **Pretty printing**: Development vs production logging
- **Performance**: High-performance JSON logging

### 3. Database and Supabase

#### Supabase Client

- **Client initialization**: createClient with database types
- **Type safety**: Using generated TypeScript types
- **Query patterns**: from(), select(), insert(), update(), delete()
- **Filtering**: eq(), neq(), in(), ilike(), etc.
- **Ordering and pagination**: order(), limit(), range()
- **RPC calls**: Calling PostgreSQL functions via Supabase

#### Row Level Security (RLS)

- **RLS concepts**: Database-enforced security policies
- **Policy patterns**: Authenticated users, ownership, role-based
- **Policy testing**: Testing policies with different user contexts
- **Performance implications**: Indexing for policy conditions

#### Database Schema Design

- **PostgreSQL patterns**: Tables, columns, constraints
- **Data types**: UUID, TIMESTAMPTZ, INET, MACADDR, JSONB
- **Relationships**: Foreign keys, CASCADE deletion
- **Indexes**: Performance optimization, composite indexes
- **Triggers**: Automatic timestamp updates

#### Hierarchical Data Model

- **Domains**: Top-level organizational units
- **Networks**: Network segments within domains
- **Devices**: IoT endpoints within networks
- **Cascade relationships**: Understanding parent-child dependencies
- **Unique constraints**: Scoped uniqueness (IP per network, name per domain)

#### Migrations

- **Migration workflow**: Creating and applying migrations
- **Supabase CLI**: gen types, db diff, db reset
- **Version control**: SQL migration files
- **Safe migrations**: Idempotent operations, rollback strategies

### 4. TypeScript and Type Safety

#### Advanced TypeScript

- **Strict mode**: Working with strict TypeScript configuration
- **Type inference**: Leveraging TypeScript's type inference
- **Generic types**: Generic components and functions
- **Utility types**: Omit, Pick, Partial, Required, Record
- **Type guards**: Type narrowing and runtime checks
- **Discriminated unions**: Variant types with type safety
- **Type predicates**: Custom type guard functions

#### Zod Validation

- **Schema definition**: Creating Zod schemas for validation
- **Type inference**: z.infer<typeof schema>
- **Validation methods**: parse(), safeParse(), refine()
- **Complex schemas**: Objects, arrays, unions, optional fields
- **Custom validation**: Custom refinements and transforms
- **Error handling**: Zod error formatting and display

#### Type Generation

- **Supabase types**: Generating types from database schema
- **Type overrides**: Overriding generated types (e.g., INET to string)
- **Shared contract**: @iotgw/supabase-contract package
- **Build dependencies**: Ensuring types are built before dependent packages

### 5. Monorepo Management

#### pnpm Workspaces

- **Workspace structure**: apps/ and packages/ organization
- **Package references**: Using workspace:\* protocol
- **Workspace commands**: --filter, -r (recursive), --parallel
- **Dependency management**: Installing dependencies to specific packages
- **Symlink behavior**: Understanding how pnpm links packages

#### Build Coordination

- **Build order**: Dependency-based build sequence
- **Incremental builds**: Building only changed packages
- **Watch mode**: Development with automatic rebuilds
- **Build tools**: tsdown for packages, Vite for frontend, esbuild for backend

#### Package Management

- **Package structure**: package.json configuration for each package
- **Scripts**: Coordinated scripts across packages
- **Dependencies**: Shared vs package-specific dependencies
- **Version management**: Keeping versions synchronized

#### Development Workflow

- **mprocs**: Multi-process development server management
- **Environment variables**: .env file management
- **Hot reloading**: HMR for frontend, watch mode for backend
- **Cross-package development**: Working with linked packages

### 6. Testing with Vitest

#### Vitest Configuration

- **Setup**: vitest.config.ts, test setup files
- **Test environment**: jsdom for React components
- **Coverage**: v8 provider, coverage reports
- **Globals**: Global test utilities (describe, it, expect)

#### React Testing Library

- **Component testing**: render(), screen queries
- **User interactions**: @testing-library/user-event
- **Async testing**: waitFor(), findBy queries
- **Query priorities**: Accessibility-first queries (getByRole, getByLabelText)

#### Testing Patterns

- **Unit tests**: Testing individual functions and components
- **Integration tests**: Testing component interactions
- **API testing**: Testing tRPC procedures
- **Mocking**: Mocking Supabase, tRPC, external dependencies
- **Test utilities**: Custom wrappers, test fixtures

### 7. Development Tools and Workflow

#### Build Tools

- **Vite**: Frontend development server and build tool
- **esbuild**: Fast bundling for backend
- **tsdown**: Package building with dual ESM/CJS output
- **tsx**: TypeScript execution for development

#### Code Quality

- **ESLint**: Linting with typescript-eslint
- **Prettier**: Code formatting with Tailwind plugin
- **TypeScript compiler**: Type checking across packages
- **Git hooks**: Pre-commit hooks with husky and lint-staged

#### Development Commands

- **pnpm dev**: Start all development servers
- **pnpm test**: Run all tests
- **pnpm typecheck**: Type check all packages
- **pnpm lint**: Lint all packages
- **pnpm build**: Build all packages in correct order

### 8. Internationalization (i18n)

#### react-i18next

- **Setup**: i18next configuration with language detector
- **Translation files**: JSON structure in /src/i18n/locales/
- **useTranslation hook**: Accessing translations in components
- **Language switching**: Dynamic language change
- **Supported locales**: English (en) and Spanish (es)

### 9. UI/UX Patterns

#### Theme Management

- **next-themes**: Light/dark mode implementation
- **Theme provider**: Context-based theme switching
- **Theme-aware components**: Components that respond to theme changes
- **CSS variables**: Theme colors in OKLCH format

#### Navigation Patterns

- **App Sidebar**: Collapsible sidebar with navigation
- **Navigation Bar**: Top navigation with theme toggle
- **Breadcrumbs**: Hierarchical navigation
- **Route-based navigation**: TanStack Router Link component

#### Dialog Patterns

- **AlertDialog**: Confirmation dialogs for destructive actions
- **Dialog**: General-purpose modals for forms
- **Sheet**: Side panel dialogs
- **Dialog state management**: Managing multiple dialog states

#### Error Handling UI

- **Error boundaries**: React error boundaries for component errors
- **Error displays**: User-friendly error messages
- **Loading states**: Skeleton screens, spinners
- **Toast notifications**: Success/error notifications with Sonner

### 10. Project-Specific Patterns

#### Domain-Driven Design

- **Domains**: Top-level organizational units
- **Networks**: Network segments with CIDR notation
- **Devices**: IoT devices with IP addresses and keys
- **Hierarchical CRUD**: Cascade operations and relationships

#### API Development Patterns

- **Standardized procedures**: Using helper functions
- **Error conversion**: Supabase to tRPC error mapping
- **Input validation**: Comprehensive Zod schemas
- **Logging**: Structured logging at procedure boundaries

#### Component Organization

- **Feature-based**: Components grouped by feature (domains, networks, devices)
- **UI components**: Reusable components in /components/ui/
- **Barrel exports**: Index files for clean imports
- **Component co-location**: Components with their related files

#### Form Patterns

- **Dialog forms**: Forms within dialogs
- **JSON editor**: Monaco editor for JSON editing
- **Dynamic forms**: Conditional fields based on form state
- **Validation feedback**: Real-time validation with Zod

## Documentation and Resources

### Project Documentation

Claude Code should be familiar with:

1. **Decision Documents** (backlog/decisions/): Architectural decisions and rationale
2. **Technical Docs** (backlog/docs/): Implementation patterns and guidelines
3. **CLAUDE.md**: Code style preferences and AI assistant guidelines
4. **README.md**: Project overview and setup instructions

### Key Documentation Files

- `decision-001`: Frontend technology choices
- `decision-002`: Backend architecture
- `decision-003`: Database and Supabase
- `decision-004`: Monorepo structure
- `decision-005`: Development tooling
- `decision-006`: Testing framework
- `doc-002`: Testing strategies
- `doc-005`: tRPC API patterns
- `doc-006`: React component guidelines
- `doc-007`: Workspace workflow
- `doc-008`: Domain/Network/Device architecture
- `doc-009`: Vitest testing guide

### External Documentation

Claude Code should have access to or knowledge of:

- React 19 documentation
- TanStack Router documentation
- TanStack Query documentation
- tRPC v11 documentation
- Tailwind CSS v4 documentation
- Shadcn/UI component documentation
- Radix UI primitives documentation
- React Hook Form documentation
- Zod documentation
- Vitest documentation
- Fastify documentation
- Supabase documentation
- pnpm documentation

## MCP Servers and Tools

### Context7 Integration

The project uses the Context7 MCP server for accessing up-to-date library documentation:

- **Purpose**: Fetch latest documentation for libraries used in the project
- **Usage pattern**: Resolve library ID first, then fetch documentation
- **Key libraries to query**:
  - React, TanStack Router, TanStack Query
  - tRPC, Fastify
  - Tailwind CSS, Shadcn/UI, Radix UI
  - Supabase, PostgreSQL

### Recommended Skills Access

- **Web search**: For latest updates and community solutions
- **Documentation fetch**: For official library documentation
- **Code exploration**: For understanding existing patterns in the codebase

## Skill Levels Required

### Essential Skills (Must Have)

- TypeScript (advanced)
- React 19 with hooks
- TanStack Router and Query
- tRPC client and server
- Tailwind CSS
- Zod validation
- pnpm workspaces
- Git and version control

### Important Skills (Should Have)

- Fastify server framework
- Supabase and PostgreSQL
- React Hook Form
- Shadcn/UI components
- Vitest testing
- ESLint and Prettier
- Build tools (Vite, esbuild, tsdown)

### Nice to Have Skills

- Monaco Editor integration
- WebSocket patterns
- Performance optimization
- Accessibility best practices
- CI/CD with GitHub Actions
- Database migration strategies
- Advanced React patterns (memoization, virtualization)

## Consequences

### Positive

- Clear skill requirements for AI assistants working on the project
- Enables focused training and context provision
- Ensures consistent quality of AI-assisted contributions
- Facilitates onboarding of new AI assistants
- Documents the technical complexity and skill requirements

### Negative

- High barrier to entry for basic contributions
- Requires comprehensive context in AI interactions
- May need to provide extensive documentation in prompts
- Complex skill matrix to maintain as project evolves

### Risks

- Skill requirements may become outdated as technology evolves
- AI assistants may struggle with the breadth of knowledge required
- Over-reliance on specific patterns may limit flexibility
- Documentation burden for keeping this list current

## Recommendations

### For AI Interactions

1. **Provide context**: Always include relevant documentation excerpts
2. **Use MCP tools**: Leverage Context7 for up-to-date library documentation
3. **Follow patterns**: Reference existing code examples when explaining patterns
4. **Validate assumptions**: Check documentation before making changes
5. **Respect conventions**: Follow CLAUDE.md guidelines strictly

### For Code Contributions

1. **Type safety first**: Always maintain strict TypeScript typing
2. **Use helpers**: Leverage createQueryProcedure and createMutationProcedure
3. **Follow patterns**: Maintain consistency with existing code
4. **Test thoroughly**: Write tests using established patterns
5. **Document decisions**: Update relevant documentation when making architectural changes

### For Documentation

1. **Keep current**: Update this document as technologies change
2. **Link resources**: Maintain links to external documentation
3. **Example-driven**: Provide code examples for complex patterns
4. **Progressive disclosure**: Start simple, then dive deep

## Conclusion

The iotgw-ui project requires a comprehensive skill set spanning modern web development, TypeScript, full-stack architecture, database design, and monorepo management. AI assistants like Claude Code need familiarity with all these areas to contribute effectively. The extensive documentation in the `backlog/` directory serves as the primary reference for understanding project-specific patterns and conventions.

Success in this project requires not just knowledge of individual technologies, but understanding how they integrate and work together in the monorepo structure. The emphasis on type safety, end-to-end patterns, and developer experience is central to the project's architecture.
