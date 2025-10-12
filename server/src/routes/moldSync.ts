import { Router } from 'express';
import { syncMoldsFromExternal } from '../scripts/sync-molds.js';

const router = Router();

/**
 * POST /api/sync-molds
 * Sync molds from external database
 */
router.post('/sync-molds', async (req, res) => {
  try {
    console.log('🔄 API: Starting mold synchronization...');

    const result = await syncMoldsFromExternal();

    res.json(result);
  } catch (error) {
    console.error('❌ API: Mold sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync molds from external database',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sync-molds/status
 * Get current mold count and status
 */
router.get('/sync-molds/status', async (req, res) => {
  try {
    const { db } = await import('../../db.js');
    const { molds } = await import('../../schema.js');

    const moldCount = await db.$count(molds);
    const sampleMolds = await db
      .select({
        moldId: molds.moldId,
        modelName: molds.modelName,
        stockModels: molds.stockModels,
        isActive: molds.isActive,
      })
      .from(molds)
      .limit(10);

    res.json({
      success: true,
      moldCount,
      sampleMolds,
    });
  } catch (error) {
    console.error('❌ API: Failed to get mold status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get mold status',
    });
  }
});

export default router;
