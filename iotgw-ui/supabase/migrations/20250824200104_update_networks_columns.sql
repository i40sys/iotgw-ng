-- Update networks table to use ipv4_cidr and ipv6_cidr columns instead of cidr, ipv4, ipv6
-- This aligns the database schema with the form requirements

-- Drop the old columns
ALTER TABLE "public"."networks" DROP COLUMN IF EXISTS "cidr";
ALTER TABLE "public"."networks" DROP COLUMN IF EXISTS "ipv4";
ALTER TABLE "public"."networks" DROP COLUMN IF EXISTS "ipv6";

-- Add the new CIDR columns
ALTER TABLE "public"."networks" ADD COLUMN "ipv4_cidr" text;
ALTER TABLE "public"."networks" ADD COLUMN "ipv6_cidr" text;