import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

const processedKeys = new Set<string>();
const MAX_PROCESSED_KEYS = 10_000;

router.post('/replay-event', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { idempotencyKey, eventType, payload } = req.body;

    if (!idempotencyKey || !eventType || !payload) {
      return res.status(400).json({ error: 'Missing required fields: idempotencyKey, eventType, payload' });
    }

    if (processedKeys.has(idempotencyKey)) {
      console.info('[EPOCH OFFLINE] Duplicate replay skipped:', idempotencyKey);
      return res.status(200).json({ status: 'already_processed', idempotencyKey });
    }

    console.info(`[EPOCH OFFLINE] Replay event received: ${eventType} (${idempotencyKey})`);

    processedKeys.add(idempotencyKey);
    if (processedKeys.size > MAX_PROCESSED_KEYS) {
      const firstKey = processedKeys.values().next().value;
      if (firstKey) processedKeys.delete(firstKey);
    }

    return res.status(200).json({ status: 'accepted', idempotencyKey, eventType });
  } catch (error: any) {
    console.error('[EPOCH OFFLINE] Replay event error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
