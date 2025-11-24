import { Router } from 'express';
import { db } from '../../db';
import { manufacturingQueue, inventoryItems } from '../../schema';
import { eq, and, desc } from 'drizzle-orm';
import { insertManufacturingQueueSchema } from '../../schema';

const router = Router();

// Get manufacturing queue items by department
router.get('/', async (req, res) => {
  try {
    const { department, status } = req.query;
    
    let query = db
      .select({
        id: manufacturingQueue.id,
        inventoryItemId: manufacturingQueue.inventoryItemId,
        department: manufacturingQueue.department,
        quantityRequested: manufacturingQueue.quantityRequested,
        quantityCompleted: manufacturingQueue.quantityCompleted,
        priority: manufacturingQueue.priority,
        status: manufacturingQueue.status,
        dueDate: manufacturingQueue.dueDate,
        requestedBy: manufacturingQueue.requestedBy,
        assignedTo: manufacturingQueue.assignedTo,
        notes: manufacturingQueue.notes,
        startedAt: manufacturingQueue.startedAt,
        completedAt: manufacturingQueue.completedAt,
        createdAt: manufacturingQueue.createdAt,
        updatedAt: manufacturingQueue.updatedAt,
        // Include inventory item details
        inventoryItem: {
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          type: inventoryItems.type,
          manufacturingDepartment: inventoryItems.manufacturingDepartment,
          notes: inventoryItems.notes,
        },
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id));
    
    // Apply filters
    if (department) {
      query = query.where(eq(manufacturingQueue.department, department as string));
    }
    if (status) {
      query = query.where(eq(manufacturingQueue.status, status as string));
    }
    
    // Order by priority (lower number = higher priority), then by due date
    const items = await query.orderBy(manufacturingQueue.priority, manufacturingQueue.dueDate);
    
    res.json(items);
  } catch (error) {
    console.error('Error fetching manufacturing queue:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing queue' });
  }
});

// Get a single manufacturing queue item by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const item = await db
      .select({
        id: manufacturingQueue.id,
        inventoryItemId: manufacturingQueue.inventoryItemId,
        department: manufacturingQueue.department,
        quantityRequested: manufacturingQueue.quantityRequested,
        quantityCompleted: manufacturingQueue.quantityCompleted,
        priority: manufacturingQueue.priority,
        status: manufacturingQueue.status,
        dueDate: manufacturingQueue.dueDate,
        requestedBy: manufacturingQueue.requestedBy,
        assignedTo: manufacturingQueue.assignedTo,
        notes: manufacturingQueue.notes,
        startedAt: manufacturingQueue.startedAt,
        completedAt: manufacturingQueue.completedAt,
        createdAt: manufacturingQueue.createdAt,
        updatedAt: manufacturingQueue.updatedAt,
        inventoryItem: {
          id: inventoryItems.id,
          agPartNumber: inventoryItems.agPartNumber,
          name: inventoryItems.name,
          sku: inventoryItems.sku,
          type: inventoryItems.type,
          manufacturingDepartment: inventoryItems.manufacturingDepartment,
        },
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(eq(manufacturingQueue.id, id))
      .limit(1);
    
    if (item.length === 0) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(item[0]);
  } catch (error) {
    console.error('Error fetching manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturing queue item' });
  }
});

// Create a new manufacturing queue item
router.post('/', async (req, res) => {
  try {
    const validatedData = insertManufacturingQueueSchema.parse(req.body);
    
    const [newItem] = await db
      .insert(manufacturingQueue)
      .values(validatedData)
      .returning();
    
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating manufacturing queue item:', error);
    res.status(400).json({ error: 'Failed to create manufacturing queue item' });
  }
});

// Update a manufacturing queue item
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertManufacturingQueueSchema.partial().parse(req.body);
    
    const [updatedItem] = await db
      .update(manufacturingQueue)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(manufacturingQueue.id, id))
      .returning();
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating manufacturing queue item:', error);
    res.status(400).json({ error: 'Failed to update manufacturing queue item' });
  }
});

// Update status of a manufacturing queue item
router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    
    const updateData: any = { status, updatedAt: new Date() };
    
    if (status === 'IN_PROGRESS' && !req.body.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === 'COMPLETED' && !req.body.completedAt) {
      updateData.completedAt = new Date();
    }
    
    const [updatedItem] = await db
      .update(manufacturingQueue)
      .set(updateData)
      .where(eq(manufacturingQueue.id, id))
      .returning();
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating manufacturing queue item status:', error);
    res.status(400).json({ error: 'Failed to update status' });
  }
});

// Delete a manufacturing queue item
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    await db
      .delete(manufacturingQueue)
      .where(eq(manufacturingQueue.id, id));
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to delete manufacturing queue item' });
  }
});

export default router;
