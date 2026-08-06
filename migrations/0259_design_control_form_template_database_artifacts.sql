-- Retain the small generated Design Control blank PDFs in PostgreSQL so an
-- exact released artifact does not depend on optional deployment object storage.
-- Existing object-storage artifacts remain valid and readable.

ALTER TABLE design_control_form_template_revisions
  ADD COLUMN IF NOT EXISTS blank_pdf_base64 text;

ALTER TABLE design_control_form_template_revisions
  DROP CONSTRAINT IF EXISTS design_control_form_template_revisions_database_pdf_check;
ALTER TABLE design_control_form_template_revisions
  ADD CONSTRAINT design_control_form_template_revisions_database_pdf_check CHECK (
    (blank_pdf_path IS NULL AND blank_pdf_base64 IS NULL)
    OR
    (blank_pdf_path LIKE 'database://%' AND blank_pdf_base64 IS NOT NULL AND length(blank_pdf_base64) > 0)
    OR
    (blank_pdf_path NOT LIKE 'database://%' AND blank_pdf_base64 IS NULL)
  );

CREATE OR REPLACE FUNCTION prevent_design_control_template_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Design Control template revisions are append-only';
  END IF;
  IF OLD.lifecycle_status IN ('RELEASED', 'SUPERSEDED', 'OBSOLETE') AND (
    NEW.canonical_definition IS DISTINCT FROM OLD.canonical_definition
    OR NEW.definition_checksum IS DISTINCT FROM OLD.definition_checksum
    OR NEW.document_version_history_id IS DISTINCT FROM OLD.document_version_history_id
    OR NEW.template_schema_version IS DISTINCT FROM OLD.template_schema_version
    OR NEW.renderer_version IS DISTINCT FROM OLD.renderer_version
    OR NEW.document_number_snapshot IS DISTINCT FROM OLD.document_number_snapshot
    OR NEW.document_revision_snapshot IS DISTINCT FROM OLD.document_revision_snapshot
    OR NEW.template_key_snapshot IS DISTINCT FROM OLD.template_key_snapshot
    OR NEW.blank_pdf_path IS DISTINCT FROM OLD.blank_pdf_path
    OR NEW.blank_pdf_base64 IS DISTINCT FROM OLD.blank_pdf_base64
    OR NEW.blank_pdf_checksum IS DISTINCT FROM OLD.blank_pdf_checksum
  ) THEN
    RAISE EXCEPTION 'Released Design Control template definition and artifact identity are immutable';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN design_control_form_template_revisions.blank_pdf_base64 IS
  'Immutable base64 encoding of the exact retained released blank PDF; populated before release.';
