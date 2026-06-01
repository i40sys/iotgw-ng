-- Fix RLS policies for backend operations with service role
-- This migration ensures only authenticated users can access tables through RLS
-- Backend should use SUPABASE_SERVICE_KEY which bypasses RLS

-- Drop existing policies that only work for authenticated users
drop policy if exists "Allow authenticated users to manage domains" on "public"."domains";
drop policy if exists "Allow authenticated users to manage networks" on "public"."networks";
drop policy if exists "Allow authenticated users to manage devices" on "public"."devices";

-- Create new RLS policies for domains table
-- Only allow authenticated users (frontend/client access)
create policy "Allow authenticated read access to domains"
on "public"."domains"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to domains"
on "public"."domains"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to domains"
on "public"."domains"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to domains"
on "public"."domains"
as permissive
for delete
to authenticated
using (true);

-- Create new RLS policies for networks table
create policy "Allow authenticated read access to networks"
on "public"."networks"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to networks"
on "public"."networks"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to networks"
on "public"."networks"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to networks"
on "public"."networks"
as permissive
for delete
to authenticated
using (true);

-- Create new RLS policies for devices table
create policy "Allow authenticated read access to devices"
on "public"."devices"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to devices"
on "public"."devices"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to devices"
on "public"."devices"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to devices"
on "public"."devices"
as permissive
for delete
to authenticated
using (true);

-- Note: These policies only allow access for authenticated users.
-- The backend MUST use SUPABASE_SERVICE_KEY which bypasses RLS entirely.
-- The anon role is explicitly excluded to ensure proper security.
-- Frontend applications should authenticate users before accessing these resources.