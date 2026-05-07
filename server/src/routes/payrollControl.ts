import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { pgPool } from '../../db';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

type PayrollControlUser = {
  id?: unknown;
  email?: unknown;
  username?: unknown;
  userRole?: unknown;
  role?: unknown;
};

type QueryRunner = {
  query: (queryText: string, params?: unknown[]) => Promise<unknown>;
};

const ITEM_TYPES = ['deduction', 'advance', 'owner_reimbursement'] as const;
const RECURRENCE_TYPES = ['one_time', 'recurring'] as const;
const ITEM_STATUSES = [
  'draft',
  'ready_for_gusto',
  'entered_in_gusto',
  'partially_repaid',
  'complete',
  'voided',
] as const;

const money = z.coerce.number().finite().min(0).max(9999999.99);
const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

const listQuerySchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  itemType: z.enum(ITEM_TYPES).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  payPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  includeClosed: z.coerce.boolean().optional().default(false),
});

const createItemSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  itemType: z.enum(ITEM_TYPES),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  originalAmount: money,
  recurrenceType: z.enum(RECURRENCE_TYPES).default('one_time'),
  recurringAmount: money.optional().nullable(),
  maxTotalAmount: money.optional().nullable(),
  startPayPeriod: dateText,
  nextPayPeriod: dateText,
  expectedDeductionPayPeriod: dateText,
  fundingSource: z.string().trim().max(120).optional().nullable(),
  givenDate: dateText,
  notes: z.string().trim().max(2000).optional().nullable(),
  linkedItemId: z.coerce.number().int().positive().optional().nullable(),
  createOwnerReimbursement: z.boolean().optional().default(false),
  ownerEmployeeId: z.coerce.number().int().positive().optional().nullable(),
});

const updateItemSchema = createItemSchema.partial().omit({
  itemType: true,
  createOwnerReimbursement: true,
  ownerEmployeeId: true,
});

const statusSchema = z.object({
  status: z.enum(ITEM_STATUSES),
  reason: z.string().trim().min(1).max(2000),
});

const paymentSchema = z.object({
  amount: money.refine(
    (value) => value > 0,
    'Amount must be greater than zero'
  ),
  payPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

function actor(req: Request) {
  const user = ((req as Request & { user?: PayrollControlUser }).user ??
    {}) as PayrollControlUser;
  return {
    id: typeof user.id === 'number' ? user.id : null,
    email:
      typeof user.email === 'string'
        ? user.email
        : typeof user.username === 'string'
          ? user.username
          : null,
    role:
      typeof user.userRole === 'string'
        ? user.userRole
        : typeof user.role === 'string'
          ? user.role
          : null,
    ip: req.ip ?? null,
  };
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function itemSelectSql() {
  return `
    SELECT
      i.id,
      i.employee_id AS "employeeId",
      e.name AS "employeeName",
      e.employee_code AS "employeeCode",
      e.department AS "employeeDepartment",
      i.item_type AS "itemType",
      i.category,
      i.description,
      i.original_amount::float AS "originalAmount",
      i.balance_remaining::float AS "balanceRemaining",
      i.recurrence_type AS "recurrenceType",
      i.recurring_amount::float AS "recurringAmount",
      i.max_total_amount::float AS "maxTotalAmount",
      i.start_pay_period AS "startPayPeriod",
      i.next_pay_period AS "nextPayPeriod",
      i.expected_deduction_pay_period AS "expectedDeductionPayPeriod",
      i.funding_source AS "fundingSource",
      i.given_date AS "givenDate",
      i.linked_item_id AS "linkedItemId",
      i.status,
      i.gusto_entered_at AS "gustoEnteredAt",
      i.completed_at AS "completedAt",
      i.voided_at AS "voidedAt",
      i.void_reason AS "voidReason",
      i.notes,
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt"
    FROM timekeeping.employee_payroll_items i
    JOIN employees e ON e.id = i.employee_id
  `;
}

async function logEvent(
  client: QueryRunner,
  input: {
    itemId: number;
    eventType: string;
    amount?: number | null;
    payPeriod?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown> | null;
    req: Request;
  }
) {
  const a = actor(input.req);
  await client.query(
    `
      INSERT INTO timekeeping.employee_payroll_item_events
        (item_id, event_type, amount, pay_period, old_status, new_status, note, metadata, actor_id, actor_email, actor_role, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
    `,
    [
      input.itemId,
      input.eventType,
      input.amount ?? null,
      input.payPeriod ?? null,
      input.oldStatus ?? null,
      input.newStatus ?? null,
      input.note ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      a.id,
      a.email,
      a.role,
      a.ip,
    ]
  );
}

router.use(authenticateToken);
router.use(requireRole('ADMIN', 'OWNER'));

router.get('/employees', async (_req: Request, res: Response) => {
  const result = await pgPool.query(`
    SELECT id, employee_code AS "employeeCode", name, department, is_active AS "isActive"
    FROM employees
    WHERE COALESCE(is_active, true) = true
    ORDER BY name ASC
  `);
  res.json({ employees: result.rows });
});

router.get('/summary', async (_req: Request, res: Response) => {
  const result = await pgPool.query(`
    SELECT
      COALESCE(SUM(balance_remaining) FILTER (WHERE item_type = 'advance' AND status <> 'voided'), 0)::float AS "openAdvanceBalance",
      COALESCE(SUM(balance_remaining) FILTER (WHERE item_type = 'deduction' AND status <> 'voided'), 0)::float AS "openDeductionBalance",
      COUNT(*) FILTER (WHERE status = 'ready_for_gusto')::int AS "needsGustoEntryCount",
      COUNT(*) FILTER (WHERE item_type = 'advance' AND status NOT IN ('complete', 'voided'))::int AS "openAdvanceCount",
      COUNT(*) FILTER (WHERE recurrence_type = 'recurring' AND status NOT IN ('complete', 'voided'))::int AS "activeRecurringCount"
    FROM timekeeping.employee_payroll_items
  `);
  res.json(result.rows[0]);
});

router.get('/items', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (parsed.data.employeeId) add('i.employee_id = ?', parsed.data.employeeId);
  if (parsed.data.itemType) add('i.item_type = ?', parsed.data.itemType);
  if (parsed.data.status) add('i.status = ?', parsed.data.status);
  if (parsed.data.payPeriod) {
    params.push(
      parsed.data.payPeriod,
      parsed.data.payPeriod,
      parsed.data.payPeriod
    );
    const start = params.length - 2;
    clauses.push(
      `(i.next_pay_period = $${start} OR i.expected_deduction_pay_period = $${start + 1} OR i.start_pay_period = $${start + 2})`
    );
  }
  if (!parsed.data.includeClosed)
    clauses.push("i.status NOT IN ('complete', 'voided')");

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pgPool.query(
    `${itemSelectSql()} ${where} ORDER BY i.created_at DESC`,
    params
  );
  res.json({ items: result.rows });
});

router.get('/items/:id/events', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'Invalid item id' });
  const result = await pgPool.query(
    `
      SELECT id, item_id AS "itemId", event_type AS "eventType", amount::float, pay_period AS "payPeriod",
        old_status AS "oldStatus", new_status AS "newStatus", note, metadata,
        actor_email AS "actorEmail", actor_role AS "actorRole", created_at AS "createdAt"
      FROM timekeeping.employee_payroll_item_events
      WHERE item_id = $1
      ORDER BY created_at DESC
    `,
    [id]
  );
  res.json({ events: result.rows });
});

router.post('/items', async (req: Request, res: Response) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });
  const body = parsed.data;
  const a = actor(req);
  const balance =
    body.itemType === 'owner_reimbursement' ? 0 : body.originalAmount;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `
        INSERT INTO timekeeping.employee_payroll_items
          (employee_id, item_type, category, description, original_amount, balance_remaining, recurrence_type,
           recurring_amount, max_total_amount, start_pay_period, next_pay_period, expected_deduction_pay_period,
           funding_source, given_date, given_by_user_id, linked_item_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id
      `,
      [
        body.employeeId,
        body.itemType,
        body.category,
        body.description,
        body.originalAmount,
        balance,
        body.recurrenceType,
        body.recurringAmount ?? null,
        body.maxTotalAmount ?? null,
        body.startPayPeriod ?? null,
        body.nextPayPeriod ?? null,
        body.expectedDeductionPayPeriod ?? null,
        body.fundingSource ?? null,
        body.givenDate ?? null,
        a.id,
        body.linkedItemId ?? null,
        body.notes ?? null,
        a.id,
      ]
    );
    const itemId = inserted.rows[0].id;
    await logEvent(client, {
      itemId,
      eventType: 'CREATED',
      amount: body.originalAmount,
      newStatus: 'draft',
      note: body.description,
      req,
    });

    if (
      body.itemType === 'advance' &&
      body.createOwnerReimbursement &&
      body.ownerEmployeeId
    ) {
      const reimbursement = await client.query(
        `
          INSERT INTO timekeeping.employee_payroll_items
            (employee_id, item_type, category, description, original_amount, balance_remaining, recurrence_type,
             expected_deduction_pay_period, funding_source, given_date, linked_item_id, notes, created_by, status)
          VALUES ($1, 'owner_reimbursement', 'Owner reimbursement', $2, $3, 0, 'one_time', $4, $5, $6, $7, $8, $9, 'ready_for_gusto')
          RETURNING id
        `,
        [
          body.ownerEmployeeId,
          `Reimburse advance funding for payroll item #${itemId}: ${body.description}`,
          body.originalAmount,
          body.expectedDeductionPayPeriod ?? body.nextPayPeriod ?? null,
          body.fundingSource ?? null,
          body.givenDate ?? null,
          itemId,
          body.notes ?? null,
          a.id,
        ]
      );
      const reimbursementId = reimbursement.rows[0].id;
      await client.query(
        'UPDATE timekeeping.employee_payroll_items SET linked_item_id = $2, updated_at = NOW() WHERE id = $1',
        [itemId, reimbursementId]
      );
      await logEvent(client, {
        itemId: reimbursementId,
        eventType: 'CREATED',
        amount: body.originalAmount,
        newStatus: 'ready_for_gusto',
        note: `Linked reimbursement for advance #${itemId}`,
        metadata: { linkedAdvanceId: itemId },
        req,
      });
      await logEvent(client, {
        itemId,
        eventType: 'LINKED_REIMBURSEMENT_CREATED',
        amount: body.originalAmount,
        note: `Created owner reimbursement item #${reimbursementId}`,
        metadata: { reimbursementId },
        req,
      });
    }
    await client.query('COMMIT');

    const result = await pgPool.query(`${itemSelectSql()} WHERE i.id = $1`, [
      itemId,
    ]);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[payroll-control] create error:', error);
    return res
      .status(500)
      .json({ error: 'Failed to create payroll control item' });
  } finally {
    client.release();
  }
});

router.patch('/items/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'Invalid item id' });
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  const allowed: Record<string, string> = {
    employeeId: 'employee_id',
    category: 'category',
    description: 'description',
    originalAmount: 'original_amount',
    recurringAmount: 'recurring_amount',
    maxTotalAmount: 'max_total_amount',
    recurrenceType: 'recurrence_type',
    startPayPeriod: 'start_pay_period',
    nextPayPeriod: 'next_pay_period',
    expectedDeductionPayPeriod: 'expected_deduction_pay_period',
    fundingSource: 'funding_source',
    givenDate: 'given_date',
    notes: 'notes',
    linkedItemId: 'linked_item_id',
  };

  const entries = Object.entries(parsed.data).filter(
    ([, value]) => value !== undefined
  );
  if (!entries.length)
    return res.status(400).json({ error: 'No changes supplied' });

  const setParts = entries.map(
    ([key], index) => `${allowed[key]} = $${index + 2}`
  );
  const values = entries.map(([, value]) => value);
  await pgPool.query(
    `UPDATE timekeeping.employee_payroll_items SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1`,
    [id, ...values]
  );
  await logEvent(pgPool, {
    itemId: id,
    eventType: 'UPDATED',
    note: 'Item details updated',
    metadata: parsed.data,
    req,
  });
  const result = await pgPool.query(`${itemSelectSql()} WHERE i.id = $1`, [id]);
  res.json(result.rows[0]);
});

router.post('/items/:id/status', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'Invalid item id' });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  const a = actor(req);
  const current = await pgPool.query(
    'SELECT status FROM timekeeping.employee_payroll_items WHERE id = $1',
    [id]
  );
  if (!current.rowCount)
    return res.status(404).json({ error: 'Payroll control item not found' });

  const status = parsed.data.status;
  await pgPool.query(
    `
      UPDATE timekeeping.employee_payroll_items
      SET status = $2,
          gusto_entered_at = CASE WHEN $2 = 'entered_in_gusto' THEN NOW() ELSE gusto_entered_at END,
          gusto_entered_by = CASE WHEN $2 = 'entered_in_gusto' THEN $3 ELSE gusto_entered_by END,
          completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END,
          completed_by = CASE WHEN $2 = 'complete' THEN $3 ELSE completed_by END,
          voided_at = CASE WHEN $2 = 'voided' THEN NOW() ELSE voided_at END,
          voided_by = CASE WHEN $2 = 'voided' THEN $3 ELSE voided_by END,
          void_reason = CASE WHEN $2 = 'voided' THEN $4 ELSE void_reason END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [id, status, a.id, parsed.data.reason]
  );
  await logEvent(pgPool, {
    itemId: id,
    eventType: 'STATUS_CHANGED',
    oldStatus: current.rows[0].status,
    newStatus: status,
    note: parsed.data.reason,
    req,
  });
  const result = await pgPool.query(`${itemSelectSql()} WHERE i.id = $1`, [id]);
  res.json(result.rows[0]);
});

router.post('/items/:id/payments', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'Invalid item id' });
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });
  const a = actor(req);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT status, balance_remaining::float AS "balanceRemaining" FROM timekeeping.employee_payroll_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payroll control item not found' });
    }
    const oldBalance = toNumber(current.rows[0].balanceRemaining);
    const newBalance = Math.max(0, oldBalance - parsed.data.amount);
    const newStatus = newBalance <= 0.005 ? 'complete' : 'partially_repaid';

    await client.query(
      `
        UPDATE timekeeping.employee_payroll_items
        SET balance_remaining = $2,
            status = $3,
            completed_at = CASE WHEN $3 = 'complete' THEN NOW() ELSE completed_at END,
            completed_by = CASE WHEN $3 = 'complete' THEN $4 ELSE completed_by END,
            updated_at = NOW()
        WHERE id = $1
      `,
      [id, newBalance, newStatus, a.id]
    );
    await logEvent(client, {
      itemId: id,
      eventType: 'PAYMENT_APPLIED',
      amount: parsed.data.amount,
      payPeriod: parsed.data.payPeriod ?? null,
      oldStatus: current.rows[0].status,
      newStatus,
      note: parsed.data.note ?? null,
      metadata: { oldBalance, newBalance },
      req,
    });
    await client.query('COMMIT');
    const result = await pgPool.query(`${itemSelectSql()} WHERE i.id = $1`, [
      id,
    ]);
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[payroll-control] payment error:', error);
    return res
      .status(500)
      .json({ error: 'Failed to apply payroll control payment' });
  } finally {
    client.release();
  }
});

export default router;
