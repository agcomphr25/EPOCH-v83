-- Durable, user-scoped idempotency for deliberate EPOCH validation package creation.
CREATE TABLE IF NOT EXISTS qms_epoch_validation_create_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation = 'CREATE_PACKAGE'),
  actor_user_id integer NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  package_id uuid REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT qms_esv_create_request_scope_unique UNIQUE(operation, actor_user_id, idempotency_key),
  CONSTRAINT qms_esv_create_request_completion_consistent CHECK (
    (package_id IS NULL AND completed_at IS NULL) OR (package_id IS NOT NULL AND completed_at IS NOT NULL)
  )
);

ALTER TABLE qms_epoch_validation_packages DROP CONSTRAINT IF EXISTS qms_epoch_validation_packages_status_check;
ALTER TABLE qms_epoch_validation_packages ADD CONSTRAINT qms_epoch_validation_packages_status_check CHECK (status IN
  ('DRAFT','PLANNING','READY_FOR_APPROVAL','PLAN_APPROVED','TESTING','TESTING_BLOCKED',
   'CORRECTIONS_REQUIRED','RETESTING','READY_FOR_FINAL_REVIEW','APPROVED_FOR_INTENDED_USE',
   'APPROVED_WITH_LIMITATIONS','REJECTED','SUPERSEDED','CANCELLED','VOID_DUPLICATE'));

CREATE INDEX IF NOT EXISTS qms_esv_create_request_package_idx
  ON qms_epoch_validation_create_requests(package_id) WHERE package_id IS NOT NULL;
