-- Migration 0218: EPOCH AS9100 Audit Readiness additive normalized QMS record system.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS qms_audit_readiness_number_seq START 1;

CREATE TABLE IF NOT EXISTS qms_audit_readiness_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','RELEASED','SUPERSEDED')),
  definition_checksum text NOT NULL,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, version)
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES qms_audit_readiness_templates(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  section_key text NOT NULL,
  section_title text NOT NULL,
  sequence integer NOT NULL,
  action_statement text NOT NULL,
  purpose text NOT NULL,
  clause_reference text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  evidence_required boolean NOT NULL DEFAULT true,
  criticality text NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','NORMAL')),
  default_owner_role text,
  design_scope_item boolean NOT NULL DEFAULT false,
  UNIQUE(template_id, item_key),
  UNIQUE(template_id, sequence)
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_number text NOT NULL UNIQUE,
  title text NOT NULL,
  audit_type text NOT NULL,
  standard text NOT NULL DEFAULT 'AS9100D',
  certification_body text,
  auditor text,
  planned_start_date date NOT NULL,
  planned_end_date date NOT NULL,
  owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  owner_display_name text NOT NULL,
  epoch_version text NOT NULL,
  qms_scope text NOT NULL,
  product_design_in_scope boolean NOT NULL DEFAULT false,
  deliverable_software_in_scope boolean NOT NULL DEFAULT false,
  facility text NOT NULL,
  notes text,
  template_id uuid NOT NULL REFERENCES qms_audit_readiness_templates(id) ON DELETE RESTRICT,
  template_version integer NOT NULL,
  assessment_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','ACTIVE','UNDER_REVIEW','CORRECTIONS_REQUIRED','READY_FOR_APPROVAL',
     'APPROVED','LOCKED','SUPERSEDED','CANCELLED')),
  row_version integer NOT NULL DEFAULT 1,
  locked_at timestamptz,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  template_item_id uuid NOT NULL REFERENCES qms_audit_readiness_template_items(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  section_key text NOT NULL,
  section_title text NOT NULL,
  sequence integer NOT NULL,
  action_statement text NOT NULL,
  purpose text NOT NULL,
  clause_reference text NOT NULL,
  required boolean NOT NULL,
  evidence_required boolean NOT NULL,
  criticality text NOT NULL,
  assigned_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  assigned_employee_name text,
  assigned_department text,
  due_date date,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN
    ('NOT_STARTED','IN_PROGRESS','EVIDENCE_REQUIRED','READY_FOR_REVIEW',
     'RETURNED_FOR_CORRECTION','VERIFIED','COMPLETE','BLOCKED',
     'NOT_APPLICABLE_PENDING_APPROVAL','NOT_APPLICABLE_APPROVED')),
  completion_percentage integer NOT NULL DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
  comments text,
  reviewer_comments text,
  verification_result text,
  verified_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  verified_by_display_name text,
  verified_at timestamptz,
  approval_status text,
  na_justification text,
  na_approved_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  na_approver_display_name text,
  na_approver_role text,
  na_approved_at timestamptz,
  completed_at timestamptz,
  design_scope_item boolean NOT NULL DEFAULT false,
  row_version integer NOT NULL DEFAULT 1,
  last_updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, item_key)
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES qms_audit_readiness_items(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  source_module text NOT NULL,
  source_reference_type text,
  source_record_id text,
  record_number text NOT NULL,
  title text NOT NULL,
  revision text,
  record_status text,
  open_route text,
  attachment_id uuid,
  evidence_note text,
  snapshot_checksum text,
  is_removed boolean NOT NULL DEFAULT false,
  added_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_by_display_name text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  removed_at timestamptz
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES qms_audit_readiness_items(id) ON DELETE RESTRICT,
  comment_type text NOT NULL DEFAULT 'COMMENT',
  body text NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  approval_role text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  meaning text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  actor_display_name text NOT NULL,
  actor_role text NOT NULL,
  capability_used text NOT NULL,
  assessment_version integer NOT NULL,
  template_version integer NOT NULL,
  readiness_snapshot jsonb NOT NULL,
  evidence_checksum text,
  comments text,
  status text NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','INVALIDATED')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidation_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_ara_valid_approval_slot
  ON qms_audit_readiness_approvals(assessment_id, approval_role)
  WHERE status = 'VALID' AND decision = 'APPROVED';

CREATE TABLE IF NOT EXISTS qms_audit_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  assessment_version integer NOT NULL,
  template_version integer NOT NULL,
  snapshot jsonb NOT NULL,
  checksum text NOT NULL,
  locked_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  locked_by_display_name text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, assessment_version)
);

CREATE TABLE IF NOT EXISTS qms_audit_readiness_events (
  id bigserial PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES qms_audit_readiness_items(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_display_name text NOT NULL,
  actor_role text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  assessment_version integer NOT NULL,
  template_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qms_ara_assessments_status_idx ON qms_audit_readiness_assessments(status, planned_start_date);
CREATE INDEX IF NOT EXISTS qms_ara_items_assessment_status_idx ON qms_audit_readiness_items(assessment_id, status);
CREATE INDEX IF NOT EXISTS qms_ara_items_owner_idx ON qms_audit_readiness_items(assigned_employee_id, due_date);
CREATE INDEX IF NOT EXISTS qms_ara_evidence_item_idx ON qms_audit_readiness_evidence(item_id) WHERE is_removed = false;
CREATE INDEX IF NOT EXISTS qms_ara_events_assessment_idx ON qms_audit_readiness_events(assessment_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_qms_ara_append_only_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AS9100 audit readiness evidence is append-only'; END $$;
DROP TRIGGER IF EXISTS qms_ara_event_no_delete ON qms_audit_readiness_events;
CREATE TRIGGER qms_ara_event_no_delete BEFORE DELETE ON qms_audit_readiness_events
  FOR EACH ROW EXECUTE FUNCTION prevent_qms_ara_append_only_delete();
DROP TRIGGER IF EXISTS qms_ara_approval_no_delete ON qms_audit_readiness_approvals;
CREATE TRIGGER qms_ara_approval_no_delete BEFORE DELETE ON qms_audit_readiness_approvals
  FOR EACH ROW EXECUTE FUNCTION prevent_qms_ara_append_only_delete();
DROP TRIGGER IF EXISTS qms_ara_snapshot_no_delete ON qms_audit_readiness_snapshots;
CREATE TRIGGER qms_ara_snapshot_no_delete BEFORE DELETE ON qms_audit_readiness_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_qms_ara_append_only_delete();

INSERT INTO perm_capabilities(key, description, category) VALUES
 ('qms.audit_readiness.view','View AS9100 audit-readiness records','qms'),
 ('qms.audit_readiness.create','Create AS9100 audit-readiness assessments','qms'),
 ('qms.audit_readiness.edit','Edit AS9100 audit-readiness assessments','qms'),
 ('qms.audit_readiness.review','Review and verify audit-readiness items','qms'),
 ('qms.audit_readiness.approve','Approve applicability and final readiness','qms'),
 ('qms.audit_readiness.admin','Release templates, reopen, supersede and lock assessments','qms'),
 ('qms.audit_readiness.export','Export controlled audit-readiness reports','qms')
ON CONFLICT(key) DO NOTHING;

INSERT INTO perm_role_capabilities(role_id, capability_id)
SELECT r.id, c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','QUALITY','QUALITY_MANAGER')
  AND c.key LIKE 'qms.audit_readiness.%'
ON CONFLICT(role_id, capability_id) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id, capability_id)
SELECT r.id, c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('MANAGER','PROGRAM_MANAGER','ENGINEERING','ENGINEER')
  AND c.key IN ('qms.audit_readiness.view','qms.audit_readiness.edit','qms.audit_readiness.review','qms.audit_readiness.export')
ON CONFLICT(role_id, capability_id) DO NOTHING;

INSERT INTO qms_audit_readiness_templates(template_key,name,version,lifecycle_status,definition_checksum)
VALUES ('EPOCH_AS9100_AUDIT_READINESS','EPOCH AS9100 Audit Readiness Checklist',1,'DRAFT',
        encode(digest('EPOCH_AS9100_AUDIT_READINESS:1','sha256'),'hex'))
ON CONFLICT(template_key,version) DO NOTHING;

WITH t AS (SELECT id FROM qms_audit_readiness_templates WHERE template_key='EPOCH_AS9100_AUDIT_READINESS' AND version=1),
items(item_key,section_key,section_title,sequence,action_statement,purpose,clause,criticality,owner,design_item) AS (VALUES
('GOV-01','01','QMS Governance and Scope',10,'Confirm controlled QMS scope and process ownership','Demonstrate defined scope and accountable process ownership','4.3, 4.4','CRITICAL','QUALITY_MANAGER',false),
('GOV-02','01','QMS Governance and Scope',20,'Index current policies, procedures and management-review evidence','Provide retrievable governance evidence','7.5, 9.3','HIGH','QUALITY',false),
('VAL-01','02','EPOCH Intended-Use Validation',30,'Approve intended-use and validated-state evidence for EPOCH','Show the system is fit for its controlled intended use','6.1, 7.1.3, 9.1.1','CRITICAL','QUALITY_MANAGER',false),
('VAL-02','02','EPOCH Intended-Use Validation',40,'Verify validation deviations and residual risks are dispositioned','Prevent unresolved validation risk','6.1, 10.2','HIGH','QUALITY',false),
('SWR-01','03','Software Change and Release Control',50,'Verify software changes trace to review, test and controlled release','Demonstrate configuration and change control','6.3, 8.1.2, 8.5.6','CRITICAL','ENGINEERING',false),
('SWR-02','03','Software Change and Release Control',60,'Reconcile production version to the approved release record','Make the deployed version auditable','7.5, 8.6','HIGH','IT',false),
('USR-01','04','Users, Permissions and Electronic Approvals',70,'Review active users, roles, elevated access and segregation of duties','Confirm authorized access and accountable approvals','5.3, 7.5','CRITICAL','IT',false),
('USR-02','04','Users, Permissions and Electronic Approvals',80,'Sample electronic approvals for identity, meaning and timestamp','Demonstrate trustworthy electronic approval evidence','7.5','HIGH','QUALITY',false),
('DAT-01','05','Data Integrity and Record Control',90,'Verify audit-ledger integrity, retention and record retrieval','Protect complete and attributable QMS records','7.5','CRITICAL','QUALITY',false),
('DAT-02','05','Data Integrity and Record Control',100,'Review controlled-document revisions and obsolete-record protection','Ensure only authorized revisions are used','7.5, 8.1.2','HIGH','DOCUMENT_CONTROL',false),
('BKP-01','06','Backup, Recovery and Outage Readiness',110,'Attach current backup status and successful restore-test evidence','Demonstrate recoverability of QMS records','7.1.3, 6.1','CRITICAL','IT',false),
('BKP-02','06','Backup, Recovery and Outage Readiness',120,'Review outage procedure and completed outage drill','Maintain controlled operations during loss of EPOCH','7.1.3, 8.1','HIGH','IT',false),
('REC-01','07','Receiving, Inventory and Material Traceability',130,'Sample receiving, inspection, lot and genealogy records end to end','Demonstrate identification and material traceability','8.4, 8.5.2','CRITICAL','QUALITY',false),
('REC-02','07','Receiving, Inventory and Material Traceability',140,'Verify calibration status for sampled measuring equipment','Ensure monitoring resources are suitable and controlled','7.1.5','HIGH','QUALITY',false),
('PRO-01','08','Production, Routing, Travelers and Inspection',150,'Sample a work order through routing, traveler, inspection and release','Demonstrate controlled production and release','8.5.1, 8.6','CRITICAL','OPERATIONS',false),
('PRO-02','08','Production, Routing, Travelers and Inspection',160,'Verify product-safety and operational-risk controls on sampled work','Show risks and product safety are actively controlled','8.1.1, 8.1.3','HIGH','OPERATIONS',false),
('NCR-01','09','NCR, CAR, Deviations and Changes',170,'Review open and recently closed NCR/CAR records and effectiveness evidence','Demonstrate controlled nonconformity and corrective action','8.7, 10.2','CRITICAL','QUALITY',false),
('NCR-02','09','NCR, CAR, Deviations and Changes',180,'Confirm deviations and concessions have authorized disposition','Prevent unauthorized acceptance or process change','8.5.6, 8.7','HIGH','QUALITY',false),
('DES-01','10','Design Control and Engineering Release',190,'Trace a design project through inputs, reviews, verification and validation','Demonstrate controlled design and development','8.3','CRITICAL','ENGINEERING',true),
('DES-02','10','Design Control and Engineering Release',200,'Verify Engineering Release and package/TDP evidence','Confirm only approved design outputs are released','8.3, 8.6','CRITICAL','ENGINEERING',true),
('TRN-01','11','Training and User Competence',210,'Sample role training, qualifications and certification currency','Demonstrate competence for assigned work','7.2','CRITICAL','HR',false),
('TRN-02','11','Training and User Competence',220,'Resolve expired or missing training affecting audited processes','Prevent unqualified execution','7.2','HIGH','PROCESS_OWNER',false),
('AUD-01','12','Internal Audit and Final Readiness',230,'Close internal-audit findings or document approved containment','Demonstrate effective internal audit and correction','9.2, 10.2','CRITICAL','QUALITY_MANAGER',false),
('AUD-02','12','Internal Audit and Final Readiness',240,'Complete priority-action review, evidence index and final authorization','Present an approved, retrievable readiness record','9.2, 9.3','CRITICAL','TOP_MANAGEMENT',false)
)
INSERT INTO qms_audit_readiness_template_items(template_id,item_key,section_key,section_title,sequence,action_statement,purpose,clause_reference,criticality,default_owner_role,design_scope_item)
SELECT t.id,i.item_key,i.section_key,i.section_title,i.sequence,i.action_statement,i.purpose,i.clause,i.criticality,i.owner,i.design_item FROM t CROSS JOIN items i
ON CONFLICT(template_id,item_key) DO NOTHING;

COMMENT ON TABLE qms_audit_readiness_templates IS 'Controlled checklist templates; canonical v1 is intentionally seeded DRAFT and requires authorized release.';
