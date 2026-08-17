-- Guided, auditable FAR/DFARS applicability review for vendor purchase orders.

ALTER TABLE far_flowdown_clauses
  ADD COLUMN IF NOT EXISTS regulation text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS clause_date text,
  ADD COLUMN IF NOT EXISTS official_url text,
  ADD COLUMN IF NOT EXISTS incorporation_method text NOT NULL DEFAULT 'REFERENCE',
  ADD COLUMN IF NOT EXISTS commercial_applicability text NOT NULL DEFAULT 'CONDITIONAL',
  ADD COLUMN IF NOT EXISTS full_text text,
  ADD COLUMN IF NOT EXISTS legal_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE vendor_po_far_flowdowns
  ADD COLUMN IF NOT EXISTS recommendation text NOT NULL DEFAULT 'REVIEW',
  ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS trigger_reason text,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS inclusion_method text NOT NULL DEFAULT 'REFERENCE',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PO_REVIEW';

CREATE TABLE IF NOT EXISTS vendor_po_flowdown_assessments (
  id serial PRIMARY KEY,
  vendor_po_id integer NOT NULL UNIQUE REFERENCES vendor_pos(id) ON DELETE CASCADE,
  government_supported boolean NOT NULL DEFAULT false,
  internal_contract_reference text,
  source_document_reference text,
  disclose_contract_reference boolean NOT NULL DEFAULT false,
  procurement_class text NOT NULL DEFAULT 'UNKNOWN',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'DRAFT',
  review_notes text NOT NULL DEFAULT '',
  approved_by_user_id integer,
  approved_by_display_name text,
  approved_at timestamp,
  exhibit_revision integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vendor_po_flowdown_procurement_class_check CHECK (procurement_class IN ('UNKNOWN','COTS','COMMERCIAL_PRODUCT','COMMERCIAL_SERVICE','NONCOMMERCIAL_SUPPLY','SERVICE','CONSTRUCTION','MIXED')),
  CONSTRAINT vendor_po_flowdown_review_status_check CHECK (review_status IN ('DRAFT','REVIEW_REQUIRED','APPROVED','BLOCKED'))
);

CREATE INDEX IF NOT EXISTS vendor_po_flowdown_assessment_status_idx
  ON vendor_po_flowdown_assessments (review_status);

INSERT INTO far_flowdown_clauses
  (clause_number, title, description, applicability_rule, default_applicable, regulation, official_url, incorporation_method, commercial_applicability, legal_review_required)
VALUES
  ('52.204-25', 'Prohibition on Certain Telecommunications and Video Surveillance Services or Equipment', 'Include the substance when required, including for commercial products and services.', '{"trigger":"government_supported"}'::jsonb, true, 'FAR', 'https://www.acquisition.gov/far/52.204-25', 'SUBSTANCE', 'ALLOWED', false),
  ('52.244-6', 'Subcontracts for Commercial Products and Commercial Services', 'Commercial-product and commercial-service subcontract flowdown baseline.', '{"procurementClasses":["COTS","COMMERCIAL_PRODUCT","COMMERCIAL_SERVICE"]}'::jsonb, false, 'FAR', 'https://www.acquisition.gov/far/52.244-6', 'REFERENCE', 'REQUIRED', false),
  ('252.244-7000', 'Subcontracts for Commercial Products or Commercial Services', 'Restricts which FAR/DFARS clauses may be placed on commercial suppliers.', '{"procurementClasses":["COTS","COMMERCIAL_PRODUCT","COMMERCIAL_SERVICE"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.244-7000-subcontracts-commercial-products-or-commercial-services.', 'FULL_TEXT', 'REQUIRED', false),
  ('252.204-7012', 'Safeguarding Covered Defense Information and Cyber Incident Reporting', 'Requires specialist review when covered defense information or operationally critical support is involved.', '{"anyAnswers":["cuiCdi","operationallyCriticalSupport"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting.', 'FULL_TEXT', 'CONDITIONAL', true),
  ('52.245-1', 'Government Property', 'Apply only when Government property is furnished or accountable under the subcontract.', '{"anyAnswers":["governmentProperty"]}'::jsonb, false, 'FAR', 'https://www.acquisition.gov/far/52.245-1', 'REFERENCE', 'CONDITIONAL', true),
  ('252.225-7009', 'Restriction on Acquisition of Certain Articles Containing Specialty Metals', 'Apply when the customer requirement and purchased articles trigger specialty-metals restrictions.', '{"anyAnswers":["specialtyMetals"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.225-7009-restriction-acquisition-certain-articles-containing-specialty-metals.', 'REFERENCE', 'CONDITIONAL', true),
  ('252.246-7007', 'Contractor Counterfeit Electronic Part Detection and Avoidance System', 'Apply when electronic parts or assemblies containing electronic parts are purchased.', '{"anyAnswers":["electronicParts"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.246-7007-contractor-counterfeit-electronic-part-detection-and-avoidance-system.', 'REFERENCE', 'CONDITIONAL', false),
  ('252.246-7008', 'Sources of Electronic Parts', 'Apply when electronic parts are purchased and the clause is present in the customer contract.', '{"anyAnswers":["electronicParts"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.246-7008-sources-electronic-parts.', 'REFERENCE', 'CONDITIONAL', false),
  ('252.225-7048', 'Export-Controlled Items', 'Requires export-control review when items, information, or performance are export controlled.', '{"anyAnswers":["exportControlled"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.225-7048-export-controlled-items.', 'FULL_TEXT', 'CONDITIONAL', true),
  ('252.225-7013', 'Duty-Free Entry', 'Contract identification may be required on specified customs and shipping documents when triggered.', '{"anyAnswers":["importedItems","dutyFreeEntry"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.225-7013-duty-free-entry.', 'SUBSTANCE', 'CONDITIONAL', true),
  ('252.247-7023', 'Transportation of Supplies by Sea', 'Apply when ocean transportation is involved and the customer contract requires the clause.', '{"anyAnswers":["oceanTransportation"]}'::jsonb, false, 'DFARS', 'https://www.acquisition.gov/dfars/252.247-7023-transportation-supplies-sea.', 'REFERENCE', 'CONDITIONAL', false),
  ('AG-QUALITY', 'AG Quality and Technical Requirements', 'PO-specific quality, certification, traceability, change-control, and record-retention requirements.', '{"trigger":"government_supported"}'::jsonb, true, 'AG', NULL, 'FULL_TEXT', 'ALLOWED', false)
ON CONFLICT (clause_number) DO NOTHING;
