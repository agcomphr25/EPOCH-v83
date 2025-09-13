import { Router } from 'express';
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

export default router;