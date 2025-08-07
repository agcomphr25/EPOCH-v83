import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  nonconformanceRecords, 
  insertNonconformanceRecordSchema,
  orders 
} from '../schema';

const router = Router();

// GET /api/nonconformance - List records with filtering
router.get('/', async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      stockModel,
      issueCause,
      status,
      search,
      limit = '50',
      offset = '0'
    } = req.query;

    let baseQuery = db.select().from(nonconformanceRecords);
    const conditions = [];

    // Date range filtering
    if (dateFrom) {
      conditions.push(gte(nonconformanceRecords.dispositionDate, dateFrom as string));
    }
    if (dateTo) {
      conditions.push(lte(nonconformanceRecords.dispositionDate, dateTo as string));
    }

    // Field-specific filtering
    if (stockModel) {
      conditions.push(ilike(nonconformanceRecords.stockModel, `%${stockModel}%`));
    }
    if (issueCause) {
      conditions.push(eq(nonconformanceRecords.issueCause, issueCause as string));
    }
    if (status) {
      conditions.push(eq(nonconformanceRecords.status, status as string));
    }

    // Search across multiple fields
    if (search) {
      const searchConditions = [
        ilike(nonconformanceRecords.orderId, `%${search}%`),
        ilike(nonconformanceRecords.serialNumber, `%${search}%`),
        ilike(nonconformanceRecords.customerName, `%${search}%`),
        ilike(nonconformanceRecords.poNumber, `%${search}%`),
        ilike(nonconformanceRecords.stockModel, `%${search}%`),
      ].filter(Boolean);
      
      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions));
      }
    }

    // Apply conditions and build final query
    let finalQuery = baseQuery.orderBy(desc(nonconformanceRecords.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    if (conditions.length > 0) {
      finalQuery = baseQuery.where(and(...conditions))
        .orderBy(desc(nonconformanceRecords.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));
    }

    const result = await finalQuery;

    res.json(result);
  } catch (error) {
    console.error('Error fetching nonconformance records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// GET /api/nonconformance/:id - Get single record
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = await db
      .select()
      .from(nonconformanceRecords)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .limit(1);

    if (record.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(record[0]);
  } catch (error) {
    console.error('Error fetching nonconformance record:', error);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

// POST /api/nonconformance - Create new record
router.post('/', async (req, res) => {
  try {
    const validatedData = insertNonconformanceRecordSchema.parse(req.body);
    
    const [newRecord] = await db
      .insert(nonconformanceRecords)
      .values({
        ...validatedData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json(newRecord);
  } catch (error) {
    console.error('Error creating nonconformance record:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// PUT /api/nonconformance/:id - Update record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertNonconformanceRecordSchema.parse(req.body);
    
    // Set resolvedAt timestamp if status is changing to Resolved
    const updateData: any = {
      ...validatedData,
      updatedAt: new Date(),
    };
    
    if (validatedData.status === 'Resolved' && req.body.status !== 'Resolved') {
      updateData.resolvedAt = new Date();
    }

    const [updatedRecord] = await db
      .update(nonconformanceRecords)
      .set(updateData)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .returning();

    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(updatedRecord);
  } catch (error) {
    console.error('Error updating nonconformance record:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// DELETE /api/nonconformance/:id - Delete record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedRecord] = await db
      .delete(nonconformanceRecords)
      .where(eq(nonconformanceRecords.id, parseInt(id)))
      .returning();

    if (!deletedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting nonconformance record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// GET /analytics - Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      stockModel,
      issueCause
    } = req.query;

    const conditions = [];

    // Date range filtering
    if (dateFrom) {
      conditions.push(gte(nonconformanceRecords.dispositionDate, dateFrom as string));
    }
    if (dateTo) {
      conditions.push(lte(nonconformanceRecords.dispositionDate, dateTo as string));
    }
    if (stockModel) {
      conditions.push(ilike(nonconformanceRecords.stockModel, `%${stockModel}%`));
    }
    if (issueCause) {
      conditions.push(eq(nonconformanceRecords.issueCause, issueCause as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get aggregate data
    const [totalStats] = await db
      .select({
        totalIssues: sql<number>`count(*)`,
        openIssues: sql<number>`count(*) filter (where status = 'Open')`,
        scrapRate: sql<number>`cast(count(*) filter (where disposition = 'Scrap') as float) / nullif(count(*), 0)`,
        avgResolutionDays: sql<number>`avg(extract(day from resolved_at - created_at)) filter (where resolved_at is not null)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause);

    // By department - we'll use a placeholder since department isn't in the schema yet
    const byDept = await db
      .select({
        dept: sql<string>`'Quality'`,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(sql`1`);

    // By stock model
    const byModel = await db
      .select({
        model: nonconformanceRecords.stockModel,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.stockModel)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // By issue cause
    const byCause = await db
      .select({
        cause: nonconformanceRecords.issueCause,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.issueCause)
      .orderBy(sql`count(*) desc`);

    // By disposition
    const byDisposition = await db
      .select({
        disposition: nonconformanceRecords.disposition,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(nonconformanceRecords.disposition)
      .orderBy(sql`count(*) desc`);

    // Monthly trend
    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)`,
      })
      .from(nonconformanceRecords)
      .where(whereClause)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

    const analytics = {
      ...totalStats,
      byDept,
      byModel: byModel.filter(item => item.model),
      byCause,
      byDisposition,
      monthlyTrend,
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;