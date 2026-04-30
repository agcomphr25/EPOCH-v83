import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { aqlSamplingChart, insertAqlSamplingChartSchema } from '../../schema';
import { eq, and, lte, gte, asc } from 'drizzle-orm';

const router = Router();

// Get all sampling chart entries
router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await db
      .select()
      .from(aqlSamplingChart)
      .where(eq(aqlSamplingChart.isActive, true))
      .orderBy(asc(aqlSamplingChart.lotSizeMin));
    
    res.json(entries);
  } catch (error) {
    console.error('Error fetching AQL sampling chart:', error);
    res.status(500).json({ error: 'Failed to fetch sampling chart' });
  }
});

// Get required sample size for a specific lot quantity
router.get('/calculate/:lotSize', async (req: Request, res: Response) => {
  try {
    const lotSize = parseInt(req.params.lotSize);
    
    if (isNaN(lotSize) || lotSize < 1) {
      return res.status(400).json({ error: 'Invalid lot size' });
    }

    const entries = await db
      .select()
      .from(aqlSamplingChart)
      .where(eq(aqlSamplingChart.isActive, true))
      .orderBy(asc(aqlSamplingChart.lotSizeMin));

    const matchingEntry = entries.find(
      entry => lotSize >= entry.lotSizeMin && lotSize <= entry.lotSizeMax
    );

    if (matchingEntry) {
      res.json({
        lotSize,
        requiredSampleSize: matchingEntry.sampleSize,
        lotRange: `${matchingEntry.lotSizeMin}-${matchingEntry.lotSizeMax}`,
        inspectionLevel: matchingEntry.inspectionLevel,
      });
    } else {
      // For lot sizes beyond the chart, use the largest entry
      const largestEntry = entries[entries.length - 1];
      if (largestEntry && lotSize > largestEntry.lotSizeMax) {
        res.json({
          lotSize,
          requiredSampleSize: largestEntry.sampleSize,
          lotRange: `${largestEntry.lotSizeMax}+`,
          inspectionLevel: largestEntry.inspectionLevel,
          note: 'Lot size exceeds chart maximum, using largest sample size',
        });
      } else {
        res.status(404).json({ error: 'No sampling entry found for this lot size' });
      }
    }
  } catch (error) {
    console.error('Error calculating sample size:', error);
    res.status(500).json({ error: 'Failed to calculate sample size' });
  }
});

// Create a new sampling chart entry (admin)
router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = insertAqlSamplingChartSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    const [newEntry] = await db
      .insert(aqlSamplingChart)
      .values(parsed.data)
      .returning();

    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Error creating AQL sampling entry:', error);
    res.status(500).json({ error: 'Failed to create sampling entry' });
  }
});

// Update a sampling chart entry (admin)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const [updated] = await db
      .update(aqlSamplingChart)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(aqlSamplingChart.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating AQL sampling entry:', error);
    res.status(500).json({ error: 'Failed to update sampling entry' });
  }
});

// Delete (deactivate) a sampling chart entry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const [deactivated] = await db
      .update(aqlSamplingChart)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(aqlSamplingChart.id, id))
      .returning();

    if (!deactivated) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ success: true, message: 'Entry deactivated' });
  } catch (error) {
    console.error('Error deactivating AQL sampling entry:', error);
    res.status(500).json({ error: 'Failed to deactivate sampling entry' });
  }
});

// Seed route — not mounted in production
if (process.env.NODE_ENV !== 'production') {
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const standardValues = [
      { lotSizeMin: 2, lotSizeMax: 8, sampleSize: 3, description: 'Very small lots' },
      { lotSizeMin: 9, lotSizeMax: 15, sampleSize: 5, description: 'Small lots' },
      { lotSizeMin: 16, lotSizeMax: 25, sampleSize: 8, description: 'Small-medium lots' },
      { lotSizeMin: 26, lotSizeMax: 50, sampleSize: 13, description: 'Medium lots' },
      { lotSizeMin: 51, lotSizeMax: 90, sampleSize: 20, description: 'Medium-large lots' },
      { lotSizeMin: 91, lotSizeMax: 150, sampleSize: 32, description: 'Large lots' },
      { lotSizeMin: 151, lotSizeMax: 280, sampleSize: 50, description: 'Very large lots' },
      { lotSizeMin: 281, lotSizeMax: 500, sampleSize: 80, description: 'Extra large lots' },
      { lotSizeMin: 501, lotSizeMax: 1200, sampleSize: 125, description: 'Bulk lots' },
      { lotSizeMin: 1201, lotSizeMax: 3200, sampleSize: 200, description: 'Large bulk lots' },
      { lotSizeMin: 3201, lotSizeMax: 10000, sampleSize: 315, description: 'Very large bulk lots' },
      { lotSizeMin: 10001, lotSizeMax: 999999, sampleSize: 500, description: 'Maximum bulk lots' },
    ];

    // Check if data already exists
    const existing = await db.select().from(aqlSamplingChart).limit(1);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Sampling chart already has data. Clear existing data first.' });
    }

    const inserted = await db
      .insert(aqlSamplingChart)
      .values(standardValues.map(v => ({
        ...v,
        inspectionLevel: 'normal',
        isActive: true,
      })))
      .returning();

    res.status(201).json({ 
      success: true, 
      message: `Seeded ${inserted.length} AQL sampling entries`,
      entries: inserted,
    });
  } catch (error) {
    console.error('Error seeding AQL sampling chart:', error);
    res.status(500).json({ error: 'Failed to seed sampling chart' });
  }
});
}

export default router;
