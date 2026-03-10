import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

const processedKeys = new Set<string>();
const MAX_PROCESSED_KEYS = 10_000;

const ALLOWED_EVENT_TYPES = [
  'MOVE_ORDER',
  'COMPLETE_OPERATION',
  'QC_PASS',
  'SHIP_PACKAGE',
  'CLOCK_IN',
  'CLOCK_OUT',
];

function resolveInternalRoute(eventType: string, payload: any): { method: string; path: string; body: any } | null {
  switch (eventType) {
    case 'MOVE_ORDER':
      return {
        method: 'POST',
        path: `/api/orders/${payload.orderId}/progress`,
        body: { nextDepartment: payload.nextDepartment },
      };
    case 'COMPLETE_OPERATION':
      return {
        method: 'POST',
        path: `/api/travelers/${payload.travelerId}/tasks/${payload.taskId}/complete`,
        body: payload.data ?? {},
      };
    case 'QC_PASS':
      return {
        method: 'POST',
        path: `/api/orders/${payload.orderId}/progress`,
        body: { nextDepartment: payload.nextDepartment },
      };
    case 'SHIP_PACKAGE':
      return {
        method: 'POST',
        path: `/api/po-orders/progress-to-shipping`,
        body: { orderIds: payload.orderIds },
      };
    case 'CLOCK_IN':
      return {
        method: 'POST',
        path: '/api/timeclock',
        body: { employeeId: payload.employeeId, action: 'IN', timestamp: payload.timestamp },
      };
    case 'CLOCK_OUT':
      return {
        method: 'POST',
        path: '/api/timeclock',
        body: { employeeId: payload.employeeId, action: 'OUT', timestamp: payload.timestamp },
      };
    default:
      return null;
  }
}

router.post('/replay-event', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { idempotencyKey, eventType, payload } = req.body;

    if (!idempotencyKey || !eventType || !payload) {
      return res.status(400).json({ error: 'Missing required fields: idempotencyKey, eventType, payload' });
    }

    if (!ALLOWED_EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({ error: `Unknown event type: ${eventType}` });
    }

    if (processedKeys.has(idempotencyKey)) {
      console.info('[EPOCH OFFLINE] Duplicate replay skipped:', idempotencyKey);
      return res.status(200).json({ status: 'already_processed', idempotencyKey });
    }

    console.info(`[EPOCH OFFLINE] Replay event received: ${eventType} (${idempotencyKey})`);

    const route = resolveInternalRoute(eventType, payload);
    if (!route) {
      return res.status(400).json({ error: `Cannot resolve route for event type: ${eventType}` });
    }

    const app = req.app;
    const internalRes: any = await new Promise((resolve, reject) => {
      const mockReq: any = {
        method: route.method,
        url: route.path,
        path: route.path,
        body: route.body,
        headers: { ...req.headers, 'content-type': 'application/json' },
        params: {},
        query: {},
        get: (name: string) => req.get(name),
        user: (req as any).user,
        session: (req as any).session,
        cookies: req.cookies,
        app,
      };

      let statusCode = 200;
      let responseBody: any = null;

      const mockRes: any = {
        status: (code: number) => { statusCode = code; return mockRes; },
        json: (data: any) => { responseBody = data; resolve({ statusCode, body: responseBody ?? data }); return mockRes; },
        send: (data: any) => { resolve({ statusCode, body: data }); return mockRes; },
        end: () => { resolve({ statusCode, body: null }); return mockRes; },
        set: () => mockRes,
        header: () => mockRes,
        setHeader: () => mockRes,
        getHeader: () => undefined,
      };

      app.handle(mockReq, mockRes, (err: any) => {
        if (err) reject(err);
        else resolve({ statusCode: 404, body: { error: 'Route not found' } });
      });
    });

    if (internalRes.statusCode >= 200 && internalRes.statusCode < 300) {
      processedKeys.add(idempotencyKey);
      if (processedKeys.size > MAX_PROCESSED_KEYS) {
        const firstKey = processedKeys.values().next().value;
        if (firstKey) processedKeys.delete(firstKey);
      }
      console.info(`[EPOCH OFFLINE] Replay succeeded: ${eventType} (${idempotencyKey})`);
      return res.status(200).json({ status: 'replayed', idempotencyKey, eventType, result: internalRes.body });
    }

    console.warn(`[EPOCH OFFLINE] Replay failed (${internalRes.statusCode}): ${eventType} (${idempotencyKey})`);
    return res.status(internalRes.statusCode).json({ status: 'replay_failed', idempotencyKey, eventType, error: internalRes.body });
  } catch (error: any) {
    console.error('[EPOCH OFFLINE] Replay event error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
