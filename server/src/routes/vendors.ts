import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../../db';
import { storage } from '../../storage';
import { insertVendorSchema, insertVendorContactSchema, insertVendorAddressSchema } from '../../schema';
import { z } from 'zod';

const router = Router();

// Vendor Management Routes

// Get all vendors
router.get("/", async (req, res) => {
  try {
    const vendors = await storage.getAllVendors();
    res.json(vendors);
  } catch (error) {
    console.error("Get vendors error:", error);
    res.status(500).json({ error: "Failed to retrieve vendors" });
  }
});

// Search vendors
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }
    const vendors = await storage.searchVendors(query);
    res.json(vendors);
  } catch (error) {
    console.error("Search vendors error:", error);
    res.status(500).json({ error: "Failed to search vendors" });
  }
});

// Get vendor by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const vendor = await storage.getVendor(id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    res.json(vendor);
  } catch (error) {
    console.error("Get vendor error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor" });
  }
});

// Get vendor with details (contacts, addresses, documents)
router.get("/:id/details", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const vendor = await storage.getVendorWithDetails(id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    res.json(vendor);
  } catch (error) {
    console.error("Get vendor details error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor details" });
  }
});

// Create vendor
router.post("/", async (req, res) => {
  try {
    const data = insertVendorSchema.parse(req.body);
    const vendor = await storage.createVendor(data);
    res.status(201).json(vendor);
  } catch (error) {
    console.error("Create vendor error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid vendor data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create vendor" });
    }
  }
});

// Update vendor
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertVendorSchema.partial().parse(req.body);
    const vendor = await storage.updateVendor(id, data);
    res.json(vendor);
  } catch (error) {
    console.error("Update vendor error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid vendor data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update vendor" });
    }
  }
});

// Delete vendor
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteVendor(id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete vendor error:", error);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
});

// Vendor Contacts Routes

// Get vendor contacts  
router.get("/:vendorId/contacts", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const contacts = await storage.getVendorContacts(vendorId);
    res.json(contacts);
  } catch (error) {
    console.error("Get vendor contacts error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor contacts" });
  }
});

// Create vendor contact
router.post("/:vendorId/contacts", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const data = { ...req.body, vendorId };
    const contact = await storage.createVendorContact(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error("Create vendor contact error:", error);
    res.status(500).json({ error: "Failed to create vendor contact" });
  }
});

// Update vendor contact
router.put("/:vendorId/contacts/:contactId", async (req, res) => {
  try {
    const contactId = parseInt(req.params.contactId);
    const data = req.body;
    const contact = await storage.updateVendorContact(contactId, data);
    res.json(contact);
  } catch (error) {
    console.error("Update vendor contact error:", error);
    res.status(500).json({ error: "Failed to update vendor contact" });
  }
});

// Vendor Addresses Routes

// Get vendor addresses
router.get("/:vendorId/addresses", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const addresses = await storage.getVendorAddresses(vendorId);
    res.json(addresses);
  } catch (error) {
    console.error("Get vendor addresses error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor addresses" });
  }
});

// Vendor Documents Routes

// Get vendor documents
router.get("/:vendorId/documents", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const documents = await storage.getVendorDocuments(vendorId);
    res.json(documents);
  } catch (error) {
    console.error("Get vendor documents error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor documents" });
  }
});

// Vendor Scores Routes

// Get vendor scores
router.get("/:vendorId/scores", async (req, res) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const scores = await storage.getVendorScores(vendorId);
    res.json(scores);
  } catch (error) {
    console.error("Get vendor scores error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor scores" });
  }
});

// Generic vendor contacts routes (for compatibility with frontend)
const contactRouter = Router();

// Get all vendor contacts
contactRouter.get("/", async (req, res) => {
  try {
    // Return empty array for now since this is typically not used
    res.json([]);
  } catch (error) {
    console.error("Get all vendor contacts error:", error);
    res.status(500).json({ error: "Failed to retrieve vendor contacts" });
  }
});

// Create vendor contact (generic route)
contactRouter.post("/", async (req, res) => {
  try {
    const data = req.body;
    // Check if contact already exists for this vendor and slot
    if (data.vendorId && data.contactSlot) {
      const existingContacts = await storage.getVendorContacts(data.vendorId);
      const existingContact = existingContacts.find(c => c.contactSlot === data.contactSlot);
      
      if (existingContact) {
        // Update existing contact instead of creating new one
        const updatedContact = await storage.updateVendorContact(existingContact.id, data);
        return res.json(updatedContact);
      }
    }
    
    const contact = await storage.createVendorContact(data);
    res.status(201).json(contact);
  } catch (error) {
    console.error("Create vendor contact error:", error);
    res.status(500).json({ error: "Failed to create vendor contact" });
  }
});

// Vendor Documents Routes (File Upload)
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Configure multer for vendor document uploads
const vendorUploadDir = 'uploads/vendor-documents';
if (!fs.existsSync(vendorUploadDir)) {
  fs.mkdirSync(vendorUploadDir, { recursive: true });
}

const vendorUpload = multer({
  dest: vendorUploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Create vendor document routes
const vendorDocumentRouter = Router();

// POST /api/vendor-documents - Upload vendor document
vendorDocumentRouter.post('/', vendorUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { vendorId, type, notes } = req.body;
    
    const documentData = {
      vendorId: parseInt(vendorId),
      type: type || 'OTHER',
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      description: notes || null,
      isActive: true,
      tags: [],
      isConfidential: false,
    };

    // Save document to database
    const savedDocument = await storage.createVendorDocument(documentData);
    
    res.json({
      ...savedDocument,
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    console.error('Vendor document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/vendor-documents/vendor/:vendorId - Get documents for a vendor
vendorDocumentRouter.get('/vendor/:vendorId', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const documents = await storage.getVendorDocuments(vendorId);
    res.json(documents);
  } catch (error) {
    console.error('Get vendor documents error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor documents' });
  }
});

// GET /api/vendor-documents/:id/download - Download vendor document
vendorDocumentRouter.get('/:id/download', async (req: Request, res: Response) => {
  try {
    // For now, return a success response
    res.json({ message: 'Download functionality will be implemented' });
  } catch (error) {
    console.error('Vendor document download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/vendor-documents/:id - Delete vendor document
vendorDocumentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const documentId = parseInt(req.params.id);
    await storage.deleteVendorDocument(documentId);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Vendor document delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
export { contactRouter, vendorDocumentRouter };