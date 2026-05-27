import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { ensureProductionWorkflowReadSchema } from '../lib/productionWorkflowReadiness';
import { assignDashboardForWorkOrder } from '../lib/workOrderDashboardAssignment';

const router = Router();

router.use(async (_req, res, next) => {
  try {
    await ensureProductionWorkflowReadSchema();
    next();
  } catch (error) {
    console.error('[PM Dashboard] Production workflow schema readiness failed:', error);
    res.status(503).json({ error: 'Production workflow schema is being prepared, please retry' });
  }
});

function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) =>
    fn(req, res).catch((err) => {
      console.error('[PM Dashboard]', {
        method: req.method,
        path: req.originalUrl,
        projectId: req.params?.projectId,
        message: err?.message ?? String(err),
        stack: err?.stack,
      });
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error', message: err?.message });
    });
}

interface ProjectRow {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  targetShipDate: string | null;
  projectManagerId: number | null;
  projectManagerName: string | null;
  poId: number | null;
  poNumber: string | null;
  p2StepStatus: string;
  preprodStepStatus: string;
  purchaseStepStatus: string;
  quoteStepStatus: string;
  rfqStepStatus: string;
}

interface SummaryRow {
  projectId: string;
  projectName: string;
  assignedPm: string | null;
  targetShipDate: string | null;
}

interface WorkOrderCountRow {
  totalWorkOrders: string;
  completedWorkOrders: string;
  blockedWorkOrders: string;
}

interface TravelerCountRow {
  openTravelerCount: string;
  blockedTravelerCount: string;
}

interface LaborBudgetRow {
  budgetedLaborHours: string;
}

interface LaborActualRow {
  actualLaborHours: string;
}

interface MaterialCostRow {
  committedMaterialCost: string;
  plannedMaterialCost: string;
}

interface ConsumedCostRow {
  consumedMaterialCost: string;
}

interface ProductionRow {
  productionWorkOrderId: string;
  workOrderNumber: string;
  partNumber: string;
  quantityRequired: number;
  quantityCompleted: number;
  quantityCompletedToday: number;
  sourceType: string;
  sourceLabel: string;
  dashboardType: string | null;
  queueType: string | null;
  assignedDepartment: string | null;
  assignedDashboardRoute: string | null;
  dashboardLabel: string | null;
  manufacturingQueueId: number | null;
  wizardData?: unknown;
  departmentBudgets?: unknown;
  wadStatus: string | null;
  p2PoId: number | null;
  p2PoNumber: string | null;
  status: string;
  dueDate: string | null;
  currentDepartment: string | null;
  currentTravelerStep: string | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  ncrReplacementCount: number;
  activeReplacementCount: number;
  replacementSerialNumbers: string | null;
  daysScheduleVariance: string | null;
  blockReason: string | null;
  linkedWadId?: string | null;
  linkedWadNumber?: string | null;
  linkedWadStatus?: string | null;
  linkedWadWorkOrderStatus?: string | null;
  productionConnectionStatus?: string | null;
  productionConnectionLabel?: string | null;
  productionConnectionDetail?: string | null;
}

interface WadBridgeRow {
  id: string;
  workOrderNumber: string;
  partNumber: string | null;
  status: string | null;
  wadStatus: string | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  currentTravelerStep: string | null;
}

interface ChargeCodeAggRow {
  chargeCodeId: number;
  chargeCode: string;
  department: string | null;
  taskName: string | null;
  budgetedHours: string;
  actualHours: string;
}

interface DailyLaborRow {
  workDate: string;
  employeeId: number;
  employeeName: string;
  department: string | null;
  chargeCode: string | null;
  workOrderNumber: string | null;
  travelerNumber: string | null;
  budgetedHours: string;
  actualHours: string;
  activeMinutes: string;
  openSessionCount: string;
}

interface LiveSessionRow {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  travelerId: string | null;
  travelerNumber: string | null;
  department: string | null;
  chargeCode: string | null;
  startedAt: string;
  elapsedMinutes: string;
}

interface LaborEntryTraceRow {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  hours: string;
  source: string;
  laborClass: string | null;
  department: string | null;
  operation: string | null;
  chargeCode: string | null;
  workOrderNumber: string | null;
  travelerNumber: string | null;
  approvalStatus: string | null;
  isEdited: boolean;
  editNote: string | null;
  timesheetId: number | null;
  timesheetStatus: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

interface CertRow {
  employeeId: number;
  status: string;
  expiresDate: string | null;
}

interface MaterialSummaryRow {
  plannedCost: string;
  committedCost: string;
  consumedCost: string;
}

interface MaterialBudgetAmountRow {
  plannedCost: string;
}

interface ProjectReceivedMaterialSummaryRow {
  pendingReceivedCost: string;
  acceptedReceivedCost: string;
}

interface MaterialItemRow {
  inventoryItemId: string;
  partsRequestId?: number;
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  internalControlNumber: string | null;
  requestedBy?: string | null;
  requestDate?: string | null;
  expectedDelivery?: string | null;
  qtyRequired: string;
  qtyAllocated: string;
  qtyIssued: string;
  unitCost: string;
  committedCost: string;
  consumedCost: string;
  status: string;
}

interface ProjectReceivedMaterialRow extends MaterialItemRow {
  projectReceivedMaterialId: number;
  receiptNumber: string | null;
  receivedUnitBarcode: string | null;
}

const ORDERED_PARTS_REQUEST_STATUSES = [
  'ORDERED',
  'ORDERED_PARTIAL',
  'RECEIVED',
  'RECEIVED_PARTIAL',
  'DELIVERED_TO_DEPT',
];

const PROJECT_PARTS_REQUEST_VISIBLE_STATUSES = [
  'PENDING',
  'PENDING_OWNER_APPROVAL',
  'APPROVED',
  'ORDERED',
  'ORDERED_PARTIAL',
  'RECEIVED',
  'RECEIVED_PARTIAL',
  'DELIVERED_TO_DEPT',
  'REJECTED',
  'CANCEL_REQUESTED',
];

async function publicTableExists(tableName: string): Promise<boolean> {
  const rows = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`public.${tableName}`],
  );
  return rows[0]?.exists === true;
}

async function publicColumnsExist(tableName: string, columnNames: string[]): Promise<boolean> {
  if (columnNames.length === 0) return true;

  const rows = await pool.query<{ columnName: string }>(
    `
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = ANY($2::text[])
    `,
    [tableName, columnNames],
  );

  const found = new Set(rows.map((row) => row.columnName));
  return columnNames.every((columnName) => found.has(columnName));
}

async function canReadProjectReceivedMaterials(): Promise<boolean> {
  return (
    await publicTableExists('project_received_materials') &&
    await publicTableExists('received_units') &&
    await publicTableExists('receipts') &&
    await publicTableExists('receipt_lines') &&
    await publicColumnsExist('project_received_materials', [
      'id',
      'project_id',
      'received_unit_id',
      'receipt_id',
      'material_lot_id',
      'quantity',
      'unit_cost',
      'extended_cost',
      'status',
      'created_at',
    ]) &&
    await publicColumnsExist('received_units', [
      'id',
      'receipt_line_id',
      'lot_number',
      'internal_control_number',
      'barcode',
    ]) &&
    await publicColumnsExist('receipts', ['id', 'receipt_number']) &&
    await publicColumnsExist('receipt_lines', ['id', 'ag_part_number', 'description'])
  );
}

let hasProductionWorkOrderMaterialBudgetColumn: boolean | null = null;

async function getProductionWorkOrderMaterialBudgetExpression() {
  if (hasProductionWorkOrderMaterialBudgetColumn === null) {
    const rows = await pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'production_work_orders'
            AND column_name = 'material_budget_amount'
        ) AS "exists"
      `,
    );

    hasProductionWorkOrderMaterialBudgetColumn = rows[0]?.exists === true;
  }

  if (hasProductionWorkOrderMaterialBudgetColumn) {
    return `
        NULLIF(material_budget_amount::numeric, 0),
        NULLIF(wizard_data->>'materialBudgetAmount', '')::numeric,
        NULLIF(wizard_data->>'materialBudget', '')::numeric,
        0
    `;
  }

  return `
        NULLIF(wizard_data->>'materialBudgetAmount', '')::numeric,
        NULLIF(wizard_data->>'materialBudget', '')::numeric,
        0
  `;
}

function canTraceProjectLabor(user: { username?: string | null; role?: string | null } | undefined): boolean {
  const username = String(user?.username ?? '').trim().toLowerCase();
  const role = String(user?.role ?? '').trim().toUpperCase();
  return username === 'glennj' && role === 'ADMIN';
}

// ─── Item-level progress helper ──────────────────────────────────────────────
// Aggregates p2_serialized_items per (po_id, po_item_id) for a project so the
// PM Control Center reports the same numbers as the order card. "Completed"
// includes rows whose serialized-item status is stale but whose matching
// traveler has already completed; SCRAPPED / CANCELLED units are excluded.
interface SerializedItemGroup {
  poId: number;
  poItemId: number;
  partNumber: string | null;
  partName: string | null;
  poNumber: string | null;
  totalUnits: number;
  completedUnits: number;
  inProductionUnits: number;
  pendingUnits: number;
  completedTodayUnits: number;
  currentDepartment: string | null;
  dueDate: string | null;
}

interface SerializedItemAggregate {
  linkedPoIds: number[];
  groups: SerializedItemGroup[];
  totalRequired: number;
  totalCompleted: number;
}

interface P2PoStatusSummary {
  id: number;
  poNumber: string;
  customerName: string | null;
  dueDate: string | null;
  totalItems: number;
  completedItems: number;
  inProductionItems: number;
  pendingItems: number;
  rawStatus: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface P2SerializedBreakdownRow {
  id: string;
  poId: number;
  poNumber: string | null;
  poItemId: number | null;
  serialNumber: string | null;
  barcode: string | null;
  travelerBarcode: string | null;
  partNumber: string | null;
  partName: string | null;
  status: string;
  currentDepartment: string | null;
  currentStageIndex: number | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  activeTravelerStatus: string | null;
  activeTaskDepartment: string | null;
  activeTaskStatus: string | null;
  holdReason: string | null;
  scrapReason: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

function normalizePartKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeP2Status(status: unknown): string {
  return String(status || '').trim().toUpperCase();
}

async function getProjectLinkedP2PoIds(projectId: string): Promise<number[]> {
  const rows = await pool.query<{ poId: string }>(`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $1 AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $1 AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $1::uuid
      UNION
      SELECT po.id AS po_id
      FROM projects p
      JOIN p2_purchase_orders po ON LOWER(TRIM(po.project_name)) IN (
        LOWER(TRIM(p.project_code)),
        LOWER(TRIM(p.project_name)),
        LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
      )
      WHERE p.id = $1
        AND po.project_name IS NOT NULL
        AND TRIM(po.project_name) <> ''
    )
    SELECT DISTINCT po_id::text AS "poId" FROM project_po_link WHERE po_id IS NOT NULL
  `, [projectId]);

  return rows
    .map(row => parseInt(row.poId, 10))
    .filter(n => Number.isFinite(n));
}

async function getProjectP2PoStatusSummaries(projectId: string): Promise<P2PoStatusSummary[]> {
  const linkedPoIds = await getProjectLinkedP2PoIds(projectId);
  if (!linkedPoIds.length) return [];

  const rows = await pool.query<{
    id: number;
    poNumber: string;
    customerName: string | null;
    dueDate: string | null;
    rawStatus: string | null;
    orderedQty: string;
    serializedQty: string;
    completedItems: string;
    inProductionItems: string;
  }>(`
    WITH item_state AS (
      SELECT
        psi.*,
        EXISTS (
          SELECT 1
          FROM travelers t
          WHERE UPPER(COALESCE(t.status, '')) IN ('COMPLETE', 'COMPLETED', 'CLOSED')
            AND t.serial_number IS NOT NULL
            AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
        ) AS has_completed_traveler
      FROM p2_serialized_items psi
      WHERE psi.po_id = ANY($1::int[])
    ),
    ordered_qty AS (
      SELECT po_id, COALESCE(SUM(quantity), 0)::int AS ordered_qty
      FROM p2_purchase_order_items
      WHERE po_id = ANY($1::int[])
      GROUP BY po_id
    )
    SELECT
      po.id,
      po.po_number AS "poNumber",
      po.customer_name AS "customerName",
      po.expected_delivery AS "dueDate",
      po.status AS "rawStatus",
      COALESCE(oq.ordered_qty, 0)::text AS "orderedQty",
      COUNT(psi.id)::text AS "serializedQty",
      COUNT(*) FILTER (
        WHERE psi.status = 'COMPLETED' OR psi.has_completed_traveler
      )::text AS "completedItems",
      COUNT(*) FILTER (
        WHERE psi.status = 'ACTIVE'
          AND NOT psi.has_completed_traveler
          AND COALESCE(psi.current_department, '') <> ''
          AND COALESCE(psi.current_department, '') <> 'Pending Layup'
      )::text AS "inProductionItems"
    FROM p2_purchase_orders po
    LEFT JOIN ordered_qty oq ON oq.po_id = po.id
    LEFT JOIN item_state psi ON psi.po_id = po.id
    WHERE po.id = ANY($1::int[])
    GROUP BY po.id, po.po_number, po.customer_name, po.expected_delivery, po.status, oq.ordered_qty
    ORDER BY po.po_number ASC
  `, [linkedPoIds]);

  return rows.map((row) => {
    const rawStatus = normalizeP2Status(row.rawStatus) || 'OPEN';
    const serializedQty = parseInt(row.serializedQty, 10) || 0;
    const orderedQty = parseInt(row.orderedQty, 10) || 0;
    const totalItems = Math.max(orderedQty, serializedQty);
    const completedItems = parseInt(row.completedItems, 10) || 0;
    const inProductionItems = parseInt(row.inProductionItems, 10) || 0;
    const pendingItems = Math.max(0, totalItems - completedItems - inProductionItems);
    const status: P2PoStatusSummary['status'] =
      totalItems > 0 && completedItems >= totalItems
        ? 'completed'
        : (inProductionItems > 0 || rawStatus === 'IN_PRODUCTION')
          ? 'in_progress'
          : 'pending';

    return {
      id: row.id,
      poNumber: row.poNumber,
      customerName: row.customerName,
      dueDate: row.dueDate,
      totalItems,
      completedItems,
      inProductionItems,
      pendingItems,
      rawStatus,
      status,
    };
  });
}

async function getProjectP2SerializedBreakdown(projectId: string): Promise<P2SerializedBreakdownRow[]> {
  const linkedPoIds = await getProjectLinkedP2PoIds(projectId);
  if (!linkedPoIds.length) return [];

  return pool.query<P2SerializedBreakdownRow>(`
    WITH latest_traveler AS (
      SELECT DISTINCT ON (LOWER(TRIM(serial_number)))
        LOWER(TRIM(serial_number)) AS serial_key,
        id::text AS "activeTravelerId",
        traveler_number AS "activeTravelerNumber",
        status AS "activeTravelerStatus"
      FROM travelers
      WHERE serial_number IS NOT NULL
        AND TRIM(serial_number) <> ''
      ORDER BY LOWER(TRIM(serial_number)), updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ),
    active_step AS (
      SELECT DISTINCT ON (t.id)
        t.id AS traveler_id,
        ts.department_name AS "activeTaskDepartment",
        ts.status AS "activeTaskStatus"
      FROM travelers t
      JOIN traveler_steps ts ON ts.traveler_id = t.id
      WHERE UPPER(COALESCE(ts.status, '')) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED', 'BLOCKED', 'ON_HOLD', 'HOLD')
      ORDER BY t.id, ts.step_number ASC
    )
    SELECT
      psi.id::text,
      psi.po_id AS "poId",
      psi.po_number AS "poNumber",
      psi.po_item_id AS "poItemId",
      psi.serial_number AS "serialNumber",
      psi.barcode,
      psi.traveler_barcode AS "travelerBarcode",
      COALESCE(poi.part_number, psi.part_number) AS "partNumber",
      COALESCE(poi.part_name, psi.part_name) AS "partName",
      psi.status,
      psi.current_department AS "currentDepartment",
      psi.current_stage_index AS "currentStageIndex",
      lt."activeTravelerId",
      lt."activeTravelerNumber",
      lt."activeTravelerStatus",
      astep."activeTaskDepartment",
      astep."activeTaskStatus",
      psi.hold_reason AS "holdReason",
      psi.scrap_reason AS "scrapReason",
      psi.completed_at AS "completedAt",
      psi.updated_at AS "updatedAt"
    FROM p2_serialized_items psi
    LEFT JOIN p2_purchase_order_items poi ON poi.id = psi.po_item_id
    LEFT JOIN latest_traveler lt ON lt.serial_key = LOWER(TRIM(psi.serial_number))
    LEFT JOIN active_step astep ON astep.traveler_id::text = lt."activeTravelerId"
    WHERE psi.po_id = ANY($1::int[])
      AND COALESCE(UPPER(psi.status), '') NOT IN ('CANCELLED', 'CANCELED')
    ORDER BY
      COALESCE(psi.current_stage_index, 0),
      COALESCE(psi.current_department, 'Pending Layup'),
      psi.po_number,
      psi.sequence_number,
      psi.serial_number
  `, [linkedPoIds]);
}

function isWadReleasedForExecution(wad: WadBridgeRow): boolean {
  const wadStatus = String(wad.wadStatus ?? '').trim().toUpperCase();
  const workOrderStatus = String(wad.status ?? '').trim().toUpperCase();
  return (
    wadStatus === 'APPROVED' &&
    ['RELEASED', 'IN_PROGRESS', 'COMPLETE', 'COMPLETED', 'CLOSED'].includes(workOrderStatus)
  );
}

async function getProjectWadBridgeRows(projectId: string): Promise<WadBridgeRow[]> {
  return pool.query<WadBridgeRow>(`
    SELECT
      wo.id::text AS id,
      wo.work_order_number AS "workOrderNumber",
      wo.part_number AS "partNumber",
      wo.status,
      wo.wad_status AS "wadStatus",
      (
        SELECT t.id::text
        FROM travelers t
        WHERE t.production_work_order_id = wo.id
          AND UPPER(COALESCE(t.status, '')) NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED', 'SCRAPPED', 'CANCELLED', 'CANCELED')
        ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC NULLS LAST
        LIMIT 1
      ) AS "activeTravelerId",
      (
        SELECT t.traveler_number
        FROM travelers t
        WHERE t.production_work_order_id = wo.id
          AND UPPER(COALESCE(t.status, '')) NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED', 'SCRAPPED', 'CANCELLED', 'CANCELED')
        ORDER BY t.updated_at DESC NULLS LAST, t.created_at DESC NULLS LAST
        LIMIT 1
      ) AS "activeTravelerNumber",
      (
        SELECT ts.department_name
        FROM traveler_steps ts
        JOIN travelers t ON t.id = ts.traveler_id
        WHERE t.production_work_order_id = wo.id
          AND UPPER(COALESCE(ts.status, '')) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED')
        ORDER BY ts.step_number ASC
        LIMIT 1
      ) AS "currentTravelerStep"
    FROM production_work_orders wo
    WHERE wo.project_id = $1
      AND UPPER(COALESCE(wo.status, '')) NOT IN ('CANCELLED', 'CANCELED')
    ORDER BY wo.created_at DESC
  `, [projectId]);
}

async function enrichP2RowsWithWadBridge(projectId: string, rows: ProductionRow[]): Promise<ProductionRow[]> {
  const hasP2Rows = rows.some((row) => row.sourceType === 'p2_production_order');
  if (!hasP2Rows) return rows;

  const wads = await getProjectWadBridgeRows(projectId);
  const wadByPart = new Map<string, WadBridgeRow>();
  for (const wad of wads) {
    const key = normalizePartKey(wad.partNumber);
    if (key && !wadByPart.has(key)) {
      wadByPart.set(key, wad);
    }
  }

  return rows.map((row) => {
    if (row.sourceType !== 'p2_production_order') return row;

    const matchedWad = wadByPart.get(normalizePartKey(row.partNumber)) ?? null;
    if (!matchedWad) {
      const hasAnyWad = wads.length > 0;
      return {
        ...row,
        productionConnectionStatus: hasAnyWad ? 'WAD_NOT_MATCHED' : 'WAD_MISSING',
        productionConnectionLabel: hasAnyWad ? 'WAD not matched' : 'WAD missing',
        productionConnectionDetail: hasAnyWad
          ? 'Project has WAD records, but none match this P2 part. Production flow is unchanged.'
          : 'P2 production demand exists, but no project WAD has been created yet. Production flow is unchanged.',
      };
    }

    const linkedBase = {
      ...row,
      linkedWadId: matchedWad.id,
      linkedWadNumber: matchedWad.workOrderNumber,
      linkedWadStatus: matchedWad.wadStatus,
      linkedWadWorkOrderStatus: matchedWad.status,
      wadStatus: row.wadStatus ?? matchedWad.wadStatus,
      activeTravelerId: row.activeTravelerId ?? matchedWad.activeTravelerId,
      activeTravelerNumber: row.activeTravelerNumber ?? matchedWad.activeTravelerNumber,
      currentTravelerStep: row.currentTravelerStep ?? matchedWad.currentTravelerStep,
    };

    if (!isWadReleasedForExecution(matchedWad)) {
      return {
        ...linkedBase,
        productionConnectionStatus: 'WAD_INCOMPLETE',
        productionConnectionLabel: 'WAD incomplete',
        productionConnectionDetail: `${matchedWad.workOrderNumber} is ${matchedWad.wadStatus ?? 'not approved'} / ${matchedWad.status ?? 'not released'}. Production flow is unchanged.`,
      };
    }

    if (!matchedWad.activeTravelerId && !matchedWad.currentTravelerStep) {
      return {
        ...linkedBase,
        productionConnectionStatus: 'TRAVELER_NOT_ACTIVE',
        productionConnectionLabel: 'No active traveler',
        productionConnectionDetail: `${matchedWad.workOrderNumber} is approved/released, but no active traveler is currently started.`,
      };
    }

    return {
      ...linkedBase,
      productionConnectionStatus: 'CONNECTED',
      productionConnectionLabel: 'Linked',
      productionConnectionDetail: `${matchedWad.workOrderNumber} is connected to the active traveler state.`,
    };
  });
}

async function getProjectSerializedItemAggregate(
  projectId: string,
  today: string,
): Promise<SerializedItemAggregate> {
  const linkRows = await pool.query<{ po_id: string }>(`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $1 AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $1 AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $1::uuid
    )
    SELECT DISTINCT po_id::text FROM project_po_link WHERE po_id IS NOT NULL
  `, [projectId]);

  const linkedPoIds = linkRows
    .map(r => parseInt(r.po_id, 10))
    .filter(n => Number.isFinite(n));

  if (!linkedPoIds.length) {
    return { linkedPoIds: [], groups: [], totalRequired: 0, totalCompleted: 0 };
  }

  const groupRows = await pool.query<{
    poId: string;
    poItemId: string;
    partNumber: string | null;
    partName: string | null;
    poNumber: string | null;
    totalUnits: string;
    completedUnits: string;
    inProductionUnits: string;
    pendingUnits: string;
    completedTodayUnits: string;
    currentDepartment: string | null;
    dueDate: string | null;
  }>(`
    WITH item_state AS (
      SELECT
        psi.*,
        EXISTS (
          SELECT 1
          FROM travelers t
          WHERE t.status = 'COMPLETED'
            AND t.serial_number IS NOT NULL
            AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
        ) AS has_completed_traveler,
        COALESCE(
          psi.completed_at,
          (
            SELECT MAX(t.completed_at)
            FROM travelers t
            WHERE t.status = 'COMPLETED'
              AND t.serial_number IS NOT NULL
              AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
          )
        ) AS effective_completed_at
      FROM p2_serialized_items psi
    )
    SELECT
      psi.po_id::text AS "poId",
      psi.po_item_id::text AS "poItemId",
      MAX(COALESCE(poi.part_number, psi.part_number)) AS "partNumber",
      MAX(COALESCE(poi.part_name, psi.part_name)) AS "partName",
      MAX(psi.po_number) AS "poNumber",
      COUNT(*) FILTER (
        WHERE psi.status NOT IN ('SCRAPPED', 'CANCELLED', 'CANCELED')
      )::text AS "totalUnits",
      COUNT(*) FILTER (
        WHERE psi.status = 'COMPLETED' OR psi.has_completed_traveler
      )::text AS "completedUnits",
      COUNT(*) FILTER (
        WHERE psi.status NOT IN ('SCRAPPED', 'CANCELLED', 'CANCELED', 'COMPLETED')
          AND NOT psi.has_completed_traveler
          AND psi.current_stage_index > 0
      )::text AS "inProductionUnits",
      COUNT(*) FILTER (
        WHERE psi.status NOT IN ('SCRAPPED', 'CANCELLED', 'CANCELED', 'COMPLETED')
          AND NOT psi.has_completed_traveler
          AND psi.current_stage_index = 0
      )::text AS "pendingUnits",
      COUNT(*) FILTER (
        WHERE (psi.status = 'COMPLETED' OR psi.has_completed_traveler)
          AND psi.effective_completed_at IS NOT NULL
          AND psi.effective_completed_at::date = $2::date
      )::text AS "completedTodayUnits",
      (
        SELECT psi2.current_department
        FROM item_state psi2
        WHERE psi2.po_id = psi.po_id
          AND psi2.po_item_id = psi.po_item_id
          AND psi2.status NOT IN ('SCRAPPED', 'CANCELLED', 'CANCELED', 'COMPLETED')
          AND NOT psi2.has_completed_traveler
        GROUP BY psi2.current_department
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS "currentDepartment",
      (
        SELECT MIN(p2po.due_date)::text
        FROM p2_production_orders p2po
        WHERE p2po.p2_po_id = psi.po_id
          AND p2po.p2_po_item_id = psi.po_item_id
      ) AS "dueDate"
    FROM item_state psi
    LEFT JOIN p2_purchase_order_items poi ON poi.id = psi.po_item_id
    WHERE psi.po_id = ANY($1::int[])
    GROUP BY psi.po_id, psi.po_item_id
    ORDER BY psi.po_id, psi.po_item_id
  `, [linkedPoIds, today]);

  const groups: SerializedItemGroup[] = groupRows.map(r => ({
    poId: parseInt(r.poId, 10),
    poItemId: parseInt(r.poItemId, 10),
    partNumber: r.partNumber,
    partName: r.partName,
    poNumber: r.poNumber,
    totalUnits: parseInt(r.totalUnits, 10) || 0,
    completedUnits: parseInt(r.completedUnits, 10) || 0,
    inProductionUnits: parseInt(r.inProductionUnits, 10) || 0,
    pendingUnits: parseInt(r.pendingUnits, 10) || 0,
    completedTodayUnits: parseInt(r.completedTodayUnits, 10) || 0,
    currentDepartment: r.currentDepartment,
    dueDate: r.dueDate,
  }));

  const totalRequired = groups.reduce((s, g) => s + g.totalUnits, 0);
  const totalCompleted = groups.reduce((s, g) => s + g.completedUnits, 0);

  return { linkedPoIds, groups, totalRequired, totalCompleted };
}

async function getProjectSerializedItemAggregateOrFallback(
  projectId: string,
  today: string,
): Promise<SerializedItemAggregate> {
  try {
    return await getProjectSerializedItemAggregate(projectId, today);
  } catch (error) {
    console.error('[PM Dashboard] Serialized item aggregate failed; using legacy project totals', {
      projectId,
      today,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { linkedPoIds: [], groups: [], totalRequired: 0, totalCompleted: 0 };
  }
}

// GET /api/pm-dashboard/managers — distinct PMs who own at least one active project
router.get('/managers', h(async (_req, res) => {
  const result = await pool.query<{ id: number; name: string }>(`
    SELECT DISTINCT e.id, e.name
    FROM projects p
    JOIN employees e ON e.id = p.project_manager_id
    WHERE p.status NOT IN ('cancelled', 'completed')
      AND p.project_manager_id IS NOT NULL
    ORDER BY e.name ASC
  `);
  res.json(result);
}));

// GET /api/pm-dashboard/projects — active projects for the selector dropdown
router.get('/projects', h(async (_req, res) => {
  const result = await pool.query<ProjectRow>(`
    SELECT
      p.id::text AS "id",
      p.project_code AS "projectCode",
      p.project_name AS "projectName",
      p.status,
      p.target_ship_date AS "targetShipDate",
      p.project_manager_id AS "projectManagerId",
      e.name AS "projectManagerName",
      project_po_link.linked_po_id AS "poId",
      po.po_number AS "poNumber",
      COALESCE(
        (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.step_type = 'p2_order' LIMIT 1), 'pending'
      ) AS "p2StepStatus",
      COALESCE(
        (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.step_type = 'preproduction_checklist' LIMIT 1), 'pending'
      ) AS "preprodStepStatus",
      COALESCE(
        (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.step_type = 'purchase_review_checklist' LIMIT 1), 'pending'
      ) AS "purchaseStepStatus",
      COALESCE(
        (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.step_type = 'quote' LIMIT 1), 'pending'
      ) AS "quoteStepStatus",
      COALESCE(
        (SELECT ps.status FROM project_steps ps WHERE ps.project_id = p.id AND ps.step_type = 'rfq_risk_assessment' LIMIT 1), 'pending'
      ) AS "rfqStepStatus"
    FROM projects p
    LEFT JOIN employees e ON e.id = p.project_manager_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        p.po_id,
        (
          SELECT ps.linked_p2_order_id
          FROM project_steps ps
          WHERE ps.project_id = p.id
            AND ps.step_type = 'p2_order'
            AND ps.linked_p2_order_id IS NOT NULL
          ORDER BY ps.updated_at DESC NULLS LAST, ps.completed_at DESC NULLS LAST
          LIMIT 1
        )
      ) AS linked_po_id
    ) project_po_link ON TRUE
    LEFT JOIN p2_purchase_orders po ON po.id = project_po_link.linked_po_id
    WHERE p.status NOT IN ('cancelled', 'completed')
    ORDER BY p.project_code ASC
  `);
  res.json(result);
}));

// GET /api/pm-dashboard/:projectId/summary — KPI cards
router.get('/:projectId/summary', h(async (req, res) => {
  const { projectId } = req.params;

  const projRes = await pool.query<SummaryRow>(`
    SELECT
      p.id AS "projectId",
      p.project_name AS "projectName",
      p.target_ship_date AS "targetShipDate",
      e.name AS "assignedPm"
    FROM projects p
    LEFT JOIN employees e ON e.id = p.project_manager_id
    WHERE p.id = $1
  `, [projectId]);

  if (!projRes.length) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const woRes = await pool.query<WorkOrderCountRow>(`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $1
        AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $1
        AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $1::uuid
    ),
    p2_superseding_parts AS (
      SELECT DISTINCT LOWER(TRIM(part_number)) AS part_number
      FROM (
        SELECT poi.part_number
        FROM project_po_link ppl
        JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
        WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
        UNION
        SELECT p2po.sku AS part_number
        FROM project_po_link ppl
        JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
        WHERE p2po.sku IS NOT NULL AND TRIM(p2po.sku) <> ''
        UNION
        SELECT p2po.part_name AS part_number
        FROM project_po_link ppl
        JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
        WHERE p2po.part_name IS NOT NULL AND TRIM(p2po.part_name) <> ''
      ) parts
    ),
    rows AS (
      -- Task #258: exclude WAD WOs cancelled by the P2 supersede rule.
      SELECT status FROM production_work_orders
       WHERE project_id = $1
        AND status NOT IN ('CANCELLED', 'CANCELED')
        AND NOT (
          work_order_number LIKE 'WAD-%'
          AND status NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
          AND EXISTS (
            SELECT 1 FROM p2_superseding_parts psp
            WHERE psp.part_number = LOWER(TRIM(production_work_orders.part_number))
          )
        )
      UNION ALL
      SELECT
        CASE
          WHEN SUM(COALESCE(p2po.quantity, 0)) > 0
            AND SUM(COALESCE(p2po.quantity_manufactured, 0))
              >= SUM(COALESCE(p2po.quantity, 0))
            THEN 'COMPLETED'
          WHEN SUM(COALESCE(p2po.quantity_manufactured, 0)) > 0
            OR bool_or(p2po.status IN ('IN_PROGRESS', 'in_progress'))
            THEN 'IN_PROGRESS'
          ELSE 'PENDING'
        END AS status
      FROM project_po_link ppl
      JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
      WHERE p2po.status NOT IN ('CANCELLED', 'CANCELED')
      GROUP BY p2po.p2_po_id, p2po.p2_po_item_id, p2po.department
    )
    SELECT
      COUNT(*) AS "totalWorkOrders",
      COUNT(*) FILTER (WHERE status IN ('COMPLETE', 'COMPLETED', 'CLOSED')) AS "completedWorkOrders",
      COUNT(*) FILTER (WHERE status = 'BLOCKED') AS "blockedWorkOrders"
    FROM rows
  `, [projectId]);

  // Open traveler count + blocked/hold travelers
  const travelerRes = await pool.query<TravelerCountRow>(`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('COMPLETE', 'CLOSED', 'SCRAPPED', 'CANCELLED')) AS "openTravelerCount",
      COUNT(*) FILTER (WHERE status IN ('BLOCKED', 'ON_HOLD', 'HOLD')) AS "blockedTravelerCount"
    FROM travelers
    WHERE project_id = $1
  `, [projectId]);

  const laborBudgetRes = await pool.query<LaborBudgetRow>(`
    SELECT COALESCE(SUM(total_budget_hours::numeric), 0) AS "budgetedLaborHours"
    FROM production_work_orders
    WHERE project_id = $1
  `, [projectId]);

  // Actual labor: closed REGULAR sessions from punch_ledger linked via work_order or traveler
  const laborActualRes = await pool.query<LaborActualRow>(`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0
    ), 0) AS "actualLaborHours"
    FROM punch_ledger pl
    WHERE pl.clock_out IS NOT NULL
      AND pl.labor_class = 'REGULAR'
      AND (
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
      )
  `, [projectId]);

  const materialRes = await pool.query<MaterialCostRow>(`
    SELECT
      COALESCE(SUM(mlr.quantity_reserved * COALESCE(ii.unit_cost, 0)), 0) AS "committedMaterialCost",
      (
        SELECT COALESCE(SUM(
          COALESCE(NULLIF(wo.wizard_data->'step5'->>'materialSpendCap', '')::numeric, 0)
        ), 0)
        FROM production_work_orders wo
        WHERE wo.project_id = $1
      ) AS "plannedMaterialCost"
    FROM material_lot_reservations mlr
    JOIN material_lots ml ON ml.id = mlr.material_lot_id
    LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
    WHERE mlr.traveler_id::text IN (
      SELECT id::text FROM travelers WHERE project_id = $1
    )
  `, [projectId]);

  const consumedRes = await pool.query<ConsumedCostRow>(`
    SELECT COALESCE(SUM(COALESCE(tmc.qty_used, tmc.quantity_used, 0) * COALESCE(ii.unit_cost, 0)), 0) AS "consumedMaterialCost"
    FROM traveler_material_consumption tmc
    JOIN material_lots ml ON ml.id = tmc.material_lot_id
    LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
    WHERE tmc.traveler_id::text IN (
      SELECT id::text FROM travelers WHERE project_id = $1
    )
  `, [projectId]);

  const partsRequestMaterialRes = await pool.query<{ committedMaterialCost: string }>(`
    SELECT COALESCE(SUM(quantity * COALESCE(estimated_cost, 0)), 0) AS "committedMaterialCost"
    FROM parts_requests
    WHERE project_id = $1
      AND is_active = true
      AND status = ANY($2::text[])
  `, [projectId, ORDERED_PARTS_REQUEST_STATUSES]);

  const materialBudgetExpression = await getProductionWorkOrderMaterialBudgetExpression();
  const wadMaterialBudgetRes = await pool.query<{ plannedMaterialCost: string }>(`
    SELECT COALESCE(SUM(
      COALESCE(
${materialBudgetExpression}
      )
    ), 0) AS "plannedMaterialCost"
    FROM production_work_orders
    WHERE project_id = $1
  `, [projectId]);

  const hasProjectReceivedMaterials = await canReadProjectReceivedMaterials();
  const acceptedReceivedMaterialCost = hasProjectReceivedMaterials
    ? parseFloat((await pool.query<{ acceptedMaterialCost: string }>(`
        SELECT COALESCE(SUM(extended_cost), 0) AS "acceptedMaterialCost"
        FROM project_received_materials
        WHERE project_id = $1
          AND status = 'accepted'
      `, [projectId]))[0]?.acceptedMaterialCost) || 0
    : 0;

  // Quantity-based production percent
  const qtyProgressRes = await pool.query<{ totalRequired: string; totalCompleted: string }>(`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $1
        AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $1
        AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $1::uuid
    ),
    qty_rows AS (
      SELECT
        COALESCE(wo2.quantity, 0)::numeric AS required_qty,
        COALESCE((
          SELECT COUNT(*) FROM travelers t2
          WHERE t2.production_work_order_id = wo2.id
            AND t2.status IN ('COMPLETE', 'CLOSED')
        ), 0)::numeric AS completed_qty
      FROM production_work_orders wo2
      WHERE wo2.project_id = $1
        -- Task #258: exclude WAD WOs cancelled by the P2 supersede rule.
        AND wo2.status NOT IN ('CANCELLED', 'CANCELED')
        AND NOT (
          wo2.work_order_number LIKE 'WAD-%'
          AND wo2.status NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
          AND EXISTS (
            SELECT 1
            FROM (
              SELECT DISTINCT LOWER(TRIM(part_number)) AS part_number
              FROM (
                SELECT poi.part_number
                FROM project_po_link ppl
                JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
                WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
                UNION
                SELECT p2po2.sku AS part_number
                FROM project_po_link ppl
                JOIN p2_production_orders p2po2 ON p2po2.p2_po_id = ppl.po_id
                WHERE p2po2.sku IS NOT NULL AND TRIM(p2po2.sku) <> ''
                UNION
                SELECT p2po2.part_name AS part_number
                FROM project_po_link ppl
                JOIN p2_production_orders p2po2 ON p2po2.p2_po_id = ppl.po_id
                WHERE p2po2.part_name IS NOT NULL AND TRIM(p2po2.part_name) <> ''
              ) parts
            ) psp
            WHERE psp.part_number = LOWER(TRIM(wo2.part_number))
          )
        )
      UNION ALL
      SELECT
        COALESCE(p2po.quantity, 0)::numeric AS required_qty,
        COALESCE(p2po.quantity_manufactured, 0)::numeric AS completed_qty
      FROM project_po_link ppl
      JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
      WHERE p2po.status NOT IN ('CANCELLED', 'CANCELED')
    )
    SELECT
      COALESCE(SUM(required_qty), 0) AS "totalRequired",
      COALESCE(SUM(completed_qty), 0) AS "totalCompleted"
    FROM qty_rows
  `, [projectId]);

  const wo = woRes[0];
  const wadTotal = parseInt(wo.totalWorkOrders) || 0;
  const wadCompleted = parseInt(wo.completedWorkOrders) || 0;

  // Item-level progress: when serialized items exist for the linked P2 PO,
  // these become the source of truth for production counts so the PM
  // Control Center matches the order card. Falls back to the existing
  // WAD/quantity_manufactured values when no serialized items exist.
  const today = new Date().toISOString().slice(0, 10);
  const itemAgg = await getProjectSerializedItemAggregateOrFallback(projectId, today);

  let total = wadTotal;
  let completed = wadCompleted;
  let totalRequired = parseFloat(qtyProgressRes[0].totalRequired) || 0;
  let totalCompleted = parseFloat(qtyProgressRes[0].totalCompleted) || 0;

  if (itemAgg.groups.length > 0) {
    // Replace P2 portion of WO row counts with serialized item groups so
    // the KPI matches the rebuilt /production table.
    // Task #258: exclude WAD WOs cancelled by the P2 supersede rule so KPIs
    // match the /production table.
    const wadOnlyTotal = await pool.query<{ count: string }>(
      `WITH project_po_link AS (
         SELECT p.po_id AS po_id
         FROM projects p
         WHERE p.id = $1 AND p.po_id IS NOT NULL
         UNION
         SELECT ps.linked_p2_order_id AS po_id
         FROM project_steps ps
         WHERE ps.project_id = $1 AND ps.linked_p2_order_id IS NOT NULL
         UNION
         SELECT DISTINCT p2po.p2_po_id AS po_id
         FROM p2_production_orders p2po
         WHERE p2po.project_id = $1::uuid
       ),
       p2_superseding_parts AS (
         SELECT DISTINCT LOWER(TRIM(part_number)) AS part_number
         FROM (
           SELECT poi.part_number
           FROM project_po_link ppl
           JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
           WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
           UNION
           SELECT p2po.sku AS part_number
           FROM project_po_link ppl
           JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
           WHERE p2po.sku IS NOT NULL AND TRIM(p2po.sku) <> ''
           UNION
           SELECT p2po.part_name AS part_number
           FROM project_po_link ppl
           JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
           WHERE p2po.part_name IS NOT NULL AND TRIM(p2po.part_name) <> ''
         ) parts
       )
       SELECT COUNT(*)::text AS count FROM production_work_orders
       WHERE project_id = $1
         AND status NOT IN ('CANCELLED', 'CANCELED')
         AND NOT (
           work_order_number LIKE 'WAD-%'
           AND status NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
           AND EXISTS (
             SELECT 1 FROM p2_superseding_parts psp
             WHERE psp.part_number = LOWER(TRIM(production_work_orders.part_number))
           )
         )`,
      [projectId],
    );
    const wadOnlyCompleted = await pool.query<{ count: string }>(
      `WITH project_po_link AS (
         SELECT p.po_id AS po_id
         FROM projects p
         WHERE p.id = $1 AND p.po_id IS NOT NULL
         UNION
         SELECT ps.linked_p2_order_id AS po_id
         FROM project_steps ps
         WHERE ps.project_id = $1 AND ps.linked_p2_order_id IS NOT NULL
         UNION
         SELECT DISTINCT p2po.p2_po_id AS po_id
         FROM p2_production_orders p2po
         WHERE p2po.project_id = $1::uuid
       ),
       p2_superseding_parts AS (
         SELECT DISTINCT LOWER(TRIM(part_number)) AS part_number
         FROM (
           SELECT poi.part_number
           FROM project_po_link ppl
           JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
           WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
           UNION
           SELECT p2po.sku AS part_number
           FROM project_po_link ppl
           JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
           WHERE p2po.sku IS NOT NULL AND TRIM(p2po.sku) <> ''
           UNION
           SELECT p2po.part_name AS part_number
           FROM project_po_link ppl
           JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
           WHERE p2po.part_name IS NOT NULL AND TRIM(p2po.part_name) <> ''
         ) parts
       )
       SELECT COUNT(*)::text AS count FROM production_work_orders
       WHERE project_id = $1
         AND status IN ('COMPLETE', 'COMPLETED', 'CLOSED')
         AND NOT (
           work_order_number LIKE 'WAD-%'
           AND status NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
           AND EXISTS (
             SELECT 1 FROM p2_superseding_parts psp
             WHERE psp.part_number = LOWER(TRIM(production_work_orders.part_number))
           )
         )`,
      [projectId],
    );
    const wadCount = parseInt(wadOnlyTotal[0]?.count ?? '0', 10) || 0;
    const wadDoneCount = parseInt(wadOnlyCompleted[0]?.count ?? '0', 10) || 0;
    const p2GroupCount = itemAgg.groups.length;
    const p2DoneGroupCount = itemAgg.groups.filter(
      g => g.totalUnits > 0 && g.completedUnits >= g.totalUnits,
    ).length;
    total = wadCount + p2GroupCount;
    completed = wadDoneCount + p2DoneGroupCount;
    totalRequired = itemAgg.totalRequired;
    totalCompleted = itemAgg.totalCompleted;
  }

  const productionPercent = totalRequired > 0
    ? Math.min(100, Math.round((totalCompleted / totalRequired) * 100))
    : (total > 0 ? Math.round((completed / total) * 100) : 0);

  const blockedWOs = parseInt(wo.blockedWorkOrders) || 0;
  const blockedTravelers = parseInt(travelerRes[0].blockedTravelerCount) || 0;
  const blockedCount = blockedWOs + blockedTravelers;

  const budgetedLaborHours = parseFloat(laborBudgetRes[0].budgetedLaborHours) || 0;
  const actualLaborHours = parseFloat(laborActualRes[0].actualLaborHours) || 0;
  const laborRemainingHours = budgetedLaborHours - actualLaborHours;

  const committedMaterialCost =
    (parseFloat(materialRes[0].committedMaterialCost) || 0) +
    (parseFloat(partsRequestMaterialRes[0]?.committedMaterialCost) || 0);
  const consumedMaterialCost =
    (parseFloat(consumedRes[0].consumedMaterialCost) || 0) +
    acceptedReceivedMaterialCost;
  const plannedMaterialCost = parseFloat(wadMaterialBudgetRes[0]?.plannedMaterialCost) || 0;
  const remainingMaterialBudget = plannedMaterialCost - committedMaterialCost - consumedMaterialCost;

  res.json({
    ...projRes[0],
    totalWorkOrders: total,
    completedWorkOrders: completed,
    productionPercent,
    openTravelerCount: parseInt(travelerRes[0].openTravelerCount) || 0,
    blockedCount,
    budgetedLaborHours,
    actualLaborHours,
    laborRemainingHours,
    plannedMaterialCost,
    committedMaterialCost,
    consumedMaterialCost,
    remainingMaterialBudget,
  });
}));

// GET /api/pm-dashboard/:projectId/production — work order table
router.get('/:projectId/production', h(async (req, res) => {
  const { projectId } = req.params;

  const today = new Date().toISOString().slice(0, 10);

  const result = await pool.query<ProductionRow>(`
    WITH project_po_link AS (
      -- Highest priority: the explicit projects.po_id pointer.
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $2
        AND p.po_id IS NOT NULL
      UNION
      -- Fallback: any project_steps row that links a P2 PO. We deliberately do
      -- NOT restrict to step_type = 'p2_order' because the link can also be
      -- attached during preproduction or other steps depending on workflow.
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $2
        AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $2::uuid
    ),
    p2_superseding_parts AS (
      SELECT DISTINCT LOWER(TRIM(part_number)) AS part_number
      FROM (
        SELECT poi.part_number
        FROM project_po_link ppl
        JOIN p2_purchase_order_items poi ON poi.po_id = ppl.po_id
        WHERE poi.part_number IS NOT NULL AND TRIM(poi.part_number) <> ''
        UNION
        SELECT p2po.sku AS part_number
        FROM project_po_link ppl
        JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
        WHERE p2po.sku IS NOT NULL AND TRIM(p2po.sku) <> ''
        UNION
        SELECT p2po.part_name AS part_number
        FROM project_po_link ppl
        JOIN p2_production_orders p2po ON p2po.p2_po_id = ppl.po_id
        WHERE p2po.part_name IS NOT NULL AND TRIM(p2po.part_name) <> ''
      ) parts
    ),
    wad_rows AS (
      SELECT
      wo.id::text AS "productionWorkOrderId",
      wo.work_order_number AS "workOrderNumber",
      wo.part_number AS "partNumber",
      wo.quantity AS "quantityRequired",
      (
        SELECT COUNT(*) FROM travelers t2
        WHERE t2.production_work_order_id = wo.id
          AND t2.status IN ('COMPLETE', 'CLOSED')
      )::int AS "quantityCompleted",
      (
        SELECT COUNT(*) FROM travelers t2
        WHERE t2.production_work_order_id = wo.id
          AND t2.status IN ('COMPLETE', 'CLOSED')
          AND t2.updated_at::date = $1::date
      )::int AS "quantityCompletedToday",
      'production_work_order'::text AS "sourceType",
      'WAD'::text AS "sourceLabel",
      wo.dashboard_type AS "dashboardType",
      wo.queue_type AS "queueType",
      wo.assigned_department AS "assignedDepartment",
      wo.assigned_dashboard_route AS "assignedDashboardRoute",
      NULL::text AS "dashboardLabel",
      wo.manufacturing_queue_id AS "manufacturingQueueId",
      wo.wizard_data AS "wizardData",
      wo.department_budgets AS "departmentBudgets",
      wo.wad_status AS "wadStatus",
      NULL::int AS "p2PoId",
      NULL::text AS "p2PoNumber",
      wo.status,
      wo.due_date AS "dueDate",
      (
        SELECT pl.department
        FROM punch_ledger pl
        WHERE (
          pl.production_work_order_id = wo.id
          OR pl.traveler_id IN (
            SELECT t3.id::text FROM travelers t3
            WHERE t3.production_work_order_id = wo.id
          )
        )
          AND pl.clock_out IS NULL
        ORDER BY pl.clock_in DESC
        LIMIT 1
      ) AS "currentDepartment",
      (
        SELECT ts.department_name
        FROM traveler_steps ts
        JOIN travelers t ON t.id = ts.traveler_id
        WHERE t.production_work_order_id = wo.id
          AND ts.status IN ('IN_PROGRESS', 'in_progress', 'ACTIVE', 'active', 'STARTED', 'started')
        ORDER BY ts.step_number ASC
        LIMIT 1
      ) AS "currentTravelerStep",
      (
        SELECT t.id::text FROM travelers t
        WHERE t.production_work_order_id = wo.id
          AND t.status NOT IN ('COMPLETE', 'CLOSED', 'SCRAPPED', 'CANCELLED')
        ORDER BY t.created_at DESC
        LIMIT 1
      ) AS "activeTravelerId",
      (
        SELECT t.traveler_number FROM travelers t
        WHERE t.production_work_order_id = wo.id
          AND t.status NOT IN ('COMPLETE', 'CLOSED', 'SCRAPPED', 'CANCELLED')
        ORDER BY t.created_at DESC
        LIMIT 1
      ) AS "activeTravelerNumber",
      0::int AS "ncrReplacementCount",
      0::int AS "activeReplacementCount",
      NULL::text AS "replacementSerialNumbers",
      CASE
        WHEN wo.due_date IS NULL THEN NULL
        WHEN wo.status IN ('COMPLETE', 'CLOSED') THEN
          CASE
            WHEN wo.updated_at IS NOT NULL
            THEN (wo.updated_at::date - wo.due_date::date)
            ELSE NULL
          END
        ELSE ($1::date - wo.due_date::date)
      END AS "daysScheduleVariance",
      (
        SELECT ts.blocked_reason
        FROM traveler_steps ts
        JOIN travelers t ON t.id::text = ts.traveler_id
        WHERE t.production_work_order_id = wo.id
          AND ts.blocked_reason IS NOT NULL
          AND ts.blocked_reason <> ''
        ORDER BY COALESCE(ts.blocked_at, '1970-01-01'::timestamp) DESC
        LIMIT 1
      ) AS "blockReason"
    FROM production_work_orders wo
      WHERE wo.project_id = $2
        -- Task #258: hide WAD WOs cancelled by the P2 supersede rule.
        AND wo.status NOT IN ('CANCELLED', 'CANCELED')
        AND NOT (
          wo.work_order_number LIKE 'WAD-%'
          AND wo.status NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
          AND EXISTS (
            SELECT 1 FROM p2_superseding_parts psp
            WHERE psp.part_number = LOWER(TRIM(wo.part_number))
          )
        )
    ),
    p2_rows AS (
      SELECT
        ('p2-production-order-group:' || p2po.p2_po_id::text || ':' ||
          COALESCE(p2po.p2_po_item_id::text, 'null') || ':' ||
          COALESCE(p2po.department, '')) AS "productionWorkOrderId",
        CASE
          WHEN COUNT(*) = 1 THEN MIN(p2po.order_id)
          ELSE MIN(p2po.order_id) || '–' || MAX(p2po.order_id) || ' (' || COUNT(*) || ')'
        END AS "workOrderNumber",
        COALESCE(MAX(p2poi.part_number), MAX(p2po.sku)) AS "partNumber",
        SUM(COALESCE(p2po.quantity, 0))::int AS "quantityRequired",
        SUM(COALESCE(p2po.quantity_manufactured, 0))::int AS "quantityCompleted",
        SUM(
          CASE
            WHEN p2po.completed_at IS NOT NULL
              AND p2po.completed_at::date = $1::date
            THEN COALESCE(p2po.quantity_manufactured, 0)
            ELSE 0
          END
        )::int AS "quantityCompletedToday",
        'p2_production_order'::text AS "sourceType",
        'P2'::text AS "sourceLabel",
        NULL::text AS "dashboardType",
        NULL::text AS "queueType",
        NULL::text AS "assignedDepartment",
        NULL::text AS "assignedDashboardRoute",
        NULL::text AS "dashboardLabel",
        NULL::int AS "manufacturingQueueId",
        NULL::jsonb AS "wizardData",
        NULL::jsonb AS "departmentBudgets",
        NULL::text AS "wadStatus",
        p2po.p2_po_id AS "p2PoId",
        MAX(p2po_head.po_number) AS "p2PoNumber",
        CASE
          WHEN SUM(COALESCE(p2po.quantity, 0)) > 0
            AND SUM(COALESCE(p2po.quantity_manufactured, 0))
              >= SUM(COALESCE(p2po.quantity, 0))
            THEN 'COMPLETED'
          WHEN SUM(COALESCE(p2po.quantity_manufactured, 0)) > 0
            OR bool_or(p2po.status IN ('IN_PROGRESS', 'in_progress'))
            THEN 'IN_PROGRESS'
          ELSE 'PENDING'
        END AS status,
        MIN(p2po.due_date) AS "dueDate",
        p2po.department AS "currentDepartment",
        NULL::text AS "currentTravelerStep",
        NULL::text AS "activeTravelerId",
        NULL::text AS "activeTravelerNumber",
        (
          SELECT COUNT(*)::int
          FROM p2_serialized_items psi
          WHERE psi.po_id = p2po.p2_po_id
            AND (p2po.p2_po_item_id IS NULL OR psi.po_item_id = p2po.p2_po_item_id)
            AND psi.metadata->>'isReplacement' = 'true'
        ) AS "ncrReplacementCount",
        (
          SELECT COUNT(*)::int
          FROM p2_serialized_items psi
          WHERE psi.po_id = p2po.p2_po_id
            AND (p2po.p2_po_item_id IS NULL OR psi.po_item_id = p2po.p2_po_item_id)
            AND psi.status = 'ACTIVE'
            AND psi.metadata->>'isReplacement' = 'true'
        ) AS "activeReplacementCount",
        (
          SELECT string_agg(psi.serial_number, ', ' ORDER BY psi.created_at DESC)
          FROM p2_serialized_items psi
          WHERE psi.po_id = p2po.p2_po_id
            AND (p2po.p2_po_item_id IS NULL OR psi.po_item_id = p2po.p2_po_item_id)
            AND psi.metadata->>'isReplacement' = 'true'
        ) AS "replacementSerialNumbers",
        CASE
          WHEN MIN(p2po.due_date) IS NULL THEN NULL
          WHEN bool_and(p2po.status IN ('COMPLETED', 'CLOSED'))
            AND MAX(p2po.completed_at) IS NOT NULL
            THEN (MAX(p2po.completed_at)::date - MIN(p2po.due_date)::date)
          WHEN bool_and(p2po.status IN ('COMPLETED', 'CLOSED'))
            THEN NULL
          ELSE ($1::date - MIN(p2po.due_date)::date)
        END AS "daysScheduleVariance",
        NULL::text AS "blockReason"
      FROM project_po_link ppl
      JOIN p2_purchase_orders p2po_head ON p2po_head.id = ppl.po_id
      JOIN p2_production_orders p2po ON p2po.p2_po_id = p2po_head.id
        -- Task #242: scope to this project's slice of the PO. Rows with a
        -- non-null project_id are only included when they belong to this
        -- project; rows with project_id IS NULL fall back to PO-wide so
        -- POs that cannot be deterministically attributed to a single
        -- project keep working as they did before.
        AND (p2po.project_id IS NULL OR p2po.project_id = $2::uuid)
      LEFT JOIN p2_purchase_order_items p2poi ON p2poi.id = p2po.p2_po_item_id
      -- No status filter: match WAD branch which returns rows regardless of status.
      GROUP BY p2po.p2_po_id, p2po.p2_po_item_id, p2po.department
    )
    SELECT * FROM wad_rows
    UNION ALL
    SELECT * FROM p2_rows
    ORDER BY "sourceType" ASC, "workOrderNumber" ASC
  `, [today, projectId]);

  // Count of P2 POs linked to this project (used by the frontend to render an
  // actionable empty state when zero rows are returned).
  const linkRes = await pool.query<{ count: string }>(`
    WITH project_po_link AS (
      SELECT p.po_id AS po_id
      FROM projects p
      WHERE p.id = $1
        AND p.po_id IS NOT NULL
      UNION
      SELECT ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = $1
        AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = $1::uuid
    )
    SELECT COUNT(*)::text AS count FROM project_po_link
  `, [projectId]);

  const linkedP2PoCount = parseInt(linkRes[0]?.count ?? '0', 10) || 0;
  const linkedP2PoStatuses = await getProjectP2PoStatusSummaries(projectId);

  // Item-level override: when serialized items exist for the project's linked
  // P2 PO, drive the P2 portion of the production table from p2_serialized_items
  // (the same source the order card uses) so the dashboard and order card agree.
  // The WAD half of the union (production_work_orders + travelers) is preserved.
  const itemAgg = await getProjectSerializedItemAggregateOrFallback(projectId, today);
  let finalRows: ProductionRow[] = result;
  if (itemAgg.groups.length > 0) {
    const wadOnly = result.filter(r => r.sourceType !== 'p2_production_order');

    // Pull p2 PO numbers + replacement counts in one batch keyed by (poId, poItemId).
    const replKey = (poId: number, poItemId: number) => `${poId}:${poItemId}`;
    const replMap = new Map<string, { ncr: number; active: number; serials: string | null }>();
    if (itemAgg.linkedPoIds.length) {
      const replRows = await pool.query<{
        poId: string; poItemId: string;
        ncr: string; active: string; serials: string | null;
      }>(`
        SELECT
          psi.po_id::text AS "poId",
          psi.po_item_id::text AS "poItemId",
          COUNT(*) FILTER (WHERE psi.metadata->>'isReplacement' = 'true')::text AS "ncr",
          COUNT(*) FILTER (
            WHERE psi.status = 'ACTIVE' AND psi.metadata->>'isReplacement' = 'true'
          )::text AS "active",
          string_agg(
            CASE WHEN psi.metadata->>'isReplacement' = 'true' THEN psi.serial_number END,
            ', ' ORDER BY psi.created_at DESC
          ) AS "serials"
        FROM p2_serialized_items psi
        WHERE psi.po_id = ANY($1::int[])
        GROUP BY psi.po_id, psi.po_item_id
      `, [itemAgg.linkedPoIds]);
      for (const r of replRows) {
        replMap.set(replKey(parseInt(r.poId, 10), parseInt(r.poItemId, 10)), {
          ncr: parseInt(r.ncr, 10) || 0,
          active: parseInt(r.active, 10) || 0,
          serials: r.serials,
        });
      }
    }

    const todayDate = new Date(today + 'T00:00:00Z');
    const p2Rows: ProductionRow[] = itemAgg.groups.map(g => {
      const repl = replMap.get(replKey(g.poId, g.poItemId));
      const status: string =
        g.totalUnits > 0 && g.completedUnits >= g.totalUnits
          ? 'COMPLETED'
          : (g.completedUnits > 0 || g.inProductionUnits > 0)
            ? 'IN_PROGRESS'
            : 'PLANNED';
      let daysScheduleVariance: string | null = null;
      if (g.dueDate) {
        const due = new Date(g.dueDate.slice(0, 10) + 'T00:00:00Z');
        const diffDays = Math.round((todayDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        daysScheduleVariance = String(diffDays);
      }
      return {
        productionWorkOrderId:
          `p2-serialized-group:${g.poId}:${g.poItemId}`,
        workOrderNumber: g.poNumber ?? `PO-${g.poId}`,
        partNumber: g.partNumber ?? '',
        quantityRequired: g.totalUnits,
        quantityCompleted: g.completedUnits,
        quantityCompletedToday: g.completedTodayUnits,
        sourceType: 'p2_production_order',
        sourceLabel: 'P2',
        dashboardType: null,
        queueType: null,
        assignedDepartment: null,
        assignedDashboardRoute: null,
        dashboardLabel: null,
        manufacturingQueueId: null,
        wizardData: null,
        departmentBudgets: null,
        wadStatus: null,
        p2PoId: g.poId,
        p2PoNumber: g.poNumber,
        status,
        dueDate: g.dueDate,
        currentDepartment: g.currentDepartment,
        currentTravelerStep: null,
        activeTravelerId: null,
        activeTravelerNumber: null,
        ncrReplacementCount: repl?.ncr ?? 0,
        activeReplacementCount: repl?.active ?? 0,
        replacementSerialNumbers: repl?.serials ?? null,
        daysScheduleVariance,
        blockReason: null,
      };
    });

    finalRows = [...wadOnly, ...p2Rows].sort((a, b) => {
      if (a.sourceType !== b.sourceType) return a.sourceType < b.sourceType ? -1 : 1;
      return (a.workOrderNumber ?? '').localeCompare(b.workOrderNumber ?? '');
    });
  }

  finalRows = await enrichP2RowsWithWadBridge(projectId, finalRows);

  const rowsWithAssignments = finalRows.map((row) => {
    if (row.sourceType === 'p2_production_order') {
      const params = new URLSearchParams({ tab: 'production' });
      if (row.p2PoId) params.set('poId', String(row.p2PoId));
      if (row.p2PoNumber) params.set('po', row.p2PoNumber);

      return {
        ...row,
        dashboardType: 'P2',
        queueType: row.currentDepartment ?? 'P2',
        assignedDepartment: row.currentDepartment ?? 'P2 Production',
        assignedDashboardRoute: `/p2-control-center?${params.toString()}`,
        dashboardLabel: 'P2 Control Center',
        manufacturingQueueId: row.manufacturingQueueId ?? null,
        wizardData: undefined,
        departmentBudgets: undefined,
      };
    }

    const assignment = assignDashboardForWorkOrder({
      department: row.currentDepartment ?? row.currentTravelerStep,
      dashboardType: row.dashboardType,
      queueType: row.queueType,
      assignedDepartment: row.assignedDepartment,
      assignedDashboardRoute: row.assignedDashboardRoute,
      wizardData: row.wizardData,
      departmentBudgets: row.departmentBudgets,
    });

    return {
      ...row,
      dashboardType: row.dashboardType ?? assignment.dashboardType,
      queueType: row.queueType ?? assignment.queueType,
      assignedDepartment: row.assignedDepartment ?? assignment.assignedDepartment,
      assignedDashboardRoute: row.assignedDashboardRoute ?? assignment.assignedDashboardRoute,
      dashboardLabel: assignment.dashboardLabel,
      manufacturingQueueId: row.manufacturingQueueId ?? null,
      wizardData: undefined,
      departmentBudgets: undefined,
    };
  });

const workOrderRows = rowsWithAssignments.filter(row => row.sourceType !== 'p2_production_order');
const linkedP2Production = rowsWithAssignments.filter(row => row.sourceType === 'p2_production_order');

res.json({
  rows: workOrderRows,
  linkedP2Production,
  linkedP2PoCount,
  linkedP2PoStatuses,
});
}));

// GET /api/pm-dashboard/:projectId/production/p2-serialized - linked P2 PO item breakdown
router.get('/:projectId/production/p2-serialized', h(async (req, res) => {
  const { projectId } = req.params;
  const items = await getProjectP2SerializedBreakdown(projectId);
  res.json({ items });
}));

// GET /api/pm-dashboard/:projectId/production/:workOrderId — drawer detail
router.get('/:projectId/production/:workOrderId', h(async (req, res) => {
  const { projectId, workOrderId } = req.params;

  const woRes = await pool.query(`
    SELECT
      wo.id AS "productionWorkOrderId",
      wo.work_order_number AS "workOrderNumber",
      wo.part_number AS "partNumber",
      wo.description,
      wo.quantity AS "quantityRequired",
      wo.status,
      wo.due_date AS "dueDate",
      wo.start_date AS "startDate",
      wo.total_budget_hours AS "totalBudgetHours",
      wo.department_budgets AS "departmentBudgets"
    FROM production_work_orders wo
    WHERE wo.id = $1 AND wo.project_id = $2
  `, [workOrderId, projectId]);

  if (!woRes.length) {
    res.status(404).json({ error: 'Work order not found in this project' });
    return;
  }

  const travelersRes = await pool.query(`
    SELECT
      t.id,
      t.traveler_number AS "travelerNumber",
      t.status,
      t.part_number AS "partNumber",
      t.quantity,
      t.created_at AS "createdAt"
    FROM travelers t
    WHERE t.production_work_order_id = $1
    ORDER BY t.created_at DESC
    LIMIT 5
  `, [workOrderId]);

  // Open sessions from punch_ledger for this work order
  const sessionsRes = await pool.query(`
    SELECT
      pl.id AS "sessionId",
      e.name AS "operatorName",
      pl.charge_code AS "chargeCode",
      pl.clock_in AS "startedAt",
      ROUND(EXTRACT(EPOCH FROM (NOW() - pl.clock_in)) / 60) AS "elapsedMinutes"
    FROM punch_ledger pl
    JOIN employees e ON e.id = pl.employee_id
    WHERE pl.production_work_order_id = $1 AND pl.clock_out IS NULL
    ORDER BY pl.clock_in DESC
  `, [workOrderId]);

  res.json({
    workOrder: woRes[0],
    travelers: travelersRes,
    openSessions: sessionsRes,
  });
}));

// GET /api/pm-dashboard/:projectId/labor — labor summary, charge code table, live feed
router.get('/:projectId/labor', h(async (req, res) => {
  const { projectId } = req.params;

  // Budget from production_work_orders.total_budget_hours
  const budgetRes = await pool.query<{ budgetedHours: string; overrunHours: string }>(`
    SELECT
      COALESCE(SUM(wo.total_budget_hours::numeric), 0) AS "budgetedHours",
      COALESCE((
        SELECT SUM(lbo.requested_hours::numeric)
        FROM labor_budget_overrides lbo
        WHERE lbo.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        AND lbo.status = 'APPROVED'
      ), 0) AS "overrunHours"
    FROM production_work_orders wo
    WHERE wo.project_id = $1
  `, [projectId]);

  // Labor used from punch_ledger. PM views include open sessions so supervisors see
  // active WAD time-bank consumption before an employee clocks out.
  // Some legacy/admin-corrected punches only carry the WAD charge code, so PM scope
  // also includes punches whose charge code is authored in this project's WAD budget.
  const actualRes = await pool.query<{ actualHours: string }>(`
    WITH project_charge_codes AS (
      SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    )
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (COALESCE(pl.clock_out, NOW()) - pl.clock_in)) / 3600.0
    ), 0) AS "actualHours"
    FROM punch_ledger pl
    LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
    WHERE pl.labor_class = 'REGULAR'
      AND (
        pl.project_id = $1
        OR
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
        OR COALESCE(lcc.code, pl.charge_code) IN (
          SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL
        )
      )
  `, [projectId]);

  // Open session count from punch_ledger
  const openSessionRes = await pool.query<{ openSessionCount: string }>(`
    WITH project_charge_codes AS (
      SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    )
    SELECT COUNT(*) AS "openSessionCount"
    FROM punch_ledger pl
    LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
    WHERE pl.clock_out IS NULL
      AND pl.labor_class = 'REGULAR'
      AND (
        pl.project_id = $1
        OR
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
        OR COALESCE(lcc.code, pl.charge_code) IN (
          SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL
        )
      )
  `, [projectId]);

  const budgetedHours = (parseFloat(budgetRes[0].budgetedHours) || 0)
    + (parseFloat(budgetRes[0].overrunHours) || 0);
  const actualHours = parseFloat(actualRes[0].actualHours) || 0;
  const remainingHours = budgetedHours - actualHours;
  const percentConsumed = budgetedHours > 0 ? Math.round((actualHours / budgetedHours) * 100) : 0;

  // Charge code breakdown — actual hours from punch_ledger grouped by charge_code_id.
  // Budgeted hours: sum of (production_work_orders.total_budget_hours + APPROVED labor_budget_overrides)
  // for all work orders that have punch_ledger sessions against each charge code.
  // This replaces timekeeping.labor_authorizations per-charge-code authorization aggregation using
  // the native labor_budget_overrides (approved overrun authorizations) as the budget authority.
  const chargeCodeRes = await pool.query<ChargeCodeAggRow>(`
    WITH wad_budget_rows AS (
      -- Pull the authored WAD Step 4 time bank into PM even before anyone clocks time.
      SELECT
        wo.id AS work_order_id,
        NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code,
        NULLIF(TRIM(cc_row->>'department'), '') AS department,
        NULLIF(TRIM(cc_row->>'operation'), '') AS task_name,
        COALESCE(NULLIF(cc_row->>'budgetedHours', '')::numeric, 0) AS budgeted_hours
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    ),
    charge_actuals AS (
      -- Actual hours per charge code within the project scope. Include punches
      -- linked only by WAD charge code so admin/timekeeper corrections roll up.
      SELECT
        COALESCE(lcc.code, pl.charge_code) AS charge_code,
        SUM(EXTRACT(EPOCH FROM (COALESCE(pl.clock_out, NOW()) - pl.clock_in)) / 3600.0) AS actual_hours
      FROM punch_ledger pl
      LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
      WHERE pl.labor_class = 'REGULAR'
        AND COALESCE(lcc.code, pl.charge_code) IS NOT NULL
        AND (
          pl.project_id = $1
          OR
          pl.production_work_order_id IN (
            SELECT id FROM production_work_orders WHERE project_id = $1
          )
          OR pl.traveler_id IN (
            SELECT id::text FROM travelers WHERE project_id = $1
          )
          OR COALESCE(lcc.code, pl.charge_code) IN (
            SELECT charge_code FROM wad_budget_rows WHERE charge_code IS NOT NULL
          )
        )
      GROUP BY COALESCE(lcc.code, pl.charge_code)
    ),
    charge_code_totals AS (
      SELECT
        COALESCE(wbr.charge_code, ca.charge_code) AS charge_code,
        MAX(wbr.department) AS department,
        MAX(wbr.task_name) AS task_name,
        COALESCE(SUM(wbr.budgeted_hours), 0) AS budgeted_hours,
        COALESCE(MAX(ca.actual_hours), 0) AS actual_hours
      FROM wad_budget_rows wbr
      FULL OUTER JOIN charge_actuals ca ON ca.charge_code = wbr.charge_code
      WHERE COALESCE(wbr.charge_code, ca.charge_code) IS NOT NULL
      GROUP BY COALESCE(wbr.charge_code, ca.charge_code)
    )
    SELECT
      COALESCE(lcc.id, ABS(HASHTEXT(cct.charge_code))) AS "chargeCodeId",
      cct.charge_code AS "chargeCode",
      COALESCE(cct.department, lcc.department) AS department,
      COALESCE(cct.task_name, lcc.description) AS "taskName",
      ROUND(cct.budgeted_hours::numeric, 2) AS "budgetedHours",
      ROUND(cct.actual_hours::numeric, 4) AS "actualHours"
    FROM charge_code_totals cct
    LEFT JOIN public.charge_codes lcc ON lcc.code = cct.charge_code
    ORDER BY cct.charge_code ASC
  `, [projectId]);

  const chargeCodeRows = chargeCodeRes.map((r) => {
    const budgeted = parseFloat(r.budgetedHours) || 0;
    const actual = parseFloat(r.actualHours) || 0;
    const remaining = budgeted - actual;
    const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
    return {
      chargeCodeId: r.chargeCodeId,
      chargeCode: r.chargeCode,
      department: r.department,
      taskName: r.taskName,
      budgetedHours: budgeted,
      actualHours: actual,
      remainingHours: remaining,
      percentConsumed: pct,
      isOverrun: pct > 100,
      isNearLimit: pct >= 80 && pct <= 100,
    };
  });

  // Live open sessions feed from punch_ledger
  const liveRes = await pool.query<LiveSessionRow>(`
    WITH project_charge_codes AS (
      SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    )
    SELECT
      pl.id AS "sessionId",
      pl.employee_id AS "employeeId",
      e.name AS "employeeName",
      pl.traveler_id AS "travelerId",
      t.traveler_number AS "travelerNumber",
      pl.department,
      COALESCE(lcc.code, pl.charge_code) AS "chargeCode",
      pl.clock_in AS "startedAt",
      ROUND(EXTRACT(EPOCH FROM (NOW() - pl.clock_in)) / 60) AS "elapsedMinutes"
    FROM punch_ledger pl
    JOIN employees e ON e.id = pl.employee_id
    LEFT JOIN travelers t ON t.id::text = pl.traveler_id
    LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
    WHERE pl.clock_out IS NULL
      AND pl.labor_class = 'REGULAR'
      AND (
        pl.project_id = $1
        OR
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
        OR COALESCE(lcc.code, pl.charge_code) IN (
          SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL
        )
      )
    ORDER BY pl.clock_in DESC
  `, [projectId]);

  const employeeIds = Array.from(new Set(liveRes.map((r) => r.employeeId)));
  const certMap: Record<number, string> = {};
  const authMap: Record<number, boolean> = {};

  if (employeeIds.length > 0) {
    // Certification status: join training_certifications to public.certifications catalog
    // so certification type metadata (name, validity period, isRequired) is available.
    if (await publicTableExists('training_certifications')) {
      const certRes = await pool.query<CertRow & { certificationName: string | null }>(`
        SELECT DISTINCT ON (tc.trainee_id)
          tc.trainee_id AS "employeeId",
          c.name AS "certificationName",
          tc.status,
          tc.expires_at::text AS "expiresDate"
        FROM training_certifications tc
        LEFT JOIN certifications c ON c.id = tc.certification_id
        WHERE tc.trainee_id = ANY($1::int[])
        ORDER BY tc.trainee_id, tc.certified_at DESC NULLS LAST
      `, [employeeIds]);

      const today = new Date().toISOString().slice(0, 10);
      for (const row of certRes) {
        if (!row.expiresDate) {
          certMap[row.employeeId] = 'Unknown';
        } else if (row.expiresDate < today) {
          certMap[row.employeeId] = 'Expired';
        } else if (row.status === 'certified') {
          certMap[row.employeeId] = 'Valid';
        } else {
          certMap[row.employeeId] = 'Missing';
        }
      }
    }

    // Authorization status: employee is authorized for this project if they have an active
    // traveler_authorization for a part_number that appears in a traveler scoped to this project.
    // Scoped to project $2 via travelers.project_id = project.
    const authRes = await pool.query<{ employeeId: number }>(`
      SELECT DISTINCT ta.employee_id AS "employeeId"
      FROM traveler_authorizations ta
      WHERE ta.employee_id = ANY($1::int[])
        AND ta.is_active = true
        AND (ta.expires_at IS NULL OR ta.expires_at > NOW())
        AND EXISTS (
          SELECT 1 FROM travelers t
          WHERE t.project_id = $2::uuid
            AND t.part_number IS NOT NULL
            AND t.part_number = ta.part_number
        )
    `, [employeeIds, projectId]);
    for (const row of authRes) {
      authMap[row.employeeId] = true;
    }
  }

  const liveFeed = liveRes.map((r) => ({
    sessionId: r.sessionId,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    travelerId: r.travelerId,
    travelerNumber: r.travelerNumber,
    department: r.department,
    chargeCode: r.chargeCode,
    startedAt: r.startedAt,
    elapsedMinutes: Math.round(parseFloat(String(r.elapsedMinutes)) || 0),
    certificationStatus: certMap[r.employeeId] ?? 'Unknown',
    authorizedForWork: authMap[r.employeeId] ?? false,
  }));

  const dailyRes = await pool.query<DailyLaborRow>(`
    WITH wad_budget_rows AS (
      SELECT
        wo.id AS work_order_id,
        NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code,
        NULLIF(TRIM(cc_row->>'department'), '') AS department,
        COALESCE(NULLIF(cc_row->>'budgetedHours', '')::numeric, 0) AS budgeted_hours
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    ),
    work_order_budget AS (
      SELECT
        work_order_id,
        SUM(budgeted_hours) AS budgeted_hours
      FROM wad_budget_rows
      GROUP BY work_order_id
    ),
    charge_code_budget AS (
      SELECT
        charge_code,
        SUM(budgeted_hours) AS budgeted_hours
      FROM wad_budget_rows
      WHERE charge_code IS NOT NULL
      GROUP BY charge_code
    )
    SELECT
      pl.clock_in::date::text AS "workDate",
      pl.employee_id AS "employeeId",
      e.name AS "employeeName",
      pl.department AS department,
      COALESCE(lcc.code, pl.charge_code) AS "chargeCode",
      wo.work_order_number AS "workOrderNumber",
      t.traveler_number AS "travelerNumber",
      COALESCE(MAX(wob.budgeted_hours), MAX(ccb.budgeted_hours), 0) AS "budgetedHours",
      COALESCE(SUM(
        CASE
          WHEN pl.clock_out IS NOT NULL AND pl.labor_class = 'REGULAR'
            THEN EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0
          ELSE 0
        END
      ), 0) AS "actualHours",
      COALESCE(SUM(
        CASE
          WHEN pl.clock_out IS NULL
            THEN EXTRACT(EPOCH FROM (NOW() - pl.clock_in)) / 60.0
          ELSE 0
        END
      ), 0) AS "activeMinutes",
      COUNT(*) FILTER (WHERE pl.clock_out IS NULL)::text AS "openSessionCount"
    FROM punch_ledger pl
    JOIN employees e ON e.id = pl.employee_id
    LEFT JOIN production_work_orders wo ON wo.id = pl.production_work_order_id
    LEFT JOIN travelers t ON t.id::text = pl.traveler_id
    LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
    LEFT JOIN work_order_budget wob
      ON wob.work_order_id = COALESCE(pl.production_work_order_id, t.production_work_order_id)
    LEFT JOIN charge_code_budget ccb
      ON ccb.charge_code = COALESCE(lcc.code, pl.charge_code)
    WHERE pl.labor_class = 'REGULAR'
      AND (
        pl.project_id = $1
        OR
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
        OR COALESCE(lcc.code, pl.charge_code) IN (
          SELECT charge_code FROM wad_budget_rows WHERE charge_code IS NOT NULL
        )
      )
    GROUP BY
      pl.clock_in::date,
      pl.employee_id,
      e.name,
      pl.department,
      COALESCE(lcc.code, pl.charge_code),
      wo.work_order_number,
      t.traveler_number
    ORDER BY pl.clock_in::date DESC, e.name ASC
    LIMIT 30
  `, [projectId]);

  const dailyLaborRows = dailyRes.map((r) => {
    const budgetedHoursForRow = parseFloat(r.budgetedHours) || 0;
    const actualHoursForRow = parseFloat(r.actualHours) || 0;
    const activeHoursForRow = (parseFloat(r.activeMinutes) || 0) / 60;
    const usedHours = actualHoursForRow + activeHoursForRow;
    return {
      workDate: r.workDate,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      department: r.department,
      chargeCode: r.chargeCode,
      workOrderNumber: r.workOrderNumber,
      travelerNumber: r.travelerNumber,
      budgetedHours: budgetedHoursForRow,
      actualHours: actualHoursForRow,
      activeHours: activeHoursForRow,
      usedHours,
      remainingHours: budgetedHoursForRow - usedHours,
      percentConsumed: budgetedHoursForRow > 0 ? Math.round((usedHours / budgetedHoursForRow) * 100) : 0,
      openSessionCount: parseInt(r.openSessionCount, 10) || 0,
    };
  });

  res.json({
    summary: {
      budgetedHours,
      actualHours,
      remainingHours,
      percentConsumed,
      openSessionCount: parseInt(openSessionRes[0].openSessionCount) || 0,
    },
    chargeCodeRows,
    liveFeed,
    dailyLaborRows,
  });
}));

// GET /api/pm-dashboard/:projectId/labor/entries - read-only traceability from PM labor usage to Timekeeper punches
router.get('/:projectId/labor/entries', h(async (req, res) => {
  const { projectId } = req.params;

  if (!canTraceProjectLabor(req.user)) {
    res.status(403).json({ error: 'Labor entry trace is currently restricted to glennj/admin.' });
    return;
  }

  const chargeCode = typeof req.query.chargeCode === 'string' && req.query.chargeCode.trim()
    ? req.query.chargeCode.trim()
    : null;
  const employeeId = typeof req.query.employeeId === 'string' && /^\d+$/.test(req.query.employeeId)
    ? Number(req.query.employeeId)
    : null;
  const workDate = typeof req.query.workDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.workDate)
    ? req.query.workDate
    : null;

  const filters: string[] = [];
  const params: unknown[] = [projectId];
  if (chargeCode) {
    params.push(chargeCode);
    filters.push(`COALESCE(lcc.code, pl.charge_code) = $${params.length}`);
  }
  if (employeeId != null) {
    params.push(employeeId);
    filters.push(`pl.employee_id = $${params.length}`);
  }
  if (workDate) {
    params.push(workDate);
    filters.push(`pl.clock_in::date = $${params.length}::date`);
  }

  const filterSql = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const rows = await pool.query<LaborEntryTraceRow>(`
    WITH project_charge_codes AS (
      SELECT DISTINCT NULLIF(TRIM(cc_row->>'chargeCode'), '') AS charge_code
      FROM production_work_orders wo
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(wo.wizard_data->'step4'->'chargeCodes') = 'array'
            THEN wo.wizard_data->'step4'->'chargeCodes'
          ELSE '[]'::jsonb
        END
      ) AS cc_row
      WHERE wo.project_id = $1
        AND COALESCE(NULLIF(cc_row->>'classification', ''), 'DIRECT') = 'DIRECT'
    )
    SELECT
      pl.id AS "sessionId",
      pl.employee_id AS "employeeId",
      e.name AS "employeeName",
      pl.clock_in AS "clockIn",
      pl.clock_out AS "clockOut",
      ROUND(EXTRACT(EPOCH FROM (COALESCE(pl.clock_out, NOW()) - pl.clock_in)) / 3600.0, 4) AS "hours",
      pl.source,
      pl.labor_class AS "laborClass",
      pl.department,
      pl.operation,
      COALESCE(lcc.code, pl.charge_code) AS "chargeCode",
      wo.work_order_number AS "workOrderNumber",
      t.traveler_number AS "travelerNumber",
      pl.approval_status AS "approvalStatus",
      pl.is_edited AS "isEdited",
      pl.edit_note AS "editNote",
      ts.id AS "timesheetId",
      ts.status AS "timesheetStatus",
      ts.period_start AS "periodStart",
      ts.period_end AS "periodEnd"
    FROM punch_ledger pl
    JOIN employees e ON e.id = pl.employee_id
    LEFT JOIN public.charge_codes lcc ON lcc.id = pl.charge_code_id
    LEFT JOIN production_work_orders wo ON wo.id = pl.production_work_order_id
    LEFT JOIN travelers t ON t.id::text = pl.traveler_id
    LEFT JOIN timekeeping.timesheets ts
      ON ts.employee_id = pl.employee_id
     AND pl.clock_in::date BETWEEN ts.period_start::date AND ts.period_end::date
    WHERE pl.labor_class = 'REGULAR'
      AND (
        pl.project_id = $1
        OR
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
        OR COALESCE(lcc.code, pl.charge_code) IN (
          SELECT charge_code FROM project_charge_codes WHERE charge_code IS NOT NULL
        )
      )
      ${filterSql}
    ORDER BY pl.clock_in DESC, pl.id DESC
    LIMIT 300
  `, params);

  res.json(rows.map((row) => ({
    ...row,
    hours: parseFloat(row.hours) || 0,
    locked: ['certified', 'locked', 'correction_requested', 'correction_approved'].includes(String(row.timesheetStatus ?? '').toLowerCase()),
  })));
}));

// GET /api/pm-dashboard/:projectId/materials — material budget
router.get('/:projectId/materials', h(async (req, res) => {
  const { projectId } = req.params;

  const materialBudgetExpression = await getProductionWorkOrderMaterialBudgetExpression();
  const budgetRes = await pool.query<MaterialBudgetAmountRow>(`
    SELECT COALESCE(SUM(
      COALESCE(
${materialBudgetExpression}
      )
    ), 0) AS "plannedCost"
    FROM production_work_orders
    WHERE project_id = $1
  `, [projectId]);

  const summaryRes = await pool.query<MaterialSummaryRow>(`
    SELECT
      COALESCE(wad_budget_sub.planned, 0) AS "plannedCost",
      COALESCE(committed_sub.committed, 0) + COALESCE(parts_request_sub.committed, 0) AS "committedCost",
      COALESCE(consumed_sub.consumed, 0) AS "consumedCost"
    FROM (
      SELECT SUM(COALESCE(NULLIF(wo.wizard_data->'step5'->>'materialSpendCap', '')::numeric, 0)) AS planned
      FROM production_work_orders wo
      WHERE wo.project_id = $1
    ) wad_budget_sub,
    (
      SELECT SUM(mlr.quantity_reserved * COALESCE(ii.unit_cost, 0)) AS committed
      FROM material_lot_reservations mlr
      JOIN material_lots ml ON ml.id = mlr.material_lot_id
      LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
      WHERE mlr.traveler_id::text IN (
        SELECT id::text FROM travelers WHERE project_id = $1
      )
    ) committed_sub,
    (
      SELECT SUM(COALESCE(tmc.qty_used, tmc.quantity_used, 0) * COALESCE(ii.unit_cost, 0)) AS consumed
      FROM traveler_material_consumption tmc
      JOIN material_lots ml ON ml.id = tmc.material_lot_id
      LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
      WHERE tmc.traveler_id::text IN (
        SELECT id::text FROM travelers WHERE project_id = $1
      )
    ) consumed_sub,
    (
      SELECT SUM(quantity * COALESCE(estimated_cost, 0)) AS committed
      FROM parts_requests
      WHERE project_id = $1
        AND is_active = true
        AND status = ANY($2::text[])
    ) parts_request_sub
  `, [projectId, ORDERED_PARTS_REQUEST_STATUSES]);

  const hasProjectReceivedMaterials = await canReadProjectReceivedMaterials();
  const projectReceivedSummaryRes = hasProjectReceivedMaterials
    ? await pool.query<ProjectReceivedMaterialSummaryRow>(`
        SELECT
          COALESCE(SUM(extended_cost) FILTER (WHERE status = 'pending_pm_acceptance'), 0) AS "pendingReceivedCost",
          COALESCE(SUM(extended_cost) FILTER (WHERE status = 'accepted'), 0) AS "acceptedReceivedCost"
        FROM project_received_materials
        WHERE project_id = $1
      `, [projectId])
    : [{ pendingReceivedCost: '0', acceptedReceivedCost: '0' }];

  const rowsRes = await pool.query<MaterialItemRow>(`
    SELECT
      ii.id AS "inventoryItemId",
      ii.ag_part_number AS "itemCode",
      ii.name AS "itemName",
      ml.supplier_lot_number AS "lotNumber",
      ml.internal_control_number AS "internalControlNumber",
      GREATEST(
        COALESCE(mlr_agg.qty_reserved, 0),
        COALESCE(tmc_agg.qty_consumed, 0)
      ) AS "qtyRequired",
      COALESCE(mlr_agg.qty_reserved, 0) AS "qtyAllocated",
      COALESCE(tmc_agg.qty_consumed, 0) AS "qtyIssued",
      COALESCE(ii.unit_cost, 0) AS "unitCost",
      COALESCE(mlr_agg.qty_reserved * COALESCE(ii.unit_cost, 0), 0) AS "committedCost",
      COALESCE(tmc_agg.qty_consumed * COALESCE(ii.unit_cost, 0), 0) AS "consumedCost",
      CASE
        WHEN COALESCE(tmc_agg.qty_consumed, 0) > COALESCE(mlr_agg.qty_reserved, 0) THEN 'OVER_ISSUED'
        WHEN COALESCE(tmc_agg.qty_consumed, 0) > 0 AND COALESCE(tmc_agg.qty_consumed, 0) < COALESCE(mlr_agg.qty_reserved, 0) THEN 'PARTIAL'
        WHEN COALESCE(tmc_agg.qty_consumed, 0) > 0 THEN 'FULLY_ISSUED'
        WHEN COALESCE(mlr_agg.qty_reserved, 0) > 0 THEN 'ALLOCATED'
        ELSE 'SHORT'
      END AS "status"
    FROM material_lots ml
    JOIN inventory_items ii ON ii.id = ml.inventory_item_id
    LEFT JOIN (
      SELECT material_lot_id, SUM(quantity_reserved) AS qty_reserved
      FROM material_lot_reservations
      WHERE traveler_id::text IN (SELECT id::text FROM travelers WHERE project_id = $1)
      GROUP BY material_lot_id
    ) mlr_agg ON mlr_agg.material_lot_id = ml.id
    LEFT JOIN (
      SELECT material_lot_id, SUM(COALESCE(qty_used, quantity_used, 0)) AS qty_consumed
      FROM traveler_material_consumption
      WHERE traveler_id::text IN (SELECT id::text FROM travelers WHERE project_id = $1)
      GROUP BY material_lot_id
    ) tmc_agg ON tmc_agg.material_lot_id = ml.id
    WHERE
      mlr_agg.material_lot_id IS NOT NULL
      OR tmc_agg.material_lot_id IS NOT NULL
    ORDER BY
      CASE
        WHEN COALESCE(tmc_agg.qty_consumed, 0) > COALESCE(mlr_agg.qty_reserved, 0) THEN 1
        WHEN COALESCE(mlr_agg.qty_reserved, 0) = 0 AND COALESCE(tmc_agg.qty_consumed, 0) = 0 THEN 2
        WHEN COALESCE(tmc_agg.qty_consumed, 0) > 0 AND COALESCE(tmc_agg.qty_consumed, 0) < COALESCE(mlr_agg.qty_reserved, 0) THEN 3
        WHEN COALESCE(mlr_agg.qty_reserved, 0) > 0 AND COALESCE(tmc_agg.qty_consumed, 0) = 0 THEN 4
        ELSE 5
      END ASC,
      ii.ag_part_number ASC
  `, [projectId]);

  const partsRequestRowsRes = await pool.query<MaterialItemRow>(`
    SELECT
      ('PR-' || pr.id::text) AS "inventoryItemId",
      pr.id AS "partsRequestId",
      pr.part_number AS "itemCode",
      pr.part_name AS "itemName",
      NULL::text AS "lotNumber",
      NULL::text AS "internalControlNumber",
      pr.requested_by AS "requestedBy",
      pr.request_date AS "requestDate",
      pr.expected_delivery AS "expectedDelivery",
      pr.quantity::numeric AS "qtyRequired",
      CASE
        WHEN pr.status IN ('ORDERED', 'ORDERED_PARTIAL') THEN pr.quantity::numeric
        ELSE 0::numeric
      END AS "qtyAllocated",
      CASE
        WHEN pr.status IN ('RECEIVED', 'RECEIVED_PARTIAL', 'DELIVERED_TO_DEPT') THEN pr.quantity::numeric
        ELSE 0::numeric
      END AS "qtyIssued",
      COALESCE(pr.estimated_cost, 0)::numeric AS "unitCost",
      CASE
        WHEN pr.status IN ('ORDERED', 'ORDERED_PARTIAL', 'RECEIVED', 'RECEIVED_PARTIAL', 'DELIVERED_TO_DEPT')
          THEN (pr.quantity * COALESCE(pr.estimated_cost, 0))::numeric
        ELSE 0::numeric
      END AS "committedCost",
      CASE
        WHEN pr.status IN ('RECEIVED', 'RECEIVED_PARTIAL', 'DELIVERED_TO_DEPT')
          THEN (pr.quantity * COALESCE(pr.estimated_cost, 0))::numeric
        ELSE 0::numeric
      END AS "consumedCost",
      ('PART_REQUEST_' || pr.status) AS "status"
    FROM parts_requests pr
    WHERE pr.project_id = $1
      AND pr.is_active = true
      AND pr.status = ANY($2::text[])
    ORDER BY pr.request_date DESC
  `, [projectId, PROJECT_PARTS_REQUEST_VISIBLE_STATUSES]);

  const projectReceivedRowsRes = hasProjectReceivedMaterials
    ? await pool.query<ProjectReceivedMaterialRow>(`
        SELECT
          ('PRM-' || prm.id::text) AS "inventoryItemId",
          COALESCE(ii.ag_part_number, rl.ag_part_number, '') AS "itemCode",
          COALESCE(ii.name, rl.description, '') AS "itemName",
          COALESCE(ru.lot_number, ml.supplier_lot_number) AS "lotNumber",
          COALESCE(ru.internal_control_number, ml.internal_control_number) AS "internalControlNumber",
          prm.quantity::numeric AS "qtyRequired",
          CASE WHEN prm.status = 'pending_pm_acceptance' THEN prm.quantity::numeric ELSE 0::numeric END AS "qtyAllocated",
          CASE WHEN prm.status = 'accepted' THEN prm.quantity::numeric ELSE 0::numeric END AS "qtyIssued",
          prm.unit_cost::numeric AS "unitCost",
          CASE WHEN prm.status = 'pending_pm_acceptance' THEN prm.extended_cost::numeric ELSE 0::numeric END AS "committedCost",
          CASE WHEN prm.status = 'accepted' THEN prm.extended_cost::numeric ELSE 0::numeric END AS "consumedCost",
          CASE
            WHEN prm.status = 'pending_pm_acceptance' THEN 'PENDING_PM_ACCEPTANCE'
            WHEN prm.status = 'accepted' THEN 'RECEIVED_ACCEPTED'
            ELSE 'RECEIVED_REJECTED'
          END AS "status",
          prm.id AS "projectReceivedMaterialId",
          r.receipt_number AS "receiptNumber",
          ru.barcode AS "receivedUnitBarcode"
        FROM project_received_materials prm
        JOIN received_units ru ON ru.id = prm.received_unit_id
        JOIN receipts r ON r.id = prm.receipt_id
        JOIN receipt_lines rl ON rl.id = ru.receipt_line_id
        LEFT JOIN material_lots ml ON ml.id = prm.material_lot_id
        LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
        WHERE prm.project_id = $1
          AND prm.status IN ('pending_pm_acceptance', 'accepted')
        ORDER BY
          CASE WHEN prm.status = 'pending_pm_acceptance' THEN 0 ELSE 1 END,
          prm.created_at DESC
      `, [projectId])
    : [];

  const plannedCost = parseFloat(budgetRes[0]?.plannedCost) || 0;
  const committedCost = parseFloat(summaryRes[0]?.committedCost) || 0;
  const pendingReceivedCost = parseFloat(projectReceivedSummaryRes[0]?.pendingReceivedCost) || 0;
  const acceptedReceivedCost = parseFloat(projectReceivedSummaryRes[0]?.acceptedReceivedCost) || 0;
  const consumedCost = (parseFloat(summaryRes[0]?.consumedCost) || 0) + acceptedReceivedCost;

  res.json({
    summary: {
      plannedCost,
      committedCost,
      consumedCost,
      pendingReceivedCost,
      acceptedReceivedCost,
      remainingCost: plannedCost - committedCost - consumedCost,
    },
    rows: [...projectReceivedRowsRes, ...rowsRes, ...partsRequestRowsRes],
  });
}));

router.patch('/:projectId/materials/received/:receivedMaterialId', h(async (req, res) => {
  const { projectId, receivedMaterialId } = req.params;
  const action = String(req.body?.action ?? '').toLowerCase();
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
  const user = (req as any).user;
  const userId = user?.employeeId ?? null;
  const displayName = user?.username ?? 'PM';

  if (!['accept', 'reject'].includes(action)) {
    res.status(400).json({ error: 'action must be accept or reject' });
    return;
  }

  if (!(await publicTableExists('project_received_materials')) || !(await publicColumnsExist('project_received_materials', [
    'id',
    'project_id',
    'status',
    'accepted_by_user_id',
    'accepted_by_display_name',
    'accepted_at',
    'rejected_by_user_id',
    'rejected_by_display_name',
    'rejected_at',
    'notes',
    'updated_at',
  ]))) {
    res.status(404).json({ error: 'Pending received material not found for this project' });
    return;
  }

  const status = action === 'accept' ? 'accepted' : 'rejected';
  const result = await pool.query(`
    UPDATE project_received_materials
    SET
      status = $1,
      accepted_by_user_id = CASE WHEN $1 = 'accepted' THEN $2 ELSE accepted_by_user_id END,
      accepted_by_display_name = CASE WHEN $1 = 'accepted' THEN $3 ELSE accepted_by_display_name END,
      accepted_at = CASE WHEN $1 = 'accepted' THEN NOW() ELSE accepted_at END,
      rejected_by_user_id = CASE WHEN $1 = 'rejected' THEN $2 ELSE rejected_by_user_id END,
      rejected_by_display_name = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejected_by_display_name END,
      rejected_at = CASE WHEN $1 = 'rejected' THEN NOW() ELSE rejected_at END,
      notes = COALESCE($4, notes),
      updated_at = NOW()
    WHERE id = $5
      AND project_id = $6
      AND status = 'pending_pm_acceptance'
    RETURNING *
  `, [status, userId, displayName, notes, Number(receivedMaterialId), projectId]);

  if (!result[0]) {
    res.status(404).json({ error: 'Pending received material not found for this project' });
    return;
  }

  res.json(result[0]);
}));

export default router;
