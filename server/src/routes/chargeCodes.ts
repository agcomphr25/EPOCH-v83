import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { insertChargeCodeSchema } from '../../schema';
import { recordAuditEvent } from '../services/auditLedgerService';

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

// GET /api/charge-codes — list all charge codes; supports ?active=true filter
router.get('/', authenticateToken, h(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const codes = await storage.listChargeCodes(activeOnly);
  res.json(codes);
}));

// POST /api/charge-codes — admin create
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
