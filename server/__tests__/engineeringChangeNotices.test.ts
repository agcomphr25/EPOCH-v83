import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0215_engineering_change_notices.sql');
const service = read('server/src/services/engineeringChangeNoticeService.ts');
const routes = read('server/src/routes/engineeringChangeNotices.ts');
const legacyRoutes = read('server/src/routes/engineeringControl.ts');
const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
const capabilities = read('server/src/capabilities.ts');
const catalog = read('shared/designControlFormCatalog.ts');
const ui = read(
  'client/src/components/design-control/EngineeringChangeNoticeWorkspace.tsx'
);
const rd = read('client/src/pages/RDProjectsPage.tsx');
const qms = read('client/src/pages/QMSDesignControlPage.tsx');

describe('Phase 7 authoritative Engineering Change Notices', () => {
  it('uses additive idempotent migration 0215 without destructive legacy changes', () => {
    expect(migration).toContain('ALTER TABLE engineering_change_orders');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS ecn_number');
    expect(migration).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b|RENAME TO/);
  });

  it('registers migration 0215 in safe and critical boot lists', () => {
    expect(runner.match(/0215_engineering_change_notices\.sql/g)).toHaveLength(
      2
    );
  });

  it('retains the physical ECO table and adds authoritative ECN identity', () => {
    expect(migration).toContain('engineering_change_orders');
    expect(migration).toContain('ecn_number text');
    expect(migration).toContain('legacy_provenance');
    expect(migration).not.toContain('DROP TABLE engineering_change_orders');
  });

  it('preserves legacy revision links and controlled revisions', () => {
    expect(migration).not.toMatch(
      /DROP TABLE engineering_eco_revision_links|DROP TABLE engineering_controlled_revisions/
    );
    expect(migration).toContain('resulting_controlled_revision_id uuid');
  });

  it('keeps legacy ECO routes mounted and ignores body actor overrides', () => {
    expect(legacyRoutes).toContain("router.get('/ecos'");
    expect(legacyRoutes).toContain('_legacyOverrideIgnored');
    expect(legacyRoutes).not.toContain('if (override) return override');
  });

  it('generates concurrency-safe permanent ECN numbers on the server', () => {
    expect(migration).toContain(
      'CREATE SEQUENCE IF NOT EXISTS engineering_change_notice_number_seq'
    );
    expect(service).toContain(
      "nextval('engineering_change_notice_number_seq')"
    );
    expect(service).toContain('ECN-${new Date().getUTCFullYear()}-');
    expect(routes).not.toMatch(/req\.body\.ecnNumber/);
  });

  it('requires one exact approved ECR revision and checksum', () => {
    expect(service).toContain("e.lifecycle_status='APPROVED'");
    expect(service).toContain('ECN_APPROVED_ECR_REQUIRED');
    expect(migration).toContain('source_ecr_revision_id');
    expect(migration).toContain('source_ecr_checksum');
  });

  it('enforces ECR, project, Design Control, release, and baseline consistency', () => {
    expect(service).toContain('ECN_ECR_AUTHORITY_MISMATCH');
    expect(service).toContain('ECN_SOURCE_BASELINE_MISMATCH');
    expect(service).toContain('ecr.rd_project_id !== ecn.rd_project_id');
    expect(service).toContain(
      'ecr.design_control_record_id !== ecn.design_control_record_id'
    );
  });

  it('prevents ambiguous split-ECN affected-item scope', () => {
    expect(service).toContain('ECN_SPLIT_SCOPE_DUPLICATE');
    expect(service).toContain('source_ecr_affected_item_id=ANY');
    expect(service).toContain('A documented implementation scope is required');
  });

  it('supports the complete controlled lifecycle without Phase 8 release creation', () => {
    for (const status of [
      'implementation_planned',
      'submitted',
      'approved',
      'in_implementation',
      'verification_validation',
      'release_ready',
      'implemented',
      'closed',
      'returned_for_revision',
      'rejected',
      'cancelled',
      'void',
    ])
      expect(service + migration).toContain(status);
    expect(service).toContain('ECN_PHASE8_RELEASE_REQUIRED');
  });

  it('creates immutable version/checksum-bound submissions', () => {
    expect(migration).toContain('engineering_change_notice_revisions');
    expect(service).toContain('const digest = sha256(canonical)');
    expect(migration).toContain('ecn_revision_immutable');
  });

  it('invalidates current approvals on material resubmission without deleting them', () => {
    expect(service).toContain("status='INVALIDATED'");
    expect(service).toContain('ECN_APPROVALS_INVALIDATED');
    expect(service).not.toMatch(
      /DELETE FROM engineering_change_notice_approvals/
    );
  });

  it('tracks affected configuration revisions without overwriting source data', () => {
    for (const field of [
      'stable_source_reference',
      'current_revision_snapshot',
      'proposed_revision',
      'resulting_controlled_revision_id',
    ])
      expect(migration).toContain(field);
    expect(service).not.toMatch(
      /UPDATE (engineering_controlled_revisions|inventory|routings|travelers|boms)/i
    );
  });

  it('plans only targeted Design Control step impacts', () => {
    expect(migration).toContain('engineering_change_step_impacts');
    expect(service).toContain('ECN_TARGETED_STEP_NOT_PLANNED');
    expect(service).toContain('priorGenerationPreserved: true');
    expect(service).toContain('approvalsInvalidatedForStepOnly: true');
    expect(service).not.toContain('reopen all 12');
  });

  it('preserves the prior released baseline when authorizing a step generation', () => {
    expect(service).toContain('sourceBaselineMutated: false');
    expect(service).toContain('adapterExecutionRequired: true');
  });

  it('implements assignable actions with evidence and independent acceptance', () => {
    expect(migration).toContain('engineering_change_implementation_actions');
    for (const status of [
      'NOT_STARTED',
      'IN_PROGRESS',
      'BLOCKED',
      'COMPLETE',
      'ACCEPTED',
      'CANCELLED',
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(service).toContain('ECN_ACTION_EVIDENCE_REQUIRED');
    expect(service).toContain('ECN_ACTION_REVIEW_INDEPENDENCE');
    expect(migration).toContain('ecn_action_accepted_immutable');
  });

  it('blocks release readiness until required actions are accepted', () => {
    expect(service).toContain('ECN_ACTIONS_INCOMPLETE');
    expect(service).toContain("status NOT IN ('ACCEPTED','CANCELLED')");
  });

  it('records structured version-bound V&V evidence rather than booleans', () => {
    for (const field of [
      'plan_protocol',
      'acceptance_criteria',
      'actual_result',
      'result_status',
      'evidence_reference',
    ]) {
      expect(migration).toContain(field);
    }
    expect(service).toContain('ECN_VV_EVIDENCE_INCOMPLETE');
    expect(migration).toContain('ecn_vv_immutable');
  });

  it('blocks release readiness on failed or missing required V&V', () => {
    expect(service).toContain('ECN_VV_FAILED');
    expect(service).toContain('ECN_VERIFICATION_REQUIRED');
    expect(service).toContain('ECN_VALIDATION_REQUIRED');
    expect(service).toContain('ECN_INDEPENDENT_VV_REVIEW_REQUIRED');
  });

  it('uses authenticated independent V&V review and never accepts reviewer identity from bodies', () => {
    expect(service).toContain('independentlyReviewVvEvidence');
    expect(service).toContain('ECN_VV_REVIEW_INDEPENDENCE');
    expect(routes).not.toMatch(
      /req\.body\.(performer|reviewer|actor|userId|approvedBy)/
    );
  });

  it('validates inventory/WIP disposition but never executes inventory transactions', () => {
    for (const disposition of [
      'USE_AS_IS',
      'REWORK',
      'SCRAP',
      'RETURN_TO_SUPPLIER',
      'SEGREGATE',
      'RETROFIT',
      'PHASE_IN',
    ]) {
      expect(service).toContain(`'${disposition}'`);
    }
    expect(service).toContain('ECN_INVENTORY_DISPOSITION_INCOMPLETE');
    expect(service).toContain('automaticInventoryMutationEnabled: false');
  });

  it('validates every controlled effectivity method and required values', () => {
    for (const method of [
      'immediate',
      'effective_date',
      'first_serial_number',
      'lot_batch',
      'unit_range',
      'next_production_order',
      'after_existing_inventory_depletion',
      'retrofit_population',
      'other',
    ])
      expect(service).toContain(`'${method}'`);
    expect(service).toContain('ECN_EFFECTIVITY_VALUES_REQUIRED');
  });

  it('uses only the released Phase 4 ECN template and exact MDR version', () => {
    expect(catalog).toContain("'ENGINEERING_CHANGE_NOTICE'");
    expect(service).toContain("t.form_category='ENGINEERING_CHANGE_NOTICE'");
    expect(service).toContain("r.lifecycle_status='RELEASED'");
    expect(service).toContain('ECN_TEMPLATE_NOT_RELEASED');
    expect(migration).toContain('template_document_version_id');
  });

  it('retains controlled PDF or paper evidence before final approval', () => {
    expect(service).toContain('ECN_CONTROLLED_FORM_EVIDENCE_REQUIRED');
    expect(service).toContain('ECN_PAPER_ORIGINAL_UPLOADED');
    expect(service).toContain('ECN_RETAINED_FORM_CHECKSUM_MISMATCH');
    expect(routes).toContain('paperOriginal');
  });

  it('derives core and conditional authenticated approvals', () => {
    for (const role of [
      'ENGINEERING',
      'QUALITY',
      'MANUFACTURING_OPERATIONS',
      'PROGRAM_MANAGEMENT',
      'SUPPLY_CHAIN',
      'FINANCE',
      'SAFETY',
      'REGULATORY_CONTRACTS',
      'CUSTOMER_APPROVAL',
    ])
      expect(service).toContain(`'${role}'`);
    expect(service).toContain('ECN_SEGREGATION_OF_DUTIES');
  });

  it('binds approvals to ECN and ECR revisions/checksums with actor snapshots', () => {
    expect(migration).toContain('engineering_change_notice_approvals');
    expect(migration).toContain('source_ecr_checksum text NOT NULL');
    expect(migration).toContain('actor_capabilities_snapshot');
    expect(service).toContain('signatureMeaning');
  });

  it('provides all requested authenticated API shapes', () => {
    for (const fragment of [
      "/design-projects/:projectId/ecns'",
      "/ecrs/:ecrId/ecns'",
      "/ecns/:ecnId'",
      "/ecns/:ecnId/affected-items'",
      "/ecns/:ecnId/step-impacts'",
      "/ecns/:ecnId/actions'",
      "/ecns/:ecnId/verification'",
      "/ecns/:ecnId/validation'",
      "/ecns/:ecnId/submit'",
      "/ecns/:ecnId/decisions'",
      "/ecns/:ecnId/start-implementation'",
      "/ecns/:ecnId/mark-release-ready'",
      "/ecns/:ecnId/return'",
      "/ecns/:ecnId/reject'",
      "/ecns/:ecnId/cancel'",
      "/ecns/:ecnId/history'",
      "/ecns/:ecnId/pdf'",
    ])
      expect(routes).toContain(fragment);
  });

  it('enforces every ECN capability on the server', () => {
    for (const capability of [
      'engineering.ecn.view',
      'engineering.ecn.create',
      'engineering.ecn.edit',
      'engineering.ecn.submit',
      'engineering.ecn.approve',
      'engineering.ecn.implement',
      'engineering.ecn.verify',
      'engineering.ecn.validate',
      'engineering.ecn.admin',
    ]) {
      expect(capabilities).toContain(`'${capability}'`);
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
  });

  it('never accepts authoritative actor identity from request bodies', () => {
    expect(routes).not.toMatch(
      /req\.body\.(actor|user|userId|approvedBy|implementedBy|reviewedBy)/
    );
    expect(routes).toContain('actor(req)');
  });

  it('records append-only transactional audit events for material actions', () => {
    expect(service).toContain("await client.query('BEGIN')");
    expect(service).toContain("await client.query('ROLLBACK')");
    expect(migration).toContain('engineering_change_notice_events');
    expect(migration).toContain('ecn_event_immutable');
    for (const event of [
      'ECN_CREATED_FROM_APPROVED_ECR',
      'ECN_SUBMITTED',
      'ECN_ACTION_STATUS_CHANGED',
      'ECN_RELEASE_READY',
    ]) {
      expect(service).toContain(event);
    }
  });

  it('queues legacy ECOs as unverified without automatic conversion or approval', () => {
    expect(service).toContain('RECONCILIATION_REQUIRED');
    expect(service).toContain('LEGACY_UNVERIFIED');
    expect(service).toContain('automaticallyApproved: 0');
    expect(service).toContain('legacyRowsMutated: 0');
    expect(migration).not.toMatch(
      /UPDATE engineering_change_orders SET ecn_number/
    );
  });

  it('prevents duplicate legacy mapping with a stable source key', () => {
    expect(migration).toContain('stable_source_key text NOT NULL UNIQUE');
    expect(service).toContain('ON CONFLICT (stable_source_key) DO NOTHING');
  });

  it('uses one shared live ECN workspace in RD and QMS', () => {
    expect(rd).toContain('<EngineeringChangeNoticeWorkspace');
    expect(qms).toContain('<EngineeringChangeNoticeWorkspace');
    expect(ui).toContain('/api/design-projects/');
    expect(qms).not.toMatch(/ECO-\d{3,}|ECN-\d{3,}/);
  });

  it('does not create Revision B+ releases or mutate P2 and inventory systems', () => {
    expect(service).toContain('revisionBReleaseCreationEnabled: false');
    expect(service).toContain('automaticP2MutationEnabled: false');
    expect(service).not.toMatch(
      /INSERT INTO engineering_releases|UPDATE projects|UPDATE inventory/
    );
    expect(routes).not.toMatch(
      /\/p2|purchase-orders|travelers|work-orders|routings/
    );
  });

  it('does not automatically release templates or historical Engineering Releases', () => {
    expect(migration).not.toMatch(
      /UPDATE design_control_form_template_revisions|UPDATE engineering_releases/
    );
    expect(service).not.toMatch(
      /UPDATE engineering_releases|INSERT INTO engineering_releases/
    );
  });

  it('keeps CLOSED blocked until Phase 8 linkage or approved no-release disposition', () => {
    expect(service).toMatch(
      /!ecn\.resulting_engineering_release_id\s*&&\s*!ecn\.no_release_required/
    );
    expect(service).toContain('ECN_PHASE8_RELEASE_REQUIRED');
  });
});
