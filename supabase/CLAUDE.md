# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a self-hosted Supabase instance using Docker Compose. It provides a complete backend-as-a-service stack including PostgreSQL database, authentication, REST API, real-time subscriptions, storage, edge functions, and analytics. This deployment is part of the iotgw-ng project (IoT Gateway Next Generation).

## Architecture

### Core Services

The deployment consists of multiple interconnected Docker containers orchestrated through docker-compose.yml:

- **db (supabase-db)**: PostgreSQL 15.8.1 database with Supabase extensions
  - Includes initialization scripts in volumes/db/ (realtime.sql, webhooks.sql, roles.sql, jwt.sql, _supabase.sql, logs.sql, pooler.sql)
  - Data persisted in volumes/db/data/
  - Port 5432 exposed through supavisor pooler

- **supavisor (supabase-pooler)**: Connection pooler for PostgreSQL
  - Manages database connection pools in transaction mode
  - Exposes port 5432 for client connections
  - Exposes port 6543 for proxy connections

- **auth (supabase-auth)**: GoTrue v2.189.0 authentication service
  - Handles user authentication, JWT tokens, email/phone verification
  - Supports OAuth providers, magic links, password auth
  - Configured via GOTRUE_* environment variables in .env

- **rest (supabase-rest)**: PostgREST v14.12 for automatic REST API generation
  - Auto-generates REST endpoints from PostgreSQL schemas
  - Configured schemas: public, storage, graphql_public (PGRST_DB_SCHEMAS)

- **realtime**: Real-time subscriptions for database changes
  - WebSocket server for live updates
  - Container named "realtime-dev.supabase-realtime" for tenant routing

- **storage (supabase-storage)**: Object storage API
  - File storage in volumes/storage/
  - Integrates with imgproxy for image transformations
  - Can be switched to S3 backend using docker-compose.s3.yml

- **functions (supabase-edge-functions)**: Deno-based edge runtime v1.74.0
  - Functions located in volumes/functions/
  - Main routing function in volumes/functions/main/index.ts handles JWT verification and dispatches to specific functions
  - Custom function netmaker-call handles live device/network provisioning via direct Netmaker REST (the legacy kestra-call edge functions have been removed)

- **kong**: API gateway routing all services through port 8000/8443
  - Configuration in volumes/api/kong.yml
  - Handles request routing, authentication, CORS

- **studio**: Supabase Studio UI
  - Web-based database and project management interface
  - Publishes NO host port in compose; reached via Kong on :8000 (catch-all route) behind dashboard basic-auth

- **analytics (logflare)**: Log aggregation and analytics
  - Port 4000 exposed
  - Uses PostgreSQL backend (can be switched to BigQuery)

- **meta (postgres-meta)**: Database metadata API for Studio

- **imgproxy**: Image transformation service for storage

- **vector**: Log collection and forwarding using Vector
  - Configuration in volumes/logs/vector.yml

### Key Architecture Patterns

1. **Service Dependencies**: All services depend on the db and analytics services being healthy before starting
2. **Internal Networking**: Services communicate via internal Docker network using service names (e.g., http://kong:8000)
3. **Environment Configuration**: Centralized in .env file with secrets like JWT_SECRET, POSTGRES_PASSWORD, API keys
4. **Volume Mounts**: Persistent data and configuration stored in ./volumes/ directory
5. **Edge Functions Main Router**: The main function acts as a dispatcher that verifies JWT tokens and routes requests to specific edge functions by path

### Custom Edge Functions

The deployment includes custom Deno edge functions in volumes/functions/:

- **netmaker-call**: CURRENT live webhook target for both 'devices' AND 'networks' tables
  - Provisions devices/networks directly against the Netmaker REST API (no Kestra in the loop)
  - This is what the DB AFTER INSERT/UPDATE triggers point at today
  - Located at: volumes/functions/netmaker-call/index.ts

- **main**: Central routing function for all edge functions
  - JWT verification when VERIFY_JWT=true
  - Routes requests to specific functions based on path (/function-name)
  - Worker creation with configurable memory limits and timeouts
  - Located at: volumes/functions/main/index.ts

- Other functions: hello, martin, about.ipxe, menu.ipxe (iPXE boot configurations)

## Common Commands

### Starting/Stopping Services

```bash
# Start all services
docker compose up

# Start with dev helpers (includes additional dev services)
docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml up

# Start with S3 storage backend
docker compose -f docker-compose.yml -f docker-compose.s3.yml up

# Stop services
docker compose down

# Stop and remove all data
docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml down -v --remove-orphans

# Complete reset (removes all data and resets .env)
./reset.sh
```

### Service Management

```bash
# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f <service-name>
# Examples: db, auth, rest, functions, kong, studio

# Restart a specific service
docker compose restart <service-name>

# Check service health
docker compose ps
```

### Database Operations

```bash
# Connect to PostgreSQL database
docker exec -it supabase-db psql -U postgres -d postgres

# Run SQL migrations
# Place migration files in volumes/db/ and restart db service

# Backup database
docker exec supabase-db pg_dump -U postgres postgres > backup.sql

# Restore database
docker exec -i supabase-db psql -U postgres postgres < backup.sql
```

### Edge Functions Development

```bash
# Edge functions are in volumes/functions/
# Each function is in its own directory with an index.ts file

# To add a new function:
# 1. Create a directory in volumes/functions/
# 2. Add index.ts with Deno serve() handler
# 3. Restart functions service: docker compose restart functions

# Test edge function locally
curl -X POST http://localhost:8000/functions/v1/<function-name> \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# View function logs
docker compose logs -f supabase-edge-functions
```

### Accessing Services

- **Supabase Studio**: via Kong at http://wsl.ymbihq.local:8000 (catch-all route, behind dashboard basic-auth) — Studio publishes no host port of its own
- **API Gateway (Kong)**: http://wsl.ymbihq.local:8000
- **Database**: localhost:5432 (through supavisor pooler)
- **Analytics**: http://localhost:4000

## Configuration

### Environment Variables

All configuration is in the `.env` file. Key variables:

> Note: real secret values live encrypted in `secrets/supabase.enc.env` (SOPS+age, decision-014). Render the plaintext `.env` with `just secrets-render` or `tools/secrets/secrets.sh render supabase`.

**Security** (must change for production):
- JWT_SECRET: JWT signing key (min 32 chars)
- POSTGRES_PASSWORD: Database password
- ANON_KEY / SERVICE_ROLE_KEY: API keys (generate with JWT_SECRET)
- DASHBOARD_USERNAME / DASHBOARD_PASSWORD: Studio login credentials

**Database**:
- POSTGRES_HOST=db (internal Docker network)
- POSTGRES_DB=postgres
- POSTGRES_PORT=5432

**API Configuration**:
- KONG_HTTP_PORT=8000
- KONG_HTTPS_PORT=8443
- PGRST_DB_SCHEMAS=public,storage,graphql_public

**Authentication**:
- SITE_URL: Frontend application URL
- JWT_EXPIRY=3600 (1 hour)
- ENABLE_EMAIL_SIGNUP / ENABLE_PHONE_SIGNUP
- SMTP configuration for email auth

**Studio**:
- STUDIO_PORT=3000
- SUPABASE_PUBLIC_URL: Public URL for API access
- OPENAI_API_KEY: Optional, enables SQL Editor Assistant

**Edge Functions**:
- FUNCTIONS_VERIFY_JWT=false (applies to all functions)

**Custom**:
- (none) — `KESTRA_BASE_URL` was only consumed by the removed kestra-call edge function; the iotgw-ui backend talks to Kestra via its own hardcoded URL + KESTRA_USER/KESTRA_PASSWORD.

### Kong Configuration

API gateway routes are defined in volumes/api/kong.yml. This file uses environment variable substitution for ANON_KEY, SERVICE_ROLE_KEY, DASHBOARD_USERNAME, and DASHBOARD_PASSWORD.

### Pooler Configuration

Connection pooler settings in volumes/pooler/pooler.exs:
- POOLER_DEFAULT_POOL_SIZE=20
- POOLER_MAX_CLIENT_CONN=100
- POOLER_POOL_MODE=transaction

## Development Workflow

### Making Changes to Edge Functions

1. Edit function code in volumes/functions/<function-name>/index.ts
2. Restart the functions container: `docker compose restart functions`
3. Test the function via HTTP requests to http://localhost:8000/functions/v1/<function-name>
4. Check logs: `docker compose logs -f supabase-edge-functions`

### Database Schema Changes

1. Add SQL migration files to volumes/db/ with appropriate naming (e.g., 100-my-migration.sql)
2. SQL files are executed in alphanumeric order during database initialization
3. For running schema changes, either:
   - Connect to database and run SQL manually
   - Or use Supabase Studio SQL Editor
   - Or use PostgREST schema cache refresh: POST to http://localhost:8000/rest/v1/

### Debugging

- All services log to stdout/stderr, viewable with `docker compose logs`
- Use `docker compose logs -f <service>` to tail specific service logs
- Check service health: `docker compose ps` (shows health status)
- Connect to containers: `docker exec -it <container-name> bash`
- Edge function logs include request IDs and transaction IDs for tracing

### Testing

No automated test suite is currently configured in package.json. Consider adding:
- Integration tests for edge functions
- Database migration tests
- API endpoint tests using the REST API

## Important Notes

1. **Security**: The .env file contains actual credentials and API keys. Never commit this file to version control. Use .env.example as a template.

2. **External Database**: To use an external PostgreSQL database instead of the bundled one, comment out the db service and dependencies in docker-compose.yml and update POSTGRES_HOST in .env.

3. **S3 Storage**: To use S3 instead of local file storage, use docker-compose.s3.yml overlay file and configure S3 credentials in environment.

4. **JWT Keys**: ANON_KEY and SERVICE_ROLE_KEY must be generated using the JWT_SECRET. These are JWT tokens with specific role claims.

5. **Kestra Integration**: Live device/network provisioning runs through the netmaker-call function (direct Netmaker REST). The legacy kestra-call edge functions have been removed. Kestra is still used for OpenWRT install/provisioning/connectivity flows and SSH-key generation, but those are triggered directly from the iotgw-ui backend (KESTRA_USER / KESTRA_PASSWORD from secrets/, SOPS+age, decision-014).

6. **Package Manager**: This project uses pnpm (version 10.17.0) as specified in package.json packageManager field.

7. **Custom Host**: The deployment is configured for wsl.ymbihq.local as the public URL. Update SUPABASE_PUBLIC_URL in .env for different environments.

## References

- [decision-003](../backlog/decisions/decision-003%20-%20Database-and-Infrastructure-Supabase-PostgreSQL-Choice.md) — why Supabase was chosen
- [doc-010](../backlog/docs/doc-010%20-%20Database-Migration-and-Webhook-Management-Guide.md) — migration + webhook management (devices/networks triggers)
- [doc-016](../backlog/docs/doc-016%20-%20Kestra-Notification-Automation-Pattern.md) — the DB-trigger → netmaker-call → Netmaker REST provisioning pattern
- [volumes/functions/CLAUDE.md](volumes/functions/CLAUDE.md) — edge function map
