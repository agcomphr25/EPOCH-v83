import fs from 'node:fs';
import path from 'node:path';

import { Pool, type PoolClient } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const databaseUrl = new URL(connectionString);
const disposableDatabases = new Set([
  '/epoch_p2_v2_certification',
  '/epoch_p2_v2_synthetic_pilot',
  '/epoch_part_spec_certification',
  '/epoch_0253_certification',
]);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  !disposableDatabases.has(databaseUrl.pathname)
) {
  throw new Error(
    `Refusing non-disposable database ${databaseUrl.hostname}${databaseUrl.pathname}`
  );
}

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'migrations/0253_void_duplicate_epoch_validation_packages.sql'
  ),
  'utf8'
);
const pool = new Pool({ connectionString });
let client: PoolClient;
let schema: string;

const childTables = [
  'qms_epoch_validation_intended_use_revisions',
  'qms_epoch_validation_intended_use_functions',
  'qms_epoch_validation_responsibilities',
  'qms_epoch_validation_requirements',
  'qms_epoch_validation_risks',
  'qms_epoch_validation_plans',
  'qms_epoch_validation_protocols',
  'qms_epoch_validation_executions',
  'qms_epoch_validation_evidence',
  'qms_epoch_validation_defects',
  'qms_epoch_validation_approvals',
  'qms_epoch_validation_snapshots',
  'qms_epoch_validation_periodic_reviews',
] as const;
const targetNumbers = Array.from(
  { length: 13 },
  (_, index) => `ESV-2026-${String(index + 2).padStart(4, '0')}`
);

async function createFixtureSchema() {
  await client.query(`
    CREATE TABLE qms_epoch_validation_packages (
      id text PRIMARY KEY,
      package_number text NOT NULL UNIQUE,
      title text NOT NULL,
      system_name text NOT NULL,
      validation_type text NOT NULL,
      status text NOT NULL,
      production_version text NOT NULL,
      commit_or_release_identifier text,
      production_deployment_date date,
      validation_environment text NOT NULL,
      production_environment_reference text NOT NULL,
      database_provider text NOT NULL,
      hosting_provider text NOT NULL,
      software_owner_employee_id integer,
      quality_owner_employee_id integer,
      validation_lead_employee_id integer,
      planned_start_date date NOT NULL,
      planned_completion_date date NOT NULL,
      actual_completion_date date,
      reason_for_validation text NOT NULL,
      previous_approved_package_id text,
      superseded_package_id text,
      audit_readiness_assessment_id text,
      notes text,
      revision integer NOT NULL DEFAULT 1,
      row_version integer NOT NULL DEFAULT 1,
      locked_at timestamptz,
      created_by_user_id integer NOT NULL,
      created_by_display_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_by_user_id integer NOT NULL,
      updated_by_display_name text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE qms_epoch_validation_events (
      id bigserial PRIMARY KEY,
      package_id text NOT NULL REFERENCES qms_epoch_validation_packages(id),
      entity_type text NOT NULL,
      entity_id text,
      action text NOT NULL,
      actor_user_id integer NOT NULL,
      actor_display_name text NOT NULL,
      actor_role text NOT NULL,
      previous_value jsonb,
      new_value jsonb,
      reason text,
      package_revision integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const table of childTables) {
    await client.query(`
      CREATE TABLE ${table} (
        id bigserial PRIMARY KEY,
        package_id text NOT NULL REFERENCES qms_epoch_validation_packages(id),
        evidence text
      )
    `);
  }
}

type PackageOverrides = {
  status?: string;
  title?: string;
  revision?: number;
  rowVersion?: number;
  actualCompletionDate?: string | null;
  locked?: boolean;
};

async function insertPackage(
  packageNumber: string,
  overrides: PackageOverrides = {}
) {
  await client.query(
    `INSERT INTO qms_epoch_validation_packages (
       id, package_number, title, system_name, validation_type, status,
       production_version, commit_or_release_identifier,
       production_deployment_date, validation_environment,
       production_environment_reference, database_provider, hosting_provider,
       software_owner_employee_id, quality_owner_employee_id,
       validation_lead_employee_id, planned_start_date,
       planned_completion_date, actual_completion_date, reason_for_validation,
       notes, revision, row_version, locked_at, created_by_user_id,
       created_by_display_name, updated_by_user_id, updated_by_display_name
     ) VALUES (
       $1, $1, $2, 'EPOCH', 'CORRECTIVE_REVALIDATION', $3,
       '2026.08', 'commit-safe', DATE '2026-08-01', 'validation',
       'production', 'PostgreSQL', 'host', 10, 11, 12,
       DATE '2026-08-01', DATE '2026-08-31', $4,
       'Correct duplicate creation response handling', 'historical package',
       $5, $6, CASE WHEN $7 THEN now() ELSE NULL END,
       101, 'Original Creator', 101, 'Original Creator'
     )`,
    [
      packageNumber,
      overrides.title ?? 'EPOCH Validation 2026.08',
      overrides.status ?? 'DRAFT',
      overrides.actualCompletionDate ?? null,
      overrides.revision ?? 1,
      overrides.rowVersion ?? 1,
      overrides.locked ?? false,
    ]
  );
}

async function seedExactDraftSet() {
  await insertPackage('ESV-2026-0001');
  for (const packageNumber of targetNumbers) {
    await insertPackage(packageNumber);
  }
}

async function runMigration() {
  await client.query(migration);
}

async function expectMigrationFailure(message: RegExp) {
  await client.query('SAVEPOINT migration_attempt');
  let caught: unknown;
  try {
    await runMigration();
  } catch (error) {
    caught = error;
  }
  await client.query('ROLLBACK TO SAVEPOINT migration_attempt');
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toMatch(message);
}

async function targetState() {
  return client.query(
    `SELECT package_number, status, revision, row_version, locked_at,
            updated_at, updated_by_display_name
     FROM qms_epoch_validation_packages
     WHERE package_number = ANY($1::text[])
     ORDER BY package_number`,
    [targetNumbers]
  );
}

beforeEach(async () => {
  client = await pool.connect();
  schema = `esv_0253_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}, public`);
  await createFixtureSchema();
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

afterAll(async () => {
  await pool.end();
});

describe('migration 0253 PostgreSQL state classification', () => {
  it('passes on an empty fresh database with no changes', async () => {
    await runMigration();
    expect((await targetState()).rowCount).toBe(0);
  });

  it('passes on a schema-only database with no seeded users or packages', async () => {
    await expect(runMigration()).resolves.toBeUndefined();
    expect(
      (
        await client.query(
          'SELECT count(*)::int count FROM qms_epoch_validation_events'
        )
      ).rows[0].count
    ).toBe(0);
  });

  it('passes when unrelated packages exist but no historical candidates match', async () => {
    await insertPackage('ESV-2026-0999');
    await insertPackage('ESV-2026-00020');
    await runMigration();
    expect(
      (
        await client.query(
          "SELECT status FROM qms_epoch_validation_packages WHERE package_number='ESV-2026-0999'"
        )
      ).rows[0].status
    ).toBe('DRAFT');
    expect(
      (
        await client.query(
          "SELECT status FROM qms_epoch_validation_packages WHERE package_number='ESV-2026-00020'"
        )
      ).rows[0].status
    ).toBe('DRAFT');
  });

  it('voids the exact safe duplicate set and appends one event per target', async () => {
    await seedExactDraftSet();
    await runMigration();
    expect(
      (await targetState()).rows.every((row) => row.status === 'VOID_DUPLICATE')
    ).toBe(true);
    expect(
      (
        await client.query(
          "SELECT count(*)::int count FROM qms_epoch_validation_events WHERE action='PACKAGE_VOIDED_DUPLICATE'"
        )
      ).rows[0].count
    ).toBe(13);
  });

  it('preserves the authoritative package and its historical evidence', async () => {
    await seedExactDraftSet();
    await client.query(
      `INSERT INTO qms_epoch_validation_requirements(package_id, evidence)
       VALUES ('ESV-2026-0001', 'authoritative evidence')`
    );
    await runMigration();
    const authoritative = await client.query(
      "SELECT status, revision FROM qms_epoch_validation_packages WHERE package_number='ESV-2026-0001'"
    );
    expect(authoritative.rows[0]).toEqual({ status: 'DRAFT', revision: 1 });
    expect(
      (
        await client.query(
          "SELECT evidence FROM qms_epoch_validation_requirements WHERE package_id='ESV-2026-0001'"
        )
      ).rows[0].evidence
    ).toBe('authoritative evidence');
  });

  it('preserves append-only creation evidence while adding one cleanup event', async () => {
    await seedExactDraftSet();
    await client.query(
      `
      INSERT INTO qms_epoch_validation_events (
        package_id, entity_type, action, actor_user_id, actor_display_name,
        actor_role, package_revision
      )
      SELECT id, 'PACKAGE', 'PACKAGE_CREATED', 101, 'Original Creator',
             'VALIDATION_AUTHOR', 1
      FROM qms_epoch_validation_packages
      WHERE package_number = ANY($1::text[])
    `,
      [targetNumbers]
    );
    await runMigration();
    const eventCounts = await client.query(`
      SELECT action, count(*)::int count
      FROM qms_epoch_validation_events
      GROUP BY action
      ORDER BY action
    `);
    expect(eventCounts.rows).toEqual([
      { action: 'PACKAGE_CREATED', count: 13 },
      { action: 'PACKAGE_VOIDED_DUPLICATE', count: 13 },
    ]);
  });

  it('is idempotent on second execution without duplicate audit evidence', async () => {
    await seedExactDraftSet();
    await runMigration();
    const firstRows = (await targetState()).rows;
    const firstEvents = (
      await client.query(
        'SELECT count(*)::int count FROM qms_epoch_validation_events'
      )
    ).rows[0].count;
    await runMigration();
    expect((await targetState()).rows).toEqual(firstRows);
    expect(
      (
        await client.query(
          'SELECT count(*)::int count FROM qms_epoch_validation_events'
        )
      ).rows[0].count
    ).toBe(firstEvents);
  });

  it('recognizes an already-completed state as a no-op', async () => {
    await seedExactDraftSet();
    await runMigration();
    await expect(runMigration()).resolves.toBeUndefined();
    expect((await targetState()).rows.every((row) => row.revision === 2)).toBe(
      true
    );
  });

  it('fails closed on an unexpected partial target set before mutation', async () => {
    await insertPackage('ESV-2026-0001');
    await insertPackage('ESV-2026-0002');
    await expectMigrationFailure(/AMBIGUOUS_STOP.*found 1/);
    expect((await targetState()).rows[0].status).toBe('DRAFT');
  });

  it('fails closed when multiple authoritative payload matches exist', async () => {
    await seedExactDraftSet();
    await insertPackage('ESV-2026-0000');
    await expectMigrationFailure(
      /expected exactly one authoritative payload match.*found 2/
    );
    expect(
      (await targetState()).rows.every((row) => row.status === 'DRAFT')
    ).toBe(true);
  });

  it('fails closed on an unsafe lifecycle without changing any target', async () => {
    await seedExactDraftSet();
    await client.query(
      "UPDATE qms_epoch_validation_packages SET status='APPROVED_FOR_INTENDED_USE' WHERE package_number='ESV-2026-0007'"
    );
    await expectMigrationFailure(
      /state AMBIGUOUS_STOP: target lifecycle is unsafe/
    );
    expect(
      (await targetState()).rows.filter(
        (row) => row.status === 'VOID_DUPLICATE'
      )
    ).toHaveLength(0);
  });

  it('completes a mixed exact set and writes events only for remaining drafts', async () => {
    await seedExactDraftSet();
    await client.query(`
      UPDATE qms_epoch_validation_packages
      SET status = 'VOID_DUPLICATE', locked_at = now(), revision = 2,
          row_version = 2,
          updated_by_display_name = 'migration 0253 (user-authorized duplicate cleanup)'
      WHERE package_number = 'ESV-2026-0002'
    `);
    await client.query(`
      INSERT INTO qms_epoch_validation_events (
        package_id, entity_type, action, actor_user_id, actor_display_name,
        actor_role, previous_value, new_value, reason, package_revision
      ) VALUES (
        'ESV-2026-0002', 'PACKAGE', 'PACKAGE_VOIDED_DUPLICATE', 101,
        'migration 0253 (user-authorized duplicate cleanup)',
        'SYSTEM_MAINTENANCE', '"DRAFT"', '"VOID_DUPLICATE"',
        'authorized cleanup', 2
      )
    `);
    const existing = (
      await client.query(
        "SELECT updated_at FROM qms_epoch_validation_packages WHERE package_number='ESV-2026-0002'"
      )
    ).rows[0];
    await runMigration();
    expect(
      (await targetState()).rows.every((row) => row.status === 'VOID_DUPLICATE')
    ).toBe(true);
    expect(
      (
        await client.query(
          "SELECT count(*)::int count FROM qms_epoch_validation_events WHERE action='PACKAGE_VOIDED_DUPLICATE'"
        )
      ).rows[0].count
    ).toBe(13);
    expect(
      (
        await client.query(
          "SELECT updated_at FROM qms_epoch_validation_packages WHERE package_number='ESV-2026-0002'"
        )
      ).rows[0]
    ).toEqual(existing);
  });

  it('fails closed when all targets exist without retained 0001', async () => {
    for (const packageNumber of targetNumbers) {
      await insertPackage(packageNumber);
    }
    const before = (await targetState()).rows;
    await expectMigrationFailure(/retained authoritative package.*missing/);
    expect((await targetState()).rows).toEqual(before);
  });

  it('fails closed when a draft has edit or lifecycle evidence', async () => {
    await seedExactDraftSet();
    await client.query(
      "UPDATE qms_epoch_validation_packages SET row_version=2 WHERE package_number='ESV-2026-0008'"
    );
    await expectMigrationFailure(/lifecycle or edit evidence/);
    expect(
      (await targetState()).rows.every((row) => row.status === 'DRAFT')
    ).toBe(true);
  });

  it('rejects different intended-use payloads rather than guessing duplicates', async () => {
    await seedExactDraftSet();
    await client.query(
      "UPDATE qms_epoch_validation_packages SET title='Different intended validation' WHERE package_number='ESV-2026-0009'"
    );
    await expectMigrationFailure(/payloads do not exactly match/);
    expect(
      (await targetState()).rows.every((row) => row.status === 'DRAFT')
    ).toBe(true);
  });

  it('rolls back completely and preserves child evidence after an ambiguous failure', async () => {
    await seedExactDraftSet();
    await client.query(
      `INSERT INTO qms_epoch_validation_approvals(package_id, evidence)
       VALUES ('ESV-2026-0010', 'approved evidence')`
    );
    const before = (await targetState()).rows;
    await expectMigrationFailure(/authored validation or lifecycle records/);
    expect((await targetState()).rows).toEqual(before);
    expect(
      (
        await client.query(
          "SELECT evidence FROM qms_epoch_validation_approvals WHERE package_id='ESV-2026-0010'"
        )
      ).rows[0].evidence
    ).toBe('approved evidence');
    expect(
      (
        await client.query(
          'SELECT count(*)::int count FROM qms_epoch_validation_events'
        )
      ).rows[0].count
    ).toBe(0);
  });

  it.each(childTables)(
    'fails closed and rolls back authored content in %s',
    async (table) => {
      await seedExactDraftSet();
      await client.query(
        `INSERT INTO ${table}(package_id, evidence) VALUES ($1, 'authored')`,
        ['ESV-2026-0002']
      );
      const before = (await targetState()).rows;
      await expectMigrationFailure(/authored validation or lifecycle records/);
      expect((await targetState()).rows).toEqual(before);
      expect(
        (await client.query(`SELECT count(*)::int count FROM ${table}`)).rows[0]
          .count
      ).toBe(1);
    }
  );

  it('rejects contradictory completed audit evidence without mutation', async () => {
    await seedExactDraftSet();
    await runMigration();
    await client.query(`
      UPDATE qms_epoch_validation_events
      SET actor_role = 'UNAUTHORIZED_ACTOR'
      WHERE package_id = 'ESV-2026-0002'
        AND action = 'PACKAGE_VOIDED_DUPLICATE'
    `);
    const before = (await targetState()).rows;
    await expectMigrationFailure(/exact duplicate-void migration evidence/);
    expect((await targetState()).rows).toEqual(before);
    expect(
      (
        await client.query(
          "SELECT count(*)::int count FROM qms_epoch_validation_events WHERE action='PACKAGE_VOIDED_DUPLICATE'"
        )
      ).rows[0].count
    ).toBe(13);
  });

  it('serializes concurrent executions and writes one cleanup event per target', async () => {
    await seedExactDraftSet();
    await client.query('COMMIT');
    const second = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}, public`);
      await second.query(`SET search_path TO ${schema}, public`);
      await Promise.all([client.query(migration), second.query(migration)]);
      expect(
        (
          await client.query(
            "SELECT count(*)::int count FROM qms_epoch_validation_events WHERE action='PACKAGE_VOIDED_DUPLICATE'"
          )
        ).rows[0].count
      ).toBe(13);
    } finally {
      second.release();
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.query('BEGIN');
    }
  });

  it('rolls back every package update when audit insertion faults', async () => {
    await seedExactDraftSet();
    await client.query(`
      CREATE FUNCTION reject_cleanup_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'synthetic audit fault';
      END $$;
      CREATE TRIGGER reject_cleanup_event
      BEFORE INSERT ON qms_epoch_validation_events
      FOR EACH ROW EXECUTE FUNCTION reject_cleanup_event()
    `);
    const before = (await targetState()).rows;
    await expectMigrationFailure(/synthetic audit fault/);
    expect((await targetState()).rows).toEqual(before);
    expect(
      (
        await client.query(
          "SELECT count(*)::int count FROM qms_epoch_validation_events WHERE action='PACKAGE_VOIDED_DUPLICATE'"
        )
      ).rows[0].count
    ).toBe(0);
  });

  it('allows later registered migration work after an empty-state no-op', async () => {
    await runMigration();
    await client.query(
      'CREATE TABLE later_registered_migration_marker(id integer PRIMARY KEY)'
    );
    expect(
      (
        await client.query(
          "SELECT to_regclass('later_registered_migration_marker') IS NOT NULL present"
        )
      ).rows[0].present
    ).toBe(true);
  });
});
