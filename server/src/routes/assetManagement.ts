import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  assets,
  assetCategories,
  assetLocations,
  assetLocationHistory,
  workOrders,
  insertAssetSchema,
  insertAssetCategorySchema,
  insertAssetLocationSchema,
  users,
} from '../../schema';
import { eq, desc, sql, isNull, and } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

function requireAdmin(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==================== ASSET CATEGORIES ====================

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await db.select().from(assetCategories).orderBy(assetCategories.name);
    res.json(categories);
  } catch (error) {
    console.error('[AssetManagement] Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertAssetCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }
    const [category] = await db.insert(assetCategories).values(parsed.data).returning();
    res.status(201).json(category);
  } catch (error) {
    console.error('[AssetManagement] Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ==================== ASSET LOCATIONS ====================

router.get('/locations', async (_req: Request, res: Response) => {
  try {
    const locations = await db.select().from(assetLocations).orderBy(assetLocations.name);
    res.json(locations);
  } catch (error) {
    console.error('[AssetManagement] Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.post('/locations', requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertAssetLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }
    const [location] = await db.insert(assetLocations).values(parsed.data).returning();
    res.status(201).json(location);
  } catch (error) {
    console.error('[AssetManagement] Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// ==================== ASSET ANALYTICS ====================

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const allAssets = await db
      .select({ id: assets.id, assetTag: assets.assetTag, name: assets.name, status: assets.status })
      .from(assets);

    const reactiveWOs = await db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        reportedAt: workOrders.reportedAt,
        severity: workOrders.severity,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
      })
      .from(workOrders)
      .where(eq(workOrders.type, 'reactive'))
      .orderBy(workOrders.reportedAt);

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const analyticsMap: Record<string, {
      assetId: string;
      assetTag: string;
      assetName: string;
      mtbfDays: number | null;
      reactiveCount90d: number;
      highFailureRisk: boolean;
      downtimeImpactScore: number;
      totalDowntimeHours: number;
    }> = {};

    for (const asset of allAssets) {
      const assetReactiveWOs = reactiveWOs
        .filter((wo) => wo.assetId === asset.id)
        .sort((a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime());

      let mtbfDays: number | null = null;
      if (assetReactiveWOs.length >= 2) {
        let totalGapMs = 0;
        for (let i = 1; i < assetReactiveWOs.length; i++) {
          totalGapMs += new Date(assetReactiveWOs[i].reportedAt).getTime() - new Date(assetReactiveWOs[i - 1].reportedAt).getTime();
        }
        mtbfDays = parseFloat((totalGapMs / (assetReactiveWOs.length - 1) / (24 * 60 * 60 * 1000)).toFixed(1));
      }

      const recentWOs = assetReactiveWOs.filter((wo) => new Date(wo.reportedAt) >= ninetyDaysAgo);
      const reactiveCount90d = recentWOs.length;
      const highFailureRisk = reactiveCount90d >= 3;

      let totalDowntimeHours = 0;
      const severityWeights: Record<number, number> = { 1: 1, 2: 1.5, 3: 2, 4: 3, 5: 5 };

      let downtimeImpactScore = 0;
      for (const wo of assetReactiveWOs) {
        if (wo.downtimeStart) {
          const start = new Date(wo.downtimeStart);
          const end = wo.downtimeEnd ? new Date(wo.downtimeEnd) : now;
          const hours = (end.getTime() - start.getTime()) / 3600000;
          totalDowntimeHours += hours;
          const weight = severityWeights[wo.severity || 3] || 2;
          downtimeImpactScore += hours * weight;
        }
      }

      analyticsMap[asset.id] = {
        assetId: asset.id,
        assetTag: asset.assetTag,
        assetName: asset.name,
        mtbfDays,
        reactiveCount90d,
        highFailureRisk,
        downtimeImpactScore: parseFloat(downtimeImpactScore.toFixed(1)),
        totalDowntimeHours: parseFloat(totalDowntimeHours.toFixed(1)),
      };
    }

    const analytics = Object.values(analyticsMap);

    res.json({
      assets: analytics,
      summary: {
        totalAssets: allAssets.length,
        highFailureRiskCount: analytics.filter((a) => a.highFailureRisk).length,
        avgMtbfDays: (() => {
          const withMtbf = analytics.filter((a) => a.mtbfDays !== null);
          if (withMtbf.length === 0) return null;
          return parseFloat((withMtbf.reduce((sum, a) => sum + a.mtbfDays!, 0) / withMtbf.length).toFixed(1));
        })(),
        totalDowntimeImpact: parseFloat(analytics.reduce((sum, a) => sum + a.downtimeImpactScore, 0).toFixed(1)),
      },
    });
  } catch (error) {
    console.error('[AssetManagement] Error computing analytics:', error);
    res.status(500).json({ error: 'Failed to compute asset analytics' });
  }
});

// ==================== ASSETS ====================

router.get('/', async (_req: Request, res: Response) => {
  try {
    const allAssets = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        name: assets.name,
        categoryId: assets.categoryId,
        parentAssetId: assets.parentAssetId,
        physicalLocationId: assets.physicalLocationId,
        status: assets.status,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        vendorName: assets.vendorName,
        warrantyExpiration: assets.warrantyExpiration,
        expectedLifeYears: assets.expectedLifeYears,
        notes: assets.notes,
        createdAt: assets.createdAt,
        retiredAt: assets.retiredAt,
        categoryName: assetCategories.name,
        locationName: assetLocations.name,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(assetLocations, eq(assets.physicalLocationId, assetLocations.id))
      .orderBy(desc(assets.createdAt));
    res.json(allAssets);
  } catch (error) {
    console.error('[AssetManagement] Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [asset] = await db
      .select({
        id: assets.id,
        assetTag: assets.assetTag,
        name: assets.name,
        categoryId: assets.categoryId,
        parentAssetId: assets.parentAssetId,
        physicalLocationId: assets.physicalLocationId,
        status: assets.status,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        vendorName: assets.vendorName,
        warrantyExpiration: assets.warrantyExpiration,
        expectedLifeYears: assets.expectedLifeYears,
        notes: assets.notes,
        createdAt: assets.createdAt,
        retiredAt: assets.retiredAt,
        categoryName: assetCategories.name,
        locationName: assetLocations.name,
      })
      .from(assets)
      .leftJoin(assetCategories, eq(assets.categoryId, assetCategories.id))
      .leftJoin(assetLocations, eq(assets.physicalLocationId, assetLocations.id))
      .where(eq(assets.id, id))
      .limit(1);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const locationHistory = await db
      .select({
        id: assetLocationHistory.id,
        locationId: assetLocationHistory.locationId,
        movedAt: assetLocationHistory.movedAt,
        movedBy: assetLocationHistory.movedBy,
        notes: assetLocationHistory.notes,
        locationName: assetLocations.name,
        movedByUsername: users.username,
      })
      .from(assetLocationHistory)
      .leftJoin(assetLocations, eq(assetLocationHistory.locationId, assetLocations.id))
      .leftJoin(users, eq(assetLocationHistory.movedBy, users.id))
      .where(eq(assetLocationHistory.assetId, id))
      .orderBy(desc(assetLocationHistory.movedAt));

    const childAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.parentAssetId, id));

    res.json({ ...asset, locationHistory, childAssets });
  } catch (error) {
    console.error('[AssetManagement] Error fetching asset:', error);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const existing = await db.select({ id: assets.id }).from(assets).where(eq(assets.assetTag, parsed.data.assetTag!)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Asset tag already exists' });
    }

    const [asset] = await db.insert(assets).values(parsed.data).returning();

    if (asset.physicalLocationId) {
      const userId = (req as any).user?.id;
      await db.insert(assetLocationHistory).values({
        assetId: asset.id,
        locationId: asset.physicalLocationId,
        movedBy: userId,
        notes: 'Initial location assignment',
      });
    }

    res.status(201).json(asset);
  } catch (error) {
    console.error('[AssetManagement] Error creating asset:', error);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = insertAssetSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (parsed.data.assetTag && parsed.data.assetTag !== existing.assetTag) {
      const dup = await db.select({ id: assets.id }).from(assets).where(eq(assets.assetTag, parsed.data.assetTag)).limit(1);
      if (dup.length > 0) {
        return res.status(409).json({ error: 'Asset tag already exists' });
      }
    }

    if (parsed.data.status === 'retired' && existing.status !== 'retired') {
      (parsed.data as any).retiredAt = new Date();
    }

    const [updated] = await db.update(assets).set(parsed.data).where(eq(assets.id, id)).returning();
    res.json(updated);
  } catch (error) {
    console.error('[AssetManagement] Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.post('/:id/move-location', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const moveSchema = z.object({
      locationId: z.string().uuid(),
      notes: z.string().optional(),
    });

    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const userId = (req as any).user?.id;

    await db.update(assets).set({ physicalLocationId: parsed.data.locationId }).where(eq(assets.id, id));

    const [historyEntry] = await db.insert(assetLocationHistory).values({
      assetId: id,
      locationId: parsed.data.locationId,
      movedBy: userId,
      notes: parsed.data.notes,
    }).returning();

    res.json({ success: true, historyEntry });
  } catch (error) {
    console.error('[AssetManagement] Error moving asset:', error);
    res.status(500).json({ error: 'Failed to move asset' });
  }
});

export default router;
