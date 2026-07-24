import { pool } from '../../db';

export const requiredEcnMigration =
  'migrations/0215_engineering_change_notices.sql';

const requiredObjects = [
  'engineering_change_orders',
  'engineering_change_notice_revisions',
  'engineering_change_notice_affected_items',
  'engineering_change_step_impacts',
  'engineering_change_implementation_actions',
  'engineering_change_verification_records',
  'engineering_change_notice_approvals',
  'engineering_change_notice_attachments',
  'engineering_change_notice_events',
  'engineering_change_notice_legacy_reconciliation',
];

export class EcnSchemaNotReadyError extends Error {
  readonly code = 'ENGINEERING_CHANGE_NOTICE_SCHEMA_NOT_READY';
  constructor(readonly missingObjects: string[]) {
    super(
      `Engineering Change Notice schema is not ready: ${missingObjects.join(', ')}`
    );
  }
}

export async function assertEcnSchemaReady() {
  const rows = await pool.query(
    `SELECT name FROM unnest($1::text[]) AS name
      WHERE to_regclass('public.' || name) IS NULL`,
    [requiredObjects]
  );
  const missing = rows.map((row: any) => String(row.name));
  if (missing.length) throw new EcnSchemaNotReadyError(missing);
}
