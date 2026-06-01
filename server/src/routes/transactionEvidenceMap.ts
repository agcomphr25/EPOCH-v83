import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { recordAuditEvent } from '../services/auditLedgerService';

type EvidenceNodeType =
  | 'project'
  | 'period'
  | 'work_order'
  | 'employee'
  | 'labor_session'
  | 'labor_cost'
  | 'material_budget'
  | 'material_lot'
  | 'material_consumption'
  | 'material_receipt'
  | 'material_request'
  | 'inventory_ledger'
  | 'payroll'
  | 'billing'
  | 'journal'
  | 'audit'
  | 'document'
  | 'missing';

type EvidenceNodeStatus = 'ok' | 'warning' | 'missing' | 'sensitive';

type EvidenceLink = {
  label: string;
  href: string;
  kind: 'app' | 'api';
};

type EvidenceNode = {
  id: string;
  type: EvidenceNodeType;
  label: string;
  subtitle?: string | null;
  status: EvidenceNodeStatus;
  sensitivity?: 'employee_rate' | 'normal';
  metrics?: Record<string, string | number | null>;
  details?: Record<string, unknown>;
  links?: EvidenceLink[];
  missingEvidence?: string[];
};

type EvidenceEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  status: EvidenceNodeStatus;
};

type JournalLineEvidence = {
  journal_entry_id: number;
  account_name: string | null;
  account_number: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  allowability: string | null;
  direct_indirect: string | null;
  cost_pool: string | null;
};

type InvoiceEvidence = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total_amount: string;
  subtotal: string;
  tax_amount: string;
  customer_id: string;
  customer_name: string | null;
  packing_slip_id: string | null;
  lot_id: string | null;
  created_by: string | null;
  created_at: string | null;
  posted_at: string | null;
  posted_by: string | null;
  sent_at: string | null;
  matched_project_ids: string[] | null;
  invoice_po_id: string | null;
  invoice_po_override: string | null;
  lot_po_id: number | null;
  packing_slip_po_id: number | null;
  line_count: number;
  billed_project_total: string;
  line_descriptions: string[];
  journal_entry_id: number | null;
  journal_status: string | null;
  journal_memo: string | null;
  journal_effective_date: string | null;
};

type WorkOrderEvidence = {
  id: string;
  work_order_number: string;
  part_number: string | null;
  status: string | null;
  wad_status: string | null;
  material_spend_cap: string | null;
};

type LiveLaborEvidence = {
  session_id: number;
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  job_title: string | null;
  clock_in: string;
  clock_out: string | null;
  hours: string;
  source: string | null;
  labor_class: string | null;
  operation: string | null;
  charge_code: string | null;
  production_work_order_id: string | null;
  work_order_number: string | null;
  traveler_id: string | null;
  traveler_number: string | null;
  approval_status: string | null;
  is_edited: boolean | null;
  timesheet_id: number | null;
  timesheet_status: string | null;
  labor_cost_record_id: number | null;
};

type MaterialConsumptionEvidence = {
  id: string;
  traveler_id: string;
  traveler_number: string | null;
  production_work_order_id: string | null;
  work_order_number: string | null;
  traveler_step_id: string | null;
  step_number: number | null;
  department_name: string | null;
  traveler_task_id: string | null;
  task_title: string | null;
  material_lot_id: string;
  internal_control_number: string;
  material_part_number: string;
  material_name: string;
  qty_used: string;
  unit_of_measure: string;
  validation_status: string;
  validation_details: Record<string, unknown> | null;
  scanned_by: string;
  scanned_at: string | null;
  badge_scan: string | null;
  was_override: boolean | null;
  override_approved_by: string | null;
  override_reason: string | null;
  received_unit_id: number | null;
  received_unit_barcode: string | null;
  notes: string | null;
  unit_cost: string | null;
  consumed_cost: string | null;
};

type MaterialReservationEvidence = {
  id: number;
  material_lot_id: string;
  traveler_id: string | null;
  traveler_number: string | null;
  production_work_order_id: string | null;
  work_order_number: string | null;
  internal_control_number: string | null;
  material_part_number: string | null;
  material_name: string | null;
  quantity_reserved: string;
  unit_of_measure: string;
  status: string;
  intended_routing_step_id: string | null;
  created_by: string;
  created_at: string | null;
  unit_cost: string | null;
  committed_cost: string | null;
};

type ProjectReceivedMaterialEvidence = {
  id: number;
  material_lot_id: string | null;
  received_unit_id: number;
  received_unit_barcode: string | null;
  receipt_id: number;
  receipt_number: string | null;
  item_code: string | null;
  item_name: string | null;
  lot_number: string | null;
  internal_control_number: string | null;
  quantity: string;
  unit_cost: string;
  extended_cost: string;
  status: string;
  accepted_by_display_name: string | null;
  accepted_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type PartRequestEvidence = {
  id: number;
  part_number: string;
  part_name: string;
  requested_by: string;
  department: string | null;
  quantity: number;
  estimated_cost: number | null;
  status: string;
  request_date: string | null;
  vendor_po_id: number | null;
  reason: string | null;
};

type InventoryLedgerEvidence = {
  id: string;
  transaction_number: string;
  transaction_type: string;
  ag_part_number: string;
  lot_id: string | null;
  quantity_delta: string;
  quantity_before: string;
  quantity_after: string;
  unit_of_measure: string;
  performed_by_display_name: string;
  source_module: string;
  source_record_id: string | null;
  event_hash: string;
  created_at: string;
  project_id: string | null;
  production_work_order_id: string | null;
  traveler_id: string | null;
};

const router = Router();
const MATERIAL_PART_REQUEST_STATUSES = [
  'APPROVED',
  'ORDERED',
  'ORDERED_PARTIAL',
  'RECEIVED',
  'RECEIVED_PARTIAL',
  'DELIVERED_TO_DEPT',
];

function requireGlennj(req: Request, res: Response, next: NextFunction) {
  const username = (req.user?.username ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (username !== 'glennj') {
    return res.status(403).json({
      error: 'Transaction evidence map is currently restricted to glennj.',
    });
  }
  return next();
}

function parsePeriod(req: Request) {
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year, month, label: period };
  }

  const year = Number(req.query.periodYear);
  const month = Number(req.query.periodMonth);
  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    return { year, month, label: `${year}-${String(month).padStart(2, '0')}` };
  }

  return null;
}

function money(value: unknown) {
  const numberValue = Number(value ?? 0);
  return numberValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function hours(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

function addNode(nodes: Map<string, EvidenceNode>, node: EvidenceNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function addEdge(edges: EvidenceEdge[], edge: EvidenceEdge) {
  if (!edges.some((existing) => existing.id === edge.id)) edges.push(edge);
}

router.get(
  '/transaction-evidence-map/projects',
  authenticateToken,
  requireGlennj,
  async (_req: Request, res: Response) => {
    try {
      const rows = await pool.query<{
        id: string;
        project_code: string | null;
        project_name: string | null;
        customer_name_snapshot: string | null;
        status: string | null;
      }>(
        `SELECT id::text, project_code, project_name, customer_name_snapshot, status
         FROM projects
         WHERE status = 'active'
         ORDER BY project_code NULLS LAST, project_name NULLS LAST
         LIMIT 500`
      );
      return res.json(rows);
    } catch (err) {
      console.error('[transaction-evidence-map/projects] failed', err);
      return res.status(500).json({ error: 'Failed to load active projects' });
    }
  }
);

router.get(
  '/transaction-evidence-map',
  authenticateToken,
  requireGlennj,
  async (req: Request, res: Response) => {
    const projectId =
      typeof req.query.projectId === 'string' ? req.query.projectId : '';
    const period = parsePeriod(req) ?? {
      year: null,
      month: null,
      label: 'All time',
    };

    if (!projectId)
      return res.status(400).json({ error: 'projectId is required' });

    try {
      const projectRows = await pool.query<{
        id: string;
        project_code: string;
        project_name: string;
        customer_id: string;
        customer_name_snapshot: string | null;
        status: string | null;
        po_id: number | null;
        default_charge_code_id: number | null;
        created_at: string | null;
      }>(
        `SELECT id, project_code, project_name, customer_id, customer_name_snapshot, status,
              po_id, default_charge_code_id, created_at
       FROM projects
       WHERE id = $1::uuid
       LIMIT 1`,
        [projectId]
      );
      const project = projectRows[0];
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const laborRows = await pool.query<{
        id: number;
        epoch_employee_id: number | null;
        employee_code: string | null;
        employee_name: string | null;
        department: string | null;
        job_title: string | null;
        canonical_id: string | null;
        source_punch_canonical_id: string | null;
        clock_in: string;
        clock_out: string;
        hours_worked: string;
        rate_used: string;
        dollar_cost: string;
        cost_type: string;
        rate_source: string;
        charge_code_id: number | null;
        charge_code: string | null;
        charge_code_description: string | null;
        production_work_order_id: string | null;
        work_order_number: string | null;
        traveler_id: string | null;
        journal_entry_id: number | null;
        journal_status: string | null;
        journal_memo: string | null;
        journal_effective_date: string | null;
        payroll_batch_ids: number[] | null;
      }>(
        `WITH project_charge_codes AS (
         SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
         FROM production_work_orders wo
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
               THEN wo.wizard_data->'step4'->'chargeCodes'
             ELSE '[]'::jsonb
           END
         ) AS cc_row
         WHERE wo.project_id = $1::uuid
       ),
       payroll_batches AS (
         SELECT
           jsonb_array_elements_text(source_timesheet_ids)::int AS timesheet_id,
           array_agg(id ORDER BY revision_number) AS batch_ids
         FROM timekeeping.payroll_export_batches
         WHERE status IN ('active', 'processed')
         GROUP BY 1
       )
       SELECT
         lcr.id,
         lcr.epoch_employee_id,
         e.employee_code,
         e.name AS employee_name,
         COALESCE(lcr.department_code, e.department) AS department,
         e.job_title,
         lcr.canonical_id,
         lcr.source_punch_canonical_id,
         lcr.clock_in,
         lcr.clock_out,
         lcr.hours_worked,
         lcr.rate_used,
         lcr.dollar_cost,
         lcr.cost_type,
         lcr.rate_source,
         lcr.charge_code_id,
         cc.code AS charge_code,
         cc.description AS charge_code_description,
         lcr.production_work_order_id,
         pwo.work_order_number,
         lcr.traveler_id,
         lcr.journal_entry_id,
         je.status AS journal_status,
         je.memo AS journal_memo,
         je.effective_date AS journal_effective_date,
         pb.batch_ids AS payroll_batch_ids
       FROM labor_cost_records lcr
       LEFT JOIN employees e ON e.id = lcr.epoch_employee_id
       LEFT JOIN charge_codes cc ON cc.id = lcr.charge_code_id
       LEFT JOIN production_work_orders pwo ON pwo.id = lcr.production_work_order_id
       LEFT JOIN journal_entries je ON je.id = lcr.journal_entry_id
       LEFT JOIN timekeeping.salaried_timesheet_lines stl
         ON lcr.canonical_id = ('stl-' || stl.timesheet_id || '-' || stl.id)
       LEFT JOIN payroll_batches pb ON pb.timesheet_id = stl.timesheet_id
       WHERE (
         lcr.project_id = $1::uuid
         OR lcr.production_work_order_id::text IN (SELECT id::text FROM production_work_orders WHERE project_id = $1::uuid)
         OR lcr.traveler_id::text IN (SELECT id::text FROM travelers WHERE project_id = $1::uuid)
         OR cc.code IN (SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL)
         OR lcr.charge_code_id = (SELECT default_charge_code_id FROM projects WHERE id = $1::uuid)
       )
      ORDER BY lcr.clock_in ASC, e.name NULLS LAST, lcr.id ASC`,
        [projectId]
      );

      const projectWorkOrders = await pool.query<WorkOrderEvidence>(
        `SELECT
         id::text,
         work_order_number,
         part_number,
         status,
         wad_status,
         NULLIF(wizard_data->'step5'->>'materialSpendCap', '') AS material_spend_cap
       FROM production_work_orders
       WHERE project_id = $1::uuid
       ORDER BY work_order_number`,
        [projectId]
      );

      const journalIds = Array.from(
        new Set(
          laborRows
            .map((r) => r.journal_entry_id)
            .filter((id): id is number => id != null)
        )
      );
      const laborRecordIds = laborRows.map((r) => String(r.id));
      const workOrderIds = Array.from(
        new Set([
          ...projectWorkOrders.map((row) => row.id),
          ...laborRows
            .map((r) => r.production_work_order_id)
            .filter((id): id is string => !!id),
        ])
      );

      const liveLaborRows = await pool.query<LiveLaborEvidence>(
        `WITH project_charge_codes AS (
         SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
         FROM production_work_orders wo
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
               THEN wo.wizard_data->'step4'->'chargeCodes'
             ELSE '[]'::jsonb
           END
         ) AS cc_row
         WHERE wo.project_id = $1::uuid
           AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
       )
       SELECT
         pl.id AS session_id,
         pl.employee_id,
         e.employee_code,
         e.name AS employee_name,
         COALESCE(pl.department, e.department) AS department,
         e.job_title,
         pl.clock_in,
         pl.clock_out,
         ROUND(EXTRACT(EPOCH FROM (COALESCE(pl.clock_out, NOW()) - pl.clock_in)) / 3600.0, 4)::text AS hours,
         pl.source,
         pl.labor_class,
         pl.operation,
         COALESCE(lcc.code, pl.charge_code) AS charge_code,
         COALESCE(pl.production_work_order_id, t.production_work_order_id)::text AS production_work_order_id,
         wo.work_order_number,
         pl.traveler_id,
         t.traveler_number,
         pl.approval_status,
         pl.is_edited,
         ts.id AS timesheet_id,
         ts.status AS timesheet_status,
         lcr.id AS labor_cost_record_id
       FROM punch_ledger pl
       JOIN employees e ON e.id = pl.employee_id
       LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
       LEFT JOIN travelers t ON t.id::text = pl.traveler_id
       LEFT JOIN production_work_orders wo ON wo.id = COALESCE(pl.production_work_order_id, t.production_work_order_id)
       LEFT JOIN timekeeping.timesheets ts
         ON ts.employee_id = pl.employee_id
        AND pl.clock_in::date BETWEEN ts.period_start::date AND ts.period_end::date
       LEFT JOIN LATERAL (
         SELECT id
         FROM labor_cost_records lcr_match
         WHERE lcr_match.source_punch_canonical_id = ('pl-' || pl.id::text)
            OR lcr_match.canonical_id = ('pl-' || pl.id::text)
         ORDER BY id DESC
         LIMIT 1
       ) lcr ON true
       WHERE pl.labor_class = 'REGULAR'
         AND (
           pl.project_id = $1::uuid
           OR pl.production_work_order_id IN (SELECT id FROM production_work_orders WHERE project_id = $1::uuid)
           OR pl.traveler_id IN (SELECT id::text FROM travelers WHERE project_id = $1::uuid)
           OR COALESCE(lcc.code, pl.charge_code) IN (
             SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL
           )
         )
       ORDER BY pl.clock_in ASC, e.name ASC, pl.id ASC`,
        [projectId]
      );

      const materialBudgetRows = projectWorkOrders.filter(
        (row) => Number(row.material_spend_cap ?? 0) > 0
      );

      const materialReservationRows = await pool
        .query<MaterialReservationEvidence>(
          `SELECT
         mlr.id,
         mlr.material_lot_id::text,
         mlr.traveler_id::text,
         t.traveler_number,
         t.production_work_order_id::text,
         wo.work_order_number,
         ml.internal_control_number,
         COALESCE(ii.ag_part_number, ml.material_part_number) AS material_part_number,
         COALESCE(ii.name, ml.material_name) AS material_name,
         mlr.quantity_reserved,
         mlr.unit_of_measure,
         mlr.status,
         mlr.intended_routing_step_id,
         mlr.created_by,
         mlr.created_at,
         COALESCE(ii.unit_cost, 0)::text AS unit_cost,
         (mlr.quantity_reserved * COALESCE(ii.unit_cost, 0))::text AS committed_cost
       FROM material_lot_reservations mlr
       JOIN material_lots ml ON ml.id = mlr.material_lot_id
       LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
       LEFT JOIN travelers t ON t.id::text = mlr.traveler_id::text
       LEFT JOIN production_work_orders wo ON wo.id = t.production_work_order_id
       WHERE mlr.traveler_id::text IN (SELECT id::text FROM travelers WHERE project_id = $1::uuid)
       ORDER BY mlr.created_at DESC, mlr.id DESC
       LIMIT 250`,
          [projectId]
        )
        .catch(() => []);

      const materialConsumptionRows = await pool
        .query<MaterialConsumptionEvidence>(
          `SELECT
         tmc.id::text,
         tmc.traveler_id::text,
         t.traveler_number,
         t.production_work_order_id::text,
         wo.work_order_number,
         tmc.traveler_step_id::text,
         ts.step_number,
         ts.department_name,
         tmc.traveler_task_id::text,
         tt.title AS task_title,
         tmc.material_lot_id::text,
         tmc.internal_control_number,
         tmc.material_part_number,
         tmc.material_name,
         COALESCE(tmc.qty_used, tmc.quantity_used, 0)::text AS qty_used,
         tmc.unit_of_measure,
         tmc.validation_status,
         tmc.validation_details,
         tmc.scanned_by,
         tmc.scanned_at,
         tmc.badge_scan,
         tmc.was_override,
         tmc.override_approved_by,
         tmc.override_reason,
         tmc.received_unit_id,
         ru.barcode AS received_unit_barcode,
         tmc.notes,
         COALESCE(ii.unit_cost, 0)::text AS unit_cost,
         (COALESCE(tmc.qty_used, tmc.quantity_used, 0) * COALESCE(ii.unit_cost, 0))::text AS consumed_cost
       FROM traveler_material_consumption tmc
       JOIN travelers t ON t.id::text = tmc.traveler_id::text
       LEFT JOIN production_work_orders wo ON wo.id = t.production_work_order_id
       LEFT JOIN traveler_steps ts ON ts.id::text = tmc.traveler_step_id::text
       LEFT JOIN traveler_tasks tt ON tt.id::text = tmc.traveler_task_id::text
       LEFT JOIN material_lots ml ON ml.id = tmc.material_lot_id
       LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
       LEFT JOIN received_units ru ON ru.id = tmc.received_unit_id
       WHERE t.project_id = $1::uuid
       ORDER BY COALESCE(tmc.scanned_at, tmc.created_at) DESC, tmc.id DESC
       LIMIT 250`,
          [projectId]
        )
        .catch(() => []);

      const projectReceivedMaterialRows = await pool
        .query<ProjectReceivedMaterialEvidence>(
          `SELECT
         prm.id,
         prm.material_lot_id::text,
         prm.received_unit_id,
         ru.barcode AS received_unit_barcode,
         prm.receipt_id,
         r.receipt_number,
         COALESCE(ii.ag_part_number, rl.ag_part_number) AS item_code,
         COALESCE(ii.name, rl.description) AS item_name,
         COALESCE(ru.lot_number, ml.supplier_lot_number) AS lot_number,
         COALESCE(ru.internal_control_number, ml.internal_control_number) AS internal_control_number,
         prm.quantity,
         prm.unit_cost,
         prm.extended_cost,
         prm.status,
         prm.accepted_by_display_name,
         prm.accepted_at,
         prm.notes,
         prm.created_at
       FROM project_received_materials prm
       JOIN received_units ru ON ru.id = prm.received_unit_id
       JOIN receipts r ON r.id = prm.receipt_id
       JOIN receipt_lines rl ON rl.id = ru.receipt_line_id
       LEFT JOIN material_lots ml ON ml.id = prm.material_lot_id
       LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
       WHERE prm.project_id = $1::uuid
         AND prm.status IN ('pending_pm_acceptance', 'accepted')
       ORDER BY COALESCE(prm.accepted_at, prm.created_at) DESC, prm.id DESC
       LIMIT 250`,
          [projectId]
        )
        .catch(() => []);

      const partRequestRows = await pool
        .query<PartRequestEvidence>(
          `SELECT
         id,
         part_number,
         part_name,
         requested_by,
         department,
         quantity,
         estimated_cost,
         status,
         request_date,
         vendor_po_id,
         reason
       FROM parts_requests
       WHERE project_id = $1::uuid
         AND is_active = true
         AND status = ANY($2::text[])
       ORDER BY request_date DESC, id DESC
       LIMIT 250`,
          [projectId, MATERIAL_PART_REQUEST_STATUSES]
        )
        .catch(() => []);

      const inventoryLedgerRows = await pool
        .query<InventoryLedgerEvidence>(
          `SELECT
         id::text,
         transaction_number,
         transaction_type,
         ag_part_number,
         lot_id::text,
         quantity_delta,
         quantity_before,
         quantity_after,
         unit_of_measure,
         performed_by_display_name,
         source_module,
         source_record_id,
         event_hash,
         created_at,
         project_id::text,
         production_work_order_id::text,
         traveler_id::text
       FROM inventory_transaction_ledger
       WHERE (
           project_id = $1::uuid
           OR production_work_order_id IN (SELECT id FROM production_work_orders WHERE project_id = $1::uuid)
           OR traveler_id IN (SELECT id::text FROM travelers WHERE project_id = $1::uuid)
           OR source_record_id = ANY($2::text[])
         )
       ORDER BY created_at DESC
       LIMIT 250`,
          [
            projectId,
            materialConsumptionRows.map((row) => row.id),
          ]
        )
        .catch(() => []);

      const employeeIds = Array.from(
        new Set([
          ...laborRows
            .map((r) => r.epoch_employee_id)
            .filter((id): id is number => id != null),
          ...liveLaborRows
            .map((r) => r.employee_id)
            .filter((id): id is number => id != null),
        ])
      );

      const invoiceRows = await pool
        .query<InvoiceEvidence>(
          `SELECT
         inv.id::text,
         inv.invoice_number,
         inv.invoice_date::text,
         inv.due_date::text,
         inv.status,
         inv.total_amount,
         inv.subtotal,
         inv.tax_amount,
         inv.customer_id,
         c.customer_name,
         inv.packing_slip_id::text,
         inv.lot_id::text,
         inv.created_by,
         inv.created_at::text,
         inv.posted_at::text,
         inv.posted_by,
         inv.sent_at::text,
         array_remove(array_agg(DISTINCT lines.project_id), NULL) AS matched_project_ids,
         inv.po_id AS invoice_po_id,
         inv.po_override AS invoice_po_override,
         inv_lot.po_id AS lot_po_id,
         slip_lot.po_id AS packing_slip_po_id,
         COUNT(DISTINCT lines.id)::int AS line_count,
         COALESCE(SUM(lines.line_total::numeric), 0)::text AS billed_project_total,
         COALESCE(
           ARRAY_AGG(lines.description ORDER BY lines.created_at, lines.id) FILTER (WHERE lines.description IS NOT NULL),
           ARRAY[]::text[]
         ) AS line_descriptions,
         je.id AS journal_entry_id,
         je.status AS journal_status,
         je.memo AS journal_memo,
         je.effective_date::text AS journal_effective_date
       FROM ar_invoices inv
       LEFT JOIN ar_invoice_lines lines ON lines.invoice_id = inv.id
       LEFT JOIN p2_customers c ON c.customer_id = inv.customer_id
       LEFT JOIN p2_lot_numbers inv_lot ON inv_lot.id = inv.lot_id
       LEFT JOIN p2_packing_slips slip ON slip.id = inv.packing_slip_id
       LEFT JOIN p2_lot_numbers slip_lot ON slip_lot.id = slip.lot_number_id
       LEFT JOIN journal_entries je ON je.reference_uuid = inv.id
       WHERE
         lines.project_id IN ($1, $2)
         OR inv.wad_id = ANY($4::uuid[])
         OR ($3::int IS NOT NULL AND inv.po_id = $3::text)
         OR ($3::int IS NOT NULL AND inv_lot.po_id = $3::int)
         OR ($3::int IS NOT NULL AND slip_lot.po_id = $3::int)
       GROUP BY inv.id, c.customer_name, inv_lot.po_id, slip_lot.po_id, je.id, je.status, je.memo, je.effective_date
       ORDER BY inv.invoice_date DESC, inv.invoice_number DESC`,
          [projectId, project.project_code, project.po_id, workOrderIds]
        )
        .catch(() => []);

      const invoiceIds = invoiceRows.map((row) => row.id);
      const invoiceJournalIds = invoiceRows
        .map((row) => row.journal_entry_id)
        .filter((id): id is number => id != null);
      const allJournalIds = Array.from(
        new Set([...journalIds, ...invoiceJournalIds])
      );

      const journalLines: JournalLineEvidence[] = allJournalIds.length
        ? await pool.query<JournalLineEvidence>(
            `SELECT jl.journal_entry_id, coa.account_name, coa.account_number,
                  jl.debit_amount, jl.credit_amount, jl.allowability,
                  jl.direct_indirect, jl.cost_pool
           FROM journal_lines jl
           LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
           WHERE jl.journal_entry_id = ANY($1::int[])
           ORDER BY jl.journal_entry_id, jl.id`,
            [allJournalIds]
          )
        : [];

      const projectDocs = await pool
        .query<{
          id: number;
          label: string | null;
          original_file_name: string;
          mime_type: string | null;
          file_size: number | null;
          created_at: string | null;
        }>(
          `SELECT id, label, original_file_name, mime_type, file_size, created_at
       FROM project_documents
       WHERE project_id = $1::uuid
       ORDER BY created_at DESC`,
          [projectId]
        )
        .catch(() => []);

      const auditRows = await pool.query<{
        id: number;
        action: string;
        subject_type: string | null;
        subject_id: string | null;
        entity_type: string | null;
        entity_id: string | null;
        actor_name: string | null;
        row_hash: string | null;
        sequence_number: number | null;
        occurred_at: string | null;
        created_at: string | null;
      }>(
        `SELECT id, action, subject_type, subject_id, entity_type, entity_id, actor_name,
              row_hash, sequence_number, occurred_at, created_at
       FROM audit_events
       WHERE
         (subject_type = 'project' AND subject_id = $1)
         OR (entity_type = 'project' AND entity_id = $1)
         OR (subject_type IN ('labor_cost_record', 'labor_cost_records') AND subject_id = ANY($2::text[]))
         OR (entity_type IN ('labor_cost_record', 'labor_cost_records') AND entity_id = ANY($2::text[]))
         OR (subject_type IN ('journal_entry', 'journal_entries') AND subject_id = ANY($3::text[]))
         OR (entity_type IN ('journal_entry', 'journal_entries') AND entity_id = ANY($3::text[]))
         OR (subject_type IN ('production_work_order', 'production_work_orders') AND subject_id = ANY($4::text[]))
         OR (entity_type IN ('production_work_order', 'production_work_orders') AND entity_id = ANY($4::text[]))
         OR (subject_type IN ('ar_invoice', 'ar_invoices') AND subject_id = ANY($6::text[]))
         OR (entity_type IN ('ar_invoice', 'ar_invoices') AND entity_id = ANY($6::text[]))
         OR (actor_id = ANY($5::int[]) AND action IN ('DAILY_CERTIFIED', 'DAILY_SUPERVISOR_APPROVED', 'TIME_CERTIFIED_ADMIN'))
       ORDER BY COALESCE(occurred_at, created_at) DESC
       LIMIT 250`,
        [
          projectId,
          laborRecordIds,
          allJournalIds.map(String),
          workOrderIds,
          employeeIds,
          invoiceIds,
        ]
      );

      const linesByJournal = new Map<number, JournalLineEvidence[]>();
      for (const line of journalLines) {
        const bucket = linesByJournal.get(line.journal_entry_id) ?? [];
        bucket.push(line);
        linesByJournal.set(line.journal_entry_id, bucket);
      }

      const liveLaborHours = liveLaborRows.reduce(
        (sum, row) => sum + Number(row.hours ?? 0),
        0
      );
      const materialConsumedCost = materialConsumptionRows.reduce(
        (sum, row) => sum + Number(row.consumed_cost ?? 0),
        0
      );
      const materialCommittedCost = materialReservationRows.reduce(
        (sum, row) => sum + Number(row.committed_cost ?? 0),
        0
      );
      const materialReceivedCost = projectReceivedMaterialRows.reduce(
        (sum, row) => sum + Number(row.extended_cost ?? 0),
        0
      );
      const employeeEvidence = new Map<
        number,
        {
          livePunches: LiveLaborEvidence[];
          postedLaborCosts: typeof laborRows;
        }
      >();
      for (const row of liveLaborRows) {
        const bucket = employeeEvidence.get(row.employee_id) ?? {
          livePunches: [],
          postedLaborCosts: [],
        };
        bucket.livePunches.push(row);
        employeeEvidence.set(row.employee_id, bucket);
      }
      for (const row of laborRows) {
        if (!row.epoch_employee_id) continue;
        const bucket = employeeEvidence.get(row.epoch_employee_id) ?? {
          livePunches: [],
          postedLaborCosts: [],
        };
        bucket.postedLaborCosts.push(row);
        employeeEvidence.set(row.epoch_employee_id, bucket);
      }

      const nodes = new Map<string, EvidenceNode>();
      const edges: EvidenceEdge[] = [];

      addNode(nodes, {
        id: `project:${project.id}`,
        type: 'project',
        label: project.project_code,
        subtitle: project.project_name,
        status: 'ok',
        metrics: {
          customer: project.customer_name_snapshot ?? project.customer_id,
          status: project.status,
        },
        details: project,
        links: [
          {
            label: 'Open project',
            href: `/projects/${project.id}`,
            kind: 'app',
          },
        ],
        missingEvidence: projectDocs.length
          ? []
          : ['No project-level documents are attached.'],
      });

      addNode(nodes, {
        id: `period:${period.label}`,
        type: 'period',
        label: period.label,
        subtitle: 'Project traceability scope',
        status:
          laborRows.length ||
          liveLaborRows.length ||
          materialConsumptionRows.length
            ? 'ok'
            : 'missing',
        metrics: {
          laborRecords: laborRows.length,
          liveLaborSessions: liveLaborRows.length,
          laborDollars: money(
            laborRows.reduce(
              (sum, row) => sum + Number(row.dollar_cost ?? 0),
              0
            )
          ),
          costedHours: hours(
            laborRows.reduce(
              (sum, row) => sum + Number(row.hours_worked ?? 0),
              0
            )
          ),
          liveHours: hours(liveLaborHours),
          materialConsumed: money(materialConsumedCost),
        },
        missingEvidence: [
          laborRows.length
            ? null
            : 'No posted labor cost records found for this project.',
          liveLaborRows.length
            ? null
            : 'No punch-ledger labor found for this project.',
        ].filter((item): item is string => !!item),
      });
      addEdge(edges, {
        id: `project:${project.id}->period:${period.label}`,
        from: `project:${project.id}`,
        to: `period:${period.label}`,
        label: 'evidence scope',
        status:
          laborRows.length ||
          liveLaborRows.length ||
          materialConsumptionRows.length
            ? 'ok'
            : 'missing',
      });

      for (const doc of projectDocs) {
        const docId = `document:project:${doc.id}`;
        addNode(nodes, {
          id: docId,
          type: 'document',
          label: doc.label || doc.original_file_name,
          subtitle: doc.mime_type,
          status: 'ok',
          details: doc,
          links: [
            {
              label: 'Open evidence',
              href: `/api/projects/${project.id}/documents/${doc.id}/file`,
              kind: 'api',
            },
          ],
        });
        addEdge(edges, {
          id: `project:${project.id}->${docId}`,
          from: `project:${project.id}`,
          to: docId,
          label: 'attached document',
          status: 'ok',
        });
      }

      for (const wad of projectWorkOrders) {
        const workOrderId = `work_order:${wad.id}`;
        addNode(nodes, {
          id: workOrderId,
          type: 'work_order',
          label: wad.work_order_number || 'WAD',
          subtitle: [wad.part_number, wad.wad_status ?? wad.status]
            .filter(Boolean)
            .join(' | '),
          status:
            wad.wad_status === 'APPROVED' || wad.status ? 'ok' : 'warning',
          details: wad,
          links: [
            {
              label: 'Open WAD summary',
              href: `/work-orders/${wad.id}/wad-summary`,
              kind: 'app',
            },
          ],
        });
        addEdge(edges, {
          id: `project:${project.id}->${workOrderId}`,
          from: `project:${project.id}`,
          to: workOrderId,
          label: 'WAD',
          status: 'ok',
        });
      }

      for (const row of liveLaborRows) {
        const employeeId = `employee:${row.employee_id}`;
        const aggregate = employeeEvidence.get(row.employee_id);
        const laborSessionId = `labor_session:${row.session_id}`;
        const workOrderId = row.production_work_order_id
          ? `work_order:${row.production_work_order_id}`
          : null;
        const sessionMissing = [
          row.labor_cost_record_id
            ? null
            : 'No labor cost record has been created for this punch yet.',
          row.timesheet_id
            ? null
            : 'No matching timesheet found for this punch date.',
          row.charge_code ? null : 'No charge code captured on the punch.',
        ].filter((item): item is string => !!item);

        addNode(nodes, {
          id: employeeId,
          type: 'employee',
          label: row.employee_name || 'Unknown employee',
          subtitle: [row.employee_code, row.department, row.job_title]
            .filter(Boolean)
            .join(' | '),
          status: 'sensitive',
          sensitivity: 'employee_rate',
          metrics: {
            liveHours: Number(
              (aggregate?.livePunches ?? []).reduce(
                (sum, punch) => sum + Number(punch.hours ?? 0),
                0
              ).toFixed(4)
            ),
            sessions: aggregate?.livePunches.length ?? 1,
            postedLaborRecords: aggregate?.postedLaborCosts.length ?? 0,
            postedLaborHours: Number(
              (aggregate?.postedLaborCosts ?? []).reduce(
                (sum, labor) => sum + Number(labor.hours_worked ?? 0),
                0
              ).toFixed(4)
            ),
          },
          details: {
            employeeId: row.employee_id,
            employeeCode: row.employee_code,
            department: row.department,
            jobTitle: row.job_title,
            projectPunches: aggregate?.livePunches ?? [row],
            postedLaborCosts: aggregate?.postedLaborCosts ?? [],
          },
        });

        addNode(nodes, {
          id: laborSessionId,
          type: 'labor_session',
          label: `Punch session #${row.session_id}`,
          subtitle: `${hours(row.hours)} hrs | ${row.charge_code ?? 'no charge code'} | ${row.work_order_number ?? row.traveler_number ?? 'project labor'}`,
          status: sessionMissing.length ? 'warning' : 'ok',
          metrics: {
            hours: Number(row.hours),
            chargeCode: row.charge_code,
            laborCostRecord: row.labor_cost_record_id,
            timesheet: row.timesheet_id,
          },
          details: row,
          missingEvidence: sessionMissing,
        });

        addEdge(edges, {
          id: `${employeeId}->${laborSessionId}`,
          from: employeeId,
          to: laborSessionId,
          label: 'worked session',
          status: sessionMissing.length ? 'warning' : 'ok',
        });
        addEdge(edges, {
          id: `${workOrderId ?? `period:${period.label}`}->${laborSessionId}`,
          from: workOrderId ?? `period:${period.label}`,
          to: laborSessionId,
          label: 'time charged',
          status: sessionMissing.length ? 'warning' : 'ok',
        });
        if (row.labor_cost_record_id) {
          addEdge(edges, {
            id: `${laborSessionId}->labor:${row.labor_cost_record_id}`,
            from: laborSessionId,
            to: `labor:${row.labor_cost_record_id}`,
            label: 'costed as',
            status: 'ok',
          });
        }
      }

      for (const row of materialBudgetRows) {
        const budgetId = `material_budget:${row.id}`;
        addNode(nodes, {
          id: budgetId,
          type: 'material_budget',
          label: `${row.work_order_number} material budget`,
          subtitle: `${money(row.material_spend_cap)} authorized spend cap`,
          status: 'ok',
          metrics: {
            plannedSpendCap: money(row.material_spend_cap),
          },
          details: row,
        });
        addEdge(edges, {
          id: `work_order:${row.id}->${budgetId}`,
          from: `work_order:${row.id}`,
          to: budgetId,
          label: 'material budget',
          status: 'ok',
        });
      }

      for (const row of materialReservationRows) {
        const lotId = `material_lot:${row.material_lot_id}`;
        const reservationId = `material_request:reservation:${row.id}`;
        const workOrderId = row.production_work_order_id
          ? `work_order:${row.production_work_order_id}`
          : `project:${project.id}`;
        const reservationMissing = [
          row.internal_control_number
            ? null
            : 'Reservation has no ICN evidence.',
          row.status === 'active' || row.status === 'fulfilled'
            ? null
            : `Reservation status is ${row.status}.`,
        ].filter((item): item is string => !!item);

        addNode(nodes, {
          id: lotId,
          type: 'material_lot',
          label:
            row.internal_control_number ||
            row.material_part_number ||
            `Lot ${row.material_lot_id}`,
          subtitle: [row.material_part_number, row.material_name]
            .filter(Boolean)
            .join(' | '),
          status: row.internal_control_number ? 'ok' : 'warning',
          metrics: {
            committedCost: money(row.committed_cost),
            reservedQty: Number(row.quantity_reserved),
          },
          details: row,
          missingEvidence: row.internal_control_number
            ? []
            : ['Material lot is missing an internal control number.'],
        });

        addNode(nodes, {
          id: reservationId,
          type: 'material_request',
          label: `Reservation #${row.id}`,
          subtitle: `${hours(row.quantity_reserved)} ${row.unit_of_measure} | ${row.status}`,
          status: reservationMissing.length ? 'warning' : 'ok',
          metrics: {
            quantityReserved: Number(row.quantity_reserved),
            committedCost: money(row.committed_cost),
          },
          details: row,
          missingEvidence: reservationMissing,
        });

        addEdge(edges, {
          id: `${workOrderId}->${reservationId}`,
          from: workOrderId,
          to: reservationId,
          label: 'reserved material',
          status: reservationMissing.length ? 'warning' : 'ok',
        });
        addEdge(edges, {
          id: `${reservationId}->${lotId}`,
          from: reservationId,
          to: lotId,
          label: 'reserved lot',
          status: row.internal_control_number ? 'ok' : 'warning',
        });
      }

      for (const row of projectReceivedMaterialRows) {
        const receiptId = `material_receipt:${row.id}`;
        const lotId = row.material_lot_id
          ? `material_lot:${row.material_lot_id}`
          : null;
        const receiptMissing = [
          row.status === 'accepted'
            ? null
            : 'Received material is pending PM acceptance.',
          row.internal_control_number ? null : 'Received unit has no ICN.',
        ].filter((item): item is string => !!item);

        if (lotId) {
          addNode(nodes, {
            id: lotId,
            type: 'material_lot',
            label:
              row.internal_control_number ||
              row.item_code ||
              `Lot ${row.material_lot_id}`,
            subtitle: [row.item_code, row.item_name, row.lot_number]
              .filter(Boolean)
              .join(' | '),
            status: row.internal_control_number ? 'ok' : 'warning',
            details: row,
            missingEvidence: row.internal_control_number
              ? []
              : ['Material lot is missing an internal control number.'],
          });
        }

        addNode(nodes, {
          id: receiptId,
          type: 'material_receipt',
          label: row.receipt_number || `Received material #${row.id}`,
          subtitle: `${row.status} | ${money(row.extended_cost)} | ${row.item_code ?? 'item'}`,
          status: receiptMissing.length ? 'warning' : 'ok',
          metrics: {
            quantity: Number(row.quantity),
            extendedCost: money(row.extended_cost),
            status: row.status,
          },
          details: row,
          missingEvidence: receiptMissing,
        });
        addEdge(edges, {
          id: `project:${project.id}->${receiptId}`,
          from: `project:${project.id}`,
          to: receiptId,
          label: 'received material',
          status: receiptMissing.length ? 'warning' : 'ok',
        });
        if (lotId) {
          addEdge(edges, {
            id: `${receiptId}->${lotId}`,
            from: receiptId,
            to: lotId,
            label: 'accepted as lot',
            status: row.status === 'accepted' ? 'ok' : 'warning',
          });
        }
      }

      for (const row of materialConsumptionRows) {
        const lotId = `material_lot:${row.material_lot_id}`;
        const consumptionId = `material_consumption:${row.id}`;
        const workOrderId = row.production_work_order_id
          ? `work_order:${row.production_work_order_id}`
          : `project:${project.id}`;
        const consumptionMissing = [
          row.internal_control_number ? null : 'Consumption has no ICN.',
          row.received_unit_id
            ? null
            : 'Consumption is not linked to a received unit.',
          row.validation_status === 'VALID'
            ? null
            : `Material validation status was ${row.validation_status}.`,
          row.was_override && !row.override_approved_by
            ? 'Override consumption has no approver recorded.'
            : null,
        ].filter((item): item is string => !!item);

        addNode(nodes, {
          id: lotId,
          type: 'material_lot',
          label: row.internal_control_number || row.material_part_number,
          subtitle: [row.material_part_number, row.material_name]
            .filter(Boolean)
            .join(' | '),
          status: row.internal_control_number ? 'ok' : 'warning',
          metrics: {
            consumedCost: money(row.consumed_cost),
            consumedQty: Number(row.qty_used),
          },
          details: {
            materialLotId: row.material_lot_id,
            internalControlNumber: row.internal_control_number,
            materialPartNumber: row.material_part_number,
            materialName: row.material_name,
            receivedUnitId: row.received_unit_id,
            receivedUnitBarcode: row.received_unit_barcode,
          },
          missingEvidence: row.internal_control_number
            ? []
            : ['Material lot is missing an internal control number.'],
        });

        addNode(nodes, {
          id: consumptionId,
          type: 'material_consumption',
          label: `Consumed ${row.material_part_number}`,
          subtitle: `${hours(row.qty_used)} ${row.unit_of_measure} | ${row.validation_status} | ${row.scanned_by}`,
          status: consumptionMissing.length ? 'warning' : 'ok',
          metrics: {
            quantityUsed: Number(row.qty_used),
            consumedCost: money(row.consumed_cost),
            validation: row.validation_status,
          },
          details: row,
          missingEvidence: consumptionMissing,
        });
        addEdge(edges, {
          id: `${workOrderId}->${consumptionId}`,
          from: workOrderId,
          to: consumptionId,
          label: 'material consumed',
          status: consumptionMissing.length ? 'warning' : 'ok',
        });
        addEdge(edges, {
          id: `${lotId}->${consumptionId}`,
          from: lotId,
          to: consumptionId,
          label: 'issued to traveler',
          status: consumptionMissing.length ? 'warning' : 'ok',
        });
      }

      for (const row of partRequestRows) {
        const requestId = `material_request:parts:${row.id}`;
        const requestMissing = [
          row.vendor_po_id
            ? null
            : 'Parts request is not linked to a vendor PO.',
          row.estimated_cost != null
            ? null
            : 'Parts request has no estimated cost.',
        ].filter((item): item is string => !!item);

        addNode(nodes, {
          id: requestId,
          type: 'material_request',
          label: `Parts request #${row.id}`,
          subtitle: `${row.part_number} | ${row.status} | qty ${row.quantity}`,
          status: requestMissing.length ? 'warning' : 'ok',
          metrics: {
            quantity: row.quantity,
            estimatedCost:
              row.estimated_cost == null
                ? null
                : money(row.estimated_cost * row.quantity),
            status: row.status,
          },
          details: row,
          missingEvidence: requestMissing,
        });
        addEdge(edges, {
          id: `project:${project.id}->${requestId}`,
          from: `project:${project.id}`,
          to: requestId,
          label: 'parts request',
          status: requestMissing.length ? 'warning' : 'ok',
        });
      }

      for (const row of inventoryLedgerRows) {
        const ledgerId = `inventory_ledger:${row.id}`;
        const targetId =
          row.source_record_id &&
          nodes.has(`material_consumption:${row.source_record_id}`)
            ? `material_consumption:${row.source_record_id}`
            : row.production_work_order_id &&
                nodes.has(`work_order:${row.production_work_order_id}`)
              ? `work_order:${row.production_work_order_id}`
              : `project:${project.id}`;

        addNode(nodes, {
          id: ledgerId,
          type: 'inventory_ledger',
          label: row.transaction_number,
          subtitle: `${row.transaction_type} | ${row.ag_part_number} | ${row.quantity_delta} ${row.unit_of_measure}`,
          status: row.event_hash ? 'ok' : 'warning',
          metrics: {
            quantityDelta: Number(row.quantity_delta),
            hash: row.event_hash ? `${row.event_hash.slice(0, 12)}...` : null,
          },
          details: row,
          missingEvidence: row.event_hash
            ? []
            : ['Inventory ledger event hash is missing.'],
        });
        addEdge(edges, {
          id: `${targetId}->${ledgerId}`,
          from: targetId,
          to: ledgerId,
          label: 'inventory ledger',
          status: row.event_hash ? 'ok' : 'warning',
        });
      }

      for (const row of laborRows) {
        if (row.production_work_order_id) {
          const workOrderId = `work_order:${row.production_work_order_id}`;
          addNode(nodes, {
            id: workOrderId,
            type: 'work_order',
            label: row.work_order_number || 'WAD',
            subtitle: row.production_work_order_id,
            status: 'ok',
            details: {
              productionWorkOrderId: row.production_work_order_id,
              travelerId: row.traveler_id,
            },
          });
          addEdge(edges, {
            id: `period:${period.label}->${workOrderId}`,
            from: `period:${period.label}`,
            to: workOrderId,
            label: 'WAD labor',
            status: 'ok',
          });
        }

        const employeeId = row.epoch_employee_id
          ? `employee:${row.epoch_employee_id}`
          : `employee:unknown:${row.id}`;
        const aggregate = row.epoch_employee_id
          ? employeeEvidence.get(row.epoch_employee_id)
          : null;
        addNode(nodes, {
          id: employeeId,
          type: 'employee',
          label: row.employee_name || 'Unknown employee',
          subtitle: [row.employee_code, row.department, row.job_title]
            .filter(Boolean)
            .join(' | '),
          status: 'sensitive',
          sensitivity: 'employee_rate',
          metrics: {
            liveHours: Number(
              (aggregate?.livePunches ?? []).reduce(
                (sum, punch) => sum + Number(punch.hours ?? 0),
                0
              ).toFixed(4)
            ),
            sessions: aggregate?.livePunches.length ?? 0,
            postedLaborRecords: aggregate?.postedLaborCosts.length ?? 1,
            postedLaborHours: Number(
              (aggregate?.postedLaborCosts ?? [row]).reduce(
                (sum, labor) => sum + Number(labor.hours_worked ?? 0),
                0
              ).toFixed(4)
            ),
          },
          details: {
            employeeId: row.epoch_employee_id,
            employeeCode: row.employee_code,
            department: row.department,
            jobTitle: row.job_title,
            projectPunches: aggregate?.livePunches ?? [],
            postedLaborCosts: aggregate?.postedLaborCosts ?? [row],
          },
        });

        const laborId = `labor:${row.id}`;
        const laborMissing = [
          row.journal_entry_id ? null : 'No linked journal entry.',
          row.source_punch_canonical_id || row.canonical_id
            ? null
            : 'No source punch/timesheet canonical id.',
          row.charge_code_id ? null : 'No charge code.',
        ].filter((item): item is string => !!item);
        addNode(nodes, {
          id: laborId,
          type: 'labor_cost',
          label: `Labor cost #${row.id}`,
          subtitle: `${hours(row.hours_worked)} hrs | ${money(row.dollar_cost)} | ${row.cost_type}`,
          status: laborMissing.length ? 'warning' : 'ok',
          sensitivity: 'employee_rate',
          metrics: {
            hours: Number(row.hours_worked),
            rateUsed: money(row.rate_used),
            dollarCost: money(row.dollar_cost),
            costType: row.cost_type,
            chargeCode: row.charge_code,
          },
          details: row,
          missingEvidence: laborMissing,
        });

        addEdge(edges, {
          id: `${employeeId}->${laborId}`,
          from: employeeId,
          to: laborId,
          label: 'worked',
          status: laborMissing.length ? 'warning' : 'ok',
        });

        addEdge(edges, {
          id: `${row.production_work_order_id ? `work_order:${row.production_work_order_id}` : `period:${period.label}`}->${laborId}`,
          from: row.production_work_order_id
            ? `work_order:${row.production_work_order_id}`
            : `period:${period.label}`,
          to: laborId,
          label: 'costed to',
          status: laborMissing.length ? 'warning' : 'ok',
        });

        for (const batchId of row.payroll_batch_ids ?? []) {
          const payrollId = `payroll:${batchId}`;
          addNode(nodes, {
            id: payrollId,
            type: 'payroll',
            label: `Payroll batch #${batchId}`,
            subtitle: 'Export evidence',
            status: 'ok',
            links: [
              {
                label: 'Open payroll export',
                href: `/api/timekeeping/admin/payroll/batches/${batchId}/download?evidenceOnly=true`,
                kind: 'api',
              },
            ],
          });
          addEdge(edges, {
            id: `${laborId}->${payrollId}`,
            from: laborId,
            to: payrollId,
            label: 'exported in',
            status: 'ok',
          });
        }

        if (row.journal_entry_id) {
          const journalId = `journal:${row.journal_entry_id}`;
          const linkedLines = linesByJournal.get(row.journal_entry_id) ?? [];
          addNode(nodes, {
            id: journalId,
            type: 'journal',
            label: `Journal entry #${row.journal_entry_id}`,
            subtitle: row.journal_status || 'Unknown status',
            status: row.journal_status === 'POSTED' ? 'ok' : 'warning',
            metrics: {
              status: row.journal_status,
              debitTotal: money(
                linkedLines.reduce(
                  (sum, line) => sum + Number(line.debit_amount ?? 0),
                  0
                )
              ),
              creditTotal: money(
                linkedLines.reduce(
                  (sum, line) => sum + Number(line.credit_amount ?? 0),
                  0
                )
              ),
            },
            details: {
              memo: row.journal_memo,
              effectiveDate: row.journal_effective_date,
              lines: linkedLines,
            },
            missingEvidence:
              row.journal_status === 'POSTED'
                ? []
                : ['Journal entry is not POSTED.'],
          });
          addEdge(edges, {
            id: `${laborId}->${journalId}`,
            from: laborId,
            to: journalId,
            label: 'posted to GL',
            status: row.journal_status === 'POSTED' ? 'ok' : 'warning',
          });
        }
      }

      for (const invoice of invoiceRows) {
        const invoiceId = `billing:${invoice.id}`;
        const invoiceMissing = [
          invoice.status ? null : 'Invoice status is missing.',
        ].filter((item): item is string => !!item);

        addNode(nodes, {
          id: invoiceId,
          type: 'billing',
          label: `Invoice ${invoice.invoice_number}`,
          subtitle: `${invoice.status} | ${money(invoice.billed_project_total)} billed to this project`,
          status: invoiceMissing.length ? 'warning' : 'ok',
          metrics: {
            invoiceStatus: invoice.status,
            projectBilled: money(invoice.billed_project_total),
            invoiceTotal: money(invoice.total_amount),
            lineCount: invoice.line_count,
          },
          details: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            invoiceDate: invoice.invoice_date,
            dueDate: invoice.due_date,
            status: invoice.status,
            customerId: invoice.customer_id,
            customerName: invoice.customer_name,
            packingSlipId: invoice.packing_slip_id,
            lotId: invoice.lot_id,
            createdBy: invoice.created_by,
            createdAt: invoice.created_at,
            postedAt: invoice.posted_at,
            postedBy: invoice.posted_by,
            sentAt: invoice.sent_at,
            matchedProjectIds: invoice.matched_project_ids,
            invoicePoId: invoice.invoice_po_id,
            invoicePoOverride: invoice.invoice_po_override,
            lotPoId: invoice.lot_po_id,
            packingSlipPoId: invoice.packing_slip_po_id,
            lineDescriptions: invoice.line_descriptions,
          },
          links: [
            {
              label: 'Open invoice',
              href: `/finance/invoices/${invoice.id}`,
              kind: 'app',
            },
          ],
          missingEvidence: invoiceMissing,
        });
        addEdge(edges, {
          id: `project:${project.id}->${invoiceId}`,
          from: `project:${project.id}`,
          to: invoiceId,
          label: 'customer billing',
          status: invoiceMissing.length ? 'warning' : 'ok',
        });

        if (invoice.journal_entry_id) {
          const journalId = `journal:${invoice.journal_entry_id}`;
          const linkedLines =
            linesByJournal.get(invoice.journal_entry_id) ?? [];
          addNode(nodes, {
            id: journalId,
            type: 'journal',
            label: `Journal entry #${invoice.journal_entry_id}`,
            subtitle: invoice.journal_status || 'Unknown status',
            status: invoice.journal_status === 'POSTED' ? 'ok' : 'warning',
            metrics: {
              status: invoice.journal_status,
              debitTotal: money(
                linkedLines.reduce(
                  (sum, line) => sum + Number(line.debit_amount ?? 0),
                  0
                )
              ),
              creditTotal: money(
                linkedLines.reduce(
                  (sum, line) => sum + Number(line.credit_amount ?? 0),
                  0
                )
              ),
            },
            details: {
              memo: invoice.journal_memo,
              effectiveDate: invoice.journal_effective_date,
              sourceInvoice: invoice.invoice_number,
              lines: linkedLines,
            },
            missingEvidence:
              invoice.journal_status === 'POSTED'
                ? []
                : ['Invoice journal entry is not POSTED.'],
          });
          addEdge(edges, {
            id: `${invoiceId}->${journalId}`,
            from: invoiceId,
            to: journalId,
            label: 'posted to AR',
            status: invoice.journal_status === 'POSTED' ? 'ok' : 'warning',
          });
        } else {
          addNode(nodes, {
            id: `missing:invoice-journal:${invoice.id}`,
            type: 'missing',
            label: `Invoice ${invoice.invoice_number} not posted`,
            subtitle: 'No AR journal entry found for this invoice',
            status: 'missing',
            missingEvidence: [
              'Invoice exists but has no linked AR journal entry.',
            ],
          });
          addEdge(edges, {
            id: `${invoiceId}->missing:invoice-journal:${invoice.id}`,
            from: invoiceId,
            to: `missing:invoice-journal:${invoice.id}`,
            label: 'posting evidence missing',
            status: 'missing',
          });
        }
      }

      for (const audit of auditRows) {
        const auditId = `audit:${audit.id}`;
        addNode(nodes, {
          id: auditId,
          type: 'audit',
          label: audit.action,
          subtitle: `Seq ${audit.sequence_number ?? 'n/a'} | ${audit.actor_name ?? 'system'}`,
          status: audit.row_hash ? 'ok' : 'warning',
          metrics: {
            sequence: audit.sequence_number,
            hash: audit.row_hash ? `${audit.row_hash.slice(0, 12)}...` : null,
          },
          details: audit,
          links: [
            {
              label: 'Open audit ledger',
              href: `/admin/audit-ledger?subjectType=${encodeURIComponent(audit.subject_type ?? audit.entity_type ?? '')}&subjectId=${encodeURIComponent(audit.subject_id ?? audit.entity_id ?? '')}`,
              kind: 'app',
            },
          ],
        });

        let parentId = `project:${project.id}`;
        if (audit.subject_type?.includes('journal') && audit.subject_id)
          parentId = `journal:${audit.subject_id}`;
        if (audit.entity_type?.includes('journal') && audit.entity_id)
          parentId = `journal:${audit.entity_id}`;
        if (audit.subject_type?.includes('ar_invoice') && audit.subject_id)
          parentId = `billing:${audit.subject_id}`;
        if (audit.entity_type?.includes('ar_invoice') && audit.entity_id)
          parentId = `billing:${audit.entity_id}`;
        if (audit.subject_type?.includes('labor') && audit.subject_id)
          parentId = `labor:${audit.subject_id}`;
        if (audit.entity_type?.includes('labor') && audit.entity_id)
          parentId = `labor:${audit.entity_id}`;
        if (
          audit.subject_type?.includes('production_work_order') &&
          audit.subject_id
        )
          parentId = `work_order:${audit.subject_id}`;
        if (
          audit.entity_type?.includes('production_work_order') &&
          audit.entity_id
        )
          parentId = `work_order:${audit.entity_id}`;

        if (nodes.has(parentId)) {
          addEdge(edges, {
            id: `${parentId}->${auditId}`,
            from: parentId,
            to: auditId,
            label: 'audit event',
            status: audit.row_hash ? 'ok' : 'warning',
          });
        }
      }

      const totalHours = laborRows.reduce(
        (sum, row) => sum + Number(row.hours_worked ?? 0),
        0
      );
      const totalLaborDollars = laborRows.reduce(
        (sum, row) => sum + Number(row.dollar_cost ?? 0),
        0
      );
      const materialNodeCount =
        materialBudgetRows.length +
        materialReservationRows.length +
        materialConsumptionRows.length +
        projectReceivedMaterialRows.length +
        partRequestRows.length +
        inventoryLedgerRows.length;
      const missingEvidence = Array.from(nodes.values()).flatMap((node) =>
        (node.missingEvidence ?? []).map((message) => ({
          nodeId: node.id,
          nodeLabel: node.label,
          message,
        }))
      );

      await recordAuditEvent({
        eventType: 'TRANSACTION_EVIDENCE_MAP_VIEWED',
        subjectType: 'project',
        subjectId: project.id,
        sourceService: 'transactionEvidenceMap.route',
        actor: {
          id: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
        },
        payload: {
          projectId: project.id,
          period: period.label,
          nodeCount: nodes.size,
          edgeCount: edges.length,
          laborRecordCount: laborRows.length,
          liveLaborSessionCount: liveLaborRows.length,
          materialEvidenceCount: materialNodeCount,
          materialConsumptionCount: materialConsumptionRows.length,
          materialConsumedCost,
          materialCommittedCost,
          materialReceivedCost,
          totalHours,
          liveLaborHours,
          totalLaborDollars,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      }).catch((err) =>
        console.error('[transaction-evidence-map] audit write failed', err)
      );

      return res.json({
        generatedAt: new Date().toISOString(),
        project,
        period,
        summary: {
          laborRecordCount: laborRows.length,
          liveLaborSessionCount: liveLaborRows.length,
          employeeCount: employeeIds.length,
          workOrderCount: workOrderIds.length,
          materialEvidenceCount: materialNodeCount,
          materialConsumptionCount: materialConsumptionRows.length,
          materialConsumedCost: Number(materialConsumedCost.toFixed(2)),
          materialCommittedCost: Number(materialCommittedCost.toFixed(2)),
          materialReceivedCost: Number(materialReceivedCost.toFixed(2)),
          journalEntryCount: allJournalIds.length,
          customerInvoiceCount: invoiceRows.length,
          documentCount: projectDocs.length,
          auditEventCount: auditRows.length,
          totalHours: Number(totalHours.toFixed(4)),
          liveLaborHours: Number(liveLaborHours.toFixed(4)),
          totalLaborDollars: Number(totalLaborDollars.toFixed(2)),
          missingEvidenceCount: missingEvidence.length,
        },
        nodes: Array.from(nodes.values()),
        edges,
        missingEvidence,
      });
    } catch (err) {
      console.error('[transaction-evidence-map] failed', err);
      return res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to build evidence map',
      });
    }
  }
);

export default router;
