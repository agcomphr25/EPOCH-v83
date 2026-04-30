import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { storage } from '../../storage';
import { DEFAULT_ESTIMATING_RFQS_LIMIT, MAX_ESTIMATING_RFQS_LIMIT } from '../constants/estimating';
import {
  insertEstimatingRfqSchema,
  insertEstimatingRfqPartSchema,
  insertEstimatingToolingSchema,
} from '../../schema';

const router = Router();

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
    const data = insertEstimatingRfqSchema.parse(req.body);
    const rfq = await storage.createEstimatingRfq(data);
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

    res.json({ quoteId: quote.id, quoteNumber: quote.quoteNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
