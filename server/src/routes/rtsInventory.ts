import { Router } from 'express';
import { db } from '../../db';
import { rtsInventory, rtsInventoryHistory, insertRtsInventorySchema } from '../../schema';
import { eq, desc } from 'drizzle-orm';
import XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
      const item = {
        stockModel: (row as any)['Stock Model'] || '',
        actionLength: (row as any)['Action Length'] || null,
        action: (row as any)['Action '] || (row as any)['Action'] || null, // Handle trailing space
        barrel: (row as any)['Barrel'] || null,
        bottomMetal: (row as any)['Bottom Metal'] || null,
        color: (row as any)['Color'] || null,
        extras: (row as any)['Extras'] || null,
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

// Delete an item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(rtsInventory).where(eq(rtsInventory.id, id));

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting RTS inventory item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
