-- Phase 9B certification hardening.
-- Preserve immutable Product Release identity while allowing controlled
-- shipping-consumption and hold state transitions.

CREATE OR REPLACE FUNCTION protect_product_release_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.release_number IS DISTINCT FROM OLD.release_number
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.workflow_instance_id IS DISTINCT FROM OLD.workflow_instance_id
    OR NEW.quality_review_id IS DISTINCT FROM OLD.quality_review_id
    OR NEW.quality_review_revision IS DISTINCT FROM OLD.quality_review_revision
    OR NEW.production_completion_revision IS DISTINCT FROM OLD.production_completion_revision
    OR NEW.customer_po_id IS DISTINCT FROM OLD.customer_po_id
    OR NEW.customer_po_line_id IS DISTINCT FROM OLD.customer_po_line_id
    OR NEW.part_number IS DISTINCT FROM OLD.part_number
    OR NEW.part_revision IS DISTINCT FROM OLD.part_revision
    OR NEW.released_quantity IS DISTINCT FROM OLD.released_quantity
    OR NEW.serial_numbers IS DISTINCT FROM OLD.serial_numbers
    OR NEW.batch_lots IS DISTINCT FROM OLD.batch_lots
    OR NEW.configuration_baseline_id IS DISTINCT FROM OLD.configuration_baseline_id
    OR NEW.effectivity_reference IS DISTINCT FROM OLD.effectivity_reference
    OR NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot
    OR NEW.document_manifest IS DISTINCT FROM OLD.document_manifest
    OR NEW.signature_meaning IS DISTINCT FROM OLD.signature_meaning
    OR NEW.released_by IS DISTINCT FROM OLD.released_by
    OR NEW.released_by_employee_id IS DISTINCT FROM OLD.released_by_employee_id
    OR NEW.released_by_display_name IS DISTINCT FROM OLD.released_by_display_name
    OR NEW.released_by_role IS DISTINCT FROM OLD.released_by_role
    OR NEW.released_at IS DISTINCT FROM OLD.released_at
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Product Release identity and evidence are immutable';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='protect_product_release_identity_trigger'
      AND tgrelid='project_product_releases'::regclass
  ) THEN
    CREATE TRIGGER protect_product_release_identity_trigger
    BEFORE UPDATE ON project_product_releases
    FOR EACH ROW EXECUTE FUNCTION protect_product_release_identity();
  END IF;
END $$;
