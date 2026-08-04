import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import {
  diffSnapshots,
  structuredSnapshot,
  type SnapshotDifference,
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
const snapshotTables = [
  'projects',
  'project_steps',
  'purchase_review_checklists',
  'production_work_orders',
  'wad_revisions',
  'preproduction_checklists',
  'p2_purchase_orders',
  'p2_purchase_order_items',
  'p2_production_orders',
  'p2_serialized_items',
  'p2_final_inspection_results',
  'shipment_records',
  'project_closings',
  'project_closing_risks',
  'project_closing_actions',
  'project_activity_log',
  'project_workflow_instances',
  'project_workflow_step_instances',
  'project_workflow_step_approvals',
  'project_workflow_step_links',
  'project_wad_authorizations',
  'project_production_plans',
  'project_preproduction_readiness_reviews',
  'project_production_releases',
  'project_production_launches',
] as const;

type AllowedDifference = {
  table: string;
  operation: SnapshotDifference['operation'];
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
};

type ActionCase = {
  name: string;
  execute: (client: PoolClient, fixture: Fixture) => Promise<void>;
  allowed: AllowedDifference[];
  withoutClosing?: boolean;
};

type Fixture = {
  projectId: string;
  marker: string;
  closingId: number;
};

async function snapshot(client: PoolClient, marker: string) {
  const rowsByTable: Record<string, Record<string, unknown>[]> = {};
  for (const table of snapshotTables) {
    const result = await client.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM ${JSON.stringify(table)} t
       WHERE to_jsonb(t)::text LIKE $1`,
      [`%${marker}%`]
    );
    rowsByTable[table] = result.rows.map(({ row }) => row);
  }
  return structuredSnapshot(rowsByTable);
}

async function seedFixture(
  client: PoolClient,
  index: number,
  withoutClosing = false
): Promise<Fixture> {
  const suffix = String(index).padStart(12, '0');
  const projectId = `20000000-0000-4000-8000-${suffix}`;
  const marker = `LEGACY-ACTION-${String(index).padStart(2, '0')}`;
  const closingId = 70_000 + index;
  await client.query(
    `INSERT INTO projects
       (id,project_code,project_name,customer_id,workflow_version,current_stage,
        status,description,created_at,updated_at)
     VALUES ($1,$2,$3,'LEGACY-CERT-CUSTOMER','legacy_v1','purchase_review',
             'active',$2,'2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [projectId, marker, `${marker} isolated fixture`]
  );
  await client.query(
    `INSERT INTO project_steps
       (project_id,step_type,step_order,status,notes,created_at,updated_at)
     VALUES ($1,'purchase_review_checklist',1,'in_progress',$2,
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z'),
            ($1,'preproduction_checklist',2,'in_progress',$2,
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [projectId, marker]
  );
  await client.query(
    `INSERT INTO purchase_review_checklists
       (customer_id,form_data,created_by,status,created_at,updated_at)
     VALUES ('LEGACY-CERT-CUSTOMER',jsonb_build_object('marker',$1),
             'legacy-certifier','DRAFT','2026-02-01T00:00:00Z',
             '2026-02-01T00:00:00Z')`,
    [marker]
  );
  await client.query(
    `INSERT INTO production_work_orders
       (work_order_number,project_id,part_number,quantity,status,wad_status,
        wizard_data,created_at,updated_at)
     VALUES ($1,$2,'LEGACY-PART',1,'DRAFT','DRAFT',
             jsonb_build_object('marker',$1,'revision',1),
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [`${marker}-WAD`, projectId]
  );
  await client.query(
    `INSERT INTO preproduction_checklists
       (project_id,project_name,status,notes,created_by,created_at,updated_at)
     VALUES ($1,$2,'in_progress',$2,'legacy-certifier',
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [projectId, marker]
  );
  const po = await client.query<{ id: number }>(
    `INSERT INTO p2_purchase_orders
       (po_number,customer_id,customer_name,po_date,expected_delivery,status,notes)
     VALUES ($1,'LEGACY-CERT-CUSTOMER','Legacy Certification Customer',
             '2026-02-01','2026-12-31','open',$1) RETURNING id`,
    [`${marker}-PO`]
  );
  const poItem = await client.query<{ id: number }>(
    `INSERT INTO p2_purchase_order_items
       (po_id,part_number,part_name,quantity,notes)
     VALUES ($1,'LEGACY-PART',$2,1,$2) RETURNING id`,
    [po.rows[0].id, marker]
  );
  await client.query(`UPDATE projects SET po_id=$1 WHERE id=$2`, [
    po.rows[0].id,
    projectId,
  ]);
  await client.query(
    `UPDATE p2_purchase_orders SET project_id=$1 WHERE id=$2`,
    [projectId, po.rows[0].id]
  );
  await client.query(
    `INSERT INTO p2_production_orders
       (order_id,p2_po_id,p2_po_item_id,project_id,sku,part_name,quantity,
        quantity_manufactured,department,status,notes,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'LEGACY-PART',$1,1,0,'QC','PENDING',$1,
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [`${marker}-PRODUCTION`, po.rows[0].id, poItem.rows[0].id, projectId]
  );
  const serialized = await client.query<{ id: string }>(
    `INSERT INTO p2_serialized_items
       (serial_number,barcode,po_id,po_item_id,po_number,part_number,part_name,
        customer_id,customer_name,sequence_number,status,metadata,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,'LEGACY-PART',$1,'LEGACY-CERT-CUSTOMER',
             'Legacy Certification Customer',1,'ACTIVE',
             jsonb_build_object('marker',$1),'2026-02-01T00:00:00Z',
             '2026-02-01T00:00:00Z') RETURNING id`,
    [
      `${marker}-SERIAL`,
      `${marker}-BARCODE`,
      po.rows[0].id,
      poItem.rows[0].id,
      `${marker}-PO`,
    ]
  );
  await client.query(
    `INSERT INTO p2_final_inspection_results
       (serialized_item_id,barcode,part_number,inspection_type,overall_result,
        notes,created_at,updated_at)
     VALUES ($1,$2,'LEGACY-PART','FINAL','PENDING',$3,
             '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
    [serialized.rows[0].id, `${marker}-BARCODE`, marker]
  );
  await client.query(
    `INSERT INTO shipment_records
       (reference,po_numbers,service_level,master_tracking_number,package_count,
        total_weight_lbs,shipped_at,ship_from_snapshot,ship_to_snapshot,documents,
        created_by,created_at,updated_at)
     VALUES ($1,$2,'Ground',$3,1,1,'2026-02-01T00:00:00Z',
             jsonb_build_object('marker',$1),jsonb_build_object('marker',$1),
             '[]','legacy-certifier','2026-02-01T00:00:00Z',
             '2026-02-01T00:00:00Z')`,
    [`${marker}-SHIPMENT`, `${marker}-PO`, `${marker}-TRACKING-PENDING`]
  );
  if (!withoutClosing) {
    await client.query(
      `INSERT INTO project_closings
         (id,project_id,summary,strengths,opportunities,created_at,updated_at)
       VALUES ($1,$2,$3,'Retained evidence','Synthetic fixture',
               '2026-02-01T00:00:00Z','2026-02-01T00:00:00Z')`,
      [closingId, projectId, marker]
    );
  }
  return { projectId, marker, closingId };
}

function assertAllowed(action: ActionCase, differences: SnapshotDifference[]) {
  const normalized = differences.map((difference) => ({
    table: difference.table,
    operation: difference.operation,
    field: difference.field,
    before: difference.before,
    after: difference.after,
  }));
  const allowed = action.allowed.map(({ reason: _reason, ...entry }) => entry);
  expect(normalized, `${action.name} changed outside its allowlist`).toEqual(
    allowed
  );
  expect(differences.length).toBe(allowed.length);
}

const actions: ActionCase[] = [
  {
    name: 'complete Purchase Review',
    execute: async (client, { marker }) => {
      await client.query(
        `UPDATE purchase_review_checklists
            SET status='APPROVED',updated_at='2026-02-02T00:00:00Z'
          WHERE form_data->>'marker'=$1`,
        [marker]
      );
    },
    allowed: [
      {
        table: 'purchase_review_checklists',
        operation: 'update',
        field: 'status',
        before: 'DRAFT',
        after: 'APPROVED',
        reason: 'Authorized Purchase Review completion',
      },
      {
        table: 'purchase_review_checklists',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact Purchase Review modification timestamp',
      },
    ],
  },
  {
    name: 'open and update WAD draft',
    execute: async (client, { projectId, marker }) => {
      await client.query(
        `UPDATE production_work_orders
            SET wizard_data=jsonb_build_object('marker',$2,'revision',2),
                updated_at='2026-02-02T00:00:00Z'
          WHERE project_id=$1`,
        [projectId, `${marker}-WAD`]
      );
    },
    allowed: [
      {
        table: 'production_work_orders',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact WAD draft modification timestamp',
      },
      {
        table: 'production_work_orders',
        operation: 'update',
        field: 'wizard_data',
        before: null,
        after: null,
        reason: 'Authorized WAD wizard revision change',
      },
    ],
  },
  {
    name: 'approve WAD through legacy path',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE production_work_orders
            SET status='RELEASED',wad_status='APPROVED',
                updated_at='2026-02-02T00:00:00Z'
          WHERE project_id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'production_work_orders',
        operation: 'update',
        field: 'status',
        before: 'DRAFT',
        after: 'RELEASED',
        reason: 'Authorized legacy WAD release',
      },
      {
        table: 'production_work_orders',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact WAD approval timestamp',
      },
      {
        table: 'production_work_orders',
        operation: 'update',
        field: 'wad_status',
        before: 'DRAFT',
        after: 'APPROVED',
        reason: 'Authorized legacy WAD approval',
      },
    ],
  },
  {
    name: 'complete Preproduction',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE preproduction_checklists
            SET status='completed',signed_by='legacy-certifier',
                signed_at='2026-02-02T00:00:00Z',
                updated_at='2026-02-02T00:00:00Z'
          WHERE project_id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'preproduction_checklists',
        operation: 'update',
        field: 'signed_at',
        before: null,
        after: '2026-02-02T00:00:00',
        reason: 'Authorized preproduction signoff time',
      },
      {
        table: 'preproduction_checklists',
        operation: 'update',
        field: 'signed_by',
        before: null,
        after: 'legacy-certifier',
        reason: 'Authorized preproduction signer',
      },
      {
        table: 'preproduction_checklists',
        operation: 'update',
        field: 'status',
        before: 'in_progress',
        after: 'completed',
        reason: 'Authorized preproduction completion',
      },
      {
        table: 'preproduction_checklists',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact preproduction modification timestamp',
      },
    ],
  },
  {
    name: 'stage legacy project for P2 release',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE projects SET current_stage='READY_FOR_P2_RELEASE',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [projectId]
      );
      await client.query(
        `UPDATE p2_purchase_orders SET status='ready_for_p2_release' WHERE project_id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'p2_purchase_orders',
        operation: 'update',
        field: 'status',
        before: 'open',
        after: 'ready_for_p2_release',
        reason: 'Authorized legacy PO staging',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'current_stage',
        before: 'purchase_review',
        after: 'READY_FOR_P2_RELEASE',
        reason: 'Authorized legacy P2 staging',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact project staging timestamp',
      },
    ],
  },
  {
    name: 'release legacy project to production',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE projects SET current_stage='IN_PRODUCTION',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [projectId]
      );
      await client.query(
        `UPDATE p2_purchase_orders SET status='in_production' WHERE project_id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'p2_purchase_orders',
        operation: 'update',
        field: 'status',
        before: 'open',
        after: 'in_production',
        reason: 'Authorized legacy PO production release',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'current_stage',
        before: 'purchase_review',
        after: 'IN_PRODUCTION',
        reason: 'Authorized legacy production release',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact production release timestamp',
      },
    ],
  },
  {
    name: 'record Production activity',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE p2_production_orders SET status='IN_PROGRESS',quantity_manufactured=1,started_at='2026-02-02T00:00:00Z',updated_at='2026-02-02T00:00:00Z' WHERE project_id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'p2_production_orders',
        operation: 'update',
        field: 'quantity_manufactured',
        before: 0,
        after: 1,
        reason: 'Authorized manufactured quantity',
      },
      {
        table: 'p2_production_orders',
        operation: 'update',
        field: 'started_at',
        before: null,
        after: '2026-02-02T00:00:00',
        reason: 'Authorized production start time',
      },
      {
        table: 'p2_production_orders',
        operation: 'update',
        field: 'status',
        before: 'PENDING',
        after: 'IN_PROGRESS',
        reason: 'Authorized production progression',
      },
      {
        table: 'p2_production_orders',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact production activity timestamp',
      },
    ],
  },
  {
    name: 'complete Quality activity',
    execute: async (client, { marker }) => {
      await client.query(
        `UPDATE p2_final_inspection_results SET overall_result='PASS',inspector_name='Legacy Inspector',updated_at='2026-02-02T00:00:00Z' WHERE notes=$1`,
        [marker]
      );
    },
    allowed: [
      {
        table: 'p2_final_inspection_results',
        operation: 'update',
        field: 'inspector_name',
        before: null,
        after: 'Legacy Inspector',
        reason: 'Authorized quality inspector',
      },
      {
        table: 'p2_final_inspection_results',
        operation: 'update',
        field: 'overall_result',
        before: 'PENDING',
        after: 'PASS',
        reason: 'Authorized quality result',
      },
      {
        table: 'p2_final_inspection_results',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact quality activity timestamp',
      },
    ],
  },
  {
    name: 'complete Shipping activity',
    execute: async (client, { marker }) => {
      await client.query(
        `UPDATE shipment_records SET master_tracking_number=$2,updated_at='2026-02-02T00:00:00Z' WHERE reference=$1`,
        [`${marker}-SHIPMENT`, `${marker}-TRACKING-COMPLETE`]
      );
    },
    allowed: [
      {
        table: 'shipment_records',
        operation: 'update',
        field: 'master_tracking_number',
        before: null,
        after: null,
        reason: 'Authorized fixture tracking transition',
      },
      {
        table: 'shipment_records',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact shipping activity timestamp',
      },
    ],
  },
  {
    name: 'create Project Closing',
    withoutClosing: true,
    execute: async (client, { projectId, marker, closingId }) => {
      await client.query(
        `INSERT INTO project_closings(id,project_id,summary,created_at,updated_at) VALUES ($1,$2,$3,'2026-02-02T00:00:00Z','2026-02-02T00:00:00Z')`,
        [closingId, projectId, marker]
      );
    },
    allowed: [],
  },
  {
    name: 'submit Project Closing through current legacy record update',
    execute: async (client, { closingId, marker }) => {
      await client.query(
        `UPDATE project_closings SET summary=$2,closed_by_display_name='Legacy Preservation Certifier',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [closingId, `${marker} submitted`]
      );
    },
    allowed: [
      {
        table: 'project_closings',
        operation: 'update',
        field: 'closed_by_display_name',
        before: null,
        after: 'Legacy Preservation Certifier',
        reason:
          'Current legacy schema records the submitter on the closing record',
      },
      {
        table: 'project_closings',
        operation: 'update',
        field: 'summary',
        before: null,
        after: null,
        reason: 'Authorized closing narrative submission',
      },
      {
        table: 'project_closings',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact closing submission timestamp',
      },
    ],
  },
  {
    name: 'approve Project Closing',
    execute: async (client, { closingId }) => {
      await client.query(
        `UPDATE project_closings SET approved_by=9201,approved_at='2026-02-02T00:00:00Z',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [closingId]
      );
    },
    allowed: [
      {
        table: 'project_closings',
        operation: 'update',
        field: 'approved_at',
        before: null,
        after: '2026-02-02T00:00:00',
        reason: 'Authorized closing approval time',
      },
      {
        table: 'project_closings',
        operation: 'update',
        field: 'approved_by',
        before: null,
        after: 9201,
        reason: 'Authorized closing approver',
      },
      {
        table: 'project_closings',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact closing approval timestamp',
      },
    ],
  },
  {
    name: 'mark project completed and closed',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE projects SET current_stage='completed',status='completed',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'projects',
        operation: 'update',
        field: 'current_stage',
        before: 'purchase_review',
        after: 'completed',
        reason: 'Authorized legacy close transition',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'status',
        before: 'active',
        after: 'completed',
        reason: 'Authorized legacy completed status',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact project close timestamp',
      },
    ],
  },
  {
    name: 'reopen legacy project',
    execute: async (client, { projectId }) => {
      await client.query(
        `UPDATE projects SET current_stage='project_closing',status='active',updated_at='2026-02-02T00:00:00Z' WHERE id=$1`,
        [projectId]
      );
    },
    allowed: [
      {
        table: 'projects',
        operation: 'update',
        field: 'current_stage',
        before: 'purchase_review',
        after: 'project_closing',
        reason: 'Authorized legacy reopening stage',
      },
      {
        table: 'projects',
        operation: 'update',
        field: 'updated_at',
        before: '2026-02-01T00:00:00',
        after: '2026-02-02T00:00:00',
        reason: 'Exact project reopen timestamp',
      },
    ],
  },
  {
    name: 'retain historical evidence after closing',
    execute: async () => undefined,
    allowed: [],
  },
  {
    name: 'retain historical evidence after reopening',
    execute: async () => undefined,
    allowed: [],
  },
];

describe.sequential(
  'legacy lifecycle action-by-action PostgreSQL allowlists',
  () => {
    beforeAll(async () => {
      await pool.query(
        `INSERT INTO employees(id,employee_code,name,user_role,employment_status,timezone)
       VALUES (9201,'LEGACY-CERT-9201','Legacy Preservation Approver','ADMIN','ACTIVE','UTC')
       ON CONFLICT (id) DO NOTHING`
      );
    });

    afterAll(async () => {
      await pool.end();
    });

    for (const [index, action] of actions.entries()) {
      it(
        action.name,
        async () => {
          const client = await pool.connect();
          await client.query('BEGIN');
          try {
            const fixture = await seedFixture(
              client,
              index + 1,
              action.withoutClosing
            );
            const before = await snapshot(client, fixture.marker);
            await action.execute(client, fixture);
            const after = await snapshot(client, fixture.marker);
            const differences = diffSnapshots(before, after);
            if (action.name === 'create Project Closing') {
              const insertFields = differences
                .filter(
                  ({ table, operation }) =>
                    table === 'project_closings' && operation === 'insert'
                )
                .map(({ field }) => field);
              expect(insertFields).toEqual([
                'approved_at',
                'approved_by',
                'closed_by',
                'closed_by_display_name',
                'created_at',
                'id',
                'next_project_recommendations',
                'opportunities',
                'project_id',
                'similarities_to_prior_projects',
                'strengths',
                'summary',
                'updated_at',
                'what_went_wrong',
              ]);
              expect(
                differences.every(
                  ({ table, operation }) =>
                    table === 'project_closings' && operation === 'insert'
                )
              ).toBe(true);
            } else {
              const expected = action.allowed.map((entry) => ({ ...entry }));
              for (const item of expected) {
                if (item.before === null && item.after === null) {
                  const actual = differences.find(
                    ({ table, operation, field }) =>
                      table === item.table &&
                      operation === item.operation &&
                      field === item.field
                  );
                  expect(actual).toBeDefined();
                  item.before = actual?.before;
                  item.after = actual?.after;
                }
              }
              assertAllowed({ ...action, allowed: expected }, differences);
            }
            const forbidden = await client.query(
              `SELECT table_name FROM (
             SELECT 'project_workflow_instances' table_name,project_id FROM project_workflow_instances
             UNION ALL SELECT 'project_workflow_step_instances',project_id FROM project_workflow_step_instances
             UNION ALL SELECT 'project_wad_authorizations',project_id FROM project_wad_authorizations
             UNION ALL SELECT 'project_production_plans',project_id FROM project_production_plans
             UNION ALL SELECT 'project_preproduction_readiness_reviews',project_id FROM project_preproduction_readiness_reviews
             UNION ALL SELECT 'project_production_releases',project_id FROM project_production_releases
             UNION ALL SELECT 'project_production_launches',project_id FROM project_production_launches
           ) forbidden WHERE project_id=$1`,
              [fixture.projectId]
            );
            expect(forbidden.rows).toHaveLength(0);
            const project = await client.query(
              `SELECT workflow_version FROM projects WHERE id=$1`,
              [fixture.projectId]
            );
            expect(project.rows[0].workflow_version).toBe('legacy_v1');
          } finally {
            await client.query('ROLLBACK');
            client.release();
          }
        },
        30_000
      );
    }
  }
);
