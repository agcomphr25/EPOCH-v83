-- Migration 0229: persistent EPOCH intended-use software-validation packages.
-- Additive and idempotent; no existing QMS or production records are modified.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_package_number_seq;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_requirement_number_seq;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_risk_number_seq;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_test_number_seq;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_execution_number_seq;
CREATE SEQUENCE IF NOT EXISTS qms_epoch_validation_defect_number_seq;

CREATE TABLE IF NOT EXISTS qms_epoch_validation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number text NOT NULL UNIQUE,
  title text NOT NULL,
  system_name text NOT NULL DEFAULT 'EPOCH',
  validation_type text NOT NULL CHECK (validation_type IN
    ('INITIAL_INTENDED_USE','MAJOR_RELEASE','CRITICAL_CHANGE','DATABASE_MIGRATION',
     'SECURITY_ACCESS_CONTROL','BACKUP_RECOVERY','PERIODIC_REVIEW','PRE_AUDIT_REVALIDATION','CORRECTIVE_REVALIDATION')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','PLANNING','READY_FOR_APPROVAL','PLAN_APPROVED','TESTING','TESTING_BLOCKED',
     'CORRECTIONS_REQUIRED','RETESTING','READY_FOR_FINAL_REVIEW','APPROVED_FOR_INTENDED_USE',
     'APPROVED_WITH_LIMITATIONS','REJECTED','SUPERSEDED','CANCELLED')),
  production_version text NOT NULL,
  commit_or_release_identifier text,
  production_deployment_date date,
  validation_environment text NOT NULL,
  production_environment_reference text NOT NULL,
  database_provider text NOT NULL,
  hosting_provider text NOT NULL,
  software_owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  quality_owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  validation_lead_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  planned_start_date date NOT NULL,
  planned_completion_date date NOT NULL,
  actual_completion_date date,
  reason_for_validation text NOT NULL,
  previous_approved_package_id uuid REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  superseded_package_id uuid REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  audit_readiness_assessment_id uuid REFERENCES qms_audit_readiness_assessments(id) ON DELETE RESTRICT,
  notes text,
  revision integer NOT NULL DEFAULT 1,
  row_version integer NOT NULL DEFAULT 1,
  locked_at timestamptz,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_display_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_intended_use_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  system_name text NOT NULL,
  epoch_version text NOT NULL,
  production_environment text NOT NULL,
  software_owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  quality_owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  hosting_provider text NOT NULL,
  database_provider text NOT NULL,
  intended_use_statement text NOT NULL,
  qms_processes_supported text NOT NULL,
  official_records_controlled text NOT NULL,
  outside_processes_records text,
  user_groups_departments text NOT NULL,
  interfaces_dependencies text,
  customer_contractual_requirements text,
  compliance_considerations text,
  known_limitations text,
  excluded_functionality text,
  data_retention_responsibilities text NOT NULL,
  backup_responsibilities text NOT NULL,
  approval_status text NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT','READY_FOR_APPROVAL','APPROVED','REJECTED','SUPERSEDED')),
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, revision)
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  module text NOT NULL,
  category text NOT NULL,
  statement text NOT NULL,
  purpose text NOT NULL,
  source text NOT NULL,
  criticality text NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','NORMAL','INFORMATIONAL')),
  product_quality_record_impact text, traceability_impact text, security_access_impact text,
  data_integrity_impact text, regulatory_customer_impact text,
  validation_method text NOT NULL,
  test_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY_FOR_APPROVAL','APPROVED','REJECTED','SUPERSEDED')),
  owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1,
  supersedes_requirement_id uuid REFERENCES qms_epoch_validation_requirements(id) ON DELETE RESTRICT,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  requirement_id uuid REFERENCES qms_epoch_validation_requirements(id) ON DELETE RESTRICT,
  module text NOT NULL, failure_mode text NOT NULL, cause text NOT NULL, potential_effect text NOT NULL,
  quality_traceability_impact text NOT NULL,
  severity integer NOT NULL CHECK (severity BETWEEN 1 AND 5),
  likelihood integer NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  detectability integer NOT NULL CHECK (detectability BETWEEN 1 AND 5),
  initial_risk_rating integer GENERATED ALWAYS AS (severity * likelihood * detectability) STORED,
  existing_controls text, additional_mitigation text,
  mitigation_owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  due_date date, residual_risk text,
  residual_risk_level text NOT NULL DEFAULT 'NORMAL' CHECK (residual_risk_level IN ('CRITICAL','HIGH','NORMAL','LOW')),
  risk_accepted boolean NOT NULL DEFAULT false,
  required_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  revision integer NOT NULL, purpose text NOT NULL, scope text NOT NULL, epoch_version text NOT NULL,
  commit_or_release_identifier text, included_modules text NOT NULL, excluded_modules text,
  validation_environment text NOT NULL, test_database_environment text NOT NULL,
  production_comparison_method text NOT NULL, responsibilities text NOT NULL, required_resources text,
  testing_approach text NOT NULL, risk_based_selection text NOT NULL, evidence_requirements text NOT NULL,
  acceptance_criteria text NOT NULL, defect_severity_rules text NOT NULL, retesting_requirements text NOT NULL,
  regression_requirements text NOT NULL, backup_restore_requirements text NOT NULL,
  outage_drill_requirements text NOT NULL, approval_roles text NOT NULL, schedule text NOT NULL,
  deviations text, status text NOT NULL DEFAULT 'DRAFT',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(package_id,revision)
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  title text NOT NULL, module text NOT NULL,
  criticality text NOT NULL CHECK (criticality IN ('CRITICAL','HIGH','NORMAL','INFORMATIONAL')),
  objective text NOT NULL, preconditions text, required_user_role text, required_test_data text,
  test_environment text NOT NULL, overall_acceptance_criteria text NOT NULL, required_evidence text NOT NULL,
  regression_classification text, independent_review_required boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'DRAFT',
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_protocol_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES qms_epoch_validation_protocols(id) ON DELETE RESTRICT,
  step_number integer NOT NULL, instruction text NOT NULL, expected_result text NOT NULL,
  required boolean NOT NULL DEFAULT true, UNIQUE(protocol_id,step_number)
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_protocol_requirements (
  protocol_id uuid NOT NULL REFERENCES qms_epoch_validation_protocols(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES qms_epoch_validation_requirements(id) ON DELETE RESTRICT,
  PRIMARY KEY(protocol_id,requirement_id)
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_protocol_risks (
  protocol_id uuid NOT NULL REFERENCES qms_epoch_validation_protocols(id) ON DELETE RESTRICT,
  risk_id uuid NOT NULL REFERENCES qms_epoch_validation_risks(id) ON DELETE RESTRICT,
  PRIMARY KEY(protocol_id,risk_id)
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  protocol_id uuid NOT NULL REFERENCES qms_epoch_validation_protocols(id) ON DELETE RESTRICT,
  protocol_revision integer NOT NULL, epoch_version text NOT NULL, commit_or_release_identifier text,
  test_environment text NOT NULL, test_database text NOT NULL,
  tester_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tester_display_name text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  overall_result text NOT NULL DEFAULT 'NOT_RUN' CHECK (overall_result IN
    ('NOT_RUN','IN_PROGRESS','PASSED','FAILED','BLOCKED','PASSED_WITH_APPROVED_DEVIATION','INVALIDATED','SUPERSEDED')),
  linked_epoch_records text, github_reference text, deviations text, comments text,
  reviewer_user_id integer REFERENCES users(id) ON DELETE RESTRICT, review_decision text, reviewed_at timestamptz,
  retest_of_execution_id uuid REFERENCES qms_epoch_validation_executions(id) ON DELETE RESTRICT,
  snapshot jsonb, snapshot_checksum text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES qms_epoch_validation_executions(id) ON DELETE RESTRICT,
  protocol_step_id uuid NOT NULL REFERENCES qms_epoch_validation_protocol_steps(id) ON DELETE RESTRICT,
  step_number integer NOT NULL, instruction_snapshot text NOT NULL, expected_result_snapshot text NOT NULL,
  actual_result text, status text NOT NULL DEFAULT 'NOT_RUN' CHECK (status IN ('NOT_RUN','IN_PROGRESS','PASSED','FAILED','BLOCKED')),
  required boolean NOT NULL DEFAULT true, UNIQUE(execution_id,step_number)
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  execution_id uuid REFERENCES qms_epoch_validation_executions(id) ON DELETE RESTRICT,
  risk_id uuid REFERENCES qms_epoch_validation_risks(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL, attachment_id uuid, source_module text, source_record_id text,
  record_number text, title text NOT NULL, revision text, open_route text, checksum text, notes text,
  added_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_number text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  failed_execution_id uuid REFERENCES qms_epoch_validation_executions(id) ON DELETE RESTRICT,
  module text NOT NULL, description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  quality_record_impact text, traceability_impact text, existing_production_impact text,
  containment text, root_cause text, corrective_action text,
  owner_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT, due_date date,
  github_reference text, database_migration_reference text,
  retest_required boolean NOT NULL DEFAULT false,
  retest_execution_id uuid REFERENCES qms_epoch_validation_executions(id) ON DELETE RESTRICT,
  closure_evidence text, status text NOT NULL DEFAULT 'OPEN',
  limitation_accepted boolean NOT NULL DEFAULT false,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  record_type text NOT NULL, record_id uuid NOT NULL, record_revision integer NOT NULL,
  approval_role text NOT NULL, decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED','RISK_ACCEPTED','LIMITATION_ACCEPTED')),
  meaning text NOT NULL, actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_employee_id integer REFERENCES employees(id) ON DELETE RESTRICT,
  actor_display_name text NOT NULL, actor_role text NOT NULL, capability_used text NOT NULL,
  comments text, snapshot_checksum text NOT NULL,
  status text NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','INVALIDATED')),
  decided_at timestamptz NOT NULL DEFAULT now(), invalidated_at timestamptz, invalidation_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_epoch_validation_valid_approval_slot
  ON qms_epoch_validation_approvals(record_type,record_id,record_revision,approval_role)
  WHERE status='VALID' AND decision='APPROVED';

CREATE TABLE IF NOT EXISTS qms_epoch_validation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  snapshot_type text NOT NULL, package_revision integer NOT NULL, snapshot jsonb NOT NULL,
  checksum text NOT NULL, created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(package_id,snapshot_type,package_revision)
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_periodic_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  review_date date NOT NULL, reviewer_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  current_production_version text NOT NULL, previously_approved_version text NOT NULL,
  changes_since_approval text, critical_changes text, database_migrations text,
  security_authentication_changes text, hosting_database_changes text, backup_recovery_changes text,
  serious_defects_incidents text, new_official_qms_modules text, audit_findings text, customer_findings text,
  revalidation_required boolean NOT NULL, revalidation_scope text, next_review_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_events (
  id bigserial PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES qms_epoch_validation_packages(id) ON DELETE RESTRICT,
  entity_type text NOT NULL, entity_id text, action text NOT NULL,
  actor_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_display_name text NOT NULL, actor_role text NOT NULL,
  previous_value jsonb, new_value jsonb, reason text,
  package_revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_epoch_validation_requirement_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_key text NOT NULL UNIQUE, module text NOT NULL, category text NOT NULL,
  suggested_statement text NOT NULL, criticality text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','RELEASED','OBSOLETE')),
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS qms_epoch_validation_protocol_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE, title text NOT NULL, module text NOT NULL,
  criticality text NOT NULL, objective text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','RELEASED','OBSOLETE')),
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qms_esv_package_status_idx ON qms_epoch_validation_packages(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS qms_esv_requirement_package_idx ON qms_epoch_validation_requirements(package_id,criticality,status);
CREATE INDEX IF NOT EXISTS qms_esv_risk_package_idx ON qms_epoch_validation_risks(package_id,status);
CREATE INDEX IF NOT EXISTS qms_esv_protocol_package_idx ON qms_epoch_validation_protocols(package_id,criticality,status);
CREATE INDEX IF NOT EXISTS qms_esv_execution_package_idx ON qms_epoch_validation_executions(package_id,overall_result);
CREATE INDEX IF NOT EXISTS qms_esv_defect_package_idx ON qms_epoch_validation_defects(package_id,severity,status);
CREATE INDEX IF NOT EXISTS qms_esv_event_package_idx ON qms_epoch_validation_events(package_id,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_qms_esv_append_only_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EPOCH software validation approvals, snapshots, and events are append-only'; END $$;
DROP TRIGGER IF EXISTS qms_esv_approval_no_delete ON qms_epoch_validation_approvals;
CREATE TRIGGER qms_esv_approval_no_delete BEFORE DELETE ON qms_epoch_validation_approvals FOR EACH ROW EXECUTE FUNCTION prevent_qms_esv_append_only_delete();
DROP TRIGGER IF EXISTS qms_esv_snapshot_no_delete ON qms_epoch_validation_snapshots;
CREATE TRIGGER qms_esv_snapshot_no_delete BEFORE DELETE ON qms_epoch_validation_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_qms_esv_append_only_delete();
DROP TRIGGER IF EXISTS qms_esv_event_no_delete ON qms_epoch_validation_events;
CREATE TRIGGER qms_esv_event_no_delete BEFORE DELETE ON qms_epoch_validation_events FOR EACH ROW EXECUTE FUNCTION prevent_qms_esv_append_only_delete();

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('EPOCH_VALIDATION_VIEW','View EPOCH software-validation records','qms'),
 ('EPOCH_VALIDATION_CREATE','Create EPOCH software-validation packages','qms'),
 ('EPOCH_VALIDATION_EDIT','Edit unlocked EPOCH software-validation records','qms'),
 ('EPOCH_VALIDATION_PLAN_APPROVE','Approve validation plans and baselines','qms'),
 ('EPOCH_VALIDATION_TEST_EXECUTE','Execute approved validation protocols','qms'),
 ('EPOCH_VALIDATION_TEST_REVIEW','Independently review test executions','qms'),
 ('EPOCH_VALIDATION_DEFECT_MANAGE','Manage software-validation defects','qms'),
 ('EPOCH_VALIDATION_FINAL_APPROVE','Approve EPOCH for its documented intended use','qms'),
 ('EPOCH_VALIDATION_REOPEN','Reopen a controlled validation package','qms'),
 ('EPOCH_VALIDATION_EXPORT','Export software-validation records','qms'),
 ('EPOCH_VALIDATION_ADMIN','Administer EPOCH software validation','qms')
ON CONFLICT(key) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','QUALITY','QUALITY_MANAGER')
AND c.key LIKE 'EPOCH_VALIDATION_%' ON CONFLICT(role_id,capability_id) DO NOTHING;
INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('MANAGER','PROGRAM_MANAGER','ENGINEERING','ENGINEER')
AND c.key IN ('EPOCH_VALIDATION_VIEW','EPOCH_VALIDATION_CREATE','EPOCH_VALIDATION_EDIT',
  'EPOCH_VALIDATION_TEST_EXECUTE','EPOCH_VALIDATION_EXPORT')
ON CONFLICT(role_id,capability_id) DO NOTHING;

INSERT INTO qms_epoch_validation_requirement_library
  (library_key,module,category,suggested_statement,criticality,lifecycle_status) VALUES
 ('AUTH-UNIQUE','Authentication','Authentication','EPOCH requires unique authenticated users.','CRITICAL','DRAFT'),
 ('AUTHZ-SERVER','Platform','Authorization/permissions','Server endpoints enforce role/capability authorization.','CRITICAL','DRAFT'),
 ('APPROVAL-IDENTITY','Platform','Electronic approvals','Electronic approvals identify the authenticated approver, role, date/time and approved record revision.','CRITICAL','DRAFT'),
 ('APPROVAL-STALE','Platform','Electronic approvals','Changes after approval invalidate or supersede affected approvals.','CRITICAL','DRAFT'),
 ('RECORD-IMMUTABLE','QMS','Data integrity','Released quality records cannot be silently overwritten.','CRITICAL','DRAFT'),
 ('RECORD-CORRECTION','QMS','Audit trail','Record corrections preserve an audit history.','CRITICAL','DRAFT'),
 ('MATERIAL-BLOCK','Inventory','Inventory','Rejected, quarantined, expired or blocked material cannot be issued to production.','CRITICAL','DRAFT'),
 ('LOT-SPLIT','Inventory','Material genealogy','Material lot splitting preserves parent-child genealogy.','CRITICAL','DRAFT'),
 ('TRACE-BACK','Traceability','Material genealogy','A finished product can be traced backward to consumed materials and components.','CRITICAL','DRAFT'),
 ('TRACE-FORWARD','Traceability','Material genealogy','A material lot can be traced forward to affected work orders and finished products.','CRITICAL','DRAFT'),
 ('WO-REVISION','Production','Work orders','Work orders use the correct part and revision.','CRITICAL','DRAFT'),
 ('ROUTING-SEQUENCE','Production','Routing','Routing controls the required manufacturing sequence.','CRITICAL','DRAFT'),
 ('CURRENT-INSTRUCTIONS','Document Control','Document control','Technicians receive current released instructions.','CRITICAL','DRAFT'),
 ('INSPECTION-GATE','Quality','Final release','Required inspections and final release cannot be bypassed.','CRITICAL','DRAFT'),
 ('TRAINING-GATE','Training','Training and qualification','Unqualified employees are blocked from restricted operations where configured.','HIGH','DRAFT'),
 ('NCR-AUTH','Quality','NCR/CAR','NCR dispositions are authorized and traceable.','CRITICAL','DRAFT'),
 ('DC-FAIL-CLOSED','Design Control','Design Control','Design Control release gates fail closed when required evidence is incomplete.','CRITICAL','DRAFT'),
 ('ER-BASELINE','Engineering Release','Engineering Release','Engineering Release preserves an immutable approved baseline.','CRITICAL','DRAFT'),
 ('BACKUP-RESTORE','Infrastructure','Backup','Backups are available and representative records can be restored.','CRITICAL','DRAFT'),
 ('OUTAGE','Infrastructure','Outage continuity','EPOCH has a controlled outage process.','CRITICAL','DRAFT')
ON CONFLICT(library_key) DO NOTHING;

INSERT INTO qms_epoch_validation_protocol_templates
  (template_key,title,module,criticality,objective,lifecycle_status) VALUES
 ('AUTHENTICATION','Authentication','Platform','CRITICAL','Verify unique authenticated access and rejection of invalid credentials.','DRAFT'),
 ('ROLE-PERMISSIONS','Role permissions','Platform','CRITICAL','Verify allowed actions and server denial of unauthorized actions.','DRAFT'),
 ('UNAUTHORIZED-APPROVAL','Unauthorized approval prevention','Platform','CRITICAL','Verify approval endpoints fail closed for unauthorized identities.','DRAFT'),
 ('AUDIT-CORRECTION','Record correction and audit history','QMS','CRITICAL','Verify correction preserves attributable history.','DRAFT'),
 ('RECEIVING-LOT','Receiving and lot creation','Receiving','HIGH','Verify controlled receipt and lot identity.','DRAFT'),
 ('REJECTED-BLOCK','Rejected-material blocking','Inventory','CRITICAL','Verify blocked material cannot be issued.','DRAFT'),
 ('LOT-GENEALOGY','Lot split and genealogy','Inventory','CRITICAL','Verify parent-child genealogy after split.','DRAFT'),
 ('TRACE-BACK','Finished-product backward trace','Traceability','CRITICAL','Verify complete backward product genealogy.','DRAFT'),
 ('TRACE-FORWARD','Material-lot forward trace','Traceability','CRITICAL','Verify complete forward lot genealogy.','DRAFT'),
 ('WO-REVISION','Work-order revision','Production','CRITICAL','Verify correct part and released revision.','DRAFT'),
 ('ROUTING','Routing and department sequence','Production','CRITICAL','Verify required manufacturing sequence.','DRAFT'),
 ('TRAVELER','Traveler completion','Production','CRITICAL','Verify traveler completion controls and evidence.','DRAFT'),
 ('TRAINING','Employee training restriction','Training','HIGH','Verify configured qualification restrictions.','DRAFT'),
 ('FINAL-RELEASE','Inspection and final release','Quality','CRITICAL','Verify required inspection and release gates.','DRAFT'),
 ('NCR','NCR creation and disposition','Quality','CRITICAL','Verify attributable NCR lifecycle and disposition.','DRAFT'),
 ('DOC-SUPERSESSION','Document supersession','Document Control','CRITICAL','Verify obsolete instructions cannot be silently used.','DRAFT'),
 ('DC-RELEASE','Design Control release gate','Design Control','CRITICAL','Verify incomplete evidence fails closed.','DRAFT'),
 ('ER-BASELINE','Engineering Release baseline','Engineering Release','CRITICAL','Verify immutable approved baseline.','DRAFT'),
 ('BACKUP','Backup verification','Infrastructure','CRITICAL','Verify current backup evidence.','DRAFT'),
 ('RESTORE','Restore test','Infrastructure','CRITICAL','Restore representative records and verify integrity.','DRAFT'),
 ('OUTAGE','Outage and recovery drill','Infrastructure','CRITICAL','Verify controlled outage continuity and recovery.','DRAFT')
ON CONFLICT(template_key) DO NOTHING;

COMMENT ON TABLE qms_epoch_validation_packages IS 'Authoritative EPOCH software intended-use validation packages; never a substitute for the AS9100 readiness assessment.';
