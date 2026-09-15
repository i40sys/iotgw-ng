-- SSH CA migration — map each iotgw-ng domain to its pki-manager zone.
--
-- decision-024 §2: an iotgw-ng `domain` corresponds 1:1 to a pki-manager
-- `zone`, and each zone owns exactly one active User CA and one active Host CA.
-- A host in zone Z trusts only Z's user CAs, so this mapping IS the trust
-- boundary between domains — it is not a label.
--
-- These columns hold REFERENCES ONLY. pki-manager remains the record of truth
-- for every certificate; no key material and no certificate body is ever stored
-- in this database.

ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS pki_zone        text,
  ADD COLUMN IF NOT EXISTS pki_user_ca_id  text,
  ADD COLUMN IF NOT EXISTS pki_host_ca_id  text;

COMMENT ON COLUMN domains.pki_zone IS
  'pki-manager zone slug for this domain (decision-024 §2), e.g. "iotgw-acme". '
  'One zone per domain; a domain with a NULL pki_zone cannot enroll gateways — '
  'enrollment fails closed rather than signing in another domain''s trust domain.';

COMMENT ON COLUMN domains.pki_user_ca_id IS
  'Reference: pki-manager id of this zone''s active User CA. Gateways trust it '
  'via TrustedUserCAKeys. Reference only — never key material.';

COMMENT ON COLUMN domains.pki_host_ca_id IS
  'Reference: pki-manager id of this zone''s active Host CA. It signs gateway '
  'host certificates and the per-host KRLs; operators trust it via a '
  '@cert-authority known_hosts line. Reference only — never key material.';

-- One pki-manager zone can back at most one iotgw-ng domain. Partial, so the
-- many not-yet-linked domains do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS domains_pki_zone_unique
  ON domains (pki_zone)
  WHERE pki_zone IS NOT NULL;
