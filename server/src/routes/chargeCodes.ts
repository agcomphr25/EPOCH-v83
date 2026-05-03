import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { db } from '../../db';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { insertChargeCodeSchema, auditEvents } from '../../schema';

const router: IRouter = Router();

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error('[chargeCodes]', err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
}

function extractActor(req: Request): { actorId: number | null; actorName: string; actorRole: string } {
  const user = req.user as any;
  return {
    actorId: user?.id ?? null,
    actorName: user?.username || user?.email || user?.name || 'admin',
    actorRole: user?.role || 'admin',
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

  // DCAA audit trail — only written after successful DB creation
  const { actorId, actorName, actorRole } = extractActor(req);
  await db.insert(auditEvents).values({
    entityType: 'charge_code',
    entityId: String(created.id),
    action: 'CHARGE_CODE_CREATED',
    actorId,
    actorName,
    actorRole,
    fieldsChanged: {
      code: created.code,
      type: created.type,
      active: created.active,
    },
    meta: {
      billable: created.billable,
      requiresApproval: created.requiresApproval,
    },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
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

  const fieldsChanged: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, toVal] of Object.entries(parsed.data)) {
    const fromVal = existing ? (existing as Record<string, unknown>)[key] : undefined;
    if (fromVal !== toVal) {
      fieldsChanged[key] = { from: fromVal, to: toVal };
    }
  }

  await db.insert(auditEvents).values({
    entityType: 'charge_code',
    entityId: String(id),
    action,
    actorId,
    actorName,
    actorRole,
    reason,
    fieldsChanged,
    meta: { isDeactivation },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.json(updated);
}));

export default router;
