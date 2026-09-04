import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  HISTORIC_P2_COMPATIBILITY_RELEASE,
  HistoricP2ManufacturingReleaseError,
  releaseHistoricP2ManufacturingWorkOrder,
  resolveManufacturingOrderReleaseAuthority,
  type HistoricP2ManufacturingReleaseEligibility,
  type HistoricP2ReleaseActor,
} from '../src/services/historicP2ManufacturingReleaseService';
import {
  diffSnapshots,
  formatSnapshotDifferences,
  structuredSnapshot,
} from './support/legacySnapshotDiff';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const databaseUrl = new URL(connectionString);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.pathname !== '/epoch_p2_v2_certification'
) {
  throw new Error(
    `Refusing non-disposable database ${databaseUrl.hostname}${databaseUrl.pathname}`
  );
}

const pool = new Pool({ connectionString, max: 4 });
const suiteMarker = `HIST-P2-${Date.now()}-${randomUUID().slice(0, 8)}`;
let fixtureSequence = 0;
let actor: HistoricP2ReleaseActor;

type HistoricFixtureOptions = {
  contractReviewRole?: 'primary' | 'secondary';
  includeAuthorizedWad?: boolean;
  includeProjectPoId?: boolean;
  includeReleaseActivity?: boolean;
  poStatus?: 'in_production' | 'ready_for_p2_release';
  preproductionComplete?: boolean;
  projectStage?: 'production' | 'p2_release';
  releaseActivityDescription?: string;
};

type HistoricFixture = {
  marker: string;
  projectId: string;
  targetWorkOrderId: string;
  authorizedWadId: string | null;
  purchaseReviewId: number;
  preproductionId: string;
  poId: number;
  poItemId: number;
  targetRevisionId: string;
  routingId: string;
  travelerId: string;
  productionOrderId: number;
};

type NonHistoricFixture = {
  marker: string;
  projectId: string;
  targetWorkOrderId: string;
};

const fixedCreatedAt = '2026-01-01T00:00:00.000Z';

function nextMarker(label: string) {
  fixtureSequence += 1;
  return `${suiteMarker}-${String(fixtureSequence).padStart(2, '0')}-${label}`;
}

function releaseInput(
  fixture: Pick<HistoricFixture, 'projectId' | 'targetWorkOrderId'>
) {
  return {
    workOrderId: fixture.targetWorkOrderId,
    expectedProjectId: fixture.projectId,
    actor,
  };
}

async function seedHistoricFixture(
  label: string,
  options: HistoricFixtureOptions = {}
): Promise<HistoricFixture> {
  const marker = nextMarker(label);
  const projectId = randomUUID();
  const targetWorkOrderId = randomUUID();
  const targetRevisionId = randomUUID();
  const routingId = randomUUID();
  const travelerId = randomUUID();
  const preproductionId = randomUUID();
  const authorizedWadId =
    options.includeAuthorizedWad === false ? null : randomUUID();
  const preproductionComplete = options.preproductionComplete !== false;
  const includeReleaseActivity = options.includeReleaseActivity !== false;
  const poStatus = options.poStatus ?? 'in_production';
  const projectStage = options.projectStage ?? 'production';
  const releaseActivityDescription =
    options.releaseActivityDescription ??
    'Released to Production — P2 Release Gate passed (all required conditions met)';
  const targetWadStatus =
    options.includeAuthorizedWad === false ? 'DRAFT' : 'APPROVED';
  const customerId = `${marker}-CUSTOMER`;
  const poNumber = `${marker}-PO`;
  const partNumber = `${marker}-PART`;
  const wizardData = JSON.stringify({
    routingRequired: true,
    travelerRequired: true,
    workInstructionRequired: false,
    samplingPlanRequired: false,
    qualityApprovalRequired: true,
    inspectionStrategy: 'FULL',
  });

  await pool.query(
    `INSERT INTO p2_customers(customer_id,customer_name,rfq_prefix)
     VALUES ($1,$2,'HPC')`,
    [customerId, `${marker} customer`]
  );
  const po = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_orders
       (po_number,customer_id,customer_name,po_date,expected_delivery,status,
        contract_review_role,revision_number,is_current_revision,notes)
     VALUES ($1,$2,$3,'2026-01-01','2026-12-31',$4,$5,0,true,$6)
     RETURNING id`,
    [
      poNumber,
      customerId,
      `${marker} customer`,
      poStatus,
      options.contractReviewRole ?? 'secondary',
      marker,
    ]
  );
  const poId = po.rows[0]!.id;
  const poItem = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_order_items
       (po_id,part_number,part_name,quantity,notes)
     VALUES ($1,$2,$3,2,$4) RETURNING id`,
    [poId, partNumber, `${marker} assembly`, marker]
  );
  const poItemId = poItem.rows[0]!.id;

  await pool.query(
    `INSERT INTO projects
       (id,project_code,project_name,customer_id,workflow_version,current_stage,
        status,po_id,description,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'legacy_v1',$5,'active',$6,$7,$8,$8)`,
    [
      projectId,
      `${marker}-PROJECT`,
      `${marker} project`,
      customerId,
      projectStage,
      options.includeProjectPoId === false ? null : poId,
      marker,
      fixedCreatedAt,
    ]
  );
  await pool.query(`UPDATE p2_purchase_orders SET project_id=$1 WHERE id=$2`, [
    projectId,
    poId,
  ]);

  const purchaseReview = await pool.query<{ id: number }>(
    `INSERT INTO purchase_review_checklists
       (customer_id,form_data,created_by,status,created_at,updated_at)
     VALUES ($1,$2::jsonb,$3,'APPROVED',$4,$4) RETURNING id`,
    [
      customerId,
      JSON.stringify({ marker, approved: true }),
      actor.displayName,
      fixedCreatedAt,
    ]
  );
  const purchaseReviewId = purchaseReview.rows[0]!.id;
  await pool.query(
    `INSERT INTO preproduction_checklists
       (id,project_id,project_name,po_number,status,signed_by,signed_at,
        notes,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6,$7,$7)`,
    [
      preproductionId,
      projectId,
      `${marker} project`,
      poNumber,
      preproductionComplete ? 'completed' : 'in_progress',
      actor.displayName,
      fixedCreatedAt,
      marker,
    ]
  );

  const stepRows = [
    {
      id: randomUUID(),
      type: 'rfq_risk_assessment',
      order: 1,
      status: 'skipped',
    },
    { id: randomUUID(), type: 'quote', order: 2, status: 'skipped' },
    {
      id: randomUUID(),
      type: 'purchase_review_checklist',
      order: 3,
      status: 'completed',
    },
    {
      id: randomUUID(),
      type: 'preproduction_checklist',
      order: 4,
      status: preproductionComplete ? 'completed' : 'in_progress',
    },
    { id: randomUUID(), type: 'p2_order', order: 5, status: 'completed' },
  ];
  for (const step of stepRows) {
    await pool.query(
      `INSERT INTO project_steps
         (id,project_id,step_type,step_order,status,
          linked_purchase_review_id,linked_preproduction_checklist_id,
          linked_p2_order_id,started_at,completed_at,notes,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$9,$9)`,
      [
        step.id,
        projectId,
        step.type,
        step.order,
        step.status,
        step.type === 'purchase_review_checklist' ? purchaseReviewId : null,
        step.type === 'preproduction_checklist' ? preproductionId : null,
        step.type === 'p2_order' ? poId : null,
        fixedCreatedAt,
        step.status === 'completed' || step.status === 'skipped'
          ? fixedCreatedAt
          : null,
        marker,
      ]
    );
  }

  if (includeReleaseActivity) {
    await pool.query(
      `INSERT INTO project_activity_log
         (project_id,activity_type,description,performed_by,
          performed_by_display_name,metadata,created_at)
       VALUES ($1,'stage_changed',$2,$3,$4,$5::jsonb,$6)`,
      [
        projectId,
        releaseActivityDescription,
        actor.employeeId,
        actor.displayName,
        JSON.stringify({ marker }),
        fixedCreatedAt,
      ]
    );
  }

  if (authorizedWadId) {
    // Historic backfill treated released execution status as the authority;
    // legacy rows can therefore retain their default DRAFT wad_status.
    await pool.query(
      `INSERT INTO production_work_orders
         (id,work_order_number,project_id,part_number,description,quantity,
          status,wad_status,wizard_data,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,1,'RELEASED','DRAFT',$6::jsonb,$7,$7)`,
      [
        authorizedWadId,
        `${marker}-AUTHORIZED-WAD`,
        projectId,
        `${marker}-AUTHORITY`,
        marker,
        wizardData,
        fixedCreatedAt,
      ]
    );
    await pool.query(
      `INSERT INTO wad_revisions
         (id,wad_id,revision_code,status,revision_reason,wad_snapshot,
          approved_by,approved_by_display_name,approved_at,created_at,updated_at)
       VALUES ($1,$2,'A','approved',$3,$4::jsonb,$5,$6,$7,$7,$7)`,
      [
        randomUUID(),
        authorizedWadId,
        'Historic WAD authority',
        JSON.stringify({ marker, authorized: true }),
        actor.userId,
        actor.displayName,
        fixedCreatedAt,
      ]
    );
  }

  await pool.query(
    `INSERT INTO production_work_orders
       (id,work_order_number,project_id,part_number,description,quantity,
        status,wad_status,wizard_data,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,2,'PLANNED',$6,$7::jsonb,$8,$8)`,
    [
      targetWorkOrderId,
      `${marker}-TARGET-WO`,
      projectId,
      partNumber,
      marker,
      targetWadStatus,
      wizardData,
      fixedCreatedAt,
    ]
  );
  await pool.query(
    `INSERT INTO wad_revisions
       (id,wad_id,revision_code,status,revision_reason,wad_snapshot,
        approved_by,approved_by_display_name,approved_at,created_at,updated_at)
     VALUES ($1,$2,'A','approved',$3,$4::jsonb,$5,$6,$7,$7,$7)`,
    [
      targetRevisionId,
      targetWorkOrderId,
      'Approved target manufacturing revision',
      JSON.stringify({ marker, target: true }),
      actor.userId,
      actor.displayName,
      fixedCreatedAt,
    ]
  );
  await pool.query(
    `INSERT INTO part_routings
       (id,inventory_item_id,project_id,part_number,part_name,routing_name,
        routing_revision,department_sequence,traceability_config,routing_type,
        is_active,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,'["Assembly"]'::jsonb,'{}'::jsonb,
             'ASSEMBLY',true,$7,$8,$8)`,
    [
      routingId,
      `${marker}-INVENTORY`,
      projectId,
      partNumber,
      `${marker} assembly`,
      `${marker} routing`,
      actor.displayName,
      fixedCreatedAt,
    ]
  );
  await pool.query(
    `INSERT INTO routing_operations
       (part_routing_id,step_number,department_name,operation_name,
        operation_type,estimated_minutes,requires_signature,
        requires_certification,created_at)
     VALUES ($1,10,'Assembly',$2,'RUN',30,false,false,$3)`,
    [routingId, `${marker} assembly`, fixedCreatedAt]
  );
  await pool.query(
    `INSERT INTO travelers
       (id,traveler_number,traveler_revision,project_id,
        production_work_order_id,wad_revision_id,part_number,part_name,
        quantity,status,part_routing_id,part_routing_revision,created_by,
        created_at,updated_at)
     VALUES ($1,$2,1,$3,$4,$5,$6,$7,2,'DRAFT',$8,1,$9,$10,$10)`,
    [
      travelerId,
      `${marker}-TRAVELER`,
      projectId,
      targetWorkOrderId,
      targetRevisionId,
      partNumber,
      `${marker} assembly`,
      routingId,
      actor.displayName,
      fixedCreatedAt,
    ]
  );
  const productionOrder = await pool.query<{ id: number }>(
    `INSERT INTO p2_production_orders
       (order_id,p2_po_id,p2_po_item_id,project_id,sku,part_name,quantity,
        quantity_manufactured,department,status,priority,notes,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,2,0,'Assembly/Disassembly','PENDING',50,$7,$8,$8)
     RETURNING id`,
    [
      `${marker}-PRODUCTION-ORDER`,
      poId,
      poItemId,
      projectId,
      partNumber,
      `${marker} assembly`,
      marker,
      fixedCreatedAt,
    ]
  );

  return {
    marker,
    projectId,
    targetWorkOrderId,
    authorizedWadId,
    purchaseReviewId,
    preproductionId,
    poId,
    poItemId,
    targetRevisionId,
    routingId,
    travelerId,
    productionOrderId: productionOrder.rows[0]!.id,
  };
}

async function seedNonHistoricFixture(
  label: string,
  workflowVersion: 'legacy_v1' | 'p2_v2'
): Promise<NonHistoricFixture> {
  const marker = nextMarker(label);
  const projectId = randomUUID();
  const targetWorkOrderId = randomUUID();
  let poId: number | null = null;

  if (workflowVersion === 'p2_v2') {
    const customerId = `${marker}-CUSTOMER`;
    await pool.query(
      `INSERT INTO p2_customers(customer_id,customer_name,rfq_prefix)
       VALUES ($1,$2,'HPV')`,
      [customerId, `${marker} customer`]
    );
    const po = await pool.query<{ id: number }>(
      `INSERT INTO p2_purchase_orders
         (po_number,customer_id,customer_name,po_date,expected_delivery,status,
          contract_review_role,notes)
       VALUES ($1,$2,$3,'2026-01-01','2026-12-31','OPEN','secondary',$4)
       RETURNING id`,
      [`${marker}-PO`, customerId, `${marker} customer`, marker]
    );
    poId = po.rows[0]!.id;
  }

  await pool.query(
    `INSERT INTO projects
       (id,project_code,project_name,customer_id,workflow_version,current_stage,
        status,po_id,description,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,'production','active',$6,$7,$8,$8)`,
    [
      projectId,
      `${marker}-PROJECT`,
      `${marker} project`,
      `${marker}-CUSTOMER`,
      workflowVersion,
      poId,
      marker,
      fixedCreatedAt,
    ]
  );
  if (poId != null) {
    await pool.query(
      `UPDATE p2_purchase_orders SET project_id=$1 WHERE id=$2`,
      [projectId, poId]
    );
    await pool.query(
      `INSERT INTO project_workflow_instances
         (project_id,workflow_version,definition_version,status,
          initialized_by,initialized_by_display_name,activated_at)
       VALUES ($1,'p2_v2',3,'ACTIVE',$2,$3,$4)`,
      [projectId, actor.employeeId, actor.displayName, fixedCreatedAt]
    );
  }
  await pool.query(
    `INSERT INTO production_work_orders
       (id,work_order_number,project_id,part_number,description,quantity,
        status,wad_status,wizard_data,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,1,'PLANNED','APPROVED',$6::jsonb,$7,$7)`,
    [
      targetWorkOrderId,
      `${marker}-TARGET-WO`,
      projectId,
      `${marker}-PART`,
      marker,
      JSON.stringify({ routingRequired: false, travelerRequired: false }),
      fixedCreatedAt,
    ]
  );
  return { marker, projectId, targetWorkOrderId };
}

async function getWorkOrder(workOrderId: string) {
  const result = await pool.query<{
    id: string;
    project_id: string;
    quantity: number;
    status: string;
    wad_status: string;
    updated_at: Date | null;
  }>(
    `SELECT id,project_id,quantity,status,wad_status,updated_at
       FROM production_work_orders WHERE id=$1`,
    [workOrderId]
  );
  return result.rows[0]!;
}

async function getHistoricProductionReleaseState(projectId: string) {
  const result = await pool.query<{
    po_status: string;
    project_stage: string;
    release_activity_count: number;
  }>(
    `SELECT po.status AS po_status,p.current_stage AS project_stage,
            (SELECT COUNT(*)::integer FROM project_activity_log activity
              WHERE activity.project_id=p.id
                AND activity.activity_type='stage_changed'
                AND activity.description IN (
                  'Released to Production — P2 Release Gate passed (all three conditions met)',
                  'Released to Production — P2 Release Gate passed (all required conditions met)'
                ))
              AS release_activity_count
       FROM projects p
       JOIN p2_purchase_orders po ON po.id=p.po_id
      WHERE p.id=$1`,
    [projectId]
  );
  return result.rows[0]!;
}

async function getHistoricP2PoLinkState(projectId: string) {
  const result = await pool.query<{
    project_id: string;
    workflow_version: string | null;
    project_po_id: number | null;
    step_po_id: number | null;
    reverse_project_id: string | null;
  }>(
    `SELECT p.id AS project_id,p.workflow_version,
            p.po_id AS project_po_id,
            step.linked_p2_order_id AS step_po_id,
            po.project_id AS reverse_project_id
       FROM projects p
       JOIN project_steps step
         ON step.project_id=p.id AND step.step_type='p2_order'
       LEFT JOIN p2_purchase_orders po ON po.id=step.linked_p2_order_id
      WHERE p.id=$1`,
    [projectId]
  );
  return result.rows[0]!;
}

async function getCompatibilityAudits(workOrderId: string) {
  const result = await pool.query<{
    id: number;
    action: string;
    actor_id: number | null;
    actor_name: string | null;
    actor_role: string | null;
    reason: string | null;
    fields_changed: Record<string, unknown> | null;
    meta: Record<string, unknown> | null;
    subject_type: string | null;
    subject_id: string | null;
    payload_json: Record<string, unknown> | null;
    payload_hash: string | null;
    prev_hash: string | null;
    row_hash: string | null;
    sequence_number: string | number | null;
    occurred_at: Date | null;
    recorded_at: Date | null;
    source_service: string | null;
  }>(
    `SELECT id,action,actor_id,actor_name,actor_role,reason,fields_changed,meta,
            subject_type,subject_id,payload_json,payload_hash,prev_hash,row_hash,
            sequence_number,occurred_at,recorded_at,source_service
       FROM audit_events
      WHERE subject_type='work_order' AND subject_id=$1
        AND action=$2
      ORDER BY id`,
    [workOrderId, HISTORIC_P2_COMPATIBILITY_RELEASE]
  );
  return result.rows;
}

async function captureReleaseError(
  promise: ReturnType<typeof releaseHistoricP2ManufacturingWorkOrder>
) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HistoricP2ManufacturingReleaseError) return error;
    throw error;
  }
  throw new Error('Expected historic P2 release to fail');
}

function eligibilityFrom(error: HistoricP2ManufacturingReleaseError) {
  return error.details.eligibility as HistoricP2ManufacturingReleaseEligibility;
}

function blockerCodes(error: HistoricP2ManufacturingReleaseError) {
  return eligibilityFrom(error).blockers.map((blocker) => blocker.code);
}

async function assertUnchangedAndUnaudited(
  fixture: Pick<HistoricFixture, 'targetWorkOrderId'>,
  before: Awaited<ReturnType<typeof getWorkOrder>>
) {
  expect(await getWorkOrder(fixture.targetWorkOrderId)).toEqual(before);
  expect(await getCompatibilityAudits(fixture.targetWorkOrderId)).toHaveLength(
    0
  );
}

async function countV2Authority(projectId: string) {
  const result = await pool.query<{ table_name: string; row_count: string }>(
    `SELECT table_name,COUNT(*)::text AS row_count
       FROM (
         SELECT 'project_workflow_instances' AS table_name,project_id FROM project_workflow_instances
         UNION ALL SELECT 'project_wad_authorizations',project_id FROM project_wad_authorizations
         UNION ALL SELECT 'project_production_plans',project_id FROM project_production_plans
         UNION ALL SELECT 'project_production_releases',project_id FROM project_production_releases
         UNION ALL SELECT 'project_production_launches',project_id FROM project_production_launches
         UNION ALL SELECT 'p2_frozen_production_demand_baselines',project_id FROM p2_frozen_production_demand_baselines
         UNION ALL SELECT 'p2_manufacturing_work_order_authorities',project_id FROM p2_manufacturing_work_order_authorities
       ) scoped
      WHERE project_id=$1
      GROUP BY table_name
      ORDER BY table_name`,
    [projectId]
  );
  return result.rows.reduce(
    (total: number, row: { table_name: string; row_count: string }) =>
      total + Number(row.row_count),
    0
  );
}

async function fixtureSnapshot(fixture: HistoricFixture) {
  const rowsByTable: Record<string, Record<string, unknown>[]> = {};
  const selections = [
    ['projects', 'id=$1', [fixture.projectId]],
    ['project_steps', 'project_id=$1', [fixture.projectId]],
    [
      'purchase_review_checklists',
      `id=$1
       OR id IN (
         SELECT linked_purchase_review_id FROM project_steps
         WHERE project_id=$2::uuid AND linked_purchase_review_id IS NOT NULL
       )
       OR form_data->>'projectId'=$2::text
       OR form_data->>'project_id'=$2::text`,
      [fixture.purchaseReviewId, fixture.projectId],
    ],
    [
      'preproduction_checklists',
      `id=$1
       OR id IN (
         SELECT linked_preproduction_checklist_id FROM project_steps
         WHERE project_id=$2::uuid
           AND linked_preproduction_checklist_id IS NOT NULL
       )
       OR project_id=$2::text
       OR project_id=(SELECT project_code FROM projects WHERE id=$2::uuid)`,
      [fixture.preproductionId, fixture.projectId],
    ],
    [
      'p2_purchase_orders',
      `id=$1::integer OR parent_po_id=$1::integer OR project_id=$2::uuid
       OR id IN (
         SELECT linked_p2_order_id FROM project_steps
         WHERE project_id=$2::uuid AND linked_p2_order_id IS NOT NULL
       )`,
      [fixture.poId, fixture.projectId],
    ],
    [
      'p2_purchase_order_items',
      `po_id IN (
         SELECT id FROM p2_purchase_orders
         WHERE id=$1::integer OR parent_po_id=$1::integer OR project_id=$2::uuid
       )`,
      [fixture.poId, fixture.projectId],
    ],
    ['production_work_orders', 'project_id=$1', [fixture.projectId]],
    [
      'wad_revisions',
      'wad_id IN (SELECT id FROM production_work_orders WHERE project_id=$1)',
      [fixture.projectId],
    ],
    [
      'part_routings',
      `project_id=$1::uuid OR (
         project_id IS NULL AND part_number=(
           SELECT part_number FROM production_work_orders WHERE id=$2::uuid
         )
       )`,
      [fixture.projectId, fixture.targetWorkOrderId],
    ],
    [
      'routing_operations',
      `part_routing_id IN (
         SELECT id FROM part_routings
         WHERE project_id=$1::uuid OR (
           project_id IS NULL AND part_number=(
             SELECT part_number FROM production_work_orders WHERE id=$2::uuid
           )
         )
       )`,
      [fixture.projectId, fixture.targetWorkOrderId],
    ],
    [
      'travelers',
      `project_id=$1::uuid OR production_work_order_id IN (
         SELECT id FROM production_work_orders WHERE project_id=$1::uuid
       )`,
      [fixture.projectId],
    ],
    [
      'p2_production_orders',
      `project_id=$1::uuid OR p2_po_id IN (
         SELECT id FROM p2_purchase_orders
         WHERE id=$2::integer OR parent_po_id=$2::integer OR project_id=$1::uuid
       )`,
      [fixture.projectId, fixture.poId],
    ],
    ['project_activity_log', 'project_id=$1', [fixture.projectId]],
    ['project_workflow_instances', 'project_id=$1', [fixture.projectId]],
    ['project_wad_authorizations', 'project_id=$1', [fixture.projectId]],
    ['project_production_plans', 'project_id=$1', [fixture.projectId]],
    ['project_production_releases', 'project_id=$1', [fixture.projectId]],
    ['project_production_launches', 'project_id=$1', [fixture.projectId]],
    [
      'p2_frozen_production_demand_baselines',
      'project_id=$1',
      [fixture.projectId],
    ],
    [
      'p2_manufacturing_work_order_authorities',
      `project_id=$1::uuid OR production_work_order_id IN (
         SELECT id FROM production_work_orders WHERE project_id=$1::uuid
       )`,
      [fixture.projectId],
    ],
  ] as const;
  for (const [table, where, values] of selections) {
    const result = await pool.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM ${JSON.stringify(table)} t WHERE ${where}`,
      [...values]
    );
    rowsByTable[table] = result.rows.map(
      ({ row }: { row: Record<string, unknown> }) => row
    );
  }
  return structuredSnapshot(rowsByTable);
}

async function assertOnlyTargetReleaseMutation(
  fixture: HistoricFixture,
  before: Awaited<ReturnType<typeof fixtureSnapshot>>
) {
  const differences = diffSnapshots(before, await fixtureSnapshot(fixture));
  const unexpected = differences.filter(
    (difference) =>
      difference.table !== 'production_work_orders' ||
      !difference.identity.includes(`id=${fixture.targetWorkOrderId}`) ||
      !['status', 'updated_at'].includes(difference.field)
  );
  if (unexpected.length > 0) {
    throw new Error(formatSnapshotDifferences(unexpected));
  }
  expect(differences.map((difference) => difference.field).sort()).toEqual([
    'status',
    'updated_at',
  ]);
  expect(await getCompatibilityAudits(fixture.targetWorkOrderId)).toHaveLength(
    1
  );
  expect(await countV2Authority(fixture.projectId)).toBe(0);
  return differences;
}

async function assertNoAdditionalReleaseMutation(
  fixture: HistoricFixture,
  before: Awaited<ReturnType<typeof fixtureSnapshot>>
) {
  const differences = diffSnapshots(before, await fixtureSnapshot(fixture));
  if (differences.length > 0) {
    throw new Error(formatSnapshotDifferences(differences));
  }
  expect(await getCompatibilityAudits(fixture.targetWorkOrderId)).toHaveLength(
    1
  );
  expect(await countV2Authority(fixture.projectId)).toBe(0);
}

describe.sequential(
  'historic P2 manufacturing-order release PostgreSQL certification',
  () => {
    beforeAll(async () => {
      const employee = await pool.query<{ id: number }>(
        `INSERT INTO employees
         (employee_code,name,user_role,employment_status,timezone,is_active)
       VALUES ($1,$2,'ADMIN','ACTIVE','UTC',true) RETURNING id`,
        [`${suiteMarker}-EMPLOYEE`, `${suiteMarker} certifier`]
      );
      const employeeId = employee.rows[0]!.id;
      const user = await pool.query<{ id: number }>(
        `INSERT INTO users
         (username,password_hash,role,employee_id,is_active,access_status)
       VALUES ($1,'not-a-real-password','ADMIN',$2,true,'ACTIVE') RETURNING id`,
        [`${suiteMarker}-USER`, employeeId]
      );
      actor = {
        userId: user.rows[0]!.id,
        employeeId,
        displayName: `${suiteMarker} certifier`,
        role: 'ADMIN',
      };
    });

    afterAll(async () => {
      await pool.end();
    });

    it('releases a valid historic project without creating P2 V2 authority', async () => {
      const fixture = await seedHistoricFixture('VALID');
      const result = await releaseHistoricP2ManufacturingWorkOrder(
        releaseInput(fixture)
      );

      expect(result.released).toBe(true);
      expect(result.alreadyReleased).toBe(false);
      expect(result.workOrder?.status).toBe('RELEASED');
      expect((await getWorkOrder(fixture.targetWorkOrderId)).status).toBe(
        'RELEASED'
      );
      expect(await getWorkOrder(fixture.authorizedWadId!)).toMatchObject({
        status: 'RELEASED',
        wad_status: 'DRAFT',
      });
      expect(await countV2Authority(fixture.projectId)).toBe(0);

      const project = await pool.query<{
        workflow_version: string | null;
        current_stage: string;
      }>(`SELECT workflow_version,current_stage FROM projects WHERE id=$1`, [
        fixture.projectId,
      ]);
      expect(project.rows[0]).toMatchObject({
        workflow_version: 'legacy_v1',
        current_stage: 'production',
      });

      const audits = await getCompatibilityAudits(fixture.targetWorkOrderId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: HISTORIC_P2_COMPATIBILITY_RELEASE,
        actor_id: actor.employeeId,
        actor_name: actor.displayName,
        actor_role: actor.role,
        reason:
          'Existing historic P2 production authorization was reconciled for current manufacturing execution.',
        subject_type: 'work_order',
        subject_id: fixture.targetWorkOrderId,
        source_service: 'historicP2ManufacturingReleaseService',
        fields_changed: {
          status: { before: 'PLANNED', after: 'RELEASED' },
        },
      });
      expect(audits[0]!.payload_json).toMatchObject({
        mechanism: HISTORIC_P2_COMPATIBILITY_RELEASE,
        projectId: fixture.projectId,
        effectiveWorkflowVersion: 'legacy_v1',
        manufacturingOrderId: fixture.targetWorkOrderId,
        linkedP2PoId: fixture.poId,
        actorUserId: actor.userId,
        actorEmployeeId: actor.employeeId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        resultingStatus: 'RELEASED',
        reason:
          'Existing historic P2 production authorization was reconciled for current manufacturing execution.',
        releasedAt: expect.any(String),
        evidenceDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            key: 'historic_p2_production_release',
            passed: true,
            referenceIds: expect.arrayContaining([
              `project:${fixture.projectId}`,
              `p2_purchase_order:${fixture.poId}`,
            ]),
          }),
          expect.objectContaining({
            key: 'wad_authorization',
            passed: true,
            referenceIds: expect.arrayContaining([
              `production_work_order:${fixture.authorizedWadId}`,
            ]),
          }),
        ]),
      });
      expect(audits[0]!.meta).toMatchObject({
        mechanism: HISTORIC_P2_COMPATIBILITY_RELEASE,
        projectId: fixture.projectId,
        linkedP2PoId: fixture.poId,
        evidenceDigest: audits[0]!.payload_json!.evidenceDigest,
      });
      expect(audits[0]!.payload_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(audits[0]!.prev_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(audits[0]!.row_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(audits[0]!.sequence_number).not.toBeNull();
      expect(audits[0]!.occurred_at).toBeInstanceOf(Date);
      expect(audits[0]!.recorded_at).toBeInstanceOf(Date);
    });

    it('releases a valid historic project using its completed P2 Order step when projects.po_id is null', async () => {
      const fixture = await seedHistoricFixture('STEP-ONLY-PO-LINK', {
        includeProjectPoId: false,
      });
      const before = await fixtureSnapshot(fixture);
      const linkState = await getHistoricP2PoLinkState(fixture.projectId);
      expect(linkState).toEqual({
        project_id: fixture.projectId,
        workflow_version: 'legacy_v1',
        project_po_id: null,
        step_po_id: fixture.poId,
        reverse_project_id: fixture.projectId,
      });

      const result = await releaseHistoricP2ManufacturingWorkOrder(
        releaseInput(fixture)
      );

      expect(result).toMatchObject({
        released: true,
        alreadyReleased: false,
        eligibility: {
          authorityMode: 'HISTORIC_P2_COMPATIBILITY',
          project: {
            id: fixture.projectId,
            storedWorkflowVersion: 'legacy_v1',
            effectiveWorkflowVersion: 'legacy_v1',
            linkedP2PoId: fixture.poId,
          },
        },
        workOrder: {
          id: fixture.targetWorkOrderId,
          projectId: fixture.projectId,
          status: 'RELEASED',
        },
      });
      await assertOnlyTargetReleaseMutation(fixture, before);
      expect(await getHistoricP2PoLinkState(fixture.projectId)).toEqual(
        linkState
      );
      const audits = await getCompatibilityAudits(fixture.targetWorkOrderId);
      expect(audits).toHaveLength(1);
      expect(audits[0]!.payload_json).toMatchObject({
        linkedP2PoId: fixture.poId,
      });
      expect(audits[0]!.meta).toMatchObject({ linkedP2PoId: fixture.poId });
      expect(await countV2Authority(fixture.projectId)).toBe(0);
    });

    it('denies contradictory project and completed-step P2 PO links', async () => {
      const fixture = await seedHistoricFixture('CONTRADICTORY-PO-LINK');
      const other = await seedHistoricFixture('OTHER-PO-LINK');
      await pool.query(
        `UPDATE project_steps SET linked_p2_order_id=$1
          WHERE project_id=$2 AND step_type='p2_order'`,
        [other.poId, fixture.projectId]
      );
      const before = await fixtureSnapshot(fixture);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toContain('P2_ORDER_LINK_INCOMPLETE');
      expect(diffSnapshots(before, await fixtureSnapshot(fixture))).toEqual([]);
      expect(
        await getCompatibilityAudits(fixture.targetWorkOrderId)
      ).toHaveLength(0);
      expect(await countV2Authority(fixture.projectId)).toBe(0);
    });

    it('denies a historic project whose WAD authority is missing', async () => {
      const fixture = await seedHistoricFixture('MISSING-WAD', {
        includeAuthorizedWad: false,
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      expect(fixture.authorizedWadId).toBeNull();
      expect(before.wad_status).toBe('DRAFT');
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toContain('WAD_AUTHORIZATION_INCOMPLETE');
      expect(
        eligibilityFrom(error).blockers.find(
          (blocker) => blocker.code === 'WAD_AUTHORIZATION_INCOMPLETE'
        )?.message
      ).toBe(
        'No historically authorized WAD with a compatible recorded WAD state exists for this project.'
      );
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a released historic authority whose recorded WAD state is pending approval', async () => {
      const fixture = await seedHistoricFixture('PENDING-WAD-AUTHORITY');
      await pool.query(
        `UPDATE production_work_orders SET wad_status='PENDING_APPROVAL'
          WHERE id=$1`,
        [fixture.authorizedWadId]
      );
      expect(await getWorkOrder(fixture.authorizedWadId!)).toMatchObject({
        status: 'RELEASED',
        wad_status: 'PENDING_APPROVAL',
      });
      const before = await fixtureSnapshot(fixture);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual(['WAD_AUTHORIZATION_INCOMPLETE']);
      expect(
        eligibilityFrom(error).blockers.find(
          (blocker) => blocker.code === 'WAD_AUTHORIZATION_INCOMPLETE'
        )?.message
      ).toBe(
        'No historically authorized WAD with a compatible recorded WAD state exists for this project.'
      );
      expect(diffSnapshots(before, await fixtureSnapshot(fixture))).toEqual([]);
      expect(
        await getCompatibilityAudits(fixture.targetWorkOrderId)
      ).toHaveLength(0);
    });

    it('denies a historic manufacturing order whose target quantity is invalid', async () => {
      const fixture = await seedHistoricFixture('INVALID-TARGET-QUANTITY');
      await pool.query(
        `UPDATE production_work_orders SET quantity=0 WHERE id=$1`,
        [fixture.targetWorkOrderId]
      );
      expect((await getWorkOrder(fixture.targetWorkOrderId)).quantity).toBe(0);
      const before = await fixtureSnapshot(fixture);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual(['WORK_ORDER_QUANTITY_INVALID']);
      expect(diffSnapshots(before, await fixtureSnapshot(fixture))).toEqual([]);
      expect(
        await getCompatibilityAudits(fixture.targetWorkOrderId)
      ).toHaveLength(0);
    });

    it('denies a historic project whose Preproduction evidence is incomplete', async () => {
      const fixture = await seedHistoricFixture('MISSING-PREPROD', {
        preproductionComplete: false,
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toContain('PREPRODUCTION_INCOMPLETE');
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a primary P2 PO whose canonical Contract Review evidence is missing', async () => {
      const fixture = await seedHistoricFixture('MISSING-CONTRACT-REVIEW', {
        contractReviewRole: 'primary',
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toContain('CONTRACT_REVIEW_INCOMPLETE');
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a historic project whose explicit Production Release activity is missing', async () => {
      const fixture = await seedHistoricFixture('MISSING-RELEASE-ACTIVITY', {
        includeReleaseActivity: false,
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      expect(
        await getHistoricProductionReleaseState(fixture.projectId)
      ).toEqual({
        po_status: 'in_production',
        project_stage: 'production',
        release_activity_count: 0,
      });
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual([
        'HISTORIC_P2_PRODUCTION_RELEASE_NOT_AUTHORIZED',
      ]);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies misleading release-like activity that is not canonical Production Release evidence', async () => {
      const misleadingDescription =
        'Not released to Production — authorization revoked';
      const fixture = await seedHistoricFixture('MISLEADING-RELEASE-ACTIVITY', {
        releaseActivityDescription: misleadingDescription,
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      expect(
        await getHistoricProductionReleaseState(fixture.projectId)
      ).toEqual({
        po_status: 'in_production',
        project_stage: 'production',
        release_activity_count: 0,
      });
      const activity = await pool.query<{ description: string }>(
        `SELECT description FROM project_activity_log
          WHERE project_id=$1 AND activity_type='stage_changed'`,
        [fixture.projectId]
      );
      expect(activity.rows).toEqual([{ description: misleadingDescription }]);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual([
        'HISTORIC_P2_PRODUCTION_RELEASE_NOT_AUTHORIZED',
      ]);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a historic project whose linked PO is not in a released production state', async () => {
      const fixture = await seedHistoricFixture('INVALID-PO-STATE', {
        poStatus: 'ready_for_p2_release',
      });
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      expect(
        await getHistoricProductionReleaseState(fixture.projectId)
      ).toEqual({
        po_status: 'ready_for_p2_release',
        project_stage: 'production',
        release_activity_count: 1,
      });
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual([
        'HISTORIC_P2_PRODUCTION_RELEASE_NOT_AUTHORIZED',
      ]);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a traveler whose part identity contradicts its manufacturing order', async () => {
      const fixture = await seedHistoricFixture('TRAVELER-PART-MISMATCH');
      await pool.query(`UPDATE travelers SET part_number=$1 WHERE id=$2`, [
        `${fixture.marker}-OTHER-PART`,
        fixture.travelerId,
      ]);
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual(['TRAVELER_EVIDENCE_CONTRADICTORY']);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a referenced routing whose part identity contradicts its manufacturing order', async () => {
      const fixture = await seedHistoricFixture('ROUTING-PART-MISMATCH');
      await pool.query(`UPDATE part_routings SET part_number=$1 WHERE id=$2`, [
        `${fixture.marker}-OTHER-PART`,
        fixture.routingId,
      ]);
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual(['ROUTING_REFERENCE_INVALID']);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a referenced routing whose project identity contradicts its manufacturing order', async () => {
      const fixture = await seedHistoricFixture('ROUTING-PROJECT-MISMATCH');
      const otherProject = await seedNonHistoricFixture(
        'ROUTING-OTHER-PROJECT',
        'legacy_v1'
      );
      await pool.query(`UPDATE part_routings SET project_id=$1 WHERE id=$2`, [
        otherProject.projectId,
        fixture.routingId,
      ]);
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture))
      );

      expect(error.code).toBe('HISTORIC_P2_RELEASE_EVIDENCE_INCOMPLETE');
      expect(blockerCodes(error)).toEqual(['ROUTING_REFERENCE_INVALID']);
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('denies a manufacturing order requested through another project', async () => {
      const fixture = await seedHistoricFixture('WRONG-PROJECT');
      const before = await getWorkOrder(fixture.targetWorkOrderId);
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder({
          ...releaseInput(fixture),
          expectedProjectId: randomUUID(),
        })
      );

      expect(error.code).toBe('WORK_ORDER_PROJECT_MISMATCH');
      expect(blockerCodes(error)).toContain('WORK_ORDER_PROJECT_MISMATCH');
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('returns an idempotent already-released result without a duplicate audit', async () => {
      const fixture = await seedHistoricFixture('ALREADY-RELEASED');
      const first = await releaseHistoricP2ManufacturingWorkOrder(
        releaseInput(fixture)
      );
      const releasedRow = await getWorkOrder(fixture.targetWorkOrderId);
      const releasedSnapshot = await fixtureSnapshot(fixture);
      const second = await releaseHistoricP2ManufacturingWorkOrder(
        releaseInput(fixture)
      );

      expect(first.released).toBe(true);
      expect(second).toMatchObject({ released: false, alreadyReleased: true });
      expect(await getWorkOrder(fixture.targetWorkOrderId)).toEqual(
        releasedRow
      );
      await assertNoAdditionalReleaseMutation(fixture, releasedSnapshot);
    });

    it('keeps P2 V2 projects on their existing authority path', async () => {
      const fixture = await seedNonHistoricFixture('P2-V2', 'p2_v2');
      const before = await getWorkOrder(fixture.targetWorkOrderId);

      expect(
        await resolveManufacturingOrderReleaseAuthority(
          fixture.targetWorkOrderId
        )
      ).toBe('P2_V2');
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder({
          workOrderId: fixture.targetWorkOrderId,
          expectedProjectId: fixture.projectId,
          actor,
        })
      );
      expect(error.code).toBe('HISTORIC_P2_COMPATIBILITY_NOT_APPLICABLE');
      expect(blockerCodes(error)).toContain(
        'P2_V2_COMPATIBILITY_FALLBACK_FORBIDDEN'
      );
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('leaves an unrelated legacy/P1 manufacturing order on its existing path', async () => {
      const fixture = await seedNonHistoricFixture('P1', 'legacy_v1');
      const before = await getWorkOrder(fixture.targetWorkOrderId);

      expect(
        await resolveManufacturingOrderReleaseAuthority(
          fixture.targetWorkOrderId
        )
      ).toBe('UNRELATED_LEGACY');
      const error = await captureReleaseError(
        releaseHistoricP2ManufacturingWorkOrder({
          workOrderId: fixture.targetWorkOrderId,
          expectedProjectId: fixture.projectId,
          actor,
        })
      );
      expect(error.code).toBe('HISTORIC_P2_COMPATIBILITY_NOT_APPLICABLE');
      expect(blockerCodes(error)).toContain(
        'UNRELATED_LEGACY_COMPATIBILITY_FALLBACK_FORBIDDEN'
      );
      await assertUnchangedAndUnaudited(fixture, before);
    });

    it('preserves historic identities and evidence while changing only target release state', async () => {
      const fixture = await seedHistoricFixture('PRESERVATION');
      const before = await fixtureSnapshot(fixture);

      await releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture));

      const differences = await assertOnlyTargetReleaseMutation(
        fixture,
        before
      );
      const statusDifference = differences.find(
        (difference) => difference.field === 'status'
      );
      expect(statusDifference).toMatchObject({
        before: 'PLANNED',
        after: 'RELEASED',
      });
    });

    it('releases independent orders concurrently while preserving one audit-chain event per target', async () => {
      const leftFixture = await seedHistoricFixture('AUDIT-CHAIN-LEFT');
      const rightFixture = await seedHistoricFixture('AUDIT-CHAIN-RIGHT');
      const leftBefore = await fixtureSnapshot(leftFixture);
      const rightBefore = await fixtureSnapshot(rightFixture);

      // Distinct work-order locks let both transactions contend on the shared
      // audit chain without turning either release into an idempotent replay.
      const [left, right] = await Promise.all([
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(leftFixture)),
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(rightFixture)),
      ]);

      expect(left).toMatchObject({ released: true, alreadyReleased: false });
      expect(right).toMatchObject({ released: true, alreadyReleased: false });
      expect((await getWorkOrder(leftFixture.targetWorkOrderId)).status).toBe(
        'RELEASED'
      );
      expect((await getWorkOrder(rightFixture.targetWorkOrderId)).status).toBe(
        'RELEASED'
      );
      const [leftAudits, rightAudits] = await Promise.all([
        getCompatibilityAudits(leftFixture.targetWorkOrderId),
        getCompatibilityAudits(rightFixture.targetWorkOrderId),
      ]);
      expect([leftAudits.length, rightAudits.length]).toEqual([1, 1]);
      expect(
        new Set(
          [...leftAudits, ...rightAudits].map((audit) =>
            String(audit.sequence_number)
          )
        ).size
      ).toBe(2);
      await assertOnlyTargetReleaseMutation(leftFixture, leftBefore);
      await assertOnlyTargetReleaseMutation(rightFixture, rightBefore);
    });

    it('serializes concurrent requests into one release and one audit event', async () => {
      const fixture = await seedHistoricFixture('CONCURRENT');
      const before = await fixtureSnapshot(fixture);
      const [left, right] = await Promise.all([
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture)),
        releaseHistoricP2ManufacturingWorkOrder(releaseInput(fixture)),
      ]);

      expect([left, right].filter((result) => result.released)).toHaveLength(1);
      expect(
        [left, right].filter((result) => result.alreadyReleased)
      ).toHaveLength(1);
      expect((await getWorkOrder(fixture.targetWorkOrderId)).status).toBe(
        'RELEASED'
      );
      await assertOnlyTargetReleaseMutation(fixture, before);
    });
  }
);
