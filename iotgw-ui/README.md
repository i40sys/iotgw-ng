# IoT Gateway UI

A web-based interface for managing IoT devices with real-time monitoring capabilities.

## Project Structure

This is a monorepo managed with pnpm workspaces containing:

- `/apps/app`: Frontend application built with React, TanStack Router, and TailwindCSS
- `/apps/backend`: Backend API server using tRPC and Fastify with Supabase integration
- `/packages/supabase-contract`: Shared types package for Supabase database schema

## Technologies

### Frontend

- React 19
- TanStack Router for routing
- TanStack Query for data fetching
- tRPC for type-safe API integration
- Tailwind CSS for styling
- i18n for internationalization

### Backend

- Fastify for the HTTP server
- tRPC for type-safe API definitions
- Supabase for database and auth
- WebSockets for real-time updates

### Shared Infrastructure

- TypeScript throughout the entire stack
- tsdown for optimized package building
- ESLint with typescript-eslint for code quality
- Prettier for consistent code formatting
- mprocs for concurrent development

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 10+
- Supabase account or local Supabase instance

### Setup

1. Clone the repository

```bash
git clone https://github.com/your-username/iotgw-ui.git
cd iotgw-ui
```

2. Install dependencies

```bash
pnpm install
```

3. Set up environment variables

   - Create a `.env` file in the `apps/backend` directory
   - Add the following variables:

   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_KEY=your-supabase-service-key  # Required for backend operations
   ```

   **Important:** The backend requires `SUPABASE_SERVICE_KEY` to bypass row-level security (RLS) for server-side operations. RLS policies are configured to only allow `authenticated` users, so the service role key is mandatory for the backend to access the database.

4. Run the development servers

```bash
# Run both frontend and backend with mprocs
pnpm dev

# Run only the backend
pnpm backend

# Run only the frontend
pnpm app
```

## Development Workflow

### Code Style and Quality

The project uses ESLint and Prettier for code quality and formatting:

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check

# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix
```

### Type Generation

To update the Supabase type definitions:

```bash
pnpm generate:contract
```

### Building Packages

```bash
# Build the shared contract package
pnpm build:contract

# Build individual apps
cd apps/app && pnpm build
cd apps/backend && pnpm build
```

## Features

- Device management interface
- Real-time monitoring
- Dark/light mode support
- Internationalization (English and Spanish)

## Directory Structure Overview

```
iotgw-ui/
├── apps/
│   ├── app/                 # Frontend application
│   │   ├── public/          # Static assets
│   │   └── src/             # Source code
│   └── backend/             # Backend API server
│       ├── src/             # Source code
│       └── supabase/        # Supabase configuration
├── packages/
│   └── supabase-contract/   # Shared types for Supabase
│       ├── src/             # Source code
│       └── dist/            # Built output
├── package.json             # Root package configuration
└── README.md                # This file
```

## Docker Support

A minimal Docker Compose setup is included for self-hosting Supabase. Follow the steps [here](https://supabase.com/docs/guides/hosting/docker) to get started with the Supabase Docker configuration.

## License

MIT

## Database migration

# backup self hosted docker

## schema

```python
supabase db diff --db-url "postgresql://postgres.your-tenant-id:your-super-secret-and-long-postgres-password@127.0.0.1:5432/postgres" --schema public --debug -f public
```

## data

```python
supabase db dump --data-only --db-url "postgresql://postgres.your-tenant-id:your-super-secret-and-long-postgres-password@127.0.0.1:5432/postgres" --schema public --debug -f ./supabase/seed.sql
```

# reset

```python
PGSSLMODE=disable supabase db reset --db-url "postgresql://postgres.your-tenant-id:your-super-secret-and-long-postgres-password@127.0.0.1:5432/postgres"
```
