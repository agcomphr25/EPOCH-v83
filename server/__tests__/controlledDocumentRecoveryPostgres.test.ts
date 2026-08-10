import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const storageState = vi.hoisted(() => ({
  bytes: Buffer.from('%PDF-1.7\nrecovery certification bytes\n%%EOF'),
  returnedBytes: null as Buffer | null,
  uploadFailure: false,
  deleteFailure: false,
  deleted: [] as string[],
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/services/fileStorageProvider', () => {
  const provider = {
    name: 'replit' as const,
    uploadBuffer: vi.fn(async ({ entityId }: { entityId: string }) => {
      if (storageState.uploadFailure) throw new Error('OBJECT_UPLOAD_FAILED');
      return `/objects/recovery-certification/${entityId}/source.pdf`;
    }),
    downloadBuffer: vi.fn(async () =>
      Buffer.from(storageState.returnedBytes || storageState.bytes)
    ),
    deleteObject: vi.fn(async (objectPath: string) => {
      storageState.deleted.push(objectPath);
      if (storageState.deleteFailure) throw new Error('OBJECT_DELETE_FAILED');
    }),
  };
  return {
    getFileStorageProvider: () => provider,
    getFileStorageProviderForObjectPath: () => provider,
  };
});

vi.mock('../src/services/auditLedgerService', () => ({
  recordAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
    storageState.audits.push(event);
    return {
      id: 1,
      sequenceNumber: 1,
      rowHash: 'a',
      prevHash: 'b',
      payloadHash: 'c',
    };
  }),
}));

import { pgPool } from '../db';
import controlledDocumentRecoveryRoutes, {
  executeControlledDocumentRecovery,
} from '../src/routes/controlledDocumentRecovery';
import {
  assertControlledDocumentRecoverySchemaReady,
  ControlledDocumentRecoverySchemaNotReadyError,
} from '../src/services/controlledDocumentRecoverySchemaReadiness';
import {
  checksumRecoveryBytes,
  CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
  hashRecoveryValue,
  normalizeRecoveryDocumentCode,
} from '../src/services/controlledDocumentRecoveryService';

const migrationFiles = [
  '0245_controlled_document_legacy_reconciliation.sql',
  '0254_controlled_document_reconciliation_certification_controls.sql',
  '0260_controlled_document_source_recovery.sql',
];
const actor = { id: 1, username: 'recovery-cert-admin', role: 'ADMIN' };
const sessionToken = 'recovery-cert-session';
const deniedSessionToken = 'recovery-denied-session';
const app = express();
app.use(express.json());
app.use('/api/controlled-documents/recovery', controlledDocumentRecoveryRoutes);

type Fixture = {
  documentId: string;
  revisionId: string;
  previewId: string;
  importId: string;
  documentNumber: string;
  checksum: string;
};

async function applyMigrations() {
  for (const file of migrationFiles) {
    const sql = await fs.readFile(
      path.join(process.cwd(), 'migrations', file),
      'utf8'
    );
    await pgPool.query(sql);
  }
}

async function createBaseSchema() {
  await pgPool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (
      id serial PRIMARY KEY,
      username text NOT NULL UNIQUE,
      password_hash text,
      role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE user_sessions (
      id serial PRIMARY KEY,
      session_token text NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      username text NOT NULL,
      expires_at timestamptz NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      last_credential_verified_at timestamptz
    );
    CREATE TABLE perm_roles (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE
    );
    CREATE TABLE perm_capabilities (
      id serial PRIMARY KEY,
      key text NOT NULL UNIQUE,
      description text,
      category text
    );
    CREATE TABLE perm_role_capabilities (
      role_id integer NOT NULL REFERENCES perm_roles(id) ON DELETE RESTRICT,
      capability_id integer NOT NULL REFERENCES perm_capabilities(id) ON DELETE RESTRICT,
      UNIQUE(role_id, capability_id)
    );
    CREATE TABLE perm_user_overrides (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      capability_id integer NOT NULL REFERENCES perm_capabilities(id) ON DELETE RESTRICT,
      effect text NOT NULL
    );
    CREATE TABLE controlled_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_number text NOT NULL,
      document_name text NOT NULL,
      document_type text NOT NULL,
      department text NOT NULL,
      category text,
      description text,
      current_version text NOT NULL DEFAULT '1.0',
      status text NOT NULL DEFAULT 'draft',
      lifecycle_status text NOT NULL DEFAULT 'DRAFT',
      lifecycle_reason text,
      current_revision_id uuid,
      current_released_revision_id uuid,
      working_draft_revision_id uuid,
      number_control_status text NOT NULL DEFAULT 'RESERVED',
      effective_date date,
      expiration_date date,
      retention_length text,
      document_owner text,
      file_path text,
      classification text NOT NULL DEFAULT 'internal',
      access_rule text NOT NULL DEFAULT 'authenticated',
      mfa_required boolean NOT NULL DEFAULT false,
      download_tracking_required boolean NOT NULL DEFAULT true,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE document_version_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE RESTRICT,
      version_number text NOT NULL,
      revision_sequence integer NOT NULL DEFAULT 1,
      lifecycle_status text NOT NULL DEFAULT 'DRAFT',
      change_description text,
      change_type text,
      file_path text,
      file_name text,
      media_type text,
      file_size integer,
      file_checksum text,
      checksum_status text NOT NULL DEFAULT 'PENDING_BACKFILL',
      status text NOT NULL,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      approved_by text,
      approved_at timestamptz,
      revision_reason text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_date date,
      expiration_date date
    );
    CREATE TABLE controlled_document_number_registry (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      normalized_number text NOT NULL UNIQUE,
      display_number text NOT NULL,
      controlled_document_id uuid REFERENCES controlled_documents(id) ON DELETE RESTRICT,
      status text NOT NULL DEFAULT 'RESERVED',
      conflict_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pgPool.query(
    `INSERT INTO users(id,username,password_hash,role)
     VALUES(1,$1,'not-a-secret','ADMIN')`,
    [actor.username]
  );
  await pgPool.query(
    `INSERT INTO user_sessions(
       session_token,user_id,username,expires_at,is_active,last_credential_verified_at)
     VALUES($1,1,$2,now()+interval '2 hours',true,now())`,
    [sessionToken, actor.username]
  );
  await pgPool.query(
    `INSERT INTO users(id,username,password_hash,role)
     VALUES(2,'recovery-denied','not-a-secret','RECOVERY_DENIED');
     INSERT INTO user_sessions(
       session_token,user_id,username,expires_at,is_active,last_credential_verified_at)
     VALUES('recovery-denied-session',2,'recovery-denied',now()+interval '2 hours',true,now())`
  );
}

async function createFixture(options?: {
  documentNumber?: string;
  expectedChecksum?: string | null;
}): Promise<Fixture> {
  const documentNumber =
    options?.documentNumber || `REC-${randomUUID()}`.toUpperCase();
  const documentResult = await pgPool.query(
    `INSERT INTO controlled_documents(
       document_number,document_name,document_type,department,status,lifecycle_status,
       number_control_status,created_by)
     VALUES($1,'Recovery certification','PROCEDURE','Quality','draft','DRAFT','RESERVED',$2)
     RETURNING *`,
    [documentNumber, actor.username]
  );
  const document = documentResult.rows[0];
  const revisionResult = await pgPool.query(
    `INSERT INTO document_version_history(
       document_id,version_number,revision_sequence,lifecycle_status,status,created_by,
       file_path,file_name,media_type,file_size,file_checksum,checksum_status,metadata)
     VALUES($1,'1.0',1,'DRAFT','draft',$2,'assets/documents/legacy.pdf','legacy.pdf',
       'application/pdf',10,NULL,'PENDING_BACKFILL','{}'::jsonb) RETURNING *`,
    [document.id, actor.username]
  );
  const revision = revisionResult.rows[0];
  await pgPool.query(
    `UPDATE controlled_documents
     SET current_revision_id=$1,working_draft_revision_id=$1 WHERE id=$2`,
    [revision.id, document.id]
  );
  await pgPool.query(
    `INSERT INTO controlled_document_number_registry(
       normalized_number,display_number,controlled_document_id,status)
     VALUES($1,$1,$2,'RESERVED')`,
    [normalizeRecoveryDocumentCode(documentNumber), document.id]
  );
  const currentDocument = (
    await pgPool.query('SELECT * FROM controlled_documents WHERE id=$1', [
      document.id,
    ])
  ).rows[0];
  const snapshot = {
    document: {
      id: currentDocument.id,
      documentNumber: currentDocument.document_number,
      normalizedDocumentCode: normalizeRecoveryDocumentCode(
        currentDocument.document_number
      ),
      title: currentDocument.document_name,
      lifecycleStatus: currentDocument.lifecycle_status,
      compatibilityStatus: currentDocument.status,
      currentVersion: currentDocument.current_version,
      currentRevisionId: currentDocument.current_revision_id,
      workingDraftRevisionId: currentDocument.working_draft_revision_id,
      currentReleasedRevisionId: currentDocument.current_released_revision_id,
      numberControlStatus: currentDocument.number_control_status,
      updatedAt: currentDocument.updated_at,
    },
    revision: {
      id: revision.id,
      documentId: revision.document_id,
      versionNumber: revision.version_number,
      revisionSequence: revision.revision_sequence,
      lifecycleStatus: revision.lifecycle_status,
      compatibilityStatus: revision.status,
      fileChecksum: revision.file_checksum,
      checksumStatus: revision.checksum_status,
      createdAt: revision.created_at,
    },
    matchingEpochDocumentIds: [document.id],
    matchingSourceCount: 1,
    dispositionId: null,
  };
  const source = {
    documentCode: documentNumber,
    normalizedDocumentCode: normalizeRecoveryDocumentCode(documentNumber),
    title: currentDocument.document_name,
    sourceType: 'DIRECT_UPLOAD',
    sourceUrl: null,
    driveFileId: null,
    mutableReferenceIsProvenanceOnly: true,
  };
  const previewHash = hashRecoveryValue({
    policyVersion: CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
    source,
    document: snapshot,
    blockers: [],
    recommendedAction: 'UPLOAD_EXACT_AUTHORITATIVE_BYTES',
  });
  const previewResult = await pgPool.query(
    `INSERT INTO controlled_document_recovery_previews(
      preview_hash,policy_version,normalized_document_code,controlled_document_id,revision_id,
      source_snapshot,document_snapshot,blockers,recommended_action,actor_user_id,actor_snapshot,expires_at)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,'UPLOAD_EXACT_AUTHORITATIVE_BYTES',
       1,$8::jsonb,now()+interval '1 hour') RETURNING id`,
    [
      previewHash,
      CONTROLLED_DOCUMENT_RECOVERY_POLICY_VERSION,
      normalizeRecoveryDocumentCode(documentNumber),
      document.id,
      revision.id,
      JSON.stringify(source),
      JSON.stringify(snapshot),
      JSON.stringify(actor),
    ]
  );
  const checksum = checksumRecoveryBytes(storageState.bytes);
  const importResult = await pgPool.query(
    `INSERT INTO controlled_document_recovery_imports(
      preview_id,controlled_document_id,revision_id,idempotency_key,request_identity_hash,
      storage_object_path,storage_provider,original_filename,media_type,file_size,file_checksum,
      expected_checksum,source_type,source_provenance,status,actor_user_id,actor_snapshot,reason,staged_at)
     VALUES($1,$2,$3,$4,$5,'/objects/recovery-certification/exact.pdf','replit','source.pdf',
       'application/pdf',$6,$7,$8,'DIRECT_UPLOAD',$9::jsonb,'STAGED',1,$10::jsonb,
       'Exact authoritative file recovery certification',now()) RETURNING id`,
    [
      previewResult.rows[0].id,
      document.id,
      revision.id,
      `stage-${randomUUID()}`,
      hashRecoveryValue({ documentId: document.id, checksum }),
      storageState.bytes.length,
      checksum,
      options?.expectedChecksum === undefined
        ? checksum
        : options.expectedChecksum,
      JSON.stringify({
        sourceType: 'DIRECT_UPLOAD',
        sourceUrl: null,
        driveFileId: null,
      }),
      JSON.stringify(actor),
    ]
  );
  return {
    documentId: document.id,
    revisionId: revision.id,
    previewId: previewResult.rows[0].id,
    importId: importResult.rows[0].id,
    documentNumber,
    checksum,
  };
}

function execute(
  fixture: Fixture,
  key = `execute-${randomUUID()}`,
  overrides = {}
) {
  return executeControlledDocumentRecovery({
    importId: fixture.importId,
    executionAction: 'CURRENT_APPROVAL_WORKFLOW',
    revisionValue: '1.1',
    idempotencyKey: key,
    reason: 'Attach exact authoritative bytes for independent approval',
    actor,
    sessionToken,
    ...overrides,
  });
}

beforeAll(async () => {
  const database = (await pgPool.query('SELECT current_database() name'))
    .rows[0].name;
  if (!String(database).includes('mdr_recovery')) {
    throw new Error(
      `Refusing destructive certification setup on database ${database}`
    );
  }
  process.env.CONTROLLED_DOCUMENT_RECOVERY_ENABLED = 'true';
  await pgPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await createBaseSchema();
  await applyMigrations();
});

beforeEach(() => {
  storageState.returnedBytes = null;
  storageState.uploadFailure = false;
  storageState.deleteFailure = false;
  storageState.deleted.length = 0;
  storageState.audits.length = 0;
});

afterAll(async () => {
  delete process.env.CONTROLLED_DOCUMENT_RECOVERY_ENABLED;
  await pgPool.end();
});

describe('controlled-document source recovery PostgreSQL certification', () => {
  it('replays migration 0260 and certifies the complete schema contract', async () => {
    await pgPool.query(`
      ALTER TABLE controlled_document_recovery_previews
        DROP CONSTRAINT controlled_document_recovery_preview_hash_format;
      ALTER TABLE controlled_document_recovery_imports
        DROP CONSTRAINT controlled_document_recovery_import_checksum_format,
        DROP CONSTRAINT controlled_document_recovery_import_expected_checksum_format,
        DROP CONSTRAINT controlled_document_recovery_import_size_positive,
        DROP CONSTRAINT controlled_document_recovery_import_status_allowed,
        DROP CONSTRAINT controlled_document_recovery_import_source_type_allowed;
      ALTER TABLE controlled_document_recovery_events
        DROP CONSTRAINT controlled_document_recovery_event_checksum_format;
      ALTER TABLE controlled_document_recovery_dispositions
        DROP CONSTRAINT controlled_document_recovery_disposition_allowed;
    `);
    await applyMigrations();
    await expect(
      assertControlledDocumentRecoverySchemaReady()
    ).resolves.toBeUndefined();
  });

  it('fails readiness for a partial schema and is repaired by idempotent replay', async () => {
    await pgPool.query(
      'DROP TRIGGER controlled_document_recovery_events_append_only ON controlled_document_recovery_events'
    );
    await expect(
      assertControlledDocumentRecoverySchemaReady()
    ).rejects.toBeInstanceOf(ControlledDocumentRecoverySchemaNotReadyError);
    await applyMigrations();
    await expect(
      assertControlledDocumentRecoverySchemaReady()
    ).resolves.toBeUndefined();
  });

  it('fails readiness for a same-name index with the wrong columns', async () => {
    await pgPool.query(`
      DROP INDEX controlled_document_recovery_imports_status_idx;
      CREATE INDEX controlled_document_recovery_imports_status_idx
        ON controlled_document_recovery_imports(created_at, status);
    `);
    await expect(
      assertControlledDocumentRecoverySchemaReady()
    ).rejects.toMatchObject({
      missingObjects: expect.arrayContaining([
        'controlled_document_recovery_imports_status_idx:invalid_definition',
      ]),
    });
    await pgPool.query(
      'DROP INDEX controlled_document_recovery_imports_status_idx'
    );
    await applyMigrations();
    await expect(
      assertControlledDocumentRecoverySchemaReady()
    ).resolves.toBeUndefined();
  });

  it('enforces append-only previews, events, and dispositions', async () => {
    const fixture = await createFixture();
    await expect(
      pgPool.query(
        'DELETE FROM controlled_document_recovery_previews WHERE id=$1',
        [fixture.previewId]
      )
    ).rejects.toThrow(/append.only/i);
    const disposition = await pgPool.query(
      `INSERT INTO controlled_document_recovery_dispositions(
       normalized_document_code,authoritative_document_id,related_document_ids,disposition,
       supporting_evidence,actor_user_id,actor_snapshot,reason)
       VALUES($1,$2,$3::jsonb,'MANUAL_REVIEW_REQUIRED','{}'::jsonb,1,$4::jsonb,$5) RETURNING id`,
      [
        fixture.documentNumber,
        fixture.documentId,
        JSON.stringify([fixture.documentId]),
        JSON.stringify(actor),
        'Manual Quality review is required',
      ]
    );
    await expect(
      pgPool.query(
        'UPDATE controlled_document_recovery_dispositions SET reason=$1 WHERE id=$2',
        ['tamper', disposition.rows[0].id]
      )
    ).rejects.toThrow(/append.only/i);
  });

  it('creates a new immutable working revision without releasing or rewriting history', async () => {
    const fixture = await createFixture();
    const result = await execute(fixture);
    expect(result).toMatchObject({
      replayed: false,
      released: false,
      currentApprovalRequired: true,
    });
    const state = await pgPool.query(
      `SELECT d.current_revision_id,d.working_draft_revision_id,d.current_released_revision_id,
       d.lifecycle_status,(SELECT count(*)::int FROM document_version_history WHERE document_id=d.id) revisions,
       (SELECT status FROM controlled_document_recovery_imports WHERE id=$2) import_status
       FROM controlled_documents d WHERE d.id=$1`,
      [fixture.documentId, fixture.importId]
    );
    expect(state.rows[0]).toMatchObject({
      current_revision_id: result.revisionId,
      working_draft_revision_id: result.revisionId,
      current_released_revision_id: null,
      lifecycle_status: 'DRAFT',
      revisions: 2,
      import_status: 'CONSUMED',
    });
    expect(
      (
        await pgPool.query(
          'SELECT file_path FROM document_version_history WHERE id=$1',
          [fixture.revisionId]
        )
      ).rows[0].file_path
    ).toBe('assets/documents/legacy.pdf');
  });

  it('replays identical concurrent execution deterministically', async () => {
    const fixture = await createFixture();
    const key = `execute-${randomUUID()}`;
    const results = await Promise.all([
      execute(fixture, key),
      execute(fixture, key),
    ]);
    expect(new Set(results.map((result) => result.revisionId)).size).toBe(1);
    expect(results.filter((result) => result.replayed).length).toBe(1);
    expect(
      (
        await pgPool.query(
          'SELECT count(*)::int count FROM controlled_document_recovery_events WHERE idempotency_key=$1',
          [`execute:${key}`]
        )
      ).rows[0].count
    ).toBe(1);
  });

  it('rejects cross-document idempotency-key reuse', async () => {
    const first = await createFixture();
    const second = await createFixture();
    const key = `execute-${randomUUID()}`;
    await execute(first, key);
    await expect(execute(second, key)).rejects.toMatchObject({
      code: 'RECOVERY_IDEMPOTENCY_KEY_REUSE',
    });
  });

  it('rolls back all database mutations after an injected failure', async () => {
    const fixture = await createFixture();
    await expect(
      execute(fixture, undefined, { injectFailureAfterMutation: true })
    ).rejects.toThrow('INJECTED_RECOVERY_ROLLBACK');
    const state = await pgPool.query(
      `SELECT (SELECT count(*)::int FROM document_version_history WHERE document_id=$1) revisions,
       (SELECT count(*)::int FROM controlled_document_recovery_events WHERE import_id=$2 AND event_type<>'AUTHORITATIVE_BYTES_STAGED') events,
       (SELECT status FROM controlled_document_recovery_imports WHERE id=$2) import_status`,
      [fixture.documentId, fixture.importId]
    );
    expect(state.rows[0]).toEqual({
      revisions: 1,
      events: 0,
      import_status: 'STAGED',
    });
  });

  it('fails closed when staged bytes change', async () => {
    const fixture = await createFixture();
    storageState.returnedBytes = Buffer.from('%PDF-1.7\nchanged bytes\n%%EOF');
    await expect(execute(fixture)).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    });
    expect(
      (
        await pgPool.query(
          'SELECT count(*)::int count FROM document_version_history WHERE document_id=$1',
          [fixture.documentId]
        )
      ).rows[0].count
    ).toBe(1);
  });

  it('fails closed when document state changes after preview', async () => {
    const fixture = await createFixture();
    await pgPool.query(
      `UPDATE controlled_documents
       SET current_version='9.9',updated_at=now()+interval '1 second' WHERE id=$1`,
      [fixture.documentId]
    );
    await expect(execute(fixture)).rejects.toMatchObject({
      code: 'RECOVERY_SOURCE_CHANGED',
    });
  });

  it('rejects a cross-document revision association after locks are held', async () => {
    const first = await createFixture();
    const second = await createFixture();
    await pgPool.query(
      'UPDATE controlled_document_recovery_imports SET revision_id=$1 WHERE id=$2',
      [second.revisionId, first.importId]
    );
    await expect(execute(first)).rejects.toMatchObject({
      code: 'CROSS_DOCUMENT_REVISION',
    });
  });

  it.each([
    'current_revision_id',
    'working_draft_revision_id',
    'current_released_revision_id',
  ])(
    'rejects a cross-document %s pointer after locks are held',
    async (column) => {
      const first = await createFixture();
      const second = await createFixture();
      await pgPool.query(
        `UPDATE controlled_documents SET ${column}=$1 WHERE id=$2`,
        [second.revisionId, first.documentId]
      );
      await expect(execute(first)).rejects.toMatchObject({
        code: 'CROSS_DOCUMENT_REVISION',
      });
    }
  );

  it('requires a fresh authenticated step-up inside the execution transaction', async () => {
    const fixture = await createFixture();
    await pgPool.query(
      "UPDATE user_sessions SET last_credential_verified_at=now()-interval '31 minutes' WHERE session_token=$1",
      [sessionToken]
    );
    await expect(execute(fixture)).rejects.toMatchObject({
      code: 'STEP_UP_REQUIRED',
    });
    await pgPool.query(
      'UPDATE user_sessions SET last_credential_verified_at=now() WHERE session_token=$1',
      [sessionToken]
    );
  });

  it('uses confirmed Phase 1B evidence without creating a new electronic approval', async () => {
    const fixture = await createFixture();
    const evidence = await pgPool.query(
      `INSERT INTO controlled_document_reconciliation_evidence(
       controlled_document_id,revision_id,evidence_type,evidence_payload,actor_user_id,
       actor_snapshot,reason,confirmed_at,confirmed_by_user_id,confirmation_reason)
       VALUES($1,$2,'LEGACY_APPROVAL_EVIDENCE',$3::jsonb,1,$4::jsonb,$5,now(),1,$5) RETURNING id`,
      [
        fixture.documentId,
        fixture.revisionId,
        JSON.stringify({
          approvalIdentity: 'Historical Quality record',
          approvalDate: '2020-01-02',
          effectiveDate: '2020-01-03',
        }),
        JSON.stringify(actor),
        'Confirmed historical approval evidence',
      ]
    );
    process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED = 'true';
    const result = await execute(fixture, undefined, {
      executionAction: 'LEGACY_RECONCILIATION',
      revisionValue: '1.0-legacy-verified',
      legacyApprovalEvidenceId: evidence.rows[0].id,
    }).finally(() => {
      delete process.env.CONTROLLED_DOCUMENT_RECONCILIATION_ENABLED;
    });
    expect(result).toMatchObject({
      released: true,
      electronicApprovalCreated: false,
    });
    const state = await pgPool.query(
      `SELECT d.current_released_revision_id,r.metadata,
       (SELECT file_path FROM document_version_history WHERE id=$2) original_path
       FROM controlled_documents d JOIN document_version_history r ON r.id=d.current_released_revision_id
       WHERE d.id=$1`,
      [fixture.documentId, fixture.revisionId]
    );
    expect(state.rows[0].current_released_revision_id).toBe(result.revisionId);
    expect(state.rows[0].metadata).toMatchObject({
      provenance: 'LEGACY_MIGRATION_VERIFIED',
      electronicApproval: false,
    });
    expect(state.rows[0].original_path).toBe('assets/documents/legacy.pdf');
  });

  it('does not let the recovery flag alone activate a legacy release', async () => {
    const fixture = await createFixture();
    await expect(
      execute(fixture, undefined, {
        executionAction: 'LEGACY_RECONCILIATION',
        revisionValue: '1.0-legacy-verified',
        legacyApprovalEvidenceId: randomUUID(),
      })
    ).rejects.toMatchObject({
      code: 'CONTROLLED_DOCUMENT_RECONCILIATION_DISABLED',
    });
    expect(
      (
        await pgPool.query(
          'SELECT current_released_revision_id FROM controlled_documents WHERE id=$1',
          [fixture.documentId]
        )
      ).rows[0].current_released_revision_id
    ).toBeNull();
  });

  it('keeps preview read-only and safely compensates for object finalization mismatch', async () => {
    const fixture = await createFixture();
    const before = await pgPool.query(
      'SELECT current_revision_id,current_released_revision_id,updated_at FROM controlled_documents WHERE id=$1',
      [fixture.documentId]
    );
    const preview = await request(app)
      .post('/api/controlled-documents/recovery/preview')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        documentId: fixture.documentId,
        revisionId: fixture.revisionId,
        source: {
          documentCode: fixture.documentNumber,
          title: 'Recovery certification',
          sourceType: 'DIRECT_UPLOAD',
        },
        sourceRows: [
          {
            documentCode: fixture.documentNumber,
            title: 'Recovery certification',
            sourceType: 'DIRECT_UPLOAD',
          },
        ],
      });
    expect(preview.status).toBe(201);
    const after = await pgPool.query(
      'SELECT current_revision_id,current_released_revision_id,updated_at FROM controlled_documents WHERE id=$1',
      [fixture.documentId]
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    storageState.returnedBytes = Buffer.from(
      '%PDF-1.7\nobject changed after upload\n%%EOF'
    );
    const staged = await request(app)
      .post(
        `/api/controlled-documents/recovery/previews/${preview.body.previewId}/stage`
      )
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('previewHash', preview.body.previewHash)
      .field('idempotencyKey', `stage-route-${randomUUID()}`)
      .field('reason', 'Verify compensating deletion on object mismatch')
      .attach('file', storageState.bytes, {
        filename: 'source.pdf',
        contentType: 'application/pdf',
      });
    expect(staged.status).toBe(409);
    expect(staged.body.error).toBe('CHECKSUM_MISMATCH');
    expect(storageState.deleted).toHaveLength(1);
    expect(
      storageState.audits.some(
        (event) =>
          event.eventType === 'CONTROLLED_DOCUMENT_RECOVERY_UPLOAD_DENIED'
      )
    ).toBe(true);
  });

  it('stages exact bytes successfully without exposing the managed object path', async () => {
    const fixture = await createFixture();
    const preview = await request(app)
      .post('/api/controlled-documents/recovery/preview')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        documentId: fixture.documentId,
        revisionId: fixture.revisionId,
        source: {
          documentCode: fixture.documentNumber,
          title: 'Recovery certification',
          sourceType: 'DIRECT_UPLOAD',
        },
        sourceRows: [
          {
            documentCode: fixture.documentNumber,
            title: 'Recovery certification',
            sourceType: 'DIRECT_UPLOAD',
          },
        ],
      });
    const staged = await request(app)
      .post(
        `/api/controlled-documents/recovery/previews/${preview.body.previewId}/stage`
      )
      .set('Authorization', `Bearer ${sessionToken}`)
      .field('previewHash', preview.body.previewHash)
      .field('idempotencyKey', `stage-route-${randomUUID()}`)
      .field('reason', 'Stage exact authoritative bytes for certification')
      .attach('file', storageState.bytes, {
        filename: 'source.pdf',
        contentType: 'application/pdf',
      });
    expect(staged.status).toBe(201);
    expect(staged.body).toMatchObject({
      status: 'STAGED',
      checksum: checksumRecoveryBytes(storageState.bytes),
      managedStorage: true,
      objectPathExposed: false,
    });
    expect(JSON.stringify(staged.body)).not.toContain('/objects/');
    const evidence = await pgPool.query(
      `SELECT i.status,i.storage_object_path,e.event_type,e.checksum
       FROM controlled_document_recovery_imports i
       JOIN controlled_document_recovery_events e ON e.import_id=i.id
       WHERE i.id=$1`,
      [staged.body.importId]
    );
    expect(evidence.rows[0]).toMatchObject({
      status: 'STAGED',
      event_type: 'AUTHORITATIVE_BYTES_STAGED',
      checksum: checksumRecoveryBytes(storageState.bytes),
    });
    expect(evidence.rows[0].storage_object_path).toMatch(/^\/objects\//);
  });

  it('denies recovery inventory without the server-side capability and audits it', async () => {
    const response = await request(app)
      .get('/api/controlled-documents/recovery/inventory')
      .set('Authorization', `Bearer ${deniedSessionToken}`);
    expect(response.status).toBe(403);
    expect(storageState.audits).toContainEqual(
      expect.objectContaining({
        eventType: 'CONTROLLED_DOCUMENT_RECOVERY_ACCESS_DENIED',
        subjectType: 'controlled_document_recovery',
      })
    );
  });
});
