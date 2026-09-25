-- task-135 / decision-035: drop devices.totp_counter.
--
-- The decision-009 code secret (<domain>-<network>-<device>-<totp_counter>) was
-- replaced by a KMS-held random seed in decision-033 (devices.totp_seed_id);
-- "Reset code" rotates the seed instead of bumping the counter, and nothing
-- reads the counter any more. The legacy code-encrypted vpn reply for live
-- images older than v0.3.0 is removed at the same time (reply_key required).
ALTER TABLE public.devices DROP COLUMN IF EXISTS totp_counter;
