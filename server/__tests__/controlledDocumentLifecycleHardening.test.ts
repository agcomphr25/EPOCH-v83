import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  checksumFile,
  normalizeDocumentNumber,
} from '../src/services/controlledDocumentLifecycleService';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Master Document Register lifecycle hardening', () => {
  it('normalizes numbers without changing their display form and hashes server bytes', () => {
    expect(normalizeDocumentNumber('  qc form 12  ')).toBe('QC FORM 12');
    expect(checksumFile(Buffer.from('revision-a'))).toMatch(/^[a-f0-9]{64}$/);
    expect(checksumFile(Buffer.from('revision-a'))).not.toBe(checksumFile(Buffer.from('revision-b')));
  });

  it('closes ordinary file replacement and hard deletion', () => {
    const route = read('server/src/routes/controlledDocuments.ts');
    const service = read('server/src/services/controlledDocumentLifecycleService.ts');
    expect(service).toContain('CREATE_REVISION_REQUIRED');
    expect(route).toContain("router.post('/:id/revise'");
    expect(route).toContain('HARD_DELETE_DISABLED');
    expect(route).not.toContain('.delete(documentVersionHistory)');
    expect(route).not.toContain('.delete(controlledDocuments)');
    expect(route).not.toMatch(/Just update metadata without versioning[\s\S]*persistControlledDocumentUpload/);
  });

  it('provides exact-revision lifecycle routes without trusting body actor identity', () => {
    const route = read('server/src/routes/controlledDocuments.ts');
    for (const operation of ['submit', 'decision', 'release', 'revise', 'supersede', 'obsolete', 'void']) {
      expect(route).toContain(`/:id/${operation}`);
    }
    expect(route).toContain('/:id/revisions/:revisionId/download');
    expect(route).not.toMatch(/actor:\s*req\.body/);
    expect(route).not.toMatch(/approvedBy\s*=\s*req\.body/);
    for (const capability of [
      'documents.view', 'documents.create', 'documents.edit_draft', 'documents.submit',
      'documents.approve', 'documents.release', 'documents.revise',
      'documents.supersede', 'documents.obsolete', 'documents.void', 'documents.number_admin',
    ]) {
      expect(route).toContain(`requirePermission('${capability}')`);
    }
    expect(route).not.toContain("documentManagers = ['lauriet']");
  });

  it('uses additive number, revision, approval, and append-only database protections', () => {
    const migration = read('migrations/0210_master_document_control_hardening.sql');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS lifecycle_status');
    expect(migration).toContain('controlled_document_number_registry');
    expect(migration).toContain('normalized_number text NOT NULL UNIQUE');
    expect(migration).toContain('controlled_document_revision_approvals');
    expect(migration).toContain('prevent_controlled_document_hard_delete');
    expect(migration).toContain('protect_released_document_revision_identity');
    expect(migration).toContain('PENDING_BACKFILL');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('keeps template and routing generation on exact verified draft revisions', () => {
    const route = read('server/src/routes/routingDocuments.ts');
    expect(route.match(/file_checksum:/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route.match(/checksum_status: 'VERIFIED'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain('current_revision_id');
    expect(route).toContain('controlled_document_number_registry');
  });

  it('does not alter P2 or Phase 2B Design Control approval implementation', () => {
    const designControl = read('server/src/services/designControlApprovalService.ts');
    expect(designControl).toContain('AUTHENTICATED_VERSION_BOUND_APPROVAL');
    expect(designControl).not.toContain('controlled_document_revision_approvals');
  });
});
