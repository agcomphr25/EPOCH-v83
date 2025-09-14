import { db } from '../../db';
import { 
  robustParts, 
  robustBomLines, 
  partCostHistory, 
  partAuditLog, 
  bomAuditLog,
  type RobustPart,
  type RobustBomLine,
  type PartCostHistory,
  type InsertRobustPart,
  type InsertRobustBomLine
} from '@shared/schema';
import { eq, and, or, desc, asc, sql, like, inArray } from 'drizzle-orm';

export class RobustBOMService {

  // ============================================================================
  // PARTS MANAGEMENT
  // ============================================================================

  /**
   * Search parts with pagination and filtering
   */
  async searchParts({
    query = '',
    type = 'ALL',
    lifecycleStatus = 'ALL',
    page = 1,
    pageSize = 50
  }: {
    query?: string;
    type?: string;
    lifecycleStatus?: string;
    page?: number;
    pageSize?: number;
  }) {
    const offset = (page - 1) * pageSize;
    
    // Build where conditions
    const conditions = [];
    
    if (query) {
      conditions.push(
        or(
          like(robustParts.sku, `%${query}%`),
          like(robustParts.name, `%${query}%`),
          like(robustParts.description, `%${query}%`)
        )
      );
    }
    
    if (type !== 'ALL') {
      conditions.push(eq(robustParts.type, type));
    }
    
    if (lifecycleStatus !== 'ALL') {
      conditions.push(eq(robustParts.lifecycleStatus, lifecycleStatus as any));
    }

    // Get parts with pagination
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [parts, [{ count }]] = await Promise.all([
      db.select()
        .from(robustParts)
        .where(whereClause)
        .orderBy(asc(robustParts.sku))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` })
        .from(robustParts)
        .where(whereClause)
    ]);

    return {
      items: parts,
      total: Number(count),
      page,
      pageSize,
      totalPages: Math.ceil(Number(count) / pageSize)
    };
  }

  /**
   * Get part by ID with related data
   */
  async getPartById(id: string, includeHistory = false) {
    const part = await db.query.robustParts.findFirst({
      where: eq(robustParts.id, id),
      with: {
        asParentLines: {
          with: {
            childPart: true
          }
        },
        asChildLines: {
          with: {
            parentPart: true
          }
        }
      }
    });

    if (!part) {
      throw new Error(`Part with ID ${id} not found`);
    }

    let costHistory: PartCostHistory[] = [];
    if (includeHistory) {
      costHistory = await db.select()
        .from(partCostHistory)
        .where(eq(partCostHistory.partId, id))
        .orderBy(desc(partCostHistory.effectiveDate))
        .limit(10);
    }

    return { ...part, costHistory };
  }

  /**
   * Create new part with audit trail
   */
  async createPart(partData: InsertRobustPart, createdBy: string) {
    // Check for SKU uniqueness
    const existingPart = await db.select()
      .from(robustParts)
      .where(eq(robustParts.sku, partData.sku))
      .limit(1);

    if (existingPart.length > 0) {
      throw new Error(`Part with SKU "${partData.sku}" already exists`);
    }

    // Validate UoM consistency
    if (partData.purchaseUom !== partData.uom && !partData.conversionFactor) {
      throw new Error('Conversion factor is required when purchase UoM differs from usage UoM');
    }

    const [newPart] = await db.insert(robustParts)
      .values({
        ...partData,
        createdBy,
        updatedBy: createdBy
      })
      .returning();

    // Log part creation
    await db.insert(partAuditLog).values({
      partId: newPart.id,
      action: 'CREATE',
      changeReason: 'Part created',
      createdBy
    });

    // Log initial cost if provided
    if (partData.stdCost > 0) {
      await db.insert(partCostHistory).values({
        partId: newPart.id,
        oldCost: null,
        newCost: partData.stdCost,
        changeReason: 'INITIAL_COST',
        sourceReference: 'Part Creation',
        createdBy
      });
    }

    return newPart;
  }

  /**
   * Update part with audit trail
   */
  async updatePart(id: string, updates: Partial<InsertRobustPart>, updatedBy: string, changeReason?: string) {
    // Get current part for comparison
    const currentPart = await this.getPartById(id);
    
    // Track cost changes
    if (updates.stdCost !== undefined && updates.stdCost !== currentPart.stdCost) {
      await db.insert(partCostHistory).values({
        partId: id,
        oldCost: currentPart.stdCost,
        newCost: updates.stdCost,
        changeReason: 'MANUAL_UPDATE',
        sourceReference: changeReason || 'Manual update',
        createdBy: updatedBy
      });
    }

    // Update part
    const [updatedPart] = await db.update(robustParts)
      .set({
        ...updates,
        updatedBy,
        updatedAt: sql`NOW()`
      })
      .where(eq(robustParts.id, id))
      .returning();

    // Log changes
    for (const [field, newValue] of Object.entries(updates)) {
      const oldValue = currentPart[field as keyof RobustPart];
      if (oldValue !== newValue) {
        await db.insert(partAuditLog).values({
          partId: id,
          action: 'UPDATE',
          fieldName: field,
          oldValue: String(oldValue || ''),
          newValue: String(newValue || ''),
          changeReason: changeReason || 'Manual update',
          createdBy: updatedBy
        });
      }
    }

    return updatedPart;
  }

  /**
   * Update part lifecycle status with validation
   */
  async updatePartLifecycle(id: string, lifecycleStatus: string, updatedBy: string, reason?: string) {
    const currentPart = await this.getPartById(id);

    // Validate lifecycle transition
    if (lifecycleStatus === 'OBSOLETE' && currentPart.lifecycleStatus === 'ACTIVE') {
      // Check if part is used in active BOMs
      const activeBomUsage = await db.select()
        .from(robustBomLines)
        .where(and(
          eq(robustBomLines.childPartId, id),
          eq(robustBomLines.isActive, true)
        ))
        .limit(1);

      if (activeBomUsage.length > 0) {
        throw new Error('Cannot obsolete part that is used in active BOMs. Please update BOMs first.');
      }
    }

    const updates: any = { lifecycleStatus };
    if (lifecycleStatus === 'OBSOLETE') {
      updates.obsoleteDate = sql`NOW()`;
    }

    return this.updatePart(id, updates, updatedBy, reason || `Lifecycle changed to ${lifecycleStatus}`);
  }

  // ============================================================================
  // BOM OPERATIONS
  // ============================================================================

  /**
   * Get complete BOM tree structure with cost rollup
   */
  async getBomTree(rootPartId: string, includeInactive = false): Promise<any> {
    const rootPart = await this.getPartById(rootPartId);
    
    const buildTree = async (partId: string, level = 0): Promise<any> => {
      if (level > 4) {
        throw new Error('Maximum BOM depth of 4 levels exceeded');
      }

      // Get BOM lines for this part
      const bomLines = await db.query.robustBomLines.findMany({
        where: and(
          eq(robustBomLines.parentPartId, partId),
          includeInactive ? undefined : eq(robustBomLines.isActive, true)
        ),
        with: {
          childPart: true
        },
        orderBy: [asc(robustBomLines.sortOrder), asc(robustBomLines.createdAt)]
      });

      // Build children recursively
      const children = [];
      for (const line of bomLines) {
        const childTree = await buildTree(line.childPartId, level + 1);
        children.push({
          ...line,
          childPart: line.childPart,
          children: childTree.children,
          extendedCost: line.qtyPer * line.childPart.stdCost * (1 + line.scrapPct / 100)
        });
      }

      return { children };
    };

    const tree = await buildTree(rootPartId);
    return {
      rootPart,
      children: tree.children,
      totalCost: await this.calculateRolledUpCost(rootPartId)
    };
  }

  /**
   * Calculate rolled-up cost with caching for performance
   */
  async calculateRolledUpCost(partId: string, costCache = new Map<string, number>()): Promise<number> {
    // Check cache first
    if (costCache.has(partId)) {
      return costCache.get(partId)!;
    }

    // Get part info
    const part = await db.query.robustParts.findFirst({
      where: eq(robustParts.id, partId)
    });

    if (!part) {
      throw new Error(`Part ${partId} not found`);
    }

    // Get BOM lines
    const bomLines = await db.select()
      .from(robustBomLines)
      .where(and(
        eq(robustBomLines.parentPartId, partId),
        eq(robustBomLines.isActive, true)
      ));

    // If no BOM lines, return part's standard cost
    if (bomLines.length === 0) {
      costCache.set(partId, part.stdCost);
      return part.stdCost;
    }

    // Calculate rolled-up cost
    let totalCost = part.stdCost; // Start with part's own cost
    
    for (const line of bomLines) {
      const childCost = await this.calculateRolledUpCost(line.childPartId, costCache);
      const lineCost = childCost * line.qtyPer * (1 + line.scrapPct / 100);
      totalCost += lineCost;
    }

    costCache.set(partId, totalCost);
    return totalCost;
  }

  /**
   * Add BOM line with validation
   */
  async addBomLine(bomLineData: InsertRobustBomLine, createdBy: string) {
    // Validate parts exist
    const [parentPart, childPart] = await Promise.all([
      this.getPartById(bomLineData.parentPartId),
      this.getPartById(bomLineData.childPartId)
    ]);

    // Prevent circular references
    await this.validateNoCircularReference(bomLineData.parentPartId, bomLineData.childPartId);

    // Validate UoM consistency
    if (bomLineData.uom !== childPart.uom) {
      console.warn(`UoM mismatch: BOM line uses ${bomLineData.uom}, part uses ${childPart.uom}`);
    }

    // Check quantity constraints
    if (childPart.minQuantity && bomLineData.qtyPer < childPart.minQuantity) {
      throw new Error(`Quantity ${bomLineData.qtyPer} is below minimum ${childPart.minQuantity} for part ${childPart.sku}`);
    }
    
    if (childPart.maxQuantity && bomLineData.qtyPer > childPart.maxQuantity) {
      throw new Error(`Quantity ${bomLineData.qtyPer} exceeds maximum ${childPart.maxQuantity} for part ${childPart.sku}`);
    }

    // Create BOM line
    const [bomLine] = await db.insert(robustBomLines)
      .values({
        ...bomLineData,
        createdBy,
        updatedBy: createdBy
      })
      .returning();

    // Log BOM change
    await db.insert(bomAuditLog).values({
      bomLineId: bomLine.id,
      parentPartId: bomLineData.parentPartId,
      action: 'ADD_LINE',
      details: {
        childPartId: bomLineData.childPartId,
        childPartSku: childPart.sku,
        quantity: bomLineData.qtyPer,
        uom: bomLineData.uom
      },
      changeReason: 'BOM line added',
      createdBy
    });

    return bomLine;
  }

  /**
   * Validate no circular references in BOM structure
   */
  private async validateNoCircularReference(parentPartId: string, childPartId: string) {
    if (parentPartId === childPartId) {
      throw new Error('A part cannot be a component of itself');
    }

    // Check if parent part is used anywhere in child's BOM tree
    const checkCircular = async (checkPartId: string, visited = new Set<string>()): Promise<boolean> => {
      if (visited.has(checkPartId)) {
        return true; // Circular reference found
      }

      if (checkPartId === parentPartId) {
        return true; // Found the parent in the child's tree
      }

      visited.add(checkPartId);

      const bomLines = await db.select()
        .from(robustBomLines)
        .where(and(
          eq(robustBomLines.parentPartId, checkPartId),
          eq(robustBomLines.isActive, true)
        ));

      for (const line of bomLines) {
        if (await checkCircular(line.childPartId, new Set(visited))) {
          return true;
        }
      }

      return false;
    };

    if (await checkCircular(childPartId)) {
      throw new Error('Adding this BOM line would create a circular reference');
    }
  }

  /**
   * Get where-used information for a part
   */
  async getWhereUsed(partId: string) {
    const whereUsed = await db.query.robustBomLines.findMany({
      where: and(
        eq(robustBomLines.childPartId, partId),
        eq(robustBomLines.isActive, true)
      ),
      with: {
        parentPart: true
      }
    });

    return whereUsed.map((line: any) => ({
      ...line,
      parentPart: line.parentPart,
      extendedQuantity: line.qtyPer * (1 + line.scrapPct / 100)
    }));
  }

  /**
   * Clone BOM structure to new parent part
   */
  async cloneBom(sourcePartId: string, targetPartId: string, createdBy: string) {
    // Validate parts exist
    const [sourcePart, targetPart] = await Promise.all([
      this.getPartById(sourcePartId),
      this.getPartById(targetPartId)
    ]);

    // Get source BOM structure
    const sourceBomLines = await db.select()
      .from(robustBomLines)
      .where(and(
        eq(robustBomLines.parentPartId, sourcePartId),
        eq(robustBomLines.isActive, true)
      ))
      .orderBy(asc(robustBomLines.sortOrder));

    // Clone each BOM line
    const clonedLines = [];
    for (const line of sourceBomLines) {
      const clonedLine = await this.addBomLine({
        parentPartId: targetPartId,
        childPartId: line.childPartId,
        qtyPer: line.qtyPer,
        uom: line.uom,
        scrapPct: line.scrapPct,
        notes: line.notes ? `${line.notes} (Cloned from ${sourcePart.sku})` : `Cloned from ${sourcePart.sku}`,
        level: line.level,
        sortOrder: line.sortOrder
      }, createdBy);
      
      clonedLines.push(clonedLine);
    }

    // Log BOM clone operation
    await db.insert(bomAuditLog).values({
      parentPartId: targetPartId,
      action: 'CLONE_BOM',
      details: {
        sourcePartId,
        sourcePartSku: sourcePart.sku,
        linesCloned: clonedLines.length
      },
      changeReason: `BOM cloned from ${sourcePart.sku}`,
      createdBy
    });

    return {
      clonedLines: clonedLines.length,
      targetPart,
      sourcePart
    };
  }

  /**
   * Get cost history for a part
   */
  async getPartCostHistory(partId: string, limit = 50) {
    return await db.select()
      .from(partCostHistory)
      .where(eq(partCostHistory.partId, partId))
      .orderBy(desc(partCostHistory.effectiveDate))
      .limit(limit);
  }

  /**
   * Get audit log for a part
   */
  async getPartAuditLog(partId: string, limit = 100) {
    return await db.select()
      .from(partAuditLog)
      .where(eq(partAuditLog.partId, partId))
      .orderBy(desc(partAuditLog.createdAt))
      .limit(limit);
  }
}

export const robustBomService = new RobustBOMService();