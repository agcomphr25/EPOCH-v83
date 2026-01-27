import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const DEFAULT_EXPIRY_HOURS = 24;

export interface IdempotencyResult {
  isReplay: boolean;
  idempotencyKey: string | null;
  existingOrderId?: string;
  existingResponse?: {
    status: number;
    body: any;
  };
}

declare global {
  namespace Express {
    interface Request {
      idempotency?: IdempotencyResult;
    }
    interface Response {
      recordIdempotency?: (orderId: string) => Promise<void>;
    }
  }
}

export function logIdempotencyEvent(event: string, details: Record<string, any>) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    type: 'IDEMPOTENCY',
    event,
    ...details
  }));
}

export async function checkIdempotencyKey(
  idempotencyKey: string,
  endpoint: string
): Promise<{ exists: boolean; orderId?: string; responseStatus?: number; responseBody?: any }> {
  try {
    const result = await pool.query(
      `SELECT order_id, response_status, response_body 
       FROM idempotency_keys 
       WHERE idempotency_key = $1 AND endpoint = $2 AND expires_at > NOW()`,
      [idempotencyKey, endpoint]
    );

    if (result.rows.length > 0) {
      return {
        exists: true,
        orderId: result.rows[0].order_id,
        responseStatus: result.rows[0].response_status,
        responseBody: result.rows[0].response_body
      };
    }

    return { exists: false };
  } catch (error) {
    logIdempotencyEvent('CHECK_ERROR', { idempotencyKey, endpoint, error: String(error) });
    return { exists: false };
  }
}

export async function storeIdempotencyKey(
  idempotencyKey: string,
  endpoint: string,
  orderId: string,
  responseStatus: number,
  responseBody: any
): Promise<boolean> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);

    await pool.query(
      `INSERT INTO idempotency_keys (idempotency_key, endpoint, order_id, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         response_status = EXCLUDED.response_status,
         response_body = EXCLUDED.response_body,
         expires_at = EXCLUDED.expires_at`,
      [idempotencyKey, endpoint, orderId, responseStatus, JSON.stringify(responseBody), expiresAt]
    );

    logIdempotencyEvent('KEY_STORED', { idempotencyKey, endpoint, orderId });
    return true;
  } catch (error) {
    logIdempotencyEvent('STORE_ERROR', { idempotencyKey, endpoint, orderId, error: String(error) });
    return false;
  }
}

export async function cleanupExpiredKeys(): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM idempotency_keys WHERE expires_at < NOW() RETURNING id`
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      logIdempotencyEvent('CLEANUP', { deletedCount: count });
    }
    return count;
  } catch (error) {
    logIdempotencyEvent('CLEANUP_ERROR', { error: String(error) });
    return 0;
  }
}

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER] as string | undefined;
    const endpoint = `${req.method}:${req.path}`;

    if (!idempotencyKey) {
      req.idempotency = {
        isReplay: false,
        idempotencyKey: null
      };
      return next();
    }

    const existing = await checkIdempotencyKey(idempotencyKey, endpoint);

    if (existing.exists) {
      logIdempotencyEvent('REPLAY_DETECTED', {
        idempotencyKey,
        endpoint,
        existingOrderId: existing.orderId
      });

      req.idempotency = {
        isReplay: true,
        idempotencyKey,
        existingOrderId: existing.orderId,
        existingResponse: existing.responseStatus ? {
          status: existing.responseStatus,
          body: existing.responseBody
        } : undefined
      };

      if (existing.responseStatus && existing.responseBody) {
        return res.status(existing.responseStatus).json(existing.responseBody);
      }
    } else {
      req.idempotency = {
        isReplay: false,
        idempotencyKey
      };
    }

    res.recordIdempotency = async (orderId: string) => {
      if (idempotencyKey) {
        const responseBody = { orderId, success: true };
        await storeIdempotencyKey(idempotencyKey, endpoint, orderId, 200, responseBody);
      }
    };

    next();
  };
}

export function requireIdempotencyKey() {
  return (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER] as string | undefined;

    if (!idempotencyKey) {
      logIdempotencyEvent('MISSING_KEY', {
        endpoint: `${req.method}:${req.path}`,
        clientIp: req.ip
      });

      return res.status(400).json({
        error: 'Idempotency key required',
        message: 'This endpoint requires an x-idempotency-key header to prevent duplicate requests',
        code: 'IDEMPOTENCY_KEY_REQUIRED'
      });
    }

    next();
  };
}
