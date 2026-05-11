-- Section 12: CMMC / ITAR / Security
-- Adds controlled-vault metadata, session/device tracking, expiring-link audit
-- fields, and CUI/ITAR classification columns for customer/contract artifacts.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS security_policy_version text DEFAULT 'cmmc-itar-v1';

ALTER TABLE controlled_documents
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS contract_artifact_type text,
  ADD COLUMN IF NOT EXISTS access_rule text NOT NULL DEFAULT 'authenticated',
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS download_tracking_required boolean NOT NULL DEFAULT true;

ALTER TABLE object_access_log
  ALTER COLUMN document_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS vault_document_id integer REFERENCES vault_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS link_expires_at timestamp,
  ADD COLUMN IF NOT EXISTS session_id integer;

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text,
  ADD COLUMN IF NOT EXISTS document_category text NOT NULL DEFAULT 'controlled_document',
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS contract_artifact_type text,
  ADD COLUMN IF NOT EXISTS source_entity_type text,
  ADD COLUMN IF NOT EXISTS source_entity_id text,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS encryption_at_rest_policy text NOT NULL DEFAULT 'object_storage_managed',
  ADD COLUMN IF NOT EXISTS access_rule text NOT NULL DEFAULT 'authenticated',
  ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_tracking_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS download_tracking_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expiring_links_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS link_expires_in_seconds integer NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT NOW();

ALTER TABLE rfq_risk_assessments
  ADD COLUMN IF NOT EXISTS security_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS security_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text,
  ADD COLUMN IF NOT EXISTS customer_file_access_rule text NOT NULL DEFAULT 'authenticated';

ALTER TABLE p2_purchase_orders
  ADD COLUMN IF NOT EXISTS security_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text,
  ADD COLUMN IF NOT EXISTS customer_file_access_rule text NOT NULL DEFAULT 'authenticated';

ALTER TABLE contract_review_checklist_instances
  ADD COLUMN IF NOT EXISTS security_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS cui_category text,
  ADD COLUMN IF NOT EXISTS itar_category text,
  ADD COLUMN IF NOT EXISTS export_control_jurisdiction text;

CREATE INDEX IF NOT EXISTS object_access_log_vault_document_id_idx ON object_access_log(vault_document_id);
CREATE INDEX IF NOT EXISTS vault_documents_document_category_idx ON vault_documents(document_category);
CREATE INDEX IF NOT EXISTS vault_documents_customer_id_idx ON vault_documents(customer_id);
CREATE INDEX IF NOT EXISTS vault_documents_source_entity_idx ON vault_documents(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS rfq_risk_assessments_security_classification_idx ON rfq_risk_assessments(security_classification);
CREATE INDEX IF NOT EXISTS quotes_security_classification_idx ON quotes(security_classification);
CREATE INDEX IF NOT EXISTS p2_purchase_orders_security_classification_idx ON p2_purchase_orders(security_classification);
CREATE INDEX IF NOT EXISTS contract_review_instances_security_classification_idx ON contract_review_checklist_instances(security_classification);
