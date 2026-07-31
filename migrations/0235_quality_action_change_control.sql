-- Quality Action & Change Control follow-up.
-- Preserves NCR, CAPA/CAR, P2 PCR, ECR, and ECN as authoritative sources.

CREATE SEQUENCE IF NOT EXISTS pcr_number_seq;

ALTER TABLE change_control_records
  ADD COLUMN IF NOT EXISTS authoritative_record_type text,
  ADD COLUMN IF NOT EXISTS authoritative_record_id text,
  ADD COLUMN IF NOT EXISTS severity_risk text,
  ADD COLUMN IF NOT EXISTS product_safety_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_impact_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_decision_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS next_action_code text,
  ADD COLUMN IF NOT EXISTS next_action_statement text,
  ADD COLUMN IF NOT EXISTS next_action_role text,
  ADD COLUMN IF NOT EXISTS next_action_due_date date,
  ADD COLUMN IF NOT EXISTS next_action_classification text,
  ADD COLUMN IF NOT EXISTS next_action_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_action_control_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS change_control_authority_unique
  ON change_control_records(authoritative_record_type, authoritative_record_id)
  WHERE authoritative_record_type IS NOT NULL AND authoritative_record_id IS NOT NULL;

ALTER TABLE change_control_records DROP CONSTRAINT IF EXISTS change_control_type_check;
ALTER TABLE change_control_records ADD CONSTRAINT change_control_type_check CHECK (
  change_type IN (
    'NCR','CAR','PCR','ECR','ECN_ECO','DOCUMENT_CHANGE','PRODUCTION_PROCESS_CHANGE',
    'TEMPORARY_DEVIATION','PERMANENT_DEVIATION_WAIVER','SUPPLIER_CHANGE','OTHER'
  )
);
ALTER TABLE change_control_records DROP CONSTRAINT IF EXISTS change_control_native_spine_check;
ALTER TABLE change_control_records ADD CONSTRAINT change_control_native_spine_check CHECK (
  source = 'IMPORTED_HISTORICAL'
  OR ecr_id IS NOT NULL
  OR ecn_id IS NOT NULL
  OR (authoritative_record_type IS NOT NULL AND authoritative_record_id IS NOT NULL)
);

ALTER TABLE change_control_record_links
  DROP CONSTRAINT IF EXISTS change_control_link_type_check;
ALTER TABLE change_control_record_links
  ADD CONSTRAINT change_control_link_type_check CHECK (link_type IN (
    'NCR','CAR','PCR','ECR','ECN_ECO','INVENTORY_ITEM','PART_NUMBER','DRAWING',
    'SPECIFICATION','CONTROLLED_DOCUMENT','DOCUMENT_REVISION','BOM','BOM_REVISION',
    'ROUTING','ROUTING_REVISION','TRAVELER','WORK_ORDER','WAD','PURCHASE_ORDER',
    'CUSTOMER_ORDER','SUPPLIER','CUSTOMER','CORRECTIVE_ACTION','DESIGN_PROJECT',
    'WORK_INSTRUCTION','INSPECTION_PLAN','CNC_PROGRAM','TRAINING','FAI',
    'PRODUCTION_HOLD','MAINTENANCE','DEVIATION','RELATED_CHANGE'
  ));

CREATE OR REPLACE FUNCTION prevent_change_control_link_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Quality Action relationship evidence is immutable; add a superseding relationship';
END $$;
DROP TRIGGER IF EXISTS change_control_links_no_update ON change_control_record_links;
CREATE TRIGGER change_control_links_no_update BEFORE UPDATE OR DELETE
ON change_control_record_links FOR EACH ROW
EXECUTE FUNCTION prevent_change_control_link_mutation();

CREATE TABLE IF NOT EXISTS change_control_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_control_record_id uuid NOT NULL REFERENCES change_control_records(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_status IN ('DRAFT','SUBMITTED','CONFIRMED','SUPERSEDED')),
  assessor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assessor_snapshot jsonb NOT NULL,
  overall_explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  UNIQUE(change_control_record_id, version)
);

CREATE TABLE IF NOT EXISTS change_control_assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES change_control_assessments(id) ON DELETE RESTRICT,
  question_key text NOT NULL,
  response text NOT NULL CHECK (response IN ('YES','NO','UNKNOWN','NOT_APPLICABLE')),
  explanation text NOT NULL,
  answered_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  answered_by_snapshot jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, question_key),
  CHECK (question_key IN (
    'ACTUAL_NONCONFORMANCE','PRODUCT_CONTAINED','OTHER_PRODUCT_AFFECTED',
    'SIGNIFICANT_SYSTEMIC_CUSTOMER','PRODUCTION_METHOD_CHANGE','DESIGN_PERFORMANCE_IMPACT',
    'DESIGN_OUTPUT_CHANGE','TEMPORARY_OR_PERMANENT','CUSTOMER_REGULATORY_APPROVAL',
    'CONTROLLED_DOCUMENTS_AFFECTED','TRAINING_REQUIRED','VALIDATION_TESTING_FAI_REQUIRED',
    'WIP_INVENTORY_DISPOSITION','EFFECTIVENESS_VERIFICATION'
  ))
);

CREATE TABLE IF NOT EXISTS change_control_assessment_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES change_control_assessments(id) ON DELETE RESTRICT,
  recommendation_code text NOT NULL,
  recommendation text NOT NULL,
  supporting_question_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  control_reference text,
  quality_decision text CHECK (quality_decision IN ('CONFIRMED','OVERRIDDEN')),
  quality_decision_reason text,
  decided_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_snapshot jsonb,
  decided_at timestamptz,
  UNIQUE(assessment_id, recommendation_code),
  CHECK (
    quality_decision IS NULL
    OR quality_decision='CONFIRMED'
    OR length(trim(COALESCE(quality_decision_reason,''))) > 0
  )
);

CREATE OR REPLACE FUNCTION prevent_assessment_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Submitted assessment evidence and Quality decisions are immutable';
END $$;
DROP TRIGGER IF EXISTS assessment_answers_no_update ON change_control_assessment_answers;
CREATE TRIGGER assessment_answers_no_update BEFORE UPDATE OR DELETE
ON change_control_assessment_answers FOR EACH ROW
EXECUTE FUNCTION prevent_assessment_evidence_mutation();
DROP TRIGGER IF EXISTS assessment_recommendations_no_delete ON change_control_assessment_recommendations;
CREATE TRIGGER assessment_recommendations_no_delete BEFORE DELETE
ON change_control_assessment_recommendations FOR EACH ROW
EXECUTE FUNCTION prevent_assessment_evidence_mutation();

ALTER TABLE p2_production_changes
  ADD COLUMN IF NOT EXISTS quality_action_status text NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN IF NOT EXISTS quality_action_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requester_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS requester_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS investigator_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS investigator_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS investigation_due_date date,
  ADD COLUMN IF NOT EXISTS investigation_notes text,
  ADD COLUMN IF NOT EXISTS impact_assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS design_impact boolean,
  ADD COLUMN IF NOT EXISTS safety_regulatory_impact boolean,
  ADD COLUMN IF NOT EXISTS contract_customer_impact boolean,
  ADD COLUMN IF NOT EXISTS cost_impact_amount numeric,
  ADD COLUMN IF NOT EXISTS customer_approval_evidence_id uuid REFERENCES change_control_evidence(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS effectivity_established boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wip_inventory_disposition_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_testing_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fai_determination text CHECK (fai_determination IN ('REQUIRED','PARTIAL','NOT_REQUIRED')),
  ADD COLUMN IF NOT EXISTS fai_evidence_reference text,
  ADD COLUMN IF NOT EXISTS training_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS implementation_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS implementation_authorized_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS implementation_authorization_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS implemented_at timestamptz,
  ADD COLUMN IF NOT EXISTS implemented_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS implementation_evidence text,
  ADD COLUMN IF NOT EXISTS verification_results text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

ALTER TABLE p2_production_changes
  DROP CONSTRAINT IF EXISTS p2_production_changes_quality_action_status_check;
ALTER TABLE p2_production_changes
  ADD CONSTRAINT p2_production_changes_quality_action_status_check CHECK (
    quality_action_status IN (
      'SUBMITTED','QMS_REVIEW','INVESTIGATION_ASSIGNED','UNDER_INVESTIGATION',
      'IMPACT_REVIEW','AWAITING_APPROVAL','APPROVED','IMPLEMENTATION_PENDING',
      'VERIFICATION','CLOSED','MORE_INFORMATION_REQUIRED','DENIED','REDIRECTED',
      'DUPLICATE','CANCELLED','REOPENED'
    )
  );

CREATE TABLE IF NOT EXISTS pcr_functional_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcr_id uuid NOT NULL REFERENCES p2_production_changes(id) ON DELETE RESTRICT,
  record_revision integer NOT NULL,
  approval_function text NOT NULL,
  required_capability_snapshot text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  signature_meaning text NOT NULL,
  record_checksum text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb NOT NULL,
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pcr_id, record_revision, approval_function, actor_user_id)
);

CREATE TABLE IF NOT EXISTS pcr_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcr_id uuid NOT NULL REFERENCES p2_production_changes(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  record_revision integer NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb,
  reason text,
  before_values jsonb,
  after_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pcr_audit_events_record_idx ON pcr_audit_events(pcr_id, occurred_at);

DROP TRIGGER IF EXISTS pcr_approval_immutable ON pcr_functional_approvals;
CREATE TRIGGER pcr_approval_immutable BEFORE UPDATE OR DELETE ON pcr_functional_approvals
FOR EACH ROW EXECUTE FUNCTION prevent_change_control_evidence_mutation();
DROP TRIGGER IF EXISTS pcr_audit_immutable ON pcr_audit_events;
CREATE TRIGGER pcr_audit_immutable BEFORE UPDATE OR DELETE ON pcr_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_change_control_evidence_mutation();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('qms.quality_action.ncr_create','Create native NCR records through the NCR authority','qms'),
 ('qms.quality_action.car_create','Create native CAR/CAPA records through the CAPA authority','qms'),
 ('qms.quality_action.pcr_create','Submit native Process Change Requests','qms'),
 ('qms.quality_action.screen','Perform Quality Action QMS screening','qms'),
 ('qms.quality_action.assign_investigation','Assign Quality Action investigations','qms'),
 ('qms.quality_action.investigate','Perform Quality Action investigations','qms'),
 ('qms.quality_action.assess_impact','Assess Quality Action impact','qms'),
 ('qms.quality_action.approve_quality','Approve PCRs as Quality authority','qms'),
 ('qms.quality_action.approve_production','Approve PCRs as Production authority','qms'),
 ('qms.quality_action.approve_engineering','Approve PCRs as Engineering authority','qms'),
 ('qms.quality_action.approve_program_contracts','Approve PCRs as Program/Contracts authority','qms'),
 ('qms.quality_action.approve_technical_authority','Approve PCRs as safety/regulatory technical authority','qms'),
 ('qms.quality_action.approve_finance','Approve PCRs when configured cost thresholds apply','qms'),
 ('qms.quality_action.production_hold','Control linked production holds','qms'),
 ('qms.quality_action.authorize_implementation','Authorize controlled implementation','qms'),
 ('qms.quality_action.verify_implementation','Verify controlled implementation','qms'),
 ('qms.quality_action.close','Close Quality Action records after verification','qms'),
 ('qms.quality_action.verify_effectiveness','Verify CAR/CAPA effectiveness','qms'),
 ('qms.quality_action.duplicate_admin','Reconcile duplicate imported records','qms'),
 ('qms.quality_action.workflow_admin','Administer Quality Action workflow configuration','qms')
ON CONFLICT(key) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;

INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE (r.name IN ('ADMIN','OWNER') AND c.key LIKE 'qms.quality_action.%')
   OR (r.name IN ('QUALITY','QUALITY_MANAGER') AND c.key IN (
       'qms.quality_action.ncr_create','qms.quality_action.car_create',
       'qms.quality_action.pcr_create','qms.quality_action.screen',
       'qms.quality_action.assign_investigation','qms.quality_action.investigate',
       'qms.quality_action.assess_impact','qms.quality_action.approve_quality',
       'qms.quality_action.production_hold','qms.quality_action.authorize_implementation',
       'qms.quality_action.verify_implementation','qms.quality_action.close',
       'qms.quality_action.verify_effectiveness',
       'qms.quality_action.duplicate_admin','qms.quality_action.workflow_admin'))
   OR (r.name IN ('MANAGER','PRODUCTION_MANAGER') AND c.key IN (
       'qms.quality_action.pcr_create','qms.quality_action.investigate',
       'qms.quality_action.assess_impact','qms.quality_action.approve_production'))
   OR (r.name IN ('ENGINEERING','ENGINEER','ENGINEERING_MANAGER','MANUFACTURING_ENGINEERING')
       AND c.key IN ('qms.quality_action.pcr_create','qms.quality_action.investigate',
                    'qms.quality_action.assess_impact','qms.quality_action.approve_engineering',
                    'qms.quality_action.approve_technical_authority'))
   OR (r.name IN ('PROGRAM_MANAGER','PROJECT_MANAGER','CONTRACTS')
       AND c.key='qms.quality_action.approve_program_contracts')
   OR (r.name IN ('FINANCE','FINANCE_MANAGER','EXECUTIVE')
       AND c.key='qms.quality_action.approve_finance')
ON CONFLICT(role_id,capability_id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_ncr_quality_action_register()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO change_control_records(
    change_number,change_type,title,description,source,status,priority,
    customer_id,authoritative_record_type,authoritative_record_id,severity_risk,
    product_safety_flag,customer_impact_flag,due_date,created_at,updated_at
  ) VALUES (
    COALESCE(NEW.rma_number,'NCR-'||NEW.id::text),'NCR',
    'NCR: '||left(NEW.issue_cause,180),NEW.notes,'EPOCH_NATIVE',
    CASE WHEN lower(COALESCE(NEW.status,'open')) IN ('resolved','closed') THEN 'CLOSED' ELSE 'SUBMITTED' END,
    CASE WHEN NEW.recurrence_detected THEN 'HIGH' ELSE 'NORMAL' END,
    NEW.customer_id,'NCR',NEW.id::text,
    CASE WHEN NEW.recurrence_detected THEN 'HIGH' ELSE NULL END,
    false,NEW.customer_id IS NOT NULL,NEW.containment_due_date,NEW.created_at,NEW.updated_at
  )
  ON CONFLICT(authoritative_record_type,authoritative_record_id) WHERE
    authoritative_record_type IS NOT NULL AND authoritative_record_id IS NOT NULL
  DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,
    severity_risk=EXCLUDED.severity_risk,customer_impact_flag=EXCLUDED.customer_impact_flag,
    due_date=EXCLUDED.due_date,updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_ncr_quality_action_register_trigger ON nonconformance_records;
CREATE TRIGGER sync_ncr_quality_action_register_trigger AFTER INSERT OR UPDATE ON nonconformance_records
FOR EACH ROW EXECUTE FUNCTION sync_ncr_quality_action_register();

CREATE OR REPLACE FUNCTION sync_car_quality_action_register()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO change_control_records(
    change_number,change_type,title,description,source,status,priority,owner_user_id,
    authoritative_record_type,authoritative_record_id,severity_risk,due_date,created_by_user_id,
    created_at,updated_at,closed_at,closed_by_user_id
  ) VALUES (
    NEW.capa_number,'CAR',NEW.title,NEW.problem_statement,'EPOCH_NATIVE',
    CASE WHEN lower(NEW.status)='closed' THEN 'CLOSED' ELSE 'IMPACT_REVIEW' END,
    CASE WHEN NEW.recurrence_detected THEN 'HIGH' ELSE 'NORMAL' END,NEW.owner_user_id,
    'CAR',NEW.id::text,CASE WHEN NEW.recurrence_detected THEN 'HIGH' ELSE NULL END,
    NEW.due_date,NEW.created_by_user_id,NEW.created_at,NEW.updated_at,NEW.closed_at,NEW.closed_by_user_id
  )
  ON CONFLICT(authoritative_record_type,authoritative_record_id) WHERE
    authoritative_record_type IS NOT NULL AND authoritative_record_id IS NOT NULL
  DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,
    owner_user_id=EXCLUDED.owner_user_id,severity_risk=EXCLUDED.severity_risk,
    due_date=EXCLUDED.due_date,updated_at=EXCLUDED.updated_at,closed_at=EXCLUDED.closed_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_car_quality_action_register_trigger ON capa_records;
CREATE TRIGGER sync_car_quality_action_register_trigger AFTER INSERT OR UPDATE ON capa_records
FOR EACH ROW EXECUTE FUNCTION sync_car_quality_action_register();

CREATE OR REPLACE FUNCTION sync_pcr_quality_action_register()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO change_control_records(
    change_number,change_type,title,description,reason_for_change,source,status,priority,
    owner_user_id,department,customer_decision_required,production_blocked,due_date,
    authoritative_record_type,authoritative_record_id,severity_risk,product_safety_flag,
    customer_impact_flag,created_by_user_id,created_at,updated_at
  ) VALUES (
    NEW.change_number,'PCR','PCR: '||left(NEW.proposed_change,180),
    NEW.proposed_change,NEW.reason,'EPOCH_NATIVE',
    CASE NEW.quality_action_status
      WHEN 'SUBMITTED' THEN 'SUBMITTED' WHEN 'QMS_REVIEW' THEN 'IMPACT_REVIEW'
      WHEN 'INVESTIGATION_ASSIGNED' THEN 'IMPACT_REVIEW' WHEN 'UNDER_INVESTIGATION' THEN 'IMPACT_REVIEW'
      WHEN 'IMPACT_REVIEW' THEN 'IMPACT_REVIEW' WHEN 'AWAITING_APPROVAL' THEN 'PENDING_APPROVAL'
      WHEN 'APPROVED' THEN 'APPROVED' WHEN 'IMPLEMENTATION_PENDING' THEN 'IMPLEMENTATION_IN_PROGRESS'
      WHEN 'VERIFICATION' THEN 'PENDING_VERIFICATION' WHEN 'CLOSED' THEN 'CLOSED'
      WHEN 'DENIED' THEN 'REJECTED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'ON_HOLD' END,
    'NORMAL',NEW.investigator_user_id,'Production',NEW.requires_customer_approval,false,
    NEW.investigation_due_date,'PCR',NEW.id::text,
    CASE WHEN NEW.safety_regulatory_impact THEN 'HIGH' ELSE NULL END,
    COALESCE(NEW.safety_regulatory_impact,false),COALESCE(NEW.contract_customer_impact,false),
    NEW.requester_user_id,NEW.created_at,NEW.updated_at
  )
  ON CONFLICT(authoritative_record_type,authoritative_record_id) WHERE
    authoritative_record_type IS NOT NULL AND authoritative_record_id IS NOT NULL
  DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,
    owner_user_id=EXCLUDED.owner_user_id,customer_decision_required=EXCLUDED.customer_decision_required,
    due_date=EXCLUDED.due_date,severity_risk=EXCLUDED.severity_risk,
    product_safety_flag=EXCLUDED.product_safety_flag,customer_impact_flag=EXCLUDED.customer_impact_flag,
    updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_pcr_quality_action_register_trigger ON p2_production_changes;
CREATE TRIGGER sync_pcr_quality_action_register_trigger AFTER INSERT OR UPDATE ON p2_production_changes
FOR EACH ROW EXECUTE FUNCTION sync_pcr_quality_action_register();

INSERT INTO change_control_records(
  change_number,change_type,title,description,source,status,priority,customer_id,
  authoritative_record_type,authoritative_record_id,severity_risk,customer_impact_flag,
  due_date,created_at,updated_at
)
SELECT COALESCE(n.rma_number,'NCR-'||n.id::text),'NCR','NCR: '||left(n.issue_cause,180),
       n.notes,'EPOCH_NATIVE',
       CASE WHEN lower(COALESCE(n.status,'open')) IN ('resolved','closed') THEN 'CLOSED' ELSE 'SUBMITTED' END,
       CASE WHEN n.recurrence_detected THEN 'HIGH' ELSE 'NORMAL' END,n.customer_id,
       'NCR',n.id::text,CASE WHEN n.recurrence_detected THEN 'HIGH' ELSE NULL END,
       n.customer_id IS NOT NULL,n.containment_due_date,n.created_at,n.updated_at
  FROM nonconformance_records n
ON CONFLICT (change_number) DO NOTHING;

INSERT INTO change_control_records(
  change_number,change_type,title,description,source,status,priority,owner_user_id,
  authoritative_record_type,authoritative_record_id,severity_risk,due_date,
  created_by_user_id,created_at,updated_at,closed_at,closed_by_user_id
)
SELECT c.capa_number,'CAR',c.title,c.problem_statement,'EPOCH_NATIVE',
       CASE WHEN lower(c.status)='closed' THEN 'CLOSED' ELSE 'IMPACT_REVIEW' END,
       CASE WHEN c.recurrence_detected THEN 'HIGH' ELSE 'NORMAL' END,c.owner_user_id,
       'CAR',c.id::text,CASE WHEN c.recurrence_detected THEN 'HIGH' ELSE NULL END,
       c.due_date,c.created_by_user_id,c.created_at,c.updated_at,c.closed_at,c.closed_by_user_id
  FROM capa_records c
ON CONFLICT (change_number) DO NOTHING;

INSERT INTO change_control_records(
  change_number,change_type,title,description,reason_for_change,source,status,priority,
  owner_user_id,department,customer_decision_required,due_date,authoritative_record_type,
  authoritative_record_id,severity_risk,product_safety_flag,customer_impact_flag,
  created_by_user_id,created_at,updated_at
)
SELECT p.change_number,'PCR','PCR: '||left(p.proposed_change,180),p.proposed_change,p.reason,
       'EPOCH_NATIVE',
       CASE p.quality_action_status
         WHEN 'SUBMITTED' THEN 'SUBMITTED' WHEN 'AWAITING_APPROVAL' THEN 'PENDING_APPROVAL'
         WHEN 'APPROVED' THEN 'APPROVED' WHEN 'IMPLEMENTATION_PENDING' THEN 'IMPLEMENTATION_IN_PROGRESS'
         WHEN 'VERIFICATION' THEN 'PENDING_VERIFICATION' WHEN 'CLOSED' THEN 'CLOSED'
         WHEN 'DENIED' THEN 'REJECTED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'IMPACT_REVIEW' END,
       'NORMAL',p.investigator_user_id,'Production',p.requires_customer_approval,
       p.investigation_due_date,'PCR',p.id::text,
       CASE WHEN p.safety_regulatory_impact THEN 'HIGH' ELSE NULL END,
       COALESCE(p.safety_regulatory_impact,false),COALESCE(p.contract_customer_impact,false),
       p.requester_user_id,p.created_at,p.updated_at
  FROM p2_production_changes p
ON CONFLICT (change_number) DO NOTHING;

UPDATE change_control_records SET authoritative_record_type='ECR',authoritative_record_id=ecr_id::text
 WHERE ecr_id IS NOT NULL AND authoritative_record_type IS NULL;
UPDATE change_control_records SET authoritative_record_type='ECN_ECO',authoritative_record_id=ecn_id::text
 WHERE ecn_id IS NOT NULL AND authoritative_record_type IS NULL;
