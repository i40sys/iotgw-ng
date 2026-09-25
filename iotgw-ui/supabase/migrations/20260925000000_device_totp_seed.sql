-- task-132.01 / decision-033: device one-time codes from a KMS-held random seed.
--
-- Replaces the decision-009 code secret (a string built from non-secret
-- identifiers + totp_counter) with a 256-bit random seed held in Cosmian KMS.
-- The backend is the only reader of the seed; it computes codes in memory.
-- NO SEED MATERIAL IS STORED HERE — only the KMS object id.
--
-- This migration adds:
--   * devices.totp_seed_id / totp_seed_rotated_at       — which KMS seed is live
--   * devices.totp_failures / totp_locked_until         — brute-force lockout
--   * devices.ssh_renew_last_ts                         — host-key renew replay guard
--   * device_otp_uses                                   — single-use code ledger
--   * consume_device_otp / record_device_otp_failure / consume_device_renew
--     SECURITY DEFINER RPCs, callable by service_role only.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS totp_seed_id          text,
  ADD COLUMN IF NOT EXISTS totp_seed_rotated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS totp_failures         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totp_locked_until     timestamptz,
  ADD COLUMN IF NOT EXISTS ssh_renew_last_ts     bigint;

COMMENT ON COLUMN devices.totp_seed_id IS
  'Cosmian KMS object id of the device one-time-code seed '
  '(device_totp_<device uuid>_<n>, n = rotation number). NULL = none yet; the '
  'backend creates it lazily. Never the seed itself (decision-033).';

COMMENT ON COLUMN devices.totp_seed_rotated_at IS
  'When the one-time-code seed was last created/rotated ("Reset code").';

COMMENT ON COLUMN devices.totp_failures IS
  'Consecutive failed one-time-code attempts; reset on success and when a lock '
  'is applied. 5 failures lock the code endpoints for 15 min (decision-033 §3).';

COMMENT ON COLUMN devices.totp_locked_until IS
  'While in the future, the vpn/ssh-ca code endpoints refuse this device '
  'before any decryption attempt (decision-033 §3).';

COMMENT ON COLUMN devices.ssh_renew_last_ts IS
  'Unix timestamp (s) of the last accepted host-key-signed ssh-ca renew; a '
  'renew must carry a strictly greater ts (replay guard, decision-033 §5).';

-- Single-use ledger: one row per consumed (device, seed, purpose, step).
CREATE TABLE IF NOT EXISTS device_otp_uses (
  device_id  uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  seed_id    text        NOT NULL,
  purpose    text        NOT NULL
    CHECK (purpose IN ('vpn', 'ssh-enroll', 'ssh-live-enroll', 'ssh-trust')),
  step       bigint      NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, seed_id, purpose, step)
);

COMMENT ON TABLE device_otp_uses IS
  'Consumed device one-time codes (decision-033 §3). Written only through '
  'consume_device_otp(); RLS on with no policies, so only service_role / '
  'SECURITY DEFINER code can touch it.';

ALTER TABLE device_otp_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE device_otp_uses FROM anon, authenticated;

-- Accept a code step once per (device, seed, purpose). An older still-in-window
-- step is refused once a newer one was used. Serialized per device+seed+purpose.
CREATE OR REPLACE FUNCTION public.consume_device_otp(
  p_device_id uuid,
  p_seed_id   text,
  p_purpose   text,
  p_step      bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_device_id::text || '|' || p_seed_id || '|' || p_purpose)
  );

  IF EXISTS (
    SELECT 1
      FROM device_otp_uses
     WHERE device_id = p_device_id
       AND seed_id   = p_seed_id
       AND purpose   = p_purpose
       AND step     >= p_step
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO device_otp_uses (device_id, seed_id, purpose, step)
  VALUES (p_device_id, p_seed_id, p_purpose, p_step);

  UPDATE devices SET totp_failures = 0 WHERE id = p_device_id;

  RETURN true;
END;
$$;

-- Count a failed code attempt; the 5th failure locks the device for 15 min.
-- Returns the resulting totp_locked_until (NULL when not locked).
CREATE OR REPLACE FUNCTION public.record_device_otp_failure(
  p_device_id uuid
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  UPDATE devices
     SET totp_failures     = CASE WHEN totp_failures + 1 >= 5 THEN 0
                                  ELSE totp_failures + 1 END,
         totp_locked_until = CASE WHEN totp_failures + 1 >= 5
                                  THEN now() + interval '15 min'
                                  ELSE totp_locked_until END
   WHERE id = p_device_id
  RETURNING totp_locked_until INTO v_locked_until;

  RETURN v_locked_until;
END;
$$;

-- Accept a host-key-signed renew only if its ts is newer than the last one.
CREATE OR REPLACE FUNCTION public.consume_device_renew(
  p_device_id uuid,
  p_ts        bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE devices
     SET ssh_renew_last_ts = p_ts
   WHERE id = p_device_id
     AND coalesce(ssh_renew_last_ts, 0) < p_ts
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_device_otp(uuid, text, text, bigint)
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_device_otp_failure(uuid)
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_device_renew(uuid, bigint)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_device_otp(uuid, text, text, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_device_otp_failure(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_device_renew(uuid, bigint)
  TO service_role;
