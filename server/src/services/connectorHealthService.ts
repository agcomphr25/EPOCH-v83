import { db } from '../../db';
import { epochExternalEvents, epochLaborFacts, epochConnectorHealth } from '../../schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

const WINDOW_MINUTES = 15;
const OFFLINE_THRESHOLD_MINUTES = 30;
const EVALUATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type HealthStatus = 'healthy' | 'degraded' | 'offline';

interface ConnectorStats {
  tenantId: string;
  sourceSystem: string;
  receivedCount: number;
  deliveredCount: number;
  failedCount: number;
  lastEventAt: Date | null;
  lastFailureAt: Date | null;
}

function calculateStatus(stats: ConnectorStats, windowEnd: Date): HealthStatus {
  const timeSinceLastEvent = stats.lastEventAt 
    ? (windowEnd.getTime() - stats.lastEventAt.getTime()) / (1000 * 60)
    : Infinity;

  if (stats.receivedCount === 0 && timeSinceLastEvent > OFFLINE_THRESHOLD_MINUTES) {
    return 'offline';
  }
  
  if (stats.failedCount > 0 && stats.deliveredCount > 0) {
    return 'degraded';
  }
  
  if (stats.receivedCount > 0 && stats.failedCount === 0) {
    return 'healthy';
  }
  
  if (stats.failedCount > 0 && stats.deliveredCount === 0) {
    return 'degraded';
  }

  return 'healthy';
}

async function getConnectorStats(
  tenantId: string, 
  sourceSystem: string, 
  windowStart: Date, 
  windowEnd: Date
): Promise<ConnectorStats> {
  const received = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(epochExternalEvents)
    .where(and(
      eq(epochExternalEvents.tenantId, tenantId),
      eq(epochExternalEvents.sourceSystem, sourceSystem),
      gte(epochExternalEvents.receivedAt, windowStart),
      lte(epochExternalEvents.receivedAt, windowEnd)
    ));

  const delivered = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(epochLaborFacts)
    .where(and(
      eq(epochLaborFacts.tenantId, tenantId),
      eq(epochLaborFacts.sourceSystem, sourceSystem),
      gte(epochLaborFacts.createdAt, windowStart),
      lte(epochLaborFacts.createdAt, windowEnd)
    ));

  const [lastEvent] = await db
    .select({ receivedAt: epochExternalEvents.receivedAt })
    .from(epochExternalEvents)
    .where(and(
      eq(epochExternalEvents.tenantId, tenantId),
      eq(epochExternalEvents.sourceSystem, sourceSystem)
    ))
    .orderBy(desc(epochExternalEvents.receivedAt))
    .limit(1);

  const receivedCount = received[0]?.count || 0;
  const deliveredCount = delivered[0]?.count || 0;
  const failedCount = Math.max(0, receivedCount - deliveredCount);

  return {
    tenantId,
    sourceSystem,
    receivedCount,
    deliveredCount,
    failedCount,
    lastEventAt: lastEvent?.receivedAt || null,
    lastFailureAt: failedCount > 0 ? new Date() : null,
  };
}

async function getActiveConnectors(): Promise<Array<{ tenantId: string; sourceSystem: string }>> {
  const results = await db
    .selectDistinct({
      tenantId: epochExternalEvents.tenantId,
      sourceSystem: epochExternalEvents.sourceSystem,
    })
    .from(epochExternalEvents);
  
  return results;
}

async function getPreviousStatus(
  tenantId: string, 
  sourceSystem: string
): Promise<HealthStatus | null> {
  const [prev] = await db
    .select({ status: epochConnectorHealth.status })
    .from(epochConnectorHealth)
    .where(and(
      eq(epochConnectorHealth.tenantId, tenantId),
      eq(epochConnectorHealth.sourceSystem, sourceSystem)
    ))
    .orderBy(desc(epochConnectorHealth.createdAt))
    .limit(1);
  
  return prev?.status as HealthStatus | null;
}

export async function evaluateConnectorHealth(): Promise<void> {
  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

  const connectors = await getActiveConnectors();
  
  for (const connector of connectors) {
    try {
      const stats = await getConnectorStats(
        connector.tenantId, 
        connector.sourceSystem, 
        windowStart, 
        windowEnd
      );
      
      const status = calculateStatus(stats, windowEnd);
      const previousStatus = await getPreviousStatus(connector.tenantId, connector.sourceSystem);

      await db.insert(epochConnectorHealth).values({
        tenantId: connector.tenantId,
        sourceSystem: connector.sourceSystem,
        windowStart,
        windowEnd,
        receivedCount: stats.receivedCount,
        deliveredCount: stats.deliveredCount,
        failedCount: stats.failedCount,
        lastEventAt: stats.lastEventAt,
        lastFailureAt: stats.lastFailureAt,
        status,
        notes: previousStatus && previousStatus !== status 
          ? `Status changed from ${previousStatus} to ${status}` 
          : null,
      });

      if (status === 'offline' && previousStatus !== 'offline') {
        console.log(`[ConnectorHealth] ${connector.sourceSystem} (${connector.tenantId}) went offline`);
      }
    } catch (error) {
      console.error(`[ConnectorHealth] Error evaluating ${connector.sourceSystem}:`, error);
    }
  }
}

export async function getConnectorHealth(
  tenantId: string, 
  sourceSystem: string
): Promise<typeof epochConnectorHealth.$inferSelect | null> {
  const [latest] = await db
    .select()
    .from(epochConnectorHealth)
    .where(and(
      eq(epochConnectorHealth.tenantId, tenantId),
      eq(epochConnectorHealth.sourceSystem, sourceSystem)
    ))
    .orderBy(desc(epochConnectorHealth.createdAt))
    .limit(1);
  
  return latest || null;
}

export async function listConnectorHealthByTenant(
  tenantId: string
): Promise<Array<typeof epochConnectorHealth.$inferSelect>> {
  const subquery = db
    .selectDistinct({ sourceSystem: epochConnectorHealth.sourceSystem })
    .from(epochConnectorHealth)
    .where(eq(epochConnectorHealth.tenantId, tenantId));

  const results: Array<typeof epochConnectorHealth.$inferSelect> = [];
  
  const connectors = await db
    .selectDistinct({ sourceSystem: epochConnectorHealth.sourceSystem })
    .from(epochConnectorHealth)
    .where(eq(epochConnectorHealth.tenantId, tenantId));

  for (const connector of connectors) {
    const health = await getConnectorHealth(tenantId, connector.sourceSystem);
    if (health) {
      results.push(health);
    }
  }

  return results;
}

export async function getConnectorHealthHistory(
  tenantId: string,
  sourceSystem: string,
  limit = 50
): Promise<Array<typeof epochConnectorHealth.$inferSelect>> {
  return db
    .select()
    .from(epochConnectorHealth)
    .where(and(
      eq(epochConnectorHealth.tenantId, tenantId),
      eq(epochConnectorHealth.sourceSystem, sourceSystem)
    ))
    .orderBy(desc(epochConnectorHealth.createdAt))
    .limit(limit);
}

let healthCheckInterval: NodeJS.Timeout | null = null;

export function startConnectorHealthEvaluator(): void {
  if (healthCheckInterval) {
    return;
  }

  console.log('[ConnectorHealth] Starting quiet health evaluator (every 5 minutes)');
  
  evaluateConnectorHealth().catch(err => {
    console.error('[ConnectorHealth] Initial evaluation failed:', err);
  });

  healthCheckInterval = setInterval(() => {
    evaluateConnectorHealth().catch(err => {
      console.error('[ConnectorHealth] Periodic evaluation failed:', err);
    });
  }, EVALUATION_INTERVAL_MS);
}

export function stopConnectorHealthEvaluator(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log('[ConnectorHealth] Health evaluator stopped');
  }
}
