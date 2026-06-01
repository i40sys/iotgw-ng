-- Drop existing devices table and related objects
drop table if exists "public"."devices" cascade;

-- Create new devices table with updated structure
create table "public"."devices" (
    "id" uuid not null default gen_random_uuid(),
    "network_id" uuid not null,
    "name" text not null,
    "description" text,
    "ip_address" text not null,
    "private_key" text,
    "public_key" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

-- Enable Row Level Security
alter table "public"."devices" enable row level security;

-- Create unique index for primary key
CREATE UNIQUE INDEX devices_pkey ON public.devices USING btree (id);

-- Create unique constraint for ip_address within a network
CREATE UNIQUE INDEX idx_devices_network_ip_unique ON public.devices USING btree (network_id, ip_address);

-- Create performance indexes
CREATE INDEX idx_devices_network_id ON public.devices USING btree (network_id);
CREATE INDEX idx_devices_name ON public.devices USING btree (name);
CREATE INDEX idx_devices_ip_address ON public.devices USING btree (ip_address);
CREATE INDEX idx_devices_created_at ON public.devices USING btree (created_at);

-- Set primary key constraint
alter table "public"."devices" add constraint "devices_pkey" PRIMARY KEY using index "devices_pkey";

-- Add foreign key constraint to networks table
alter table "public"."devices" add constraint "devices_network_id_fkey" FOREIGN KEY (network_id) REFERENCES public.networks(id) ON DELETE CASCADE;

-- Grant permissions to anon role
grant delete on table "public"."devices" to "anon";
grant insert on table "public"."devices" to "anon";
grant references on table "public"."devices" to "anon";
grant select on table "public"."devices" to "anon";
grant trigger on table "public"."devices" to "anon";
grant truncate on table "public"."devices" to "anon";
grant update on table "public"."devices" to "anon";

-- Grant permissions to authenticated role
grant delete on table "public"."devices" to "authenticated";
grant insert on table "public"."devices" to "authenticated";
grant references on table "public"."devices" to "authenticated";
grant select on table "public"."devices" to "authenticated";
grant trigger on table "public"."devices" to "authenticated";
grant truncate on table "public"."devices" to "authenticated";
grant update on table "public"."devices" to "authenticated";

-- Grant permissions to postgres role
grant delete on table "public"."devices" to "postgres";
grant insert on table "public"."devices" to "postgres";
grant references on table "public"."devices" to "postgres";
grant select on table "public"."devices" to "postgres";
grant trigger on table "public"."devices" to "postgres";
grant truncate on table "public"."devices" to "postgres";
grant update on table "public"."devices" to "postgres";

-- Grant permissions to service_role
grant delete on table "public"."devices" to "service_role";
grant insert on table "public"."devices" to "service_role";
grant references on table "public"."devices" to "service_role";
grant select on table "public"."devices" to "service_role";
grant trigger on table "public"."devices" to "service_role";
grant truncate on table "public"."devices" to "service_role";
grant update on table "public"."devices" to "service_role";

-- Create RLS policy for authenticated users to manage devices
create policy "Allow authenticated users to manage devices"
on "public"."devices"
as permissive
for all
to authenticated
using (true)
with check (true);

-- Create function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger update_devices_updated_at before update on public.devices
for each row execute procedure public.update_updated_at_column();