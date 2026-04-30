import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { historicalMonthlyData, insertHistoricalMonthlyDataSchema } from '../../schema';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { dataType, startYear, endYear } = req.query;
    
    let query = db.select().from(historicalMonthlyData);
    
    const data = await db.select().from(historicalMonthlyData).orderBy(
      sql`${historicalMonthlyData.year} DESC, ${historicalMonthlyData.month} DESC`
    );
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

router.get('/by-type/:dataType', async (req: Request, res: Response) => {
  try {
    const { dataType } = req.params;
    
    const data = await db.select().from(historicalMonthlyData)
      .where(eq(historicalMonthlyData.dataType, dataType))
      .orderBy(sql`${historicalMonthlyData.year} DESC, ${historicalMonthlyData.month} DESC`);
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching historical data by type:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

router.get('/range-comparison', async (req: Request, res: Response) => {
  try {
    const { 
      dataType,
      range1StartYear, range1StartMonth, range1EndYear, range1EndMonth,
      range2StartYear, range2StartMonth, range2EndYear, range2EndMonth
    } = req.query;

    if (!dataType || !range1StartYear || !range1StartMonth || !range1EndYear || !range1EndMonth ||
        !range2StartYear || !range2StartMonth || !range2EndYear || !range2EndMonth) {
      return res.status(400).json({ error: 'Missing required parameters for range comparison' });
    }

    const getMonthsInRange = (startY: number, startM: number, endY: number, endM: number) => {
      const months: { year: number; month: number }[] = [];
      let y = startY;
      let m = startM;
      while (y < endY || (y === endY && m <= endM)) {
        months.push({ year: y, month: m });
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
      return months;
    };

    const range1Months = getMonthsInRange(
      Number(range1StartYear), Number(range1StartMonth),
      Number(range1EndYear), Number(range1EndMonth)
    );
    const range2Months = getMonthsInRange(
      Number(range2StartYear), Number(range2StartMonth),
      Number(range2EndYear), Number(range2EndMonth)
    );

    const allData = await db.select().from(historicalMonthlyData)
      .where(eq(historicalMonthlyData.dataType, dataType as string));

    const dataMap = new Map<string, typeof allData[0]>();
    allData.forEach(d => {
      dataMap.set(`${d.year}-${d.month}-${d.category}`, d);
    });

    const categories = [...new Set(allData.map(d => d.category))];
    
    const comparison: Record<string, { 
      range1Total: number; 
      range2Total: number; 
      growthAmount: number;
      growthPercentage: number;
    }> = {};

    categories.forEach(category => {
      let range1Total = 0;
      let range2Total = 0;

      range1Months.forEach(m => {
        const key = `${m.year}-${m.month}-${category}`;
        const entry = dataMap.get(key);
        if (entry) {
          range1Total += Number(entry.amount) || 0;
        }
      });

      range2Months.forEach(m => {
        const key = `${m.year}-${m.month}-${category}`;
        const entry = dataMap.get(key);
        if (entry) {
          range2Total += Number(entry.amount) || 0;
        }
      });

      const growthAmount = range2Total - range1Total;
      const growthPercentage = range1Total > 0 
        ? ((range2Total - range1Total) / range1Total) * 100 
        : (range2Total > 0 ? 100 : 0);

      comparison[category] = {
        range1Total,
        range2Total,
        growthAmount,
        growthPercentage: Math.round(growthPercentage * 100) / 100,
      };
    });

    res.json({
      dataType,
      range1: { 
        start: `${range1StartYear}-${String(range1StartMonth).padStart(2, '0')}`,
        end: `${range1EndYear}-${String(range1EndMonth).padStart(2, '0')}`
      },
      range2: { 
        start: `${range2StartYear}-${String(range2StartMonth).padStart(2, '0')}`,
        end: `${range2EndYear}-${String(range2EndMonth).padStart(2, '0')}`
      },
      comparison,
    });
  } catch (error) {
    console.error('Error computing range comparison:', error);
    res.status(500).json({ error: 'Failed to compute range comparison' });
  }
});

router.post('/', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const validation = insertHistoricalMonthlyDataSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const { year, month, dataType, category, amount, notes } = validation.data;

    const existing = await db.select().from(historicalMonthlyData)
      .where(and(
        eq(historicalMonthlyData.year, year),
        eq(historicalMonthlyData.month, month),
        eq(historicalMonthlyData.dataType, dataType),
        eq(historicalMonthlyData.category, category)
      ))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db.update(historicalMonthlyData)
        .set({ 
          amount: String(amount), 
          notes,
          updatedAt: new Date(),
          createdBy: user.username
        })
        .where(eq(historicalMonthlyData.id, existing[0].id))
        .returning();
      return res.json(updated[0]);
    }

    const inserted = await db.insert(historicalMonthlyData).values({
      year,
      month,
      dataType,
      category,
      amount: String(amount),
      notes,
      createdBy: user.username,
    }).returning();

    res.status(201).json(inserted[0]);
  } catch (error) {
    console.error('Error saving historical data:', error);
    res.status(500).json({ error: 'Failed to save historical data' });
  }
});

router.post('/bulk', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries must be an array' });
    }

    const results: any[] = [];
    for (const entry of entries) {
      const validation = insertHistoricalMonthlyDataSchema.safeParse(entry);
      if (!validation.success) {
        continue;
      }

      const { year, month, dataType, category, amount, notes } = validation.data;

      const existing = await db.select().from(historicalMonthlyData)
        .where(and(
          eq(historicalMonthlyData.year, year),
          eq(historicalMonthlyData.month, month),
          eq(historicalMonthlyData.dataType, dataType),
          eq(historicalMonthlyData.category, category)
        ))
        .limit(1);

      if (existing.length > 0) {
        const updated = await db.update(historicalMonthlyData)
          .set({ 
            amount: String(amount), 
            notes,
            updatedAt: new Date(),
            createdBy: user.username
          })
          .where(eq(historicalMonthlyData.id, existing[0].id))
          .returning();
        results.push(updated[0]);
      } else {
        const inserted = await db.insert(historicalMonthlyData).values({
          year,
          month,
          dataType,
          category,
          amount: String(amount),
          notes,
          createdBy: user.username,
        }).returning();
        results.push(inserted[0]);
      }
    }

    res.json({ saved: results.length, entries: results });
  } catch (error) {
    console.error('Error bulk saving historical data:', error);
    res.status(500).json({ error: 'Failed to bulk save historical data' });
  }
});

router.delete('/:id', requireExecutiveAccess, async (req: Request, res: Response) => {
  try {

    const { id } = req.params;
    await db.delete(historicalMonthlyData).where(eq(historicalMonthlyData.id, Number(id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting historical data:', error);
    res.status(500).json({ error: 'Failed to delete historical data' });
  }
});

export default router;
