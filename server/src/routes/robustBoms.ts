import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { 
  inventoryItems,
  boms, 
  bomRevisions, 
  bomLines,
  insertBomSchema,
  insertBomRevisionSchema,
  insertBomLineSchema
} from '../../schema';
import { eq, ilike, desc, count, or } from 'drizzle-orm';
import { 
  explodeBOMRevisionWithRollups, 
  whereUsed, 
  buildBOMTree 
} from '../db/queries/bom';

const router = Router();

// ========================================
// PARTS MANAGEMENT ROUTES (Now uses Inventory Items)
// ========================================

// Get all parts (inventory items) with pagination and search
router.get('/parts', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? '';
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 10000);
    const offset = (page - 1) * pageSize;
    
    const where = search 
      ? or(
          ilike(inventoryItems.agPartNumber, `%${search}%`),
          ilike(inventoryItems.sku, `%${search}%`),
          ilike(inventoryItems.name, `%${search}%`)
        )
      : undefined;

    const [rows, total] = await Promise.all([
      db.select()
        .from(inventoryItems)
        .where(where as any)
        .orderBy(desc(inventoryItems.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ c: count() })
        .from(inventoryItems)
        .where(where as any),
    ]);

    res.json({ 
      data: rows, 
      page, 
      pageSize, 
      total: total[0]?.c ?? 0 
    });
  } catch (error) {
    console.error('Get parts error:', error);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

// Get single part (inventory item) by AG Part Number
router.get('/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const part = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, id),
    });

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
  } catch (error) {
    console.error('Get part error:', error);
    res.status(500).json({ error: 'Failed to fetch part' });
  }
});

// Create new part - DEPRECATED: Use inventory items management instead
// This endpoint is kept for backward compatibility but redirects to inventory
router.post('/parts', async (req, res) => {
  try {
    return res.status(400).json({ 
      error: 'Use /api/enhanced/inventory/items endpoint',
      details: 'Parts are now managed through the Inventory Items system. Please use the inventory management endpoints.'
    });
  } catch (error) {
    console.error('Create part error:', error);
    res.status(500).json({ error: 'Failed to create part' });
  }
});

// Update part - DEPRECATED: Use inventory items management instead
router.put('/parts/:id', async (req, res) => {
  try {
    return res.status(400).json({ 
      error: 'Use /api/enhanced/inventory/items/:id endpoint',
      details: 'Parts are now managed through the Inventory Items system. Please use the inventory management endpoints.'
    });
  } catch (error) {
    console.error('Update part error:', error);
    res.status(500).json({ error: 'Failed to update part' });
  }
});

// Delete part - DEPRECATED: Use inventory items management instead
// But check BOM usage before allowing deletion
router.delete('/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if part is used in any BOM lines as a child part
    const childUsage = await db.query.bomLines.findFirst({
      where: eq(bomLines.childPartAgNumber, id),
    });

    if (childUsage) {
      return res.status(400).json({ 
        error: 'Cannot delete part that is used in BOMs',
        details: 'Part is referenced as a child component in one or more BOM lines. Please remove it from all BOMs before deleting.'
      });
    }

    // Check if part is used as a parent part in any BOMs
    const parentUsage = await db.query.boms.findFirst({
      where: eq(boms.parentPartAgNumber, id),
    });

    if (parentUsage) {
      return res.status(400).json({ 
        error: 'Cannot delete part that has BOMs',
        details: 'Part is used as a parent part in one or more BOMs. Please delete the BOMs first, or choose a different parent part for them.'
      });
    }

    return res.status(400).json({ 
      error: 'Use /api/enhanced/inventory/items/:id endpoint',
      details: 'Parts are now managed through the Inventory Items system. Please use the inventory management endpoints to delete items.'
    });
  } catch (error) {
    console.error('Delete part error:', error);
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

// Get where a part is used
router.get('/parts/:id/where-used', async (req, res) => {
  try {
    const { id } = req.params;
    const usage = await whereUsed(id);
    res.json(usage);
  } catch (error) {
    console.error('Where used error:', error);
    res.status(500).json({ error: 'Failed to fetch part usage' });
  }
});

// ========================================
// BOM MANAGEMENT ROUTES
// ========================================

// Get all BOMs with pagination and search
router.get('/boms', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? '';
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 100);
    const offset = (page - 1) * pageSize;
    
    const where = search 
      ? ilike(boms.code, `%${search}%`)
      : undefined;

    const [rows, total] = await Promise.all([
      db.query.boms.findMany({
        where: where as any,
        with: {
          parentInventoryItem: true,
          revisions: {
            limit: 5,
            orderBy: desc(bomRevisions.createdAt),
          },
        },
        limit: pageSize,
        offset,
      }),
      db.select({ c: count() })
        .from(boms)
        .where(where as any),
    ]);

    res.json({ 
      data: rows, 
      page, 
      pageSize, 
      total: total[0]?.c ?? 0 
    });
  } catch (error) {
    console.error('Get BOMs error:', error);
    res.status(500).json({ error: 'Failed to fetch BOMs' });
  }
});

// Get single BOM with all revisions
router.get('/boms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bom = await db.query.boms.findFirst({
      where: eq(boms.id, id),
      with: {
        parentInventoryItem: true,
        revisions: {
          orderBy: desc(bomRevisions.createdAt),
        },
      },
    });

    if (!bom) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    res.json(bom);
  } catch (error) {
    console.error('Get BOM error:', error);
    res.status(500).json({ error: 'Failed to fetch BOM' });
  }
});

// Create new BOM
router.post('/boms', async (req, res) => {
  try {
    const bomData = insertBomSchema.parse(req.body);
    const [newBom] = await db.insert(boms).values(bomData).returning();
    res.status(201).json(newBom);
  } catch (error) {
    console.error('Create BOM error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid BOM data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to create BOM' });
  }
});

// Update BOM
router.put('/boms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bomData = insertBomSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(boms)
      .set({ ...bomData, updatedAt: new Date() })
      .where(eq(boms.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update BOM error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid BOM data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to update BOM' });
  }
});

// Delete BOM (cascades to revisions and lines)
router.delete('/boms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(boms).where(eq(boms.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete BOM error:', error);
    res.status(500).json({ error: 'Failed to delete BOM' });
  }
});

// ========================================
// BOM REVISION ROUTES
// ========================================

// Create new revision for a BOM
router.post('/boms/:bomId/revisions', async (req, res) => {
  try {
    const { bomId } = req.params;
    const revisionData = insertBomRevisionSchema.parse({
      ...req.body,
      bomId,
    });
    
    const [newRevision] = await db
      .insert(bomRevisions)
      .values(revisionData)
      .returning();
      
    res.status(201).json(newRevision);
  } catch (error) {
    console.error('Create revision error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid revision data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to create revision' });
  }
});

// Get revision details with lines
router.get('/revisions/:revId', async (req, res) => {
  try {
    const { revId } = req.params;
    const revision = await db.query.bomRevisions.findFirst({
      where: eq(bomRevisions.id, revId),
      with: {
        bom: {
          with: {
            parentInventoryItem: true,
          },
        },
        lines: {
          with: {
            childInventoryItem: true,
          },
          orderBy: desc(bomLines.operationSeq),
        },
      },
    });

    if (!revision) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    res.json(revision);
  } catch (error) {
    console.error('Get revision error:', error);
    res.status(500).json({ error: 'Failed to fetch revision' });
  }
});

// Update revision lines (replaces all lines)
router.post('/revisions/:revId/lines', async (req, res) => {
  try {
    const { revId } = req.params;
    const linesData = z.array(insertBomLineSchema.omit({ revisionId: true }))
      .parse(req.body.lines || []);

    // Delete existing lines
    await db.delete(bomLines).where(eq(bomLines.revisionId, revId));
    
    // Insert new lines
    if (linesData.length > 0) {
      await db.insert(bomLines).values(
        linesData.map(line => ({
          ...line,
          revisionId: revId,
        }))
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update revision lines error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid line data', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to update revision lines' });
  }
});

// Release a revision (makes it active, un-releases others for same BOM)
router.post('/revisions/:revId/release', async (req, res) => {
  try {
    const { revId } = req.params;
    const { effectiveFrom, effectiveTo } = req.body;

    const revision = await db.query.bomRevisions.findFirst({
      where: eq(bomRevisions.id, revId),
    });

    if (!revision) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    // Un-release all other revisions for this BOM
    await db
      .update(bomRevisions)
      .set({ isReleased: false })
      .where(eq(bomRevisions.bomId, revision.bomId));

    // Release this revision
    await db
      .update(bomRevisions)
      .set({
        isReleased: true,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        updatedAt: new Date(),
      })
      .where(eq(bomRevisions.id, revId));

    res.json({ success: true });
  } catch (error) {
    console.error('Release revision error:', error);
    res.status(500).json({ error: 'Failed to release revision' });
  }
});

// Explode BOM revision with rollups (recursive explosion)
router.get('/revisions/:revId/explode', async (req, res) => {
  try {
    const { revId } = req.params;
    const result = await explodeBOMRevisionWithRollups(revId);
    res.json(result);
  } catch (error) {
    console.error('Explode BOM error:', error);
    res.status(500).json({ error: 'Failed to explode BOM' });
  }
});

// Get BOM tree structure
router.get('/revisions/:revId/tree', async (req, res) => {
  try {
    const { revId } = req.params;
    const tree = await buildBOMTree(revId);
    res.json(tree);
  } catch (error) {
    console.error('Build BOM tree error:', error);
    res.status(500).json({ error: 'Failed to build BOM tree' });
  }
});

export default router;
