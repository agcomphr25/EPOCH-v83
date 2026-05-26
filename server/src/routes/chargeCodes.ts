import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { insertChargeCodeSchema } from '../../schema';
import { recordAuditEvent } from '../services/auditLedgerService';
import { pgPool, pool } from '../../db';

const router: IRouter = Router();

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

async function getChargeCodeAssignments(chargeCodeId: number) {
  return pool.query(
    `SELECT
       e.id,
       e.employee_code AS "employeeCode",
       e.name,
       e.department,
       e.job_title AS "jobTitle",
       e.is_active AS "isActive"
     FROM charge_code_employee_assignments cca
     JOIN employees e ON e.id = cca.employee_id
     WHERE cca.charge_code_id = $1
     ORDER BY e.name`,
    [chargeCodeId]
  );
}

// GET /api/charge-codes — list all charge codes; supports ?active=true filter
router.get('/', authenticateToken, h(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const codes = await storage.listChargeCodes(activeOnly);
  res.json(codes);
}));

// POST /api/charge-codes — admin create
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
      await client.query(
        `INSERT INTO charge_code_employee_assignments (charge_code_id, employee_id, assigned_by_user_id)
         SELECT $1, unnest($2::int[]), $3
         ON CONFLICT (charge_code_id, employee_id) DO NOTHING`,
        [id, nextEmployeeIds, req.user?.id ?? null]
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
    assignedEmployees,
  });
}));

router.post('/', authenticateToken, requireRole('ADMIN'), h(async (req, res) => {
  const parsed = insertChargeCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid charge code data', details: parsed.error.flatten() });
    return;
  }
  const created = await storage.createChargeCode(parsed.data);

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

  const updated = await storage.updateChargeCode(id, parsed.data);
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
  for (const [key, toVal] of Object.entries(parsed.data)) {
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
