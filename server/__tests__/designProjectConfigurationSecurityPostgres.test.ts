import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/requirePermission', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

import { getDatabaseTargetInfo, pgPool } from '../db';
import rdProjectRoutes from '../src/routes/rdProjects';

const projectA = 'phase2-security-project-a';
const projectB = 'phase2-security-project-b';
const parentA = '10000000-0000-4000-8000-000000000001';
const parentB = '10000000-0000-4000-8000-000000000002';
const itemA = '10000000-0000-4000-8000-000000000003';
const relationshipA = '20000000-0000-4000-8000-000000000001';
const applicabilityDraft = '30000000-0000-4000-8000-000000000001';
const applicabilityPending = '30000000-0000-4000-8000-000000000002';
let actorUserId = 0;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (
    req as express.Request & {
      user: { id: number; username: string; role: string };
    }
  ).user = {
    id: actorUserId,
    username: 'phase2-certifier',
    role: 'ADMIN',
  };
  next();
});
app.use('/api/rd-projects', rdProjectRoutes);

async function countPart(partNumber: string) {
  const result = await pgPool.query(
    'SELECT count(*)::int AS count FROM design_project_configuration_items WHERE part_number = $1',
    [partNumber]
  );
  return result.rows[0].count as number;
}

describe('Design Project configuration PostgreSQL ownership and atomicity', () => {
  beforeAll(async () => {
    const target = getDatabaseTargetInfo();
    if (
      process.env.DESIGN_PROJECT_CONFIGURATION_POSTGRES_CERTIFICATION !==
        'isolated_test' ||
      target.host !== '127.0.0.1' ||
      target.database !== 'epoch_p2_v2_certification'
    ) {
      throw new Error(
        `Disposable Design Project certification boundary rejected: ${target.redactedUrl ?? 'unknown'}`
      );
    }

    const actor = await pgPool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ('phase2-configuration-certifier', 'not-a-login-secret', 'ADMIN')
       RETURNING id`
    );
    actorUserId = actor.rows[0].id;

    await pgPool.query(
      `INSERT INTO rd_projects (id, project_name) VALUES ($1, 'Phase 2 Security A'), ($2, 'Phase 2 Security B')`,
      [projectA, projectB]
    );
    await pgPool.query(
      `INSERT INTO design_project_configuration_workspaces
        (rd_project_id, activated_by_snapshot) VALUES ($1, '{}'::jsonb), ($2, '{}'::jsonb)`,
      [projectA, projectB]
    );
    await pgPool.query(
      `INSERT INTO design_project_configuration_items
        (id, rd_project_id, configuration_item_number, part_number, title, item_type, created_by_snapshot)
       VALUES
        ($1, $2, 'A-PARENT', 'A-PARENT', 'Project A Parent', 'ASSEMBLY', '{}'::jsonb),
        ($3, $4, 'B-PARENT', 'B-PARENT', 'Project B Parent', 'ASSEMBLY', '{}'::jsonb),
        ($5, $2, 'A-ITEM', 'A-ITEM', 'Project A Item', 'MANUFACTURED_PART', '{}'::jsonb)`,
      [parentA, projectA, parentB, projectB, itemA]
    );
    await pgPool.query(
      `INSERT INTO design_project_configuration_item_relationships
        (id, rd_project_id, parent_configuration_item_id, child_configuration_item_id, quantity, unit_of_measure, created_by_snapshot)
       VALUES ($1, $2, $3, $4, 1, 'EA', '{}'::jsonb)`,
      [relationshipA, projectA, parentA, itemA]
    );
    await pgPool.query(
      `INSERT INTO design_project_document_applicability
        (id, configuration_item_id, requirement_role, decision, justification, approval_status, created_by_snapshot)
       VALUES
        ($1, $2, 'ROUTING', 'NOT_APPLICABLE', 'Routing is not used.', 'DRAFT', '{}'::jsonb),
        ($3, $2, 'WORK_INSTRUCTION', 'NOT_APPLICABLE', 'No work instruction is required.', 'PENDING', '{}'::jsonb)`,
      [applicabilityDraft, itemA, applicabilityPending]
    );
    await pgPool.query(`
      CREATE OR REPLACE FUNCTION phase2_reject_relationship() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM design_project_configuration_items
          WHERE id = NEW.child_configuration_item_id AND part_number = 'FAIL-REL'
        ) THEN
          RAISE EXCEPTION 'synthetic relationship failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER phase2_reject_relationship_trigger
      BEFORE INSERT ON design_project_configuration_item_relationships
      FOR EACH ROW EXECUTE FUNCTION phase2_reject_relationship();
    `);
  });

  afterAll(async () => {
    await pgPool.query(
      'DROP TRIGGER IF EXISTS phase2_reject_relationship_trigger ON design_project_configuration_item_relationships'
    );
    await pgPool.query('DROP FUNCTION IF EXISTS phase2_reject_relationship()');
    await pgPool.query(
      `DELETE FROM design_project_document_applicability
       WHERE configuration_item_id IN (
         SELECT id FROM design_project_configuration_items WHERE rd_project_id = ANY($1::text[])
       )`,
      [[projectA, projectB]]
    );
    await pgPool.query(
      'DELETE FROM design_project_part_revisions WHERE configuration_item_id IN (SELECT id FROM design_project_configuration_items WHERE rd_project_id = ANY($1::text[]))',
      [[projectA, projectB]]
    );
    await pgPool.query(
      'DELETE FROM design_project_configuration_item_relationships WHERE rd_project_id = ANY($1::text[])',
      [[projectA, projectB]]
    );
    await pgPool.query(
      'DELETE FROM design_project_configuration_items WHERE rd_project_id = ANY($1::text[])',
      [[projectA, projectB]]
    );
    await pgPool.query(
      'DELETE FROM design_project_configuration_workspaces WHERE rd_project_id = ANY($1::text[])',
      [[projectA, projectB]]
    );
    await pgPool.query('DELETE FROM rd_projects WHERE id = ANY($1::text[])', [
      [projectA, projectB],
    ]);
    await pgPool.query('DELETE FROM users WHERE id = $1', [actorUserId]);
  });

  it('does not submit Project A applicability through Project B', async () => {
    const response = await request(app).post(
      `/api/rd-projects/${projectB}/configuration/applicability/${applicabilityDraft}/submit`
    );
    expect(response.status).toBe(404);
    const state = await pgPool.query(
      'SELECT approval_status FROM design_project_document_applicability WHERE id = $1',
      [applicabilityDraft]
    );
    expect(state.rows[0].approval_status).toBe('DRAFT');
  });

  it('does not approve Project A applicability through Project B', async () => {
    const response = await request(app).post(
      `/api/rd-projects/${projectB}/configuration/applicability/${applicabilityPending}/approve`
    );
    expect(response.status).toBe(404);
  });

  it('does not edit a Project A item through Project B', async () => {
    const response = await request(app)
      .patch(`/api/rd-projects/${projectB}/configuration/items/${itemA}`)
      .send({ title: 'Unauthorized title' });
    expect(response.status).toBe(404);
  });

  it('does not change or delete a Project A relationship through Project B', async () => {
    const changed = await request(app)
      .patch(
        `/api/rd-projects/${projectB}/configuration/relationships/${relationshipA}`
      )
      .send({ quantity: 2 });
    const removed = await request(app).delete(
      `/api/rd-projects/${projectB}/configuration/relationships/${relationshipA}`
    );
    expect(changed.status).toBe(404);
    expect(removed.status).toBe(404);
  });

  it('does not reorder a Project A relationship through Project B', async () => {
    const response = await request(app)
      .put(`/api/rd-projects/${projectB}/configuration/relationships/reorder`)
      .send({
        parentConfigurationItemId: parentA,
        relationshipIds: [relationshipA],
      });
    expect(response.status).toBe(409);
  });

  it('does not create a revision for another project item', async () => {
    const response = await request(app)
      .post(
        `/api/rd-projects/${projectB}/configuration/items/${itemA}/revisions`
      )
      .send({
        revisionIdentifier: 'X',
        changeSummary: 'Unauthorized revision',
      });
    expect(response.status).toBe(409);
  });

  it('does not expose another project item coverage', async () => {
    const response = await request(app).get(
      `/api/rd-projects/${projectB}/configuration/items/${itemA}/coverage`
    );
    expect(response.status).toBe(404);
  });

  it('creates an item and parent relationship atomically', async () => {
    const response = await request(app)
      .post(`/api/rd-projects/${projectA}/configuration/items`)
      .send({
        configurationItemNumber: 'ATOMIC-OK',
        partNumber: 'ATOMIC-OK',
        title: 'Atomic child',
        itemType: 'MANUFACTURED_PART',
        parentConfigurationItemId: parentA,
        quantity: 2,
        unitOfMeasure: 'EA',
      });
    expect(response.status).toBe(201);
    expect(response.body.item.partNumber).toBe('ATOMIC-OK');
    expect(response.body.relationship.parentConfigurationItemId).toBe(parentA);
    const evidence = await pgPool.query(
      `SELECT i.created_by_user_id AS item_actor, r.created_by_user_id AS relationship_actor
       FROM design_project_configuration_items i
       JOIN design_project_configuration_item_relationships r
         ON r.child_configuration_item_id = i.id
       WHERE i.part_number = 'ATOMIC-OK'`
    );
    expect(evidence.rows[0]).toEqual({
      item_actor: actorUserId,
      relationship_actor: actorUserId,
    });
  });

  it('preserves standalone top-level item creation', async () => {
    const response = await request(app)
      .post(`/api/rd-projects/${projectA}/configuration/items`)
      .send({
        configurationItemNumber: 'TOP-LEVEL',
        partNumber: 'TOP-LEVEL',
        title: 'Standalone top-level item',
        itemType: 'PRODUCT',
      });
    expect(response.status).toBe(201);
    expect(response.body.item.partNumber).toBe('TOP-LEVEL');
    expect(response.body.relationship).toBeNull();
  });

  it('leaves no extra item when a uniqueness failure rolls back creation', async () => {
    const response = await request(app)
      .post(`/api/rd-projects/${projectA}/configuration/items`)
      .send({
        configurationItemNumber: 'ATOMIC-OK',
        partNumber: 'DUPLICATE-ROLLBACK',
        title: 'Duplicate configuration number',
        itemType: 'MANUFACTURED_PART',
        parentConfigurationItemId: parentA,
        quantity: 1,
        unitOfMeasure: 'EA',
      });
    expect(response.status).toBe(409);
    expect(await countPart('DUPLICATE-ROLLBACK')).toBe(0);
  });

  it('leaves no orphan for an invalid or cross-project parent', async () => {
    const cases: Array<[string, string]> = [
      ['INVALID-PARENT', '40000000-0000-4000-8000-000000000001'],
      ['CROSS-PARENT', parentB],
    ];
    for (const [partNumber, parent] of cases) {
      const response = await request(app)
        .post(`/api/rd-projects/${projectA}/configuration/items`)
        .send({
          configurationItemNumber: partNumber,
          partNumber,
          title: partNumber,
          itemType: 'MANUFACTURED_PART',
          parentConfigurationItemId: parent,
          quantity: 1,
          unitOfMeasure: 'EA',
        });
      expect(response.status).toBe(409);
      expect(await countPart(partNumber)).toBe(0);
    }
  });

  it('rolls back the item when relationship insertion fails', async () => {
    const response = await request(app)
      .post(`/api/rd-projects/${projectA}/configuration/items`)
      .send({
        configurationItemNumber: 'FAIL-REL',
        partNumber: 'FAIL-REL',
        title: 'Synthetic rollback child',
        itemType: 'MANUFACTURED_PART',
        parentConfigurationItemId: parentA,
        quantity: 1,
        unitOfMeasure: 'EA',
      });
    expect(response.status).toBe(500);
    expect(await countPart('FAIL-REL')).toBe(0);
  });

  it('rejects Not Applicable without justification', async () => {
    const response = await request(app)
      .put(
        `/api/rd-projects/${projectA}/configuration/items/${itemA}/applicability/TEST_PROCEDURE`
      )
      .send({ decision: 'NOT_APPLICABLE', justification: '   ' });
    expect(response.status).toBe(400);
  });

  it('submits only draft records and approves only pending records', async () => {
    const resubmit = await request(app).post(
      `/api/rd-projects/${projectA}/configuration/applicability/${applicabilityPending}/submit`
    );
    const earlyApprove = await request(app).post(
      `/api/rd-projects/${projectA}/configuration/applicability/${applicabilityDraft}/approve`
    );
    expect(resubmit.status).toBe(409);
    expect(earlyApprove.status).toBe(409);
  });

  it('submits a project-owned draft and then approves only its pending state', async () => {
    const submitted = await request(app).post(
      `/api/rd-projects/${projectA}/configuration/applicability/${applicabilityDraft}/submit`
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.approval_status).toBe('PENDING');

    const approved = await request(app).post(
      `/api/rd-projects/${projectA}/configuration/applicability/${applicabilityDraft}/approve`
    );
    expect(approved.status).toBe(200);
    expect(approved.body.approval_status).toBe('APPROVED');
    expect(approved.body.approved_by_user_id).toBe(actorUserId);
  });
});
