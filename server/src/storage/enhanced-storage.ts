import { db } from '../../db';
import { 
  enhancedInventoryItems, 
  enhancedInventoryBalances, 
  enhancedInventoryTransactions,
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
      .from(enhancedInventoryItems)
      .where(eq(enhancedInventoryItems.isActive, true))
      .orderBy(enhancedInventoryItems.agPartNumber);
  }

  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(enhancedInventoryItems)
      .where(and(
        eq(enhancedInventoryItems.id, id),
        eq(enhancedInventoryItems.isActive, true)
      ));
    return item;
  }

  async getInventoryItemByPartNumber(partId: string): Promise<InventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(enhancedInventoryItems)
      .where(and(
        eq(enhancedInventoryItems.agPartNumber, partId),
        eq(enhancedInventoryItems.isActive, true)
      ));
    return item;
  }

  async createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [item] = await db
      .insert(enhancedInventoryItems)
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
      .update(enhancedInventoryItems)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(enhancedInventoryItems.id, id))
      .returning();

    if (!item) {
      throw new Error(`Inventory item ${id} not found`);
    }
    return item;
  }

  async deleteInventoryItem(id: number): Promise<void> {
    await db
      .update(enhancedInventoryItems)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(enhancedInventoryItems.id, id));
  }

  // INVENTORY BALANCES (Enhanced Only)
  // ==================================

  async getAllInventoryBalances(): Promise<InventoryBalance[]> {
    return await db
      .select()
      .from(enhancedInventoryBalances)
      .orderBy(enhancedInventoryBalances.partId);
  }

  async getInventoryBalanceByPart(partId: string, locationId?: string): Promise<InventoryBalance | undefined> {
    let whereCondition = eq(enhancedInventoryBalances.partId, partId);
    
    if (locationId) {
      whereCondition = and(whereCondition, eq(enhancedInventoryBalances.locationId, locationId));
    }

    const [balance] = await db
      .select()
      .from(enhancedInventoryBalances)
      .where(whereCondition);
    return balance;
  }

  async updateOrCreateInventoryBalance(
    partId: string, 
    locationId: string, 
    quantityChange: number,
    allocationStatus: 'available' | 'allocated' | 'committed' = 'available'
  ): Promise<InventoryBalance> {
    const existing = await this.getInventoryBalanceByPart(partId, locationId);
    
    if (existing) {
      // Update existing balance
      const updateData: any = { updatedAt: new Date() };
      
      switch (allocationStatus) {
        case 'available':
          updateData.availableQty = existing.availableQty + quantityChange;
          break;
        case 'allocated':
          updateData.allocatedQty = existing.allocatedQty + quantityChange;
          break;
        case 'committed':
          updateData.committedQty = existing.committedQty + quantityChange;
          break;
      }

      const [updated] = await db
        .update(enhancedInventoryBalances)
        .set(updateData)
        .where(and(
          eq(enhancedInventoryBalances.partId, partId),
          eq(enhancedInventoryBalances.locationId, locationId)
        ))
        .returning();
      return updated;
    } else {
      // Create new balance
      const newBalance: InsertInventoryBalance = {
        partId,
        locationId,
        onHandQty: quantityChange,
        availableQty: allocationStatus === 'available' ? quantityChange : 0,
        allocatedQty: allocationStatus === 'allocated' ? quantityChange : 0,
        committedQty: allocationStatus === 'committed' ? quantityChange : 0,
        unitCost: 0, // Default, should be updated separately
      };

      const [created] = await db
        .insert(enhancedInventoryBalances)
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
      .from(enhancedInventoryTransactions)
      .orderBy(desc(enhancedInventoryTransactions.transactionDate));
  }

  async createInventoryTransaction(data: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    
    const [transaction] = await db
      .insert(enhancedInventoryTransactions)
      .values({
        ...cleanData,
        transactionDate: cleanData.transactionDate || new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Update inventory balance based on transaction
    await this.updateOrCreateInventoryBalance(
      transaction.partId,
      transaction.locationId || 'MAIN',
      transaction.transactionType === 'RECEIPT' ? transaction.quantity : -transaction.quantity,
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
      .orderBy(mrpRequirements.needDate);
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
    const lowStockItems = allBalances.filter(b => b.availableQty < (b.safetyStock || 10));
    
    // Generate requirements for low stock items
    let requirementsGenerated = 0;
    for (const item of lowStockItems) {
      const orderQuantity = Math.max((item.safetyStock || 10) * 2 - item.availableQty, item.minOrderQty || 1);
      
      await db.insert(mrpRequirements).values({
        requirementId: `${calculationId}-${item.partId}`,
        partId: item.partId,
        requiredQty: orderQuantity,
        availableQty: item.availableQty,
        shortageQty: orderQuantity - item.availableQty,
        needDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        sourceType: 'enhanced_mrp_calculation',
        priority: item.availableQty <= 0 ? 1 : 50,
        status: 'OPEN'
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
    
    for (const req of requirements.filter(r => r.status === 'OPEN')) {
      const balance = balances.find(b => b.partId === req.partId);
      const currentStock = balance?.availableQty || 0;
      
      if (currentStock < req.requiredQty) {
        shortages.push({
          agPartNumber: req.partId,
          currentStock,
          requiredQuantity: req.requiredQty,
          shortageQuantity: req.requiredQty - currentStock,
          priority: req.priority === 1 ? 'HIGH' : req.priority <= 25 ? 'MEDIUM' : 'LOW',
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
      .orderBy(outsideProcessingLocations.vendorName, outsideProcessingLocations.locationName);
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
      .orderBy(vendorParts.partId);
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

  async getPreferredVendorForPart(partId: string): Promise<VendorPart | undefined> {
    const [preferredVendor] = await db
      .select()
      .from(vendorParts)
      .where(and(
        eq(vendorParts.partId, partId),
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
            vendorName: preferredVendor.vendorPartName || 'Unknown Vendor',
            parts: [],
            totalValue: 0,
            urgency: 'LOW' as const
          });
        }
        
        const suggestion = suggestions.get(vendorKey);
        const orderQuantity = Math.max(shortage.shortageQuantity, preferredVendor.minOrderQty || 1);
        const totalCost = orderQuantity * (preferredVendor.unitPrice || 0);
        
        suggestion.parts.push({
          agPartNumber: shortage.agPartNumber,
          suggestedQuantity: orderQuantity,
          unitCost: preferredVendor.unitPrice || 0,
          totalCost,
          leadTime: preferredVendor.leadTimeDays || 14
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