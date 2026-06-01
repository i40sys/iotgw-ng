-- Create network_jobs table to store historical execution records from Kestra network workflows
-- This table uses denormalized data to preserve historical accuracy even if related entities are modified or deleted
create table "public"."network_jobs" (
    -- Execution tracking fields
    "id" uuid not null default gen_random_uuid(),
    "execution_id" text not null,
    "flow_id" text not null,
    "status" text not null,
    "started_at" timestamp with time zone not null,
    "completed_at" timestamp with time zone,
    "error_message" text,
    "transaction_id" uuid,

    -- Denormalized network snapshot (copied, not foreign key)
    "network_id" uuid not null,
    "network_name" text not null,
    "network_cidr" text,
    "network_ipv4" text,
    "network_ipv6" text,

    -- Metadata fields
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
);

-- Enable Row Level Security
alter table "public"."network_jobs" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX network_jobs_pkey ON public.network_jobs USING btree (id);

-- Create unique index for execution_id (each Kestra execution should only have one record)
CREATE UNIQUE INDEX network_jobs_execution_id_unique ON public.network_jobs USING btree (execution_id);

-- Create performance indexes for common query patterns
CREATE INDEX idx_network_jobs_status ON public.network_jobs USING btree (status);
CREATE INDEX idx_network_jobs_network_id ON public.network_jobs USING btree (network_id);
CREATE INDEX idx_network_jobs_started_at ON public.network_jobs USING btree (started_at);
CREATE INDEX idx_network_jobs_created_at ON public.network_jobs USING btree (created_at);

-- Set primary key constraint
alter table "public"."network_jobs" add constraint "network_jobs_pkey" PRIMARY KEY using index "network_jobs_pkey";

-- Add unique constraint on execution_id field
alter table "public"."network_jobs" add constraint "network_jobs_execution_id_unique" UNIQUE using index "network_jobs_execution_id_unique";

-- Grant permissions to anon role
grant delete on table "public"."network_jobs" to "anon";
grant insert on table "public"."network_jobs" to "anon";
grant references on table "public"."network_jobs" to "anon";
grant select on table "public"."network_jobs" to "anon";
grant trigger on table "public"."network_jobs" to "anon";
grant truncate on table "public"."network_jobs" to "anon";
grant update on table "public"."network_jobs" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."network_jobs" to "authenticated";
grant insert on table "public"."network_jobs" to "authenticated";
grant references on table "public"."network_jobs" to "authenticated";
grant select on table "public"."network_jobs" to "authenticated";
grant trigger on table "public"."network_jobs" to "authenticated";
grant truncate on table "public"."network_jobs" to "authenticated";
grant update on table "public"."network_jobs" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."network_jobs" to "postgres";
grant insert on table "public"."network_jobs" to "postgres";
grant references on table "public"."network_jobs" to "postgres";
grant select on table "public"."network_jobs" to "postgres";
grant trigger on table "public"."network_jobs" to "postgres";
grant truncate on table "public"."network_jobs" to "postgres";
grant update on table "public"."network_jobs" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."network_jobs" to "service_role";
grant insert on table "public"."network_jobs" to "service_role";
grant references on table "public"."network_jobs" to "service_role";
grant select on table "public"."network_jobs" to "service_role";
grant trigger on table "public"."network_jobs" to "service_role";
grant truncate on table "public"."network_jobs" to "service_role";
grant update on table "public"."network_jobs" to "service_role";

-- Create RLS policies for network_jobs table
-- Following the established pattern with separate policies for each operation
create policy "Allow authenticated read access to network_jobs"
on "public"."network_jobs"
as permissive
for select
to authenticated
using (true);

create policy "Allow authenticated insert access to network_jobs"
on "public"."network_jobs"
as permissive
for insert
to authenticated
with check (true);

create policy "Allow authenticated update access to network_jobs"
on "public"."network_jobs"
as permissive
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete access to network_jobs"
on "public"."network_jobs"
as permissive
for delete
to authenticated
using (true);
