import { Router } from 'express';
import { db } from '../../db';
import { auditEvents } from '../../schema';
import { desc, eq, and, sql, count } from 'drizzle-orm';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

/**
 * Get audit events for a specific entity
 * Query params:
 * - entityType: required
 * - entityId: required
 * - filter: optional (all, changes, progress, sign)
 * - page: optional (default 0)
 * - pageSize: optional (default 20)
 * - since: optional timestamp (for real-time updates)
 */
router.get('/events', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      filter = 'all',
      page = '0',
      pageSize = '20',
      since,
    } = req.query;

    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }

    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const offset = pageNum * pageSizeNum;

    // Build where conditions
    let whereConditions = and(
      eq(auditEvents.entityType, entityType as string),
      eq(auditEvents.entityId, entityId as string)
    );

    // If since timestamp is provided, get only newer events
    if (since) {
      whereConditions = and(
        whereConditions,
        sql`${auditEvents.timestamp} > ${new Date(since as string)}`
      );
    }

    // Build filter conditions
    let filterCondition = whereConditions;
    if (filter === 'changes') {
      filterCondition = and(
        whereConditions,
        sql`${auditEvents.fieldsChanged} IS NOT NULL`
      );
    } else if (filter === 'progress') {
      filterCondition = and(
        whereConditions,
        eq(auditEvents.action, 'progress')
      );
    } else if (filter === 'sign') {
      filterCondition = and(
        whereConditions,
        sql`${auditEvents.action} IN ('sign', 'approve')`
      );
    }

    // Get total count for pagination
    const totalResult = await db
      .select({ count: count() })
      .from(auditEvents)
      .where(filterCondition);

    const total = totalResult[0]?.count || 0;

    // Get paginated events
    const events = await db
      .select()
      .from(auditEvents)
      .where(filterCondition)
      .orderBy(desc(auditEvents.timestamp))
      .limit(pageSizeNum)
      .offset(offset);

    res.json({
      events,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(Number(total) / pageSizeNum),
    });
  } catch (error) {
    console.error('Error fetching audit events:', error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

/**
 * Get all entity types that have audit events
 */
router.get('/entity-types', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await db
      .selectDistinct({ entityType: auditEvents.entityType })
      .from(auditEvents)
      .orderBy(auditEvents.entityType);

    const entityTypes = result.map((r) => r.entityType);
    res.json({ entityTypes });
  } catch (error) {
    console.error('Error fetching entity types:', error);
    res.status(500).json({ error: 'Failed to fetch entity types' });
  }
});

/**
 * Get all entity IDs for a specific entity type
 */
router.get('/entities/:entityType', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { entityType } = req.params;
    const { search } = req.query;

    let whereCondition = eq(auditEvents.entityType, entityType);

    if (search) {
      whereCondition = and(
        whereCondition,
        sql`${auditEvents.entityId} ILIKE ${'%' + search + '%'}`
      );
    }

    const result = await db
      .selectDistinct({ entityId: auditEvents.entityId })
      .from(auditEvents)
      .where(whereCondition)
      .orderBy(auditEvents.entityId)
      .limit(50);

    const entities = result.map((r) => r.entityId);
    res.json({ entities });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

/**
 * Get recent audit events across all entities
 * Query params:
 * - limit: optional (default 50)
 * - entityType: optional filter by entity type
 */
router.get('/recent', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { limit = '50', entityType } = req.query;
    const limitNum = parseInt(limit as string);

    let whereCondition = undefined;
    if (entityType) {
      whereCondition = eq(auditEvents.entityType, entityType as string);
    }

    const events = await db
      .select()
      .from(auditEvents)
      .where(whereCondition)
      .orderBy(desc(auditEvents.timestamp))
      .limit(limitNum);

    res.json({ events });
  } catch (error) {
    console.error('Error fetching recent audit events:', error);
    res.status(500).json({ error: 'Failed to fetch recent audit events' });
  }
});

/**
 * Get audit event statistics
 */
router.get('/stats', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { entityType, entityId } = req.query;

    let whereCondition = undefined;
    if (entityType && entityId) {
      whereCondition = and(
        eq(auditEvents.entityType, entityType as string),
        eq(auditEvents.entityId, entityId as string)
      );
    } else if (entityType) {
      whereCondition = eq(auditEvents.entityType, entityType as string);
    }

    const totalCount = await db
      .select({ count: count() })
      .from(auditEvents)
      .where(whereCondition);

    const actionCounts = await db
      .select({
        action: auditEvents.action,
        count: count(),
      })
      .from(auditEvents)
      .where(whereCondition)
      .groupBy(auditEvents.action);

    const actorCounts = await db
      .select({
        actorName: auditEvents.actorName,
        count: count(),
      })
      .from(auditEvents)
      .where(whereCondition)
      .groupBy(auditEvents.actorName)
      .orderBy(desc(count()))
      .limit(10);

    res.json({
      total: totalCount[0]?.count || 0,
      byAction: actionCounts,
      byActor: actorCounts,
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

export default router;
