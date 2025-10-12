import { Router } from 'express';
import { db } from '../../db';
import { featureSelections } from '../../schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();

/**
 * Track a feature selection (increment count)
 * POST /api/feature-selections/track
 */
router.post('/track', async (req, res) => {
  try {
    const { featureName, optionValue, optionLabel } = req.body;

    if (!featureName || !optionValue || !optionLabel) {
      return res.status(400).json({
        error: 'featureName, optionValue, and optionLabel are required',
      });
    }

    // Check if record exists
    const existing = await db
      .select()
      .from(featureSelections)
      .where(
        and(
          eq(featureSelections.featureName, featureName),
          eq(featureSelections.optionValue, optionValue)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(featureSelections)
        .set({
          selectionCount: sql`${featureSelections.selectionCount} + 1`,
          lastSelectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(featureSelections.id, existing[0].id));
    } else {
      // Insert new record
      await db.insert(featureSelections).values({
        featureName,
        optionValue,
        optionLabel,
        selectionCount: 1,
        lastSelectedAt: new Date(),
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking feature selection:', error);
    res.status(500).json({ error: 'Failed to track feature selection' });
  }
});

/**
 * Get smart-sorted options for a feature
 * GET /api/feature-selections/sorted/:featureName
 */
router.get('/sorted/:featureName', async (req, res) => {
  try {
    const { featureName } = req.params;

    // Get selection stats from database
    const selectionStats = await db
      .select()
      .from(featureSelections)
      .where(eq(featureSelections.featureName, featureName))
      .orderBy(desc(featureSelections.selectionCount));

    // Return the stats for sorting on frontend
    res.json(selectionStats);
  } catch (error) {
    console.error('Error getting sorted feature options:', error);
    res.status(500).json({ error: 'Failed to get sorted options' });
  }
});

/**
 * Get all feature selection statistics
 * GET /api/feature-selections/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db
      .select()
      .from(featureSelections)
      .orderBy(
        desc(featureSelections.featureName),
        desc(featureSelections.selectionCount)
      );

    res.json(stats);
  } catch (error) {
    console.error('Error getting feature selection stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
