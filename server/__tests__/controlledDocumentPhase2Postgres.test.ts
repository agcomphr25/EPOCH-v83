import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgPool } from '../db';
import {
  approveAndReleaseControlledRevision,
  checksumFile,
  ControlledDocumentError,
} from '../src/services/controlledDocumentLifecycleService';
import { assertControlledDocumentPhase2SchemaReady } from '../src/services/controlledDocumentSchemaReadiness';

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
let approverId = 0;
let approverEmployeeId = 0;

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
});

afterAll(async () => {
  delete process.env.CONTROLLED_DOCUMENT_PHASE2_APPROVE_RELEASE_ENABLED;
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
});
