import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertVendorSchema } from '@shared/schema';

const router = Router();

// GET /api/vendors - List vendors with search and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, approved, evaluated, page = '1', limit = '10' } = req.query;
    
    const result = await storage.getAllVendors({
      q: q as string,
      approved: approved as string,
      evaluated: evaluated as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

// GET /api/vendors/:id - Get specific vendor
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vendor = await storage.getVendor(parseInt(id));
    
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    
    res.json(vendor);
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

// POST /api/vendors - Create new vendor
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = insertVendorSchema.parse(req.body);
    
    const vendor = await storage.createVendor(validatedData);
    res.status(201).json(vendor);
  } catch (error: any) {
    console.error('Create vendor error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request body (allow partial updates)
    const validatedData = insertVendorSchema.partial().parse(req.body);
    
    const vendor = await storage.updateVendor(parseInt(id), validatedData);
    res.json(vendor);
  } catch (error: any) {
    console.error('Update vendor error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// DELETE /api/vendors/:id - Delete vendor (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await storage.deleteVendor(parseInt(id));
    res.json({ success: true, message: "Vendor deleted successfully" });
  } catch (error: any) {
    console.error('Delete vendor error:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

export default router;