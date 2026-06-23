import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { insertChargeCodeSchema } from '../../schema';
import { recordAuditEvent } from '../services/auditLedgerService';
import { pgPool, pool } from '../../db';

const router: IRouter = Router();

let chargeCodeAssignmentTableReady: Promise<void> | null = null;
let chargeCodeRequestTableReady: Promise<void> | null = null;

function ensureChargeCodeAssignmentTable(): Promise<void> {
  if (!chargeCodeAssignmentTableReady) {
    chargeCodeAssignmentTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS charge_code_employee_assignments (
          id SERIAL PRIMARY KEY,
          charge_code_id INTEGER NOT NULL REFERENCES charge_codes(id) ON DELETE CASCADE,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (charge_code_id, employee_id)
        )
      `);
      await pool.query(`ALTER TABLE charge_code_employee_assignments ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(`CREATE INDEX IF NOT EXISTS charge_code_employee_assignments_charge_code_idx ON charge_code_employee_assignments(charge_code_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS charge_code_employee_assignments_employee_idx ON charge_code_employee_assignments(employee_id)`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS charge_code_employee_assignments_one_default_per_employee_idx ON charge_code_employee_assignments(employee_id) WHERE is_default = TRUE`);
    })().catch((error) => {
      chargeCodeAssignmentTableReady = null;
      throw error;
    });
  }
  return chargeCodeAssignmentTableReady;
}

function ensureChargeCodeRequestTable(): Promise<void> {
  if (!chargeCodeRequestTableReady) {
    chargeCodeRequestTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wad_charge_code_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          wad_id UUID REFERENCES production_work_orders(id) ON DELETE CASCADE,
          department TEXT NOT NULL,
          operation TEXT NOT NULL,
          labor_category TEXT,
          classification TEXT NOT NULL DEFAULT 'DIRECT',
          budgeted_hours NUMERIC,
          requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          requested_by_display_name TEXT NOT NULL DEFAULT 'Unknown',
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status TEXT NOT NULL DEFAULT 'PENDING',
          assigned_charge_code_id INTEGER REFERENCES charge_codes(id) ON DELETE SET NULL,
          assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          assigned_at TIMESTAMPTZ,
          notes TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS wad_charge_code_requests_status_idx ON wad_charge_code_requests(status, requested_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS wad_charge_code_requests_wad_idx ON wad_charge_code_requests(wad_id)`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS wad_charge_code_requests_open_operation_idx
        ON wad_charge_code_requests(wad_id, department, operation)
        WHERE status = 'PENDING'
      `);
    })().catch((error) => {
      chargeCodeRequestTableReady = null;
      throw error;
    });
  }
  return chargeCodeRequestTableReady;
}

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error('[chargeCodes]', err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
}

function extractActor(req: Request): { actorId: number | null; actorName: string; actorRole: string } {
  const user = req.user;
  return {
    actorId: user?.id ?? null,
    actorName: user?.username ?? 'admin',
    actorRole: user?.role ?? 'admin',
  };
}

function normalizeEmployeeIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function normalizeChargeCodePolicy<T extends Record<string, any>>(data: T): T {
  const next = { ...data };
  const productionLine = typeof next.productionLine === 'string' ? next.productionLine.trim().toUpperCase() : next.productionLine;
  const type = typeof next.type === 'string' ? next.type.toUpperCase() : next.type;
  const costHandling = typeof next.costHandling === 'string' ? next.costHandling.toUpperCase() : next.costHandling;

  if (productionLine) next.productionLine = productionLine;

  if (next.requireClin === true) {
    next.allowClin = true;
  }
  if (next.allowClin === true || next.requireProject === true) {
    next.allowProject = true;
  }

  if (productionLine === 'P1' && type === 'DIRECT') {
    next.costObjectivePolicy = 'P1_INVENTORY_WIP_GENERAL_STOCK';
    next.inventoryWipPolicy = 'P1_INVENTORY_WIP_GENERAL_STOCK';
    next.allowProject = false;
    next.requireProject = false;
    next.allowClin = false;
    next.requireClin = false;
  }

  if (productionLine === 'P2' && type === 'DIRECT') {
    next.allowProject = true;
    next.requireProject = true;
    next.costObjectivePolicy = 'PROJECT_REQUIRED';
  }

  if (type === 'OVERHEAD' || type === 'G_AND_A' || costHandling === 'OVERHEAD' || costHandling === 'G_AND_A') {
    next.costObjectivePolicy = next.costObjectivePolicy || 'NONE';
  }

  return next as T;
}

async function getChargeCodeAssignments(chargeCodeId: number) {
  await ensureChargeCodeAssignmentTable();
  return pool.query(
    `SELECT
       e.id,
       e.employee_code AS "employeeCode",
       e.name,
       e.department,
       e.job_title AS "jobTitle",
       e.is_active AS "isActive",
       cca.is_default AS "isDefault"
     FROM charge_code_employee_assignments cca
     JOIN employees e ON e.id = cca.employee_id
     WHERE cca.charge_code_id = $1
     ORDER BY e.name`,
    [chargeCodeId]
  );
}

function normalizeRequestStatus(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : 'PENDING';
}

function normalizeRequestText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function listChargeCodeRequests(filters: { status?: string; wadId?: string }) {
  await ensureChargeCodeRequestTable();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`wccr.status = $${params.length}`);
  }
  if (filters.wadId) {
    params.push(filters.wadId);
    conditions.push(`wccr.wad_id = $${params.length}::uuid`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return pool.query(
    `SELECT
       wccr.id,
       wccr.wad_id AS "wadId",
       pwo.work_order_number AS "workOrderNumber",
       pwo.project_id AS "projectId",
       wccr.department,
       wccr.operation,
       wccr.labor_category AS "laborCategory",
       wccr.classification,
       wccr.budgeted_hours::text AS "budgetedHours",
       wccr.requested_by_user_id AS "requestedByUserId",
       wccr.requested_by_display_name AS "requestedByDisplayName",
       wccr.requested_at AS "requestedAt",
       wccr.status,
       wccr.assigned_charge_code_id AS "assignedChargeCodeId",
       cc.code AS "assignedChargeCode",
       wccr.assigned_by_user_id AS "assignedByUserId",
       wccr.assigned_at AS "assignedAt",
       wccr.notes,
       wccr.updated_at AS "updatedAt"
     FROM wad_charge_code_requests wccr
     LEFT JOIN production_work_orders pwo ON pwo.id = wccr.wad_id
     LEFT JOIN charge_codes cc ON cc.id = wccr.assigned_charge_code_id
     ${where}
     ORDER BY
       CASE wccr.status WHEN 'PENDING' THEN 0 ELSE 1 END,
       wccr.requested_at DESC`,
    params
  );
}

// GET /api/charge-codes — list all charge codes; supports ?active=true filter
router.get('/', authenticateToken, h(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const codes = await storage.listChargeCodes(activeOnly);
  res.json(codes);
}));

// POST /api/charge-codes — admin create
router.get('/requests', authenticateToken, h(async (req, res) => {
  const status = req.query.status === 'all' ? undefined : normalizeRequestStatus(req.query.status);
  const wadId = normalizeRequestText(req.query.wadId);
  const requests = await listChargeCodeRequests({ status, wadId: wadId || undefined });
  res.json(requests);
}));

router.post('/requests', authenticateToken, h(async (req, res) => {
  await ensureChargeCodeRequestTable();
  const wadId = normalizeRequestText(req.body?.wadId);
  const department = normalizeRequestText(req.body?.department);
  const operation = normalizeRequestText(req.body?.operation);
  const laborCategory = normalizeRequestText(req.body?.laborCategory);
  const classification = normalizeRequestText(req.body?.classification) || 'DIRECT';
  const notes = normalizeRequestText(req.body?.notes);
  const budgetedHoursRaw = req.body?.budgetedHours;
  const budgetedHours = budgetedHoursRaw === null || budgetedHoursRaw === undefined || budgetedHoursRaw === ''
    ? null
    : Number(budgetedHoursRaw);

  if (!wadId || !department || !operation) {
    res.status(400).json({ error: 'wadId, department, and operation are required' });
    return;
  }
  if (budgetedHours !== null && (!Number.isFinite(budgetedHours) || budgetedHours < 0)) {
    res.status(400).json({ error: 'budgetedHours must be a positive number' });
    return;
  }

  const wadRows = await pool.query(`SELECT id FROM production_work_orders WHERE id = $1::uuid LIMIT 1`, [wadId]);
  if (wadRows.length === 0) {
    res.status(404).json({ error: 'WAD not found' });
    return;
  }

  const { actorId, actorName, actorRole } = extractActor(req);
  const rows = await pool.query(
    `INSERT INTO wad_charge_code_requests (
       wad_id, department, operation, labor_category, classification, budgeted_hours,
       requested_by_user_id, requested_by_display_name, notes
     )
     VALUES ($1::uuid, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, NULLIF($9, ''))
     ON CONFLICT (wad_id, department, operation) WHERE status = 'PENDING'
     DO UPDATE SET
       labor_category = EXCLUDED.labor_category,
       classification = EXCLUDED.classification,
       budgeted_hours = EXCLUDED.budgeted_hours,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING id`,
    [wadId, department, operation, laborCategory, classification, budgetedHours, actorId, actorName, notes]
  );

  await recordAuditEvent({
    eventType: 'WAD_CHARGE_CODE_REQUESTED',
    subjectType: 'wad_charge_code_request',
    subjectId: String(rows[0].id),
    sourceService: 'chargeCodes.routes',
    actor: { id: actorId, username: actorName, role: actorRole },
    meta: { wadId, department, classification },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: { wadId, department, operation, laborCategory, classification, budgetedHours },
  });

  const requests = await listChargeCodeRequests({ wadId, status: 'PENDING' });
  res.status(201).json(requests.find((request: any) => request.id === rows[0].id) ?? rows[0]);
}));

router.patch('/requests/:requestId/assign', authenticateToken, requireRole('ADMIN'), h(async (req, res) => {
  await ensureChargeCodeRequestTable();
  const requestId = normalizeRequestText(req.params.requestId);
  const chargeCodeId = Number(req.body?.chargeCodeId);
  if (!requestId || !Number.isInteger(chargeCodeId) || chargeCodeId <= 0) {
    res.status(400).json({ error: 'Valid requestId and chargeCodeId are required' });
    return;
  }

  const chargeCode = await storage.getChargeCodeById(chargeCodeId);
  if (!chargeCode || !chargeCode.active) {
    res.status(400).json({ error: 'Selected charge code is not active' });
    return;
  }

  const existing = await pool.query(
    `SELECT id, status, wad_id AS "wadId", department, operation
       FROM wad_charge_code_requests
      WHERE id = $1::uuid
      LIMIT 1`,
    [requestId]
  );
  if (existing.length === 0) {
    res.status(404).json({ error: 'Charge code request not found' });
    return;
  }
  if (existing[0].status !== 'PENDING') {
    res.status(400).json({ error: 'Only pending requests can be assigned' });
    return;
  }

  const { actorId, actorName, actorRole } = extractActor(req);
  await pool.query(
    `UPDATE wad_charge_code_requests
        SET status = 'ASSIGNED',
            assigned_charge_code_id = $2,
            assigned_by_user_id = $3,
            assigned_at = NOW(),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [requestId, chargeCodeId, actorId]
  );
  await pool.query(
    `UPDATE production_work_orders pwo
        SET wizard_data = jsonb_set(
              COALESCE(pwo.wizard_data, '{}'::jsonb),
              '{step4,chargeCodes}',
              COALESCE((
                SELECT jsonb_agg(
                  CASE
                    WHEN charge_row->>'department' = $2
                     AND charge_row->>'operation' = $3
                      THEN jsonb_set(charge_row, '{chargeCode}', to_jsonb($4::text), true)
                    ELSE charge_row
                  END
                  ORDER BY ordinality
                )
                FROM jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(pwo.wizard_data->'step4'->'chargeCodes') = 'array'
                      THEN pwo.wizard_data->'step4'->'chargeCodes'
                    ELSE '[]'::jsonb
                  END
                ) WITH ORDINALITY AS rows(charge_row, ordinality)
              ), '[]'::jsonb),
              true
            ),
            updated_at = NOW()
      WHERE pwo.id = $1::uuid`,
    [existing[0].wadId, existing[0].department, existing[0].operation, chargeCode.code]
  );

  await recordAuditEvent({
    eventType: 'WAD_CHARGE_CODE_REQUEST_ASSIGNED',
    subjectType: 'wad_charge_code_request',
    subjectId: requestId,
    sourceService: 'chargeCodes.routes',
    actor: { id: actorId, username: actorName, role: actorRole },
    meta: { chargeCodeId, chargeCode: chargeCode.code },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: { requestId, chargeCodeId, chargeCode: chargeCode.code },
  });

  const rows = await listChargeCodeRequests({});
  res.json(rows.find((request: any) => request.id === requestId));
}));

router.get('/:id/assignments', authenticateToken, h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid charge code id' });
    return;
  }

  const chargeCode = await storage.getChargeCodeById(id);
  if (!chargeCode) {
    res.status(404).json({ error: 'Charge code not found' });
    return;
  }

  const assignedEmployees = await getChargeCodeAssignments(id);
  res.json({
    chargeCodeId: id,
    scope: assignedEmployees.length > 0 ? 'SELECTED_EMPLOYEES' : 'ALL_EMPLOYEES',
    employeeIds: assignedEmployees.map((employee: any) => employee.id),
    defaultEmployeeIds: assignedEmployees.filter((employee: any) => employee.isDefault).map((employee: any) => employee.id),
    assignedEmployees,
  });
}));

router.put('/:id/assignments', authenticateToken, requireRole('ADMIN'), h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid charge code id' });
    return;
  }

  const scope = req.body?.scope;
  if (scope !== 'ALL_EMPLOYEES' && scope !== 'SELECTED_EMPLOYEES') {
    res.status(400).json({ error: 'scope must be ALL_EMPLOYEES or SELECTED_EMPLOYEES' });
    return;
  }

  const nextEmployeeIds = scope === 'ALL_EMPLOYEES' ? [] : normalizeEmployeeIds(req.body?.employeeIds);
  if (!nextEmployeeIds) {
    res.status(400).json({ error: 'employeeIds must be an array' });
    return;
  }
  if (scope === 'SELECTED_EMPLOYEES' && nextEmployeeIds.length === 0) {
    res.status(400).json({ error: 'Select at least one employee or choose All employees' });
    return;
  }
  const defaultEmployeeIds = normalizeEmployeeIds(req.body?.defaultEmployeeIds) ?? [];
  if (scope === 'ALL_EMPLOYEES' && defaultEmployeeIds.length > 0) {
    res.status(400).json({ error: 'Default employees can only be set when employee access is limited to selected employees' });
    return;
  }
  const selectedEmployeeSet = new Set(nextEmployeeIds);
  const defaultOutsideSelection = defaultEmployeeIds.filter((employeeId) => !selectedEmployeeSet.has(employeeId));
  if (defaultOutsideSelection.length > 0) {
    res.status(400).json({ error: `Default employee(s) must also be selected: ${defaultOutsideSelection.join(', ')}` });
    return;
  }

  const chargeCode = await storage.getChargeCodeById(id);
  if (!chargeCode) {
    res.status(404).json({ error: 'Charge code not found' });
    return;
  }

  const beforeAssignments = await getChargeCodeAssignments(id);
  const beforeIds = beforeAssignments.map((employee: any) => employee.id).sort((a: number, b: number) => a - b);

  if (nextEmployeeIds.length > 0) {
    const validRows = await pool.query(`SELECT id FROM employees WHERE id = ANY($1::int[])`, [nextEmployeeIds]);
    const validIds = new Set(validRows.map((row: any) => row.id));
    const missingIds = nextEmployeeIds.filter((employeeId) => !validIds.has(employeeId));
    if (missingIds.length > 0) {
      res.status(400).json({ error: `Unknown employee id(s): ${missingIds.join(', ')}` });
      return;
    }
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM charge_code_employee_assignments WHERE charge_code_id = $1`, [id]);
    if (nextEmployeeIds.length > 0) {
      if (defaultEmployeeIds.length > 0) {
        await client.query(
          `UPDATE charge_code_employee_assignments
              SET is_default = FALSE
            WHERE employee_id = ANY($1::int[])`,
          [defaultEmployeeIds]
        );
      }
      await client.query(
        `INSERT INTO charge_code_employee_assignments (charge_code_id, employee_id, assigned_by_user_id, is_default)
         SELECT $1, t.employee_id, $3, t.employee_id = ANY($4::int[])
         FROM unnest($2::int[]) AS t(employee_id)
         ON CONFLICT (charge_code_id, employee_id) DO NOTHING`,
        [id, nextEmployeeIds, req.user?.id ?? null, defaultEmployeeIds]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const assignedEmployees = await getChargeCodeAssignments(id);
  const { actorId, actorName, actorRole } = extractActor(req);
  await recordAuditEvent({
    eventType: 'CHARGE_CODE_ASSIGNMENTS_UPDATED',
    subjectType: 'charge_code',
    subjectId: String(id),
    sourceService: 'chargeCodes.routes',
    actor: { id: actorId, username: actorName, role: actorRole },
    fieldsChanged: {
      assignmentScope: {
        before: beforeIds.length > 0 ? 'SELECTED_EMPLOYEES' : 'ALL_EMPLOYEES',
        after: assignedEmployees.length > 0 ? 'SELECTED_EMPLOYEES' : 'ALL_EMPLOYEES',
      },
      employeeIds: { before: beforeIds, after: assignedEmployees.map((employee: any) => employee.id) },
      defaultEmployeeIds: {
        before: beforeAssignments.filter((employee: any) => employee.isDefault).map((employee: any) => employee.id),
        after: assignedEmployees.filter((employee: any) => employee.isDefault).map((employee: any) => employee.id),
      },
    },
    meta: { chargeCode: chargeCode.code },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: {
      chargeCodeId: id,
      chargeCode: chargeCode.code,
      employeeIds: assignedEmployees.map((employee: any) => employee.id),
    },
  });

  res.json({
    chargeCodeId: id,
    scope: assignedEmployees.length > 0 ? 'SELECTED_EMPLOYEES' : 'ALL_EMPLOYEES',
    employeeIds: assignedEmployees.map((employee: any) => employee.id),
    defaultEmployeeIds: assignedEmployees.filter((employee: any) => employee.isDefault).map((employee: any) => employee.id),
    assignedEmployees,
  });
}));

router.post('/', authenticateToken, requireRole('ADMIN'), h(async (req, res) => {
  const parsed = insertChargeCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid charge code data', details: parsed.error.flatten() });
    return;
  }
  const created = await storage.createChargeCode(normalizeChargeCodePolicy(parsed.data));

  // DCAA audit trail — unified hash-chained ledger (Task #85).
  const { actorId, actorName, actorRole } = extractActor(req);
  await recordAuditEvent({
    eventType: 'CHARGE_CODE_CREATED',
    subjectType: 'charge_code',
    subjectId: String(created.id),
    sourceService: 'chargeCodes.routes',
    actor: { id: actorId, username: actorName, role: actorRole },
    fieldsChanged: {
      code: { before: null, after: created.code },
      type: { before: null, after: created.type },
      costHandling: { before: null, after: created.costHandling },
      active: { before: null, after: created.active },
    },
    meta: {
      billable: created.billable,
      requiresApproval: created.requiresApproval,
      costHandling: created.costHandling,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: {
      code: created.code,
      type: created.type,
      costHandling: created.costHandling,
      active: created.active,
      billable: created.billable,
      requiresApproval: created.requiresApproval,
    },
  });

  res.status(201).json(created);
}));

// PATCH /api/charge-codes/:id — admin update / deactivate
router.patch('/:id', authenticateToken, requireRole('ADMIN'), h(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid charge code id' });
    return;
  }
  const parsed = insertChargeCodeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid charge code data', details: parsed.error.flatten() });
    return;
  }

  // Fetch existing record before update — required for before/after diff and deactivation detection
  const existing = await storage.getChargeCodeById(id);

  const normalizedPatch = normalizeChargeCodePolicy(parsed.data);
  const updated = await storage.updateChargeCode(id, normalizedPatch);
  if (!updated) {
    res.status(404).json({ error: 'Charge code not found' });
    return;
  }

  // DCAA audit trail — only written after successful DB update
  const { actorId, actorName, actorRole } = extractActor(req);
  const isDeactivation = existing?.active === true && parsed.data.active === false;
  const action = isDeactivation ? 'CHARGE_CODE_DEACTIVATED' : 'CHARGE_CODE_UPDATED';
  const reason: string | null = (req.body as any).reason ?? null;

  const fieldsChanged: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, toVal] of Object.entries(normalizedPatch)) {
    const fromVal = existing ? (existing as Record<string, unknown>)[key] : undefined;
    if (fromVal !== toVal) {
      fieldsChanged[key] = { before: fromVal, after: toVal };
    }
  }

  await recordAuditEvent({
    eventType: action,
    subjectType: 'charge_code',
    subjectId: String(id),
    sourceService: 'chargeCodes.routes',
    actor: { id: actorId, username: actorName, role: actorRole },
    reason,
    fieldsChanged,
    meta: { isDeactivation },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    payload: { id, isDeactivation, fieldsChanged: fieldsChanged as any },
  });

  res.json(updated);
}));

export default router;
