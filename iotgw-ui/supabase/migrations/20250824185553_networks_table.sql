-- Create networks table with uuid primary key and foreign key to domains
create table "public"."networks" (
    "id" uuid not null default gen_random_uuid(),
    "domain_id" uuid not null,
    "name" text not null,
    "cidr" text,
    "ipv4" text,
    "ipv6" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Enable Row Level Security
alter table "public"."networks" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX networks_pkey ON public.networks USING btree (id);

-- Create performance indexes
CREATE INDEX idx_networks_domain_id ON public.networks USING btree (domain_id);
CREATE INDEX idx_networks_name ON public.networks USING btree (name);
CREATE INDEX idx_networks_created_at ON public.networks USING btree (created_at);

-- Set primary key constraint
alter table "public"."networks" add constraint "networks_pkey" PRIMARY KEY using index "networks_pkey";

-- Add foreign key constraint to domains table
alter table "public"."networks" add constraint "networks_domain_id_fkey" FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;

-- Grant permissions to anon role
grant delete on table "public"."networks" to "anon";
grant insert on table "public"."networks" to "anon";
grant references on table "public"."networks" to "anon";
grant select on table "public"."networks" to "anon";
grant trigger on table "public"."networks" to "anon";
grant truncate on table "public"."networks" to "anon";
grant update on table "public"."networks" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."networks" to "authenticated";
grant insert on table "public"."networks" to "authenticated";
grant references on table "public"."networks" to "authenticated";
grant select on table "public"."networks" to "authenticated";
grant trigger on table "public"."networks" to "authenticated";
grant truncate on table "public"."networks" to "authenticated";
grant update on table "public"."networks" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."networks" to "postgres";
grant insert on table "public"."networks" to "postgres";
grant references on table "public"."networks" to "postgres";
grant select on table "public"."networks" to "postgres";
grant trigger on table "public"."networks" to "postgres";
grant truncate on table "public"."networks" to "postgres";
grant update on table "public"."networks" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."networks" to "service_role";
grant insert on table "public"."networks" to "service_role";
grant references on table "public"."networks" to "service_role";
grant select on table "public"."networks" to "service_role";
grant trigger on table "public"."networks" to "service_role";
grant truncate on table "public"."networks" to "service_role";
grant update on table "public"."networks" to "service_role";

-- Create RLS policy for authenticated users to manage networks
create policy "Allow authenticated users to manage networks"
on "public"."networks"
as permissive
for all
to authenticated
using (true)
with check (true);