-- Add ssh_key_id column to devices table
-- This column stores the reference to the SSH key pair in Cosmian KMS
-- The actual key material is never stored in the database - only the KMS object identifier

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS ssh_key_id VARCHAR(255) NULL;

-- Add descriptive comment explaining the column purpose
COMMENT ON COLUMN devices.ssh_key_id IS
  'Reference to SSH key object in Cosmian KMS. Contains the KMS object identifier, not key material. Format: device_ssh_<device_id>';

-- Create partial index for efficient lookups on non-null values
CREATE INDEX IF NOT EXISTS idx_devices_ssh_key_id
  ON devices(ssh_key_id)
  WHERE ssh_key_id IS NOT NULL;
