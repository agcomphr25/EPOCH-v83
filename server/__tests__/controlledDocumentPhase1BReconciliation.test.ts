import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  assessLegacyControlledDocument,
  checksumAuthoritativeBytes,
  hashReconciliationPreview,
} from '../src/services/controlledDocumentReconciliationService';

const root = process.cwd();
const baseline = (overrides: Record<string, unknown> = {}) => ({
  documentId: '00000000-0000-4000-8000-000000000001',
  documentNumber: 'QMS-001',
  title: 'Legacy procedure',
  legacyStatus: 'approved',
  lifecycleStatus: 'DRAFT',
  currentVersion: '1.1',
  currentReleasedRevisionId: null,
  revisionId: '00000000-0000-4000-8000-000000000002',
  revisionCount: 1,
  revisionVersion: '1.1',
  revisionLifecycleStatus: 'APPROVED',
  revisionChecksum: null,
  revisionChecksumStatus: 'PENDING_BACKFILL',
  fileReference: '/objects/legacy.pdf',
  fileReferenceType: 'OBJECT_STORAGE',
  fileAccessibility: 'ACCESSIBLE' as const,
  observedChecksum: 'abc123',
  approvalIdentity: 'historical-approver',
  approvalDate: '2020-01-01T00:00:00.000Z',
  effectiveDate: '2020-02-01',
  duplicateNumber: false,
  pointerProblems: [],
  contradictoryLifecycle: false,
  requiresCurrentApprovalWorkflow: false,
  ...overrides,
});

describe('Master Document Register Phase 1B reconciliation', () => {
  it('classifies only deterministic legacy evidence for automatic reconciliation', () => {
    const result = assessLegacyControlledDocument(baseline());
    expect(result.classification).toBe('LEGACY_AUTO_RECONCILIATION_ELIGIBLE');
    expect(result.proposedChanges).toMatchObject({
      'controlled_documents.current_released_revision_id':
        baseline().revisionId,
      reconciliationProvenance: 'LEGACY_MIGRATION_VERIFIED',
    });
  });

  it.each([
    [
      { fileAccessibility: 'INACCESSIBLE', observedChecksum: null },
      'FILE_RECONCILIATION_REQUIRED',
    ],
    [
      {
        fileReferenceType: 'EXTERNAL_MUTABLE_URL',
        fileAccessibility: 'EXTERNAL_MUTABLE',
        observedChecksum: null,
      },
      'LEGACY_REFERENCE_ONLY',
    ],
    [{ duplicateNumber: true }, 'NUMBER_RECONCILIATION_REQUIRED'],
    [{ revisionCount: 2 }, 'REVISION_RECONCILIATION_REQUIRED'],
    [{ revisionVersion: null }, 'REVISION_RECONCILIATION_REQUIRED'],
    [{ approvalIdentity: null }, 'APPROVAL_EVIDENCE_REQUIRED'],
    [{ approvalDate: null }, 'APPROVAL_EVIDENCE_REQUIRED'],
    [
      {
        pointerProblems: [
          'current_released_revision_id identifies another document',
        ],
      },
      'REVISION_RECONCILIATION_REQUIRED',
    ],
    [
      { contradictoryLifecycle: true, lifecycleStatus: 'RELEASED' },
      'LEGACY_APPROVED_VERIFICATION_REQUIRED',
    ],
    [
      { lifecycleStatus: 'OBSOLETE', legacyStatus: 'obsolete' },
      'OBSOLETE_OR_VOID_REVIEW_REQUIRED',
    ],
  ])('keeps ambiguous evidence unchanged: %s', (overrides, expected) => {
    const result = assessLegacyControlledDocument(baseline(overrides));
    expect(result.classification).toBe(expected);
    expect(result.automatic).toBe(false);
    expect(result.proposedChanges).toEqual({});
  });

  it('calculates a checksum only from exact bytes', () => {
    expect(checksumAuthoritativeBytes(Buffer.from('authoritative bytes'))).toBe(
      'db59b381b1ddf5b3b11fba4d422a93a033823fa7a371be038d665d5eafcdfd7b'
    );
  });

  it('requires exact checksum equality and VERIFIED status for RELEASED_VERIFIED', () => {
    const released = baseline({
      lifecycleStatus: 'RELEASED',
      currentReleasedRevisionId: baseline().revisionId,
      revisionLifecycleStatus: 'RELEASED',
      revisionChecksum: 'abc123',
      revisionChecksumStatus: 'VERIFIED',
    });
    expect(assessLegacyControlledDocument(released).classification).toBe(
      'RELEASED_VERIFIED'
    );
    expect(
      assessLegacyControlledDocument({
        ...released,
        observedChecksum: 'different',
      }).classification
    ).toBe('FILE_RECONCILIATION_REQUIRED');
    expect(
      assessLegacyControlledDocument({
        ...released,
        revisionChecksumStatus: 'PENDING_BACKFILL',
      }).classification
    ).not.toBe('RELEASED_VERIFIED');
  });

  it('never makes confirmed uploaded bytes automatically releasable', () => {
    const result = assessLegacyControlledDocument(
      baseline({ requiresCurrentApprovalWorkflow: true })
    );
    expect(result.automatic).toBe(false);
    expect(result.blockers).toContain(
      'Confirmed uploaded bytes must enter the current checksum-bound approval workflow'
    );
  });

  it.each([
    'current_revision_id',
    'working_draft_revision_id',
    'current_released_revision_id',
  ])('blocks an invalid %s pointer', (pointer) => {
    const result = assessLegacyControlledDocument(
      baseline({ pointerProblems: [`${pointer} identifies another document`] })
    );
    expect(result.automatic).toBe(false);
    expect(result.blockers).toContain(`${pointer} identifies another document`);
  });

  it('creates stable preview identities and changes them when evidence changes', () => {
    const first = hashReconciliationPreview([baseline()]);
    expect(hashReconciliationPreview([baseline()])).toBe(first);
    expect(
      hashReconciliationPreview([baseline({ effectiveDate: '2020-03-01' })])
    ).not.toBe(first);
  });

  it('uses an additive, append-only migration without deleting historical records', () => {
    const sql = fs.readFileSync(
      path.join(
        root,
        'migrations/0245_controlled_document_legacy_reconciliation.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('LEGACY_MIGRATION_VERIFIED');
    expect(sql).toContain('RECONCILIATION_HISTORY_IS_APPEND_ONLY');
    expect(sql).not.toMatch(
      /DELETE\s+FROM\s+(controlled_documents|document_version_history|controlled_document_revision_approvals)/i
    );
    expect(sql).not.toMatch(
      /UPDATE\s+(controlled_documents|document_version_history|controlled_document_revision_approvals)/i
    );
  });

  it('keeps the corrective migration additive and preserves 0245', () => {
    const sql = fs.readFileSync(
      path.join(
        root,
        'migrations/0253_controlled_document_reconciliation_certification_controls.sql'
      ),
      'utf8'
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(sql).not.toMatch(/\b(DROP TABLE|DROP COLUMN|DELETE FROM)\b/i);
    expect(
      fs.existsSync(
        path.join(
          root,
          'migrations/0245_controlled_document_legacy_reconciliation.sql'
        )
      )
    ).toBe(true);
  });

  it('registers the additive migration in both safe and critical boot lists', () => {
    const source = fs.readFileSync(
      path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
      'utf8'
    );
    expect(
      source.match(/0245_controlled_document_legacy_reconciliation\.sql/g)
    ).toHaveLength(2);
    expect(
      source.match(
        /0253_controlled_document_reconciliation_certification_controls\.sql/g
      )
    ).toHaveLength(2);
  });

  it('gates every operation server-side before route handling', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    expect(route).toContain(
      'router.use(requireAuth, requireControlledDocumentReconciliationEnabled)'
    );
    expect(
      route.indexOf(
        'router.use(requireAuth, requireControlledDocumentReconciliationEnabled)'
      )
    ).toBeLessThan(route.indexOf("'/inventory'"));
    const ui = fs.readFileSync(
      path.join(
        root,
        'client/src/components/ControlledDocumentReconciliationWorkspace.tsx'
      ),
      'utf8'
    );
    expect(ui).toContain('Unavailable pending certification');
    expect(ui).toContain("availability !== 'enabled'");
  });

  it('requires separate view, preview, execute, and resolve permissions', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    for (const permission of [
      'documents.reconciliation_view',
      'documents.reconciliation_preview',
      'documents.reconciliation_execute',
      'documents.reconciliation_resolve',
    ]) {
      expect(route).toContain(`requirePermission('${permission}')`);
    }
  });

  it('revalidates previews transactionally and makes execution idempotent', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    expect(route).toContain("await client.query('BEGIN')");
    expect(route).toContain('RECONCILIATION_PREVIEW_STALE');
    expect(route).toContain('pg_advisory_xact_lock');
    expect(route.indexOf('pg_advisory_xact_lock')).toBeLessThan(
      route.indexOf('idempotency_key=$1')
    );
    expect(route).toContain('inventory(client)');
    expect(route).toContain(
      'WHERE document_id = ANY($1::uuid[]) ORDER BY document_id,id FOR UPDATE'
    );
    expect(route).toContain('controlled_document_reconciliation_evidence');
    expect(route).toContain('ORDER BY controlled_document_id,id FOR UPDATE');
    expect(route).toContain(
      'ON CONFLICT (idempotency_key) DO NOTHING RETURNING id'
    );
    expect(route).toContain('RECONCILIATION_IDEMPOTENCY_KEY_REUSE');
    expect(route).toContain('buildReconciliationSnapshot');
    expect(route).not.toContain('row_to_json');
    expect(route).toContain('before_snapshot,after_snapshot');
    expect(route).toContain("await client.query('ROLLBACK')");
    const documentLock = route.indexOf(
      'FROM controlled_documents WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE'
    );
    const revisionLock = route.indexOf(
      'WHERE document_id = ANY($1::uuid[]) ORDER BY document_id,id FOR UPDATE'
    );
    const evidenceLock = route.indexOf(
      'WHERE controlled_document_id = ANY($1::uuid[])\n         ORDER BY controlled_document_id,id FOR UPDATE'
    );
    const finalAssessment = route.indexOf(
      'const current = (await inventory(client))'
    );
    expect(documentLock).toBeGreaterThan(-1);
    expect(documentLock).toBeLessThan(revisionLock);
    expect(revisionLock).toBeLessThan(evidenceLock);
    expect(evidenceLock).toBeLessThan(finalAssessment);
  });

  it('uses target-compatible collection conversions in changed execution code', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    expect(route).toContain('Array.from(new Set(input.selectedDocumentIds))');
    expect(route).not.toMatch(/\[\.\.\.new (Set|Map)/);
  });

  it('keeps raw file paths out of snapshots and API responses', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    expect(route).not.toContain('row_to_json');
    expect(route).toContain('buildReconciliationSnapshot');
    expect(route).toContain('fileReference: null');
    expect(route).not.toContain('immutablePath: stored');
  });

  it('keeps evidence append-only and current workflow revisions unreleased', () => {
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/controlledDocumentReconciliation.ts'),
      'utf8'
    );
    expect(route).toContain('/:id/evidence/:evidenceId/confirm');
    expect(route).toContain('createControlledRevision');
    expect(route).toContain('released: false');
    expect(route).not.toMatch(
      /UPDATE controlled_document_reconciliation_evidence/i
    );
  });

  it('reports operational references without rewriting them', () => {
    const source = fs.readFileSync(
      path.join(
        root,
        'server/src/services/controlledDocumentOperationalReferenceReport.ts'
      ),
      'utf8'
    );
    expect(source).toContain('REPORT_ONLY_NO_REWRITE');
    expect(source).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/i);
  });
});
