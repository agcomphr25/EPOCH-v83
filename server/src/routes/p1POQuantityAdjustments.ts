import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import {
  createP1QuantityAdjustment,
  getP1POReconciliation,
  getP1QuantityAdjustmentHistory,
  P1QuantityAdjustmentConflict,
} from '../services/p1POReconciliationService';

const router = Router();

const adjustmentSchema = z.object({
  adjustmentType: z.enum(['CANCEL_QUANTITY', 'RESTORE_QUANTITY']),
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
  reference: z.string().trim().max(255).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(255).optional().nullable(),
});

router.get(
  '/:poId/reconciliation',
  authenticateToken,
  async (req: Request, res: Response) => {
    const poId = Number(req.params.poId);
    if (!Number.isInteger(poId) || poId <= 0) {
      return res.status(400).json({ error: 'Invalid P1 purchase-order ID' });
    }
    try {
      return res.json(await getP1POReconciliation(poId));
    } catch (error) {
      console.error('[p1-po-reconciliation]', error);
      return res
        .status(500)
        .json({ error: 'Failed to load P1 PO reconciliation' });
    }
  }
);

router.get(
  '/:poId/items/:itemId/quantity-adjustments',
  authenticateToken,
  async (req: Request, res: Response) => {
    const itemId = Number(req.params.itemId);
    const poId = Number(req.params.poId);
    if (
      !Number.isInteger(poId) ||
      poId <= 0 ||
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid P1 purchase-order or line ID' });
    }
    try {
      return res.json(await getP1QuantityAdjustmentHistory(itemId, poId));
    } catch (error) {
      console.error('[p1-po-quantity-adjustment-history]', error);
      return res
        .status(500)
        .json({ error: 'Failed to load quantity-adjustment history' });
    }
  }
);

router.post(
  '/:poId/items/:itemId/quantity-adjustments',
  authenticateToken,
  requirePermission('purchasing.manage_pos'),
  async (req: Request, res: Response) => {
    const itemId = Number(req.params.itemId);
    const poId = Number(req.params.poId);
    if (
      !Number.isInteger(poId) ||
      poId <= 0 ||
      !Number.isInteger(itemId) ||
      itemId <= 0
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid P1 purchase-order or line ID' });
    }
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid quantity adjustment',
        details: parsed.error.flatten(),
      });
    }

    try {
      const actor = await resolveUserSnapshot(req.user!.id);
      const result = await createP1QuantityAdjustment({
        purchaseOrderId: poId,
        purchaseOrderItemId: itemId,
        ...parsed.data,
        createdByUserId: actor.userId,
        createdByDisplayName: actor.displayName,
      });
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof P1QuantityAdjustmentConflict) {
        return res.status(409).json({
          error: error.message,
          reconciliation: error.reconciliation,
        });
      }
      if (
        error instanceof Error &&
        error.message === 'P1 purchase-order line not found'
      ) {
        return res.status(404).json({ error: error.message });
      }
      console.error('[p1-po-quantity-adjustment-create]', error);
      return res
        .status(500)
        .json({ error: 'Failed to create quantity adjustment' });
    }
  }
);

export default router;
