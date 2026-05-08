/**
 * Cycle Count routes — Task #142
 * Mounted at /api/inventory/cycle-counts
 *
 * Capability gates:
 *   inventory.cycleCount.view              — list / get
 *   inventory.cycleCount.create            — create / cancel
 *   inventory.cycleCount.perform           — record counts / submit for review
 *   inventory.cycleCount.approve           — approve session
 *   inventory.cycleCount.postAdjustments   — post to ledger
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { db } from '../../db';
import { users } from '../../schema';
import { eq } from 'drizzle-orm';
import {
  createSession,
  listSessions,
  getSession,
  startSession,
  recordCounts,
  submitForReview,
  approveSession,
  postSession,
  cancelSession,
  listVariancePolicies,
  createVariancePolicy,
  listVarianceHistory,
  type Actor,
} from '../services/cycleCountService';

const router = Router();
router.use(authenticateToken);

async function actorOf(req: Request): Promise<Actor> {
  const u = (req.user ?? {}) as { id?: number; username?: string; role?: string };
  let userId: number | null = u.id ?? null;
  // Defensively verify the user exists; FK constraints would otherwise fail
  // in environments (e.g. dev with DEV_AUTH_BYPASS) where the bypass user id
  // is not present in the users table.
  if (userId != null) {
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!exists) userId = null;
  }
  return { userId, username: u.username ?? 'unknown', role: u.role };
}

function sendErr(res: Response, err: unknown) {
  const e = err as Error & { statusCode?: number };
  const status = e?.statusCode ?? 500;
  if (status >= 500) console.error('[cycle-counts]', err);
  res.status(status).json({ error: e?.message ?? 'Internal error' });
}

// ── Variance policies ─────────────────────────────────────────────────────

router.get('/variance-policies', requirePermission('inventory.cycleCount.view'), async (_req, res) => {
  try { res.json(await listVariancePolicies()); } catch (e) { sendErr(res, e); }
});

router.post('/variance-policies', requirePermission('inventory.cycleCount.create'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      qtyTolerance: z.number().nonnegative(),
      percentTolerance: z.number().nonnegative(),
      autoApproveWithinTolerance: z.boolean().optional(),
      requiresDualApproval: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    });
    const parsed = schema.parse(req.body);
    res.status(201).json(await createVariancePolicy(parsed, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

// ── Sessions ──────────────────────────────────────────────────────────────

router.get('/', requirePermission('inventory.cycleCount.view'), async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listSessions({ status }));
  } catch (e) { sendErr(res, e); }
});

router.get('/variance-history', requirePermission('inventory.cycleCount.view'), async (req, res) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Math.min(500, parseInt(req.query.limit, 10) || 100) : 100;
    res.json(await listVarianceHistory(limit));
  } catch (e) { sendErr(res, e); }
});

router.post('/', requirePermission('inventory.cycleCount.create'), async (req, res) => {
  try {
    const schema = z.object({
      location: z.string().min(1),
      partFilter: z.string().optional().nullable(),
      countType: z.enum(['CYCLE', 'FULL', 'SPOT', 'ABC']).optional(),
      scheduledFor: z.string().datetime().optional().nullable(),
      blindCount: z.boolean().optional(),
      variancePolicyId: z.string().uuid().optional().nullable(),
      notes: z.string().optional().nullable(),
    });
    const parsed = schema.parse(req.body);
    const session = await createSession({
      ...parsed,
      scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
    }, await actorOf(req));
    res.status(201).json(session);
  } catch (e) { sendErr(res, e); }
});

router.get('/:id', requirePermission('inventory.cycleCount.view'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const reveal = req.query.reveal === 'true';
    const sess = await getSession(id, await actorOf(req), { revealExpected: reveal });
    if (!sess) return res.status(404).json({ error: 'Session not found' });
    res.json(sess);
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/start', requirePermission('inventory.cycleCount.perform'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    res.json(await startSession(id, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/counts', requirePermission('inventory.cycleCount.perform'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const schema = z.object({
      counts: z.array(z.object({
        lineId: z.number().int(),
        countedQty: z.number().nonnegative(),
        notes: z.string().optional(),
      })).min(1),
    });
    const parsed = schema.parse(req.body);
    res.json(await recordCounts(id, parsed.counts, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/submit', requirePermission('inventory.cycleCount.perform'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    res.json(await submitForReview(id, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/approve', requirePermission('inventory.cycleCount.approve'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    res.json(await approveSession(id, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/post', requirePermission('inventory.cycleCount.postAdjustments'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    res.json(await postSession(id, await actorOf(req)));
  } catch (e) { sendErr(res, e); }
});

router.post('/:id/cancel', requirePermission('inventory.cycleCount.create'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    res.json(await cancelSession(id, await actorOf(req), reason));
  } catch (e) { sendErr(res, e); }
});

export default router;
