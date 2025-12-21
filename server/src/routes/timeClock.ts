import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { apiIntegrationKeys, epochExternalEvents } from '../../schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const VALID_EVENT_TYPES = [
  'TIME_PUNCH_IN',
  'TIME_PUNCH_OUT',
  'TIME_JOB_SWITCH',
  'TIME_PUNCH_EDITED',
  'TIME_BREAK_START',
  'TIME_BREAK_END',
];

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = crypto.createHash('sha256').update('dummy').digest('hex');
    crypto.timingSafeEqual(Buffer.from(dummy), Buffer.from(dummy));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function validateApiKey(
  authHeader: string | undefined,
  tenantId: string,
  sourceSystem: string,
  requiredPermission: string
): Promise<{ valid: boolean; error?: string; keyId?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 32) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const keyPrefix = token.slice(0, 8);
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');

  const [integration] = await db
    .select()
    .from(apiIntegrationKeys)
    .where(
      and(
        eq(apiIntegrationKeys.keyPrefix, keyPrefix),
        eq(apiIntegrationKeys.tenantId, tenantId),
        eq(apiIntegrationKeys.sourceSystem, sourceSystem),
        eq(apiIntegrationKeys.active, true)
      )
    )
    .limit(1);

  if (!integration) {
    return { valid: false, error: 'API key not found or inactive' };
  }

  if (integration.revokedAt) {
    return { valid: false, error: 'API key has been revoked' };
  }

  if (!timingSafeCompare(keyHash, integration.keyHash)) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (!integration.permissions.includes(requiredPermission)) {
    return { valid: false, error: `Missing required permission: ${requiredPermission}` };
  }

  await db.update(apiIntegrationKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiIntegrationKeys.id, integration.id));

  return { valid: true, keyId: integration.id };
}

export function registerTimeClockRoutes(app: Express) {
  app.post('/api/connectors/time-clock/events', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const sourceSystem = req.headers['x-source-system'] as string;
      const schemaVersion = parseInt(req.headers['x-event-schema-version'] as string, 10) || 1;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Missing required header',
          details: 'X-Tenant-Id header is required',
        });
      }

      if (sourceSystem !== 'time_clock') {
        return res.status(400).json({
          error: 'Invalid source system',
          details: 'X-Source-System must be "time_clock"',
        });
      }

      const authResult = await validateApiKey(authHeader, tenantId, 'time_clock', 'emit:labor_events');
      if (!authResult.valid) {
        const statusCode = authResult.error?.includes('permission') ? 403 : 401;
        return res.status(statusCode).json({
          error: 'Authentication failed',
          details: authResult.error,
        });
      }

      const payload = req.body;

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'Request body must be a valid JSON object',
        });
      }

      const eventType = payload.eventType || payload.event_type;
      const occurredAt = payload.occurredAt || payload.occurred_at || payload.timestamp;
      const eventId = payload.eventId || payload.event_id || payload.id;
      const deduplicationKey = payload.deduplicationKey || payload.deduplication_key || 
        (eventId ? `${tenantId}:${sourceSystem}:${eventId}` : null);

      if (!eventType) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'eventType is required',
        });
      }

      if (!VALID_EVENT_TYPES.includes(eventType)) {
        console.log(`[TimeClock] Warning: Unknown event type "${eventType}" - accepting anyway`);
      }

      if (!occurredAt) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'occurredAt timestamp is required',
        });
      }

      const occurredAtDate = new Date(occurredAt);
      if (isNaN(occurredAtDate.getTime())) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'occurredAt must be a valid timestamp',
        });
      }

      if (deduplicationKey) {
        const [existing] = await db
          .select({ id: epochExternalEvents.id })
          .from(epochExternalEvents)
          .where(eq(epochExternalEvents.deduplicationKey, deduplicationKey))
          .limit(1);

        if (existing) {
          console.log(`[TimeClock] Duplicate event ignored: ${deduplicationKey}`);
          return res.status(202).json({
            status: 'accepted',
            message: 'Event already recorded (idempotent)',
            eventId: existing.id,
            duplicate: true,
          });
        }
      }

      const [inserted] = await db.insert(epochExternalEvents).values({
        tenantId,
        sourceSystem: 'time_clock',
        eventType,
        eventId,
        occurredAt: occurredAtDate,
        payload,
        schemaVersion,
        deduplicationKey,
      }).returning({ id: epochExternalEvents.id });

      console.log(`[TimeClock] Event recorded: ${eventType} (id: ${inserted.id}, tenant: ${tenantId})`);

      return res.status(202).json({
        status: 'accepted',
        message: 'Event recorded successfully',
        eventId: inserted.id,
      });
    } catch (error) {
      console.error('[TimeClock] Error processing event:', error);
      return res.status(500).json({
        error: 'Internal server error',
        details: 'Failed to process event',
      });
    }
  });

  app.post('/api/integrations/time-clock/keys', async (req: Request, res: Response) => {
    try {
      const { tenantId, label } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = rawKey.slice(0, 8);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const username = (req as any).user?.username || 'system';

      const [created] = await db.insert(apiIntegrationKeys).values({
        tenantId,
        sourceSystem: 'time_clock',
        keyHash,
        keyPrefix,
        permissions: ['emit:labor_events'],
        label: label || `Time Clock Integration - ${tenantId}`,
        createdBy: username,
      }).returning();

      console.log(`[TimeClock] Created API key for tenant: ${tenantId} (prefix: ${keyPrefix})`);

      return res.status(201).json({
        id: created.id,
        tenantId: created.tenantId,
        keyPrefix: created.keyPrefix,
        label: created.label,
        permissions: created.permissions,
        apiKey: rawKey,
        warning: 'Store this API key securely. It will not be shown again.',
      });
    } catch (error) {
      console.error('[TimeClock] Error creating API key:', error);
      return res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.get('/api/integrations/time-clock/keys', async (req: Request, res: Response) => {
    try {
      const keys = await db
        .select({
          id: apiIntegrationKeys.id,
          tenantId: apiIntegrationKeys.tenantId,
          keyPrefix: apiIntegrationKeys.keyPrefix,
          label: apiIntegrationKeys.label,
          permissions: apiIntegrationKeys.permissions,
          active: apiIntegrationKeys.active,
          createdAt: apiIntegrationKeys.createdAt,
          createdBy: apiIntegrationKeys.createdBy,
          lastUsedAt: apiIntegrationKeys.lastUsedAt,
          revokedAt: apiIntegrationKeys.revokedAt,
        })
        .from(apiIntegrationKeys)
        .where(eq(apiIntegrationKeys.sourceSystem, 'time_clock'));

      return res.json(keys);
    } catch (error) {
      console.error('[TimeClock] Error fetching API keys:', error);
      return res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  });

  app.delete('/api/integrations/time-clock/keys/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(apiIntegrationKeys)
        .set({ revokedAt: new Date(), active: false })
        .where(eq(apiIntegrationKeys.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'API key not found' });
      }

      console.log(`[TimeClock] Revoked API key: ${id} (tenant: ${updated.tenantId})`);

      return res.json({ success: true, revokedAt: updated.revokedAt });
    } catch (error) {
      console.error('[TimeClock] Error revoking API key:', error);
      return res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });
}
