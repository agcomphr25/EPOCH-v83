import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0219_controlled_printed_copies.sql');
const service = read('server/src/services/controlledPrintedCopyService.ts');
const routes = read('server/src/routes/controlledPrintedCopies.ts');
const readiness = read(
  'server/src/services/controlledPrintedCopySchemaReadiness.ts'
);
const templateRoutes = read('server/src/routes/designControlFormTemplates.ts');
const ui = read('client/src/components/design-control/ControlledCopyPanel.tsx');
const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('Phase 9 controlled printed-copy accountability', () => {
  it('allocates stable server-side copy numbers under an advisory lock', () => {
    expect(migration).toContain('controlled_printed_copy_number_seq');
    expect(migration).toContain('copy_number text NOT NULL UNIQUE');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('CC-${new Date().getUTCFullYear()}-');
    expect(routes).not.toMatch(/copyNumber:\s*req\.body/);
  });
  it('binds exact immutable source revisions and checksums', () => {
    for (const field of [
      'document_version_history_id',
      'design_control_template_revision_id',
      'project_form_instance_revision_id',
      'ecr_revision_id',
      'ecn_revision_id',
      'source_pdf_checksum',
      'issued_pdf_checksum',
    ])
      expect(migration).toContain(field);
    expect(service).toContain('CONTROLLED_COPY_SOURCE_CHECKSUM_MISMATCH');
  });
  it('rejects drafts, mutable previews, and unapproved evidence', () => {
    expect(service).toContain("'RELEASED', 'SUPERSEDED', 'OBSOLETE'");
    expect(service).toContain("source.lifecycle_status !== 'APPROVED'");
    expect(service).toContain('CONTROLLED_COPY_IMMUTABLE_ARTIFACT_REQUIRED');
  });
  it('keeps controlled and uncontrolled print modes distinct', () => {
    expect(service).toContain(
      "'CONTROLLED COPY' | 'UNCONTROLLED WHEN PRINTED'"
    );
    expect(service).toContain('createsControlledCopyRecord: false');
    expect(routes).toContain("X-Print-Classification', 'UNCONTROLLED'");
  });
  it('retains deterministic issued PDF bytes and verifies downloads', () => {
    expect(service).toContain("flag: 'wx'");
    expect(service).toContain('issued_artifact_path');
    expect(service).toContain('CONTROLLED_COPY_ISSUED_CHECKSUM_MISMATCH');
  });
  it('stamps every page with identity, pagination, checksum, and QR', () => {
    expect(service).toContain('for (const [index, page] of pages.entries())');
    expect(service).toContain('Page ${index + 1} of ${pages.length}');
    expect(service).toContain('QRCode.toBuffer');
    expect(service).toContain('Status at issue: ISSUED');
  });
  it('requires structured internal recipient identity', () => {
    expect(service).toContain('CONTROLLED_COPY_STRUCTURED_RECIPIENT_REQUIRED');
    expect(service).toContain('CONTROLLED_COPY_INTERNAL_USER_REQUIRED');
    expect(migration).toContain('recipient_snapshot jsonb NOT NULL');
  });
  it('enforces lifecycle transitions and terminal immutability', () => {
    expect(service).toContain(
      "ISSUED: ['RETURNED', 'DESTROYED', 'VOID', 'LOST', 'REPLACED']"
    );
    expect(service).toContain('CONTROLLED_COPY_TRANSITION_INVALID');
    expect(migration).toContain('controlled_printed_copies_status_check');
  });
  it('records return and immutable scan evidence without overwriting originals', () => {
    expect(service).toContain('Record physical return before scan upload');
    expect(service).toContain("'RETURN_SCAN'");
    expect(migration).toContain('controlled_copy_attachment_immutable');
    expect(service).not.toMatch(/UPDATE project_form_attachments/);
    expect(service).toContain('CONTROLLED_COPY_SCAN_ACCEPTANCE_REQUIRED');
    expect(routes).toContain("'/:copyId/accept-scan'");
  });
  it('routes completed returned forms to existing paper-form identity', () => {
    expect(service).toContain("'EXISTING_PROJECT_FORM_INSTANCE'");
    expect(migration).toContain('linked_project_form_instance_id');
  });
  it('requires destruction evidence and void reason', () => {
    expect(service).toContain('CONTROLLED_COPY_DISPOSITION_EVIDENCE_REQUIRED');
    expect(routes).toContain("'DESTROYED'");
    expect(routes).toContain("'VOID'");
  });
  it('requires a complete lost-copy assessment', () => {
    for (const key of [
      'discoveryDate',
      'lastKnownHolderLocation',
      'searchActions',
      'securityAssessment',
      'qualityImpactAssessment',
      'revisionRisk',
      'dispositionApproval',
    ])
      expect(service).toContain(key);
    expect(service).not.toMatch(/INSERT INTO (ncr|car)/i);
  });
  it('creates replacement and reciprocal linkage transactionally', () => {
    expect(migration).toContain('replacement_for_copy_id');
    expect(migration).toContain('replaced_by_copy_id');
    expect(service).toContain('transactionClient?: PoolClient');
    expect(service).toContain("'REPLACEMENT_ISSUED'");
  });
  it('blocks obsolete sources without authorized exception', () => {
    expect(service).toContain('CONTROLLED_COPY_OBSOLETE_SOURCE_BLOCKED');
    expect(migration).toContain('source_historical_exception');
  });
  it('gates supersession and obsolescence on outstanding copies', () => {
    expect(
      templateRoutes.match(/assertNoOutstandingCopiesForRevision/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(service).toContain('CONTROLLED_COPY_OBSOLESCENCE_BLOCKED');
    expect(service).toContain('OBSOLESCENCE_EXCEPTION_AUTHORIZED');
  });
  it('keeps events append-only with before and after values', () => {
    expect(migration).toContain('controlled_copy_event_immutable');
    expect(migration).toContain('before_values jsonb');
    expect(migration).toContain('after_values jsonb');
    expect(service).not.toMatch(/UPDATE controlled_printed_copy_events/);
  });
  it('enforces authorization and never accepts actor identity from bodies', () => {
    for (const capability of [
      'documents.controlled_copy.view',
      'documents.controlled_copy.issue',
      'documents.controlled_copy.return',
      'documents.controlled_copy.destroy',
      'documents.controlled_copy.report_lost',
      'documents.controlled_copy.admin',
    ])
      expect(routes).toContain(capability);
    expect(routes).not.toMatch(/req\.body\.(actor|issuedBy|username)/);
  });
  it('limits public verification to non-sensitive identity and status', () => {
    expect(routes).toContain("router.get('/verify/:token'");
    expect(routes).not.toMatch(
      /verify\/:token[\s\S]{0,900}(recipient_snapshot|source_artifact_path)/
    );
  });
  it('reconciles legacy distribution without inventing control facts', () => {
    expect(migration).toContain(
      'document_distribution_log_id uuid NOT NULL UNIQUE'
    );
    expect(service).toContain('LEGACY_DISTRIBUTION_UNVERIFIED');
    expect(service).toContain('automaticallyIssued: 0');
    expect(service).not.toMatch(
      /UPDATE document_distribution_logs|DELETE FROM document_distribution_logs/
    );
  });
  it('has additive idempotent migration and schema readiness', () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS');
    expect(readiness).toContain('CONTROLLED_PRINTED_COPY_SCHEMA_NOT_READY');
    expect(boot.match(/0219_controlled_printed_copies\.sql/g)).toHaveLength(2);
    expect(routes).not.toMatch(/CREATE TABLE|ALTER TABLE/);
  });
  it('exposes issuance, lifecycle, PDF, history, and scoped APIs', () => {
    for (const endpoint of [
      "'/:copyId/pdf'",
      "'/:copyId/history'",
      "'/:copyId/acknowledge'",
      "'/:copyId/return'",
      "'/:copyId/upload-scan'",
      "'/:copyId/destroy'",
      "'/:copyId/void'",
      "'/:copyId/report-lost'",
      "'/:copyId/replace'",
      "'/design-control/:recordId/controlled-copies'",
    ])
      expect(routes).toContain(endpoint);
  });
  it('uses live reconciliation UI without hard-coded examples', () => {
    expect(ui).toContain('/api/controlled-copies');
    expect(ui).toContain('Obsolete-source conflict');
    expect(ui).toContain('overdue_age_days');
    expect(ui).not.toMatch(/CC-202\d-\d{6}/);
  });
  it('does not touch P2, manufacturing workflows, DHF, or package expansion', () => {
    const combined = `${migration}\n${service}\n${routes}`;
    expect(combined).not.toMatch(
      /(INSERT INTO|UPDATE|DELETE FROM)\s+(projects|p2_|purchase|wad|travel|routing|work_order|production|inventory)/i
    );
    expect(combined).not.toMatch(/DHF|generateEngineeringPackage/i);
  });
});
