import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { apiIntegrationKeys, epochExternalEvents, epochLaborFacts } from '../../schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { 
  getConnectorHealth, 
  listConnectorHealthByTenant, 
  getConnectorHealthHistory,
  startConnectorHealthEvaluator 
} from '../services/connectorHealthService';
import { resolveTravelerBarcode } from '../helpers/travelerBarcodeResolver';
import { storage } from '../../storage';

const VALID_EVENT_TYPES = [
  'TIME_PUNCH_IN',
  'TIME_PUNCH_OUT',
  'TIME_JOB_SWITCH',
  'TIME_PUNCH_EDITED',
  'TIME_BREAK_START',
  'TIME_BREAK_END',
];

// Project Time Clock event into labor fact (read-only traceability)
// This is append-only - never updates or deletes existing facts
async function projectToLaborFact(
  sourceEventId: string,
  tenantId: string,
  eventType: string,
  occurredAt: Date,
  payload: Record<string, any>
): Promise<void> {
  try {
    // Extract labor-relevant fields from payload
    const employeeId = payload.employeeId || payload.employee_id || payload.userId || payload.user_id;
    const employeeDisplayName = payload.employeeDisplayName || payload.employee_display_name || 
                                 payload.employeeName || payload.employee_name || payload.name;
    const role = payload.role || payload.position || payload.jobTitle || payload.job_title;
    const siteId = payload.siteId || payload.site_id || payload.locationId || payload.location_id;
    const jobId = payload.jobId || payload.job_id || payload.orderId || payload.order_id;
    const shiftDurationMinutes = payload.shiftDurationMinutes || payload.shift_duration_minutes ||
                                  payload.durationMinutes || payload.duration_minutes;
    const dayTotalMinutes = payload.dayTotalMinutes || payload.day_total_minutes ||
                             payload.totalMinutes || payload.total_minutes;

    if (!employeeId) {
      console.log(`[LaborFacts] Skipping projection - no employeeId in payload for event ${sourceEventId}`);
      return;
    }

    await db.insert(epochLaborFacts).values({
      tenantId,
      sourceEventId,
      sourceSystem: 'time_clock',
      eventType,
      occurredAt,
      employeeId: String(employeeId),
      employeeDisplayName: employeeDisplayName ? String(employeeDisplayName) : null,
      role: role ? String(role) : null,
      siteId: siteId ? String(siteId) : null,
      jobId: jobId ? String(jobId) : null,
      shiftDurationMinutes: shiftDurationMinutes ? parseInt(String(shiftDurationMinutes), 10) : null,
      dayTotalMinutes: dayTotalMinutes ? parseInt(String(dayTotalMinutes), 10) : null,
      payload,
    });

    console.log(`[LaborFacts] Projected event ${sourceEventId} -> labor fact (employee: ${employeeId})`);
  } catch (error) {
    // Log but don't fail - projection failures shouldn't block ingestion
    console.error(`[LaborFacts] Failed to project event ${sourceEventId}:`, error);
  }
}

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

      // Project to labor facts (async, non-blocking)
      projectToLaborFact(inserted.id, tenantId, eventType, occurredAtDate, payload);

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

  app.post('/api/integrations/time-clock/keys', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
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

  app.get('/api/integrations/time-clock/keys', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
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

  app.delete('/api/integrations/time-clock/keys/:id', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
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

  // ============================================================
  // READ-ONLY LABOR FACTS QUERIES
  // These endpoints are for observability only - no mutations
  // ============================================================

  // Query labor facts by employee
  app.get('/api/labor-facts/by-employee/:employeeId', async (req: Request, res: Response) => {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate, limit = '100' } = req.query;

      let query = db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.employeeId, employeeId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(parseInt(String(limit), 10));

      const facts = await query;

      // Filter by date range in application if provided
      let filtered = facts;
      if (startDate) {
        const start = new Date(String(startDate));
        filtered = filtered.filter(f => f.occurredAt >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        filtered = filtered.filter(f => f.occurredAt <= end);
      }

      return res.json({
        employeeId,
        count: filtered.length,
        facts: filtered,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by employee:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by date range
  app.get('/api/labor-facts/by-date', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, limit = '500' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const start = new Date(String(startDate));
      const end = new Date(String(endDate));

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(and(
          gte(epochLaborFacts.occurredAt, start),
          lte(epochLaborFacts.occurredAt, end)
        ))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(parseInt(String(limit), 10));

      return res.json({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by date:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by job/order ID
  app.get('/api/labor-facts/by-job/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { limit = '100' } = req.query;

      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.jobId, jobId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(parseInt(String(limit), 10));

      return res.json({
        jobId,
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by job:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by site
  app.get('/api/labor-facts/by-site/:siteId', async (req: Request, res: Response) => {
    try {
      const { siteId } = req.params;
      const { startDate, endDate, limit = '500' } = req.query;

      let facts = await db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.siteId, siteId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(parseInt(String(limit), 10));

      // Filter by date range in application if provided
      if (startDate) {
        const start = new Date(String(startDate));
        facts = facts.filter(f => f.occurredAt >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        facts = facts.filter(f => f.occurredAt <= end);
      }

      return res.json({
        siteId,
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by site:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Get labor fact summary (who worked, when, for how long)
  app.get('/api/labor-facts/summary', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const start = new Date(String(startDate));
      const end = new Date(String(endDate));

      // Get all facts in date range
      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(and(
          gte(epochLaborFacts.occurredAt, start),
          lte(epochLaborFacts.occurredAt, end)
        ))
        .orderBy(epochLaborFacts.employeeId, epochLaborFacts.occurredAt);

      // Group by employee - read-only observation, no calculations
      const byEmployee = new Map<string, {
        employeeId: string;
        displayName: string | null;
        eventCount: number;
        firstEvent: Date;
        lastEvent: Date;
        eventTypes: string[];
      }>();

      for (const fact of facts) {
        const existing = byEmployee.get(fact.employeeId);
        if (!existing) {
          byEmployee.set(fact.employeeId, {
            employeeId: fact.employeeId,
            displayName: fact.employeeDisplayName,
            eventCount: 1,
            firstEvent: fact.occurredAt,
            lastEvent: fact.occurredAt,
            eventTypes: [fact.eventType],
          });
        } else {
          existing.eventCount++;
          if (fact.occurredAt < existing.firstEvent) existing.firstEvent = fact.occurredAt;
          if (fact.occurredAt > existing.lastEvent) existing.lastEvent = fact.occurredAt;
          if (!existing.eventTypes.includes(fact.eventType)) {
            existing.eventTypes.push(fact.eventType);
          }
        }
      }

      return res.json({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalEvents: facts.length,
        uniqueEmployees: byEmployee.size,
        employees: Array.from(byEmployee.values()),
      });
    } catch (error) {
      console.error('[LaborFacts] Error generating summary:', error);
      return res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  // ============================================================
  // CONNECTOR HEALTH (QUIET OBSERVABILITY)
  // Read-only health status - no alerts, no dashboards
  // ============================================================

  // Get health for a specific connector
  app.get('/api/connector-health/:tenantId/:sourceSystem', async (req: Request, res: Response) => {
    try {
      const { tenantId, sourceSystem } = req.params;
      const health = await getConnectorHealth(tenantId, sourceSystem);
      
      if (!health) {
        return res.status(404).json({ 
          error: 'No health data found',
          tenantId,
          sourceSystem,
        });
      }
      
      return res.json(health);
    } catch (error) {
      console.error('[ConnectorHealth] Error fetching health:', error);
      return res.status(500).json({ error: 'Failed to fetch connector health' });
    }
  });

  // List all connector health for a tenant
  app.get('/api/connector-health/:tenantId', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const connectors = await listConnectorHealthByTenant(tenantId);
      
      return res.json({
        tenantId,
        count: connectors.length,
        connectors,
      });
    } catch (error) {
      console.error('[ConnectorHealth] Error listing health:', error);
      return res.status(500).json({ error: 'Failed to list connector health' });
    }
  });

  // Get health history for a connector
  app.get('/api/connector-health/:tenantId/:sourceSystem/history', async (req: Request, res: Response) => {
    try {
      const { tenantId, sourceSystem } = req.params;
      const { limit = '50' } = req.query;
      
      const history = await getConnectorHealthHistory(
        tenantId, 
        sourceSystem, 
        parseInt(String(limit), 10)
      );
      
      return res.json({
        tenantId,
        sourceSystem,
        count: history.length,
        history,
      });
    } catch (error) {
      console.error('[ConnectorHealth] Error fetching history:', error);
      return res.status(500).json({ error: 'Failed to fetch health history' });
    }
  });

  // ============================================================
  // BARCODE-DRIVEN TIME CHARGING — TRAVELER SCAN ENDPOINTS
  // ============================================================

  app.post('/api/time-clock/scan/traveler', async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      return res.json({ chargeContext: result.context });
    } catch (error) {
      console.error('[TimeClock] Error scanning traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to resolve traveler barcode' });
    }
  });

  app.post('/api/time-clock/clock-in/traveler', async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      const { context } = result;
      const today = new Date().toISOString().split('T')[0];

      const entry = await storage.createTimeClockEntryWithChargeContext({
        employeeId: employeeId.trim(),
        date: new Date(today),
        clockIn: new Date(),
        clockOut: null,
        productionWorkOrderId: context.wadId,
        travelerId: context.travelerId,
        chargeCode: context.chargeCode,
        department: context.department,
        operation: context.operation,
        approvalStatus: 'AUTO',
      });

      return res.status(201).json({ entry, chargeContext: context });
    } catch (error) {
      console.error('[TimeClock] Error clocking in via traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to clock in via traveler barcode' });
    }
  });

  app.post('/api/time-clock/switch-job/traveler', async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      const { context } = result;

      const { closed, created } = await storage.switchActiveTimeEntryToTraveler({
        employeeId: employeeId.trim(),
        productionWorkOrderId: context.wadId,
        travelerId: context.travelerId,
        chargeCode: context.chargeCode,
        department: context.department,
        operation: context.operation,
      });

      return res.status(201).json({ closed, created, chargeContext: context });
    } catch (error) {
      console.error('[TimeClock] Error switching job via traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to switch job via traveler barcode' });
    }
  });

  // Start the quiet health evaluator
  startConnectorHealthEvaluator();
}
