/**
 * Material Traceability Viewer routes — Task #147 (Phase 3)
 *
 * Mounted at /api/traceability. All endpoints are READ-ONLY and gated by
 * the `inventory.traceability.view` capability (granted to Quality, Materials,
 * Compliance roles in migration 0112).
 *
 * Routes:
 *   GET  /api/traceability/search?key=&value=
 *   POST /api/traceability/verify
 *        body: { entryIds: string[], key?, value? }   ← preferred (operates
 *                                                       on displayed chain)
 *        body: { key, value }                          ← back-compat
 *   GET  /api/traceability/:key/:value/export?format=csv|pdf
 *   POST /api/traceability/:key/:value/export?format=csv|pdf
 *        body: { entryIds: string[] }                  ← exports the exact
 *                                                       displayed snapshot
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import {
  buildChainFromEntryIds,
  buildTraceabilityChain,
  exportChainCsv,
  exportChainPdf,
  verifyChain,
  verifyChainByIds,
  TRACEABILITY_SEARCH_KEYS,
  type TraceabilitySearchInput,
  type TraceabilitySearchKey,
} from '../services/traceabilityService';

const router = Router();

router.use(authenticateToken);
router.use(requirePermission('inventory.traceability.view'));

function isAllowedKey(key: unknown): key is TraceabilitySearchKey {
  return typeof key === 'string' && (TRACEABILITY_SEARCH_KEYS as readonly string[]).includes(key);
}

function parseFromQuery(req: Request): TraceabilitySearchInput | null {
  const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const value = typeof req.query.value === 'string' ? req.query.value.trim() : '';
  if (!key || !value || !isAllowedKey(key)) return null;
  return { key, value };
}

function parseFromParams(req: Request): TraceabilitySearchInput | null {
  const key = typeof req.params.key === 'string' ? req.params.key.trim() : '';
  const value = typeof req.params.value === 'string' ? req.params.value.trim() : '';
  if (!key || !value || !isAllowedKey(key)) return null;
  return { key, value };
}

function parseFromBody(req: Request): TraceabilitySearchInput | null {
  const body = req.body ?? {};
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (!key || !value || !isAllowedKey(key)) return null;
  return { key, value };
}

function parseEntryIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((s) => s.length > 0);
  return ids.length ? ids : null;
}

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = parseFromQuery(req);
    if (!q) {
      return res.status(400).json({
        error: 'Invalid search',
        detail: `key must be one of ${TRACEABILITY_SEARCH_KEYS.join(', ')} and value must be non-empty`,
      });
    }
    const chain = await buildTraceabilityChain(q);
    res.json(chain);
  } catch (err) {
    console.error('[traceability] /search failed', err);
    res.status(500).json({ error: 'Failed to build traceability chain' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    // PREFERRED: verify the displayed chain snapshot (entry IDs the user is
    // actually looking at), independent of any later edits to the search form.
    const entryIds = parseEntryIds(req.body?.entryIds);
    if (entryIds) {
      const verification = await verifyChainByIds(entryIds);
      return res.json(verification);
    }
    // Back-compat: rebuild from key/value when no IDs are provided.
    const q = parseFromBody(req) ?? parseFromQuery(req);
    if (!q) return res.status(400).json({ error: 'Invalid search — provide entryIds or key+value' });
    const chain = await buildTraceabilityChain(q);
    const verification = await verifyChain(chain);
    res.json(verification);
  } catch (err) {
    console.error('[traceability] /verify failed', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

async function handleExport(
  req: Request,
  res: Response,
  q: TraceabilitySearchInput,
  entryIds: string[] | null,
) {
  const format = String(req.query.format ?? 'csv').toLowerCase();
  const chain = entryIds
    ? await buildChainFromEntryIds(entryIds, q, `Snapshot of ${q.key}=${q.value}`)
    : await buildTraceabilityChain(q);

  const safeValue = q.value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'pdf') {
    const pdf = await exportChainPdf(chain);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="traceability-${q.key}-${safeValue}-${ts}.pdf"`,
    );
    res.setHeader('X-Trace-Sha256', pdf.sha256);
    res.setHeader('X-Trace-Row-Count', String(pdf.rowCount));
    return res.send(pdf.buffer);
  }

  const csv = exportChainCsv(chain);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="traceability-${q.key}-${safeValue}-${ts}.csv"`,
  );
  res.setHeader('X-Trace-Sha256', csv.manifest.sha256);
  res.setHeader('X-Trace-Row-Count', String(csv.manifest.rowCount));
  res.setHeader(
    'X-Trace-Manifest',
    Buffer.from(JSON.stringify(csv.manifest)).toString('base64'),
  );
  res.send(csv.csv);
}

router.get('/:key/:value/export', async (req: Request, res: Response) => {
  try {
    const q = parseFromParams(req);
    if (!q) {
      return res.status(400).json({
        error: 'Invalid search',
        detail: `key must be one of ${TRACEABILITY_SEARCH_KEYS.join(', ')}`,
      });
    }
    await handleExport(req, res, q, null);
  } catch (err) {
    console.error('[traceability] GET /export failed', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post('/:key/:value/export', async (req: Request, res: Response) => {
  try {
    const q = parseFromParams(req);
    if (!q) return res.status(400).json({ error: 'Invalid search' });
    const entryIds = parseEntryIds(req.body?.entryIds);
    await handleExport(req, res, q, entryIds);
  } catch (err) {
    console.error('[traceability] POST /export failed', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
