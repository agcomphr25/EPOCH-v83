import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = fs.readFileSync(
  path.join(
    root,
    '.github/workflows/p2-traveler-authority-postgres-certification.yml'
  ),
  'utf8'
);
const preservation = fs.readFileSync(
  path.join(root, 'server/__tests__/p2V2LegacyPreservationPostgres.test.ts'),
  'utf8'
);
const continuation = fs.readFileSync(
  path.join(root, 'server/__tests__/p2V2LegacyContinuationPostgres.test.ts'),
  'utf8'
);

describe('P2 traveler-authority disposable PostgreSQL harness', () => {
  it('uses only a workflow-local PostgreSQL service and no secrets', () => {
    expect(workflow).toContain('image: postgres:16.4');
    expect(workflow).toContain('@127.0.0.1:5432/epoch_p2_v2_certification');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toMatch(/prod(uction)?[_-].*database/i);
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('reuses the supported schema and safe-migration architecture', () => {
    expect(workflow).toContain(
      'drizzle-kit push --force --config drizzle.app.config.ts'
    );
    expect(workflow).toContain('npm run maintenance:safe-migrations');
    expect(workflow).toContain('pg_dump "$DATABASE_URL" --schema-only');
    expect(workflow).toContain('diff --unified');
  });

  it('runs existing lifecycle, legacy preservation, and continuation suites', () => {
    for (const suite of [
      'p2V2PostgresCertification.test.ts',
      'p2V2PilotPostgresCertification.test.ts',
      'p2V2LegacyPreservationPostgres.test.ts',
      'p2V2LegacyContinuationPostgres.test.ts',
    ])
      expect(workflow).toContain(suite);
    expect(workflow).toContain('--no-file-parallelism');
  });

  it('retains deterministic historical row and checksum comparison', () => {
    expect(preservation).toContain('snapshotTables');
    expect(preservation).toContain('legacy_snapshot_before_sha256');
    expect(preservation).toContain('legacy_snapshot_after_sha256');
    expect(preservation).toContain('assertSnapshotsEqual(before, after)');
    expect(continuation).toContain('structuredSnapshot');
    expect(continuation).toContain('changed outside its allowlist');
  });

  it('requires explicit isolated certification before running a future migration test', () => {
    expect(workflow).toContain(
      'P2_TRAVELER_AUTHORITY_POSTGRES_CERTIFICATION: isolated_test'
    );
    expect(workflow).toContain(
      "hashFiles('migrations/0294_p2_traveler_authority_foundation.sql')"
    );
  });

  it('keeps every proposed runtime feature disabled by default', () => {
    for (const flag of [
      'P2_V2_TRAVELER_AUTHORITY_FOUNDATION_ENABLED',
      'P2_V2_TRAVELER_COVERAGE_ENABLED',
      'P2_V2_FROZEN_ROUTING_TRAVELERS_ENABLED',
    ]) {
      expect(workflow).toContain(`test -z "\${${flag}:-}"`);
      expect(workflow).not.toMatch(new RegExp(`${flag}:\\s*['\"]?true`, 'i'));
    }
  });
});
