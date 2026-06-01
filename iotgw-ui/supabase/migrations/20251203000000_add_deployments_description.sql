-- Add description column to deployments table
-- This column stores optional description/notes for each deployment

ALTER TABLE "public"."deployments" ADD COLUMN "description" text;

-- Add comment for documentation
COMMENT ON COLUMN "public"."deployments"."description" IS 'Optional description or notes for the deployment';
