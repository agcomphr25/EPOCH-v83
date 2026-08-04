import { sql } from 'drizzle-orm';

import { db } from '../../db';

export const requiredControlledDocumentMigration =
  '0209_master_document_control_hardening.sql';
export const requiredControlledDocumentReconciliationMigration =
  '0245_controlled_document_legacy_reconciliation.sql';
export const requiredControlledDocumentReconciliationCorrectiveMigration =
  '0249_controlled_document_reconciliation_certification_controls.sql';
export const requiredControlledDocumentTables = [
  'controlled_documents',
  'document_version_history',
  'controlled_document_number_registry',
  'controlled_document_revision_approvals',
] as const;

export class ControlledDocumentSchemaNotReadyError extends Error {
  code = 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY';
  constructor(public missingObjects: string[]) {
    super(
      'Required Master Document Register lifecycle migration has not completed.'
    );
  }
}

export async function assertControlledDocumentSchemaReady(
  client: Pick<typeof db, 'execute'> = db
) {
  const result = await client.execute(sql`
    SELECT table_name AS object_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'controlled_documents', 'document_version_history',
        'controlled_document_number_registry', 'controlled_document_revision_approvals'
      )
    UNION ALL
    SELECT table_name || '.' || column_name AS object_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'controlled_documents' AND column_name IN (
          'lifecycle_status', 'current_revision_id', 'current_released_revision_id',
          'working_draft_revision_id', 'number_control_status'
        ))
        OR
        (table_name = 'document_version_history' AND column_name IN (
          'revision_sequence', 'lifecycle_status', 'file_checksum', 'checksum_status'
        ))
      )
  `);
  const rows = (((result as any)?.rows ?? result) || []) as Array<{
    object_name?: string;
  }>;
  const present = new Set(rows.map((row) => row.object_name));
  const required = [
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
  const missing = required.filter((object) => !present.has(object));
  if (missing.length) throw new ControlledDocumentSchemaNotReadyError(missing);
}

export const requiredControlledDocumentReconciliationObjects = [
  'controlled_document_reconciliation_previews',
  'controlled_document_reconciliation_events',
  'controlled_document_reconciliation_evidence',
  'controlled_document_reconciliation_events.idempotency_key',
  'controlled_document_reconciliation_events.before_snapshot',
  'controlled_document_reconciliation_events.after_snapshot',
  'controlled_document_reconciliation_evidence.confirmed_at',
  'controlled_document_reconciliation_evidence.confirmed_by_user_id',
  'controlled_document_reconciliation_evidence.immutable_file_media_type',
  'controlled_document_reconciliation_evidence.immutable_file_size',
  'controlled_document_reconciliation_events_idempotency_uidx',
  'controlled_document_reconciliation_events_append_only',
  'controlled_document_reconciliation_evidence_append_only',
] as const;

type QueryClient = {
  query(
    sql: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function assertControlledDocumentReconciliationSchemaReady(
  client: QueryClient
) {
  const result = await client.query(`
    SELECT table_name AS object_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT table_name || '.' || column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT indexname FROM pg_indexes WHERE schemaname='public'
      AND tablename LIKE 'controlled_document_reconciliation_%'
    UNION ALL
    SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_schema='public' AND event_object_table LIKE 'controlled_document_reconciliation_%'
  `);
  const present = new Set(result.rows.map((row) => String(row.object_name)));
  const missing = requiredControlledDocumentReconciliationObjects.filter(
    (name) => !present.has(name)
  );
  if (missing.length)
    throw new ControlledDocumentSchemaNotReadyError([...missing]);
}
