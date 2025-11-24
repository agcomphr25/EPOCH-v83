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
    
    const conditions = [eq(manufacturingQueue.department, 'Cutting Table')];
    
    if (status && status !== 'ALL') {
      conditions.push(eq(manufacturingQueue.status, status as string));
    }
    
    const queueItems = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(and(...conditions))
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

// Complete manufacturing queue item with traceability data
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
    
    // Update the manufacturing queue item
    const [updated] = await db
      .update(manufacturingQueue)
      .set({
        quantityCompleted,
        status: 'COMPLETED',
        completedAt: new Date(),
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
    
    res.json(updated);
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

export default router;
