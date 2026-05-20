/**
 * Vendor Debarment Checks — Task #83
 * Records SAM.gov / debarment evidence (manual attestation or document upload today;
 * SAM.gov API integration is a separate task). Used by requisition approval and
 * vendor PO issuance to gate progression.
 */
import { Router, Request, Response } from 'express';
import { eq, and, desc, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  vendorDebarmentChecks,
  procurementSettings,
  insertVendorDebarmentCheckSchema,
  vendors,
} from '../../schema';
import { requirePermission } from '../../middleware/requirePermission';
import { auditService } from '../services/auditService';

const router = Router();

router.get('/vendor/:vendorId', requirePermission('purchasing.view_requisitions'), async (req: Request, res: Response) => {
  const vendorId = parseInt(req.params.vendorId);
  const rows = await db.select().from(vendorDebarmentChecks)
    .where(eq(vendorDebarmentChecks.vendorId, vendorId))
    .orderBy(desc(vendorDebarmentChecks.checkedAt))
    .limit(50);
  res.json(rows);
});

router.get('/vendor/:vendorId/freshness', requirePermission('purchasing.view_requisitions'), async (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  const [setting] = await db.select().from(procurementSettings).limit(1);
  const days = setting?.debarmentCheckFreshnessDays ?? 30;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const recent = await db.select().from(vendorDebarmentChecks).where(and(
    eq(vendorDebarmentChecks.vendorId, vendorId),
    gte(vendorDebarmentChecks.checkedAt, cutoff),
  )).orderBy(desc(vendorDebarmentChecks.checkedAt)).limit(1);
  const latest = recent[0];
  res.json({
    vendorId,
    freshnessDays: days,
    fresh: !!latest && latest.result === 'pass',
    latestCheck: latest ?? null,
  });
});

router.post('/', requirePermission('purchasing.record_debarment_check'), async (req: Request, res: Response) => {
  try {
    const parsed = insertVendorDebarmentCheckSchema.parse(req.body);
    const user = (req as any).user;
    const [row] = await db.insert(vendorDebarmentChecks).values({
      ...parsed,
      checkedByUserId: user?.id ?? parsed.checkedByUserId ?? null,
      checkedByDisplayName: user?.username ?? parsed.checkedByDisplayName ?? null,
    }).returning();
    await db.update(vendors).set({
      debarmentStatus: parsed.result === 'pass' ? 'clear' : parsed.result === 'fail' ? 'debarred' : 'unknown',
      debarmentCheckedAt: row.checkedAt,
      debarmentEvidenceUrl: parsed.evidenceUrl ?? null,
      debarmentNotes: parsed.notes ?? null,
      updatedAt: new Date(),
    }).where(eq(vendors.id, parsed.vendorId));
    await auditService.logEvent({
      entityType: 'vendor',
      entityId: String(parsed.vendorId),
      action: 'DEBARMENT_CHECK_RECORDED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { result: parsed.result, source: parsed.source, context: parsed.context },
    });
    res.status(201).json(row);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.errors });
    res.status(500).json({ error: err.message });
  }
});

export default router;
