-- Task #145 — Digital signatures on controlled inventory transactions (Phase 3)
--
-- Adds two append-only tables:
--   * user_signing_keys      — per-user Ed25519 keypair; private key wrapped at rest
--                              with a key-encryption-key (KEK) derived from the user's
--                              password / PIN via scrypt + AES-256-GCM. Plaintext private
--                              key never persists.
--   * digital_signatures     — every signing event ties a signer + role + canonical
--                              payload to a verifiable Ed25519 signature.
-- Both tables are append-only (UPDATE/DELETE blocked by triggers). Key rotation is
-- modeled as inserting a new active key and stamping `revoked_at` on the old row;
-- old signatures still verify against the (preserved) old public key.

CREATE TABLE IF NOT EXISTS user_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES users(id),
  algorithm text NOT NULL DEFAULT 'Ed25519',
  public_key text NOT NULL,
  wrapped_private_key text NOT NULL,
  wrap_algorithm text NOT NULL DEFAULT 'AES-256-GCM',
  wrap_iv text NOT NULL,
  wrap_auth_tag text NOT NULL,
  kdf text NOT NULL DEFAULT 'scrypt',
  kdf_salt text NOT NULL,
  kdf_params jsonb NOT NULL DEFAULT '{"N":16384,"r":8,"p":1,"keylen":32}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  rotated_from_id uuid REFERENCES user_signing_keys(id)
);

CREATE INDEX IF NOT EXISTS user_signing_keys_user_idx ON user_signing_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_signing_keys_active_unique
  ON user_signing_keys(user_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION prevent_user_signing_keys_update()
RETURNS trigger AS $$
BEGIN
  -- Allow ONLY revocation transitions: setting revoked_at / revoked_reason on a
  -- previously-unrevoked row. Every other column must remain immutable. We
  -- enumerate ALL columns so adding a forgotten one defaults to "locked".
  IF OLD.id <> NEW.id
     OR OLD.user_id <> NEW.user_id
     OR OLD.algorithm <> NEW.algorithm
     OR OLD.public_key <> NEW.public_key
     OR OLD.wrapped_private_key <> NEW.wrapped_private_key
     OR OLD.wrap_algorithm <> NEW.wrap_algorithm
     OR OLD.wrap_iv <> NEW.wrap_iv
     OR OLD.wrap_auth_tag <> NEW.wrap_auth_tag
     OR OLD.kdf <> NEW.kdf
     OR OLD.kdf_salt <> NEW.kdf_salt
     OR OLD.kdf_params::text <> NEW.kdf_params::text
     OR OLD.rotated_from_id IS DISTINCT FROM NEW.rotated_from_id
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'user_signing_keys is append-only; only revocation is permitted';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    -- Once revoked, the row is fully frozen — neither revoked_at nor
    -- revoked_reason may change again. This is required for audit
    -- integrity (DCAA / AS9100 / CMMC).
    IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'user_signing_keys row is already revoked; revocation cannot be undone';
    END IF;
    IF NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason THEN
      RAISE EXCEPTION 'user_signing_keys.revoked_reason is immutable after revocation';
    END IF;
  ELSE
    -- Pre-revocation: revoked_reason can only become non-null when
    -- revoked_at also becomes non-null in the SAME update.
    IF NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason
       AND NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'user_signing_keys.revoked_reason can only be set together with revoked_at';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_signing_keys_no_update ON user_signing_keys;
CREATE TRIGGER user_signing_keys_no_update
BEFORE UPDATE ON user_signing_keys
FOR EACH ROW EXECUTE FUNCTION prevent_user_signing_keys_update();

CREATE OR REPLACE FUNCTION prevent_user_signing_keys_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'user_signing_keys rows are immutable and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_signing_keys_no_delete ON user_signing_keys;
CREATE TRIGGER user_signing_keys_no_delete
BEFORE DELETE ON user_signing_keys
FOR EACH ROW EXECUTE FUNCTION prevent_user_signing_keys_delete();

CREATE TABLE IF NOT EXISTS digital_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signer_user_id integer NOT NULL REFERENCES users(id),
  signer_role text NOT NULL,
  certificate_id uuid NOT NULL REFERENCES user_signing_keys(id),
  algorithm text NOT NULL DEFAULT 'Ed25519',
  transaction_class text NOT NULL,
  payload_hash text NOT NULL,
  payload_canonical jsonb NOT NULL,
  signature_bytes text NOT NULL,
  signing_device_fingerprint text,
  signed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digital_signatures_signer_idx ON digital_signatures(signer_user_id);
CREATE INDEX IF NOT EXISTS digital_signatures_class_idx ON digital_signatures(transaction_class);
CREATE INDEX IF NOT EXISTS digital_signatures_certificate_idx ON digital_signatures(certificate_id);

CREATE OR REPLACE FUNCTION prevent_digital_signatures_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'digital_signatures rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS digital_signatures_no_update ON digital_signatures;
CREATE TRIGGER digital_signatures_no_update
BEFORE UPDATE ON digital_signatures
FOR EACH ROW EXECUTE FUNCTION prevent_digital_signatures_modification();

DROP TRIGGER IF EXISTS digital_signatures_no_delete ON digital_signatures;
CREATE TRIGGER digital_signatures_no_delete
BEFORE DELETE ON digital_signatures
FOR EACH ROW EXECUTE FUNCTION prevent_digital_signatures_modification();

-- Attach the FK on the inventory ledger column added in 0109.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'itl_digital_signature_fk'
  ) THEN
    ALTER TABLE inventory_transaction_ledger
      ADD CONSTRAINT itl_digital_signature_fk
      FOREIGN KEY (digital_signature_id) REFERENCES digital_signatures(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS itl_digital_signature_idx
  ON inventory_transaction_ledger(digital_signature_id);
