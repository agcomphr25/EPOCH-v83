-- Preserve the supplied Corrective Action Report form fields on the
-- authoritative CAPA/CAR record. JSONB keeps the template-specific detail
-- additive while the established CAPA columns remain the workflow authority.
ALTER TABLE capa_records
  ADD COLUMN IF NOT EXISTS car_form_data jsonb NOT NULL DEFAULT '{}'::jsonb;
