import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { isControlledDocumentPhase2Enabled } from '../src/services/controlledDocumentPhase2Gate';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const root = path.resolve(__dirname, '../..');
const service = fs.readFileSync(
  path.join(root, 'server/src/services/controlledDocumentLifecycleService.ts'),
  'utf8'
);
const routes = fs.readFileSync(
  path.join(root, 'server/src/routes/controlledDocuments.ts'),
  'utf8'
);
const client = fs.readFileSync(
  path.join(root, 'client/src/pages/MasterDocumentRegister.tsx'),
  'utf8'
);
const migrationName = '0256_controlled_document_atomic_approval_release.sql';
const migration = fs.readFileSync(
  path.join(root, 'migrations', migrationName),
  'utf8'
);

describe('controlled document Phase 2 activation containment', () => {
  it('is default-disabled and requires exact true', () => {
    expect(isControlledDocumentPhase2Enabled(undefined)).toBe(false);
    expect(isControlledDocumentPhase2Enabled('TRUE')).toBe(false);
    expect(isControlledDocumentPhase2Enabled('true')).toBe(true);
    expect(routes).not.toContain('CONTROLLED_DOCUMENT_PHASE2_ENABLED');
    expect(migration).not.toContain(
      'CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED'
    );
  });

  it('registers the prospective migration for safe boot without data rewrites', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
    expect(migration).not.toMatch(/UPDATE\s+controlled_documents/i);
    expect(migration).not.toMatch(/UPDATE\s+document_version_history/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration.trimStart().startsWith('-- Prospective')).toBe(true);
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS');
    expect(migration).toContain('DROP TRIGGER IF EXISTS');
  });
});

describe('atomic approve-and-release contract', () => {
  it('locks and revalidates exact current revision, path, and checksum inside one transaction', () => {
    expect(service).toContain('return client.transaction(async (tx) =>');
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain(
      'context.document.currentRevisionId !== revision.id'
    );
    expect(service).toContain(
      'context.document.workingDraftRevisionId !== revision.id'
    );
    expect(service).toContain('revision.filePath !== input.filePath');
    expect(service).toContain(
      'revision.fileChecksum !== input.observedChecksum'
    );
    expect(service).toContain("revision.checksumStatus !== 'VERIFIED'");
  });

  it('records immutable authority evidence and prohibits self approval', () => {
    expect(service).toContain("'SELF_APPROVAL_PROHIBITED'");
    expect(service).toContain('controlledDocumentApprovalReleaseEvents');
    expect(service).toContain(
      "provenance: 'AUTHENTICATED_ATOMIC_APPROVAL_RELEASE'"
    );
    expect(migration).toContain(
      'controlled_document_approval_release_events_append_only'
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(service).toContain('rejectRegisteredControlledRevision');
    expect(service).toContain("lifecycleStatus: 'REJECTED'");
    expect(routes).toMatch(/router\.post\(\s*'\/:id\/reject'/);
  });

  it('uses database-backed idempotency and cross-document fail-closed checks', () => {
    expect(migration).toContain('idempotency_key text NOT NULL UNIQUE');
    expect(migration).toContain('UNIQUE (revision_id)');
    expect(service).toContain("'IDEMPOTENCY_KEY_CONFLICT'");
    expect(service).toContain("'CROSS_DOCUMENT_REVISION'");
    expect(service).toContain("'INVALID_RELEASED_REVISION_POINTER'");
  });

  it('requires server permission, step-up, managed bytes, and schema readiness', () => {
    expect(routes).toMatch(
      /approve-and-release[\s\S]*requirePermission\('documents\.approve'\)[\s\S]*requireStepUp\(\)/
    );
    expect(routes).toContain('assertControlledDocumentPhase2SchemaReady()');
    expect(routes).toContain("'IMMUTABLE_REVISION_FILE_REQUIRED'");
    expect(routes).toContain('getExternalRedirectUrl(revision.filePath)');
    expect(routes).toMatch(
      /router\.post\(\s*'\/:id\/approve',[\s\S]{0,400}requireLegacyLifecycle[\s\S]{0,200}requireStepUp\(\)/
    );
  });
});

describe('truthful gated UI', () => {
  it('removes routine submit and release actions only when Phase 2 is enabled', () => {
    expect(client).toContain('!phase2Enabled &&');
    expect(client).toContain(
      "phase2Enabled ? 'approve-and-release' : 'decision'"
    );
    expect(client).toContain('Registered — awaiting approval');
    expect(client).toContain('Rejected — correction required');
    expect(client).toContain('Historical/legacy — retained');
  });
});
