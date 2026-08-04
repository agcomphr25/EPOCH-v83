import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import {
  assertControlledDocumentReconciliationSchemaReady,
  assertControlledDocumentSchemaReady,
  controlledDocumentReconciliationSchemaManifest,
  requiredControlledDocumentReconciliationCorrectiveMigration,
  requiredControlledDocumentReconciliationMigration,
  requiredControlledDocumentTables,
} from '../src/services/controlledDocumentSchemaReadiness';

type CatalogFact = {
  object_kind: string;
  object_name: string;
  parent_name?: string;
  definition?: string;
  data_type?: string;
  enabled?: string;
};
type BaseSchemaClient = Parameters<
  typeof assertControlledDocumentSchemaReady
>[0];
type ReconciliationSchemaClient = Parameters<
  typeof assertControlledDocumentReconciliationSchemaReady
>[0];

const completeReconciliationFacts = () => {
  const manifest = controlledDocumentReconciliationSchemaManifest;
  return [
    ...manifest.tables.map((object_name) => ({
      object_kind: 'table',
      object_name,
    })),
    ...Object.entries(manifest.columns).flatMap(([table, columns]) =>
      columns.map((requirement) => {
        const [column, data_type] = requirement.split(':');
        return {
          object_kind: 'column',
          object_name: `${table}.${column}`,
          data_type,
        };
      })
    ),
    ...manifest.constraints.map((requirement, index) => ({
      object_kind: 'constraint',
      object_name: `constraint_${index}`,
      parent_name: requirement.table,
      definition: requirement.fragments.join(' '),
    })),
    ...manifest.indexes.map((object_name) => ({
      object_kind: 'index',
      object_name,
      definition: object_name.endsWith('_idempotency_uidx')
        ? `CREATE UNIQUE INDEX ${object_name} ON controlled_document_reconciliation_events (idempotency_key)`
        : `CREATE INDEX ${object_name} ON controlled_document_reconciliation_events (controlled_document_id)`,
    })),
    ...manifest.triggers.map((object_name) => ({
      object_kind: 'trigger',
      object_name,
      parent_name: object_name.includes('_events_')
        ? 'controlled_document_reconciliation_events'
        : 'controlled_document_reconciliation_evidence',
      enabled: 'O',
      definition: `CREATE TRIGGER ${object_name} BEFORE UPDATE OR DELETE ON public.${object_name.includes('_events_') ? 'controlled_document_reconciliation_events' : 'controlled_document_reconciliation_evidence'} FOR EACH ROW EXECUTE FUNCTION reject_controlled_document_reconciliation_history_mutation()`,
    })),
    {
      object_kind: 'function',
      object_name: manifest.triggerFunction,
      definition: `CREATE FUNCTION ${manifest.triggerFunction}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CONTROLLED_DOCUMENT_RECONCILIATION_HISTORY_IS_APPEND_ONLY'; END $$`,
    },
  ];
};

describe('controlled document schema readiness', () => {
  it('reports partial schemas explicitly', async () => {
    await expect(
      assertControlledDocumentSchemaReady({
        execute: async () => [{ object_name: 'controlled_documents' }],
      } as unknown as BaseSchemaClient)
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
      } as unknown as BaseSchemaClient)
    ).resolves.toBeUndefined();
  });

  it('requires the complete Phase 1B migration shape without permanent caching', async () => {
    expect(requiredControlledDocumentReconciliationMigration).toBe(
      '0245_controlled_document_legacy_reconciliation.sql'
    );
    expect(requiredControlledDocumentReconciliationCorrectiveMigration).toBe(
      '0253_controlled_document_reconciliation_certification_controls.sql'
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: completeReconciliationFacts() })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      assertControlledDocumentReconciliationSchemaReady({
        query,
      } as unknown as ReconciliationSchemaClient)
    ).resolves.toBeUndefined();
    await expect(
      assertControlledDocumentReconciliationSchemaReady({
        query,
      } as unknown as ReconciliationSchemaClient)
    ).rejects.toMatchObject({
      code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
      missingObjects: expect.arrayContaining([
        'controlled_document_reconciliation_events',
      ]),
    });
  });

  it.each([
    [
      'missing table',
      (rows: CatalogFact[]) =>
        rows.filter(
          (row) =>
            row.object_name !== 'controlled_document_reconciliation_events'
        ),
    ],
    [
      'missing column',
      (rows: CatalogFact[]) =>
        rows.filter(
          (row) =>
            row.object_name !==
            'controlled_document_reconciliation_events.before_snapshot'
        ),
    ],
    [
      'invalid column type',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_name ===
          'controlled_document_reconciliation_evidence.immutable_file_size'
            ? { ...row, data_type: 'integer' }
            : row
        ),
    ],
    [
      'missing foreign key',
      (rows: CatalogFact[]) =>
        rows.filter(
          (row) =>
            !(
              row.object_kind === 'constraint' &&
              row.parent_name === 'controlled_document_reconciliation_events' &&
              String(row.definition).includes('(revision_id)')
            )
        ),
    ],
    [
      'invalid unique constraint',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_kind === 'constraint' &&
          String(row.definition).includes('(idempotency_key)')
            ? { ...row, definition: 'FOREIGN KEY (id)' }
            : row
        ),
    ],
    [
      'missing trigger',
      (rows: CatalogFact[]) =>
        rows.filter(
          (row) =>
            row.object_name !==
            'controlled_document_reconciliation_events_append_only'
        ),
    ],
    [
      'disabled trigger',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_name ===
          'controlled_document_reconciliation_events_append_only'
            ? { ...row, enabled: 'D' }
            : row
        ),
    ],
    [
      'wrong trigger event',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_name ===
          'controlled_document_reconciliation_events_append_only'
            ? {
                ...row,
                definition: String(row.definition).replace(
                  'UPDATE OR DELETE',
                  'INSERT'
                ),
              }
            : row
        ),
    ],
    [
      'trigger attached to wrong table',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_name ===
          'controlled_document_reconciliation_events_append_only'
            ? {
                ...row,
                parent_name: 'controlled_document_reconciliation_evidence',
              }
            : row
        ),
    ],
    [
      'wrong trigger function',
      (rows: CatalogFact[]) =>
        rows.map((row) =>
          row.object_name ===
          'controlled_document_reconciliation_events_append_only'
            ? {
                ...row,
                definition: String(row.definition).replace(
                  'reject_controlled_document_reconciliation_history_mutation',
                  'wrong_function'
                ),
              }
            : row
        ),
    ],
  ])('rejects %s', async (_label, mutate) => {
    await expect(
      assertControlledDocumentReconciliationSchemaReady({
        query: async () => ({ rows: mutate(completeReconciliationFacts()) }),
      } as unknown as ReconciliationSchemaClient)
    ).rejects.toMatchObject({ code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY' });
  });

  it('accepts complete tables, types, constraints, indexes, triggers, and function behavior', async () => {
    await expect(
      assertControlledDocumentReconciliationSchemaReady({
        query: async () => ({ rows: completeReconciliationFacts() }),
      } as unknown as ReconciliationSchemaClient)
    ).resolves.toBeUndefined();
  });
});
