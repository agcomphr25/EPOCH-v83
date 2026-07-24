import { pool } from '../../db';

export const requiredEcrMigration =
  'migrations/0214_engineering_change_requests.sql';

const requiredObjects = [
  'engineering_change_requests',
  'engineering_change_request_revisions',
  'engineering_change_request_affected_items',
  'engineering_change_request_reviews',
  'engineering_change_request_events',
  'engineering_change_request_dispositions',
  'engineering_change_request_legacy_reconciliation',
  'engineering_change_request_attachments',
];

export class EcrSchemaNotReadyError extends Error {
  readonly code = 'ENGINEERING_CHANGE_REQUEST_SCHEMA_NOT_READY';
  constructor(readonly missingObjects: string[]) {
    super(
      `Engineering Change Request schema is not ready: ${missingObjects.join(', ')}`
    );
  }
}

export async function assertEcrSchemaReady() {
  const rows = await pool.query(
    `SELECT name FROM unnest($1::text[]) AS name
      WHERE to_regclass('public.' || name) IS NULL`,
    [requiredObjects]
  );
  const missing = rows.map((row: any) => String(row.name));
  if (missing.length) throw new EcrSchemaNotReadyError(missing);
}
