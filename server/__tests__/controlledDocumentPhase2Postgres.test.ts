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

  it('supports authorized historical released bytes and rejects traversal, symlinks, and mutable external references', async () => {
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

    const traversal = await createReleasedRouteFixture(
      `assets/documents/../${path.basename(outsidePdfPath)}`
    );
    const traversalResponse = await request(accessApp)
      .get(`/api/controlled-documents/${traversal.documentId}/download`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(traversalResponse.status).toBe(422);
    expect(traversalResponse.body.error).toBe('FILE_NOT_ACCESSIBLE');

    const symlink = await createReleasedRouteFixture(symlinkPdfReference);
    const symlinkResponse = await request(accessApp)
      .get(`/api/controlled-documents/${symlink.documentId}/download`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(symlinkResponse.status).toBe(422);
    expect(symlinkResponse.body.error).toBe('FILE_NOT_ACCESSIBLE');

    const external = await createReleasedRouteFixture(
      'https://example.invalid/mutable.pdf'
    );
    const externalResponse = await request(accessApp)
      .get(`/api/controlled-documents/${external.documentId}/download`)
      .set('Authorization', `Bearer ${viewerSessionToken}`);
    expect(externalResponse.status).toBe(422);
    expect(externalResponse.body.error).toBe(
      'EXTERNAL_REFERENCE_REQUIRES_RECONCILIATION'
    );
  });
});
