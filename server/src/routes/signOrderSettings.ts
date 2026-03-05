import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { authenticateToken, requireRole } from '../../middleware/auth';

const router = Router();

const DEFAULTS = {
  pageTitle: 'Review & Sign Sales Order',
  pageDescription: 'Please review the order details below carefully before signing.',
  signatureDisclaimer: 'By signing below, you confirm that the order details above are correct and authorize AG Composites to begin production.',
  successMessage: 'Order signed successfully! Your order has been moved to the production queue.',
  alreadySignedTitle: 'Order Already Signed',
  alreadySignedMessage: 'Your order is in production.',
  invalidLinkMessage: 'Invalid or missing signature link. Please use the link from your email to sign your order.',
  orderNotFoundMessage: 'The order link is invalid or has expired. Please contact support.',
};

const updateSchema = z.object({
  pageTitle: z.string().min(1).optional(),
  pageDescription: z.string().min(1).optional(),
  signatureDisclaimer: z.string().min(1).optional(),
  successMessage: z.string().min(1).optional(),
  alreadySignedTitle: z.string().min(1).optional(),
  alreadySignedMessage: z.string().min(1).optional(),
  invalidLinkMessage: z.string().min(1).optional(),
  orderNotFoundMessage: z.string().min(1).optional(),
});

router.get('/', async (_req, res) => {
  try {
    const settings = await storage.getSignOrderPageSettings();
    res.json(settings || DEFAULTS);
  } catch (error) {
    console.error('Error fetching sign order page settings:', error);
    res.json(DEFAULTS);
  }
});

router.put('/', authenticateToken, requireRole('ADMIN', 'OWNER'), async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = (req as any).user;
    const updateData: Record<string, any> = {
      ...parsed.data,
      updatedBy: user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : user?.username || 'unknown',
    };

    const updated = await storage.updateSignOrderPageSettings(updateData);
    res.json(updated);
  } catch (error) {
    console.error('Error updating sign order page settings:', error);
    res.status(500).json({ error: 'Failed to update sign order page settings' });
  }
});

export default router;
