import { Router, Request, Response } from 'express';
import { insertVendorSchema, insertVendorContactSchema } from '@shared/schema';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { storage } from '../../storage';

const router = Router();

// Ensure vendor-approvals directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
const vendorApprovalsDir = path.join(uploadsDir, 'vendor-approvals');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(vendorApprovalsDir)) {
  fs.mkdirSync(vendorApprovalsDir, { recursive: true });
}

// Configure multer for vendor approval PDFs
const vendorApprovalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, vendorApprovalsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `vendor_approval_${timestamp}_${hash}${ext}`);
  },
});

const vendorApprovalUpload = multer({
  storage: vendorApprovalStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

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

// POST /api/vendors/upload/approval - Upload vendor approval PDF
router.post('/upload/approval', vendorApprovalUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/vendor-approvals/${req.file.filename}`;
    
    res.status(200).json({
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    console.error('Vendor approval upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Vendor Monthly Evaluations Routes

// GET /api/vendors/:vendorId/evaluations - Get monthly evaluations for a vendor
router.get('/:vendorId/evaluations', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const evaluations = await storage.getVendorMonthlyEvaluations(vendorId, year);
    res.json(evaluations);
  } catch (error) {
    console.error('Get vendor monthly evaluations error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor monthly evaluations' });
  }
});

// POST /api/vendors/:vendorId/evaluations - Create or update a monthly evaluation
router.post('/:vendorId/evaluations', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (!Number.isInteger(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const { month, year, qualityScore, costScore, deliveryScore, responseScore, notes } = req.body;

    // Validation
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Check if evaluation exists
    const existing = await storage.getVendorMonthlyEvaluation(vendorId, month, year);

    let evaluation;
    if (existing) {
      // Update existing
      evaluation = await storage.updateVendorMonthlyEvaluation(existing.id, {
        qualityScore,
        costScore,
        deliveryScore,
        responseScore,
        notes,
      });
    } else {
      // Create new
      evaluation = await storage.createVendorMonthlyEvaluation({
        vendorId,
        month,
        year,
        qualityScore,
        costScore,
        deliveryScore,
        responseScore,
        notes,
      });
    }

    res.json(evaluation);
  } catch (error) {
    console.error('Create/update vendor monthly evaluation error:', error);
    res.status(500).json({ error: 'Failed to save vendor monthly evaluation' });
  }
});

// DELETE /api/vendors/:vendorId/evaluations/:evaluationId - Delete a monthly evaluation
router.delete('/:vendorId/evaluations/:evaluationId', async (req: Request, res: Response) => {
  try {
    const evaluationId = parseInt(req.params.evaluationId);
    if (!Number.isInteger(evaluationId)) {
      return res.status(400).json({ error: 'Invalid evaluation ID' });
    }

    await storage.deleteVendorMonthlyEvaluation(evaluationId);
    res.json({ success: true, message: 'Evaluation deleted successfully' });
  } catch (error) {
    console.error('Delete vendor monthly evaluation error:', error);
    res.status(500).json({ error: 'Failed to delete vendor monthly evaluation' });
  }
});

// POST /api/vendors/import-evaluations - Import evaluations from CSV
router.post('/import-evaluations', async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body;

    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ error: 'Invalid CSV data' });
    }

    const results = {
      processed: 0,
      matched: 0,
      unmatched: [] as string[],
      created: 0,
      errors: [] as any[],
    };

    // Get all vendors for matching
    const vendorsResult = await storage.getAllVendors({ pageSize: 1000 });
    const vendors = vendorsResult.data;

    // Parse CSV and match vendors
    for (const row of csvData) {
      results.processed++;

      const vendorName = row['PL2 Supplier 2025'];
      if (!vendorName || vendorName.trim() === '') {
        continue;
      }

      // Try to match vendor by name (case-insensitive)
      const matchedVendor = vendors.find(v => 
        v.name.toLowerCase().trim() === vendorName.toLowerCase().trim()
      );

      if (!matchedVendor) {
        results.unmatched.push(vendorName);
        continue;
      }

      results.matched++;

      // Extract monthly scores from CSV columns
      const months = [
        { name: 'Jan', num: 1 },
        { name: 'Feb', num: 2 },
        { name: 'Mar', num: 3 },
        { name: 'Apr', num: 4 },
        { name: 'May', num: 5 },
        { name: 'Jun', num: 6 },
        { name: 'Jul', num: 7 },
        { name: 'Aug', num: 8 },
        { name: 'Sep', num: 9 },
        { name: 'Oct', num: 10 },
        { name: 'Nov', num: 11 },
        { name: 'Dec', num: 12 },
      ];

      for (const month of months) {
        const qualityKey = `${month.name}- Quality`;
        const costKey = `${month.name}- Cost`;
        const deliveryKey = `${month.name}- Delivery`;
        const responseKey = `${month.name}- Response`;

        const qualityScore = row[qualityKey] ? parseInt(row[qualityKey]) : null;
        const costScore = row[costKey] ? parseInt(row[costKey]) : null;
        const deliveryScore = row[deliveryKey] ? parseInt(row[deliveryKey]) : null;
        const responseScore = row[responseKey] ? parseInt(row[responseKey]) : null;

        // Only create if at least one score is present
        if (qualityScore || costScore || deliveryScore || responseScore) {
          try {
            // Check if evaluation already exists
            const existing = await storage.getVendorMonthlyEvaluation(matchedVendor.id, month.num, 2025);

            if (existing) {
              // Update existing
              await storage.updateVendorMonthlyEvaluation(existing.id, {
                qualityScore,
                costScore,
                deliveryScore,
                responseScore,
              });
            } else {
              // Create new
              await storage.createVendorMonthlyEvaluation({
                vendorId: matchedVendor.id,
                month: month.num,
                year: 2025,
                qualityScore,
                costScore,
                deliveryScore,
                responseScore,
              });
              results.created++;
            }
          } catch (error) {
            results.errors.push({
              vendor: vendorName,
              month: month.name,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Import vendor evaluations error:', error);
    res.status(500).json({ error: 'Failed to import vendor evaluations' });
  }
});

export default router;
