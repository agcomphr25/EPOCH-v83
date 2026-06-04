ALTER TABLE controlled_documents
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS version_date date,
  ADD COLUMN IF NOT EXISTS origination_date date;

CREATE INDEX IF NOT EXISTS idx_controlled_documents_template_key
  ON controlled_documents(template_key);

ALTER TABLE p2_certificates_of_conformance
  ADD COLUMN IF NOT EXISTS template_document_id uuid REFERENCES controlled_documents(id),
  ADD COLUMN IF NOT EXISTS template_document_name text,
  ADD COLUMN IF NOT EXISTS template_document_number text,
  ADD COLUMN IF NOT EXISTS template_version text,
  ADD COLUMN IF NOT EXISTS template_version_date date,
  ADD COLUMN IF NOT EXISTS template_display text;

UPDATE controlled_documents
SET
  template_key = COALESCE(template_key, 'manufacturer_coc'),
  current_version = '2.3',
  version_date = DATE '2024-08-14',
  origination_date = COALESCE(origination_date, DATE '2024-08-14'),
  status = 'approved',
  effective_date = COALESCE(effective_date, DATE '2024-08-14'),
  updated_at = NOW()
WHERE document_number = 'FO Form 6'
   OR lower(document_name) = lower('Manufacturer''s Certificate of Conformance');

INSERT INTO controlled_documents (
  template_key,
  document_number,
  document_name,
  document_type,
  department,
  category,
  description,
  current_version,
  version_date,
  origination_date,
  status,
  effective_date,
  retention_length,
  document_owner,
  classification,
  access_rule,
  mfa_required,
  download_tracking_required,
  created_by,
  created_at,
  updated_at
)
SELECT
  'manufacturer_coc',
  'FO Form 6',
  'Manufacturer''s Certificate of Conformance',
  'FORM',
  'Quality Control',
  'Shipping',
  'Controlled template metadata for shipping-generated Manufacturer''s Certificates of Conformance.',
  '2.3',
  DATE '2024-08-14',
  DATE '2024-08-14',
  'approved',
  DATE '2024-08-14',
  'Permanent',
  'Quality',
  'internal',
  'authenticated',
  false,
  true,
  'system',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM controlled_documents
  WHERE document_number = 'FO Form 6'
     OR lower(document_name) = lower('Manufacturer''s Certificate of Conformance')
);

INSERT INTO document_version_history (
  document_id,
  version_number,
  change_description,
  change_type,
  file_path,
  status,
  created_by,
  created_at,
  approved_by,
  approved_at,
  effective_date
)
SELECT
  cd.id,
  '2.3',
  'Approved Manufacturer''s Certificate of Conformance template baseline for shipping-generated CoCs.',
  'minor',
  cd.file_path,
  'approved',
  'system',
  NOW(),
  'system',
  NOW(),
  DATE '2024-08-14'
FROM controlled_documents cd
WHERE cd.document_number = 'FO Form 6'
  AND NOT EXISTS (
    SELECT 1
    FROM document_version_history dvh
    WHERE dvh.document_id = cd.id
      AND dvh.version_number = '2.3'
  );
