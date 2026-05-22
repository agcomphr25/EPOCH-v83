/**
 * Burden Rates admin + apply routes — Task #80.
 *
 * Mounted at /api/burden-rates.  Admin-gated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  allocationBases,
  indirectCostPools,
  indirectRates,
  insertAllocationBaseSchema,
  insertIndirectCostPoolSchema,
  insertIndirectRateSchema,
} from '../../schema';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess } from '../../middleware/routeAuthorization';
import {
  applyBurdenForPeriod,
  getBurdenRateAccumulation,
  getLatestBurdenRateAccumulation,
  getRunBreakdown,
  listApplicationRuns,
  listBases,
  listPools,
  listRatesForPool,
  postAccumulationRates,
  previewRateChange,
  recomputeBurdenForApplied,
  resolveRateStack,
  saveBurdenRateAccumulation,
  verifyPeriodBurdenComplete,
} from '../services/burdenRatesService';

const router = Router();
router.use(authenticateToken);
router.use(requireAdminAccess);

const periodSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const accumulationSchema = z.object({
  calculationYear: z.number().int().min(2000).max(2100),
  lookbackStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookbackEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateType: z.enum(['PROVISIONAL', 'BILLING', 'FINAL']),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
  expenseLines: z.array(z.object({
    poolId: z.number().int(),
    lineItem: z.string().min(1),
    monthlyAmounts: z.record(z.coerce.number()),
    notes: z.string().optional().nullable(),
  })).min(1),
  bases: z.array(z.object({
    poolId: z.number().int(),
    baseAmount: z.coerce.number().nonnegative(),
    baseSource: z.string().optional().nullable(),
  })).default([]),
});

// ── Allocation bases ────────────────────────────────────────────────────────
router.get('/bases', async (_req, res) => {
  try {
    res.json(await listBases());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bases', async (req, res) => {
  const parsed = insertAllocationBaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid base', details: parsed.error.format() });
  try {
    const [row] = await db.insert(allocationBases).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Base code already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── Pools ───────────────────────────────────────────────────────────────────
router.get('/pools', async (_req, res) => {
  try {
    res.json(await listPools());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pools', async (req, res) => {
  const parsed = insertIndirectCostPoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pool', details: parsed.error.format() });
  try {
    const [row] = await db.insert(indirectCostPools).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'Pool code already exists' });
    res.status(500).json({ error: e.message });
  }
});

const updatePoolSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  applyOrder: z.number().int().optional(),
  allocationBaseId: z.number().int().optional(),
});

router.patch('/pools/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = updatePoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid fields', details: parsed.error.format() });
  try {
    const [row] = await db.update(indirectCostPools)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(indirectCostPools.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Pool not found' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rates (insert-only, effective-dated) ────────────────────────────────────
router.get('/pools/:id/rates', async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (isNaN(poolId)) return res.status(400).json({ error: 'Invalid pool id' });
  try {
    res.json(await listRatesForPool(poolId));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pools/:id/rates', async (req, res) => {
  const poolId = parseInt(req.params.id, 10);
  if (isNaN(poolId)) return res.status(400).json({ error: 'Invalid pool id' });
  const actor = (req.user as any)?.username || (req.user as any)?.email || 'admin';
  const parsed = insertIndirectRateSchema.safeParse({
    ...req.body,
    poolId,
    createdBy: actor,
  });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid rate', details: parsed.error.format() });
  try {
    const [row] = await db.insert(indirectRates).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === '23505') {
      return res.status(409).json({
        error: 'A rate for this pool/type already exists on that effective date. Pick a different date or rate type.',
      });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve a rate stack ────────────────────────────────────────────────────
router.get('/rate-stack', async (req, res) => {
  const dateStr = String(req.query.date ?? '');
  const rateType = String(req.query.rateType ?? 'PROVISIONAL') as any;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
  }
  try {
    const stack = await resolveRateStack(new Date(`${dateStr}T00:00:00Z`), rateType);
    res.json(stack.map((s) => ({
      poolId: s.pool.id,
      poolCode: s.pool.code,
      poolName: s.pool.name,
      poolType: s.pool.poolType,
      rateId: s.rate.id,
      rateType: s.rate.rateType,
      rate: s.rate.rate,
      effectiveFrom: s.rate.effectiveFrom,
    })));
  } catch (e: any) {
    if (e.code === 'INCOMPLETE_RATE_STACK' || e.code === 'NO_ACTIVE_POOLS') {
      return res.status(409).json({ error: e.message, code: e.code, missingPools: e.missingPools });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Apply burden ────────────────────────────────────────────────────────────
const applySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  runType: z.enum(['INITIAL', 'TRUE_UP']).optional(),
  rateType: z.enum(['PROVISIONAL', 'BILLING', 'FINAL']).optional(),
});

router.post('/apply', async (req: Request, res: Response) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
  const actor = (req.user as any)?.username || (req.user as any)?.email || 'admin';
  try {
    const result = await applyBurdenForPeriod(parsed.data.year, parsed.data.month, {
      runType: parsed.data.runType,
      rateType: parsed.data.rateType,
      appliedBy: actor,
    });
    res.json({ message: 'Burden applied', ...result });
  } catch (e: any) {
    if (e.code === 'INCOMPLETE_RATE_STACK' || e.code === 'NO_ACTIVE_POOLS' ||
        e.code === 'NO_COST_RECORDS' || e.code === 'PERIOD_ALREADY_POSTED' ||
        e.code === 'NO_PRIOR_RUN') {
      return res.status(409).json({ error: e.message, code: e.code, missingPools: e.missingPools });
    }
    console.error('[burdenRates.apply] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Verify gate (read-only) ─────────────────────────────────────────────────
router.get('/verify', async (req, res) => {
  const parsed = periodSchema.safeParse({
    year: Number(req.query.year),
    month: Number(req.query.month),
  });
  if (!parsed.success) return res.status(400).json({ error: 'year/month required' });
  try {
    res.json(await verifyPeriodBurdenComplete(parsed.data.year, parsed.data.month));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Preview rate change ─────────────────────────────────────────────────────
const previewSchema = z.object({
  poolId: z.number().int(),
  newRate: z.number().nonnegative(),
  newRateType: z.enum(['PROVISIONAL', 'BILLING', 'FINAL']),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  samplePeriodYear: z.number().int().min(2000).max(2100),
  samplePeriodMonth: z.number().int().min(1).max(12),
});

router.post('/preview', async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
  try {
    res.json(await previewRateChange(parsed.data));
  } catch (e: any) {
    if (e.code === 'INCOMPLETE_RATE_STACK' || e.code === 'NO_ACTIVE_POOLS') {
      return res.status(409).json({ error: e.message, code: e.code });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Application runs ────────────────────────────────────────────────────────
router.get('/accumulations/latest', async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    res.json(await getLatestBurdenRateAccumulation(Number.isFinite(year) ? year : undefined));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/accumulations/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const payload = await getBurdenRateAccumulation(id);
    if (!payload) return res.status(404).json({ error: 'Accumulation not found' });
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/accumulations', async (req, res) => {
  const parsed = accumulationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid accumulation', details: parsed.error.format() });
  const actor = (req.user as any)?.username || (req.user as any)?.email || 'admin';
  try {
    res.status(201).json(await saveBurdenRateAccumulation(parsed.data, actor));
  } catch (e: any) {
    if (e.code === 'NO_EXPENSE_LINES') return res.status(400).json({ error: e.message, code: e.code });
    res.status(500).json({ error: e.message });
  }
});

router.post('/accumulations/:id/post-rates', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const actor = (req.user as any)?.username || (req.user as any)?.email || 'admin';
  try {
    res.json(await postAccumulationRates(id, actor));
  } catch (e: any) {
    if (['NOT_FOUND', 'ALREADY_POSTED', 'NO_POSTABLE_RATES', 'RATE_EXISTS'].includes(e.code)) {
      return res.status(e.code === 'NOT_FOUND' ? 404 : 409).json({ error: e.message, code: e.code });
    }
    res.status(500).json({ error: e.message });
  }
});

router.get('/runs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  try {
    res.json(await listApplicationRuns(limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/runs/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const r = await getRunBreakdown(id);
    if (!r) return res.status(404).json({ error: 'Run not found' });
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reproducibility check ───────────────────────────────────────────────────
router.get('/applied/:id/recompute', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    res.json(await recomputeBurdenForApplied(id));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
