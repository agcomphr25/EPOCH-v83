import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for Part Specification Sheet PostgreSQL certification'
  );
}

const pool = new Pool({ connectionString: databaseUrl });
let actorId: number;
let sheetId: string;
let revisionId: string;

beforeAll(async () => {
  const actor = await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'ADMIN')
     RETURNING id`,
    [`part-spec-cert-${randomUUID()}`, 'certification-only']
  );
  actorId = actor.rows[0].id;
  const sheet = await pool.query(
    `INSERT INTO spec_sheets (
       title, source_type, lifecycle_status, specification_revision, created_by
     ) VALUES ('Certification Part Specification', 'generated', 'DRAFT', 'A', 'ci')
     RETURNING id`
  );
  sheetId = sheet.rows[0].id;
  const revision = await pool.query(
    `INSERT INTO spec_sheet_revisions (
       spec_sheet_id, revision, lifecycle_status, template_revision,
       content_snapshot, content_checksum, created_by_user_id, created_by_snapshot
     ) VALUES ($1, 'A', 'DRAFT', '1.0', $2::jsonb, 'checksum-a', $3, $4::jsonb)
     RETURNING id`,
    [
      sheetId,
      JSON.stringify({
        documentNumber: 'SPEC-CERT-001',
        fieldValues: { width: 1 },
      }),
      actorId,
      JSON.stringify({ id: actorId, role: 'ADMIN' }),
    ]
  );
  revisionId = revision.rows[0].id;
  await pool.query(
    `UPDATE spec_sheets SET working_revision_id = $1 WHERE id = $2`,
    [revisionId, sheetId]
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Part Specification Sheet PostgreSQL 16.4 certification', () => {
  it('installs lifecycle, traveler, audit, constraint, index, and foreign-key schema', async () => {
    const result = await pool.query(
      `SELECT
         to_regclass('public.spec_sheet_revisions') IS NOT NULL AS revisions,
         to_regclass('public.spec_sheet_revision_approvals') IS NOT NULL AS approvals,
         to_regclass('public.spec_sheet_transition_audit') IS NOT NULL AS audit,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'travelers' AND column_name = 'spec_sheet_revision_id'
         ) AS traveler_capture,
         EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'travelers_spec_sheet_revision_id_fkey'
         ) AS traveler_fk,
         EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'spec_sheet_revisions_lifecycle_check'
         ) AS lifecycle_check`
    );
    expect(result.rows[0]).toEqual({
      revisions: true,
      approvals: true,
      audit: true,
      traveler_capture: true,
      traveler_fk: true,
      lifecycle_check: true,
    });
  });

  it('keeps existing model tables available without rewriting their rows', async () => {
    const tables = [
      'document_templates',
      'template_fields',
      'spec_sheets',
      'controlled_documents',
      'document_version_history',
      'part_routings',
      'routing_operations',
      'routing_cnc_operations',
      'travelers',
    ];
    const result = await pool.query(
      `SELECT relname FROM pg_class
       WHERE relkind = 'r' AND relname = ANY($1::text[])`,
      [tables]
    );
    expect(result.rows.map((row) => row.relname).sort()).toEqual(tables.sort());
  });

  it('enforces duplicate approval uniqueness and rolls failed approval back', async () => {
    await pool.query(
      `INSERT INTO spec_sheet_revision_approvals (
         spec_sheet_revision_id, approval_role, decision, actor_user_id,
         actor_display_name, actor_role, actor_capabilities, revision_snapshot,
         content_checksum
       ) VALUES ($1, 'ENGINEERING', 'APPROVED', $2, 'CI Actor', 'ADMIN',
                 '["spec_sheets.approve.engineering"]'::jsonb, 'A', 'checksum-a')`,
      [revisionId, actorId]
    );
    await expect(
      pool.query(
        `INSERT INTO spec_sheet_revision_approvals (
           spec_sheet_revision_id, approval_role, decision, actor_user_id,
           actor_display_name, actor_role, actor_capabilities, revision_snapshot,
           content_checksum
         ) VALUES ($1, 'ENGINEERING', 'APPROVED', $2, 'CI Actor', 'ADMIN',
                   '[]'::jsonb, 'A', 'checksum-a')`,
        [revisionId, actorId]
      )
    ).rejects.toThrow();
    const count = await pool.query(
      `SELECT count(*)::integer AS count
       FROM spec_sheet_revision_approvals
       WHERE spec_sheet_revision_id = $1 AND approval_role = 'ENGINEERING'`,
      [revisionId]
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('rolls a failed controlled draft update back atomically', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE spec_sheet_revisions
         SET content_snapshot = '{"changed":true}'::jsonb, content_checksum = 'changed'
         WHERE id = $1`,
        [revisionId]
      );
      await client.query(
        `DELETE FROM spec_sheet_revision_approvals WHERE spec_sheet_revision_id = $1`,
        [revisionId]
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const revision = await pool.query(
      `SELECT content_checksum FROM spec_sheet_revisions WHERE id = $1`,
      [revisionId]
    );
    const approvals = await pool.query(
      `SELECT count(*)::integer AS count
       FROM spec_sheet_revision_approvals WHERE spec_sheet_revision_id = $1`,
      [revisionId]
    );
    expect(revision.rows[0].content_checksum).toBe('checksum-a');
    expect(approvals.rows[0].count).toBe(1);
  });

  it('reserves distinct controlled SPEC numbers under concurrent creation', async () => {
    const reserve = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await pool.query(
          `WITH next_number AS (
           SELECT COALESCE(MAX(
             CASE WHEN display_number ~ '^SPEC-CI-[0-9]+$'
               THEN substring(display_number from '[0-9]+$')::integer ELSE 0 END
           ), 0) + 1 AS sequence
           FROM controlled_document_number_registry
           WHERE display_number LIKE 'SPEC-CI-%'
         )
         INSERT INTO controlled_document_number_registry (
           normalized_number, display_number, status, created_at, updated_at
         )
         SELECT
           'SPEC-CI-' || lpad(sequence::text, 4, '0'),
           'SPEC-CI-' || lpad(sequence::text, 4, '0'),
           'RESERVED', NOW(), NOW()
         FROM next_number
         ON CONFLICT (normalized_number) DO NOTHING
         RETURNING display_number`
        );
        if (result.rows[0]) return result.rows[0].display_number as string;
      }
      throw new Error('Concurrent SPEC reservation exhausted retries');
    };
    const results = await Promise.all(Array.from({ length: 8 }, reserve));
    const numbers = results;
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toHaveLength(8);
  });

  it('preserves terminal revision content and captured historical traveler linkage', async () => {
    await pool.query(
      `UPDATE spec_sheet_revisions
       SET lifecycle_status = 'RELEASED', released_at = NOW(), effective_date = CURRENT_DATE
       WHERE id = $1`,
      [revisionId]
    );
    const travelerId = randomUUID();
    await pool.query(
      `INSERT INTO travelers (
         id, traveler_number, traveler_revision, part_number, part_name,
         quantity, status, created_by, spec_sheet_revision_id
       ) VALUES ($1, $2, 1, 'CERT-PART', 'Certification Part', 1, 'DRAFT', 'ci', $3)`,
      [travelerId, `TRAV-CERT-${randomUUID()}`, revisionId]
    );
    const successor = await pool.query(
      `INSERT INTO spec_sheet_revisions (
         spec_sheet_id, revision, lifecycle_status, template_revision,
         content_snapshot, content_checksum, created_by_user_id, created_by_snapshot
       ) VALUES ($1, 'B', 'RELEASED', '1.0', '{"revision":"B"}'::jsonb,
                 'checksum-b', $2, $3::jsonb)
       RETURNING id`,
      [sheetId, actorId, JSON.stringify({ id: actorId, role: 'ADMIN' })]
    );
    await pool.query(
      `UPDATE spec_sheet_revisions
       SET lifecycle_status = 'SUPERSEDED', superseded_by_revision_id = $2
       WHERE id = $1`,
      [revisionId, successor.rows[0].id]
    );
    const captured = await pool.query(
      `SELECT spec_sheet_revision_id FROM travelers WHERE id = $1`,
      [travelerId]
    );
    expect(captured.rows[0].spec_sheet_revision_id).toBe(revisionId);
    await expect(
      pool.query(
        `UPDATE spec_sheet_revisions
         SET content_snapshot = '{"tampered":true}'::jsonb
         WHERE id = $1`,
        [revisionId]
      )
    ).rejects.toThrow(/immutable/i);
    await pool.query(
      `UPDATE spec_sheet_revisions SET lifecycle_status = 'OBSOLETE' WHERE id = $1`,
      [revisionId]
    );
    const lifecycle = await pool.query(
      `SELECT lifecycle_status FROM spec_sheet_revisions WHERE id = $1`,
      [revisionId]
    );
    expect(lifecycle.rows[0].lifecycle_status).toBe('OBSOLETE');
  });
});
