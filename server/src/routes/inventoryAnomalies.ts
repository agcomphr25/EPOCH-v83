/**
 * Inventory Anomaly Detection routes — Task #146
 */

import { Router, type Request, type Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import {
  acknowledgeAnomaly,
  assignAnomaly,
  DETECTORS,
  dismissAnomaly,
  escalateAnomaly,
  getAnomalyById,
  listAnomalies,
  loadAllDetectorConfigs,
  runAnomalyDetectionJob,
  updateDetectorConfig,
} from '../services/inventoryAnomalyDetectionService';
import { db } from '../../db';
import { inventoryTransactionLedger } from '../../schema';
import { inArray } from 'drizzle-orm';

const router = Router();

router.use(requireAdminOrOwner);

function actor(req: Request) {
  const u = (req.user ?? {}) as { id?: number; username?: string };
  return { userId: u.id ?? null, displayName: u.username ?? null };
}

router.get('/detectors', async (_req, res) => {
  try {
    const configs = await loadAllDetectorConfigs();
    res.json(
      DETECTORS.map((d) => {
        const cfg = configs.find((c) => c.detectorKey === d.key);
        return {
          key: d.key,
          description: d.description,
          defaultSeverity: d.defaultSeverity,
          defaultConfig: d.defaultConfig,
          enabled: cfg?.enabled ?? d.defaultEnabled,
          config: cfg?.config ?? d.defaultConfig,
          notificationRecipientUserIds: cfg?.notificationRecipientUserIds ?? [],
          notifyOnHigh: cfg?.notifyOnHigh ?? true,
          updatedAt: cfg?.updatedAt ?? null,
          updatedByDisplayName: cfg?.updatedByDisplayName ?? null,
        };
      }),
    );
  } catch (err: any) {
    console.error('[anomaly] list detectors failed', err);
    res.status(500).json({ error: err?.message ?? 'failed' });
  }
});

router.patch('/detectors/:key', async (req: Request, res: Response) => {
  try {
    const updated = await updateDetectorConfig(
      req.params.key,
      {
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
        config: req.body?.config && typeof req.body.config === 'object' ? req.body.config : undefined,
        notificationRecipientUserIds: Array.isArray(req.body?.notificationRecipientUserIds)
          ? req.body.notificationRecipientUserIds.filter((n: unknown) => Number.isInteger(n))
          : undefined,
        notifyOnHigh:
          typeof req.body?.notifyOnHigh === 'boolean' ? req.body.notifyOnHigh : undefined,
      },
      actor(req),
    );
    res.json(updated);
  } catch (err: any) {
    console.error('[anomaly] update detector failed', err);
    res.status(400).json({ error: err?.message ?? 'failed' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await listAnomalies({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      detectorKey: typeof req.query.detectorKey === 'string' ? req.query.detectorKey : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });
    res.json(rows);
  } catch (err: any) {
    console.error('[anomaly] list failed', err);
    res.status(500).json({ error: err?.message ?? 'failed' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await getAnomalyById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    let ledgerEntries: unknown[] = [];
    if (row.ledgerEntryIds && row.ledgerEntryIds.length > 0) {
      ledgerEntries = await db
        .select()
        .from(inventoryTransactionLedger)
        .where(inArray(inventoryTransactionLedger.id, row.ledgerEntryIds));
    }
    res.json({ ...row, ledgerEntries });
  } catch (err: any) {
    console.error('[anomaly] get failed', err);
    res.status(500).json({ error: err?.message ?? 'failed' });
  }
});

router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const note = String(req.body?.note ?? '').trim();
    if (!note) return res.status(400).json({ error: 'note required' });
    res.json(await acknowledgeAnomaly(req.params.id, actor(req), note));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'failed' });
  }
});

router.post('/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return res.status(400).json({ error: 'reason required' });
    res.json(await dismissAnomaly(req.params.id, actor(req), reason));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'failed' });
  }
});

router.post('/:id/escalate', async (req: Request, res: Response) => {
  try {
    const note = String(req.body?.note ?? '').trim();
    if (!note) return res.status(400).json({ error: 'note required' });
    res.json(await escalateAnomaly(req.params.id, actor(req), note));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'failed' });
  }
});

router.post('/:id/assign', async (req: Request, res: Response) => {
  try {
    const userId = Number.isInteger(req.body?.userId) ? req.body.userId : null;
    const displayName = req.body?.displayName ? String(req.body.displayName) : null;
    res.json(await assignAnomaly(req.params.id, { userId, displayName }));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'failed' });
  }
});

router.post('/run', async (req: Request, res: Response) => {
  try {
    const windowHours =
      typeof req.body?.windowHours === 'number' ? req.body.windowHours : undefined;
    res.json(await runAnomalyDetectionJob({ windowHours }));
  } catch (err: any) {
    console.error('[anomaly] manual run failed', err);
    res.status(500).json({ error: err?.message ?? 'failed' });
  }
});

export default router;
