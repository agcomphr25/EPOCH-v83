import { Router, Request, Response } from 'express';
import { insertVendorSchema, insertVendorContactSchema } from '@shared/schema';
import { z } from 'zod';

import { storage } from '../../storage';

const router = Router();

// Query params schema for list vendors
const listVendorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(10),
  search: z.string().optional(),
  approved: z.enum(['true', 'false', 'any']).default('any'),
  evaluated: z.enum(['true', 'false', 'any']).default('any'),
  evalFrom: z.string().optional(),
  evalTo: z.string().optional(),
  sort: z.string().default('createdAt:desc'),
});

// GET /api/vendors - List all vendors with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = listVendorsQuerySchema.parse(req.query);
    const result = await storage.getAllVendors(params);
    res.json(result);
  } catch (error) {
    console.error('Get vendors error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /api/vendors/:id - Get a single vendor by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await storage.getVendor(id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json(vendor);
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// POST /api/vendors - Create a new vendor
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = insertVendorSchema.parse(req.body);
    const vendor = await storage.createVendor(data);
    res.status(201).json(vendor);
  } catch (error) {
    console.error('Create vendor error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/vendors/:id - Update a vendor
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const data = insertVendorSchema.partial().parse(req.body);
    
    // Auto-update evaluation status if notes contain evaluation data
    if (data.notes && typeof data.notes === 'string') {
      const hasQuality = data.notes.includes('Quality:');
      const hasDelivery = data.notes.includes('Delivery Rating:');
      const hasCost = data.notes.includes('Cost:');
      const hasCommunication = data.notes.includes('Communication:');
      
      // If all 4 evaluation criteria are present, mark as evaluated
      if (hasQuality && hasDelivery && hasCost && hasCommunication) {
        data.evaluated = true;
        // Set evaluation date to today if not already set
        if (!data.evaluationDate) {
          data.evaluationDate = new Date().toISOString().split('T')[0];
        }
        console.log(`✅ Vendor ${id} marked as evaluated (all criteria completed)`);
      }
    }
    
    const vendor = await storage.updateVendor(id, data);
    res.json(vendor);
  } catch (error) {
    console.error('Update vendor error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid vendor data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id - Delete (soft delete) a vendor
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    await storage.deleteVendor(id);
    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// Vendor Contacts Routes

// GET /api/vendors/:vendorId/contacts - Get all contacts for a vendor
router.get('/:vendorId/contacts', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const contacts = await storage.getVendorContacts(vendorId);
    res.json(contacts);
  } catch (error) {
    console.error('Get vendor contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor contacts' });
  }
});

// POST /api/vendors/:vendorId/contacts - Create a new contact for a vendor
router.post('/:vendorId/contacts', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const data = insertVendorContactSchema.parse({ ...req.body, vendorId });
    const contact = await storage.createVendorContact(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Create vendor contact error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid contact data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create vendor contact' });
  }
});

// PUT /api/vendors/:vendorId/contacts/:contactId - Update a vendor contact
router.put(
  '/:vendorId/contacts/:contactId',
  async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const contactId = parseInt(req.params.contactId);

      if (!Number.isInteger(vendorId) || !Number.isInteger(contactId)) {
        return res.status(400).json({ error: 'Invalid vendor or contact ID' });
      }

      // Verify the contact belongs to the specified vendor
      const existingContacts = await storage.getVendorContacts(vendorId);
      const contactExists = existingContacts.some((c) => c.id === contactId);

      if (!contactExists) {
        return res
          .status(404)
          .json({ error: 'Contact not found for this vendor' });
      }

      // Parse and validate request body, but exclude vendorId to prevent reassignment
      const data = insertVendorContactSchema
        .partial()
        .omit({ vendorId: true })
        .parse(req.body);
      const contact = await storage.updateVendorContact(contactId, data);
      res.json(contact);
    } catch (error) {
      console.error('Update vendor contact error:', error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: 'Invalid contact data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to update vendor contact' });
    }
  }
);

// DELETE /api/vendors/:vendorId/contacts/:contactId - Delete a vendor contact
router.delete(
  '/:vendorId/contacts/:contactId',
  async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const contactId = parseInt(req.params.contactId);

      if (!Number.isInteger(vendorId) || !Number.isInteger(contactId)) {
        return res.status(400).json({ error: 'Invalid vendor or contact ID' });
      }

      // Verify the contact belongs to the specified vendor
      const existingContacts = await storage.getVendorContacts(vendorId);
      const contactExists = existingContacts.some((c) => c.id === contactId);

      if (!contactExists) {
        return res
          .status(404)
          .json({ error: 'Contact not found for this vendor' });
      }

      await storage.deleteVendorContact(contactId);
      res.json({ success: true, message: 'Contact deleted successfully' });
    } catch (error) {
      console.error('Delete vendor contact error:', error);
      res.status(500).json({ error: 'Failed to delete vendor contact' });
    }
  }
);

export default router;
