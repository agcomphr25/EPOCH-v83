import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { 
  inventoryItems,
  boms, 
  bomRevisions, 
  bomLines,
  bomDefinitions,
  bomItems,
  p2PurchaseOrderItems,
  p2PurchaseOrders,
  insertBomSchema,
  insertBomRevisionSchema,
  insertBomLineSchema,
  insertBomDefinitionSchema,
  insertBomItemSchema
} from '../../schema';
import { eq, ilike, desc, count, or, and, inArray, sql } from 'drizzle-orm';
import {
  explodeBOMRevisionWithRollups, 
  whereUsed, 
  buildBOMTree,
  buildStockBOMTree
} from '../db/queries/bom';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();

const draftBuilderBomComponentSchema = z.object({
  id: z.string().optional(),
  inventoryItemId: z.number().int().positive().nullable().optional(),
  partNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  quantity: z.number().positive().default(1),
  isManufactured: z.boolean().optional().default(false),
  firstDepartment: z.string().optional().nullable(),
  sourceLineId: z.string().optional().nullable(),
});

const draftBuilderBomImportSchema = z.object({
  draftId: z.string().min(1),
  draftName: z.string().optional().nullable(),
  revision: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  projectCode: z.string().optional().nullable(),
  projectName: z.string().optional().nullable(),
  activate: z.boolean().default(false),
  rootPart: z.object({
    inventoryItemId: z.number().int().positive().nullable().optional(),
    partNumber: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    sourceLineId: z.string().optional().nullable(),
  }),
  bom: z.object({
    id: z.string().min(1),
    name: z.string().optional().nullable(),
    revision: z.string().optional().nullable(),
    parts: z.array(z.object({
      id: z.string().optional(),
      inventoryItemId: z.number().int().positive().nullable().optional(),
      partNumber: z.string().optional().nullable(),
      description: z.string().optional().nullable(),
      bomItems: z.array(draftBuilderBomComponentSchema).optional().default([]),
    })).optional().default([]),
  }),
});

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBomCode(value: string): string {
  return value.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
}

function p2BomDepartment(value: unknown): string {
  const normalized = cleanText(value).toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized.includes('assembly')) return 'Assembly/Disassembly';
  if (normalized.includes('finish')) return 'Finish';
  if (normalized.includes('paint')) return 'Paint';
  if (normalized.includes('qc') || normalized.includes('quality')) return 'QC';
  if (normalized.includes('ship')) return 'Shipping';
  return 'Layup';
}

async function hasActiveP2BomForPart(partNumber: string): Promise<boolean> {
  if (!partNumber) return false;
  const [bom] = await db
    .select({ id: bomDefinitions.id })
    .from(bomDefinitions)
    .where(and(eq(bomDefinitions.sku, partNumber), eq(bomDefinitions.isActive, true)))
    .limit(1);
  return !!bom;
}

// ========================================
// PARTS MANAGEMENT ROUTES (Now uses Inventory Items)
// ========================================

// Get all parts (inventory items) with pagination and search
router.get('/parts', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? '';
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 5000), 50000);
    const offset = (page - 1) * pageSize;
    
    const activeFilter = eq(inventoryItems.isActive, true);
    const searchFilter = search 
      ? or(
          ilike(inventoryItems.agPartNumber, `%${search}%`),
          ilike(inventoryItems.sku, `%${search}%`),
          ilike(inventoryItems.name, `%${search}%`)
        )
      : undefined;

    const where = searchFilter ? and(activeFilter, searchFilter) : activeFilter;

    const [rows, total] = await Promise.all([
      db.select()
        .from(inventoryItems)
        .where(where)
        .orderBy(desc(inventoryItems.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ c: count() })
        .from(inventoryItems)
        .where(where),
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

router.post('/from-draft-builder', requirePermission('inventory.adjust'), async (req, res) => {
  try {
    const payload = draftBuilderBomImportSchema.parse(req.body);
    const rootInventory = payload.rootPart.inventoryItemId
      ? await db.query.inventoryItems.findFirst({
          where: eq(inventoryItems.id, payload.rootPart.inventoryItemId),
        })
      : cleanText(payload.rootPart.partNumber)
        ? await db.query.inventoryItems.findFirst({
            where: eq(inventoryItems.agPartNumber, cleanText(payload.rootPart.partNumber)),
          })
        : null;

    if (!rootInventory?.agPartNumber) {
      return res.status(400).json({
        error: 'Finalize the BOM root part to an inventory item before saving it to Robust BOM.',
      });
    }

    const rootPartNumber = rootInventory.agPartNumber;
    const rootDescription = cleanText(payload.rootPart.description) || rootInventory.name || rootPartNumber;
    const bomCode = normalizeBomCode(`${rootPartNumber}-${payload.bom.id}`) || normalizeBomCode(rootPartNumber);
    const revCode = cleanText(payload.bom.revision) || cleanText(payload.revision) || 'DRAFT';
    const rootPart = payload.bom.parts[0] ?? null;
    const componentCandidates = rootPart?.bomItems ?? [];
    const inventoryIds = Array.from(new Set(componentCandidates
      .map((component) => component.inventoryItemId)
      .filter((id): id is number => Number.isInteger(id) && id > 0)));
    const componentPartNumbers = Array.from(new Set(componentCandidates
      .map((component) => cleanText(component.partNumber))
      .filter(Boolean)));

    const [componentInventoryByIdRows, componentInventoryByPartRows] = await Promise.all([
      inventoryIds.length > 0
        ? db.select({
            id: inventoryItems.id,
            agPartNumber: inventoryItems.agPartNumber,
            name: inventoryItems.name,
          })
          .from(inventoryItems)
          .where(inArray(inventoryItems.id, inventoryIds))
        : Promise.resolve([]),
      componentPartNumbers.length > 0
        ? db.select({
            id: inventoryItems.id,
            agPartNumber: inventoryItems.agPartNumber,
            name: inventoryItems.name,
          })
          .from(inventoryItems)
          .where(inArray(inventoryItems.agPartNumber, componentPartNumbers))
        : Promise.resolve([]),
    ]);
    const componentById = new Map(componentInventoryByIdRows.map((item) => [item.id, item]));
    const componentByPartNumber = new Map(componentInventoryByPartRows.map((item) => [item.agPartNumber, item]));
    const missingComponents: string[] = [];
    const linesData = componentCandidates.map((component, index) => {
      const inventoryItem = component.inventoryItemId ? componentById.get(component.inventoryItemId) : undefined;
      const partNumber = inventoryItem?.agPartNumber ?? componentByPartNumber.get(cleanText(component.partNumber))?.agPartNumber ?? '';
      if (!partNumber) {
        missingComponents.push(cleanText(component.partNumber) || cleanText(component.description) || `component ${index + 1}`);
      }
      return {
        childPartAgNumber: partNumber,
        qtyPer: String(component.quantity || 1),
        scrapPct: '0',
        reference: cleanText(component.id) || `DB-${index + 1}`,
        operationSeq: (index + 1) * 10,
        notes: [
          cleanText(component.description),
          component.sourceLineId ? `Draft Builder line ${component.sourceLineId}` : null,
        ].filter(Boolean).join('\n'),
      };
    });

    if (missingComponents.length > 0) {
      return res.status(400).json({
        error: `Finalize or match these BOM components to inventory before saving to Robust BOM: ${missingComponents.join(', ')}`,
      });
    }

    const [existingBom] = await db
      .select()
      .from(boms)
      .where(and(eq(boms.parentPartAgNumber, rootPartNumber), eq(boms.code, bomCode)))
      .limit(1);

    const [savedBom] = existingBom
      ? await db
          .update(boms)
          .set({
            description: rootDescription,
            isActive: payload.activate ? true : existingBom.isActive,
            updatedAt: new Date(),
          })
          .where(eq(boms.id, existingBom.id))
          .returning()
      : await db
          .insert(boms)
          .values({
            parentPartAgNumber: rootPartNumber,
            code: bomCode,
            description: rootDescription,
            isActive: payload.activate,
          })
          .returning();

    const notes = [
      'Accepted from Draft Builder.',
      `Draft: ${payload.draftName || payload.draftId}`,
      payload.revision ? `Draft revision: ${payload.revision}` : null,
      payload.projectName || payload.projectCode ? `Project: ${payload.projectCode || ''} ${payload.projectName || ''}`.trim() : null,
      payload.projectId ? `Project ID: ${payload.projectId}` : null,
      payload.rootPart.sourceLineId ? `Root draft line: ${payload.rootPart.sourceLineId}` : null,
      payload.activate ? 'Pushed to P2 project BOM/Routing.' : 'Draft until pushed to P2 project.',
    ].filter(Boolean).join('\n');

    const [existingRevision] = await db
      .select()
      .from(bomRevisions)
      .where(and(eq(bomRevisions.bomId, savedBom.id), eq(bomRevisions.revCode, revCode)))
      .limit(1);

    const [savedRevision] = existingRevision
      ? await db
          .update(bomRevisions)
          .set({
            notes,
            isReleased: payload.activate ? true : existingRevision.isReleased,
            updatedAt: new Date(),
          })
          .where(eq(bomRevisions.id, existingRevision.id))
          .returning()
      : await db
          .insert(bomRevisions)
          .values({
            bomId: savedBom.id,
            revCode,
            notes,
            isReleased: payload.activate,
          })
          .returning();

    await db.delete(bomLines).where(eq(bomLines.revisionId, savedRevision.id));
    if (linesData.length > 0) {
      await db.insert(bomLines).values(linesData.map((line) => ({
        ...line,
        revisionId: savedRevision.id,
      })));
    }

    let p2PoBom: typeof bomDefinitions.$inferSelect | null = null;
    let p2PoBomItemCount = 0;
    let linkedP2PoIds: number[] = [];
    if (payload.activate) {
      const [existingP2Bom] = await db
        .select()
        .from(bomDefinitions)
        .where(eq(bomDefinitions.sku, rootPartNumber))
        .limit(1);

      const p2BomDescription = [
        rootDescription,
        payload.projectName || payload.projectCode ? `Project: ${payload.projectCode || ''} ${payload.projectName || ''}`.trim() : null,
        `Source Robust BOM: ${savedBom.id}`,
        `Source Draft Builder BOM: ${payload.bom.id}`,
      ].filter(Boolean).join('\n');

      const [savedP2Bom] = existingP2Bom
        ? await db
            .update(bomDefinitions)
            .set({
              modelName: rootInventory.name || rootDescription || rootPartNumber,
              revision: revCode,
              description: p2BomDescription,
              isActive: true,
              updatedAt: new Date(),
            })
            .where(eq(bomDefinitions.id, existingP2Bom.id))
            .returning()
        : await db
            .insert(bomDefinitions)
            .values({
              sku: rootPartNumber,
              modelName: rootInventory.name || rootDescription || rootPartNumber,
              revision: revCode,
              description: p2BomDescription,
              isActive: true,
            })
            .returning();

      p2PoBom = savedP2Bom ?? null;

      if (p2PoBom) {
        await db
          .update(bomItems)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(bomItems.bomId, p2PoBom.id));

        const componentPartNumbers = componentCandidates
          .map((component) => {
            const inventoryItem = component.inventoryItemId ? componentById.get(component.inventoryItemId) : undefined;
            return inventoryItem?.agPartNumber ?? componentByPartNumber.get(cleanText(component.partNumber))?.agPartNumber ?? '';
          })
          .filter(Boolean);
        const manufacturedComponentNumbers = componentCandidates
          .map((component, index) => component.isManufactured ? componentPartNumbers[index] : '')
          .filter(Boolean);
        const childBomRows = manufacturedComponentNumbers.length > 0
          ? await db
              .select()
              .from(bomDefinitions)
              .where(inArray(bomDefinitions.sku, manufacturedComponentNumbers))
          : [];
        const childBomBySku = new Map(childBomRows.map((childBom) => [childBom.sku, childBom]));

        const p2BomItems = componentCandidates.map((component, index) => {
          const partNumber = componentPartNumbers[index];
          const linkedInventory = component.inventoryItemId ? componentById.get(component.inventoryItemId) : undefined;
          const childBom = partNumber ? childBomBySku.get(partNumber) : undefined;
          return {
            bomId: p2PoBom!.id,
            partName: partNumber,
            quantity: component.quantity || 1,
            firstDept: p2BomDepartment(component.firstDepartment),
            itemType: component.isManufactured ? 'manufactured' : 'material',
            referenceBomId: childBom?.id ?? null,
            assemblyLevel: 0,
            quantityMultiplier: 1,
            notes: cleanText(component.description) || linkedInventory?.name || '',
            isActive: true,
            updatedAt: new Date(),
          };
        });

        if (p2BomItems.length > 0) {
          await db.insert(bomItems).values(p2BomItems);
          p2PoBomItemCount = p2BomItems.length;
        }

        const matchingPoItems = await db
          .select({
            poId: p2PurchaseOrderItems.poId,
          })
          .from(p2PurchaseOrderItems)
          .innerJoin(p2PurchaseOrders, eq(p2PurchaseOrderItems.poId, p2PurchaseOrders.id))
          .where(payload.projectId
            ? and(
                eq(p2PurchaseOrders.projectId, payload.projectId),
                or(
                  eq(p2PurchaseOrderItems.inventoryItemId, rootInventory.id),
                  eq(p2PurchaseOrderItems.partNumber, rootPartNumber),
                ),
              )
            : or(
                eq(p2PurchaseOrderItems.inventoryItemId, rootInventory.id),
                eq(p2PurchaseOrderItems.partNumber, rootPartNumber),
              ));

        linkedP2PoIds = Array.from(new Set(matchingPoItems.map((item) => item.poId).filter(Boolean)));
        for (const poId of linkedP2PoIds) {
          const poItems = await db
            .select({
              partNumber: p2PurchaseOrderItems.partNumber,
              inventoryItemId: p2PurchaseOrderItems.inventoryItemId,
            })
            .from(p2PurchaseOrderItems)
            .where(eq(p2PurchaseOrderItems.poId, poId));
          const inventoryIdsForPo = Array.from(new Set(poItems
            .map((item) => item.inventoryItemId)
            .filter((id): id is number => Number.isInteger(id) && id > 0)));
          const inventoryRowsForPo = inventoryIdsForPo.length > 0
            ? await db
                .select({
                  id: inventoryItems.id,
                  agPartNumber: inventoryItems.agPartNumber,
                })
                .from(inventoryItems)
                .where(inArray(inventoryItems.id, inventoryIdsForPo))
            : [];
          const inventoryPartById = new Map(inventoryRowsForPo.map((item) => [item.id, item.agPartNumber]));
          const allHaveBom = await Promise.all(poItems.map((item) =>
            hasActiveP2BomForPart(inventoryPartById.get(item.inventoryItemId ?? 0) || item.partNumber),
          ));
          if (allHaveBom.every(Boolean)) {
            await db
              .update(p2PurchaseOrders)
              .set({ bomConfigured: true, updatedAt: new Date() })
              .where(eq(p2PurchaseOrders.id, poId));
          }
        }
      }
    }

    res.status(existingBom ? 200 : 201).json({
      bom: savedBom,
      revision: savedRevision,
      lineCount: linesData.length,
      p2PoBom,
      p2PoBomItemCount,
      linkedP2PoIds,
      status: payload.activate ? 'active' : 'draft',
    });
  } catch (error) {
    console.error('Accept Draft Builder BOM error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid Draft Builder BOM data',
        details: error.errors,
      });
    }
    res.status(500).json({ error: 'Failed to save Draft Builder BOM to Robust BOM' });
  }
});

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

// Toggle BOM active status
router.patch('/boms/:id/toggle-active', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [currentBom] = await db
      .select({ isActive: boms.isActive })
      .from(boms)
      .where(eq(boms.id, id));
    
    if (!currentBom) {
      return res.status(404).json({ error: 'BOM not found' });
    }
    
    const [updated] = await db
      .update(boms)
      .set({ isActive: !currentBom.isActive, updatedAt: new Date() })
      .where(eq(boms.id, id))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error('Toggle BOM active status error:', error);
    res.status(500).json({ error: 'Failed to toggle BOM active status' });
  }
});

// Delete BOM (cascades to revisions and lines)
router.delete('/boms/:id', async (req, res) => {
  try {
    const { id} = req.params;
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
    console.log('🌳 BOM Tree for revision', revId, ':', JSON.stringify(tree, null, 2));
    res.json(tree);
  } catch (error) {
    console.error('Build BOM tree error:', error);
    res.status(500).json({ error: 'Failed to build BOM tree' });
  }
});

// ========================================
// P2 PO BOM ROUTES (BOMs created for P2 Purchase Orders)
// ========================================

router.get('/p2-po-boms', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? '';

    const allBomDefs = await db.select()
      .from(bomDefinitions)
      .where(eq(bomDefinitions.isActive, true))
      .orderBy(desc(bomDefinitions.createdAt));

    const poItemPartNumbers = await db.select({
      partNumber: p2PurchaseOrderItems.partNumber,
      inventoryItemId: p2PurchaseOrderItems.inventoryItemId,
    })
      .from(p2PurchaseOrderItems);
    const inventoryIds = Array.from(new Set(poItemPartNumbers.map(p => p.inventoryItemId).filter(Boolean))) as number[];
    const linkedInventoryById = inventoryIds.length > 0
      ? await db.select({
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.id, inventoryIds))
      : [];
    const candidatePartNumbers = Array.from(new Set(allBomDefs.flatMap(bom => {
      const sku = String(bom.sku || '').trim();
      const baseSku = sku.replace(/\s+Rev\s+.+$/i, '');
      return [sku, baseSku].filter(Boolean);
    })));
    const linkedInventoryBySku = candidatePartNumbers.length > 0
      ? await db.select({
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.agPartNumber, candidatePartNumbers))
      : [];
    const linkedInventory = [...linkedInventoryById, ...linkedInventoryBySku];
    const inventoryById = new Map(linkedInventory.map(item => [item.id, item]));
    const inventoryByPartNumber = new Map(linkedInventory.map(item => [item.agPartNumber, item]));
    const poPartSet = new Set<string>();
    poItemPartNumbers.forEach(p => {
      if (p.partNumber) poPartSet.add(p.partNumber);
      const internalPart = p.inventoryItemId ? inventoryById.get(p.inventoryItemId)?.agPartNumber : null;
      if (internalPart) poPartSet.add(internalPart);
    });

    const p2Boms = allBomDefs.filter(bom => 
      bom.sku && poPartSet.has(bom.sku)
    ).map(bom => {
      const baseSku = String(bom.sku || '').replace(/\s+Rev\s+.+$/i, '');
      const internalPart = inventoryByPartNumber.get(String(bom.sku || '')) || inventoryByPartNumber.get(baseSku);
      return {
        ...bom,
        internalPartNumber: internalPart?.agPartNumber || null,
        internalPartName: internalPart?.name || null,
        inventoryItemId: internalPart?.id || null,
      };
    });

    const filtered = search
      ? p2Boms.filter(bom => {
          const s = search.toLowerCase();
          return (
            bom.modelName?.toLowerCase().includes(s) ||
            bom.sku?.toLowerCase().includes(s) ||
            bom.internalPartNumber?.toLowerCase().includes(s) ||
            bom.internalPartName?.toLowerCase().includes(s) ||
            bom.description?.toLowerCase().includes(s)
          );
        })
      : p2Boms;

    res.json(filtered);
  } catch (error) {
    console.error('Get P2 PO BOMs error:', error);
    res.status(500).json({ error: 'Failed to fetch P2 PO BOMs' });
  }
});

router.get('/p2-po-boms/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [bom] = await db.select()
      .from(bomDefinitions)
      .where(eq(bomDefinitions.id, id));

    if (!bom) {
      return res.status(404).json({ error: 'P2 PO BOM not found' });
    }

    const items = await db.select()
      .from(bomItems)
      .where(and(eq(bomItems.bomId, id), eq(bomItems.isActive, true)))
      .orderBy(bomItems.assemblyLevel, bomItems.partName);

    const baseSku = String(bom.sku || '').replace(/\s+Rev\s+.+$/i, '');
    const [internalPart] = bom.sku
      ? await db.select({
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.agPartNumber, [bom.sku, baseSku]))
        .limit(1)
      : [];

    const poItems = bom.sku
      ? await db.select({
          poId: p2PurchaseOrderItems.poId,
          poNumber: p2PurchaseOrders.poNumber,
          partNumber: p2PurchaseOrderItems.partNumber,
        })
        .from(p2PurchaseOrderItems)
        .innerJoin(p2PurchaseOrders, eq(p2PurchaseOrderItems.poId, p2PurchaseOrders.id))
        .where(internalPart
          ? inArray(p2PurchaseOrderItems.inventoryItemId, [internalPart.id])
          : eq(p2PurchaseOrderItems.partNumber, bom.sku))
      : [];

    res.json({
      ...bom,
      internalPartNumber: internalPart?.agPartNumber || null,
      internalPartName: internalPart?.name || null,
      inventoryItemId: internalPart?.id || null,
      items,
      linkedPurchaseOrders: poItems,
    });
  } catch (error) {
    console.error('Get P2 PO BOM error:', error);
    res.status(500).json({ error: 'Failed to fetch P2 PO BOM' });
  }
});

router.put('/p2-po-boms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      sku: req.body.sku,
      modelName: req.body.modelName,
      revision: req.body.revision,
      description: req.body.description,
      updatedAt: new Date(),
    };

    const [updated] = await db.update(bomDefinitions)
      .set(updateData)
      .where(eq(bomDefinitions.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'P2 PO BOM not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update P2 PO BOM error:', error);
    res.status(500).json({ error: 'Failed to update P2 PO BOM' });
  }
});

router.post('/p2-po-boms/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const quantity = Number.parseFloat(String(req.body.quantity ?? ''));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    const [newItem] = await db.insert(bomItems)
      .values({
        bomId: id,
        partName: String(req.body.partName || '').trim(),
        quantity,
        firstDept: String(req.body.firstDept || 'Layup').trim(),
        itemType: String(req.body.itemType || 'material').trim(),
        notes: req.body.notes || '',
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();

    res.json(newItem);
  } catch (error) {
    console.error('Add P2 PO BOM item error:', error);
    res.status(500).json({ error: 'Failed to add P2 PO BOM item' });
  }
});

router.put('/p2-po-boms/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;
    const quantity = Number.parseFloat(String(req.body.quantity ?? ''));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    const [updatedItem] = await db.update(bomItems)
      .set({
        partName: String(req.body.partName || '').trim(),
        quantity,
        firstDept: String(req.body.firstDept || 'Layup').trim(),
        itemType: String(req.body.itemType || 'material').trim(),
        notes: req.body.notes || '',
        updatedAt: new Date(),
      })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)))
      .returning();

    if (!updatedItem) {
      return res.status(404).json({ error: 'P2 PO BOM item not found' });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Update P2 PO BOM item error:', error);
    res.status(500).json({ error: 'Failed to update P2 PO BOM item' });
  }
});

router.delete('/p2-po-boms/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;

    await db.update(bomItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete P2 PO BOM item error:', error);
    res.status(500).json({ error: 'Failed to delete P2 PO BOM item' });
  }
});

// ========================================
// STOCK BOM MANAGEMENT ROUTES (Simple BOM System for Stocks)
// ========================================

// Get all stock BOMs
router.get('/stock-boms', async (req, res) => {
  try {
    const search = (req.query.search as string) ?? '';
    
    const where = search 
      ? or(
          ilike(bomDefinitions.modelName, `%${search}%`),
          ilike(bomDefinitions.sku, `%${search}%`),
          ilike(bomDefinitions.description, `%${search}%`)
        )
      : undefined;

    const boms = await db.select()
      .from(bomDefinitions)
      .where(where ? and(eq(bomDefinitions.isActive, true), where) : eq(bomDefinitions.isActive, true))
      .orderBy(desc(bomDefinitions.createdAt));

    res.json(boms);
  } catch (error) {
    console.error('Get stock BOMs error:', error);
    res.status(500).json({ error: 'Failed to fetch stock BOMs' });
  }
});

// Get single stock BOM with items
router.get('/stock-boms/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [bom] = await db.select()
      .from(bomDefinitions)
      .where(eq(bomDefinitions.id, id));

    if (!bom) {
      return res.status(404).json({ error: 'Stock BOM not found' });
    }

    const items = await db.select()
      .from(bomItems)
      .where(and(eq(bomItems.bomId, id), eq(bomItems.isActive, true)))
      .orderBy(bomItems.assemblyLevel, bomItems.partName);

    res.json({ ...bom, items });
  } catch (error) {
    console.error('Get stock BOM error:', error);
    res.status(500).json({ error: 'Failed to fetch stock BOM' });
  }
});

// Create stock BOM
router.post('/stock-boms', async (req, res) => {
  try {
    const bomData = insertBomDefinitionSchema.parse(req.body);

    const [newBom] = await db.insert(bomDefinitions)
      .values({
        ...bomData,
        updatedAt: new Date(),
      })
      .returning();

    res.json(newBom);
  } catch (error: any) {
    console.error('Create stock BOM error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create stock BOM' });
  }
});

// Update stock BOM
router.put('/stock-boms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bomData = insertBomDefinitionSchema.partial().parse(req.body);

    const [updatedBom] = await db.update(bomDefinitions)
      .set({
        ...bomData,
        updatedAt: new Date(),
      })
      .where(eq(bomDefinitions.id, id))
      .returning();

    if (!updatedBom) {
      return res.status(404).json({ error: 'Stock BOM not found' });
    }

    res.json(updatedBom);
  } catch (error: any) {
    console.error('Update stock BOM error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update stock BOM' });
  }
});

// Delete stock BOM (soft delete)
router.delete('/stock-boms/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.update(bomDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bomDefinitions.id, id));

    // Also soft delete all items
    await db.update(bomItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bomItems.bomId, id));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete stock BOM error:', error);
    res.status(500).json({ error: 'Failed to delete stock BOM' });
  }
});

// Add item to stock BOM
router.post('/stock-boms/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const itemData = insertBomItemSchema.parse(req.body);

    const [newItem] = await db.insert(bomItems)
      .values({
        ...itemData,
        bomId: id,
        updatedAt: new Date(),
      })
      .returning();

    res.json(newItem);
  } catch (error: any) {
    console.error('Add BOM item error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add BOM item' });
  }
});

// Update BOM item
router.put('/stock-boms/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;
    const itemData = insertBomItemSchema.partial().parse(req.body);

    const [updatedItem] = await db.update(bomItems)
      .set({
        ...itemData,
        updatedAt: new Date(),
      })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)))
      .returning();

    if (!updatedItem) {
      return res.status(404).json({ error: 'BOM item not found' });
    }

    res.json(updatedItem);
  } catch (error: any) {
    console.error('Update BOM item error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update BOM item' });
  }
});

// Delete BOM item (soft delete)
router.delete('/stock-boms/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;

    await db.update(bomItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(bomItems.id, itemId), eq(bomItems.bomId, bomId)));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete BOM item error:', error);
    res.status(500).json({ error: 'Failed to delete BOM item' });
  }
});

// Get stock BOM tree with cost summary
router.get('/stock-boms/:id/tree', async (req, res) => {
  try {
    const { id } = req.params;
    const tree = await buildStockBOMTree(id);
    res.json(tree);
  } catch (error) {
    console.error('Build stock BOM tree error:', error);
    res.status(500).json({ error: 'Failed to build stock BOM tree' });
  }
});

export default router;
