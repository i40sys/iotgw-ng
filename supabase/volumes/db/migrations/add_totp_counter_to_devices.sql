-- Add TOTP counter field to devices table
-- This counter is incremented each time the TOTP is reset, ensuring unique codes
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS totp_counter INTEGER NOT NULL DEFAULT 0;

-- Add comment to explain the column purpose
COMMENT ON COLUMN devices.totp_counter IS 'Counter incremented on each TOTP reset to generate unique codes. Used with device_id, network_id, and domain_id to create TOTP secret.';
