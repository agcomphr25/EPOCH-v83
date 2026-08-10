import { describe, expect, it } from 'vitest';

import {
  buildRecoveryInventory,
  checksumRecoveryBytes,
  hashRecoveryValue,
  isControlledDocumentRecoveryExplicitlyEnabledValue,
  normalizeRecoveryDocumentCode,
  sanitizeRecoveryFilename,
  sanitizeRecoverySourceProvenance,
  sanitizeRecoverySupportingEvidence,
  titlesMateriallyConflict,
  validateRecoveryUpload,
  type RecoveryDocumentFacts,
  type RecoveryRevisionFacts,
  type RecoverySourceRow,
} from '../src/services/controlledDocumentRecoveryService';

const document = (
  patch: Partial<RecoveryDocumentFacts> = {}
): RecoveryDocumentFacts => ({
  id: '11111111-1111-4111-8111-111111111111',
  documentNumber: 'PT Doc 1',
  documentName: 'Paint Process Control',
  lifecycleStatus: 'DRAFT',
  status: 'draft',
  currentRevisionId: '22222222-2222-4222-8222-222222222222',
  currentReleasedRevisionId: null,
  workingDraftRevisionId: '22222222-2222-4222-8222-222222222222',
  filePath: '/assets/documents/paint.pdf',
  ...patch,
});

const revision = (
  patch: Partial<RecoveryRevisionFacts> = {}
): RecoveryRevisionFacts => ({
  id: '22222222-2222-4222-8222-222222222222',
  documentId: '11111111-1111-4111-8111-111111111111',
  versionNumber: '1.0',
  lifecycleStatus: 'DRAFT',
  filePath: '/assets/documents/paint.pdf',
  fileChecksum: null,
  checksumStatus: 'PENDING_BACKFILL',
  ...patch,
});

const source = (patch: Partial<RecoverySourceRow> = {}): RecoverySourceRow => ({
  documentCode: 'PT Doc 1',
  title: 'Paint Process Control',
  sourceType: 'GOOGLE_DRIVE_PROVENANCE',
  sourceUrl: 'https://drive.google.com/file/d/abc123456789/view?usp=sharing',
  driveFileId: 'abc123456789',
  ...patch,
});

describe('controlled-document source recovery matching and byte intake', () => {
  it('enables execution only for exact lowercase true', () => {
    expect(isControlledDocumentRecoveryExplicitlyEnabledValue('true')).toBe(
      true
    );
    for (const value of ['TRUE', 'True', '1', 'yes', '', undefined])
      expect(isControlledDocumentRecoveryExplicitlyEnabledValue(value)).toBe(
        false
      );
  });

  it('normalizes exact document codes without inventing missing codes', () => {
    expect(normalizeRecoveryDocumentCode('  pt   Doc  1 ')).toBe('PT DOC 1');
    expect(normalizeRecoveryDocumentCode('')).toBe('');
  });

  it('accepts equivalent titles and blocks material conflicts', () => {
    expect(
      titlesMateriallyConflict(
        'Paint Process-Control (Current)',
        'Paint Process Control Current'
      )
    ).toBe(false);
    expect(
      titlesMateriallyConflict('Paint Process', 'Antenna Packet Diagram')
    ).toBe(true);
  });

  it('strips mutable query and fragment tokens from provenance URLs', () => {
    expect(sanitizeRecoverySourceProvenance(source())).toEqual({
      sourceType: 'GOOGLE_DRIVE_PROVENANCE',
      sourceUrl: 'https://drive.google.com/file/d/abc123456789/view',
      driveFileId: 'abc123456789',
    });
  });

  it.each([
    'file:///etc/passwd',
    'C:\\Windows\\win.ini',
    '\\\\server\\share\\file.pdf',
    'https://example.test/%2e%2e/secret.pdf',
    'https://user:secret@example.test/file.pdf',
    'https://example.test/%E0%A4%A',
  ])('rejects unsafe or malformed source provenance %s', (value) => {
    expect(() =>
      sanitizeRecoverySourceProvenance({
        sourceType: 'OTHER_VERIFIED_SOURCE',
        sourceUrl: value,
      })
    ).toThrow();
  });

  it.each([
    '../file.pdf',
    '..\\file.pdf',
    '/absolute.pdf',
    'C:\\absolute.pdf',
    '\\\\server\\share.pdf',
    '%2e%2e%2ffile.pdf',
    '%252e%252e%255cfile.pdf',
    '%E0%A4%A.pdf',
    'bad\0name.pdf',
  ])('rejects unsafe original filenames %s', (value) => {
    expect(() => sanitizeRecoveryFilename(value)).toThrow(/unsafe/i);
  });

  it('calculates the checksum from the exact uploaded bytes', () => {
    const bytes = Buffer.from('%PDF-1.7\nexact authoritative bytes');
    const checked = validateRecoveryUpload({
      fileName: 'authoritative.pdf',
      mediaType: 'application/pdf',
      size: bytes.length,
      bytes,
    });
    expect(checked.checksum).toBe(checksumRecoveryBytes(bytes));
    expect(checked.checksum).toHaveLength(64);
  });

  it('rejects unsupported editable types and mismatched PDF signatures', () => {
    const editable = Buffer.from('editable');
    expect(() =>
      validateRecoveryUpload({
        fileName: 'source.docx',
        mediaType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: editable.length,
        bytes: editable,
      })
    ).toThrow(/immutable PDF/i);
    expect(() =>
      validateRecoveryUpload({
        fileName: 'fake.pdf',
        mediaType: 'application/pdf',
        size: editable.length,
        bytes: editable,
      })
    ).toThrow(/signature/i);
  });

  it.each([
    ['image/png', 'source.png'],
    ['image/jpeg', 'source.jpg'],
    ['image/tiff', 'source.tiff'],
  ])('rejects a false %s image signature', (mediaType, fileName) => {
    const falseImage = Buffer.from('not an immutable image');
    expect(() =>
      validateRecoveryUpload({
        fileName,
        mediaType,
        size: falseImage.length,
        bytes: falseImage,
      })
    ).toThrow(/signature/i);
  });

  it('rejects changed and oversized byte counts', () => {
    const bytes = Buffer.from('%PDF-small');
    expect(() =>
      validateRecoveryUpload({
        fileName: 'changed.pdf',
        mediaType: 'application/pdf',
        size: bytes.length + 1,
        bytes,
      })
    ).toThrow(/byte count/i);
  });

  it('classifies a unique matching source as ready or awaiting approval', () => {
    const [row] = buildRecoveryInventory({
      documents: [document()],
      revisions: [revision()],
      sourceRows: [source()],
    });
    expect(row.blockers).toEqual([]);
    expect(row.category).toBe('AWAITING_APPROVAL');
    expect(row.existingFileClassification).toBe('LEGACY_DEPLOYMENT_PATH');
  });

  it('blocks duplicate EPOCH codes including known conflict-shaped records', () => {
    const duplicate = document({
      id: '33333333-3333-4333-8333-333333333333',
      currentRevisionId: null,
      workingDraftRevisionId: null,
      documentName: 'Different historical title',
    });
    const rows = buildRecoveryInventory({
      documents: [document(), duplicate],
      revisions: [revision()],
      sourceRows: [source()],
    });
    expect(rows.every((row) => row.category === 'DUPLICATE_CODE')).toBe(true);
    expect(rows[0].blockers).toContain(
      'Multiple EPOCH records use this normalized document code'
    );
  });

  it('allows only the Quality-selected authoritative record after disposition', () => {
    const duplicate = document({
      id: '33333333-3333-4333-8333-333333333333',
      currentRevisionId: null,
      workingDraftRevisionId: null,
    });
    const rows = buildRecoveryInventory({
      documents: [document(), duplicate],
      revisions: [revision()],
      sourceRows: [source()],
      dispositions: [
        {
          normalizedDocumentCode: 'PT DOC 1',
          authoritativeDocumentId: document().id,
        },
      ],
    });
    expect(rows[0].blockers).not.toContain(
      'Multiple EPOCH records use this normalized document code'
    );
    expect(rows[1].blockers).toContain(
      'Multiple EPOCH records use this normalized document code'
    );
  });

  it('blocks duplicate master-list codes even when titles match', () => {
    const [row] = buildRecoveryInventory({
      documents: [document()],
      revisions: [revision()],
      sourceRows: [
        source(),
        source({ sourceUrl: 'https://example.test/copy' }),
      ],
    });
    expect(row.category).toBe('DUPLICATE_CODE');
    expect(row.blockers).toContain(
      'The source inventory contains this document code more than once'
    );
  });

  it('keeps a missing-code source row unmatched and blocked', () => {
    const rows = buildRecoveryInventory({
      documents: [document()],
      revisions: [revision()],
      sourceRows: [
        source({ documentCode: '', title: 'Antenna Cover packet diagram' }),
      ],
    });
    const unmatched = rows.find((row) => row.documentId === null);
    expect(unmatched?.category).toBe('MANUAL_REVIEW_REQUIRED');
    expect(unmatched?.blockers).toContain(
      'The source row has no document code'
    );
  });

  it('blocks materially conflicting source and EPOCH titles', () => {
    const [row] = buildRecoveryInventory({
      documents: [document()],
      revisions: [revision()],
      sourceRows: [source({ title: 'Antenna Cover packet diagram' })],
    });
    expect(row.category).toBe('MANUAL_REVIEW_REQUIRED');
    expect(row.blockers).toContain(
      'The source title materially conflicts with the EPOCH title'
    );
  });

  it('blocks a cross-document current revision pointer', () => {
    const [row] = buildRecoveryInventory({
      documents: [document()],
      revisions: [
        revision({ documentId: '33333333-3333-4333-8333-333333333333' }),
      ],
      sourceRows: [source()],
    });
    expect(row.blockers).toContain(
      'The current revision pointer does not belong to this document'
    );
  });

  it('blocks a cross-document working draft revision pointer', () => {
    const crossDocumentRevision = revision({
      id: '44444444-4444-4444-8444-444444444444',
      documentId: '33333333-3333-4333-8333-333333333333',
    });
    const [row] = buildRecoveryInventory({
      documents: [
        document({ workingDraftRevisionId: crossDocumentRevision.id }),
      ],
      revisions: [revision(), crossDocumentRevision],
      sourceRows: [source()],
    });
    expect(row.blockers).toContain(
      'The working draft revision pointer does not belong to this document'
    );
  });

  it('recognizes an exact managed released revision as viewable', () => {
    const releasedRevision = revision({
      lifecycleStatus: 'RELEASED',
      filePath: '/objects/immutable/released.pdf',
      fileChecksum: 'a'.repeat(64),
      checksumStatus: 'VERIFIED',
    });
    const [row] = buildRecoveryInventory({
      documents: [
        document({
          lifecycleStatus: 'RELEASED',
          currentReleasedRevisionId: releasedRevision.id,
          workingDraftRevisionId: null,
        }),
      ],
      revisions: [releasedRevision],
      sourceRows: [],
    });
    expect(row.category).toBe('RELEASED_VIEWABLE');
    expect(row.recommendedAction).toBe('No recovery action required');
  });

  it('changes the preview identity when source or document state changes', () => {
    const initial = hashRecoveryValue({
      source: source(),
      document: document(),
    });
    const changedSource = hashRecoveryValue({
      source: source({ driveFileId: 'different123456' }),
      document: document(),
    });
    const changedPointer = hashRecoveryValue({
      source: source(),
      document: document({ currentRevisionId: null }),
    });
    expect(changedSource).not.toBe(initial);
    expect(changedPointer).not.toBe(initial);
  });

  it('keeps snapshot hashes stable across jsonb key reordering', () => {
    expect(hashRecoveryValue({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashRecoveryValue({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it('sanitizes supporting evidence and rejects secrets, URLs, and paths', () => {
    expect(
      sanitizeRecoverySupportingEvidence({
        ticket: ' QMS-123 ',
        observations: [' exact title confirmed '],
      })
    ).toEqual({ ticket: 'QMS-123', observations: ['exact title confirmed'] });
    for (const evidence of [
      { sessionToken: 'secret' },
      { source: 'https://example.test/signed?token=secret' },
      { file: 'C:\\sensitive\\source.pdf' },
      { object: '/objects/private/source.pdf' },
    ]) {
      expect(() => sanitizeRecoverySupportingEvidence(evidence)).toThrow();
    }
  });
});
