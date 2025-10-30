import { Router } from 'express';

const router = Router();

// GET /api/po-orders/shipping-qc
// Returns PO orders in Shipping QC department, grouped by customer → PO → items
router.get('/shipping-qc', async (req, res) => {
  try {
    console.log('📦 Fetching PO orders in Shipping QC...');
    const { storage } = await import('../../storage');

    const customers = await storage.getPOOrdersInShippingQC();
    
    const totalItems = customers.reduce(
      (total, customer) =>
        total +
        customer.pos.reduce((sum, po) => sum + po.items.length, 0),
      0
    );
    
    console.log(`📊 Found ${totalItems} PO items in Shipping QC across ${customers.length} customers`);

    res.json(customers);
  } catch (error: any) {
    console.error('❌ Error fetching PO orders in Shipping QC:', error);
    res
      .status(500)
      .json({ _error: 'Failed to fetch PO orders', details: error.message });
  }
});

export default router;
