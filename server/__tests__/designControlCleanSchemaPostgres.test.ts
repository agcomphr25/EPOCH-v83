import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const parsed = new URL(databaseUrl);

if (
  process.env.DESIGN_CONTROL_CLEAN_SCHEMA_CERTIFICATION !== 'isolated_test' ||
  parsed.hostname !== '127.0.0.1' ||
  parsed.pathname.slice(1) !== 'epoch_p2_v2_certification'
) {
  throw new Error(
    'Disposable Design Control clean-schema certification boundary rejected'
  );
}

const pool = new Pool({ connectionString: databaseUrl });
const suffix = randomUUID().slice(0, 8);
const ids = {
  document: randomUUID(),
  history: randomUUID(),
  template: randomUUID(),
  revision: randomUUID(),
};
let userId = 0;

describe('Design Control clean-schema PostgreSQL constraints', () => {
  beforeAll(async () => {
    const user = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, 'synthetic-not-a-login-secret', 'ADMIN') RETURNING id`,
      [`clean-schema-certifier-${suffix}`]
    );
    userId = user.rows[0].id;
    await pool.query(
      `INSERT INTO controlled_documents
         (id, document_number, document_name, document_type, department, created_by)
       VALUES ($1, $2, 'Synthetic clean-schema document', 'FORM', 'Engineering', 'synthetic-certifier')`,
      [ids.document, `SYN-CLEAN-${suffix}`]
    );
    await pool.query(
      `INSERT INTO document_version_history
         (id, document_id, version_number, status, created_by)
       VALUES ($1, $2, '1.0', 'draft', 'synthetic-certifier')`,
      [ids.history, ids.document]
    );
    await pool.query(
      `INSERT INTO design_control_form_templates
         (id, template_key, controlled_document_id, form_category,
          workflow_step_key, created_by_user_id)
       VALUES ($1, $2, $3, 'DESIGN_CONTROL_STEP', 'design_inputs', $4)`,
      [ids.template, `SYNTHETIC_CLEAN_${suffix}`, ids.document, userId]
    );
    await pool.query(
      `INSERT INTO design_control_form_template_revisions
         (id, design_control_form_template_id, document_version_history_id,
          template_revision_sequence, template_schema_version, renderer_version,
          canonical_definition, definition_checksum, document_number_snapshot,
          document_revision_snapshot, template_key_snapshot, revision_reason,
          created_by_user_id)
       VALUES ($1, $2, $3, 1, '1.0.0', 'test/1', '{}'::jsonb, $4,
               $5, '1.0', $6, 'Synthetic clean-schema certification', $7)`,
      [
        ids.revision,
        ids.template,
        ids.history,
        'a'.repeat(64),
        `SYN-CLEAN-${suffix}`,
        `SYNTHETIC_CLEAN_${suffix}`,
        userId,
      ]
    );
  });

  afterAll(async () => {
    // Controlled-document and Design Control evidence is deliberately
    // append-only. The isolated PostgreSQL service is destroyed with the CI
    // job, so certification evidence is not hard-deleted during cleanup.
    await pool.end();
  });

  it('retains uniquely named revision-history constraints with exact semantics', async () => {
    const result = await pool.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'design_control_form_template_revisions'::regclass
         AND conname = ANY($1::text[])
       ORDER BY conname`,
      [
        [
          'design_control_form_template_r_document_version_history_id_fkey',
          'design_control_form_template_re_document_version_history_id_key',
        ],
      ]
    );
    expect(result.rows).toEqual([
      expect.objectContaining({
        conname:
          'design_control_form_template_r_document_version_history_id_fkey',
        contype: 'f',
        definition: expect.stringContaining(
          'FOREIGN KEY (document_version_history_id) REFERENCES document_version_history(id) ON DELETE RESTRICT'
        ),
      }),
      expect.objectContaining({
        conname:
          'design_control_form_template_re_document_version_history_id_key',
        contype: 'u',
        definition: 'UNIQUE (document_version_history_id)',
      }),
    ]);
  });

  it('rejects duplicate history use and deletion of referenced history', async () => {
    await expect(
      pool.query(
        `INSERT INTO design_control_form_template_revisions
           (design_control_form_template_id, document_version_history_id,
            template_revision_sequence, template_schema_version, renderer_version,
            canonical_definition, definition_checksum, document_number_snapshot,
            document_revision_snapshot, template_key_snapshot, revision_reason,
            created_by_user_id)
         VALUES ($1, $2, 2, '1.0.0', 'test/1', '{}'::jsonb, $3,
                 $4, '2.0', $5, 'Duplicate history probe', $6)`,
        [
          ids.template,
          ids.history,
          'b'.repeat(64),
          `SYN-CLEAN-${suffix}`,
          `SYNTHETIC_CLEAN_${suffix}`,
          userId,
        ]
      )
    ).rejects.toMatchObject({ code: '23505' });

    await expect(
      pool.query('DELETE FROM document_version_history WHERE id = $1', [
        ids.history,
      ])
    ).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringMatching(/cannot be hard-deleted/i),
    });
  });

  it('rejects an invalid history reference and savepoint rollback preserves fixture evidence', async () => {
    const before = await pool.query(
      `SELECT r.id, r.document_version_history_id, r.created_at,
              h.id AS history_id, h.created_at AS history_created_at
       FROM design_control_form_template_revisions r
       JOIN document_version_history h ON h.id = r.document_version_history_id
       WHERE r.design_control_form_template_id = $1`,
      [ids.template]
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SAVEPOINT invalid_history_probe');
      await expect(
        client.query(
          `INSERT INTO design_control_form_template_revisions
             (design_control_form_template_id, document_version_history_id,
              template_revision_sequence, template_schema_version, renderer_version,
              canonical_definition, definition_checksum, document_number_snapshot,
              document_revision_snapshot, template_key_snapshot, revision_reason,
              created_by_user_id)
           VALUES ($1, $2, 2, '1.0.0', 'test/1', '{}'::jsonb, $3,
                   $4, '2.0', $5, 'Invalid reference probe', $6)`,
          [
            ids.template,
            randomUUID(),
            'b'.repeat(64),
            `SYN-CLEAN-${suffix}`,
            `SYNTHETIC_CLEAN_${suffix}`,
            userId,
          ]
        )
      ).rejects.toMatchObject({ code: '23503' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_history_probe');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const retained = await pool.query(
      `SELECT r.id, r.document_version_history_id, r.created_at,
              h.id AS history_id, h.created_at AS history_created_at
       FROM design_control_form_template_revisions r
       JOIN document_version_history h ON h.id = r.document_version_history_id
       WHERE r.design_control_form_template_id = $1`,
      [ids.template]
    );
    expect(retained.rows).toEqual(before.rows);
  });
});
