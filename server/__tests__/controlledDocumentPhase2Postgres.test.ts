import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import express from 'express';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgPool } from '../db';
import {
  approveAndReleaseControlledRevision,
  checksumFile,
  ControlledDocumentError,
} from '../src/services/controlledDocumentLifecycleService';
import { assertControlledDocumentPhase2SchemaReady } from '../src/services/controlledDocumentSchemaReadiness';
import controlledDocumentRoutes from '../src/routes/controlledDocuments';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'DATABASE_URL is required for controlled-document Phase 2 PostgreSQL certification'
  );

const bytes = Buffer.from('authoritative controlled document bytes');
const checksum = checksumFile(bytes);
const role = `MDR_PHASE2_CERT_${randomUUID()}`;
const approverUsername = `mdr-approver-${randomUUID()}`;
const sessionToken = `mdr-session-${randomUUID()}`;
const missingStepUpToken = `mdr-missing-step-up-${randomUUID()}`;
const expiredStepUpToken = `mdr-expired-step-up-${randomUUID()}`;
const viewerRole = `MDR_VIEWER_CERT_${randomUUID()}`;
const viewerUsername = `mdr-viewer-${randomUUID()}`;
const viewerSessionToken = `mdr-viewer-session-${randomUUID()}`;
const deniedRole = `MDR_DENIED_CERT_${randomUUID()}`;
const deniedUsername = `mdr-denied-${randomUUID()}`;
const deniedSessionToken = `mdr-denied-session-${randomUUID()}`;
let approverId = 0;
let approverEmployeeId = 0;
let viewerId = 0;
let releasedPdfBytes = Buffer.alloc(0);
let releasedPdfChecksum = '';
const documentAssetRoot = path.resolve(
  process.cwd(),
  'server/src/assets/documents'
);
const releasedPdfName = `mdr-phase2-${randomUUID()}.pdf`;
const releasedPdfReference = `assets/documents/${releasedPdfName}`;
const releasedPdfPath = path.join(documentAssetRoot, releasedPdfName);
const outsidePdfPath = path.resolve(
  documentAssetRoot,
  '..',
  `mdr-phase2-outside-${randomUUID()}.pdf`
);
const symlinkPdfName = `mdr-phase2-link-${randomUUID()}.pdf`;
const symlinkPdfReference = `assets/documents/${symlinkPdfName}`;
const symlinkPdfPath = path.join(documentAssetRoot, symlinkPdfName);

const accessApp = express();
accessApp.use(express.json());
accessApp.use('/api/controlled-documents', controlledDocumentRoutes);

type Fixture = {
  documentId: string;
  revisionId: string;
  documentNumber: string;
};

async function createFixture(
  author = `mdr-author-${randomUUID()}`
): Promise<Fixture> {
  const documentNumber = `MDR-CERT-${randomUUID()}`.toUpperCase();
  const document = await pgPool.query(
    `INSERT INTO controlled_documents
       (document_number, document_name, document_type, department, lifecycle_status,
        status, number_control_status, created_by)
     VALUES ($1, 'Phase 2 certification', 'PROCEDURE', 'Quality', 'DRAFT',
             'draft', 'RESERVED', $2)
     RETURNING id`,
    [documentNumber, author]
  );
  const documentId = document.rows[0].id as string;
  const revision = await pgPool.query(
    `INSERT INTO document_version_history
       (document_id, version_number, revision_sequence, lifecycle_status, status,
        created_by, file_path, file_name, media_type, file_size, file_checksum,
        checksum_status, metadata)
     VALUES ($1, '1.0', 1, 'DRAFT', 'draft', $2, '/objects/mdr-certification',
             'certification.pdf', 'application/pdf', $3, $4, 'VERIFIED', '{}'::jsonb)
     RETURNING id`,
    [documentId, author, bytes.length, checksum]
  );
  const revisionId = revision.rows[0].id as string;
  await pgPool.query(
    `UPDATE controlled_documents
     SET current_revision_id = $1, working_draft_revision_id = $1
     WHERE id = $2`,
    [revisionId, documentId]
  );
  await pgPool.query(
    `INSERT INTO controlled_document_number_registry
       (normalized_number, display_number, controlled_document_id, status)
     VALUES ($1, $1, $2, 'RESERVED')`,
    [documentNumber, documentId]
  );
  return { documentId, revisionId, documentNumber };
}

async function createReleasedRouteFixture(
  fileReference = releasedPdfReference,
  fileChecksum = releasedPdfChecksum,
  lifecycle = 'RELEASED'
) {
  const fixture = await createFixture();
  await pgPool.query(
    `UPDATE document_version_history
     SET lifecycle_status = $1, status = lower($1), file_path = $2,
         file_name = $3, media_type = 'application/pdf', file_size = $4,
         file_checksum = $5, checksum_status = 'VERIFIED'
     WHERE id = $6`,
    [
      lifecycle,
      fileReference,
      path.basename(fileReference),
      releasedPdfBytes.length,
      fileChecksum,
      fixture.revisionId,
    ]
  );
  await pgPool.query(
    `UPDATE controlled_documents
     SET lifecycle_status = 'RELEASED', status = 'approved',
         current_released_revision_id = $1
     WHERE id = $2`,
    [fixture.revisionId, fixture.documentId]
  );
  return fixture;
}

function approve(
  fixture: Fixture,
  idempotencyKey: string,
  reason = 'Independent Quality approval',
  read = async () => bytes
) {
  return approveAndReleaseControlledRevision({
    ...fixture,
    filePath: '/objects/mdr-certification',
    observedChecksum: checksum,
    idempotencyKey,
    reason,
    effectiveDate: '2026-08-05',
    actor: { id: approverId, username: approverUsername, role },
    sessionToken,
    readAuthoritativeBytes: read,
  });
}

async function createRouteApprovalFixture(author?: string) {
  const fixture = await createFixture(author);
  await pgPool.query(
    `UPDATE document_version_history
     SET file_path = $1, file_name = $2, media_type = 'application/pdf',
         file_size = $3, file_checksum = $4, checksum_status = 'VERIFIED'
     WHERE id = $5`,
    [
      releasedPdfReference,
      releasedPdfName,
      releasedPdfBytes.length,
      releasedPdfChecksum,
      fixture.revisionId,
    ]
  );
  return fixture;
}

async function mutationSnapshot(fixture: Fixture) {
  const result = await pgPool.query(
    `SELECT
       document.lifecycle_status AS document_lifecycle,
       document.current_revision_id,
       document.current_released_revision_id,
       document.working_draft_revision_id,
       revision.lifecycle_status AS revision_lifecycle,
       revision.file_checksum,
       registry.status AS number_status,
       registry.conflict_document_ids,
       (SELECT count(*)::int FROM controlled_document_revision_approvals
        WHERE revision_id = $1) AS approvals,
       (SELECT count(*)::int FROM controlled_document_approval_release_events
        WHERE revision_id = $1) AS release_events,
       (SELECT count(*)::int FROM audit_events
        WHERE subject_type = 'controlled_document' AND subject_id = $2::text) AS audits
     FROM controlled_documents document
     JOIN document_version_history revision ON revision.id = $1
     JOIN controlled_document_number_registry registry
       ON registry.controlled_document_id = document.id
     WHERE document.id = $2::uuid`,
    [fixture.revisionId, fixture.documentId]
  );
  return result.rows[0];
}

async function restoreApprovalChecksumSchema() {
  await pgPool.query(
    `ALTER TABLE controlled_document_revision_approvals
       ALTER COLUMN file_checksum DROP NOT NULL`
  );
  await pgPool.query(
    `ALTER TABLE controlled_document_revision_approvals
       ADD COLUMN IF NOT EXISTS checksum_verification_status text`
  );
  await pgPool.query(
    `ALTER TABLE controlled_document_revision_approvals
       ALTER COLUMN checksum_verification_status DROP DEFAULT`
  );
  await pgPool.query(
    `ALTER TABLE controlled_document_revision_approvals
       DROP CONSTRAINT IF EXISTS controlled_document_revision_approvals_checksum_status_check`
  );
  await pgPool.query(
    `ALTER TABLE controlled_document_revision_approvals
       ADD CONSTRAINT controlled_document_revision_approvals_checksum_status_check
       CHECK (
         checksum_verification_status IS NULL
         OR checksum_verification_status IN ('VERIFIED', 'UNAVAILABLE', 'MISMATCH')
       )`
  );
}

async function expectNoPhase2Mutation(fixture: Fixture) {
  const state = await mutationSnapshot(fixture);
  expect(state).toMatchObject({
    current_released_revision_id: null,
    approvals: 0,
    release_events: 0,
  });
}

function approveRoute(
  fixture: Fixture,
  token: string,
  idempotencyKey = randomUUID()
) {
  return request(accessApp)
    .post(`/api/controlled-documents/${fixture.documentId}/approve-and-release`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', idempotencyKey)
    .send({
      revisionId: fixture.revisionId,
      reason: 'Independent authenticated Quality approval',
      effectiveDate: '2026-08-05',
    });
}

function rejectRoute(fixture: Fixture, token = sessionToken) {
  return request(accessApp)
    .post(`/api/controlled-documents/${fixture.documentId}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      revisionId: fixture.revisionId,
      reason: 'Correction required by Quality',
    });
}

beforeAll(async () => {
  process.env.CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED = 'true';
  await fs.mkdir(documentAssetRoot, { recursive: true });
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 160]);
  releasedPdfBytes = Buffer.from(await pdf.save());
  releasedPdfChecksum = checksumFile(releasedPdfBytes);
  await fs.writeFile(releasedPdfPath, releasedPdfBytes);
  await fs.writeFile(outsidePdfPath, releasedPdfBytes);
  await fs.symlink(outsidePdfPath, symlinkPdfPath);
  const employee = await pgPool.query(
    `INSERT INTO employees (name, user_role)
     VALUES ($1, 'EMPLOYEE') RETURNING id`,
    [`Phase 2 approver ${approverUsername}`]
  );
  approverEmployeeId = employee.rows[0].id;
  const capability = await pgPool.query(
    `INSERT INTO perm_capabilities (key, description, category)
     VALUES ('documents.approve', 'Approve controlled documents', 'documents')
     ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key RETURNING id`
  );
  const roleRow = await pgPool.query(
    `INSERT INTO perm_roles (name, description) VALUES ($1, 'Disposable Phase 2 certification role')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [role]
  );
  await pgPool.query(
    `INSERT INTO perm_role_capabilities (role_id, capability_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [roleRow.rows[0].id, capability.rows[0].id]
  );
  await pgPool.query(
    `INSERT INTO perm_capabilities (key, description, category)
     VALUES ('documents.submit', 'Submit controlled documents', 'documents'),
            ('documents.release', 'Release controlled documents', 'documents')
     ON CONFLICT (key) DO NOTHING`
  );
  await pgPool.query(
    `INSERT INTO perm_role_capabilities (role_id, capability_id)
     SELECT $1, id FROM perm_capabilities
     WHERE key IN ('documents.submit', 'documents.release')
     ON CONFLICT DO NOTHING`,
    [roleRow.rows[0].id]
  );
  const viewCapability = await pgPool.query(
    `INSERT INTO perm_capabilities (key, description, category)
     VALUES ('documents.view', 'View controlled documents', 'documents')
     ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key RETURNING id`
  );
  const viewerRoleRow = await pgPool.query(
    `INSERT INTO perm_roles (name, description)
     VALUES ($1, 'Disposable document viewer role') RETURNING id`,
    [viewerRole]
  );
  await pgPool.query(
    `INSERT INTO perm_role_capabilities (role_id, capability_id) VALUES ($1, $2)`,
    [viewerRoleRow.rows[0].id, viewCapability.rows[0].id]
  );
  await pgPool.query(
    `INSERT INTO perm_roles (name, description)
     VALUES ($1, 'Disposable denied viewer role')`,
    [deniedRole]
  );
  const user = await pgPool.query(
    `INSERT INTO users (username, password_hash, role, employee_id)
     VALUES ($1, 'not-a-login-secret', $2, $3) RETURNING id`,
    [approverUsername, role, employee.rows[0].id]
  );
  approverId = user.rows[0].id;
  await pgPool.query(
    `INSERT INTO user_sessions
       (session_token, user_id, username, expires_at, is_active, last_credential_verified_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', true, NOW())`,
    [sessionToken, approverId, approverUsername]
  );
  await pgPool.query(
    `INSERT INTO user_sessions
       (session_token, user_id, username, expires_at, is_active, last_credential_verified_at)
     VALUES ($1, $3, $4, NOW() + INTERVAL '1 hour', true, NULL),
            ($2, $3, $4, NOW() + INTERVAL '1 hour', true, NOW() - INTERVAL '31 minutes')`,
    [missingStepUpToken, expiredStepUpToken, approverId, approverUsername]
  );
  const viewer = await pgPool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, 'not-a-login-secret', $2) RETURNING id`,
    [viewerUsername, viewerRole]
  );
  viewerId = viewer.rows[0].id;
  const denied = await pgPool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, 'not-a-login-secret', $2) RETURNING id`,
    [deniedUsername, deniedRole]
  );
  await pgPool.query(
    `INSERT INTO user_sessions
       (session_token, user_id, username, expires_at, is_active, last_credential_verified_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', true, NOW()),
            ($4, $5, $6, NOW() + INTERVAL '1 hour', true, NOW())`,
    [
      viewerSessionToken,
      viewerId,
      viewerUsername,
      deniedSessionToken,
      denied.rows[0].id,
      deniedUsername,
    ]
  );
});

afterAll(async () => {
  delete process.env.CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED;
  await Promise.allSettled([
    fs.unlink(releasedPdfPath),
    fs.unlink(outsidePdfPath),
    fs.unlink(symlinkPdfPath),
  ]);
  await pgPool.end();
});

describe('controlled-document Phase 2 PostgreSQL 16.4 certification', () => {
  it('certifies the complete Phase 2 schema contract and append-only trigger', async () => {
    await expect(
      assertControlledDocumentPhase2SchemaReady()
    ).resolves.toBeUndefined();
    const fixture = await createFixture();
    const key = randomUUID();
    await approve(fixture, key);
    await expect(
      pgPool.query(
        `UPDATE controlled_document_approval_release_events SET reason = 'tampered' WHERE idempotency_key = $1`,
        [key]
      )
    ).rejects.toThrow(/append-only/i);
    await expect(
      pgPool.query(
        'DELETE FROM controlled_document_approval_release_events WHERE idempotency_key = $1',
        [key]
      )
    ).rejects.toThrow(/append-only/i);
  });

  it('requires nullable approval checksums and the complete truthful status contract', async () => {
    const columns = await pgPool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'controlled_document_revision_approvals'
         AND column_name IN ('file_checksum', 'checksum_verification_status')
       ORDER BY column_name`
    );
    expect(columns.rows).toEqual([
      {
        column_name: 'checksum_verification_status',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'file_checksum',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);
    await expect(
      assertControlledDocumentPhase2SchemaReady()
    ).resolves.toBeUndefined();
  });

  it('fails readiness when approval file_checksum remains NOT NULL', async () => {
    await pgPool.query(
      `ALTER TABLE controlled_document_revision_approvals
       ALTER COLUMN file_checksum SET NOT NULL`
    );
    try {
      await expect(
        assertControlledDocumentPhase2SchemaReady()
      ).rejects.toMatchObject({
        code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
        missingObjects: expect.arrayContaining([
          'column:controlled_document_revision_approvals.file_checksum',
        ]),
      });
    } finally {
      await restoreApprovalChecksumSchema();
    }
  });

  it('fails readiness when checksum verification status is missing', async () => {
    await pgPool.query(
      `ALTER TABLE controlled_document_revision_approvals
       DROP COLUMN checksum_verification_status CASCADE`
    );
    try {
      await expect(
        assertControlledDocumentPhase2SchemaReady()
      ).rejects.toMatchObject({
        code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
        missingObjects: expect.arrayContaining([
          'column:controlled_document_revision_approvals.checksum_verification_status',
          'constraint:controlled_document_revision_approvals.checksum_verification_status',
        ]),
      });
    } finally {
      await restoreApprovalChecksumSchema();
    }
  });

  it('fails readiness for a malformed checksum status default or constraint', async () => {
    await pgPool.query(
      `ALTER TABLE controlled_document_revision_approvals
       DROP CONSTRAINT IF EXISTS controlled_document_revision_approvals_checksum_status_check,
       ALTER COLUMN checksum_verification_status SET DEFAULT 'UNVERIFIED'`
    );
    await pgPool.query(
      `ALTER TABLE controlled_document_revision_approvals
       ADD CONSTRAINT controlled_document_revision_approvals_checksum_status_check
       CHECK (checksum_verification_status IS NULL OR checksum_verification_status = 'VERIFIED')`
    );
    try {
      await expect(
        assertControlledDocumentPhase2SchemaReady()
      ).rejects.toMatchObject({
        code: 'CONTROLLED_DOCUMENT_SCHEMA_NOT_READY',
        missingObjects: expect.arrayContaining([
          'column:controlled_document_revision_approvals.checksum_verification_status',
          'constraint:controlled_document_revision_approvals.checksum_verification_status',
        ]),
      });
    } finally {
      await restoreApprovalChecksumSchema();
    }
  });

  it('returns controlled schema-not-ready before rejection mutation on a partial schema', async () => {
    const fixture = await createFixture();
    await pgPool.query(
      `ALTER TABLE controlled_document_revision_approvals
       ALTER COLUMN file_checksum SET NOT NULL`
    );
    try {
      const response = await rejectRoute(fixture);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('CONTROLLED_DOCUMENT_SCHEMA_NOT_READY');
      await expectNoPhase2Mutation(fixture);
      const state = await mutationSnapshot(fixture);
      expect(state).toMatchObject({
        document_lifecycle: 'DRAFT',
        revision_lifecycle: 'DRAFT',
      });
    } finally {
      await restoreApprovalChecksumSchema();
    }
  });

  it('fails approval before mutation when a required Phase 2 index is missing', async () => {
    const fixture = await createRouteApprovalFixture();
    await pgPool.query(
      'DROP INDEX controlled_document_approval_release_document_idx'
    );
    try {
      const response = await approveRoute(fixture, sessionToken);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('CONTROLLED_DOCUMENT_SCHEMA_NOT_READY');
      await expectNoPhase2Mutation(fixture);
    } finally {
      await pgPool.query(
        `CREATE INDEX controlled_document_approval_release_document_idx
         ON controlled_document_approval_release_events(controlled_document_id, created_at)`
      );
    }
  });

  it('records truthful rejection evidence without fabricating an unavailable checksum', async () => {
    const fixture = await createFixture();
    const response = await rejectRoute(fixture);
    expect(response.status).toBe(200);
    const evidence = await pgPool.query(
      `SELECT decision, file_checksum, checksum_verification_status,
              metadata->>'checksumUnavailableReason' AS unavailable_reason
       FROM controlled_document_revision_approvals
       WHERE revision_id = $1`,
      [fixture.revisionId]
    );
    expect(evidence.rows[0]).toMatchObject({
      decision: 'REJECTED',
      file_checksum: null,
      checksum_verification_status: 'UNAVAILABLE',
    });
    expect(evidence.rows[0].unavailable_reason).toMatch(/unavailable/i);
    const state = await pgPool.query(
      `SELECT lifecycle_status, current_released_revision_id
       FROM controlled_documents WHERE id = $1`,
      [fixture.documentId]
    );
    expect(state.rows[0]).toMatchObject({
      lifecycle_status: 'REJECTED',
      current_released_revision_id: null,
    });
  });

  it('commits approval, release, pointer, approval evidence, and immutable event atomically', async () => {
    const fixture = await createFixture();
    const result = await approve(fixture, randomUUID());
    expect(result.document.lifecycleStatus).toBe('RELEASED');
    expect(result.document.currentReleasedRevisionId).toBe(fixture.revisionId);
    const evidence = await pgPool.query(
      `SELECT count(*)::int AS approvals,
              (SELECT count(*)::int FROM controlled_document_approval_release_events WHERE revision_id = $1) AS events,
              (SELECT actor_id FROM audit_events
               WHERE subject_type = 'controlled_document' AND subject_id = $2
               ORDER BY id DESC LIMIT 1) AS audit_actor_id
       FROM controlled_document_revision_approvals WHERE revision_id = $1`,
      [fixture.revisionId, fixture.documentId]
    );
    expect(evidence.rows[0]).toMatchObject({
      approvals: 1,
      events: 1,
      audit_actor_id: approverEmployeeId,
    });
  });

  it('replays an identical committed request without a second mutation', async () => {
    const fixture = await createFixture();
    const key = randomUUID();
    await approve(fixture, key);
    await approve(fixture, key);
    const count = await pgPool.query(
      'SELECT count(*)::int AS count FROM controlled_document_approval_release_events WHERE idempotency_key = $1',
      [key]
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('serializes simultaneous identical requests into one mutation and one replay', async () => {
    const fixture = await createFixture();
    const key = randomUUID();
    const results = await Promise.all([
      approve(fixture, key),
      approve(fixture, key),
    ]);
    expect(
      results.every((result) => result.document.lifecycleStatus === 'RELEASED')
    ).toBe(true);
    const count = await pgPool.query(
      'SELECT count(*)::int AS count FROM controlled_document_approval_release_events WHERE idempotency_key = $1',
      [key]
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('returns deterministic conflict for a globally reused key with different request identity', async () => {
    const first = await createFixture();
    const second = await createFixture();
    const key = randomUUID();
    await approve(first, key);
    await expect(
      approve(second, key, 'Different request')
    ).rejects.toMatchObject<Partial<ControlledDocumentError>>({
      statusCode: 409,
      code: 'IDEMPOTENCY_KEY_CONFLICT',
    });
    const state = await pgPool.query(
      'SELECT lifecycle_status FROM controlled_documents WHERE id = $1',
      [second.documentId]
    );
    expect(state.rows[0].lifecycle_status).toBe('DRAFT');
  });

  it('rolls back every database mutation when authoritative bytes change after preflight', async () => {
    const fixture = await createFixture();
    await expect(
      approve(fixture, randomUUID(), 'Approval', async () =>
        Buffer.from('changed')
      )
    ).rejects.toMatchObject({
      code: 'AUTHORITATIVE_FILE_CHANGED',
    });
    const state = await pgPool.query(
      `SELECT lifecycle_status, current_released_revision_id,
              (SELECT count(*)::int FROM controlled_document_revision_approvals WHERE revision_id = $1) AS approvals,
              (SELECT count(*)::int FROM controlled_document_approval_release_events WHERE revision_id = $1) AS events
       FROM controlled_documents WHERE id = $2`,
      [fixture.revisionId, fixture.documentId]
    );
    expect(state.rows[0]).toMatchObject({
      lifecycle_status: 'DRAFT',
      current_released_revision_id: null,
      approvals: 0,
      events: 0,
    });
  });

  it('fails stale locked revision state without approval, release, or pointer mutation', async () => {
    const fixture = await createFixture();
    await pgPool.query(
      `UPDATE document_version_history
       SET lifecycle_status = 'IN_REVIEW', status = 'in_review'
       WHERE id = $1`,
      [fixture.revisionId]
    );
    await expect(approve(fixture, randomUUID())).rejects.toMatchObject({
      code: 'ILLEGAL_LIFECYCLE_TRANSITION',
    });
    await expectNoPhase2Mutation(fixture);
    const state = await mutationSnapshot(fixture);
    expect(state).toMatchObject({
      document_lifecycle: 'DRAFT',
      revision_lifecycle: 'IN_REVIEW',
    });
  });

  it('rejects contradictory released revisions and preserves the original pointer', async () => {
    const fixture = await createFixture();
    const released = await pgPool.query(
      `INSERT INTO document_version_history
         (document_id, version_number, revision_sequence, lifecycle_status, status,
          created_by, file_path, file_name, media_type, file_size, file_checksum,
          checksum_status, metadata)
       VALUES ($1, '0.9', 2, 'RELEASED', 'released', 'legacy-quality',
               '/objects/original-release', 'original.pdf', 'application/pdf',
               $2, $3, 'VERIFIED', '{}'::jsonb)
       RETURNING id`,
      [fixture.documentId, bytes.length, checksum]
    );
    await pgPool.query(
      `INSERT INTO document_version_history
         (document_id, version_number, revision_sequence, lifecycle_status, status,
          created_by, file_path, file_name, media_type, file_size, file_checksum,
          checksum_status, metadata)
       VALUES ($1, '0.8', 3, 'RELEASED', 'released', 'legacy-quality',
               '/objects/contradictory-release', 'contradictory.pdf', 'application/pdf',
               $2, $3, 'VERIFIED', '{}'::jsonb)`,
      [fixture.documentId, bytes.length, checksum]
    );
    await pgPool.query(
      `UPDATE controlled_documents
       SET current_released_revision_id = $1
       WHERE id = $2`,
      [released.rows[0].id, fixture.documentId]
    );

    await expect(approve(fixture, randomUUID())).rejects.toMatchObject({
      code: 'CONFLICTING_RELEASED_REVISION',
    });
    const state = await pgPool.query(
      `SELECT current_released_revision_id, lifecycle_status,
              (SELECT count(*)::int FROM controlled_document_revision_approvals
               WHERE revision_id = $1) AS approvals,
              (SELECT count(*)::int FROM controlled_document_approval_release_events
               WHERE revision_id = $1) AS events
       FROM controlled_documents WHERE id = $2`,
      [fixture.revisionId, fixture.documentId]
    );
    expect(state.rows[0]).toMatchObject({
      current_released_revision_id: released.rows[0].id,
      lifecycle_status: 'DRAFT',
      approvals: 0,
      events: 0,
    });
    const original = await pgPool.query(
      `SELECT lifecycle_status, superseded_by_revision_id
       FROM document_version_history WHERE id = $1`,
      [released.rows[0].id]
    );
    expect(original.rows[0]).toMatchObject({
      lifecycle_status: 'RELEASED',
      superseded_by_revision_id: null,
    });
  });

  it('rolls back exact state when an event trigger fails after mutations begin', async () => {
    const fixture = await createFixture();
    const before = await mutationSnapshot(fixture);
    await pgPool.query(
      `CREATE OR REPLACE FUNCTION mdr_phase2_test_fail_release_event()
       RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         RAISE EXCEPTION 'MDR_PHASE2_INJECTED_EVENT_FAILURE';
       END;
       $$`
    );
    await pgPool.query(
      `CREATE TRIGGER mdr_phase2_test_fail_release_event
       AFTER INSERT ON controlled_document_approval_release_events
       FOR EACH ROW EXECUTE FUNCTION mdr_phase2_test_fail_release_event()`
    );
    try {
      await expect(approve(fixture, randomUUID())).rejects.toThrow(
        /MDR_PHASE2_INJECTED_EVENT_FAILURE/
      );
    } finally {
      await pgPool.query(
        `DROP TRIGGER IF EXISTS mdr_phase2_test_fail_release_event
         ON controlled_document_approval_release_events`
      );
      await pgPool.query(
        'DROP FUNCTION IF EXISTS mdr_phase2_test_fail_release_event()'
      );
    }
    const after = await mutationSnapshot(fixture);
    expect(after).toEqual(before);
  });

  it('denies the real approval route without documents.approve and records no mutation', async () => {
    const fixture = await createRouteApprovalFixture();
    const response = await approveRoute(fixture, deniedSessionToken);
    expect(response.status).toBe(403);
    await expectNoPhase2Mutation(fixture);
  });

  it('denies the real approval route when step-up is missing or expired', async () => {
    for (const token of [missingStepUpToken, expiredStepUpToken]) {
      const fixture = await createRouteApprovalFixture();
      const response = await approveRoute(fixture, token);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('STEP_UP_REQUIRED');
      await expectNoPhase2Mutation(fixture);
    }
  });

  it('denies self approval through the real route without lifecycle mutation', async () => {
    const fixture = await createRouteApprovalFixture(approverUsername);
    const response = await approveRoute(fixture, sessionToken);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('SELF_APPROVAL_PROHIBITED');
    await expectNoPhase2Mutation(fixture);
  });

  it('atomically approves and releases through the authenticated route', async () => {
    const fixture = await createRouteApprovalFixture();
    const response = await approveRoute(fixture, sessionToken);
    expect(response.status).toBe(200);
    expect(response.body.document).toMatchObject({
      lifecycleStatus: 'RELEASED',
      currentReleasedRevisionId: fixture.revisionId,
      workingDraftRevisionId: null,
    });
    const state = await mutationSnapshot(fixture);
    expect(state).toMatchObject({
      document_lifecycle: 'RELEASED',
      revision_lifecycle: 'RELEASED',
      current_released_revision_id: fixture.revisionId,
      working_draft_revision_id: null,
      approvals: 1,
      release_events: 1,
      audits: 1,
    });
  });

  it('blocks obsolete approve-only, Submit, and Release routes while Phase 2 is enabled', async () => {
    const fixture = await createRouteApprovalFixture();
    for (const action of ['submit', 'decision', 'release', 'approve']) {
      const response = await request(accessApp)
        .post(`/api/controlled-documents/${fixture.documentId}/${action}`)
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          revisionId: fixture.revisionId,
          decision: 'APPROVED',
          reason: 'Obsolete direct action attempt',
          comment: 'Obsolete direct action attempt',
        });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('PHASE2_OBSOLETE_ACTION');
    }
    await expectNoPhase2Mutation(fixture);
  });

  it('serves the current released revision to an authenticated ordinary viewer and records allowed access', async () => {
    const fixture = await createReleasedRouteFixture();
    const view = await request(accessApp)
      .get(`/api/controlled-documents/${fixture.documentId}/view`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(view.status).toBe(200);
    expect(view.headers['content-type']).toContain('application/pdf');

    const download = await request(accessApp)
      .get(`/api/controlled-documents/${fixture.documentId}/download`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(download.status).toBe(200);
    expect(download.body).toEqual(releasedPdfBytes);

    const logs = await pgPool.query(
      `SELECT action FROM object_access_log
       WHERE document_id = $1 AND user_id = $2 ORDER BY id`,
      [fixture.documentId, viewerUsername]
    );
    expect(logs.rows.map((row) => row.action)).toEqual(['view', 'download']);
  });

  it('denies and logs a valid authenticated user without document-view authority', async () => {
    const fixture = await createReleasedRouteFixture();
    const response = await request(accessApp)
      .get(`/api/controlled-documents/${fixture.documentId}/download`)
      .set('Authorization', `Bearer ${deniedSessionToken}`);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('ACCESS_DENIED');
    const denied = await pgPool.query(
      `SELECT count(*)::int AS count FROM object_access_log
       WHERE document_id = $1 AND user_id = $2 AND action = 'denied'`,
      [fixture.documentId, deniedUsername]
    );
    expect(denied.rows[0].count).toBe(1);
  });

  it('fails closed for unreleased, draft, guessed, and cross-document revision access', async () => {
    const draft = await createFixture();
    const unreleased = await request(accessApp)
      .get(`/api/controlled-documents/${draft.documentId}/download`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(unreleased.status).toBe(409);
    expect(unreleased.body.error).toBe('NO_RELEASED_REVISION');

    const exactDraft = await request(accessApp)
      .get(
        `/api/controlled-documents/${draft.documentId}/revisions/${draft.revisionId}/download`
      )
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(exactDraft.status).toBe(403);
    expect(exactDraft.body.error).toBe('DRAFT_REVISION_ACCESS_DENIED');

    const other = await createReleasedRouteFixture();
    const crossDocument = await request(accessApp)
      .get(
        `/api/controlled-documents/${draft.documentId}/revisions/${other.revisionId}/download`
      )
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(crossDocument.status).toBe(404);

    const guessed = await request(accessApp)
      .get(
        `/api/controlled-documents/${other.documentId}/revisions/${randomUUID()}/download`
      )
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(guessed.status).toBe(404);
  });

  it('supports authorized historical released bytes and audits authenticated path containment denials', async () => {
    const historical = await createReleasedRouteFixture(
      releasedPdfReference,
      releasedPdfChecksum,
      'SUPERSEDED'
    );
    const historicalResponse = await request(accessApp)
      .get(
        `/api/controlled-documents/${historical.documentId}/revisions/${historical.revisionId}/download`
      )
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(historicalResponse.status).toBe(200);

    const unsafeReferences = [
      `assets/documents/../${path.basename(outsidePdfPath)}`,
      `assets/documents/%2e%2e%2f${path.basename(outsidePdfPath)}`,
      `assets/documents/%2e%2e%5c${path.basename(outsidePdfPath)}`,
      `assets/documents/%252e%252e%252f${path.basename(outsidePdfPath)}`,
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      '\\\\server\\share\\secret.pdf',
      `assets\\documents\\..\\${path.basename(outsidePdfPath)}`,
      'assets/documents/%00secret.pdf',
      'assets/documents/%E0%A4%A',
      symlinkPdfReference,
      'https://example.invalid/mutable.pdf',
    ];

    for (const fileReference of unsafeReferences) {
      const fixture = await createReleasedRouteFixture(fileReference);
      for (const endpoint of ['view', 'download']) {
        const response = await request(accessApp)
          .get(`/api/controlled-documents/${fixture.documentId}/${endpoint}`)
          .set('Authorization', `Bearer ${viewerSessionToken}`);
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        const responseEvidence = JSON.stringify(response.body);
        expect(responseEvidence).not.toContain(fileReference);
        expect(responseEvidence).not.toContain(process.cwd());
        expect(response.body).not.toEqual(releasedPdfBytes);
      }
      const denied = await pgPool.query(
        `SELECT count(*)::int AS count FROM object_access_log
         WHERE document_id = $1 AND user_id = $2 AND action = 'denied'`,
        [fixture.documentId, viewerUsername]
      );
      expect(denied.rows[0].count).toBe(2);
    }
  });
});
