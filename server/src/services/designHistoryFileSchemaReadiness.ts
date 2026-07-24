import { pgPool } from '../../db';

export const requiredDesignHistoryFileMigration =
  '0221_design_history_files.sql';
const required = [
  'design_history_files',
  'design_history_file_versions',
  'design_history_file_items',
  'design_history_file_exports',
  'design_history_file_events',
];
export class DesignHistoryFileSchemaNotReadyError extends Error {
  readonly code = 'DESIGN_HISTORY_FILE_SCHEMA_NOT_READY';
  constructor(readonly missingObjects: string[]) {
    super(
      `Design History File schema is missing: ${missingObjects.join(', ')}`
    );
  }
}
export async function assertDesignHistoryFileSchemaReady() {
  const result = await pgPool.query(
    `SELECT name FROM unnest($1::text[]) name
     WHERE to_regclass('public.' || name) IS NULL`,
    [required]
  );
  if (result.rows.length)
    throw new DesignHistoryFileSchemaNotReadyError(
      result.rows.map((row) => row.name)
    );
}
