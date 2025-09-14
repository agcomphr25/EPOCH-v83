import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { z } from 'zod';

const router = Router();

// P2 PO Product schema
const p2POProductSchema = z.object({
  customerName: z.string().min(1),
  productName: z.string().min(1),
  productType: z.string().optional(),
  partNumber: z.string().min(1),
  specifications: z.string().optional(),
  price: z.number().min(0).default(0),
});

// Get all P2 PO Products
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await storage.getAllP2POProducts();
    res.json(products);
  } catch (error) {
    console.error('Error retrieving P2 PO products:', error);
    res.status(500).json({ error: "Failed to fetch P2 PO products", details: (error as any).message });
  }
});

// Get a specific P2 PO Product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await storage.getP2POProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "P2 PO Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error('Error retrieving P2 PO product:', error);
    res.status(500).json({ error: "Failed to fetch P2 PO product", details: (error as any).message });
  }
});

// Create a new P2 PO Product
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = p2POProductSchema.parse(req.body);
    const product = await storage.createP2POProduct(validatedData);
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating P2 PO product:', error);
    res.status(500).json({ error: "Failed to create P2 PO product", details: (error as any).message });
  }
});

// Update a P2 PO Product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const validatedData = p2POProductSchema.partial().parse(req.body);
    const product = await storage.updateP2POProduct(productId, validatedData);
    res.json(product);
  } catch (error) {
    console.error('Error updating P2 PO product:', error);
    res.status(500).json({ error: "Failed to update P2 PO product", details: (error as any).message });
  }
});

// Delete a P2 PO Product (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    await storage.deleteP2POProduct(productId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting P2 PO product:', error);
    res.status(500).json({ error: "Failed to delete P2 PO product", details: (error as any).message });
  }
});

export default router;