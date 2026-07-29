-- QMS Change Control authoritative register and historical import support.
-- Additive and idempotent: native ECR/ECN workflow tables remain authoritative.

CREATE SEQUENCE IF NOT EXISTS qms_change_control_number_seq;

CREATE TABLE IF NOT EXISTS change_control_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_number text NOT NULL UNIQUE,
  change_type text NOT NULL,
  title text NOT NULL,
  description text,
  reason_for_change text,
  source text NOT NULL,
  original_record_number text,
  original_record_date date,
  original_system_or_source text,
  original_status text,
  requested_by text,
  owner_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  department text,
  customer_id integer REFERENCES customers(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  design_control_project_id text REFERENCES rd_projects(id) ON DELETE RESTRICT,
  ecr_id uuid UNIQUE REFERENCES engineering_change_requests(id) ON DELETE RESTRICT,
  ecn_id uuid UNIQUE REFERENCES engineering_change_orders(id) ON DELETE RESTRICT,
  status text NOT NULL,
  priority text NOT NULL DEFAULT 'NORMAL',
  proposed_effective_date date,
  actual_effective_date date,
  implementation_plan text,
  verification_method text,
  verification_results text,
  risk_assessment text,
  product_safety_impact text,
  regulatory_impact text,
  configuration_impact text,
  customer_approval_required boolean NOT NULL DEFAULT false,
  customer_approval_evidence text,
  implementation_notes text,
  closure_notes text,
  evidence_unavailable_reason text,
  record_revision integer NOT NULL DEFAULT 1,
  created_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  imported_at timestamptz,
  imported_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  closed_by_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT change_control_source_check CHECK (source IN ('IMPORTED_HISTORICAL','EPOCH_NATIVE')),
  CONSTRAINT change_control_type_check CHECK (change_type IN (
    'ECR','ECN_ECO','DOCUMENT_CHANGE','PRODUCTION_PROCESS_CHANGE',
    'TEMPORARY_DEVIATION','PERMANENT_DEVIATION_WAIVER','SUPPLIER_CHANGE','OTHER'
  )),
  CONSTRAINT change_control_status_check CHECK (status IN (
    'DRAFT','SUBMITTED','IMPACT_REVIEW','PENDING_APPROVAL','APPROVED',
    'IMPLEMENTATION_IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','CLOSED',
    'REJECTED','CANCELLED','ON_HOLD','HISTORICAL'
  )),
  CONSTRAINT change_control_native_spine_check CHECK (
    source = 'IMPORTED_HISTORICAL' OR ecr_id IS NOT NULL OR ecn_id IS NOT NULL
  ),
  CONSTRAINT change_control_historical_provenance_check CHECK (
    source <> 'IMPORTED_HISTORICAL'
    OR (original_system_or_source IS NOT NULL AND imported_at IS NOT NULL AND imported_by_user_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS change_control_original_number_unique
  ON change_control_records(lower(original_system_or_source), lower(original_record_number))
  WHERE source='IMPORTED_HISTORICAL' AND original_record_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS change_control_register_filter_idx
  ON change_control_records(source, change_type, status, department, updated_at DESC);

CREATE TABLE IF NOT EXISTS change_control_record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_control_record_id uuid NOT NULL REFERENCES change_control_records(id) ON DELETE RESTRICT,
  link_type text NOT NULL,
  linked_record_id text NOT NULL,
  linked_record_number text,
  linked_revision_id text,
  linked_revision text,
  superseded_revision_id text,
  replacement_revision_id text,
  no_revision_justification text,
  relationship_role text NOT NULL DEFAULT 'AFFECTED',
  description text,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(change_control_record_id, link_type, linked_record_id, relationship_role),
  CONSTRAINT change_control_link_type_check CHECK (link_type IN (
    'INVENTORY_ITEM','PART_NUMBER','DRAWING','SPECIFICATION','CONTROLLED_DOCUMENT',
    'DOCUMENT_REVISION','BOM','BOM_REVISION','ROUTING','ROUTING_REVISION',
    'TRAVELER','WORK_ORDER','WAD','PURCHASE_ORDER','CUSTOMER_ORDER','SUPPLIER',
    'CUSTOMER','NCR','CAR','CORRECTIVE_ACTION','DESIGN_PROJECT','RELATED_CHANGE'
  )),
  CONSTRAINT controlled_document_change_disposition_check CHECK (
    link_type NOT IN ('CONTROLLED_DOCUMENT','DOCUMENT_REVISION')
    OR replacement_revision_id IS NOT NULL
    OR length(trim(COALESCE(no_revision_justification,''))) > 0
  )
);
CREATE INDEX IF NOT EXISTS change_control_links_lookup_idx
  ON change_control_record_links(link_type, linked_record_id);

CREATE OR REPLACE FUNCTION gate_controlled_document_release_by_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_status='RELEASED'
     AND OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
     AND EXISTS (
       SELECT 1
         FROM change_control_record_links l
         JOIN change_control_records r ON r.id=l.change_control_record_id
        WHERE l.replacement_revision_id=NEW.id::text
          AND l.link_type IN ('CONTROLLED_DOCUMENT','DOCUMENT_REVISION')
          AND r.status NOT IN (
            'APPROVED','IMPLEMENTATION_IN_PROGRESS','PENDING_VERIFICATION',
            'VERIFIED','CLOSED','HISTORICAL'
          )
     ) THEN
    RAISE EXCEPTION 'Controlled document revision release requires an approved Change Control record';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS controlled_document_change_release_gate ON document_version_history;
CREATE TRIGGER controlled_document_change_release_gate
BEFORE UPDATE OF lifecycle_status ON document_version_history
FOR EACH ROW EXECUTE FUNCTION gate_controlled_document_release_by_change();

CREATE TABLE IF NOT EXISTS change_control_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_control_record_id uuid NOT NULL REFERENCES change_control_records(id) ON DELETE RESTRICT,
  storage_reference text NOT NULL,
  original_filename text NOT NULL,
  document_type text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256_checksum text NOT NULL,
  evidence_category text NOT NULL,
  source_record_date date,
  description text,
  uploaded_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_snapshot jsonb NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(change_control_record_id, sha256_checksum, evidence_category)
);

CREATE TABLE IF NOT EXISTS change_control_historical_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_control_record_id uuid NOT NULL REFERENCES change_control_records(id) ON DELETE RESTRICT,
  printed_name text NOT NULL,
  role_or_function text,
  decision text,
  approval_date date,
  evidence_id uuid REFERENCES change_control_evidence(id) ON DELETE RESTRICT,
  transcription_note text,
  transcribed_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transcribed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_approval_label_check CHECK (decision IS NULL OR length(trim(decision)) > 0)
);

CREATE TABLE IF NOT EXISTS change_control_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_control_record_id uuid NOT NULL REFERENCES change_control_records(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  record_revision integer NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE RESTRICT,
  actor_snapshot jsonb,
  reason text,
  before_values jsonb,
  after_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS change_control_audit_record_idx
  ON change_control_audit_events(change_control_record_id, occurred_at);

CREATE OR REPLACE FUNCTION prevent_change_control_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Change Control evidence, historical approvals, and audit events are immutable';
END $$;

DROP TRIGGER IF EXISTS change_control_evidence_immutable ON change_control_evidence;
CREATE TRIGGER change_control_evidence_immutable BEFORE UPDATE OR DELETE ON change_control_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_change_control_evidence_mutation();
DROP TRIGGER IF EXISTS change_control_historical_approvals_immutable ON change_control_historical_approvals;
CREATE TRIGGER change_control_historical_approvals_immutable BEFORE UPDATE OR DELETE ON change_control_historical_approvals
FOR EACH ROW EXECUTE FUNCTION prevent_change_control_evidence_mutation();
DROP TRIGGER IF EXISTS change_control_audit_immutable ON change_control_audit_events;
CREATE TRIGGER change_control_audit_immutable BEFORE UPDATE OR DELETE ON change_control_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_change_control_evidence_mutation();

INSERT INTO perm_capabilities(key, description, category)
VALUES
 ('qms.change_control.view','View the QMS Change Control register','qms'),
 ('qms.change_control.create','Create native Change Control drafts','qms'),
 ('qms.change_control.import','Import historical Change Control records','qms'),
 ('qms.change_control.submit','Submit Change Control records','qms'),
 ('qms.change_control.review','Perform Change Control impact review','qms'),
 ('qms.change_control.approve','Approve Change Control records by function','qms'),
 ('qms.change_control.implement','Implement approved Change Control records','qms'),
 ('qms.change_control.verify','Verify Change Control implementation','qms'),
 ('qms.change_control.close','Close verified Change Control records','qms'),
 ('qms.change_control.reopen','Reopen closed Change Control records','qms'),
 ('qms.change_control.admin','Administer Change Control numbering and import mappings','qms')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category;

INSERT INTO perm_role_capabilities(role_id, capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','QUALITY','QUALITY_MANAGER')
  AND c.key LIKE 'qms.change_control.%'
ON CONFLICT(role_id,capability_id) DO NOTHING;

INSERT INTO perm_role_capabilities(role_id, capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('MANAGER','PROGRAM_MANAGER','ENGINEERING','ENGINEER')
  AND c.key IN (
    'qms.change_control.view','qms.change_control.create',
    'qms.change_control.submit','qms.change_control.review',
    'qms.change_control.implement','qms.change_control.verify'
  )
ON CONFLICT(role_id,capability_id) DO NOTHING;

INSERT INTO change_control_records (
  change_number,change_type,title,description,reason_for_change,source,
  requested_by,owner_user_id,design_control_project_id,ecr_id,status,priority,
  created_by_user_id,created_at,updated_at
)
SELECT q.ecr_number,'ECR',q.title,q.content->>'problemOpportunityStatement',
       q.content->>'reasonBusinessJustification','EPOCH_NATIVE',
       q.created_by_snapshot->>'displayName',q.current_owner_user_id,q.rd_project_id,q.id,
       CASE q.lifecycle_status
         WHEN 'IMPACT_REVIEW' THEN 'IMPACT_REVIEW'
         WHEN 'APPROVED' THEN 'APPROVED'
         WHEN 'REJECTED' THEN 'REJECTED'
         WHEN 'CANCELLED' THEN 'CANCELLED'
         WHEN 'VOID' THEN 'CANCELLED'
         WHEN 'RETURNED_FOR_REVISION' THEN 'ON_HOLD'
         ELSE q.lifecycle_status
       END,
       q.priority,q.created_by_user_id,q.created_at,q.updated_at
  FROM engineering_change_requests q
ON CONFLICT (change_number) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_ecr_change_control_register()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO change_control_records (
    change_number,change_type,title,description,reason_for_change,source,
    requested_by,owner_user_id,design_control_project_id,ecr_id,status,priority,
    created_by_user_id,created_at,updated_at
  ) VALUES (
    NEW.ecr_number,'ECR',NEW.title,NEW.content->>'problemOpportunityStatement',
    NEW.content->>'reasonBusinessJustification','EPOCH_NATIVE',
    NEW.created_by_snapshot->>'displayName',NEW.current_owner_user_id,NEW.rd_project_id,NEW.id,
    CASE NEW.lifecycle_status
      WHEN 'IMPACT_REVIEW' THEN 'IMPACT_REVIEW'
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'REJECTED' THEN 'REJECTED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      WHEN 'VOID' THEN 'CANCELLED'
      WHEN 'RETURNED_FOR_REVISION' THEN 'ON_HOLD'
      ELSE NEW.lifecycle_status
    END,
    NEW.priority,NEW.created_by_user_id,NEW.created_at,NEW.updated_at
  )
  ON CONFLICT (change_number) DO UPDATE SET
    title=EXCLUDED.title,description=EXCLUDED.description,
    reason_for_change=EXCLUDED.reason_for_change,owner_user_id=EXCLUDED.owner_user_id,
    status=EXCLUDED.status,priority=EXCLUDED.priority,updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_ecr_change_control_register_trigger ON engineering_change_requests;
CREATE TRIGGER sync_ecr_change_control_register_trigger
AFTER INSERT OR UPDATE ON engineering_change_requests
FOR EACH ROW EXECUTE FUNCTION sync_ecr_change_control_register();

CREATE OR REPLACE FUNCTION sync_ecn_change_control_register()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ecn_number IS NULL THEN RETURN NEW; END IF;
  INSERT INTO change_control_records (
    change_number,change_type,title,description,reason_for_change,source,
    requested_by,design_control_project_id,ecn_id,status,priority,
    created_by_user_id,created_at,updated_at,closed_at
  ) VALUES (
    NEW.ecn_number,'ECN_ECO',NEW.title,NEW.change_description,NEW.reason,'EPOCH_NATIVE',
    NEW.requested_by,NEW.rd_project_id,NEW.id,
    CASE NEW.status::text
      WHEN 'draft' THEN 'DRAFT'
      WHEN 'submitted' THEN 'SUBMITTED'
      WHEN 'approved' THEN 'APPROVED'
      WHEN 'in_implementation' THEN 'IMPLEMENTATION_IN_PROGRESS'
      WHEN 'verification_validation' THEN 'PENDING_VERIFICATION'
      WHEN 'implemented' THEN 'VERIFIED'
      WHEN 'closed' THEN 'CLOSED'
      WHEN 'rejected' THEN 'REJECTED'
      WHEN 'cancelled' THEN 'CANCELLED'
      ELSE 'ON_HOLD'
    END,
    COALESCE(NEW.priority,'NORMAL'),NEW.created_by_user_id,NEW.created_at,NEW.updated_at,NEW.closed_at
  )
  ON CONFLICT (change_number) DO UPDATE SET
    title=EXCLUDED.title,description=EXCLUDED.description,
    reason_for_change=EXCLUDED.reason_for_change,status=EXCLUDED.status,
    priority=EXCLUDED.priority,updated_at=EXCLUDED.updated_at,closed_at=EXCLUDED.closed_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_ecn_change_control_register_trigger ON engineering_change_orders;
CREATE TRIGGER sync_ecn_change_control_register_trigger
AFTER INSERT OR UPDATE ON engineering_change_orders
FOR EACH ROW EXECUTE FUNCTION sync_ecn_change_control_register();

INSERT INTO change_control_records (
  change_number,change_type,title,description,reason_for_change,source,
  owner_user_id,design_control_project_id,ecn_id,status,priority,
  created_by_user_id,created_at,updated_at
)
SELECT e.ecn_number,'ECN_ECO',e.title,e.change_description,e.reason,'EPOCH_NATIVE',
       NULL,e.rd_project_id,e.id,
       CASE e.status::text
         WHEN 'draft' THEN 'DRAFT'
         WHEN 'submitted' THEN 'SUBMITTED'
         WHEN 'approved' THEN 'APPROVED'
         WHEN 'in_implementation' THEN 'IMPLEMENTATION_IN_PROGRESS'
         WHEN 'verification_validation' THEN 'PENDING_VERIFICATION'
         WHEN 'implemented' THEN 'VERIFIED'
         WHEN 'closed' THEN 'CLOSED'
         WHEN 'rejected' THEN 'REJECTED'
         WHEN 'cancelled' THEN 'CANCELLED'
         ELSE 'ON_HOLD'
       END,
       COALESCE(e.priority,'NORMAL'),e.created_by_user_id,e.created_at,e.updated_at
  FROM engineering_change_orders e
 WHERE e.ecn_number IS NOT NULL
ON CONFLICT (change_number) DO NOTHING;
