-- SSH CA migration — per-device enrollment state.
--
-- decision-025 §D / decision-027. These columns drive three things and nothing
-- else: the migration work queue, the renewal queue, and the phase-4
-- verification gate report. They are written by the `ssh-ca` edge function when
-- a gateway successfully enrolls.
--
-- NO CERTIFICATE BODY AND NO KEY MATERIAL IS STORED HERE. The gateway's host
-- private key never leaves the gateway; the certificate itself lives in
-- pki-manager, which stays the record of truth.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS ssh_host_id                text,
  ADD COLUMN IF NOT EXISTS ssh_host_fqdn              text,
  ADD COLUMN IF NOT EXISTS ssh_host_key_fingerprint   text,
  ADD COLUMN IF NOT EXISTS ssh_host_cert_serial       text,
  ADD COLUMN IF NOT EXISTS ssh_host_cert_valid_before timestamptz,
  ADD COLUMN IF NOT EXISTS ssh_ca_enrolled_at         timestamptz;

COMMENT ON COLUMN devices.ssh_host_id IS
  'Reference: pki-manager ssh_hosts id for this gateway. Used to re-issue and, '
  'on device delete, to offboard. Offboard is TERMINAL (decision-028 §10).';

COMMENT ON COLUMN devices.ssh_host_fqdn IS
  'The name this gateway is REGISTERED under in pki-manager. It embeds a slice '
  'of the device uuid because (zone, fqdn) is unique forever and offboard is '
  'terminal; the human-facing names are certificate principals instead.';

COMMENT ON COLUMN devices.ssh_host_key_fingerprint IS
  'OpenSSH SHA256 fingerprint of the gateway''s host PUBLIC key, as ssh-keygen '
  '-lf prints it. Public value, used to correlate sshd logs. Never the key.';

COMMENT ON COLUMN devices.ssh_host_cert_serial IS
  'Serial of the current host certificate, allocated by pki-manager. Needed to '
  'correlate a KRL entry with a device.';

COMMENT ON COLUMN devices.ssh_host_cert_valid_before IS
  'Expiry of the current host certificate. Drives the renewal queue: a gateway '
  'renews when remaining life drops below a third of the window '
  '(decision-028 §1: 90-day certificates, renewal attempted at 60 days).';

COMMENT ON COLUMN devices.ssh_ca_enrolled_at IS
  'When this gateway last completed SSH CA enrollment. NULL = not yet enrolled, '
  'which is the decision-027 migration work queue.';

-- Work queue: gateways still to enroll.
CREATE INDEX IF NOT EXISTS idx_devices_ssh_ca_pending
  ON devices (created_at)
  WHERE ssh_ca_enrolled_at IS NULL;

-- Renewal queue: soonest expiry first.
CREATE INDEX IF NOT EXISTS idx_devices_ssh_cert_expiry
  ON devices (ssh_host_cert_valid_before)
  WHERE ssh_host_cert_valid_before IS NOT NULL;
