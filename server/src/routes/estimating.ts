import { Router } from 'express';
import { z } from 'zod';
import { pool, pgPool } from '../../db';
import { storage } from '../../storage';
import { DEFAULT_ESTIMATING_RFQS_LIMIT, MAX_ESTIMATING_RFQS_LIMIT } from '../constants/estimating';
import { recordAuditEvent } from '../services/auditLedgerService';
import {
  insertEstimatingRfqSchema,
  insertEstimatingRfqPartSchema,
  insertEstimatingToolingSchema,
} from '../../schema';

const router = Router();

const assumptionSchema = z.object({
  rfqPartId: z.string().uuid().nullable().optional(),
  assumptionType: z.enum(['LABOR', 'SCRAP', 'MATERIAL_YIELD', 'TOOLING_LIFE', 'SETUP_TIME']),
  assumptionText: z.string().min(1),
  numericValue: z.union([z.string(), z.number()]).nullable().optional(),
  uom: z.string().nullable().optional(),
  confidenceLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  sourceReference: z.string().nullable().optional(),
  createdBy: z.number().int().nullable().optional(),
});

const approvalSchema = z.object({
  estimateVersionId: z.string().uuid().nullable().optional(),
  approvalRole: z.enum(['ESTIMATOR', 'ENGINEERING', 'FINANCE', 'EXECUTIVE']),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).default('PENDING'),
  approvalThreshold: z.union([z.string(), z.number()]).nullable().optional(),
  signerUserId: z.number().int().nullable().optional(),
  signerDisplayName: z.string().nullable().optional(),
  digitalSignature: z.string().nullable().optional(),
  approvalComments: z.string().nullable().optional(),
});

const riskAssessmentSchema = z.object({
  estimateVersionId: z.string().uuid().nullable().optional(),
  status: z.string().default('DRAFT'),
  createdBy: z.number().int().nullable().optional(),
});

const riskItemSchema = z.object({
  category: z.enum(['TECHNICAL', 'SUPPLY_CHAIN', 'FINANCIAL', 'SCHEDULE', 'COMPLIANCE', 'QUALITY']),
  description: z.string().min(1),
  severity: z.number().int().min(1).max(5),
  probability: z.number().int().min(1).max(5),
  ownerUserId: z.number().int().nullable().optional(),
  ownerDisplayName: z.string().nullable().optional(),
  status: z.string().default('OPEN'),
  requiresApproval: z.boolean().default(false),
});

const mitigationActionSchema = z.object({
  actionDescription: z.string().min(1),
  assignedToUserId: z.number().int().nullable().optional(),
  assignedToDisplayName: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  status: z.string().default('OPEN'),
  completedAt: z.coerce.date().nullable().optional(),
  createdBy: z.number().int().nullable().optional(),
});

const riskAssessmentStatusSchema = z.object({
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CLOSED']),
});

const riskItemUpdateSchema = z.object({
  status: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  ownerUserId: z.number().int().nullable().optional(),
  ownerDisplayName: z.string().nullable().optional(),
});

const mitigationUpdateSchema = z.object({
  status: z.string().optional(),
  completedAt: z.coerce.date().nullable().optional(),
});

const createEstimatingRfqSchema = insertEstimatingRfqSchema.extend({
  rfqNumber: z.string().optional(),
});

function getActor(req: any) {
  return {
    id: req.user?.id ?? req.session?.user?.id ?? null,
    username: req.user?.username ?? req.session?.user?.username ?? null,
    role: req.user?.role ?? req.session?.user?.role ?? null,
  };
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRiskLevel(score: number): string {
  if (score >= 16) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5) return 'MEDIUM';
  return 'LOW';
}

function getApprovalRouting(overallLevel: string, items: any[]): string[] {
  const routes = new Set<string>(['ESTIMATOR']);
  if (items.some((item) => item.category === 'TECHNICAL' || item.category === 'QUALITY')) routes.add('ENGINEERING');
  if (items.some((item) => item.category === 'FINANCIAL' || Number(item.score) >= 10)) routes.add('FINANCE');
  if (overallLevel === 'HIGH' || overallLevel === 'CRITICAL' || items.some((item) => item.requires_approval)) routes.add('EXECUTIVE');
  return Array.from(routes);
}

async function generateEstimatingRfqNumber(customerId?: number | null): Promise<string> {
  if (customerId) {
    const customerRows = await pool.query(
      `SELECT customer_id FROM p2_customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );

    const customerNumber = customerRows[0]?.customer_id;
    if (customerNumber) {
      const result = await storage.reserveNextRFQNumber(customerNumber, new Date().getFullYear().toString());
      return result.rfqNumber;
    }
  }

  const yearSuffix = String(new Date().getFullYear()).slice(-2);
  const prefix = `RFQ${yearSuffix}`;
  const rows = await pool.query(
    `SELECT rfq_number
     FROM estimating_rfqs
     WHERE rfq_number LIKE $1
     ORDER BY rfq_number DESC
     LIMIT 1`,
    [`${prefix}%`]
  );
  const lastSequence = Number(String(rows[0]?.rfq_number ?? '').slice(prefix.length)) || 0;
  return `${prefix}${String(lastSequence + 1).padStart(4, '0')}`;
}

async function refreshRiskAssessmentScore(riskAssessmentId: string) {
  const items = await pool.query(
    `SELECT category, score, requires_approval FROM risk_items WHERE risk_assessment_id = $1`,
    [riskAssessmentId]
  );
  const overallScore = items.reduce((max: number, item: any) => Math.max(max, Number(item.score || 0)), 0);
  const overallLevel = getRiskLevel(overallScore);
  const approvalRouting = getApprovalRouting(overallLevel, items);
  const updated = await pool.query(
    `UPDATE risk_assessments
     SET overall_score = $2, overall_level = $3, approval_routing = $4::jsonb, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [riskAssessmentId, overallScore, overallLevel, JSON.stringify(approvalRouting)]
  );
  return updated[0];
}

async function getEstimatingReleaseReadiness(rfqId: string, options: { requiresExecutiveApproval?: boolean } = {}) {
  const [approvals, pricingRows, latestRiskRows, blockingRiskItems] = await Promise.all([
    pool.query(`SELECT approval_role, approval_status FROM estimating_approvals WHERE rfq_id = $1`, [rfqId]),
    pool.query(`SELECT extended_price, margin_percent FROM estimating_pricing_snapshots WHERE rfq_id = $1`, [rfqId]),
    pool.query(
      `SELECT * FROM risk_assessments
       WHERE rfq_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [rfqId]
    ),
    pool.query(
      `SELECT ri.*
       FROM risk_items ri
       JOIN risk_assessments ra ON ra.id = ri.risk_assessment_id
       WHERE ra.rfq_id = $1
         AND ri.status NOT IN ('CLOSED', 'MITIGATED', 'ACCEPTED')
         AND (ri.requires_approval = true OR ri.score >= 10)`,
      [rfqId]
    ),
  ]);

  const totalEstimateValue = pricingRows.reduce((sum: number, row: any) => sum + money(row.extended_price), 0);
  const margins = pricingRows.map((row: any) => money(row.margin_percent)).filter((value: number) => Number.isFinite(value));
  const minMarginPercent = margins.length ? Math.min(...margins) : null;
  const latestRisk = latestRiskRows[0] ?? null;
  const riskScore = Number(latestRisk?.overall_score ?? 0);
  const riskLevel = latestRisk?.overall_level ?? 'UNKNOWN';
  const riskStatus = latestRisk?.status ?? null;

  const executiveTriggers = [
    totalEstimateValue >= 50000 ? 'VALUE_50000_OR_GREATER' : null,
    minMarginPercent !== null && minMarginPercent < 15 ? 'MARGIN_BELOW_15_PERCENT' : null,
    riskScore >= 10 ? 'RISK_SCORE_10_OR_GREATER' : null,
    ['HIGH', 'CRITICAL'].includes(riskLevel) ? `RISK_LEVEL_${riskLevel}` : null,
    options.requiresExecutiveApproval ? 'REQUESTED_BY_CALLER' : null,
  ].filter(Boolean) as string[];

  const requiredRoles = ['ESTIMATOR', 'ENGINEERING', 'FINANCE'];
  if (executiveTriggers.length > 0) requiredRoles.push('EXECUTIVE');

  const approvedRoles = new Set(
    approvals
      .filter((row: any) => row.approval_status === 'APPROVED')
      .map((row: any) => row.approval_role)
  );
  const missingRoles = requiredRoles.filter((role) => !approvedRoles.has(role));
  const blockingRiskCount = blockingRiskItems.length;
  const riskReady = Boolean(latestRisk) && ['APPROVED', 'CLOSED'].includes(String(riskStatus)) && blockingRiskCount === 0;

  return {
    readyForQuoteRelease: missingRoles.length === 0 && riskReady,
    requiredRoles,
    missingRoles,
    executiveRequired: executiveTriggers.length > 0,
    executiveTriggers,
    totalEstimateValue,
    minMarginPercent,
    risk: {
      assessmentId: latestRisk?.id ?? null,
      status: riskStatus,
      overallScore: riskScore,
      overallLevel: riskLevel,
      blockingRiskCount,
    },
  };
}

// ── RFQ List ─────────────────────────────────────────────────────────────────

router.get('/rfqs', async (req, res) => {
  try {
    const { status, customerId, limit = String(DEFAULT_ESTIMATING_RFQS_LIMIT), offset = '0' } = req.query;

    const parsedLimit = parseInt(String(limit), 10);
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_ESTIMATING_RFQS_LIMIT)
      : DEFAULT_ESTIMATING_RFQS_LIMIT;

    let query = `
      SELECT r.*,
        COUNT(p.id)::int AS part_count
      FROM estimating_rfqs r
      LEFT JOIN estimating_rfq_parts p ON p.rfq_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let n = 0;

    if (status) {
      n++;
      query += ` AND r.status = $${n}`;
      params.push(status);
    }
    if (customerId) {
      n++;
      query += ` AND r.customer_id = $${n}`;
      params.push(Number(customerId));
    }

    query += ` GROUP BY r.id ORDER BY r.created_at DESC LIMIT $${n + 1} OFFSET $${n + 2}`;
    params.push(effectiveLimit, Number(offset));

    const rows = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create RFQ ────────────────────────────────────────────────────────────────

router.post('/rfqs', async (req, res) => {
  try {
    const data = createEstimatingRfqSchema.parse(req.body);
    const rfqNumber = data.rfqNumber?.trim() || await generateEstimatingRfqNumber(data.customerId ?? null);
    const rfq = await storage.createEstimatingRfq({ ...data, rfqNumber });
    res.status(201).json(rfq);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      console.error('[POST /rfqs] Validation error:', JSON.stringify(err.errors, null, 2));
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── Get single RFQ ────────────────────────────────────────────────────────────

router.get('/rfqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const [parts, tooling] = await Promise.all([
      storage.getEstimatingRfqParts(id),
      storage.getEstimatingTooling(id),
    ]);

    res.json({ ...rfq, parts, tooling });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lookup RFQ by rfqNumber ───────────────────────────────────────────────────

router.get('/rfqs/by-rfq-number/:rfqNumber', async (req, res) => {
  try {
    const { rfqNumber } = req.params;
    const rows = await pool.query(
      `SELECT r.*, json_agg(p.* ORDER BY p.line_number) FILTER (WHERE p.id IS NOT NULL) AS parts
       FROM estimating_rfqs r
       LEFT JOIN estimating_rfq_parts p ON p.rfq_id = r.id
       WHERE r.rfq_number = $1
       GROUP BY r.id
       LIMIT 1`,
      [rfqNumber]
    );
    if (!rows || (rows as any[]).length === 0) {
      return res.status(404).json({ error: 'No estimating RFQ found for this RFQ number' });
    }
    res.json((rows as any[])[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update RFQ ────────────────────────────────────────────────────────────────

router.patch('/rfqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertEstimatingRfqSchema.partial().parse(req.body);
    const rfq = await storage.updateEstimatingRfq(id, data);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });
    res.json(rfq);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      console.error('[PATCH /rfqs/:id] Validation error:', JSON.stringify(err.errors, null, 2));
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── RFQ Parts ─────────────────────────────────────────────────────────────────

router.get('/rfqs/:id/parts', async (req, res) => {
  try {
    const parts = await storage.getEstimatingRfqParts(req.params.id);
    res.json(parts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rfqs/:id/parts', async (req, res) => {
  try {
    await storage.deleteEstimatingRfqPartsByRfqId(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/parts', async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const partSchema = insertEstimatingRfqPartSchema.omit({ lineNumber: true }).extend({
      lineNumber: insertEstimatingRfqPartSchema.shape.lineNumber.optional(),
    });
    const data = partSchema.parse({ ...req.body, rfqId: id });

    const lineRows = await pool.query(
      `SELECT COALESCE(MAX(line_number), 0) + 1 AS next_line FROM estimating_rfq_parts WHERE rfq_id = $1`,
      [id]
    );
    const lineNumber = data.lineNumber ?? lineRows[0]?.next_line ?? 1;

    const part = await storage.createEstimatingRfqPart({ ...data, lineNumber } as any);
    res.status(201).json(part);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── Tooling ───────────────────────────────────────────────────────────────────

router.get('/rfqs/:id/tooling', async (req, res) => {
  try {
    const tooling = await storage.getEstimatingTooling(req.params.id);
    res.json(tooling);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/tooling', async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const tooling = await storage.createEstimatingTooling({ ...req.body, rfqId: id });
    res.status(201).json(tooling);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tooling/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingTooling(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── BOM Lines ─────────────────────────────────────────────────────────────────

router.get('/rfqs/:id/bom-lines', async (req, res) => {
  try {
    const lines = await storage.getEstimatingBomLines(req.params.id);
    res.json(lines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/bom-lines', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const line = await storage.createEstimatingBomLine({ ...req.body, rfqId: id });
    res.status(201).json(line);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bom-lines/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingBomLine(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Process Rows ──────────────────────────────────────────────────────────────

router.get('/rfqs/:id/process-rows', async (req, res) => {
  try {
    const rows = await storage.getEstimatingProcessRows(req.params.id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/process-rows', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const row = await storage.createEstimatingProcessRow({ ...req.body, rfqId: id });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/process-rows/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingProcessRow(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Adjustments ───────────────────────────────────────────────────────────────

router.get('/rfqs/:id/adjustments', async (req, res) => {
  try {
    const rows = await storage.getEstimatingAdjustments(req.params.id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/adjustments', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const row = await storage.createEstimatingAdjustment({ ...req.body, rfqId: id });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/adjustments/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingAdjustment(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Shipping ──────────────────────────────────────────────────────────────────

router.get('/rfqs/:id/shipping', async (req, res) => {
  try {
    const rows = await storage.getEstimatingShipping(req.params.id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/shipping', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const row = await storage.createEstimatingShipping({ ...req.body, rfqId: id });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shipping/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingShipping(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quantity Breaks ───────────────────────────────────────────────────────────

router.get('/rfqs/:id/quantity-breaks', async (req, res) => {
  try {
    const rows = await storage.getEstimatingQuantityBreaks(req.params.id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/quantity-breaks', async (req, res) => {
  try {
    const { id } = req.params;
    const rfq = await storage.getEstimatingRfqById(id);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const row = await storage.createEstimatingQuantityBreak({ ...req.body, rfqId: id });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/quantity-breaks/:id', async (req, res) => {
  try {
    await storage.deleteEstimatingQuantityBreak(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pricing Snapshots ─────────────────────────────────────────────────────────

router.get('/rfqs/:id/pricing-snapshots', async (req, res) => {
  try {
    const rows = await storage.getEstimatingPricingSnapshots(req.params.id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/pricing-snapshots', async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfq = await storage.getEstimatingRfqById(rfqId);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const rows = Array.isArray(req.body) ? req.body : [];
    const saved = await storage.replaceEstimatingPricingSnapshots(rfqId, rows);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Quote Handoff ─────────────────────────────────────────────────────────────

router.post('/rfqs/:id/create-draft-quote', async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfq = await storage.getEstimatingRfqById(rfqId);
    if (!rfq) return res.status(404).json({ error: 'RFQ not found' });

    const readiness = await getEstimatingReleaseReadiness(rfqId, {
      requiresExecutiveApproval: Boolean(req.body?.requiresExecutiveApproval),
    });
    if (!readiness.readyForQuoteRelease) {
      return res.status(409).json({
        error: 'RFQ estimating controls are not complete. Resolve approvals and risk assessment before quote release.',
        readiness,
      });
    }

    const parts = await storage.getEstimatingRfqParts(rfqId);
    const snapshots = await storage.getEstimatingPricingSnapshots(rfqId);

    // Group snapshots by quantity break and sum extended prices
    const breakTotals: Record<string, number> = {};
    for (const snap of snapshots) {
      const key = snap.quantityBreakId;
      breakTotals[key] = (breakTotals[key] ?? 0) + Number(snap.extendedPrice);
    }

    // Use largest break total as the quote total amount
    const totalAmount = Object.values(breakTotals).reduce((max, v) => Math.max(max, v), 0);

    const partNumberList = parts.map((p) => p.partNumber).join(', ');
    const description = rfq.notes
      ? `${partNumberList} — ${rfq.notes}`
      : partNumberList || rfq.rfqNumber;

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const quote = await storage.createQuote({
      quoteNumber: `Q-${rfq.rfqNumber}`,
      customerId: rfq.customerId ? String(rfq.customerId) : 'ESTIMATING',
      customerName: rfq.customerNameSnapshot ?? rfq.rfqNumber,
      description,
      totalAmount,
      status: 'DRAFT',
      validUntil,
      quotedBy: null,
      notes: `Generated from RFQ ${rfq.rfqNumber}. Assumptions: ${rfq.assumptions ?? 'N/A'}.`,
      // Carry the integer FK directly from the RFQ so the customer link is explicit
      customersIntegerId: rfq.customerId ?? null,
    });

    await pool.query(
      `UPDATE estimating_rfqs SET quote_id = $2, status = 'QUOTED', updated_at = NOW() WHERE id = $1`,
      [rfqId, quote.id]
    );

    await recordAuditEvent({
      eventType: 'ESTIMATING_QUOTE_RELEASED',
      subjectType: 'estimating_rfq',
      subjectId: rfqId,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        readiness: readiness as any,
      },
      reason: 'RFQ approval-readiness and risk controls satisfied before quote handoff',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({ quoteId: quote.id, quoteNumber: quote.quoteNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Versioning, assumptions, approvals, and structured risk controls

router.get('/rfqs/:id/versions', async (req, res) => {
  try {
    const versions = await pool.query(
      `SELECT v.*,
        COALESCE(json_agg(l.* ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL), '[]') AS line_versions
       FROM estimate_versions v
       LEFT JOIN estimate_line_versions l ON l.estimate_version_id = v.id
       WHERE v.rfq_id = $1
       GROUP BY v.id
       ORDER BY v.version_number DESC`,
      [req.params.id]
    );
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/versions', async (req, res) => {
  const client = await pgPool.connect();
  try {
    const rfqId = req.params.id;
    const body = z.object({
      createdBy: z.number().int().nullable().optional(),
      changeSummary: z.string().nullable().optional(),
      status: z.string().default('DRAFT'),
    }).parse(req.body);

    await client.query('BEGIN');

    const rfqResult = await client.query(`SELECT * FROM estimating_rfqs WHERE id = $1`, [rfqId]);
    const rfq = rfqResult.rows[0];
    if (!rfq) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'RFQ not found' });
    }

    const nextVersionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM estimate_versions
       WHERE rfq_id = $1`,
      [rfqId]
    );
    const versionNumber = Number(nextVersionResult.rows[0]?.next_version ?? 1);

    const [partsResult, bomResult, processResult, toolingResult, pricingResult] = await Promise.all([
      client.query(`SELECT * FROM estimating_rfq_parts WHERE rfq_id = $1 ORDER BY line_number`, [rfqId]),
      client.query(`SELECT * FROM estimating_bom_lines WHERE rfq_id = $1 ORDER BY created_at`, [rfqId]),
      client.query(`SELECT * FROM estimating_process_rows WHERE rfq_id = $1 ORDER BY created_at`, [rfqId]),
      client.query(`SELECT * FROM estimating_tooling WHERE rfq_id = $1 ORDER BY created_at`, [rfqId]),
      client.query(`SELECT * FROM estimating_pricing_snapshots WHERE rfq_id = $1 ORDER BY calculated_at`, [rfqId]),
    ]);

    const pricingRows = pricingResult.rows;
    const marginSummary = {
      minMarginPercent: pricingRows.length ? Math.min(...pricingRows.map((row) => Number(row.margin_percent || 0))) : null,
      maxMarginPercent: pricingRows.length ? Math.max(...pricingRows.map((row) => Number(row.margin_percent || 0))) : null,
      totalExtendedPrice: pricingRows.reduce((sum, row) => sum + Number(row.extended_price || 0), 0),
    };
    const pricingSnapshot = {
      rfq,
      parts: partsResult.rows,
      bomLines: bomResult.rows,
      processRows: processResult.rows,
      tooling: toolingResult.rows,
      pricingSnapshots: pricingRows,
    };

    const versionResult = await client.query(
      `INSERT INTO estimate_versions
        (rfq_id, version_number, created_by, change_summary, status, margin_summary, pricing_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING *`,
      [
        rfqId,
        versionNumber,
        body.createdBy ?? null,
        body.changeSummary ?? null,
        body.status,
        JSON.stringify(marginSummary),
        JSON.stringify(pricingSnapshot),
      ]
    );
    const version = versionResult.rows[0];

    await client.query(
      `UPDATE estimate_versions
       SET superseded_by = $2
       WHERE rfq_id = $1 AND id <> $2 AND superseded_by IS NULL`,
      [rfqId, version.id]
    );

    const lineValues = [
      ...bomResult.rows.map((row) => ({
        rfqPartId: row.rfq_part_id,
        sourceTable: 'estimating_bom_lines',
        sourceId: row.id,
        lineNumber: null,
        lineCategory: 'MATERIAL',
        lineSummary: row.description,
        quantity: row.quantity_per_part,
        unitCost: row.estimated_unit_cost,
        totalCost: Number(row.quantity_per_part || 0) * Number(row.estimated_unit_cost || 0),
        marginPercent: null,
        sellPrice: null,
        sourcePayload: row,
      })),
      ...processResult.rows.map((row) => ({
        rfqPartId: row.rfq_part_id,
        sourceTable: 'estimating_process_rows',
        sourceId: row.id,
        lineNumber: null,
        lineCategory: 'LABOR',
        lineSummary: row.department_name,
        quantity: Number(row.setup_hours || 0) + Number(row.hours_per_part || 0),
        unitCost: row.hourly_rate,
        totalCost: (Number(row.setup_hours || 0) + Number(row.hours_per_part || 0)) * Number(row.hourly_rate || 0),
        marginPercent: null,
        sellPrice: null,
        sourcePayload: row,
      })),
      ...toolingResult.rows.map((row) => ({
        rfqPartId: null,
        sourceTable: 'estimating_tooling',
        sourceId: row.id,
        lineNumber: null,
        lineCategory: 'TOOLING',
        lineSummary: row.description,
        quantity: row.quantity,
        unitCost: row.unit_cost,
        totalCost: row.total_cost,
        marginPercent: null,
        sellPrice: null,
        sourcePayload: row,
      })),
      ...pricingRows.map((row) => ({
        rfqPartId: row.rfq_part_id,
        sourceTable: 'estimating_pricing_snapshots',
        sourceId: row.id,
        lineNumber: null,
        lineCategory: 'PRICE',
        lineSummary: row.quantity_break_id,
        quantity: null,
        unitCost: row.total_cost_per_part,
        totalCost: row.extended_price,
        marginPercent: row.margin_percent,
        sellPrice: row.sell_price_per_part,
        sourcePayload: row,
      })),
    ];

    for (const line of lineValues) {
      await client.query(
        `INSERT INTO estimate_line_versions
          (estimate_version_id, rfq_part_id, source_table, source_id, line_number, line_category, line_summary,
           quantity, unit_cost, total_cost, margin_percent, sell_price, source_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          version.id,
          line.rfqPartId,
          line.sourceTable,
          line.sourceId,
          line.lineNumber,
          line.lineCategory,
          line.lineSummary,
          line.quantity,
          line.unitCost,
          line.totalCost,
          line.marginPercent,
          line.sellPrice,
          JSON.stringify(line.sourcePayload),
        ]
      );
    }

    await client.query('COMMIT');
    await recordAuditEvent({
      eventType: 'ESTIMATE_VERSION_CREATED',
      subjectType: 'estimate_version',
      subjectId: version.id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        rfqId,
        versionNumber,
        lineCount: lineValues.length,
        status: body.status,
        marginSummary: marginSummary as any,
      },
      reason: body.changeSummary ?? 'Estimate version created',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json({ ...version, lineCount: lineValues.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/rfqs/:id/assumptions', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM estimate_assumptions WHERE rfq_id = $1 ORDER BY assumption_type, created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/assumptions', async (req, res) => {
  try {
    const data = assumptionSchema.parse(req.body);
    const rows = await pool.query(
      `INSERT INTO estimate_assumptions
        (rfq_id, rfq_part_id, assumption_type, assumption_text, numeric_value, uom, confidence_level, source_reference, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.id,
        data.rfqPartId ?? null,
        data.assumptionType,
        data.assumptionText,
        data.numericValue ?? null,
        data.uom ?? null,
        data.confidenceLevel,
        data.sourceReference ?? null,
        data.createdBy ?? null,
      ]
    );
    await recordAuditEvent({
      eventType: 'ESTIMATE_ASSUMPTION_CREATED',
      subjectType: 'estimate_assumption',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        rfqId: req.params.id,
        rfqPartId: data.rfqPartId ?? null,
        assumptionType: data.assumptionType,
        confidenceLevel: data.confidenceLevel,
      },
      reason: data.assumptionText,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.get('/rfqs/:id/approvals', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM estimating_approvals WHERE rfq_id = $1 ORDER BY requested_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/approvals', async (req, res) => {
  try {
    const data = approvalSchema.parse(req.body);
    const signedAt = data.approvalStatus === 'APPROVED' ? new Date() : null;
    const rows = await pool.query(
      `INSERT INTO estimating_approvals
        (rfq_id, estimate_version_id, approval_role, approval_status, approval_threshold, signer_user_id,
         signer_display_name, digital_signature, approval_comments, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (rfq_id, approval_role) DO UPDATE SET
         estimate_version_id = EXCLUDED.estimate_version_id,
         approval_status = EXCLUDED.approval_status,
         approval_threshold = EXCLUDED.approval_threshold,
         signer_user_id = EXCLUDED.signer_user_id,
         signer_display_name = EXCLUDED.signer_display_name,
         digital_signature = EXCLUDED.digital_signature,
         approval_comments = EXCLUDED.approval_comments,
         signed_at = EXCLUDED.signed_at,
         updated_at = NOW()
       RETURNING *`,
      [
        req.params.id,
        data.estimateVersionId ?? null,
        data.approvalRole,
        data.approvalStatus,
        data.approvalThreshold ?? null,
        data.signerUserId ?? null,
        data.signerDisplayName ?? null,
        data.digitalSignature ?? null,
        data.approvalComments ?? null,
        signedAt,
      ]
    );
    await recordAuditEvent({
      eventType: data.approvalStatus === 'APPROVED'
        ? 'ESTIMATING_APPROVAL_APPROVED'
        : data.approvalStatus === 'REJECTED'
          ? 'ESTIMATING_APPROVAL_REJECTED'
          : 'ESTIMATING_APPROVAL_UPDATED',
      subjectType: 'estimating_approval',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        rfqId: req.params.id,
        estimateVersionId: data.estimateVersionId ?? null,
        approvalRole: data.approvalRole,
        approvalStatus: data.approvalStatus,
        signerUserId: data.signerUserId ?? null,
        signerDisplayName: data.signerDisplayName ?? null,
      },
      reason: data.approvalComments ?? null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/approval-readiness', async (req, res) => {
  try {
    const readiness = await getEstimatingReleaseReadiness(req.params.id, {
      requiresExecutiveApproval: Boolean(req.body?.requiresExecutiveApproval),
    });
    res.json(readiness);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rfqs/:id/risk-assessments', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT ra.*,
        COALESCE(json_agg(ri.* ORDER BY ri.created_at) FILTER (WHERE ri.id IS NOT NULL), '[]') AS risk_items
       FROM risk_assessments ra
       LEFT JOIN risk_items ri ON ri.risk_assessment_id = ra.id
       WHERE ra.rfq_id = $1
       GROUP BY ra.id
       ORDER BY ra.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfqs/:id/risk-assessments', async (req, res) => {
  try {
    const data = riskAssessmentSchema.parse(req.body);
    const rows = await pool.query(
      `INSERT INTO risk_assessments (rfq_id, estimate_version_id, status, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, data.estimateVersionId ?? null, data.status, data.createdBy ?? null]
    );
    await recordAuditEvent({
      eventType: 'ESTIMATING_RISK_ASSESSMENT_CREATED',
      subjectType: 'risk_assessment',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        rfqId: req.params.id,
        estimateVersionId: data.estimateVersionId ?? null,
        status: data.status,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/risk-assessments/:id/status', async (req, res) => {
  try {
    const data = riskAssessmentStatusSchema.parse(req.body);
    const rows = await pool.query(
      `UPDATE risk_assessments
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, data.status]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Risk assessment not found' });
    await recordAuditEvent({
      eventType: 'ESTIMATING_RISK_ASSESSMENT_STATUS_CHANGED',
      subjectType: 'risk_assessment',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        rfqId: rows[0].rfq_id,
        status: data.status,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.post('/risk-assessments/:id/items', async (req, res) => {
  try {
    const data = riskItemSchema.parse(req.body);
    const score = data.severity * data.probability;
    const rows = await pool.query(
      `INSERT INTO risk_items
        (risk_assessment_id, category, description, severity, probability, score, owner_user_id,
         owner_display_name, status, requires_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.params.id,
        data.category,
        data.description,
        data.severity,
        data.probability,
        score,
        data.ownerUserId ?? null,
        data.ownerDisplayName ?? null,
        data.status,
        data.requiresApproval,
      ]
    );
    const assessment = await refreshRiskAssessmentScore(req.params.id);
    await recordAuditEvent({
      eventType: 'ESTIMATING_RISK_ITEM_CREATED',
      subjectType: 'risk_item',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        riskAssessmentId: req.params.id,
        category: data.category,
        severity: data.severity,
        probability: data.probability,
        score,
        requiresApproval: data.requiresApproval,
        assessment: assessment as any,
      },
      reason: data.description,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json({ riskItem: rows[0], assessment });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/risk-items/:id', async (req, res) => {
  try {
    const data = riskItemUpdateSchema.parse(req.body);
    const currentRows = await pool.query(`SELECT * FROM risk_items WHERE id = $1`, [req.params.id]);
    const current = currentRows[0];
    if (!current) return res.status(404).json({ error: 'Risk item not found' });

    const rows = await pool.query(
      `UPDATE risk_items
       SET status = COALESCE($2, status),
           requires_approval = COALESCE($3, requires_approval),
           owner_user_id = COALESCE($4, owner_user_id),
           owner_display_name = COALESCE($5, owner_display_name),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        data.status ?? null,
        data.requiresApproval ?? null,
        data.ownerUserId ?? null,
        data.ownerDisplayName ?? null,
      ]
    );
    const assessment = await refreshRiskAssessmentScore(current.risk_assessment_id);
    await recordAuditEvent({
      eventType: 'ESTIMATING_RISK_ITEM_UPDATED',
      subjectType: 'risk_item',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        riskAssessmentId: current.risk_assessment_id,
        before: current as any,
        after: rows[0] as any,
        assessment: assessment as any,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json({ riskItem: rows[0], assessment });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.post('/risk-items/:id/mitigations', async (req, res) => {
  try {
    const data = mitigationActionSchema.parse(req.body);
    const rows = await pool.query(
      `INSERT INTO mitigation_actions
        (risk_item_id, action_description, assigned_to_user_id, assigned_to_display_name,
         due_date, status, completed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id,
        data.actionDescription,
        data.assignedToUserId ?? null,
        data.assignedToDisplayName ?? null,
        data.dueDate ?? null,
        data.status,
        data.completedAt ?? null,
        data.createdBy ?? null,
      ]
    );
    await recordAuditEvent({
      eventType: data.status === 'CLOSED' || data.completedAt
        ? 'ESTIMATING_MITIGATION_CLOSED'
        : 'ESTIMATING_MITIGATION_CREATED',
      subjectType: 'mitigation_action',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        riskItemId: req.params.id,
        status: data.status,
        assignedToUserId: data.assignedToUserId ?? null,
        assignedToDisplayName: data.assignedToDisplayName ?? null,
        dueDate: data.dueDate ? data.dueDate.toISOString() : null,
        completedAt: data.completedAt ? data.completedAt.toISOString() : null,
      },
      reason: data.actionDescription,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/mitigations/:id', async (req, res) => {
  try {
    const data = mitigationUpdateSchema.parse(req.body);
    const currentRows = await pool.query(`SELECT * FROM mitigation_actions WHERE id = $1`, [req.params.id]);
    const current = currentRows[0];
    if (!current) return res.status(404).json({ error: 'Mitigation action not found' });

    const rows = await pool.query(
      `UPDATE mitigation_actions
       SET status = COALESCE($2, status),
           completed_at = COALESCE($3, completed_at),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, data.status ?? null, data.completedAt ?? null]
    );
    await recordAuditEvent({
      eventType: rows[0].status === 'CLOSED' || rows[0].completed_at
        ? 'ESTIMATING_MITIGATION_CLOSED'
        : 'ESTIMATING_MITIGATION_UPDATED',
      subjectType: 'mitigation_action',
      subjectId: rows[0].id,
      sourceService: 'estimating.routes',
      actor: getActor(req),
      payload: {
        riskItemId: current.risk_item_id,
        before: current as any,
        after: rows[0] as any,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json(rows[0]);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
