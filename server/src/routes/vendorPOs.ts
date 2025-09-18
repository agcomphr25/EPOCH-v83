import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { 
  insertVendorPurchaseOrderSchema, 
  insertVendorPurchaseOrderItemSchema,
  VendorPurchaseOrder,
  VendorPurchaseOrderItem 
} from '../../schema';

const router = Router();

// Permission check middleware
async function checkVendorPOPermission(req: Request, res: Response, next: any) {
  try {
    // In development, skip auth for testing
    if (process.env.NODE_ENV === 'development') {
      (req as any).user = { username: 'dev-user' };
      return next();
    }
    
    // This assumes auth middleware has set req.user.username
    const username = (req as any).user?.username;
    if (!username) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user || !user.canCreateVendorPOs) {
      return res.status(403).json({ error: "Insufficient permissions to manage vendor purchase orders" });
    }

    next();
  } catch (error) {
    console.error('Vendor PO permission check error:', error);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// Generate PO number in VP-YY-### format
async function generatePONumber(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `VP-${year}-`;
  
  // Find the highest existing PO number for this year
  const existingPOs = await storage.getAllVendorPurchaseOrders();
  const thisYearPOs = existingPOs.filter(po => po.poNumber.startsWith(prefix));
  
  let nextNumber = 1;
  if (thisYearPOs.length > 0) {
    const numbers = thisYearPOs.map(po => {
      const numberPart = po.poNumber.replace(prefix, '');
      return parseInt(numberPart, 10) || 0;
    });
    nextNumber = Math.max(...numbers) + 1;
  }
  
  return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
}

// Generate barcode for vendor PO
function generateBarcode(): string {
  // Generate a unique barcode using timestamp and random number
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `VPO${timestamp.slice(-6)}${random}`;
}

// Calculate total cost for a vendor PO
async function calculateTotalCost(vendorPoId: number): Promise<number> {
  const items = await storage.getVendorPurchaseOrderItems(vendorPoId);
  return items.reduce((total, item) => total + (item.totalPrice || 0), 0);
}

// GET /api/vendor-pos - Get all vendor purchase orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const pos = await storage.getAllVendorPurchaseOrders();
    res.json(pos);
  } catch (error) {
    console.error('Get vendor POs error:', error);
    res.status(500).json({ error: "Failed to fetch vendor purchase orders" });
  }
});

// GET /api/vendor-pos/:id - Get a specific vendor purchase order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const po = await storage.getVendorPurchaseOrder(parseInt(id));
    
    if (!po) {
      return res.status(404).json({ error: "Vendor purchase order not found" });
    }
    
    // Include items if requested
    const includeItems = req.query.includeItems === 'true';
    if (includeItems) {
      const items = await storage.getVendorPurchaseOrderItems(parseInt(id));
      return res.json({ ...po, items });
    }
    
    res.json(po);
  } catch (error) {
    console.error('Get vendor PO error:', error);
    res.status(500).json({ error: "Failed to fetch vendor purchase order" });
  }
});

// POST /api/vendor-pos - Create a new vendor purchase order
router.post('/', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    // Transform frontend payload to match backend schema
    const { vendorId, expectedDeliveryDate, shipVia, notes } = req.body;
    
    // Get vendor information
    const vendorsResult = await storage.getAllVendors();
    const vendor = vendorsResult.data.find((v: any) => v.id === vendorId);
    if (!vendor) {
      return res.status(400).json({ error: 'Vendor not found' });
    }
    
    // Map frontend shipVia to backend enum values
    const shipViaMapping: { [key: string]: string } = {
      'Other': 'Delivery',
      'FedEx Ground': 'Delivery',
      'FedEx Express': 'Delivery', 
      'UPS Ground': 'UPS',
      'UPS Next Day': 'UPS',
      'USPS': 'Delivery',
      'Freight': 'Delivery',
      'Will Call': 'Pickup'
    };

    // Normalize and map shipVia with debugging
    const rawShipVia = String(shipVia || '').trim();
    const mappedShipVia = shipViaMapping[rawShipVia] || rawShipVia || 'Delivery';
    if (process.env.NODE_ENV === 'development') {
      console.log('ShipVia mapping:', { raw: rawShipVia, mapped: mappedShipVia });
    }

    // Prepare data for validation with correct field names
    const poData = insertVendorPurchaseOrderSchema.parse({
      vendorId,
      vendorName: vendor.name,
      buyerName: (req as any).user?.username || 'System',
      poDate: new Date(),
      expectedDelivery: new Date(expectedDeliveryDate),
      shipVia: mappedShipVia,
      notes,
      status: 'DRAFT'
    });
    
    // Generate PO number and barcode
    const poNumber = await generatePONumber();
    const barcode = generateBarcode();
    
    const newPO = await storage.createVendorPurchaseOrder({
      ...poData,
      poNumber,
      barcode,
      totalCost: 0 // Will be calculated when items are added
    });
    
    res.status(201).json(newPO);
  } catch (error) {
    console.error('Create vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create vendor purchase order" });
  }
});

// PUT /api/vendor-pos/:id - Update a vendor purchase order
router.put('/:id', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = insertVendorPurchaseOrderSchema.partial().parse(req.body);
    
    const updatedPO = await storage.updateVendorPurchaseOrder(parseInt(id), updateData);
    
    if (!updatedPO) {
      return res.status(404).json({ error: "Vendor purchase order not found" });
    }
    
    res.json(updatedPO);
  } catch (error) {
    console.error('Update vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update vendor purchase order" });
  }
});

// DELETE /api/vendor-pos/:id - Delete a vendor purchase order
router.delete('/:id', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await storage.deleteVendorPurchaseOrder(parseInt(id));
    
    if (!success) {
      return res.status(404).json({ error: "Vendor purchase order not found" });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vendor PO error:', error);
    res.status(500).json({ error: "Failed to delete vendor purchase order" });
  }
});

// GET /api/vendor-pos/:id/items - Get items for a vendor purchase order
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const items = await storage.getVendorPurchaseOrderItems(parseInt(id));
    res.json(items);
  } catch (error) {
    console.error('Get vendor PO items error:', error);
    res.status(500).json({ error: "Failed to fetch vendor purchase order items" });
  }
});

// POST /api/vendor-pos/:id/items - Add an item to a vendor purchase order
router.post('/:id/items', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vendorPoId = parseInt(id);
    
    // Auto-generate line number based on existing items
    const existingItems = await storage.getVendorPurchaseOrderItems(vendorPoId);
    const nextLineNumber = existingItems.length + 1;
    
    const itemData = insertVendorPurchaseOrderItemSchema.parse({
      ...req.body,
      vendorPoId,
      lineNumber: nextLineNumber
    });
    
    // Calculate total price
    const totalPrice = itemData.quantity * (itemData.unitPrice || 0);
    
    const newItem = await storage.createVendorPurchaseOrderItem({
      ...itemData,
      totalPrice
    });
    
    // Update PO total cost
    const newTotalCost = await calculateTotalCost(vendorPoId);
    await storage.updateVendorPurchaseOrder(vendorPoId, { totalCost: newTotalCost });
    
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create vendor purchase order item" });
  }
});

// PUT /api/vendor-pos/:id/items/:itemId - Update a vendor purchase order item
router.put('/:id/items/:itemId', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    const { id, itemId } = req.params;
    const vendorPoId = parseInt(id);
    const itemIdNum = parseInt(itemId);
    
    const updateData = insertVendorPurchaseOrderItemSchema.partial().parse(req.body);
    
    // Recalculate total price if quantity or unit price changed
    if (updateData.quantity !== undefined || updateData.unitPrice !== undefined) {
      const existingItem = await storage.getVendorPurchaseOrderItem(itemIdNum);
      if (existingItem) {
        const quantity = updateData.quantity ?? existingItem.quantity;
        const unitPrice = updateData.unitPrice ?? (existingItem.unitPrice || 0);
        (updateData as any).totalPrice = quantity * unitPrice;
      }
    }
    
    const updatedItem = await storage.updateVendorPurchaseOrderItem(itemIdNum, updateData);
    
    if (!updatedItem) {
      return res.status(404).json({ error: "Vendor purchase order item not found" });
    }
    
    // Update PO total cost
    const newTotalCost = await calculateTotalCost(vendorPoId);
    await storage.updateVendorPurchaseOrder(vendorPoId, { totalCost: newTotalCost });
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Update vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update vendor purchase order item" });
  }
});

// DELETE /api/vendor-pos/:id/items/:itemId - Delete a vendor purchase order item
router.delete('/:id/items/:itemId', checkVendorPOPermission, async (req: Request, res: Response) => {
  try {
    const { id, itemId } = req.params;
    const vendorPoId = parseInt(id);
    const success = await storage.deleteVendorPurchaseOrderItem(parseInt(itemId));
    
    if (!success) {
      return res.status(404).json({ error: "Vendor purchase order item not found" });
    }
    
    // Update PO total cost
    const newTotalCost = await calculateTotalCost(vendorPoId);
    await storage.updateVendorPurchaseOrder(vendorPoId, { totalCost: newTotalCost });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vendor PO item error:', error);
    res.status(500).json({ error: "Failed to delete vendor purchase order item" });
  }
});

// GET /api/vendor-pos/user/:username/can-create - Check if user can create vendor POs
router.get('/user/:username/can-create', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const user = await storage.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ canCreateVendorPOs: user.canCreateVendorPOs || false });
  } catch (error) {
    console.error('Check vendor PO permissions error:', error);
    res.status(500).json({ error: "Failed to check vendor PO permissions" });
  }
});

export default router;