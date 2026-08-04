import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  assertControlledDocumentReconciliationSchemaReady,
  assertControlledDocumentSchemaReady,
  requiredControlledDocumentReconciliationMigration,
  requiredControlledDocumentReconciliationObjects,
  requiredControlledDocumentTables,
} from '../src/services/controlledDocumentSchemaReadiness';

describe('controlled document schema readiness', () => {
  it('reports partial schemas explicitly', async () => {
    await expect(
      assertControlledDocumentSchemaReady({
        execute: async () => [{ object_name: 'controlled_documents' }],
      } as any)
    ).rejects.toMatchObject({
      code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
      missingObjects: expect.arrayContaining([
        'document_version_history',
        'controlled_documents.lifecycle_status',
      ]),
    });
  });

  it('accepts the complete required shape', async () => {
    const objects = [
      ...requiredControlledDocumentTables,
      'controlled_documents.lifecycle_status',
      'controlled_documents.current_revision_id',
      'controlled_documents.current_released_revision_id',
      'controlled_documents.working_draft_revision_id',
      'controlled_documents.number_control_status',
      'document_version_history.revision_sequence',
      'document_version_history.lifecycle_status',
      'document_version_history.file_checksum',
      'document_version_history.checksum_status',
    ];
    await expect(
      assertControlledDocumentSchemaReady({
        execute: async () => objects.map((object_name) => ({ object_name })),
      } as any)
    ).resolves.toBeUndefined();
  });

  it('requires the complete Phase 1B migration shape without permanent caching', async () => {
    expect(requiredControlledDocumentReconciliationMigration).toBe(
      '0245_controlled_document_legacy_reconciliation.sql'
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: requiredControlledDocumentReconciliationObjects.map(
          (object_name) => ({ object_name })
        ),
      })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      assertControlledDocumentReconciliationSchemaReady({ query } as any)
    ).resolves.toBeUndefined();
    await expect(
      assertControlledDocumentReconciliationSchemaReady({ query } as any)
    ).rejects.toMatchObject({
      code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
      missingObjects: expect.arrayContaining([
        'controlled_document_reconciliation_events',
      ]),
    });
  });
});
