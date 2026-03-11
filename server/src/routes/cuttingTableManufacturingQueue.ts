import express, { Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { manufacturingQueue, inventoryItems, p2ProductionOrders, p2PurchaseOrders, cuttingPacketBOMs, cuttingPacketBOMMaterials, cuttingPacketBOMParts, cuttingFabricInventory } from '../../schema';
import { eq, and, or, asc, inArray, like } from 'drizzle-orm';

const router = express.Router();

// Get manufacturing queue items for cutting table
router.get('/cutting-table', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let whereClause;
    
    if (status === 'ACTIVE') {
      // Show both PENDING and IN_PROGRESS items
      whereClause = and(
        eq(manufacturingQueue.department, 'Cutting Table'),
        or(
          eq(manufacturingQueue.status, 'PENDING'),
          eq(manufacturingQueue.status, 'IN_PROGRESS')
        )
      );
    } else if (status && status !== 'ALL') {
      whereClause = and(
        eq(manufacturingQueue.department, 'Cutting Table'),
        eq(manufacturingQueue.status, status as string)
      );
    } else {
      whereClause = eq(manufacturingQueue.department, 'Cutting Table');
    }
    
    const queueItems = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(whereClause)
      .orderBy(manufacturingQueue.priority, manufacturingQueue.createdAt);
    
    // Fetch all active BOMs once for efficient lookup
    const allActiveBoms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));

    const formattedItems = queueItems.map(row => {
      // Extract bomId and other data from notes JSON if present
      let packetBomId = null;
      let materialType = null;
      let source = null;
      let orderId = null;
      let packetName = null;
      let userNotes = null;
      
      try {
        if (row.queue.notes) {
          const parsedNotes = JSON.parse(row.queue.notes);
          packetBomId = parsedNotes.bomId || null;
          materialType = parsedNotes.materialType || null;
          source = parsedNotes.source || null;
          orderId = parsedNotes.orderId || null;
          packetName = parsedNotes.packetName || null;
          userNotes = parsedNotes.userNotes || null;
        }
      } catch (e) {
        // Notes might not be JSON, that's ok
      }

      // Find the BOM linked to this queue item (by bomId, inventoryItemId, or partNumber)
      const linkedBom = 
        (packetBomId && allActiveBoms.find(b => b.id === packetBomId)) ||
        (row.queue.inventoryItemId && allActiveBoms.find(b => b.inventoryItemId != null && b.inventoryItemId === row.queue.inventoryItemId)) ||
        (row.item?.agPartNumber && allActiveBoms.find(b => b.partNumber === row.item!.agPartNumber)) ||
        null;

      const displayName = packetName || userNotes || row.item?.name || orderId || null;
      
      return {
        ...row.queue,
        // Show BOM's part number when a BOM is linked; fall back to inventory item's part number
        partNumber: linkedBom?.partNumber || row.item?.agPartNumber,
        partName: row.item?.name,
        displayName,
        inventoryItem: row.item,
        packetBomId,
        bomPartNumber: linkedBom?.partNumber || null,
        materialType,
        source,
        orderId,
      };
    });
    
    res.json(formattedItems);
  } catch (error) {
    console.error('Error fetching cutting table queue:', error);
    res.status(500).json({ error: 'Failed to fetch cutting table queue' });
  }
});

// Complete manufacturing queue item with traceability data (supports partial completion)
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      quantityCompleted,
      fabricLot,
      fabricBatch,
      fabricRoll,
      materialDetails,
      completionNotes,
      completedBy,
    } = req.body;
    
    if (!quantityCompleted || quantityCompleted <= 0) {
      return res.status(400).json({ error: 'Quantity completed must be greater than 0' });
    }
    
    // Get the current queue item to check requested quantity
    const currentItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!currentItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Calculate total completed (existing + new)
    const previousCompleted = currentItem.quantityCompleted || 0;
    const newTotalCompleted = previousCompleted + quantityCompleted;
    const quantityRequested = currentItem.quantityRequested;
    
    // Determine if this is a full or partial completion
    const isFullyCompleted = newTotalCompleted >= quantityRequested;
    
    // Update the manufacturing queue item
    const [updated] = await db
      .update(manufacturingQueue)
      .set({
        quantityCompleted: newTotalCompleted,
        status: isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isFullyCompleted ? new Date() : null,
        fabricLot,
        fabricBatch,
        fabricRoll,
        materialDetails,
        completionNotes,
        completedBy,
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Return additional info for partial completions
    res.json({
      ...updated,
      isPartialCompletion: !isFullyCompleted,
      remainingQuantity: isFullyCompleted ? 0 : quantityRequested - newTotalCompleted,
    });
  } catch (error) {
    console.error('Error completing manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to complete manufacturing queue item' });
  }
});

// Start working on a manufacturing queue item
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;
    
    const [updated] = await db
      .update(manufacturingQueue)
      .set({
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        assignedTo,
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error starting manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to start manufacturing queue item' });
  }
});

// Generate barcode labels for completed manufactured items
router.post('/:id/generate-labels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quantityToLabel } = req.body;
    
    // Get the manufacturing queue item
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
      with: {
        // We'll need to add relations in schema later
      },
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get the inventory item details
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Generate label data with barcode images
    const labels = [];
    const quantity = quantityToLabel || queueItem.quantityCompleted || 1;
    
    for (let i = 1; i <= quantity; i++) {
      const barcodeValue = `${inventoryItem.agPartNumber}-Q${queueItem.id}-${i}`;
      
      // Generate barcode image (dynamic import to avoid startup failure)
      let barcodeImage;
      try {
        const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
        barcodeImage = await generateBarcodeImage(barcodeValue, {
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 5,
        });
      } catch (error) {
        console.error(`Error generating barcode for ${barcodeValue}:`, error);
        barcodeImage = null;
      }
      
      labels.push({
        itemId: i,
        partNumber: inventoryItem.agPartNumber,
        partName: inventoryItem.name,
        queueId: queueItem.id,
        fabricLot: queueItem.fabricLot,
        fabricBatch: queueItem.fabricBatch,
        fabricRoll: queueItem.fabricRoll,
        completedBy: queueItem.completedBy,
        completedAt: queueItem.completedAt,
        barcodeValue,
        barcodeImage, // Base64-encoded PNG image
      });
    }
    
    res.json({ labels, count: labels.length });
  } catch (error) {
    console.error('Error generating labels:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

// Schedule a packet item to the cutting table manufacturing queue
router.post('/schedule-packet', async (req: Request, res: Response) => {
  try {
    const { inventoryItemId, quantity, priority, dueDate, notes, requestedBy } = req.body;
    
    if (!inventoryItemId) {
      return res.status(400).json({ error: 'Inventory item ID is required' });
    }
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    
    // Verify the inventory item exists and is a packet item
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    if (!inventoryItem.isPacketPart) {
      return res.status(400).json({ error: 'This item is not marked as a packet item. Enable "Packet (Cutting Table)" in the inventory item settings.' });
    }
    
    // Create the manufacturing queue entry
    const [newQueueItem] = await db
      .insert(manufacturingQueue)
      .values({
        inventoryItemId,
        department: 'Cutting Table',
        quantityRequested: quantity,
        quantityCompleted: 0,
        priority: priority || 50,
        status: 'PENDING',
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        requestedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    res.status(201).json({
      ...newQueueItem,
      partNumber: inventoryItem.agPartNumber,
      partName: inventoryItem.name,
    });
  } catch (error) {
    console.error('Error scheduling packet to cutting table:', error);
    res.status(500).json({ error: 'Failed to schedule packet' });
  }
});

// Get all packet items that can be scheduled (isPacketPart = true)
router.get('/available-packets', async (req: Request, res: Response) => {
  try {
    const packetItems = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        description: inventoryItems.description,
        quantityInStock: inventoryItems.quantityInStock,
        onHand: inventoryItems.onHand,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.isPacketPart, true))
      .orderBy(inventoryItems.agPartNumber);
    
    res.json(packetItems);
  } catch (error) {
    console.error('Error fetching available packets:', error);
    res.status(500).json({ error: 'Failed to fetch available packets' });
  }
});

// Complete packet build with full AS9100 traceability (supports mixed-fabric packets)
router.post('/:id/complete-with-traceability', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      quantityCompleted,
      fabricSources, // Array of fabric traceability data
      completedBy,
      completionNotes,
    } = req.body;
    
    if (!quantityCompleted || quantityCompleted <= 0) {
      return res.status(400).json({ error: 'Quantity completed must be greater than 0' });
    }
    
    if (!fabricSources || !Array.isArray(fabricSources) || fabricSources.length === 0) {
      return res.status(400).json({ error: 'At least one fabric source is required for traceability' });
    }
    
    // Get the current queue item
    const currentItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!currentItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get inventory item for barcode generation
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, currentItem.inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Import built packet tables
    const { cuttingBuiltPackets, cuttingBuiltPacketFabricSources, cuttingProductCategories } = await import('../../schema');
    
    // Find or create a product category for this packet type
    let productCategory = await db.query.cuttingProductCategories.findFirst({
      where: eq(cuttingProductCategories.categoryName, inventoryItem.name || 'Unknown'),
    });
    
    // If no category exists, create one
    if (!productCategory) {
      const [newCategory] = await db
        .insert(cuttingProductCategories)
        .values({
          categoryName: inventoryItem.name || 'Unknown Packet Type',
          isActive: true,
        })
        .returning();
      productCategory = newCategory;
    }
    
    // Create built packet records with full traceability
    const createdPackets = [];
    const isMixedFabric = fabricSources.length > 1;
    
    for (let i = 0; i < quantityCompleted; i++) {
      const packetNumber = i + 1;
      const timestamp = Date.now();
      const barcode = `PKT-${inventoryItem.agPartNumber}-${id}-${packetNumber}-${timestamp}`;
      
      // Create the built packet record
      const [builtPacket] = await db
        .insert(cuttingBuiltPackets)
        .values({
          productCategoryId: productCategory.id,
          barcode,
          packetNumber,
          buildDate: new Date(),
          status: 'AVAILABLE',
          isMixedFabric,
          fabricSourceCount: fabricSources.length,
          notes: completionNotes || null,
          createdBy: completedBy || null,
        })
        .returning();
      
      // Create fabric source records for each fabric used
      for (let j = 0; j < fabricSources.length; j++) {
        const source = fabricSources[j];
        await db
          .insert(cuttingBuiltPacketFabricSources)
          .values({
            builtPacketId: builtPacket.id,
            fabricInventoryId: source.fabricInventoryId || null,
            fabricType: source.fabricType || null,
            lotNumber: source.lotNumber || null,
            batchNumber: source.batchNumber || null,
            rollNumber: source.rollNumber || null,
            supplierPartNumber: source.supplierPartNumber || null,
            internalControlNumber: source.internalControlNumber || null,
            expirationDate: source.expirationDate || null,
            quantityUsed: source.quantityUsed || 1,
            isPrimary: j === 0, // First source is primary
          });
      }
      
      createdPackets.push({
        ...builtPacket,
        fabricSources,
      });
    }
    
    // Update the manufacturing queue item
    const previousCompleted = currentItem.quantityCompleted || 0;
    const newTotalCompleted = previousCompleted + quantityCompleted;
    const quantityRequested = currentItem.quantityRequested;
    const isFullyCompleted = newTotalCompleted >= quantityRequested;
    
    // Consolidate fabric lot info for the queue record
    const fabricLotSummary = fabricSources.map((s: any) => s.lotNumber || s.batchNumber).filter(Boolean).join(', ');
    
    const [updated] = await db
      .update(manufacturingQueue)
      .set({
        quantityCompleted: newTotalCompleted,
        status: isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isFullyCompleted ? new Date() : null,
        fabricLot: fabricLotSummary,
        fabricBatch: fabricSources[0]?.batchNumber || null,
        fabricRoll: fabricSources[0]?.rollNumber || null,
        materialDetails: JSON.stringify(fabricSources),
        completionNotes,
        completedBy,
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, parseInt(id)))
      .returning();
    
    res.json({
      queueItem: updated,
      createdPackets,
      isPartialCompletion: !isFullyCompleted,
      remainingQuantity: isFullyCompleted ? 0 : quantityRequested - newTotalCompleted,
      isMixedFabric,
      fabricSourceCount: fabricSources.length,
    });
  } catch (error) {
    console.error('Error completing packet with traceability:', error);
    res.status(500).json({ error: 'Failed to complete packet with traceability' });
  }
});

// Generate labels for built packets (includes all fabric lot info for mixed packets)
router.post('/:id/generate-packet-labels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { packetIds } = req.body; // Optional: specific packet IDs to label
    
    const { cuttingBuiltPackets, cuttingBuiltPacketFabricSources, manufacturingQueue: mfgQueue } = await import('../../schema');
    
    // Get the queue item to find associated packets
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get inventory item for part info
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Get packets created from this queue item (using barcode pattern match)
    let packets;
    if (packetIds && Array.isArray(packetIds) && packetIds.length > 0) {
      // Get specific packets by ID
      const { inArray } = await import('drizzle-orm');
      packets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(inArray(cuttingBuiltPackets.id, packetIds));
    } else {
      // Get all packets that match this queue item pattern
      const { like } = await import('drizzle-orm');
      packets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(like(cuttingBuiltPackets.barcode, `PKT-${inventoryItem?.agPartNumber}-${id}-%`));
    }
    
    // Get fabric sources for each packet
    const labels = await Promise.all(
      packets.map(async (packet) => {
        const sources = await db
          .select()
          .from(cuttingBuiltPacketFabricSources)
          .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));
        
        // Generate barcode image (dynamic import to avoid startup failure)
        let barcodeImage;
        try {
          const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
          barcodeImage = await generateBarcodeImage(packet.barcode, {
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 10,
            margin: 5,
          });
        } catch (err) {
          console.error(`Error generating barcode for ${packet.barcode}:`, err);
          barcodeImage = null;
        }
        
        // Format fabric lot info for label (show all lots for mixed-fabric packets)
        const fabricLotLines = sources.map((s) => {
          const parts = [];
          if (s.fabricType) parts.push(s.fabricType);
          if (s.lotNumber) parts.push(`Lot: ${s.lotNumber}`);
          if (s.batchNumber) parts.push(`Batch: ${s.batchNumber}`);
          if (s.rollNumber) parts.push(`Roll: ${s.rollNumber}`);
          return parts.join(' | ');
        });
        
        return {
          packetId: packet.id,
          barcode: packet.barcode,
          barcodeImage,
          packetNumber: packet.packetNumber,
          partNumber: inventoryItem?.agPartNumber,
          partName: inventoryItem?.name,
          buildDate: packet.buildDate,
          status: packet.status,
          isMixedFabric: packet.isMixedFabric,
          fabricSourceCount: packet.fabricSourceCount,
          fabricSources: sources,
          fabricLotLines, // Pre-formatted lines for label display
          expirationDates: sources.map((s) => s.expirationDate).filter(Boolean),
        };
      })
    );
    
    res.json({
      labels,
      count: labels.length,
      queueItemId: id,
    });
  } catch (error) {
    console.error('Error generating packet labels:', error);
    res.status(500).json({ error: 'Failed to generate packet labels' });
  }
});

// Sync P2 production orders into manufacturing queue entries
router.post('/sync-p2-demands', async (req: Request, res: Response) => {
  try {
    const { p2PoId } = req.body;
    
    // Build query for P2 production orders needing cutting
    let whereConditions: any[];
    if (p2PoId) {
      whereConditions = [
        eq(p2ProductionOrders.department, 'Cutting Table'),
        eq(p2ProductionOrders.status, 'PENDING'),
        eq(p2ProductionOrders.p2PoId, p2PoId),
      ];
    } else {
      whereConditions = [
        eq(p2ProductionOrders.department, 'Cutting Table'),
        eq(p2ProductionOrders.status, 'PENDING'),
      ];
    }
    
    // Get all P2 production orders for cutting table
    const p2Orders = await db
      .select()
      .from(p2ProductionOrders)
      .where(and(...whereConditions));
    
    if (p2Orders.length === 0) {
      return res.json({ message: 'No pending P2 cutting table demands found', created: 0 });
    }
    
    // Group by PO + SKU to create consolidated queue entries
    const demandMap: Record<string, { sku: string; partName: string; p2PoId: number; p2PoItemId: number | null; quantity: number; dueDate: Date | null }> = {};
    
    for (const order of p2Orders) {
      const key = `${order.p2PoId}-${order.sku}`;
      if (!demandMap[key]) {
        demandMap[key] = {
          sku: order.sku,
          partName: order.partName,
          p2PoId: order.p2PoId,
          p2PoItemId: order.p2PoItemId,
          quantity: 0,
          dueDate: order.dueDate,
        };
      }
      demandMap[key].quantity += (order.quantity || 1);
    }
    
    // Get P2 PO details for notes
    const poIds = [...new Set(Object.values(demandMap).map(d => d.p2PoId))];
    const poDetails: Record<number, any> = {};
    for (const poId of poIds) {
      const [po] = await db.select().from(p2PurchaseOrders).where(eq(p2PurchaseOrders.id, poId)).limit(1);
      if (po) poDetails[poId] = po;
    }
    
    // Check existing manufacturing_queue entries to avoid duplicates
    const existingEntries = await db
      .select()
      .from(manufacturingQueue)
      .where(eq(manufacturingQueue.department, 'Cutting Table'));
    
    let created = 0;
    let skipped = 0;
    const results: any[] = [];
    
    for (const [key, demand] of Object.entries(demandMap)) {
      // Find inventory item by part number
      const [inventoryItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.agPartNumber, demand.sku)).limit(1);
      
      if (!inventoryItem) {
        results.push({ sku: demand.sku, status: 'skipped', reason: 'No matching inventory item' });
        skipped++;
        continue;
      }
      
      // Check if a queue entry already exists for this PO + inventory item
      const existing = existingEntries.find(e => 
        e.p2PoId === demand.p2PoId && 
        e.inventoryItemId === inventoryItem.id
      );
      
      if (existing) {
        results.push({ sku: demand.sku, status: 'exists', queueId: existing.id, qty: existing.quantityRequested });
        skipped++;
        continue;
      }
      
      const poInfo = poDetails[demand.p2PoId];
      const poNumber = poInfo?.poNumber || `PO-${demand.p2PoId}`;
      
      // Find matching packet BOM
      const [matchingBom] = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.partNumber, demand.sku)).limit(1);
      
      const notesObj = {
        source: 'P2_SYNC',
        p2PoNumber: poNumber,
        p2PoId: demand.p2PoId,
        p2PoItemId: demand.p2PoItemId,
        bomId: matchingBom?.id || null,
        materialType: 'carbon_fiber',
      };
      
      const [newEntry] = await db
        .insert(manufacturingQueue)
        .values({
          inventoryItemId: inventoryItem.id,
          department: 'Cutting Table',
          quantityRequested: demand.quantity,
          quantityCompleted: 0,
          priority: 50,
          status: 'PENDING',
          dueDate: demand.dueDate,
          notes: JSON.stringify(notesObj),
          requestedBy: 'system',
          p2PoId: demand.p2PoId,
          p2PoItemId: demand.p2PoItemId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      results.push({ 
        sku: demand.sku, 
        partName: demand.partName,
        status: 'created', 
        queueId: newEntry.id, 
        qty: demand.quantity,
        bomLinked: !!matchingBom,
      });
      created++;
    }
    
    res.json({
      message: `Synced P2 demands: ${created} created, ${skipped} skipped`,
      created,
      skipped,
      results,
    });
  } catch (error) {
    console.error('Error syncing P2 demands:', error);
    res.status(500).json({ error: 'Failed to sync P2 demands to cutting table' });
  }
});

// Bulk print barcodes for scheduled packet queue items
router.post('/bulk-print-barcodes', async (req: Request, res: Response) => {
  try {
    const { queueIds, quantities } = req.body;
    
    if (!queueIds || !Array.isArray(queueIds) || queueIds.length === 0) {
      return res.status(400).json({ error: 'At least one queue ID is required' });
    }
    
    const printQuantities: Record<number, number> = quantities || {};
    
    const queueItems = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(inArray(manufacturingQueue.id, queueIds));
    
    if (queueItems.length === 0) {
      return res.status(404).json({ error: 'No matching queue items found' });
    }
    
    const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
    
    const allLabels: any[] = [];
    
    for (const row of queueItems) {
      const partNumber = row.item?.agPartNumber || 'UNK';
      const maxQty = row.queue.quantityRequested || 1;
      const qty = printQuantities[row.queue.id] ? Math.min(printQuantities[row.queue.id], maxQty) : maxQty;
      
      for (let seq = 1; seq <= qty; seq++) {
        const barcodeValue = `MFG-${row.queue.id}-${partNumber}-${seq}`;
        
        let barcodeImage;
        try {
          barcodeImage = await generateBarcodeImage(barcodeValue, {
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 10,
            margin: 5,
          });
        } catch (err) {
          console.error(`Error generating barcode for ${barcodeValue}:`, err);
          barcodeImage = null;
        }
        
        allLabels.push({
          queueId: row.queue.id,
          barcodeValue,
          barcodeImage,
          partNumber,
          partName: row.item?.name || 'Unknown',
          quantityRequested: qty,
          sequenceNumber: seq,
          quantityCompleted: row.queue.quantityCompleted || 0,
          priority: row.queue.priority,
          dueDate: row.queue.dueDate,
          status: row.queue.status,
        });
      }
    }
    
    res.json({ labels: allLabels, count: allLabels.length });
  } catch (error) {
    console.error('Error generating bulk barcodes:', error);
    res.status(500).json({ error: 'Failed to generate bulk barcodes' });
  }
});

// Scan a packet barcode to start working on it - returns BOM details, FIFO inventory, ply schedule, cuts
router.post('/scan-start', async (req: Request, res: Response) => {
  try {
    const { barcode, username } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    // Parse the barcode format: MFG-{id}-{partNumber} or MFG-{id}-{partNumber}-{seq}
    const match = barcode.match(/^MFG-(\d+)-([^-]+)(?:-(\d+))?$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid packet barcode format. Expected: MFG-{id}-{partNumber} or MFG-{id}-{partNumber}-{seq}' });
    }
    
    const queueId = parseInt(match[1]);
    
    if (isNaN(queueId)) {
      return res.status(400).json({ error: 'Invalid queue ID in barcode' });
    }
    
    // Get the queue item - enforce Cutting Table department
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, queueId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }
    
    if (queueItem.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This packet has already been completed' });
    }
    
    if (queueItem.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This packet has been cancelled' });
    }
    
    // Get inventory item
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Transition to IN_PROGRESS if PENDING
    if (queueItem.status === 'PENDING') {
      await db
        .update(manufacturingQueue)
        .set({
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          assignedTo: username || 'scanner',
          updatedAt: new Date(),
        })
        .where(eq(manufacturingQueue.id, queueId));
    }
    
    let bomId: string | null = null;
    let notesMaterialType: string | null = null;
    let notesPacketName: string | null = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        bomId = parsedNotes.bomId || null;
        notesMaterialType = parsedNotes.materialType || null;
        notesPacketName = parsedNotes.packetName || null;
      }
    } catch {}
    
    let packetBom = null;
    const allActiveBoms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    // Strategy 1: Direct bomId lookup (most specific)
    if (bomId) {
      packetBom = allActiveBoms.find(b => b.id === bomId) || null;
      if (!packetBom) {
        packetBom = await db.query.cuttingPacketBOMs.findFirst({
          where: eq(cuttingPacketBOMs.id, bomId),
        });
      }
    }
    
    // Strategy 2: Match by material type from notes (reliable - material type describes the actual packet)
    if (!packetBom && notesMaterialType) {
      const materialToPacketType: Record<string, string> = {
        'carbon_fiber': 'carbon fiber packet',
        'fiberglass': 'fiberglass packet',
        'mesa': 'mesa packet',
        'p2_disruptor': 'disruptor',
        'p2_disruptor_packet': 'disruptor packet',
        'p2_antenna': 'antenna cover',
        'p2_antenna_cover': 'antenna cover packet',
      };
      const targetType = materialToPacketType[notesMaterialType];
      if (targetType) {
        packetBom = allActiveBoms.find(b => 
          b.packetType.toLowerCase() === targetType ||
          b.packetType.toLowerCase().includes(targetType) ||
          targetType.includes(b.packetType.toLowerCase())
        ) || null;
      }
    }
    
    // Strategy 3: Match by packet name from notes (reliable - describes the actual packet)
    if (!packetBom && notesPacketName) {
      packetBom = allActiveBoms.find(b => 
        b.packetType.toLowerCase() === notesPacketName!.toLowerCase() ||
        b.packetType.toLowerCase().includes(notesPacketName!.toLowerCase()) ||
        notesPacketName!.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // Strategy 3.5: Match by inventory item ID (direct FK link — most reliable static match)
    if (!packetBom && queueItem.inventoryItemId) {
      packetBom = allActiveBoms.find(b => b.inventoryItemId != null && b.inventoryItemId === queueItem.inventoryItemId) || null;
    }

    // Strategy 4: Match by inventory item part number (less reliable - inventory linkage may be wrong)
    if (!packetBom && inventoryItem?.agPartNumber) {
      packetBom = allActiveBoms.find(b => b.partNumber === inventoryItem!.agPartNumber) || null;
    }
    
    // Strategy 5: Match by inventory item name (least reliable fallback)
    if (!packetBom && inventoryItem?.name) {
      packetBom = allActiveBoms.find(b => 
        b.packetType.toLowerCase() === inventoryItem!.name.toLowerCase() ||
        b.packetType.toLowerCase().includes(inventoryItem!.name.toLowerCase()) ||
        inventoryItem!.name.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // Get BOM materials and parts
    let bomMaterials: any[] = [];
    let bomParts: any[] = [];
    if (packetBom) {
      bomMaterials = await db
        .select()
        .from(cuttingPacketBOMMaterials)
        .where(eq(cuttingPacketBOMMaterials.packetBomId, packetBom.id));
      
      bomParts = await db
        .select()
        .from(cuttingPacketBOMParts)
        .where(eq(cuttingPacketBOMParts.packetBomId, packetBom.id))
        .orderBy(asc(cuttingPacketBOMParts.sortOrder));
    }
    
    // Get FIFO-ordered fabric inventory matching BOM materials
    // Collect fabricType, commonName, and fallback to part number base from BOM materials and parts
    const allRequiredFabricTypes = new Set<string>();
    bomMaterials.forEach((m: any) => {
      if (m.fabricType?.trim()) allRequiredFabricTypes.add(m.fabricType.trim().toLowerCase());
      if (m.commonName?.trim()) allRequiredFabricTypes.add(m.commonName.trim().toLowerCase());
    });
    bomParts.forEach((p: any) => {
      if (p.fabricType?.trim()) allRequiredFabricTypes.add(p.fabricType.trim().toLowerCase());
      if (p.commonName?.trim()) allRequiredFabricTypes.add(p.commonName.trim().toLowerCase());
      if (!p.fabricType?.trim() && !p.commonName?.trim() && p.partNumber?.trim()) {
        const basePartNum = p.partNumber.trim().replace(/[a-zA-Z]+$/, '');
        if (basePartNum) allRequiredFabricTypes.add(basePartNum.toLowerCase());
      }
    });
    const requiredTypes = Array.from(allRequiredFabricTypes);
    
    let fifoInventory: any[] = [];
    const activeFabric = await db
      .select()
      .from(cuttingFabricInventory)
      .where(eq(cuttingFabricInventory.status, 'active'))
      .orderBy(asc(cuttingFabricInventory.receivedDate), asc(cuttingFabricInventory.expirationDate));
    
    // Stricter fabric matching: require significant overlap, not just substring containment
    // Minimum match length of 4 chars prevents short strings from matching everything
    // Also supports numeric part number prefix matching (e.g., required "301" matches roll "301" or "301g")
    const strictFabricMatch = (fabricFields: string[], requiredTypes: string[]): boolean => {
      const validFields = fabricFields.filter(f => f.length > 0);
      if (validFields.length === 0) return false;
      return requiredTypes.some(req => 
        validFields.some(field => {
          if (field === req) return true;
          if (req.length >= 4 && field.includes(req)) return true;
          if (field.length >= 4 && req.includes(field)) return true;
          if (/^\d+$/.test(req) && req.length >= 3) {
            if (field.startsWith(req) || field === req) return true;
          }
          if (/^\d+$/.test(field) && field.length >= 3) {
            if (req.startsWith(field) || req === field) return true;
          }
          return false;
        })
      );
    };
    
    if (requiredTypes.length > 0) {
      fifoInventory = activeFabric.filter(f => {
        const ft = (f.fabric || '').trim().toLowerCase();
        const nickname = (f.nickname || '').trim().toLowerCase();
        const partNum = (f.fabricPartNumber || '').trim().toLowerCase();
        return strictFabricMatch([ft, nickname, partNum], requiredTypes);
      });
      console.log(`[scan-start FIFO] Required fabric types: [${requiredTypes.join(', ')}], matched ${fifoInventory.length} of ${activeFabric.length} active rolls`);
    } else {
      // No BOM fabric requirements found - don't show random rolls
      fifoInventory = [];
      console.log(`[scan-start FIFO] No BOM fabric types found for packet. BOM: ${packetBom?.id || 'none'}, materials: ${bomMaterials.length}, parts: ${bomParts.length}`);
    }
    
    let plySchedule = null;
    let cutsConfig = null;
    let cutPrograms = null;
    if (packetBom) {
      plySchedule = packetBom.plyScheduleConfig || null;
      cutsConfig = packetBom.cutsConfig || null;
      cutPrograms = packetBom.cutProgramsConfig || null;
    }
    
    const remaining = queueItem.quantityRequested - (queueItem.quantityCompleted || 0);
    const yieldPerCut = packetBom?.yieldPerCut || 4;
    const estimatedCuts = Math.ceil(remaining / yieldPerCut);
    
    let packetName = null;
    let userNotes = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        packetName = parsedNotes.packetName || null;
        userNotes = parsedNotes.userNotes || null;
      }
    } catch {}
    const displayName = packetName || userNotes || inventoryItem?.name || null;
    
    res.json({
      queueItem: {
        ...queueItem,
        status: queueItem.status === 'PENDING' ? 'IN_PROGRESS' : queueItem.status,
        partNumber: inventoryItem?.agPartNumber,
        partName: inventoryItem?.name,
        displayName,
        remaining,
        estimatedCuts,
      },
      bom: packetBom ? {
        id: packetBom.id,
        packetType: packetBom.packetType,
        partNumber: packetBom.partNumber,
        yieldPerCut: packetBom.yieldPerCut,
        squareMetersPerCut: packetBom.squareMetersPerCut,
        wasteFactor: packetBom.wasteFactor,
        noPlySchedule: packetBom.noPlySchedule,
      } : null,
      bomMaterials,
      bomParts,
      plySchedule,
      cutsConfig,
      cutPrograms,
      requiredFabricTypes: requiredTypes,
      fifoInventory: fifoInventory.map(f => ({
        id: f.id,
        fabric: f.fabric,
        fabricPartNumber: f.fabricPartNumber,
        nickname: f.nickname,
        lotNumber: f.lotNumber,
        batchNumber: f.batchNumber,
        rollNumber: f.rollNumber,
        internalControlNumber: f.internalControlNumber,
        squareMeters: f.squareMeters,
        receivedDate: f.receivedDate,
        expirationDate: f.expirationDate,
        location: f.location,
        freezerNumber: f.freezerNumber,
        barcode: f.barcode,
        status: f.status,
      })),
    });
  } catch (error) {
    console.error('Error processing scan-start:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to process packet scan', message });
  }
});

// Unschedule (delete) a cutting table queue item - blocked for completed or partially completed items
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, parsedId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });

    if (!queueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }

    if (queueItem.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot unschedule a completed item' });
    }

    if (queueItem.status === 'IN_PROGRESS' && (queueItem.quantityCompleted || 0) > 0) {
      return res.status(400).json({ error: 'Cannot unschedule an item that has partially completed work' });
    }

    await db.delete(manufacturingQueue).where(eq(manufacturingQueue.id, parsedId));

    res.json({ success: true, message: 'Queue item unscheduled successfully' });
  } catch (error) {
    console.error('Error unscheduling queue item:', error);
    res.status(500).json({ error: 'Failed to unschedule queue item' });
  }
});

// Validate a scanned material roll against the BOM for the active queue item
router.post('/:id/validate-material', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { barcode } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Material barcode is required' });
    }
    
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }
    
    // Get the queue item - enforce Cutting Table department
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, parsedId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }
    
    // Get inventory item for part number
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Find the fabric roll by barcode, ICN, roll number, or ID
    const allFabric = await db
      .select()
      .from(cuttingFabricInventory)
      .where(eq(cuttingFabricInventory.status, 'active'));
    
    const barcodeNorm = barcode.trim();
    
    // Try exact match first on barcode, ICN, or roll number
    let matchedRoll = allFabric.find(f => 
      f.barcode === barcodeNorm ||
      f.internalControlNumber === barcodeNorm ||
      f.rollNumber === barcodeNorm
    );
    
    // Try case-insensitive match
    if (!matchedRoll) {
      const barcodeLower = barcodeNorm.toLowerCase();
      matchedRoll = allFabric.find(f => 
        (f.barcode && f.barcode.toLowerCase() === barcodeLower) ||
        (f.internalControlNumber && f.internalControlNumber.toLowerCase() === barcodeLower) ||
        (f.rollNumber && f.rollNumber.toLowerCase() === barcodeLower)
      );
    }
    
    // Try matching by fabric inventory ID (UUID)
    if (!matchedRoll) {
      matchedRoll = allFabric.find(f => f.id === barcodeNorm);
    }
    
    // Try parsing synthetic barcode format: FAB-{ICN}-{id_prefix}
    if (!matchedRoll && barcodeNorm.startsWith('FAB-')) {
      const parts = barcodeNorm.split('-');
      if (parts.length >= 3) {
        const icnPart = parts.slice(1, -1).join('-');
        const idPrefix = parts[parts.length - 1];
        matchedRoll = allFabric.find(f =>
          (f.internalControlNumber && f.internalControlNumber === icnPart) ||
          (f.id && f.id.startsWith(idPrefix))
        );
      }
    }
    
    // Try matching by fabric part number directly
    if (!matchedRoll) {
      matchedRoll = allFabric.find(f =>
        f.fabricPartNumber && f.fabricPartNumber === barcodeNorm
      );
    }
    
    if (!matchedRoll) {
      console.log(`[validate-material] Roll not found. Scanned: "${barcodeNorm}". Active rolls: ${allFabric.length}. Sample barcodes: ${allFabric.slice(0, 5).map(f => `barcode=${f.barcode}, ICN=${f.internalControlNumber}, roll=${f.rollNumber}`).join(' | ')}`);
      return res.status(404).json({ 
        valid: false,
        error: 'Material roll not found in inventory',
        scannedBarcode: barcode,
      });
    }
    
    // Find matching BOM to validate material (mirrors scan-start BOM matching strategies)
    let bomId: string | null = null;
    let notesMaterialType: string | null = null;
    let notesPacketName: string | null = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        bomId = parsedNotes.bomId || null;
        notesMaterialType = parsedNotes.materialType || null;
        notesPacketName = parsedNotes.packetName || null;
      }
    } catch {}
    
    let packetBom = null;
    const allActiveBoms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    if (bomId) {
      packetBom = allActiveBoms.find(b => b.id === bomId) || null;
      if (!packetBom) {
        packetBom = await db.query.cuttingPacketBOMs.findFirst({
          where: eq(cuttingPacketBOMs.id, bomId),
        });
      }
    }
    if (!packetBom && notesMaterialType) {
      const materialToPacketType: Record<string, string> = {
        'carbon_fiber': 'carbon fiber packet',
        'fiberglass': 'fiberglass packet',
        'mesa': 'mesa packet',
        'p2_disruptor': 'disruptor',
        'p2_disruptor_packet': 'disruptor packet',
        'p2_antenna': 'antenna cover',
        'p2_antenna_cover': 'antenna cover packet',
      };
      const targetType = materialToPacketType[notesMaterialType];
      if (targetType) {
        packetBom = allActiveBoms.find(b =>
          b.packetType.toLowerCase() === targetType ||
          b.packetType.toLowerCase().includes(targetType) ||
          targetType.includes(b.packetType.toLowerCase())
        ) || null;
      }
    }
    if (!packetBom && notesPacketName) {
      packetBom = allActiveBoms.find(b =>
        b.packetType.toLowerCase() === notesPacketName!.toLowerCase() ||
        b.packetType.toLowerCase().includes(notesPacketName!.toLowerCase()) ||
        notesPacketName!.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    if (!packetBom && queueItem.inventoryItemId) {
      packetBom = allActiveBoms.find(b => b.inventoryItemId != null && b.inventoryItemId === queueItem.inventoryItemId) || null;
    }
    if (!packetBom && inventoryItem?.agPartNumber) {
      packetBom = allActiveBoms.find(b => b.partNumber === inventoryItem!.agPartNumber) || null;
    }
    if (!packetBom && inventoryItem?.name) {
      packetBom = allActiveBoms.find(b =>
        b.packetType.toLowerCase() === inventoryItem!.name.toLowerCase() ||
        b.packetType.toLowerCase().includes(inventoryItem!.name.toLowerCase()) ||
        inventoryItem!.name.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // If no BOM exists, allow any material (no validation possible)
    if (!packetBom) {
      return res.json({
        valid: true,
        warning: 'No BOM configured for this packet - material accepted without validation',
        roll: {
          id: matchedRoll.id,
          fabric: matchedRoll.fabric,
          fabricPartNumber: matchedRoll.fabricPartNumber,
          nickname: matchedRoll.nickname,
          lotNumber: matchedRoll.lotNumber,
          batchNumber: matchedRoll.batchNumber,
          rollNumber: matchedRoll.rollNumber,
          internalControlNumber: matchedRoll.internalControlNumber,
          squareMeters: matchedRoll.squareMeters,
          expirationDate: matchedRoll.expirationDate,
          location: matchedRoll.location,
          freezerNumber: matchedRoll.freezerNumber,
          barcode: matchedRoll.barcode,
        },
      });
    }
    
    // Get BOM materials and parts to check fabric types
    const bomMaterials = await db
      .select()
      .from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, packetBom.id));
    
    const bomParts = await db
      .select()
      .from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, packetBom.id));
    
    // Collect all allowed fabric types from BOM (filter out empty strings)
    // Also fall back to base part number when fabricType/commonName are empty
    const allowedFabricTypes = new Set<string>();
    bomMaterials.forEach(m => {
      if (m.fabricType?.trim()) allowedFabricTypes.add(m.fabricType.trim().toLowerCase());
      if (m.commonName?.trim()) allowedFabricTypes.add(m.commonName.trim().toLowerCase());
    });
    bomParts.forEach(p => {
      if (p.fabricType?.trim()) allowedFabricTypes.add(p.fabricType.trim().toLowerCase());
      if (p.commonName?.trim()) allowedFabricTypes.add(p.commonName.trim().toLowerCase());
      if (!p.fabricType?.trim() && !p.commonName?.trim() && p.partNumber?.trim()) {
        const basePartNum = p.partNumber.trim().replace(/[a-zA-Z]+$/, '');
        if (basePartNum) allowedFabricTypes.add(basePartNum.toLowerCase());
      }
    });
    
    // Check if the scanned roll's fabric type matches any allowed type
    // Only compare non-empty fields to prevent false matches
    const rollFields = [
      (matchedRoll.fabric || '').trim().toLowerCase(),
      (matchedRoll.nickname || '').trim().toLowerCase(),
      (matchedRoll.fabricPartNumber || '').trim().toLowerCase(),
    ].filter(f => f.length > 0);
    
    if (rollFields.length === 0) {
      return res.status(400).json({
        valid: false,
        error: 'Scanned roll has no identifiable fabric type',
        scannedBarcode: barcode,
      });
    }
    
    const isMatch = Array.from(allowedFabricTypes).some(allowed => 
      rollFields.some(field => {
        if (field === allowed) return true;
        if (allowed.length >= 4 && field.includes(allowed)) return true;
        if (field.length >= 4 && allowed.includes(field)) return true;
        if (/^\d+$/.test(allowed) && allowed.length >= 3) {
          if (field.startsWith(allowed) || field === allowed) return true;
        }
        if (/^\d+$/.test(field) && field.length >= 3) {
          if (allowed.startsWith(field) || allowed === field) return true;
        }
        return false;
      })
    );
    
    if (!isMatch) {
      console.log(`[validate-material] REJECTED: roll partNum="${matchedRoll.fabricPartNumber}", fabric="${(matchedRoll.fabric||'').substring(0,40)}", allowedTypes=[${Array.from(allowedFabricTypes).join(', ')}], rollFields=[${rollFields.join(', ')}], BOM=${packetBom.id}`);
      return res.status(400).json({
        valid: false,
        error: `Material "${matchedRoll.fabric || matchedRoll.nickname || barcode}" does not match the BOM requirements for this packet`,
        scannedFabric: matchedRoll.fabric || matchedRoll.nickname,
        allowedTypes: Array.from(allowedFabricTypes),
        roll: {
          id: matchedRoll.id,
          fabric: matchedRoll.fabric,
          rollNumber: matchedRoll.rollNumber,
        },
      });
    }
    
    res.json({
      valid: true,
      roll: {
        id: matchedRoll.id,
        fabric: matchedRoll.fabric,
        fabricPartNumber: matchedRoll.fabricPartNumber,
        nickname: matchedRoll.nickname,
        lotNumber: matchedRoll.lotNumber,
        batchNumber: matchedRoll.batchNumber,
        rollNumber: matchedRoll.rollNumber,
        internalControlNumber: matchedRoll.internalControlNumber,
        squareMeters: matchedRoll.squareMeters,
        expirationDate: matchedRoll.expirationDate,
        location: matchedRoll.location,
        freezerNumber: matchedRoll.freezerNumber,
        barcode: matchedRoll.barcode,
      },
    });
  } catch (error) {
    console.error('Error validating material:', error);
    res.status(500).json({ error: 'Failed to validate material' });
  }
});

export default router;
