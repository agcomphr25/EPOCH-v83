/**
 * Unified Audit Ledger routes — Task #85
 *
 * Mounted under /api/audit-ledger.
 *
 * - GET  /report                  Filter / search the unified ledger.
 * - GET  /export.csv              Stream filtered ledger as CSV (with checksum manifest).
 * - GET  /templates               List saved DCAA / CMMC report templates.
 * - GET  /report/:templateKey     Run a saved template (?fromDate=&toDate=).
 * - POST /verify                  Re-walk the chain (segment) and report integrity.
 * - GET  /anchors                 List recent chain-head anchors.
 * - POST /anchors                 Write a new anchor (admin only).
 * - GET  /retention               List retention policies.
 *
 * All write endpoints require ADMIN/OWNER. Read endpoints require auth.
 */

import { Router, type Request, type Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import {
  queryAuditEvents,
  exportAuditEventsCsv,
  SAVED_TEMPLATES,
  type ReportFilters,
} from '../services/auditReportingService';
import {
  verifyChainSegment,
  writeAnchor,
  listAnchors,
  getRetentionPolicies,
} from '../services/auditLedgerService';

const router = Router();

// Audit evidence is sensitive compliance material. Every endpoint —
// reads, exports, and the verifier — is restricted to ADMIN/OWNER, matching
// /admin/audit-ledger UI permissions and `docs/audit-evidence-policy.md`.
// `requireAdminOrOwner` already includes `authenticateToken` first.
router.use(requireAdminOrOwner);

function parseFilters(req: Request): ReportFilters {
  const q = req.query;
  return {
    eventTypes: typeof q.eventTypes === 'string'
      ? q.eventTypes.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    subjectType: typeof q.subjectType === 'string' ? q.subjectType : undefined,
    subjectId: typeof q.subjectId === 'string' ? q.subjectId : undefined,
    actorId: typeof q.actorId === 'string' && q.actorId ? Number(q.actorId) : undefined,
    actorName: typeof q.actorName === 'string' ? q.actorName : undefined,
    sourceService: typeof q.sourceService === 'string' ? q.sourceService : undefined,
    fromDate: typeof q.fromDate === 'string' ? new Date(q.fromDate) : undefined,
    toDate: typeof q.toDate === 'string' ? new Date(q.toDate) : undefined,
    limit: typeof q.limit === 'string' ? Number(q.limit) : undefined,
    offset: typeof q.offset === 'string' ? Number(q.offset) : undefined,
  };
}

router.get('/report', async (req: Request, res: Response) => {
  try {
    const result = await queryAuditEvents(parseFilters(req));
    res.json(result);
  } catch (err) {
    console.error('[audit-ledger] /report failed', err);
    res.status(500).json({ error: 'Failed to query audit ledger' });
  }
});

router.get('/export.csv', async (req: Request, res: Response) => {
  try {
    const result = await exportAuditEventsCsv(parseFilters(req));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-ledger-${ts}.csv"`);
    res.setHeader('X-Audit-Sha256', result.manifest.sha256);
    res.setHeader('X-Audit-Row-Count', String(result.manifest.rowCount));
    res.setHeader('X-Audit-Manifest', Buffer.from(JSON.stringify(result.manifest)).toString('base64'));
    res.send(result.csv);
  } catch (err) {
    console.error('[audit-ledger] /export.csv failed', err);
    res.status(500).json({ error: 'Failed to export audit ledger' });
  }
});

router.get('/templates', (_req, res) => {
  res.json(
    SAVED_TEMPLATES.map((t) => ({
      key: t.key,
      title: t.title,
      description: t.description,
      framework: t.framework,
    })),
  );
});

router.get('/report/:templateKey', async (req: Request, res: Response) => {
  try {
    const tpl = SAVED_TEMPLATES.find((t) => t.key === req.params.templateKey);
    if (!tpl) return res.status(404).json({ error: 'Unknown template' });
    const fromDate = typeof req.query.fromDate === 'string' ? new Date(req.query.fromDate) : undefined;
    const toDate = typeof req.query.toDate === 'string' ? new Date(req.query.toDate) : undefined;
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    const filters = tpl.build({ fromDate, toDate, subjectId });
    const result = await queryAuditEvents({
      ...filters,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
    });
    res.json({ template: { key: tpl.key, title: tpl.title }, filters, ...result });
  } catch (err) {
    console.error('[audit-ledger] template report failed', err);
    res.status(500).json({ error: 'Failed to run template report' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { fromSequence, toSequence, pageSize } = req.body ?? {};
    const result = await verifyChainSegment(
      typeof fromSequence === 'number' ? fromSequence : undefined,
      typeof toSequence === 'number' ? toSequence : undefined,
      typeof pageSize === 'number' ? pageSize : undefined,
    );
    res.json(result);
  } catch (err) {
    console.error('[audit-ledger] /verify failed', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.get('/anchors', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    res.json(await listAnchors(limit));
  } catch (err) {
    console.error('[audit-ledger] /anchors failed', err);
    res.status(500).json({ error: 'Failed to list anchors' });
  }
});

router.post('/anchors', async (req: Request, res: Response) => {
  try {
    const anchor = await writeAnchor({
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
      createdBy: req.user?.username ?? 'unknown',
    });
    res.status(201).json(anchor);
  } catch (err) {
    console.error('[audit-ledger] write anchor failed', err);
    res.status(500).json({ error: 'Failed to write anchor' });
  }
});

router.get('/retention', async (_req, res) => {
  try {
    res.json(await getRetentionPolicies());
  } catch (err) {
    console.error('[audit-ledger] /retention failed', err);
    res.status(500).json({ error: 'Failed to fetch retention policies' });
  }
});

export default router;
