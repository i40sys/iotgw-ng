-- task-075 (decision-028 §12): re-enroll proof-of-continuity.
--
-- Enrollment authenticates a gateway with the device TOTP derived from
-- non-secret identifiers, so anyone who can read them could impersonate the
-- device to the ssh-ca edge function and rotate its host key. Mitigation:
-- re-enrollment of an already-enrolled device must prove possession of the
-- EXISTING host private key (an SSHSIG over the new key, verified against the
-- previously-enrolled host public key). To verify that signature server-side we
-- must retain the full host public key of the currently-enrolled key — the
-- fingerprint alone cannot verify a signature.
--
-- Public key material only; the private half never leaves the gateway.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_host_pubkey text;

COMMENT ON COLUMN devices.ssh_host_pubkey IS
  'OpenSSH public key of the currently-enrolled SSH host key. Set by the ssh-ca '
  'edge function on enroll; used to verify the re-enroll proof-of-continuity '
  'signature (task-075 / decision-028 §12). Public material only.';
