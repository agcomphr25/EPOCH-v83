import { db } from '../../db';
import { 
  inventoryItems, 
  inventoryBalances, 
  inventoryTransactions,
  outsideProcessingLocations,
  outsideProcessingJobs,
  vendorParts,
  mrpRequirements,
  type InventoryItem,
  type InventoryBalance,
  type InventoryTransaction,
  type OutsideProcessingLocation,
  type OutsideProcessingJob,
  type VendorPart,
  type MrpRequirement
} from '@shared/schema';
import { 
  insertInventoryItemSchema,
  insertInventoryBalanceSchema,
  insertInventoryTransactionSchema,
  insertOutsideProcessingLocationSchema,
  insertOutsideProcessingJobSchema,
  insertVendorPartSchema,
  type InsertInventoryItem,
  type InsertInventoryBalance,
  type InsertInventoryTransaction,
  type InsertOutsideProcessingLocation,
  type InsertOutsideProcessingJob,
  type InsertVendorPart
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Enhanced Storage Interface - Completely Independent from Legacy
 * ============================================================
 * This storage interface operates on enhanced tables only and has
 * no dependencies on legacy robust_parts, robustBomLines, or allOrders
 */
export class EnhancedStorage {
  
  // INVENTORY ITEMS MANAGEMENT (Enhanced Only)
  // ==========================================
  
  async getAllInventoryItems(): Promise<InventoryItem[]> {
    return await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isActive, true))
      .orderBy(inventoryItems.agPartNumber);
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, id),
        eq(inventoryItems.isActive, true)
      ));
    return item;
  }

  async getInventoryItemByPartNumber(partId: string): Promise<InventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.agPartNumber, partId),
        eq(inventoryItems.isActive, true)
      ));
    return item;
  }

  async createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [item] = await db
      .insert(inventoryItems)
      .values({
        ...cleanData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return item;
  }

  async updateInventoryItem(id: number, data: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const [item] = await db
      .update(inventoryItems)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, id))
      .returning();

    if (!item) {
      throw new Error(`Inventory item ${id} not found`);
    }
    return item;
  }

  async deleteInventoryItem(id: number): Promise<void> {
    await db
      .update(inventoryItems)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, id));
  }

  // INVENTORY BALANCES (Enhanced Only)
  // ==================================

  async getAllInventoryBalances(): Promise<InventoryBalance[]> {
    return await db
      .select()
      .from(inventoryBalances)
      .orderBy(inventoryBalances.agPartNumber);
  }

  async getInventoryBalanceByPart(partId: string, locationId?: string): Promise<InventoryBalance | undefined> {
    let whereCondition = eq(inventoryBalances.agPartNumber, partId);
    
    if (locationId) {
      whereCondition = and(whereCondition, eq(inventoryBalances.locationId, locationId));
    }

    const [balance] = await db
      .select()
      .from(inventoryBalances)
      .where(whereCondition);
    return balance;
  }

  async updateOrCreateInventoryBalance(
    agPartNumber: string, 
    locationId: string, 
    quantityChange: number,
    allocationStatus: 'available' | 'allocated' | 'committed' | 'consumed' = 'available'
  ): Promise<InventoryBalance> {
    const existing = await this.getInventoryBalanceByPart(agPartNumber, locationId);
    
    if (existing) {
      // Update existing balance
      const updateData: any = { updatedAt: new Date() };
      
      switch (allocationStatus) {
        case 'available':
          updateData.availableQuantity = existing.availableQuantity + quantityChange;
          break;
        case 'allocated':
          updateData.allocatedQuantity = existing.allocatedQuantity + quantityChange;
          break;
        case 'committed':
          updateData.committedQuantity = existing.committedQuantity + quantityChange;
          break;
        case 'consumed':
          updateData.consumedQuantity = existing.consumedQuantity + quantityChange;
          break;
      }

      const [updated] = await db
        .update(inventoryBalances)
        .set(updateData)
        .where(and(
          eq(inventoryBalances.agPartNumber, agPartNumber),
          eq(inventoryBalances.locationId, locationId)
        ))
        .returning();
      return updated;
    } else {
      // Create new balance
      const newBalance: InsertInventoryBalance = {
        agPartNumber,
        locationId,
        availableQuantity: allocationStatus === 'available' ? quantityChange : 0,
        allocatedQuantity: allocationStatus === 'allocated' ? quantityChange : 0,
        committedQuantity: allocationStatus === 'committed' ? quantityChange : 0,
        consumedQuantity: allocationStatus === 'consumed' ? quantityChange : 0,
        unitCost: 0, // Default, should be updated separately
      };

      const [created] = await db
        .insert(inventoryBalances)
        .values(newBalance)
        .returning();
      return created;
    }
  }

  // INVENTORY TRANSACTIONS (Enhanced Only)  
  // ======================================

  async getAllInventoryTransactions(): Promise<InventoryTransaction[]> {
    return await db
      .select()
      .from(inventoryTransactions)
      .orderBy(desc(inventoryTransactions.transactionDate));
  }

  async createInventoryTransaction(data: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [transaction] = await db
      .insert(inventoryTransactions)
      .values({
        ...cleanData,
        transactionDate: cleanData.transactionDate || new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Update inventory balance based on transaction
    await this.updateOrCreateInventoryBalance(
      transaction.agPartNumber,
      transaction.locationId || 'MAIN',
      transaction.transactionType === 'IN' ? transaction.quantity : -transaction.quantity,
      'available'
    );

    return transaction;
  }

  // ENHANCED MRP SYSTEM (Independent Calculations)
  // ==============================================

  async getAllMRPRequirements(): Promise<MrpRequirement[]> {
    return await db
      .select()
      .from(mrpRequirements)
      .orderBy(mrpRequirements.requiredDate);
  }

  async calculateEnhancedMRP(): Promise<{
    calculationId: string;
    timestamp: Date;
    requirementsGenerated: number;
    shortagesIdentified: number;
    summary: string;
  }> {
    const calculationId = `ENH-MRP-${Date.now()}`;
    const timestamp = new Date();
    
    // Enhanced MRP Logic - completely independent from legacy
    const allBalances = await this.getAllInventoryBalances();
    const lowStockItems = allBalances.filter(b => b.availableQuantity < (b.minStockLevel || 10));
    
    // Generate requirements for low stock items
    let requirementsGenerated = 0;
    for (const item of lowStockItems) {
      const orderQuantity = (item.maxStockLevel || 100) - item.availableQuantity;
      
      await db.insert(mrpRequirements).values({
        id: `${calculationId}-${item.agPartNumber}`,
        agPartNumber: item.agPartNumber,
        requiredQuantity: orderQuantity,
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        sourceType: 'enhanced_mrp_calculation',
        sourceId: calculationId,
        priority: item.availableQuantity <= 0 ? 'HIGH' : 'MEDIUM',
        status: 'open'
      });
      requirementsGenerated++;
    }

    return {
      calculationId,
      timestamp,
      requirementsGenerated,
      shortagesIdentified: lowStockItems.length,
      summary: `Enhanced MRP completed: ${requirementsGenerated} requirements generated for ${lowStockItems.length} shortage items`
    };
  }

  async getMRPShortages(): Promise<Array<{
    agPartNumber: string;
    currentStock: number;
    requiredQuantity: number;
    shortageQuantity: number;
    priority: string;
    suggestedAction: string;
  }>> {
    const requirements = await this.getAllMRPRequirements();
    const balances = await this.getAllInventoryBalances();
    
    const shortages = [];
    
    for (const req of requirements.filter(r => r.status === 'open')) {
      const balance = balances.find(b => b.agPartNumber === req.agPartNumber);
      const currentStock = balance?.availableQuantity || 0;
      
      if (currentStock < req.requiredQuantity) {
        shortages.push({
          agPartNumber: req.agPartNumber,
          currentStock,
          requiredQuantity: req.requiredQuantity,
          shortageQuantity: req.requiredQuantity - currentStock,
          priority: req.priority || 'MEDIUM',
          suggestedAction: currentStock <= 0 ? 'URGENT_ORDER' : 'REORDER_SOON'
        });
      }
    }
    
    return shortages;
  }

  // OUTSIDE PROCESSING (Enhanced Only)
  // ==================================

  async getAllOutsideProcessingLocations(): Promise<OutsideProcessingLocation[]> {
    return await db
      .select()
      .from(outsideProcessingLocations)
      .where(eq(outsideProcessingLocations.isActive, true))
      .orderBy(outsideProcessingLocations.locationName);
  }

  async createOutsideProcessingLocation(data: InsertOutsideProcessingLocation): Promise<OutsideProcessingLocation> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [location] = await db
      .insert(outsideProcessingLocations)
      .values({
        ...cleanData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return location;
  }

  async getAllOutsideProcessingJobs(): Promise<OutsideProcessingJob[]> {
    return await db
      .select()
      .from(outsideProcessingJobs)
      .orderBy(desc(outsideProcessingJobs.createdAt));
  }

  async createOutsideProcessingJob(data: InsertOutsideProcessingJob): Promise<OutsideProcessingJob> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [job] = await db
      .insert(outsideProcessingJobs)
      .values({
        ...cleanData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return job;
  }

  // VENDOR PARTS (Enhanced Only)
  // ============================

  async getAllVendorParts(): Promise<VendorPart[]> {
    return await db
      .select()
      .from(vendorParts)
      .where(eq(vendorParts.isActive, true))
      .orderBy(vendorParts.agPartNumber);
  }

  async createVendorPart(data: InsertVendorPart): Promise<VendorPart> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [vendorPart] = await db
      .insert(vendorParts)
      .values({
        ...cleanData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return vendorPart;
  }

  async getPreferredVendorForPart(agPartNumber: string): Promise<VendorPart | undefined> {
    const [preferredVendor] = await db
      .select()
      .from(vendorParts)
      .where(and(
        eq(vendorParts.agPartNumber, agPartNumber),
        eq(vendorParts.isActive, true),
        eq(vendorParts.isPreferred, true)
      ));
    return preferredVendor;
  }

  // PURCHASE ORDER SUGGESTIONS (Enhanced Only)
  // ==========================================

  async generatePOSuggestions(): Promise<Array<{
    vendorId: string;
    vendorName: string;
    parts: Array<{
      agPartNumber: string;
      suggestedQuantity: number;
      unitCost: number;
      totalCost: number;
      leadTime: number;
    }>;
    totalValue: number;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  }>> {
    const shortages = await this.getMRPShortages();
    const vendorParts = await this.getAllVendorParts();
    
    const suggestions = new Map();
    
    for (const shortage of shortages) {
      const preferredVendor = await this.getPreferredVendorForPart(shortage.agPartNumber);
      
      if (preferredVendor) {
        const vendorKey = preferredVendor.vendorId;
        
        if (!suggestions.has(vendorKey)) {
          suggestions.set(vendorKey, {
            vendorId: preferredVendor.vendorId,
            vendorName: preferredVendor.vendorName || 'Unknown Vendor',
            parts: [],
            totalValue: 0,
            urgency: 'LOW' as const
          });
        }
        
        const suggestion = suggestions.get(vendorKey);
        const orderQuantity = Math.max(shortage.shortageQuantity, preferredVendor.minimumOrderQuantity || 1);
        const totalCost = orderQuantity * (preferredVendor.unitCost || 0);
        
        suggestion.parts.push({
          agPartNumber: shortage.agPartNumber,
          suggestedQuantity: orderQuantity,
          unitCost: preferredVendor.unitCost || 0,
          totalCost,
          leadTime: preferredVendor.leadTime || 14
        });
        
        suggestion.totalValue += totalCost;
        
        if (shortage.priority === 'HIGH') {
          suggestion.urgency = 'HIGH';
        } else if (shortage.priority === 'MEDIUM' && suggestion.urgency !== 'HIGH') {
          suggestion.urgency = 'MEDIUM';
        }
      }
    }
    
    return Array.from(suggestions.values());
  }
}

// Export singleton instance
export const enhancedStorage = new EnhancedStorage();