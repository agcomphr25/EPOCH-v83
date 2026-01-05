import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import {
  insertPersistentDiscountSchema,
  insertShortTermSaleSchema,
} from '@shared/schema';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess, authorizeApiRoute } from '../../middleware/routeAuthorization';

const router = Router();

router.use(authenticateToken);

// GET routes - allow access for users with order-entry access (they need to apply discounts)
// Persistent Discounts routes
router.get('/persistent-discounts', authorizeApiRoute(['/order-entry', '/discounts']), async (req: Request, res: Response) => {
  try {
    const discounts = await storage.getAllPersistentDiscounts();
    res.json(discounts);
  } catch (error) {
    console.error('Error retrieving persistent discounts:', error);
    res.status(500).json({ error: 'Failed to retrieve persistent discounts' });
  }
});

// Write operations for persistent discounts - admin only
router.post('/persistent-discounts', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const result = insertPersistentDiscountSchema.parse(req.body);
    const discount = await storage.createPersistentDiscount(result);
    res.json(discount);
  } catch (error) {
    console.error('Error creating persistent discount:', error);
    res.status(400).json({ error: 'Invalid persistent discount data' });
  }
});

router.put('/persistent-discounts/:id', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertPersistentDiscountSchema.partial().parse(req.body);
    const discount = await storage.updatePersistentDiscount(id, result);
    res.json(discount);
  } catch (error) {
    console.error('Error updating persistent discount:', error);
    res.status(400).json({ error: 'Invalid persistent discount data' });
  }
});

router.delete(
  '/persistent-discounts/:id',
  requireAdminAccess,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePersistentDiscount(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting persistent discount:', error);
      res.status(500).json({ error: 'Failed to delete persistent discount' });
    }
  }
);

// Short Term Sales routes - GET allows order-entry users, write operations require admin
router.get('/short-term-sales', authorizeApiRoute(['/order-entry', '/discounts']), async (req: Request, res: Response) => {
  try {
    const sales = await storage.getAllShortTermSales();
    res.json(sales);
  } catch (error) {
    console.error('Error retrieving short term sales:', error);
    res.status(500).json({ error: 'Failed to retrieve short term sales' });
  }
});

router.post('/short-term-sales', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const result = insertShortTermSaleSchema.parse(req.body);
    const sale = await storage.createShortTermSale(result);
    res.json(sale);
  } catch (error) {
    console.error('Error creating short term sale:', error);
    res.status(400).json({ error: 'Invalid short term sale data' });
  }
});

router.put('/short-term-sales/:id', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = insertShortTermSaleSchema.partial().parse(req.body);
    const sale = await storage.updateShortTermSale(id, result);
    res.json(sale);
  } catch (error) {
    console.error('Error updating short term sale:', error);
    res.status(400).json({ error: 'Invalid short term sale data' });
  }
});

router.delete('/short-term-sales/:id', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteShortTermSale(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting short term sale:', error);
    res.status(500).json({ error: 'Failed to delete short term sale' });
  }
});

// ============================================================================
// CSR/Admin Promo Code Override Endpoints
// These endpoints allow CSRs to apply expired seasonal promo codes for
// administrative corrections WITHOUT changing the original expiration date.
// ============================================================================

// Get all promo codes including expired ones (for admin override management)
router.get('/short-term-sales/all', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const sales = await storage.getAllShortTermSalesIncludingExpired();
    res.json(sales);
  } catch (error) {
    console.error('Error retrieving all short term sales:', error);
    res.status(500).json({ error: 'Failed to retrieve all short term sales' });
  }
});

// Get only expired promo codes (for the expired promo codes admin view)
router.get('/short-term-sales/expired', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const expiredSales = await storage.getExpiredShortTermSales();
    res.json(expiredSales);
  } catch (error) {
    console.error('Error retrieving expired short term sales:', error);
    res.status(500).json({ error: 'Failed to retrieve expired short term sales' });
  }
});

// POST /admin/promo-codes/:id/reactivate - CSR-only endpoint to enable override
// Sets override_active = true, requires a reason, records audit entry
router.post('/admin/promo-codes/:id/reactivate', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    // Validate reason is provided
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Reason is required',
        message: 'A reason must be provided for reactivating an expired promo code'
      });
    }

    // Get the current user from the request (authenticated via middleware)
    const userId = req.user?.username || 'unknown';

    // Reactivate the promo code (sets override_active = true and creates audit entry)
    const updatedPromoCode = await storage.reactivatePromoCode(id, userId, reason.trim());

    res.json({
      success: true,
      promoCode: updatedPromoCode,
      message: 'Promo code override activated successfully'
    });
  } catch (error) {
    console.error('Error reactivating promo code:', error);
    if (error instanceof Error && error.message === 'Promo code not found') {
      return res.status(404).json({ error: 'Promo code not found' });
    }
    res.status(500).json({ error: 'Failed to reactivate promo code' });
  }
});

// POST /admin/promo-codes/:id/deactivate - CSR-only endpoint to disable override
// Sets override_active = false, requires a reason, records audit entry
router.post('/admin/promo-codes/:id/deactivate', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    // Validate reason is provided
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Reason is required',
        message: 'A reason must be provided for deactivating promo code override'
      });
    }

    // Get the current user from the request
    const userId = req.user?.username || 'unknown';

    // Deactivate the promo code override
    const updatedPromoCode = await storage.deactivatePromoCodeOverride(id, userId, reason.trim());

    res.json({
      success: true,
      promoCode: updatedPromoCode,
      message: 'Promo code override deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating promo code override:', error);
    if (error instanceof Error && error.message === 'Promo code not found') {
      return res.status(404).json({ error: 'Promo code not found' });
    }
    res.status(500).json({ error: 'Failed to deactivate promo code override' });
  }
});

// GET /admin/promo-codes/:id/audit-history - Get audit history for a promo code
router.get('/admin/promo-codes/:id/audit-history', requireAdminAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const auditHistory = await storage.getPromoCodeOverrideAuditHistory(id);
    res.json(auditHistory);
  } catch (error) {
    console.error('Error retrieving promo code audit history:', error);
    res.status(500).json({ error: 'Failed to retrieve audit history' });
  }
});

export default router;
