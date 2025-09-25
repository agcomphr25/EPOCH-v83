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

// Get discount details by code (handles both persistent_X and short_term_X formats)
router.get('/discounts/details/:code', async (req: Request, res: Response) => {
  try {
    const discountCode = req.params.code;
    console.log(`🔍 DEBUG: Discount details requested for code: ${discountCode}`);
    let discount = null;
    
    // First check persistent discounts
    const persistentDiscounts = await storage.getAllPersistentDiscounts();
    
    // Handle both "persistent_2" format and direct name lookup
    if (discountCode.startsWith('persistent_')) {
      const discountId = parseInt(discountCode.replace('persistent_', ''));
      discount = persistentDiscounts.find(d => d.id === discountId);
    } else {
      discount = persistentDiscounts.find(d => d.name === discountCode);
    }
    
    // If not found in persistent discounts, check short-term sales
    if (!discount) {
      const shortTermSales = await storage.getAllShortTermSales();
      
      // Handle both "short_term_1" format and direct name lookup
      if (discountCode.startsWith('short_term_')) {
        const discountId = parseInt(discountCode.replace('short_term_', ''));
        discount = shortTermSales.find(d => d.id === discountId && d.isActive);
      } else {
        discount = shortTermSales.find(d => d.name === discountCode && d.isActive);
      }
      
      // Short-term sales have a default appliesTo of 'stock_model'
      if (discount) {
        discount.appliesTo = discount.appliesTo || 'stock_model';
      }
    }
    
    if (discount && discount.isActive) {
      res.json(discount);
    } else {
      res.status(404).json({ error: "Discount not found or inactive" });
    }
  } catch (error) {
    console.error('Error retrieving discount details:', error);
    res.status(500).json({ error: "Failed to retrieve discount details" });
  }
});

export default router;