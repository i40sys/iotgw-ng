-- Create deployment_jobs table to store historical execution records from Kestra deployments
-- This table uses denormalized data to preserve historical accuracy even if related entities are modified or deleted
create table "public"."deployment_jobs" (
    -- Execution tracking fields
    "id" uuid not null default gen_random_uuid(),
    "execution_id" text not null,
    "flow_id" text not null,
    "status" text not null,
    "started_at" timestamp with time zone not null,
    "completed_at" timestamp with time zone,
    "error_message" text,

    -- Denormalized device snapshot (copied, not foreign key)
    "device_id" uuid not null,
    "device_name" text not null,
    "device_description" text,
    "device_ip_address" text not null,

    -- Denormalized network snapshot (copied, not foreign key)
    "network_id" uuid not null,
    "network_name" text not null,
    "network_cidr" text,
    "network_ipv4" text,
    "network_ipv6" text,

    -- Denormalized domain snapshot (copied, not foreign key)
    "domain_id" uuid not null,
    "domain_name" text not null,
    "domain_display_name" text not null,

    -- Deployment snapshot (copied, not foreign key)
    "deployment_id" uuid not null,
    "deployment_name" text not null,
    "deployment_version" text not null,
    "configuration_json" jsonb not null,

    -- Metadata fields
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
);

-- Enable Row Level Security
alter table "public"."deployment_jobs" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX deployment_jobs_pkey ON public.deployment_jobs USING btree (id);

-- Create unique index for execution_id (each Kestra execution should only have one record)
CREATE UNIQUE INDEX deployment_jobs_execution_id_unique ON public.deployment_jobs USING btree (execution_id);

-- Create performance indexes for common query patterns
CREATE INDEX idx_deployment_jobs_status ON public.deployment_jobs USING btree (status);
CREATE INDEX idx_deployment_jobs_device_id ON public.deployment_jobs USING btree (device_id);
CREATE INDEX idx_deployment_jobs_started_at ON public.deployment_jobs USING btree (started_at);
CREATE INDEX idx_deployment_jobs_created_at ON public.deployment_jobs USING btree (created_at);

-- Set primary key constraint
alter table "public"."deployment_jobs" add constraint "deployment_jobs_pkey" PRIMARY KEY using index "deployment_jobs_pkey";

-- Add unique constraint on execution_id field
alter table "public"."deployment_jobs" add constraint "deployment_jobs_execution_id_unique" UNIQUE using index "deployment_jobs_execution_id_unique";

-- Grant permissions to anon role
grant delete on table "public"."deployment_jobs" to "anon";
grant insert on table "public"."deployment_jobs" to "anon";
grant references on table "public"."deployment_jobs" to "anon";
grant select on table "public"."deployment_jobs" to "anon";
grant trigger on table "public"."deployment_jobs" to "anon";
grant truncate on table "public"."deployment_jobs" to "anon";
grant update on table "public"."deployment_jobs" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."deployment_jobs" to "authenticated";
grant insert on table "public"."deployment_jobs" to "authenticated";
grant references on table "public"."deployment_jobs" to "authenticated";
grant select on table "public"."deployment_jobs" to "authenticated";
grant trigger on table "public"."deployment_jobs" to "authenticated";
grant truncate on table "public"."deployment_jobs" to "authenticated";
grant update on table "public"."deployment_jobs" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."deployment_jobs" to "postgres";
grant insert on table "public"."deployment_jobs" to "postgres";
grant references on table "public"."deployment_jobs" to "postgres";
grant select on table "public"."deployment_jobs" to "postgres";
grant trigger on table "public"."deployment_jobs" to "postgres";
grant truncate on table "public"."deployment_jobs" to "postgres";
grant update on table "public"."deployment_jobs" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."deployment_jobs" to "service_role";
grant insert on table "public"."deployment_jobs" to "service_role";
grant references on table "public"."deployment_jobs" to "service_role";
grant select on table "public"."deployment_jobs" to "service_role";
grant trigger on table "public"."deployment_jobs" to "service_role";
grant truncate on table "public"."deployment_jobs" to "service_role";
grant update on table "public"."deployment_jobs" to "service_role";

-- Create RLS policies for deployment_jobs table
-- Following the established pattern with separate policies for each operation
create policy "Allow authenticated read access to deployment_jobs"
on "public"."deployment_jobs"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to deployment_jobs"
on "public"."deployment_jobs"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to deployment_jobs"
on "public"."deployment_jobs"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to deployment_jobs"
on "public"."deployment_jobs"
as permissive
for delete
to authenticated
using (true);
