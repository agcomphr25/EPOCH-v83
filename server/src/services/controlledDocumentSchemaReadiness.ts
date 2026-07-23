import { sql } from 'drizzle-orm';
import { db } from '../../db';

export const requiredControlledDocumentMigration = '0209_master_document_control_hardening.sql';
export const requiredControlledDocumentTables = [
  'controlled_documents',
  'document_version_history',
  'controlled_document_number_registry',
  'controlled_document_revision_approvals',
] as const;

export class ControlledDocumentSchemaNotReadyError extends Error {
  code = 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY';
  constructor(public missingObjects: string[]) {
    super('Required Master Document Register lifecycle migration has not completed.');
  }
}

let ready = false;
export async function assertControlledDocumentSchemaReady(client: Pick<typeof db, 'execute'> = db) {
  if (client === db && ready) return;
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
  const rows = (((result as any)?.rows ?? result) || []) as Array<{ object_name?: string }>;
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
  if (client === db) ready = true;
}
