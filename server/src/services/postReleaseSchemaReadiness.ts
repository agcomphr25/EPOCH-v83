import { pgPool } from '../../db';

export const requiredPostReleaseMigration =
  '0216_post_release_design_change_gating.sql';

const required = [
  'design_control_step_generations',
  'engineering_release_attempts',
  'engineering_release_change_evidence',
];
const requiredColumns = [
  ['engineering_releases', 'release_sequence'],
  ['engineering_releases', 'authorizing_ecn_id'],
  ['engineering_releases', 'release_checksum'],
  ['engineering_releases', 'idempotency_fingerprint'],
];

export class PostReleaseSchemaNotReadyError extends Error {
  readonly code = 'POST_RELEASE_CHANGE_SCHEMA_NOT_READY';
  constructor(readonly missingObjects: string[]) {
    super(`Phase 8 schema is missing: ${missingObjects.join(', ')}`);
  }
}

export async function assertPostReleaseSchemaReady() {
  const result = await pgPool.query(
    `SELECT name FROM unnest($1::text[]) AS name
      WHERE to_regclass('public.' || name) IS NULL`,
    [required]
  );
  const columns = await pgPool.query(
    `SELECT requirement
       FROM unnest($1::text[]) AS requirement
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema='public'
           AND c.table_name=split_part(requirement,'.',1)
           AND c.column_name=split_part(requirement,'.',2)
      )`,
    [requiredColumns.map(([table, column]) => `${table}.${column}`)]
  );
  const missing = [
    ...result.rows.map((item) => item.name),
    ...columns.rows.map((item) => item.requirement),
  ];
  if (missing.length) throw new PostReleaseSchemaNotReadyError(missing);
}
