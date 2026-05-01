import { Router, Request, Response } from 'express';
import { pool } from '../../db';

const router = Router();

function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) =>
    fn(req, res).catch((err) => {
      console.error('[PM Dashboard]', err?.message ?? err);
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
  status: string;
  dueDate: string | null;
  currentDepartment: string | null;
  currentTravelerStep: string | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  daysScheduleVariance: string | null;
  blockReason: string | null;
}

interface ChargeCodeAggRow {
  chargeCodeId: number;
  chargeCode: string;
  department: string | null;
  taskName: string | null;
  budgetedHours: string;
  actualHours: string;
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

interface CertRow {
  employeeId: number;
  status: string;
  expiresDate: string | null;
}

interface MaterialSummaryRow {
  committedCost: string;
  consumedCost: string;
}

interface MaterialItemRow {
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  internalControlNumber: string | null;
  qtyRequired: string;
  qtyAllocated: string;
  qtyIssued: string;
  unitCost: string;
  committedCost: string;
  consumedCost: string;
  status: string;
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
      p.po_id AS "poId",
      po.po_number AS "poNumber"
    FROM projects p
    LEFT JOIN employees e ON e.id = p.project_manager_id
    LEFT JOIN p2_purchase_orders po ON po.id = p.po_id
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
    SELECT
      COUNT(*) AS "totalWorkOrders",
      COUNT(*) FILTER (WHERE status IN ('COMPLETE', 'CLOSED')) AS "completedWorkOrders",
      COUNT(*) FILTER (WHERE status = 'BLOCKED') AS "blockedWorkOrders"
    FROM production_work_orders
    WHERE project_id = $1
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
      0 AS "plannedMaterialCost"
    FROM material_lot_reservations mlr
    JOIN material_lots ml ON ml.id = mlr.material_lot_id
    LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
    WHERE mlr.traveler_id IN (
      SELECT id FROM travelers WHERE project_id = $1
    )
  `, [projectId]);

  const consumedRes = await pool.query<ConsumedCostRow>(`
    SELECT COALESCE(SUM(tmc.quantity_used * COALESCE(ii.unit_cost, 0)), 0) AS "consumedMaterialCost"
    FROM traveler_material_consumption tmc
    JOIN material_lots ml ON ml.id = tmc.material_lot_id
    LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
    WHERE tmc.traveler_id IN (
      SELECT id FROM travelers WHERE project_id = $1
    )
  `, [projectId]);

  // Quantity-based production percent
  const qtyProgressRes = await pool.query<{ totalRequired: string; totalCompleted: string }>(`
    SELECT
      COALESCE(SUM(wo2.quantity), 0) AS "totalRequired",
      COALESCE(SUM(
        (SELECT COUNT(*) FROM travelers t2
         WHERE t2.production_work_order_id = wo2.id
           AND t2.status IN ('COMPLETE', 'CLOSED'))
      ), 0) AS "totalCompleted"
    FROM production_work_orders wo2
    WHERE wo2.project_id = $1
  `, [projectId]);

  const wo = woRes[0];
  const total = parseInt(wo.totalWorkOrders) || 0;
  const completed = parseInt(wo.completedWorkOrders) || 0;
  const totalRequired = parseFloat(qtyProgressRes[0].totalRequired) || 0;
  const totalCompleted = parseFloat(qtyProgressRes[0].totalCompleted) || 0;
  const productionPercent = totalRequired > 0
    ? Math.min(100, Math.round((totalCompleted / totalRequired) * 100))
    : (total > 0 ? Math.round((completed / total) * 100) : 0);

  const blockedWOs = parseInt(wo.blockedWorkOrders) || 0;
  const blockedTravelers = parseInt(travelerRes[0].blockedTravelerCount) || 0;
  const blockedCount = blockedWOs + blockedTravelers;

  const budgetedLaborHours = parseFloat(laborBudgetRes[0].budgetedLaborHours) || 0;
  const actualLaborHours = parseFloat(laborActualRes[0].actualLaborHours) || 0;
  const laborRemainingHours = budgetedLaborHours - actualLaborHours;

  const committedMaterialCost = parseFloat(materialRes[0].committedMaterialCost) || 0;
  const consumedMaterialCost = parseFloat(consumedRes[0].consumedMaterialCost) || 0;
  const plannedMaterialCost = parseFloat(materialRes[0].plannedMaterialCost) || 0;
  const remainingMaterialBudget = plannedMaterialCost - consumedMaterialCost;

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
    SELECT
      wo.id AS "productionWorkOrderId",
      wo.work_order_number AS "workOrderNumber",
      wo.part_number AS "partNumber",
      wo.quantity AS "quantityRequired",
      (
        SELECT COUNT(*) FROM travelers t2
        WHERE t2.production_work_order_id = wo.id
          AND t2.status IN ('COMPLETE', 'CLOSED')
      )::int AS "quantityCompleted",
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
        SELECT t.id FROM travelers t
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
    ORDER BY wo.created_at ASC
  `, [today, projectId]);

  res.json(result);
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

  // Actual hours from punch_ledger (closed REGULAR sessions)
  const actualRes = await pool.query<{ actualHours: string }>(`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0
    ), 0) AS "actualHours"
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

  // Open session count from punch_ledger
  const openSessionRes = await pool.query<{ openSessionCount: string }>(`
    SELECT COUNT(*) AS "openSessionCount"
    FROM punch_ledger pl
    WHERE pl.clock_out IS NULL
      AND (
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
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
    WITH project_work_order_budgets AS (
      -- Compute per-work-order authorized budget from base + APPROVED overrides
      SELECT
        wo.id AS work_order_id,
        COALESCE(wo.total_budget_hours::numeric, 0)
        + COALESCE((
          SELECT SUM(lbo.requested_hours::numeric)
          FROM labor_budget_overrides lbo
          WHERE lbo.production_work_order_id = wo.id
            AND lbo.status = 'APPROVED'
        ), 0) AS authorized_hours
      FROM production_work_orders wo
      WHERE wo.project_id = $1
    ),
    charge_actuals AS (
      -- Actual hours per charge code within the project scope
      SELECT
        pl.charge_code_id,
        pl.production_work_order_id,
        SUM(EXTRACT(EPOCH FROM (pl.clock_out - pl.clock_in)) / 3600.0) AS actual_hours
      FROM punch_ledger pl
      WHERE pl.clock_out IS NOT NULL
        AND pl.labor_class = 'REGULAR'
        AND pl.charge_code_id IS NOT NULL
        AND (
          pl.production_work_order_id IN (
            SELECT id FROM production_work_orders WHERE project_id = $1
          )
          OR pl.traveler_id IN (
            SELECT id::text FROM travelers WHERE project_id = $1
          )
        )
      GROUP BY pl.charge_code_id, pl.production_work_order_id
    ),
    charge_code_totals AS (
      -- Roll up actual hours; budget = sum of authorized_hours for each distinct work order
      -- that has punch_ledger sessions against this charge code.
      -- SUM(DISTINCT value) would miscount when two WOs share equal authorized_hours, so we
      -- aggregate by distinct work_order_id in a subquery first, then sum the results.
      SELECT
        ca.charge_code_id,
        SUM(ca.actual_hours) AS actual_hours,
        COALESCE((
          SELECT SUM(pwob.authorized_hours)
          FROM project_work_order_budgets pwob
          WHERE pwob.work_order_id IN (
            SELECT DISTINCT ca2.production_work_order_id
            FROM charge_actuals ca2
            WHERE ca2.charge_code_id = ca.charge_code_id
              AND ca2.production_work_order_id IS NOT NULL
          )
        ), 0) AS budgeted_hours
      FROM charge_actuals ca
      GROUP BY ca.charge_code_id
    )
    SELECT
      lcc.id AS "chargeCodeId",
      lcc.code AS "chargeCode",
      lcc.department,
      lcc.description AS "taskName",
      ROUND(cct.budgeted_hours::numeric, 2) AS "budgetedHours",
      ROUND(cct.actual_hours::numeric, 4) AS "actualHours"
    FROM charge_code_totals cct
    JOIN public.charge_codes lcc ON lcc.id = cct.charge_code_id
    ORDER BY lcc.code ASC
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
    SELECT
      pl.id AS "sessionId",
      pl.employee_id AS "employeeId",
      e.name AS "employeeName",
      pl.traveler_id AS "travelerId",
      t.traveler_number AS "travelerNumber",
      pl.department,
      pl.charge_code AS "chargeCode",
      pl.clock_in AS "startedAt",
      ROUND(EXTRACT(EPOCH FROM (NOW() - pl.clock_in)) / 60) AS "elapsedMinutes"
    FROM punch_ledger pl
    JOIN employees e ON e.id = pl.employee_id
    LEFT JOIN travelers t ON t.id::text = pl.traveler_id
    WHERE pl.clock_out IS NULL
      AND (
        pl.production_work_order_id IN (
          SELECT id FROM production_work_orders WHERE project_id = $1
        )
        OR pl.traveler_id IN (
          SELECT id::text FROM travelers WHERE project_id = $1
        )
      )
    ORDER BY pl.clock_in DESC
  `, [projectId]);

  const employeeIds = [...new Set(liveRes.map((r) => r.employeeId))];
  const certMap: Record<number, string> = {};
  const authMap: Record<number, boolean> = {};

  if (employeeIds.length > 0) {
    // Certification status: join training_certifications to public.certifications catalog
    // so certification type metadata (name, validity period, isRequired) is available.
    const certRes = await pool.query<CertRow & { certificationName: string | null }>(`
      SELECT DISTINCT ON (tc.trainee_id)
        tc.trainee_id AS "employeeId",
        c.name AS "certificationName",
        tc.status,
        tc.expires_at::text AS "expiresDate"
      FROM training_certifications tc
      JOIN certifications c ON c.id = tc.certification_id
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
  });
}));

// GET /api/pm-dashboard/:projectId/materials — material budget
router.get('/:projectId/materials', h(async (req, res) => {
  const { projectId } = req.params;

  const summaryRes = await pool.query<MaterialSummaryRow>(`
    SELECT
      COALESCE(committed_sub.committed, 0) AS "committedCost",
      COALESCE(consumed_sub.consumed, 0) AS "consumedCost"
    FROM (
      SELECT SUM(mlr.quantity_reserved * COALESCE(ii.unit_cost, 0)) AS committed
      FROM material_lot_reservations mlr
      JOIN material_lots ml ON ml.id = mlr.material_lot_id
      LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
      WHERE mlr.traveler_id IN (
        SELECT id FROM travelers WHERE project_id = $1
      )
    ) committed_sub,
    (
      SELECT SUM(tmc.quantity_used * COALESCE(ii.unit_cost, 0)) AS consumed
      FROM traveler_material_consumption tmc
      JOIN material_lots ml ON ml.id = tmc.material_lot_id
      LEFT JOIN inventory_items ii ON ii.id = ml.inventory_item_id
      WHERE tmc.traveler_id IN (
        SELECT id FROM travelers WHERE project_id = $1
      )
    ) consumed_sub
  `, [projectId]);

  const rowsRes = await pool.query<MaterialItemRow>(`
    SELECT
      ii.id AS "inventoryItemId",
      ii.ag_part_number AS "itemCode",
      ii.name AS "itemName",
      ml.lot_number AS "lotNumber",
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
      WHERE traveler_id IN (SELECT id FROM travelers WHERE project_id = $1)
      GROUP BY material_lot_id
    ) mlr_agg ON mlr_agg.material_lot_id = ml.id
    LEFT JOIN (
      SELECT material_lot_id, SUM(quantity_used) AS qty_consumed
      FROM traveler_material_consumption
      WHERE traveler_id IN (SELECT id FROM travelers WHERE project_id = $1)
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

  const committedCost = parseFloat(summaryRes[0]?.committedCost) || 0;
  const consumedCost = parseFloat(summaryRes[0]?.consumedCost) || 0;

  res.json({
    summary: {
      plannedCost: 0,
      committedCost,
      consumedCost,
      remainingCost: committedCost - consumedCost,
    },
    rows: rowsRes,
  });
}));

export default router;
