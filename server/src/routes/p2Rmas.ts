import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';
import { storage } from '../../storage';

const router = Router();

const createRmaSchema = z.object({
  packingSlipId: z.string().uuid('packingSlipId must be a valid UUID'),
  invoiceId: z.string().uuid('invoiceId must be a valid UUID').optional().nullable(),
  reason: z.string().min(1, 'reason is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['RECEIVED', 'CLOSED'], {
    errorMap: () => ({ message: 'status must be RECEIVED or CLOSED' }),
  }),
});

// POST /api/p2/rmas
router.post('/rmas', authenticateToken, async (req: Request, res: Response) => {
  try {
    const input = createRmaSchema.parse(req.body);
    const createdBy = req.user?.username ?? req.user?.email ?? 'unknown';
    const rma = await storage.createShippingRma({
      packingSlipId: input.packingSlipId,
      invoiceId: input.invoiceId ?? undefined,
      reason: input.reason,
      createdBy,
    });
    return res.status(201).json(rma);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message, details: err.errors });
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'Invalid packingSlipId or invoiceId — referenced record does not exist' });
    }
    console.error('Create RMA error:', err);
    return res.status(500).json({ error: 'Failed to create RMA' });
  }
});

// GET /api/p2/rmas
router.get('/rmas', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const rmas = await storage.listShippingRmas();
    return res.json(rmas);
  } catch (err: any) {
    console.error('List RMAs error:', err);
    return res.status(500).json({ error: 'Failed to fetch RMAs' });
  }
});

// GET /api/p2/rmas/:id
router.get('/rmas/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const rma = await storage.getShippingRmaById(req.params.id);
    if (!rma) return res.status(404).json({ error: 'RMA not found' });
    return res.json(rma);
  } catch (err: any) {
    console.error('Get RMA error:', err);
    return res.status(500).json({ error: 'Failed to fetch RMA' });
  }
});

// PATCH /api/p2/rmas/:id/status
router.patch('/rmas/:id/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const input = updateStatusSchema.parse(req.body);
    const rma = await storage.updateShippingRmaStatus(req.params.id, input.status);
    return res.json(rma);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message, details: err.errors });
    if (err?.message?.includes('not found'))
      return res.status(404).json({ error: err.message });
    if (err?.message?.includes('Invalid status transition'))
      return res.status(422).json({ error: err.message });
    console.error('Update RMA status error:', err);
    return res.status(500).json({ error: 'Failed to update RMA status' });
  }
});

export default router;
