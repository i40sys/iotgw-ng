-- 00-roles.sql — supabase role bootstrap for StackGres.
--
-- The supabase/postgres IMAGE bakes these roles; StackGres uses a vanilla-ish
-- OnGres image that does NOT, so we create them here (run by the SGScript as the
-- StackGres superuser, BEFORE 98-webhooks.sql which assumes supabase_admin/anon/
-- authenticated/service_role already exist). Passwords are set separately from a
-- Secret (see the SGScript's secretKeyRef entry) so no secret is in this file.
-- Reconcile exact attributes against the supabase image over time; this is the
-- faithful working set for the API path (auth/rest/functions).

DO $$
BEGIN
  -- PostgREST API roles (NOLOGIN; authenticator SET ROLEs into them)
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;

  -- Admin/owner roles
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE; END IF;
  -- supabase_functions_admin: owns the supabase_functions schema (98-webhooks.sql)
  -- and is granted CREATE on public below + a password by 90-secrets.sql. It MUST
  -- be created here or the whole script rolls back on a fresh init (the GRANT to it
  -- at the bottom fails with 42704 "role does not exist").
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_functions_admin') THEN
    CREATE ROLE supabase_functions_admin LOGIN NOINHERIT CREATEROLE; END IF;

  -- authenticator: PostgREST connects as this and SET ROLEs. Kept low-privilege
  -- (NOINHERIT, non-superuser). StackGres's managed PgBouncer may pre-provision
  -- a role of this name; normalize it (do NOT grant it SUPERUSER).
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  ELSE
    ALTER ROLE authenticator WITH LOGIN NOINHERIT NOSUPERUSER;
  END IF;

  -- pgbouncer role referenced by the legacy pooler init; harmless when pooling
  -- is disabled (we use the direct primary, decision-018).
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pgbouncer') THEN
    CREATE ROLE pgbouncer LOGIN NOINHERIT; END IF;
END
$$;

-- Role memberships: authenticator + postgres can become the API roles.
GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;
GRANT supabase_auth_admin, supabase_storage_admin TO postgres;

-- public schema usage + default privileges for the API roles.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- PG15+: public schema no longer has PUBLIC CREATE by default.
-- Admin roles need CREATE on public so they can create schema_migrations tables,
-- and so GoTrue / storage / functions migrations can run.
GRANT CREATE ON SCHEMA public TO supabase_auth_admin;
GRANT CREATE ON SCHEMA public TO supabase_admin;
GRANT CREATE ON SCHEMA public TO supabase_storage_admin;
GRANT CREATE ON SCHEMA public TO supabase_functions_admin;

-- GoTrue migrates its own `auth` schema; it needs CREATE on the database.
GRANT CREATE ON DATABASE postgres TO supabase_auth_admin;

-- `auth` schema: GoTrue owns this and runs its migrations into it.
-- Owned by supabase_auth_admin so it can create tables; postgres gets USAGE.
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

-- `extensions` schema must exist before 98-webhooks.sql does
-- `CREATE EXTENSION pg_net SCHEMA extensions`.
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION supabase_admin;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, postgres;
