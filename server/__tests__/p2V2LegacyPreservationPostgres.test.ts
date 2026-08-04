import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { storage } from '../storage';
import { runSafeBootMigrations } from '../scripts/migrations/runSafeBootMigrations';
import { createQualityReview } from '../src/services/projectQualityReleaseService';
import { getActiveWorkflowInstanceForProject } from '../src/services/projectWorkflowInstanceService';
import {
  diffSnapshots,
  formatSnapshotDifferences,
  structuredSnapshot,
  type StructuredSnapshot,
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
const fixturePrefix = 'LEGACY-CERT-';
const customerId = 'LEGACY-CERT-CUSTOMER';
const actor = {
  userId: 9101,
  employeeId: 9101,
  username: 'legacy-preservation-certifier',
  displayName: 'Legacy Preservation Certifier',
  role: 'ADMIN',
};

const roots = [
  'projects',
  'p2_customers',
  'project_steps',
  'p2_purchase_orders',
  'p2_purchase_order_items',
  'production_work_orders',
  'travelers',
  'traveler_steps',
  'project_closings',
  'project_workflow_instances',
  'project_workflow_step_instances',
  'project_activity_log',
  'project_step_attachments',
  'project_documents',
  'rfq_risk_assessments',
  'purchase_review_checklists',
  'quotes',
  'quote_line_items',
  'contract_review_checklist_instances',
  'preproduction_checklists',
  'wad_revisions',
  'wad_revision_approval_history',
  'wad_production_controls',
  'wad_document_links',
  'part_routings',
  'routing_operations',
  'routing_document_links',
  'material_lot_reservations',
  'material_lots',
  'inspection_records',
  'quality_inspections',
  'certifications',
  'production_orders',
  'serialized_items',
  'p2_serialized_items',
  'p2_final_inspection_results',
  'shipping_records',
  'shipment_records',
];

const stages = [
  ['NULL', null, 'rfq_received'],
  ['LEGACY', 'legacy_v1', 'rfq_received'],
  ['RFQ', 'legacy_v1', 'rfq_received'],
  ['QUOTE', 'legacy_v1', 'quote_preparation'],
  ['PURCHASE', 'legacy_v1', 'purchase_review'],
  ['PO', 'legacy_v1', 'purchase_review'],
  ['WAD', 'legacy_v1', 'wad_creation'],
  ['PREPROD', 'legacy_v1', 'preproduction'],
  ['P2RELEASE', 'legacy_v1', 'READY_FOR_P2_RELEASE'],
  ['PRODUCTION', 'legacy_v1', 'IN_PRODUCTION'],
  ['QUALITY', 'legacy_v1', 'quality'],
  ['SHIPPING', 'legacy_v1', 'shipping'],
  ['CLOSING', 'legacy_v1', 'project_closing'],
  ['CLOSED', 'legacy_v1', 'completed'],
  ['REOPENED', 'legacy_v1', 'project_closing'],
  ['EVIDENCE', 'legacy_v1', 'project_closing'],
] as const;

type Snapshot = {
  completeHash: string;
  tables: Record<string, { hash: string; rows: string[] }>;
  structured: StructuredSnapshot;
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function discoverInventory() {
  const existing = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'`
  );
  const all = new Set(existing.rows.map((row) => row.table_name));
  const edges = await pool.query<{ source: string; target: string }>(
    `SELECT child.relname AS source,parent.relname AS target
       FROM pg_constraint c
       JOIN pg_class child ON child.oid=c.conrelid
       JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
       JOIN pg_class parent ON parent.oid=c.confrelid
       JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
      WHERE c.contype='f' AND child_ns.nspname='public'
        AND parent_ns.nspname='public'`
  );
  const included = new Set(roots.filter((table) => all.has(table)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges.rows) {
      if (included.has(edge.target)) {
        if (!included.has(edge.source)) {
          included.add(edge.source);
          changed = true;
        }
      }
    }
  }
  const excluded = [...all]
    .filter((table) => !included.has(table))
    .sort()
    .map((table) => ({
      table,
      reason:
        'No downstream foreign-key path referencing a project, step, PO, WAD, traveler, closing, workflow, or explicit evidence root',
    }));
  return {
    included: [...included].sort(),
    excluded,
    existingRoots: roots.filter((table) => all.has(table)).sort(),
    missingRoots: roots.filter((table) => !all.has(table)).sort(),
  };
}

async function snapshotTables(tables: string[]): Promise<Snapshot> {
  const snapshots: Snapshot['tables'] = {};
  const parsed: Record<string, Record<string, unknown>[]> = {};
  for (const table of tables) {
    const result = await pool.query<{ canonical: string }>(
      `SELECT canonical
         FROM (
           SELECT to_jsonb(t)::text AS canonical
             FROM ${JSON.stringify(table)} t
         ) scoped
        WHERE canonical ~* '(LEGACY-CERT|10000000-0000-4000-8000-|synthetic|historical)'
        ORDER BY md5(canonical),canonical`
    );
    const rows = result.rows.map((row) => row.canonical);
    snapshots[table] = { hash: sha256(rows.join('\n')), rows };
    parsed[table] = rows.map((row) => JSON.parse(row));
  }
  const hashes = Object.entries(snapshots)
    .map(([table, value]) => `${table}:${value.hash}`)
    .join('\n');
  return {
    completeHash: sha256(hashes),
    tables: snapshots,
    structured: structuredSnapshot(parsed),
  };
}

function assertSnapshotsEqual(before: Snapshot, after: Snapshot) {
  if (before.completeHash === after.completeHash) return;
  const differences = diffSnapshots(before.structured, after.structured);
  throw new Error(formatSnapshotDifferences(differences));
}

async function createFixtures() {
  await pool.query(
    `INSERT INTO p2_customers(customer_id,customer_name,rfq_prefix)
     VALUES ($1,'Legacy Certification Customer','LGC') ON CONFLICT DO NOTHING`,
    [customerId]
  );
  const po = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_orders
       (po_number,customer_id,customer_name,po_date,expected_delivery,status,
        revision_number,is_current_revision,notes)
     VALUES ($1,$2,'Legacy Certification Customer','2026-01-01','2026-12-31',
             'OPEN',3,true,'Synthetic legacy preservation evidence')
     RETURNING id`,
    [`${fixturePrefix}PO`, customerId]
  );
  const poItem = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_order_items
       (po_id,part_number,part_name,quantity,specifications,notes)
     VALUES ($1,'LEGACY-PART','Legacy Evidence Assembly',4,
             'Controlled synthetic specification','No protected document content')
     RETURNING id`,
    [po.rows[0].id]
  );

  let canonicalPoProjectId: string | undefined;
  for (const [index, [name, workflowVersion, stage]] of stages.entries()) {
    const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    if (name === 'PO') canonicalPoProjectId = id;
    await pool.query(
      `INSERT INTO projects
         (id,project_code,project_name,customer_id,workflow_version,current_stage,
          status,po_id,description,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
               '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
      [
        id,
        `${fixturePrefix}${name}`,
        `Legacy ${name} fixture`,
        customerId,
        workflowVersion,
        stage,
        name === 'CLOSED' ? 'completed' : 'active',
        [
          'PO',
          'WAD',
          'PREPROD',
          'P2RELEASE',
          'PRODUCTION',
          'QUALITY',
          'SHIPPING',
          'CLOSING',
          'CLOSED',
          'REOPENED',
          'EVIDENCE',
        ].includes(name)
          ? po.rows[0].id
          : null,
        'Synthetic fixture; no production or protected content',
      ]
    );
    for (let stepOrder = 1; stepOrder <= 3; stepOrder += 1) {
      await pool.query(
        `INSERT INTO project_steps
           (project_id,step_type,step_order,status,notes,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
        [
          id,
          [
            'rfq_risk_assessment',
            'purchase_review_checklist',
            'preproduction_checklist',
          ][stepOrder - 1],
          stepOrder,
          stepOrder === 1 ? 'completed' : 'pending',
          `Legacy step ${stepOrder}`,
        ]
      );
    }
  }

  if (!canonicalPoProjectId) {
    throw new Error(
      'Legacy fixture inventory is missing the canonical PO stage'
    );
  }
  await pool.query(`UPDATE p2_purchase_orders SET project_id=$1 WHERE id=$2`, [
    canonicalPoProjectId,
    po.rows[0].id,
  ]);

  const evidenceId = '10000000-0000-4000-8000-000000000016';
  const quote = await pool.query<{ id: string }>(
    `INSERT INTO quotes
       (quote_number,customer_id,customer_name,description,total_amount,status,
        project_id,valid_until,quoted_by,notes,created_at,updated_at)
     VALUES ($1,$2,'Legacy Certification Customer','Synthetic accepted quote',1250,
             'ACCEPTED',$3,'2026-12-31T00:00:00Z','legacy-certifier',
             'Historical commercial evidence','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z') RETURNING id`,
    [`${fixturePrefix}QUOTE`, customerId, evidenceId]
  );
  await pool.query(
    `INSERT INTO quote_line_items
       (quote_id,line_number,quantity,description,unit_price,total_price,
        ag_part_number,labor_hours,department,created_at)
     VALUES ($1,1,4,'Legacy Evidence Assembly',250,1000,'LEGACY-PART',12,
             'Assembly','2026-01-01T00:00:00Z')`,
    [quote.rows[0].id]
  );
  await pool.query(
    `INSERT INTO rfq_risk_assessments
       (rfq_number,customer_id,customer_name,description,form_data,
        total_overall_points,adjusted_risk_level,risk_determination,bid_decision,
        status,submitted_by,submitted_at,created_at,updated_at)
     VALUES ($1,$2,'Legacy Certification Customer','Synthetic RFQ risk evidence',
             '{"controlled":true,"risk":"low"}',3,1,'LOW','BID','submitted',
             'legacy-certifier','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    [`${fixturePrefix}RFQ`, customerId]
  );
  const purchaseReview = await pool.query<{ id: number }>(
    `INSERT INTO purchase_review_checklists
       (customer_id,form_data,created_by,status,created_at,updated_at)
     VALUES ($1,'{"projectCode":"LEGACY-CERT-EVIDENCE","approved":true}',
             'legacy-certifier','APPROVED','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z') RETURNING id`,
    [customerId]
  );
  const contractTemplate = await pool.query<{ id: number }>(
    `INSERT INTO contract_review_checklist_templates
       (name,description,version,status,is_active,created_by_display_name,
        created_at,updated_at)
     VALUES ($1,'Synthetic legacy contract review',1,'approved',true,
             'Legacy Preservation Certifier','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z') RETURNING id`,
    [`${fixturePrefix}CONTRACT-TEMPLATE`]
  );
  await pool.query(
    `INSERT INTO contract_review_checklist_instances
       (checklist_template_id,project_id,purchase_review_checklist_id,
        p2_purchase_order_id,status,review_area_status,responses,
        created_by_display_name,submitted_at,approved_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'approved','{"quality":"approved"}',
             '{"synthetic":true}','Legacy Preservation Certifier',
             '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z',
             '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`,
    [
      contractTemplate.rows[0].id,
      evidenceId,
      purchaseReview.rows[0].id,
      po.rows[0].id,
    ]
  );
  await pool.query(
    `INSERT INTO preproduction_checklists
       (project_id,project_name,po_number,status,signed_by,signed_at,notes,
        created_by,created_at,updated_at)
     VALUES ($1,'Legacy EVIDENCE fixture',$2,'completed','legacy-certifier',
             '2026-01-02T00:00:00Z','Historical preproduction evidence',
             'legacy-certifier','2026-01-01T00:00:00Z',
             '2026-01-02T00:00:00Z')`,
    [evidenceId, `${fixturePrefix}PO`]
  );
  const step = await pool.query<{ id: string }>(
    `SELECT id FROM project_steps WHERE project_id=$1 ORDER BY step_order LIMIT 1`,
    [evidenceId]
  );
  await pool.query(
    `INSERT INTO project_step_attachments
       (project_id,step_id,file_name,original_file_name,file_size,mime_type,file_path,
        notes,created_at)
     VALUES ($1,$2,'legacy-evidence.sha256','legacy-evidence.pdf',128,
             'application/pdf','isolated://legacy-certification/evidence',
             'Synthetic link only','2026-01-01T00:00:00Z')`,
    [evidenceId, step.rows[0].id]
  );
  await pool.query(
    `INSERT INTO project_activity_log
       (project_id,activity_type,description,created_at)
     VALUES ($1,'CERTIFICATION_FIXTURE','Synthetic historical activity',
             '2026-01-01T00:00:00Z')`,
    [evidenceId]
  );
  const wad = await pool.query<{ id: string }>(
    `INSERT INTO production_work_orders
       (work_order_number,project_id,part_number,quantity,status,wad_status,
        department_budgets,total_budget_hours,material_budget_amount,wizard_data,
        created_at,updated_at)
     VALUES ($1,$2,'LEGACY-PART',4,'IN_PROGRESS','APPROVED',
             '{"Assembly":{"hours":12}}',12,500,
             '{"legacy":true,"revision":3}',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z') RETURNING id`,
    [`${fixturePrefix}WAD`, evidenceId]
  );
  const revision = await pool.query<{ id: string }>(
    `INSERT INTO wad_revisions
       (wad_id,revision_code,status,revision_reason,wad_snapshot,created_at,updated_at)
     VALUES ($1,'C','approved','Historical controlled revision',
             '{"legacy":true,"revision":"C"}',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z') RETURNING id`,
    [wad.rows[0].id]
  );
  await pool.query(
    `INSERT INTO wad_revision_approval_history
       (wad_revision_id,approver_role,status,comments,signed_at)
     VALUES ($1,'QUALITY','approved','Synthetic approval evidence',
             '2026-01-02T00:00:00Z')`,
    [revision.rows[0].id]
  );
  await pool.query(
    `INSERT INTO wad_production_controls
       (work_order_id,part_type,production_type,routing_required,
        traveler_required,in_process_inspection_required,cert_required,ai_reason)
     VALUES ($1,'ASSEMBLY','LEGACY',true,true,true,true,
             'Historical explicit control')`,
    [wad.rows[0].id]
  );
  await pool.query(
    `INSERT INTO wad_document_links
       (work_order_id,template_id,template_version,template_type,template_name,file_url)
     VALUES ($1,'10000000-0000-4000-8000-000000000099',3,
             'CONTROLLED_WORK_INSTRUCTION','Legacy WI','isolated://legacy-certification/wi')`,
    [wad.rows[0].id]
  );
  const certification = await pool.query<{ id: number }>(
    `INSERT INTO certifications
       (name,description,category,validity_period_months,is_required,
        created_at,updated_at,is_active,requirements_data,work_instructions)
     VALUES ($1,'Synthetic operator qualification','Production',24,true,
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',true,
             '{"fixture":true}','Controlled synthetic work instruction')
     RETURNING id`,
    [`${fixturePrefix}CERTIFICATION`]
  );
  const routing = await pool.query<{ id: string }>(
    `INSERT INTO part_routings
       (inventory_item_id,project_id,part_number,part_name,routing_name,
        routing_revision,department_sequence,traceability_config,
        materials_config,qc_standards,routing_type,is_active,created_by,
        created_at,updated_at)
     VALUES ('LEGACY-CERT-INVENTORY',$1,'LEGACY-PART','Legacy Evidence Assembly',
             'Legacy Certification Routing',3,'["Assembly","Quality"]',
             '{"Assembly":["lot_number"]}','[{"partNumber":"LEGACY-MAT"}]',
             '[{"standardName":"Synthetic final inspection"}]','ASSEMBLY',true,
             'legacy-certifier','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z') RETURNING id`,
    [evidenceId]
  );
  await pool.query(
    `INSERT INTO routing_operations
       (part_routing_id,step_number,department_name,operation_name,
        operation_type,estimated_minutes,requires_signature,
        requires_certification,certification_id,instruction_pack,created_at)
     VALUES ($1,10,'Assembly','Synthetic assembly operation','RUN',45,true,true,$2,
             '{"instruction":"LEGACY-CERT-WI-001"}',
             '2026-01-01T00:00:00Z'),
            ($1,20,'Quality','Synthetic final inspection','INSPECT',15,true,true,$2,
             '{"specification":"LEGACY-CERT-SPEC-001"}',
             '2026-01-01T00:00:00Z')`,
    [routing.rows[0].id, certification.rows[0].id]
  );
  await pool.query(
    `INSERT INTO routing_document_links
       (part_routing_id,department_name,document_type,document_id,is_primary,
        sort_order,created_by,created_at)
     VALUES ($1,'Assembly','WORK_INSTRUCTION',
             '10000000-0000-4000-8000-000000000098',true,1,
             'legacy-certifier','2026-01-01T00:00:00Z')`,
    [routing.rows[0].id]
  );
  const traveler = await pool.query<{ id: string }>(
    `INSERT INTO travelers
       (traveler_number,traveler_revision,project_id,production_work_order_id,
        wad_revision_id,part_number,part_name,quantity,status,created_by,
        created_at,updated_at)
     VALUES ($1,3,$2,$3,$4,'LEGACY-PART','Legacy Evidence Assembly',4,
             'IN_PROGRESS','legacy-certifier',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z') RETURNING id`,
    [
      `${fixturePrefix}TRAVELER`,
      evidenceId,
      wad.rows[0].id,
      revision.rows[0].id,
    ]
  );
  await pool.query(
    `INSERT INTO traveler_steps
       (traveler_id,department_name,step_number,status,notes)
     VALUES ($1,'Assembly',10,'COMPLETE','Historical operation'),
            ($1,'Quality',20,'NOT_STARTED','Inspection required')`,
    [traveler.rows[0].id]
  );
  const materialLot = await pool.query<{ id: string }>(
    `INSERT INTO material_lots
       (inventory_item_id,material_part_number,material_name,
        internal_control_number,supplier,supplier_lot_number,
        purchase_order_number,received_qty,remaining_qty,unit_of_measure,
        status,coc_attachment,inspection_attachment,received_by,received_at,
        inspected_by,inspected_at,accepted_by,accepted_at,notes,created_at,updated_at)
     VALUES (991001,'LEGACY-MAT','Synthetic legacy material',$1,'Synthetic Supplier',
             'LEGACY-CERT-SUPPLIER-LOT',$2,10,6,'EA','ACCEPTED',
             'isolated://legacy-certification/material-coc',
             'isolated://legacy-certification/material-inspection',
             'legacy-certifier','2026-01-01T00:00:00Z','legacy-inspector',
             '2026-01-01T01:00:00Z','legacy-quality','2026-01-01T02:00:00Z',
             'Historical material evidence','2026-01-01T00:00:00Z',
             '2026-01-01T02:00:00Z') RETURNING id`,
    [`${fixturePrefix}ICN`, `${fixturePrefix}PO`]
  );
  await pool.query(
    `INSERT INTO material_lot_reservations
       (material_lot_id,traveler_id,quantity_reserved,unit_of_measure,status,
        intended_routing_step_id,notes,created_by,created_at,updated_at)
     VALUES ($1,$2,4,'EA','active','LEGACY-CERT-ROUTING-STEP-10',
             'Synthetic historical reservation','legacy-certifier',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    [materialLot.rows[0].id, traveler.rows[0].id]
  );
  await pool.query(
    `INSERT INTO p2_production_orders
       (order_id,p2_po_id,p2_po_item_id,project_id,sku,part_name,quantity,
        quantity_manufactured,department,status,priority,due_date,started_at,
        notes,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'LEGACY-PART','Legacy Evidence Assembly',4,4,
             'QC','COMPLETED',50,'2026-12-31T00:00:00Z',
             '2026-01-03T00:00:00Z','Historical production evidence',
             '2026-01-01T00:00:00Z','2026-01-04T00:00:00Z')`,
    [
      `${fixturePrefix}PRODUCTION-ORDER`,
      po.rows[0].id,
      poItem.rows[0].id,
      evidenceId,
    ]
  );
  const serializedItem = await pool.query<{ id: string }>(
    `INSERT INTO p2_serialized_items
       (serial_number,barcode,po_id,po_item_id,po_number,part_number,part_name,
        customer_id,customer_name,sequence_number,current_department,
        current_stage_index,status,department_history,metadata,final_qc_completed_at,
        completed_at,part_routing_id,part_routing_revision,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,'LEGACY-PART','Legacy Evidence Assembly',$6,
             'Legacy Certification Customer',1,'Final QC',5,'COMPLETED',
             '[{"department":"Final QC","status":"COMPLETE"}]',
             '{"synthetic":true}','2026-01-04T00:00:00Z',
             '2026-01-04T00:00:00Z',$7,3,'2026-01-01T00:00:00Z',
             '2026-01-04T00:00:00Z') RETURNING id`,
    [
      `${fixturePrefix}SERIAL-001`,
      `${fixturePrefix}BARCODE-001`,
      po.rows[0].id,
      poItem.rows[0].id,
      `${fixturePrefix}PO`,
      customerId,
      routing.rows[0].id,
    ]
  );
  await pool.query(
    `INSERT INTO p2_final_inspection_results
       (serialized_item_id,barcode,part_number,department,inspection_date,
        inspection_type,overall_result,tolerance_checks,visual_checks,
        functional_checks,inspector_name,qa_mgr_approval,qa_mgr_approval_date,
        notes,created_at,updated_at)
     VALUES ($1,$2,'LEGACY-PART','Final QC','2026-01-04T00:00:00Z','FINAL',
             'PASS','[{"dimension":"synthetic","result":"PASS"}]',
             '[{"item":"finish","result":"PASS"}]',
             '[{"test":"fit","result":"PASS"}]','Legacy Inspector',
             'Synthetic QA approval','2026-01-04T01:00:00Z',
             'Historical inspection evidence','2026-01-04T00:00:00Z',
             '2026-01-04T01:00:00Z')`,
    [serializedItem.rows[0].id, `${fixturePrefix}BARCODE-001`]
  );
  await pool.query(
    `INSERT INTO shipment_records
       (reference,po_numbers,carrier,service_level,bill_type,
        master_tracking_number,package_count,total_weight_lbs,shipped_at,
        estimated_delivery,ship_from_snapshot,ship_to_snapshot,
        notification_metadata,documents,created_by,created_at,updated_at)
     VALUES ($1,$2,'UPS','Ground','SENDER',$3,1,5,
             '2026-01-05T00:00:00Z','2026-01-08T00:00:00Z',
             '{"name":"Synthetic AGC"}','{"name":"Legacy Certification Customer"}',
             '{"outboundAttempted":false}',
             '[{"type":"packing-slip","storagePath":"isolated://legacy-certification/packing-slip"}]',
             'legacy-certifier','2026-01-05T00:00:00Z',
             '2026-01-05T00:00:00Z')`,
    [
      `${fixturePrefix}SHIPMENT`,
      `${fixturePrefix}PO`,
      `${fixturePrefix}TRACKING`,
    ]
  );
  const closing = await pool.query<{ id: number }>(
    `INSERT INTO project_closings
       (project_id,summary,strengths,opportunities,closed_by_display_name,
        approved_at,created_at,updated_at)
     VALUES ($1,'Historical closeout evidence','Traceability retained',
             'Synthetic fixture only','Legacy Preservation Certifier',
             '2026-01-06T00:00:00Z','2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z') RETURNING id`,
    [evidenceId]
  );
  await pool.query(
    `INSERT INTO project_closing_risks
       (project_id,closing_id,category,severity,description,owner,created_at)
     VALUES ($1,$2,'quality','low','Synthetic retained risk','Quality',
             '2026-01-01T00:00:00Z')`,
    [evidenceId, closing.rows[0].id]
  );
  await pool.query(
    `INSERT INTO project_closing_actions
       (project_id,closing_id,action_text,owner,status,created_at,updated_at)
     VALUES ($1,$2,'Retain historical evidence','Project Management','completed',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    [evidenceId, closing.rows[0].id]
  );
}

describe.sequential(
  'exhaustive PostgreSQL legacy preservation certification',
  () => {
    beforeAll(async () => {
      await createFixtures();
    });

    afterAll(async () => {
      await pool.end();
    });

    it('discovers and preserves the complete relational legacy evidence set', async () => {
      const inventory = await discoverInventory();
      expect(inventory.included).toEqual(
        expect.arrayContaining(inventory.existingRoots)
      );
      expect(inventory.included.length).toBeGreaterThan(25);
      for (const table of inventory.missingRoots) {
        console.log(
          `legacy_table_inventory_missing_root=${table} reason=No physical table with this category name; actual schema mappings remain discoverable from service roots and foreign keys`
        );
      }
      console.log(
        `legacy_table_inventory_included_count=${inventory.included.length}`
      );
      console.log(
        'legacy_snapshot_row_scope=immutable synthetic fixture markers LEGACY-CERT, 10000000-0000-4000-8000-*, synthetic, historical; every persisted column retained'
      );
      for (const table of inventory.included) {
        console.log(`legacy_table_inventory_included=${table}`);
      }
      console.log(
        `legacy_table_inventory_excluded_count=${inventory.excluded.length}`
      );
      for (const item of inventory.excluded) {
        console.log(
          `legacy_table_inventory_excluded=${item.table} reason=${item.reason}`
        );
      }
      console.log(
        `legacy_fixture_inventory=${JSON.stringify(stages.map(([name, workflowVersion, stage]) => ({ name, workflowVersion, stage })))}`
      );

      const before = await snapshotTables(inventory.included);
      await runSafeBootMigrations();
      await runSafeBootMigrations();

      for (let index = 0; index < stages.length; index += 1) {
        const id = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        expect(await storage.getProject(id)).toBeDefined();
        expect(await storage.getProjectSteps(id)).toHaveLength(3);
        await storage.getProjectActivityLog(id);
        await storage.getProjectStepAttachmentsByProject(id);
        await storage.getWorkOrdersByProject(id);
        await storage.getProjectClosingByProjectId(id);
        expect(await getActiveWorkflowInstanceForProject(id)).toBeNull();
        await expect(createQualityReview(id, actor)).rejects.toMatchObject({
          code: expect.stringMatching(
            /P2_V2_REQUIRED|UNKNOWN_WORKFLOW_VERSION|WORKFLOW_INSTANCE_REQUIRED/
          ),
        });
      }

      const after = await snapshotTables(inventory.included);
      console.log(`legacy_snapshot_before_sha256=${before.completeHash}`);
      console.log(`legacy_snapshot_after_sha256=${after.completeHash}`);
      assertSnapshotsEqual(before, after);
      const forbidden = await pool.query(
        `SELECT p.id
         FROM projects p
         JOIN project_workflow_instances i ON i.project_id=p.id
        WHERE p.project_code LIKE $1
           OR p.workflow_version IS NULL
           OR p.workflow_version='legacy_v1'`,
        [`${fixturePrefix}%`]
      );
      expect(forbidden.rows).toHaveLength(0);
    }, 120_000);

    it('allows intentional legacy continuation only through an explicit field allowlist', async () => {
      const id = '10000000-0000-4000-8000-000000000013';
      const before = await pool.query(`SELECT * FROM projects WHERE id=$1`, [
        id,
      ]);
      await storage.updateProject(id, {
        currentStage: 'completed',
        status: 'completed',
      });
      const after = await pool.query(`SELECT * FROM projects WHERE id=$1`, [
        id,
      ]);
      const changed = Object.keys(after.rows[0]).filter(
        (field) =>
          JSON.stringify(before.rows[0][field]) !==
          JSON.stringify(after.rows[0][field])
      );
      expect(changed.sort()).toEqual(
        ['current_stage', 'status', 'updated_at'].sort()
      );
      expect(after.rows[0].workflow_version).toBe('legacy_v1');
      expect(await getActiveWorkflowInstanceForProject(id)).toBeNull();

      const reopenedId = '10000000-0000-4000-8000-000000000015';
      const reopenedBefore = await pool.query(
        `SELECT * FROM projects WHERE id=$1`,
        [reopenedId]
      );
      await storage.updateProject(reopenedId, {
        currentStage: 'project_closing',
        status: 'active',
      });
      const reopenedAfter = await pool.query(
        `SELECT * FROM projects WHERE id=$1`,
        [reopenedId]
      );
      const reopenedChanged = Object.keys(reopenedAfter.rows[0]).filter(
        (field) =>
          JSON.stringify(reopenedBefore.rows[0][field]) !==
          JSON.stringify(reopenedAfter.rows[0][field])
      );
      expect(reopenedChanged.sort()).toEqual(['updated_at'].sort());
      expect(reopenedAfter.rows[0].workflow_version).toBe('legacy_v1');
    });
  }
);
