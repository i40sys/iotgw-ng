---
description: Manage Supabase Docker services (start, stop, restart, logs, health)
---

# Manage Services Skill

You are helping manage Supabase Docker services. Follow these steps:

1. **Understand the request**:
   - What service(s) need management?
   - What action: start, stop, restart, view logs, check health, rebuild?

2. **Available services**:
   - `studio` - Supabase Studio UI (port 3000)
   - `kong` - API Gateway (ports 8000, 8443)
   - `auth` - Authentication service (GoTrue)
   - `rest` - REST API (PostgREST)
   - `realtime` - Realtime subscriptions
   - `storage` - Object storage
   - `functions` - Edge functions (Deno runtime)
   - `db` - PostgreSQL database
   - `supavisor` - Connection pooler
   - `analytics` - Logflare analytics
   - `meta` - Database metadata API
   - `imgproxy` - Image transformations
   - `vector` - Log collection

3. **Common operations**:

   **Start all services**:
   ```bash
   docker compose up -d
   ```

   **Start with dev helpers**:
   ```bash
   docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml up -d
   ```

   **Stop all services**:
   ```bash
   docker compose down
   ```

   **Restart specific service**:
   ```bash
   docker compose restart <service-name>
   ```

   **View logs**:
   ```bash
   # All services
   docker compose logs -f

   # Specific service
   docker compose logs -f <service-name>

   # Last N lines
   docker compose logs --tail=100 <service-name>
   ```

   **Check health**:
   ```bash
   docker compose ps
   ```

   **Rebuild service**:
   ```bash
   docker compose up -d --build <service-name>
   ```

4. **Service-specific operations**:

   **Database (db)**:
   ```bash
   # Connect to database
   docker exec -it supabase-db psql -U postgres -d postgres

   # View database logs
   docker compose logs -f db

   # Restart database (careful - may affect other services)
   docker compose restart db
   ```

   **Edge Functions (functions)**:
   ```bash
   # Restart after code changes
   docker compose restart functions

   # View function logs
   docker compose logs -f supabase-edge-functions

   # Check if functions are loaded
   docker compose logs supabase-edge-functions | grep "started"
   ```

   **API Gateway (kong)**:
   ```bash
   # Restart Kong
   docker compose restart kong

   # View routing logs
   docker compose logs -f kong
   ```

   **Studio UI (studio)**:
   ```bash
   # Restart Studio
   docker compose restart studio

   # Check if accessible
   curl http://localhost:3000
   ```

5. **Health checks**:
   ```bash
   # Check all services status
   docker compose ps

   # Check specific service health
   docker inspect --format='{{.State.Health.Status}}' <container-name>

   # Example for database
   docker inspect --format='{{.State.Health.Status}}' supabase-db
   ```

6. **Complete reset** (destructive):
   ```bash
   # Interactive reset script
   ./reset.sh

   # Or manual reset
   docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml down -v --remove-orphans
   rm -rf volumes/db/data
   ```

7. **Troubleshooting**:

   **Service won't start**:
   - Check logs: `docker compose logs <service-name>`
   - Check dependencies: Ensure db and analytics are healthy
   - Check ports: Ensure no conflicts with other services
   - Check .env: Verify environment variables are set

   **Service unhealthy**:
   - Check health check logs
   - Verify dependencies are running
   - Check network connectivity between services
   - Restart dependent services

   **Out of sync**:
   - Pull latest images: `docker compose pull`
   - Recreate containers: `docker compose up -d --force-recreate`

8. **Monitoring**:
   ```bash
   # Resource usage
   docker stats

   # Disk usage
   docker system df

   # Network inspection
   docker network inspect supabase_default
   ```

9. **After operations**:
   - Verify services are healthy: `docker compose ps`
   - Check logs for errors
   - Test critical functionality
   - Report status to user

## Service Dependencies

Remember the dependency chain:
- Most services depend on `db` and `analytics` being healthy
- `studio` depends on `analytics`
- `storage` depends on `db`, `rest`, and `imgproxy`
- `kong` depends on `analytics`

When restarting services, consider restarting dependent services if issues persist.
