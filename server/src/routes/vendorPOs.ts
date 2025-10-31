import { Router, Request, Response } from 'express';
import { insertVendorPOSchema, insertVendorPOItemSchema, insertVendorPOSettingsSchema } from '@shared/schema';
import { z } from 'zod';
import { storage } from '../../storage';

const router = Router();

// Query params schema for list vendor POs
const listVendorPOsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().optional(),
  status: z.enum(['Draft', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled', 'any']).default('any'),
  vendorId: z.coerce.number().int().positive().optional(),
  sort: z.string().default('createdAt:desc'),
});

// GET /api/vendor-pos - List all vendor POs with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = listVendorPOsQuerySchema.parse(req.query);
    const result = await storage.getAllVendorPOs(params);
    res.json(result);
  } catch (error) {
    console.error('Get vendor POs error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to retrieve vendor POs' });
  }
});

// GET /api/vendor-pos/settings - Get vendor PO settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getVendorPOSettings();
    if (!settings) {
      // Return default settings if none exist
      return res.json({
        termsAndConditions: '',
        paymentTerms: '',
        shippingInstructions: '',
      });
    }
    res.json(settings);
  } catch (error) {
    console.error('Get vendor PO settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO settings' });
  }
});

// PUT /api/vendor-pos/settings - Update vendor PO settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const data = insertVendorPOSettingsSchema.partial().parse(req.body);
    const settings = await storage.updateVendorPOSettings(data);
    res.json(settings);
  } catch (error) {
    console.error('Update vendor PO settings error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO settings data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO settings' });
  }
});

// GET /api/vendor-pos/:id - Get a single vendor PO
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const vendorPO = await storage.getVendorPO(id);
    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    res.json(vendorPO);
  } catch (error) {
    console.error('Get vendor PO error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO' });
  }
});

// POST /api/vendor-pos - Create a new vendor PO
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = insertVendorPOSchema.parse(req.body);
    const vendorPO = await storage.createVendorPO(data);
    res.status(201).json(vendorPO);
  } catch (error) {
    console.error('Create vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor PO' });
  }
});

// PUT /api/vendor-pos/:id - Update a vendor PO
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const data = insertVendorPOSchema.partial().parse(req.body);
    const vendorPO = await storage.updateVendorPO(id, data);

    if (!vendorPO) {
      return res.status(404).json({ error: 'Vendor PO not found' });
    }

    res.json(vendorPO);
  } catch (error) {
    console.error('Update vendor PO error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO' });
  }
});

// DELETE /api/vendor-pos/:id - Delete a vendor PO
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    await storage.deleteVendorPO(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete vendor PO error:', error);
    res.status(500).json({ error: 'Failed to delete vendor PO' });
  }
});

// GET /api/vendor-pos/:id/items - Get all items for a vendor PO
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const items = await storage.getVendorPOItems(vendorPoId);
    res.json(items);
  } catch (error) {
    console.error('Get vendor PO items error:', error);
    res.status(500).json({ error: 'Failed to retrieve vendor PO items' });
  }
});

// POST /api/vendor-pos/:id/items - Add an item to a vendor PO
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const vendorPoId = parseInt(req.params.id);
    if (isNaN(vendorPoId)) {
      return res.status(400).json({ error: 'Invalid vendor PO ID' });
    }

    const data = insertVendorPOItemSchema.parse({
      ...req.body,
      vendorPoId,
    });

    const item = await storage.createVendorPOItem(data);
    res.status(201).json(item);
  } catch (error) {
    console.error('Create vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO item data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor PO item' });
  }
});

// PUT /api/vendor-pos/items/:itemId - Update a vendor PO item
router.put('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    const data = insertVendorPOItemSchema.partial().parse(req.body);
    const item = await storage.updateVendorPOItem(itemId, data);

    if (!item) {
      return res.status(404).json({ error: 'Vendor PO item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Update vendor PO item error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor PO item data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor PO item' });
  }
});

// DELETE /api/vendor-pos/items/:itemId - Delete a vendor PO item
router.delete('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid vendor PO item ID' });
    }

    await storage.deleteVendorPOItem(itemId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete vendor PO item error:', error);
    res.status(500).json({ error: 'Failed to delete vendor PO item' });
  }
});

export default router;
