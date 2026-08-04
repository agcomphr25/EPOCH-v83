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
  fileReference: '/objects/legacy.pdf',
  fileReferenceType: 'OBJECT_STORAGE',
  fileAccessibility: 'ACCESSIBLE' as const,
  observedChecksum: 'abc123',
  approvalIdentity: 'historical-approver',
  approvalDate: '2020-01-01T00:00:00.000Z',
  effectiveDate: '2020-02-01',
  duplicateNumber: false,
  crossDocumentPointer: false,
  contradictoryLifecycle: false,
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
    [{ crossDocumentPointer: true }, 'REVISION_RECONCILIATION_REQUIRED'],
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

  it('registers the additive migration in both safe and critical boot lists', () => {
    const source = fs.readFileSync(
      path.join(root, 'server/scripts/migrations/runSafeBootMigrations.ts'),
      'utf8'
    );
    expect(
      source.match(/0245_controlled_document_legacy_reconciliation\.sql/g)
    ).toHaveLength(2);
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
    expect(route).toContain('idempotency_key=$1');
    expect(route).toContain("await client.query('ROLLBACK')");
  });
});
