-- Create domains table with uuid primary key, unique name constraint, and display_name field
create table "public"."domains" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "display_name" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Enable Row Level Security
alter table "public"."domains" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX domains_pkey ON public.domains USING btree (id);

-- Create unique index for name field (business requirement)
CREATE UNIQUE INDEX domains_name_unique ON public.domains USING btree (name);

-- Create performance indexes
CREATE INDEX idx_domains_name ON public.domains USING btree (name);
CREATE INDEX idx_domains_created_at ON public.domains USING btree (created_at);

-- Set primary key constraint
alter table "public"."domains" add constraint "domains_pkey" PRIMARY KEY using index "domains_pkey";

-- Add unique constraint on name field
alter table "public"."domains" add constraint "domains_name_unique" UNIQUE using index "domains_name_unique";

-- Grant permissions to anon role
grant delete on table "public"."domains" to "anon";
grant insert on table "public"."domains" to "anon";
grant references on table "public"."domains" to "anon";
grant select on table "public"."domains" to "anon";
grant trigger on table "public"."domains" to "anon";
grant truncate on table "public"."domains" to "anon";
grant update on table "public"."domains" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."domains" to "authenticated";
grant insert on table "public"."domains" to "authenticated";
grant references on table "public"."domains" to "authenticated";
grant select on table "public"."domains" to "authenticated";
grant trigger on table "public"."domains" to "authenticated";
grant truncate on table "public"."domains" to "authenticated";
grant update on table "public"."domains" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."domains" to "postgres";
grant insert on table "public"."domains" to "postgres";
grant references on table "public"."domains" to "postgres";
grant select on table "public"."domains" to "postgres";
grant trigger on table "public"."domains" to "postgres";
grant truncate on table "public"."domains" to "postgres";
grant update on table "public"."domains" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."domains" to "service_role";
grant insert on table "public"."domains" to "service_role";
grant references on table "public"."domains" to "service_role";
grant select on table "public"."domains" to "service_role";
grant trigger on table "public"."domains" to "service_role";
grant truncate on table "public"."domains" to "service_role";
grant update on table "public"."domains" to "service_role";

-- Create RLS policy for authenticated users to manage domains
create policy "Allow authenticated users to manage domains"
on "public"."domains"
as permissive
for all
to authenticated
using (true)
with check (true);