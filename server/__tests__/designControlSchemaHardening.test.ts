import { readFileSync } from 'fs';
import { join } from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import {
  criticalMigrationFiles,
  runSafeBootMigrations,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';
import {
  assertDesignControlSchemaReady,
  designControlSchemaNotReadyPayload,
  DesignControlSchemaNotReadyError,
  requiredDesignControlMigrations,
  requiredDesignControlTables,
} from '../src/services/designControlSchemaReadiness';

const root = process.cwd();
const migrationFiles = requiredDesignControlMigrations.map(
  (file) => `migrations/${file}`
);

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalForceDatabaseUrl = process.env.FORCE_DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalForceDatabaseUrl === undefined) {
    delete process.env.FORCE_DATABASE_URL;
  } else {
    process.env.FORCE_DATABASE_URL = originalForceDatabaseUrl;
  }
});

function readRepoFile(path: string) {
  return readFileSync(join(root, path), 'utf-8');
}

function readMigrations() {
  return migrationFiles.map((file) => ({ file, content: readRepoFile(file) }));
}

function captureNames(pattern: RegExp) {
  return readMigrations().flatMap(({ file, content }) =>
    Array.from(content.matchAll(pattern)).map((match) => ({
      file,
      name: match[1],
    }))
  );
}

describe('Design Control schema hardening', () => {
  it('keeps schema-push safety checks aligned with migration 0258', () => {
    const migration = readRepoFile(
      'migrations/0258_design_control_structured_lifecycle.sql'
    );
    const drizzleSchema = readRepoFile(
      'server/designControlStructuredSchema.ts'
    );
    for (const constraint of [
      'dc_project_access_policy_status_ck',
      'dc_project_assignment_role_ck',
      'dc_project_assignment_status_ck',
      'dc_project_assignment_revocation_ck',
      'dc_project_assignment_event_type_ck',
      'dc_structured_version_type_ck',
      'dc_structured_version_status_ck',
      'dc_structured_version_number_ck',
      'dc_structured_decision_value_ck',
      'dc_structured_decision_reason_ck',
      'dc_structured_link_source_type_ck',
      'dc_structured_link_target_type_ck',
      'dc_review_action_status_ck',
      'dc_trace_snapshot_status_ck',
      'dc_final_review_exception_status_ck',
      'dc_final_review_snapshot_status_ck',
    ]) {
      expect(migration).toContain(constraint);
      expect(drizzleSchema).toContain(constraint);
    }
    expect(migration).toContain(
      'coalesce(length(btrim(decision_comment)), 0) > 0'
    );
    expect(drizzleSchema).toContain(
      'coalesce(length(btrim(${table.decisionComment})), 0) > 0'
    );
  });

  it('registers Design Control, Engineering Release, and Engineering Package migrations in order', () => {
    const expected = [...requiredDesignControlMigrations];
    const positions = expected.map((file) => safeMigrationFiles.indexOf(file));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const file of expected) {
      expect(criticalMigrationFiles.has(file)).toBe(true);
    }
  });

  it('covers every required Design Control and Engineering Package table in migrations', () => {
    const tables = new Set(
      captureNames(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi).map(
        (entry) => entry.name
      )
    );

    for (const table of requiredDesignControlTables) {
      expect(tables.has(table)).toBe(true);
    }
  });

  it('does not duplicate table or index definitions across migrations 0189 through 0192', () => {
    const tables = captureNames(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi);
    const indexes = captureNames(/CREATE INDEX IF NOT EXISTS\s+([a-z_]+)/gi);

    for (const entries of [tables, indexes]) {
      const counts = entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.name] = (acc[entry.name] ?? 0) + 1;
        return acc;
      }, {});
      expect(Object.entries(counts).filter(([, count]) => count > 1)).toEqual(
        []
      );
    }
  });

  it('keeps request routes free of schema DDL', () => {
    const routeFiles = [
      'server/src/routes/qmsDesignControl.ts',
      'server/src/routes/engineeringReleases.ts',
    ];
    const ddlPattern = /\b(CREATE TABLE|ALTER TABLE|CREATE INDEX)\b/i;

    for (const file of routeFiles) {
      expect(readRepoFile(file)).not.toMatch(ddlPattern);
    }
  });

  it('returns a structured readiness payload when schema is missing', async () => {
    const client = {
      execute: async () => {
        const error = new Error(
          'relation "design_control_records" does not exist'
        ) as Error & { code: string };
        error.code = '42P01';
        throw error;
      },
    };

    await expect(assertDesignControlSchemaReady(client)).rejects.toMatchObject({
      code: 'DESIGN_CONTROL_SCHEMA_NOT_READY',
      missingObjects: ['design_control_records'],
    });

    const payload = designControlSchemaNotReadyPayload(
      new DesignControlSchemaNotReadyError(['design_control_records'])
    );

    expect(payload).toEqual({
      error: 'DESIGN_CONTROL_SCHEMA_NOT_READY',
      message: 'Required Design Control migrations have not completed.',
      requiredMigrations: [...requiredDesignControlMigrations],
      missingObjects: ['design_control_records'],
    });
  });

  it('allows readiness when required schema SELECT checks succeed', async () => {
    const calls: string[] = [];
    let callNumber = 0;
    const client = {
      execute: async (statement: unknown) => {
        calls.push(String(statement));
        callNumber += 1;
        if (callNumber === requiredDesignControlTables.length + 1) {
          return [
            { column_name: 'authority_status' },
            { column_name: 'designated_authoritative_at' },
            { column_name: 'designated_authoritative_by' },
            { column_name: 'superseded_at' },
            { column_name: 'superseded_by' },
            { column_name: 'supersession_reason' },
            { column_name: 'superseded_by_record_id' },
            { column_name: 'record_version' },
          ];
        }
        if (callNumber === requiredDesignControlTables.length + 2)
          return [{ present: 1 }];
        if (callNumber === requiredDesignControlTables.length + 3) {
          return [
            { conname: 'design_control_records_authority_status_check' },
            { conname: 'design_control_records_superseded_by_record_fk' },
          ];
        }
        if (callNumber === requiredDesignControlTables.length + 4) {
          return [
            { column_name: 'current_content_version_id' },
            { column_name: 'content_version' },
            { column_name: 'approval_mode' },
            { column_name: 'submitted_at' },
            { column_name: 'submitted_by_user_id' },
            { column_name: 'submitted_by_snapshot' },
          ];
        }
        if (callNumber === requiredDesignControlTables.length + 5) {
          return [
            {
              object_name:
                'design_control_step_content_versions_step_version_unique',
            },
            { object_name: 'design_control_step_approvals_valid_slot_unique' },
            { object_name: 'prevent_design_control_step_version_delete' },
            { object_name: 'prevent_design_control_step_approval_delete' },
            { object_name: 'dc_step_approval_assignments_version_slot_uq' },
            { object_name: 'prevent_design_control_assignment_delete' },
          ];
        }
        return [];
      },
    };

    await expect(
      assertDesignControlSchemaReady(client)
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(requiredDesignControlTables.length + 5);
  });

  it('surfaces safe-boot migration startup failures clearly', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.FORCE_DATABASE_URL;

    await expect(runSafeBootMigrations()).rejects.toThrow(
      'Missing required database environment variable: FORCE_DATABASE_URL or DATABASE_URL'
    );
  });
});
