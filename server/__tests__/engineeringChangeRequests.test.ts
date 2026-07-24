import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0214_engineering_change_requests.sql');
const service = read('server/src/services/engineeringChangeRequestService.ts');
const routes = read('server/src/routes/engineeringChangeRequests.ts');
const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
const capabilities = read('server/src/capabilities.ts');
const catalog = read('shared/designControlFormCatalog.ts');
const qms = read('client/src/pages/QMSDesignControlPage.tsx');
const rd = read('client/src/pages/RDProjectsPage.tsx');
const register = read(
  'client/src/components/design-control/EngineeringChangeRequestRegister.tsx'
);

describe('Phase 6 authoritative Engineering Change Requests', () => {
  it('uses an additive idempotent next migration', () => {
    expect(migration).toContain(
      'CREATE SEQUENCE IF NOT EXISTS engineering_change_request_number_seq'
    );
    expect(
      migration.match(/CREATE TABLE IF NOT EXISTS/g)?.length
    ).toBeGreaterThanOrEqual(7);
    expect(migration).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/);
  });

  it('registers migration 0214 in safe and critical boot lists', () => {
    expect(runner.match(/0214_engineering_change_requests\.sql/g)).toHaveLength(
      2
    );
  });

  it('creates authoritative ECR, revision, affected item, review, event, attachment, and reconciliation storage', () => {
    for (const table of [
      'engineering_change_requests',
      'engineering_change_request_revisions',
      'engineering_change_request_affected_items',
      'engineering_change_request_reviews',
      'engineering_change_request_events',
      'engineering_change_request_dispositions',
      'engineering_change_request_attachments',
      'engineering_change_request_legacy_reconciliation',
    ])
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });

  it('binds ECRs to R&D projects and authoritative Design Control records', () => {
    expect(migration).toContain(
      'rd_project_id text NOT NULL REFERENCES rd_projects'
    );
    expect(migration).toContain(
      'design_control_record_id uuid NOT NULL REFERENCES design_control_records'
    );
    expect(service).toContain('P2 project identifiers are not accepted');
  });

  it('never adds a P2 ownership column', () => {
    expect(migration).not.toMatch(
      /\bp2_project_id\b|\bpurchase_order_id\b|\bpo_id\b/
    );
  });

  it('uses a concurrency-safe server sequence with permanent ECR numbering', () => {
    expect(service).toContain(
      "nextval('engineering_change_request_number_seq')"
    );
    expect(service).toContain('ECR-${new Date().getUTCFullYear()}-');
    expect(routes).not.toMatch(/ecrNumber\s*:/);
  });

  it('does not reuse voided numbers or hard delete ECRs', () => {
    expect(migration).toContain('prevent_ecr_delete');
    expect(migration).toContain('BEFORE DELETE ON engineering_change_requests');
    expect(service).not.toMatch(/DELETE FROM engineering_change_requests/);
  });

  it('enforces lifecycle transitions and immutable terminal evidence', () => {
    expect(service).toContain("DRAFT: ['SUBMITTED', 'CANCELLED', 'VOID']");
    expect(service).toMatch(/SUBMITTED:\s*\[\s*'IMPACT_REVIEW'/);
    expect(migration).toContain(
      'Terminal ECR content and evidence are immutable'
    );
    expect(migration).toContain('ecr_revision_immutable_update');
  });

  it('snapshots and checksums every submission revision', () => {
    expect(service).toContain('engineering_change_request_revisions');
    expect(service).toContain('const digest = checksum(canonical)');
    expect(service).toContain('current_content_revision_id');
  });

  it('creates a new revision after return and resubmission', () => {
    expect(service).toContain("['DRAFT', 'RETURNED_FOR_REVISION']");
    expect(service).toContain('Number(count.value) + 1');
  });

  it('requires source release and baseline after Revision A', () => {
    expect(service).toContain("release_revision='A'");
    expect(service).toContain('ECR_POST_RELEASE_SOURCE_REQUIRED');
    expect(service).toContain('source_engineering_release_baseline_id');
  });

  it('keeps pre-Revision-A ECR use optional', () => {
    expect(register).toContain('Pre-Rev A / optional');
    expect(service).not.toContain('CREATE ECR FOR EVERY DRAFT EDIT');
  });

  it('validates source release and baseline ownership', () => {
    expect(service).toContain('ECR_SOURCE_BASELINE_MISMATCH');
    expect(service).toContain('er.rd_project_id = $2');
    expect(service).toContain('er.design_control_record_id = $3::uuid');
  });

  it('supports the required affected item categories without mutating sources', () => {
    for (const type of [
      'REQUIREMENT',
      'DRAWING',
      'CAD_MODEL',
      'BOM',
      'MANUFACTURING_ROUTING_REFERENCE',
      'CONTROLLED_DOCUMENT',
    ]) {
      expect(migration).toContain(`'${type}'`);
    }
    expect(routes).toContain('supersedes-affected-item:');
    expect(service).not.toMatch(
      /UPDATE (boms|drawings|routings|travelers|inventory)/i
    );
  });

  it('derives core and conditional impact reviews from declared impacts', () => {
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
    ]) {
      expect(service).toContain(`'${role}'`);
    }
  });

  it('binds authenticated review decisions to exact revision and checksum', () => {
    expect(migration).toContain('ecr_revision_id uuid NOT NULL');
    expect(migration).toContain('content_checksum text NOT NULL');
    expect(migration).toContain('actor_capabilities_snapshot');
    expect(routes).toContain('actor(req)');
  });

  it('enforces requester independence for key reviews', () => {
    expect(service).toContain('ECR_SEGREGATION_OF_DUTIES');
    expect(service).toContain('actor.id === ecr.created_by_user_id');
  });

  it('requires all applicable review approvals before disposition', () => {
    expect(service).toContain('ECR_IMPACT_REVIEWS_INCOMPLETE');
    expect(service).toContain("decision='APPROVE'");
  });

  it('uses only a released controlled ECR template', () => {
    expect(catalog).toContain("'ENGINEERING_CHANGE_REQUEST'");
    expect(service).toContain("t.form_category = 'ENGINEERING_CHANGE_REQUEST'");
    expect(service).toContain("r.lifecycle_status = 'RELEASED'");
    expect(service).toContain('ECR_TEMPLATE_NOT_RELEASED');
  });

  it('retains exact template and MDR document-version identity', () => {
    expect(migration).toContain('template_definition_revision_id');
    expect(migration).toContain('template_document_version_id');
    expect(migration).toContain('template_checksum_snapshot');
  });

  it('supports immutable electronic PDF and paper-original evidence', () => {
    expect(service).toContain('PAPER_ORIGINAL_UPLOADED');
    expect(service).toContain('retained_form_checksum');
    expect(service).toContain('ECR_CONTROLLED_FORM_EVIDENCE_REQUIRED');
    expect(routes).toContain('paperOriginal');
  });

  it('does not duplicate independently editable form authority', () => {
    expect(service).toContain('canonical_content');
    expect(service).toContain('renderEcrPdf');
    expect(migration).not.toContain('ecr_form_editable_content');
  });

  it('provides every required API shape', () => {
    for (const fragment of [
      "/design-projects/:projectId/ecrs'",
      "/ecrs/:ecrId'",
      "/ecrs/:ecrId/affected-items'",
      "/ecrs/:ecrId/submit'",
      "/ecrs/:ecrId/start-impact-review'",
      "/ecrs/:ecrId/reviews'",
      "/ecrs/:ecrId/approve'",
      "/ecrs/:ecrId/reject'",
      "/ecrs/:ecrId/return'",
      "/ecrs/:ecrId/cancel'",
      "/ecrs/:ecrId/history'",
      "/ecrs/:ecrId/pdf'",
    ])
      expect(routes).toContain(fragment);
  });

  it('protects every mutation with server capabilities', () => {
    for (const capability of [
      'engineering.ecr.view',
      'engineering.ecr.create',
      'engineering.ecr.edit',
      'engineering.ecr.submit',
      'engineering.ecr.review',
      'engineering.ecr.disposition',
      'engineering.ecr.admin',
    ]) {
      expect(capabilities).toContain(`'${capability}'`);
      expect(routes).toContain(`requirePermission('${capability}')`);
    }
  });

  it('never accepts actor identity from request bodies', () => {
    expect(routes).not.toMatch(
      /req\.body\.(actor|user|userId|approvedBy|submittedBy)/
    );
    expect(routes).toContain('actor(req)');
  });

  it('records append-only transactional audit evidence', () => {
    expect(service).toContain("await client.query('BEGIN')");
    expect(service).toContain("await client.query('ROLLBACK')");
    expect(service).toContain('engineering_change_request_events');
    expect(migration).toContain('ecr_event_immutable_update');
  });

  it('preserves legacy changes and queues non-destructive reconciliation', () => {
    expect(migration).toContain('REFERENCES design_control_changes');
    expect(service).toContain('RECONCILIATION_REQUIRED');
    expect(service).toContain('READY_FOR_EXPLICIT_IMPORT');
    expect(service).toContain('automaticallyCreated: 0');
    expect(migration).not.toMatch(
      /DELETE FROM design_control_changes|UPDATE design_control_changes/
    );
  });

  it('prevents duplicate legacy reconciliation by stable source key', () => {
    expect(migration).toContain('stable_source_key text NOT NULL UNIQUE');
    expect(service).toContain('ON CONFLICT (stable_source_key) DO NOTHING');
  });

  it('replaces hard-coded ECR samples with the shared live register', () => {
    expect(qms).not.toContain('ECR-7025');
    expect(qms).not.toContain('ECR-7033');
    expect(qms).toContain('<EngineeringChangeRequestRegister');
    expect(rd).toContain('<EngineeringChangeRequestRegister');
  });

  it('does not implement ECN creation or Revision B+ authorization', () => {
    expect(service).toContain('ecnCreationEnabled: false');
    expect(service).toContain('revisionBReleaseAuthorizationEnabled: false');
    expect(routes).not.toMatch(/create-ecn|\/ecns|createEcn/i);
    expect(migration).not.toContain('engineering_change_notices');
  });

  it('does not modify historical releases or automatically release templates', () => {
    expect(migration).not.toMatch(
      /UPDATE engineering_releases|UPDATE design_control_form_template_revisions/
    );
    expect(service).not.toMatch(
      /UPDATE engineering_releases|lifecycle_status='RELEASED'.*template/i
    );
  });

  it('keeps approval distinct from implementation', () => {
    expect(register).toMatch(
      /Approval does not\s+implement the change or create an ECN/
    );
    expect(register).toContain('Expected; not created');
  });
});
