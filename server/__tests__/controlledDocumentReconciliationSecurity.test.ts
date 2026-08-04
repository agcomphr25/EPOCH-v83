import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ pool: { query: vi.fn() }, db: {} }));

import {
  isControlledDocumentReconciliationExplicitlyEnabled,
  requireControlledDocumentReconciliationEnabled,
} from '../src/services/controlledDocumentReconciliationGate';
import { resolveContainedReconciliationFile } from '../src/services/controlledDocumentReconciliationFileResolver';
import {
  buildReconciliationSnapshot,
  containsUnsafeReconciliationPath,
} from '../src/services/controlledDocumentReconciliationProvenance';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((entry) => fs.rm(entry, { recursive: true, force: true }))
  )
);

describe('Phase 1B certification containment', () => {
  it.each([undefined, '', 'TRUE', 'True', '1', 'yes', ' true', 'true '])(
    'fails closed for malformed flag %s',
    (value) => {
      expect(isControlledDocumentReconciliationExplicitlyEnabled(value)).toBe(
        false
      );
    }
  );
  it('accepts only exact explicit true', () => {
    expect(isControlledDocumentReconciliationExplicitlyEnabled('true')).toBe(
      true
    );
  });

  it('returns the controlled 503 response while disabled', async () => {
    const prior = process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED;
    delete process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    await requireControlledDocumentReconciliationEnabled(
      {} as any,
      { status, json } as any,
      next
    );
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        error: 'CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED',
        message:
          'Phase 1B reconciliation is unavailable pending certification.',
      })
    );
    expect(next).not.toHaveBeenCalled();
    if (prior === undefined)
      delete process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED;
    else process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED = prior;
  });

  it('contains valid legacy files and never returns paths as identity', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdr-safe-'));
    temporary.push(root);
    await fs.mkdir(path.join(root, 'uploads/media-library/nested'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(root, 'uploads/media-library/nested/file.pdf'),
      'bytes'
    );
    const result = await resolveContainedReconciliationFile(
      'uploads/media-library/nested/file.pdf',
      root
    );
    expect(result.path).toContain(
      `${path.sep}uploads${path.sep}media-library${path.sep}`
    );
    expect(result.identity).toEqual({
      kind: 'uploads/media-library',
      relativePath: 'nested/file.pdf',
    });
  });

  it.each([
    '../secret',
    'uploads/media-library/../secret',
    'uploads/media-library/%2e%2e/secret',
    'uploads\\media-library\\..\\secret',
    '/uploads/media-library/file',
    'C:\\secret',
    '\\\\server\\share\\secret',
    'uploads/media-library/%E0%A4%A',
    'uploads/media-library/a%00b',
  ])('rejects unsafe reference %s', async (reference) => {
    await expect(
      resolveContainedReconciliationFile(reference, process.cwd())
    ).rejects.toMatchObject({
      code: 'RECONCILIATION_FILE_REFERENCE_REJECTED',
    });
  });

  it('rejects a symlink escape where the host supports symlinks', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mdr-link-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'mdr-outside-'));
    temporary.push(root, outside);
    await fs.mkdir(path.join(root, 'uploads/media-library'), {
      recursive: true,
    });
    await fs.writeFile(path.join(outside, 'secret.pdf'), 'secret');
    try {
      await fs.symlink(
        outside,
        path.join(root, 'uploads/media-library/link'),
        'junction'
      );
    } catch {
      return;
    }
    await expect(
      resolveContainedReconciliationFile(
        'uploads/media-library/link/secret.pdf',
        root
      )
    ).rejects.toMatchObject({
      code: 'RECONCILIATION_FILE_REFERENCE_REJECTED',
    });
  });

  it('builds complete snapshots without retaining unrestricted paths or signed URLs', () => {
    const assessment: any = {
      documentId: 'document',
      revisionId: 'revision',
      fileReferenceType: 'LEGACY_LOCAL_PATH',
      fileAccessibility: 'ACCESSIBLE',
      observedChecksum: 'observed',
      classification: 'RELEASED_VERIFIED',
      blockers: [],
      proposedChanges: { release: true },
    };
    const snapshot = buildReconciliationSnapshot({
      phase: 'BEFORE',
      policyVersion: 'policy',
      provenance: 'LEGACY_MIGRATION_VERIFIED',
      eventId: 'event',
      actionResult: 'PENDING',
      assessment,
      document: {
        id: 'document',
        document_number: ' QMS-1 ',
        document_type: 'SOP',
        department: 'Quality',
        lifecycle_status: 'DRAFT',
        status: 'approved',
        current_version: '1.0',
        file_path: 'C:\\Users\\secret\\source.pdf?token=credential',
      },
      revision: {
        id: 'revision',
        document_id: 'document',
        version_number: '1.0',
        revision_sequence: 1,
        lifecycle_status: 'APPROVED',
        status: 'approved',
        file_path: 'C:\\Users\\secret\\source.pdf?token=credential',
        file_checksum: 'stored',
        checksum_status: 'VERIFIED',
        media_type: 'application/pdf',
        file_size: 10,
      },
      approvals: [
        { id: 'approval', revision_id: 'revision', decision: 'APPROVED' },
      ],
      numberRegistry: {
        id: 'registry',
        normalized_number: 'QMS-1',
        display_number: 'QMS-1',
        status: 'ACTIVE',
      },
      acceptedEvidence: [
        {
          id: 'evidence',
          type: 'LEGACY_APPROVAL_EVIDENCE',
          confirmedAt: '2020-01-01',
        },
      ],
    });
    expect(snapshot).toMatchObject({
      decisionSource: 'DETERMINISTIC_LEGACY_RECONCILIATION',
      document: { id: 'document', normalizedNumber: 'QMS-1' },
      revision: {
        id: 'revision',
        storedChecksum: 'stored',
        observedChecksum: 'observed',
      },
      classification: 'RELEASED_VERIFIED',
      blockers: [],
      eventIdentity: 'event',
    });
    expect(snapshot.fileIdentity.basename).toBe('source.pdf');
    expect(containsUnsafeReconciliationPath(snapshot)).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('credential');
    expect(JSON.stringify(snapshot)).not.toContain('C:\\\\Users');
  });
});
