import express, { Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { manufacturingQueue, inventoryItems } from '../../schema';
import { eq, and, or } from 'drizzle-orm';
import { generateBarcodeImage } from '../utils/barcodeGenerator';

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
    
    const formattedItems = queueItems.map(row => ({
      ...row.queue,
      partNumber: row.item?.agPartNumber,
      partName: row.item?.name,
      inventoryItem: row.item,
    }));
    
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
      
      // Generate barcode image
      let barcodeImage;
      try {
        barcodeImage = generateBarcodeImage(barcodeValue, {
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
        
        // Generate barcode image
        let barcodeImage;
        try {
          barcodeImage = generateBarcodeImage(packet.barcode, {
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

export default router;
