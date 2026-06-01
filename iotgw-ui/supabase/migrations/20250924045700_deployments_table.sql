-- Create deployments table
create table "public"."deployments" (
    "id" uuid not null default gen_random_uuid(),
    "device_id" uuid not null,
    "name" text not null,
    "configuration" jsonb not null,
    "version" text not null,
    "short" text,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "modified_at" timestamp with time zone default now(),
    "modified_by" uuid
);

-- Enable Row Level Security
alter table "public"."deployments" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX deployments_pkey ON public.deployments USING btree (id);

-- Create performance indexes
CREATE INDEX idx_deployments_device_id ON public.deployments USING btree (device_id);
CREATE INDEX idx_deployments_name ON public.deployments USING btree (name);
CREATE INDEX idx_deployments_version ON public.deployments USING btree (version);
CREATE INDEX idx_deployments_created_at ON public.deployments USING btree (created_at);
CREATE INDEX idx_deployments_modified_at ON public.deployments USING btree (modified_at);
CREATE INDEX idx_deployments_created_by ON public.deployments USING btree (created_by);
CREATE INDEX idx_deployments_modified_by ON public.deployments USING btree (modified_by);

-- Set primary key constraint
alter table "public"."deployments" add constraint "deployments_pkey" PRIMARY KEY using index "deployments_pkey";

-- Add foreign key constraint to devices table
alter table "public"."deployments" add constraint "deployments_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

-- Grant permissions to anon role
grant delete on table "public"."deployments" to "anon";
grant insert on table "public"."deployments" to "anon";
grant references on table "public"."deployments" to "anon";
grant select on table "public"."deployments" to "anon";
grant trigger on table "public"."deployments" to "anon";
grant truncate on table "public"."deployments" to "anon";
grant update on table "public"."deployments" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."deployments" to "authenticated";
grant insert on table "public"."deployments" to "authenticated";
grant references on table "public"."deployments" to "authenticated";
grant select on table "public"."deployments" to "authenticated";
grant trigger on table "public"."deployments" to "authenticated";
grant truncate on table "public"."deployments" to "authenticated";
grant update on table "public"."deployments" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."deployments" to "postgres";
grant insert on table "public"."deployments" to "postgres";
grant references on table "public"."deployments" to "postgres";
grant select on table "public"."deployments" to "postgres";
grant trigger on table "public"."deployments" to "postgres";
grant truncate on table "public"."deployments" to "postgres";
grant update on table "public"."deployments" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."deployments" to "service_role";
grant insert on table "public"."deployments" to "service_role";
grant references on table "public"."deployments" to "service_role";
grant select on table "public"."deployments" to "service_role";
grant trigger on table "public"."deployments" to "service_role";
grant truncate on table "public"."deployments" to "service_role";
grant update on table "public"."deployments" to "service_role";

-- Create RLS policies for deployments table
-- Following the established pattern from fix_rls_policies.sql
create policy "Allow authenticated read access to deployments"
on "public"."deployments"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to deployments"
on "public"."deployments"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to deployments"
on "public"."deployments"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to deployments"
on "public"."deployments"
as permissive
for delete
to authenticated
using (true);

-- Create function to update modified_at timestamp specifically for deployments
create or replace function public.update_deployments_modified_at()
returns trigger as $$
begin
  new.modified_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update modified_at timestamp
create trigger update_deployments_modified_at before update on public.deployments
for each row execute procedure public.update_deployments_modified_at();