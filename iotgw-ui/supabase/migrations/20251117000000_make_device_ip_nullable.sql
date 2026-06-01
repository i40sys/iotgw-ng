-- Make ip_address nullable in devices table
alter table "public"."devices" alter column "ip_address" drop not null;

-- Drop the unique constraint on (network_id, ip_address) since we can now have multiple null IPs
drop index if exists "public"."idx_devices_network_ip_unique";

-- Create a partial unique index that only applies when ip_address is not null
-- This allows multiple devices to have null IP addresses while still enforcing uniqueness for non-null IPs
create unique index "idx_devices_network_ip_unique" on "public"."devices" ("network_id", "ip_address")
where "ip_address" is not null;
