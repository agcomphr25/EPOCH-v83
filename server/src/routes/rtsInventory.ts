import { Router } from 'express';
import { db } from '../../db';
import { rtsInventory, rtsInventoryHistory, insertRtsInventorySchema } from '../../schema';
import { eq, desc } from 'drizzle-orm';
import XLSX from 'xlsx';
import multer from 'multer';
import { z } from 'zod';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const rtsLastDepartmentSchema = z.enum([
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
]);

// Get all RTS inventory items
router.get('/', async (req, res) => {
  try {
    const items = await db
      .select()
      .from(rtsInventory)
      .orderBy(desc(rtsInventory.createdAt));

    res.json(items);
  } catch (error) {
    console.error('Error fetching RTS inventory:', error);
    res.status(500).json({ error: 'Failed to fetch RTS inventory' });
  }
});

// Get RTS items in shipping department
router.get('/in-shipping', async (req, res) => {
  try {
    const items = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.status, 'IN_SHIPPING'))
      .orderBy(desc(rtsInventory.createdAt));

    res.json(items);
  } catch (error) {
    console.error('Error fetching RTS items in shipping:', error);
    res.status(500).json({ error: 'Failed to fetch RTS items in shipping' });
  }
});

// Get single RTS inventory item
router.get('/:id', async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.id, req.params.id));

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching RTS inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Get item history
router.get('/:id/history', async (req, res) => {
  try {
    const history = await db
      .select()
      .from(rtsInventoryHistory)
      .where(eq(rtsInventoryHistory.rtsInventoryId, req.params.id))
      .orderBy(desc(rtsInventoryHistory.performedAt));

    res.json(history);
  } catch (error) {
    console.error('Error fetching RTS inventory history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Create a new RTS inventory item manually
router.post('/', async (req, res) => {
  try {
    const lastDepartment = rtsLastDepartmentSchema.parse(req.body.lastDepartment);
    const validatedData = insertRtsInventorySchema.parse({
      ...req.body,
      lastDepartment,
      status: 'AVAILABLE',
    });

    const [inserted] = await db.insert(rtsInventory).values(validatedData).returning();
    
    // Create history entry
    await db.insert(rtsInventoryHistory).values({
      rtsInventoryId: inserted.id,
      action: 'CREATED',
      toStatus: 'AVAILABLE',
      performedBy: req.user?.username || 'System',
      notes: 'Manually added',
    });

    res.json(inserted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'A valid last department is required' });
    }
    console.error('Error creating RTS inventory item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update sellable-stock details and the saved production resume point.
router.patch('/:id', async (req, res) => {
  try {
    const lastDepartment = rtsLastDepartmentSchema.parse(req.body.lastDepartment);
    const price = req.body.price === '' || req.body.price == null
      ? null
      : Number(req.body.price);

    if (price !== null && !Number.isFinite(price)) {
      return res.status(400).json({ error: 'Price must be a valid number' });
    }

    const [updated] = await db
      .update(rtsInventory)
      .set({
        stockModel: req.body.stockModel,
        actionLength: req.body.actionLength || null,
        action: req.body.action || null,
        barrel: req.body.barrel || null,
        bottomMetal: req.body.bottomMetal || null,
        color: req.body.color || null,
        extras: req.body.extras || null,
        lastDepartment,
        price,
        updatedAt: new Date(),
      })
      .where(eq(rtsInventory.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'A valid last department is required' });
    }
    console.error('Error updating RTS inventory item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Import Excel file
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const insertedItems = [];

    for (const row of data) {
      const lastDepartment = rtsLastDepartmentSchema.parse((row as any)['Last Department']);
      const item = {
        stockModel: (row as any)['Stock Model'] || '',
        actionLength: (row as any)['Action Length'] || null,
        action: (row as any)['Action '] || (row as any)['Action'] || null, // Handle trailing space
        barrel: (row as any)['Barrel'] || null,
        bottomMetal: (row as any)['Bottom Metal'] || null,
        color: (row as any)['Color'] || null,
        extras: (row as any)['Extras'] || null,
        lastDepartment,
        status: 'AVAILABLE',
      };

      const [inserted] = await db.insert(rtsInventory).values(item).returning();
      
      // Create history entry
      await db.insert(rtsInventoryHistory).values({
        rtsInventoryId: inserted.id,
        action: 'CREATED',
        toStatus: 'AVAILABLE',
        performedBy: req.user?.username || 'System',
        notes: 'Imported from Excel',
      });

      insertedItems.push(inserted);
    }

    res.json({
      message: `Successfully imported ${insertedItems.length} items`,
      items: insertedItems,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Every imported item requires a valid Last Department value',
      });
    }
    console.error('Error importing RTS inventory:', error);
    res.status(500).json({ error: 'Failed to import inventory' });
  }
});

// Send item to Shipping department
router.post('/:id/ship', async (req, res) => {
  try {
    const { id } = req.params;
    const performedBy = req.user?.username || 'Unknown';

    const [item] = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.id, id));

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ error: 'Item is not available to send to shipping' });
    }

    const [updated] = await db
      .update(rtsInventory)
      .set({
        status: 'IN_SHIPPING',
        currentDepartment: 'Shipping',
        updatedAt: new Date(),
      })
      .where(eq(rtsInventory.id, id))
      .returning();

    // Create history entry
    await db.insert(rtsInventoryHistory).values({
      rtsInventoryId: id,
      action: 'SENT_TO_SHIPPING',
      fromStatus: 'AVAILABLE',
      toStatus: 'IN_SHIPPING',
      department: 'Shipping',
      performedBy,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error sending RTS inventory item to shipping:', error);
    res.status(500).json({ error: 'Failed to send item to shipping' });
  }
});

// Mark item as shipped (used by Shipping department)
router.post('/:id/mark-shipped', async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, shippingCarrier } = req.body;
    const performedBy = req.user?.username || 'Unknown';

    const [item] = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.id, id));

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.status !== 'IN_SHIPPING') {
      return res.status(400).json({ error: 'Item is not in shipping department' });
    }

    const [updated] = await db
      .update(rtsInventory)
      .set({
        status: 'SHIPPED',
        shippedDate: new Date(),
        shippedBy: performedBy,
        updatedAt: new Date(),
      })
      .where(eq(rtsInventory.id, id))
      .returning();

    // Create history entry
    await db.insert(rtsInventoryHistory).values({
      rtsInventoryId: id,
      action: 'SHIPPED',
      fromStatus: 'IN_SHIPPING',
      toStatus: 'SHIPPED',
      department: 'Shipping',
      performedBy,
      notes: trackingNumber ? `Tracking: ${trackingNumber}` : null,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error marking RTS inventory item as shipped:', error);
    res.status(500).json({ error: 'Failed to mark item as shipped' });
  }
});

// Send to production
router.post('/:id/send-to-production', async (req, res) => {
  try {
    const { id } = req.params;
    const { department, reason, notes } = req.body;
    const performedBy = req.user?.username || 'Unknown';

    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const [item] = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.id, id));

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ error: 'Item is not available to send to production' });
    }

    const [updated] = await db
      .update(rtsInventory)
      .set({
        status: 'IN_PRODUCTION',
        currentDepartment: department,
        returnReason: reason,
        returnNotes: notes || null,
        returnedToProductionDate: new Date(),
        returnedBy: performedBy,
        updatedAt: new Date(),
      })
      .where(eq(rtsInventory.id, id))
      .returning();

    // Create history entry
    await db.insert(rtsInventoryHistory).values({
      rtsInventoryId: id,
      action: 'RETURNED_TO_PRODUCTION',
      fromStatus: 'AVAILABLE',
      toStatus: 'IN_PRODUCTION',
      department,
      reason,
      notes: notes || null,
      performedBy,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error sending RTS inventory item to production:', error);
    res.status(500).json({ error: 'Failed to send item to production' });
  }
});

// Remove an item from the sellable queue while preserving its audit history.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const performedBy = req.user?.username || 'Unknown';

    const [item] = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.id, id));

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ error: 'Only available RTS items can be removed' });
    }

    const removed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(rtsInventory)
        .set({
          status: 'REMOVED',
          updatedAt: new Date(),
        })
        .where(eq(rtsInventory.id, id))
        .returning();

      await tx.insert(rtsInventoryHistory).values({
        rtsInventoryId: id,
        action: 'REMOVED',
        fromStatus: 'AVAILABLE',
        toStatus: 'REMOVED',
        performedBy,
        notes: 'Removed from the Ready to Sell queue',
      });

      return updated;
    });

    res.json({ message: 'Item removed successfully', item: removed });
  } catch (error) {
    console.error('Error removing RTS inventory item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

export default router;
