import { pgPool } from '../../db';

export const requiredControlledCopyMigration =
  '0217_controlled_printed_copies.sql';
const required = [
  'controlled_printed_copies',
  'controlled_printed_copy_events',
  'controlled_printed_copy_attachments',
  'controlled_printed_copy_legacy_links',
  'controlled_printed_copy_scan_acceptances',
];
export class ControlledCopySchemaNotReadyError extends Error {
  readonly code = 'CONTROLLED_PRINTED_COPY_SCHEMA_NOT_READY';
  constructor(readonly missingObjects: string[]) {
    super(`Controlled-copy schema is missing: ${missingObjects.join(', ')}`);
  }
}
export async function assertControlledCopySchemaReady() {
  const result = await pgPool.query(
    `SELECT name FROM unnest($1::text[]) AS name
      WHERE to_regclass('public.' || name) IS NULL`,
    [required]
  );
  if (result.rows.length)
    throw new ControlledCopySchemaNotReadyError(
      result.rows.map((item) => item.name)
    );
}
