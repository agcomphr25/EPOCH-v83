import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertPOProductSchema } from '@shared/schema';

const router = Router();

// Get all PO Products
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await storage.getAllPOProducts();
    res.json(products);
  } catch (error) {
    console.error('Error retrieving PO products:', error);
    res.status(500).json({ error: "Failed to fetch PO products", details: (error as any).message });
  }
});

// Get a specific PO Product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await storage.getPOProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "PO Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error('Error retrieving PO product:', error);
    res.status(500).json({ error: "Failed to fetch PO product", details: (error as any).message });
  }
});

// Create a new PO Product
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertPOProductSchema.parse(req.body);
    const product = await storage.createPOProduct(validatedData);
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating PO product:', error);
    res.status(500).json({ error: "Failed to create PO product", details: (error as any).message });
  }
});

// Update a PO Product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const validatedData = insertPOProductSchema.partial().parse(req.body);
    const product = await storage.updatePOProduct(productId, validatedData);
    res.json(product);
  } catch (error) {
    console.error('Error updating PO product:', error);
    res.status(500).json({ error: "Failed to update PO product", details: (error as any).message });
  }
});

// Delete a PO Product (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    await storage.deletePOProduct(productId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting PO product:', error);
    res.status(500).json({ error: "Failed to delete PO product", details: (error as any).message });
  }
});

export default router;