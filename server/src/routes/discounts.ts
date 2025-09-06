import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertPersistentDiscountSchema, insertShortTermSaleSchema } from '@shared/schema';

const router = Router();

// Persistent Discounts routes
router.get('/persistent-discounts', async (req: Request, res: Response) => {
  try {
    const discounts = await storage.getAllPersistentDiscounts();
    res.json(discounts);
  } catch (error) {
    console.error('Error retrieving persistent discounts:', error);
    res.status(500).json({ error: "Failed to retrieve persistent discounts" });
  }
});

router.post('/persistent-discounts', async (req: Request, res: Response) => {
  try {
    const result = insertPersistentDiscountSchema.parse(req.body);
    const discount = await storage.createPersistentDiscount(result);
    res.json(discount);
  } catch (error) {
    console.error('Error creating persistent discount:', error);
    res.status(400).json({ error: "Invalid persistent discount data" });
  }
});

router.put('/persistent-discounts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertPersistentDiscountSchema.partial().parse(req.body);
    const discount = await storage.updatePersistentDiscount(id, result);
    res.json(discount);
  } catch (error) {
    console.error('Error updating persistent discount:', error);
    res.status(400).json({ error: "Invalid persistent discount data" });
  }
});

router.delete('/persistent-discounts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deletePersistentDiscount(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting persistent discount:', error);
    res.status(500).json({ error: "Failed to delete persistent discount" });
  }
});

// Short Term Sales routes
router.get('/short-term-sales', async (req: Request, res: Response) => {
  try {
    const sales = await storage.getAllShortTermSales();
    res.json(sales);
  } catch (error) {
    console.error('Error retrieving short term sales:', error);
    res.status(500).json({ error: "Failed to retrieve short term sales" });
  }
});

router.post('/short-term-sales', async (req: Request, res: Response) => {
  try {
    const result = insertShortTermSaleSchema.parse(req.body);
    const sale = await storage.createShortTermSale(result);
    res.json(sale);
  } catch (error) {
    console.error('Error creating short term sale:', error);
    res.status(400).json({ error: "Invalid short term sale data" });
  }
});

router.put('/short-term-sales/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertShortTermSaleSchema.partial().parse(req.body);
    const sale = await storage.updateShortTermSale(id, result);
    res.json(sale);
  } catch (error) {
    console.error('Error updating short term sale:', error);
    res.status(400).json({ error: "Invalid short term sale data" });
  }
});

router.delete('/short-term-sales/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteShortTermSale(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting short term sale:', error);
    res.status(500).json({ error: "Failed to delete short term sale" });
  }
});

export default router;