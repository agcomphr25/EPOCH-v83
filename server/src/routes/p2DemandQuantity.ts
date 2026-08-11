import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { getUserPermissions } from '../services/permissionService';
import {
  getP2DemandQuantityHistory,
  recordP2DemandQuantityEvent,
} from '../services/p2CustomerDemandQuantityService';
import {
  P2DemandQuantityError,
  P2_DEMAND_EVENT_TYPES,
} from '../services/p2CustomerDemandQuantityPolicy';

const router = Router();
const schema = z.object({
  eventType: z.enum(P2_DEMAND_EVENT_TYPES),
  quantityDelta: z.number().finite(),
  unitOfMeasure: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(2000),
  customerEvidenceReference: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const ids = (req: Request) => ({
  poId: Number(req.params.poId),
  itemId: Number(req.params.itemId),
});
async function authorize(req: Request, capability: string) {
  if (!req.user?.id || !req.user.role)
    throw new P2DemandQuantityError(
      'ACTOR_REQUIRED',
      'Authentication is required.',
      401
    );
  const permissions = await getUserPermissions(req.user.id, req.user.role);
  if (!permissions.permissionSet.has(capability))
    throw new P2DemandQuantityError(
      'FORBIDDEN',
      'You are not authorized for this customer-demand action.',
      403
    );
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof P2DemandQuantityError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message });
  console.error('[p2-demand-quantity]', error);
  return res.status(500).json({
    error: 'P2_DEMAND_QUANTITY_FAILED',
    message: 'The controlled customer-demand action could not be completed.',
  });
}
router.get(
  '/:poId/items/:itemId/demand-quantity-events',
  authenticateToken,
  async (req, res) => {
    try {
      await authorize(req, 'projects.p2_demand_quantity.view');
      const { poId, itemId } = ids(req);
      res.json(await getP2DemandQuantityHistory(poId, itemId));
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post(
  '/:poId/items/:itemId/demand-quantity-events',
  authenticateToken,
  async (req, res) => {
    try {
      await authorize(req, 'projects.p2_demand_quantity.change');
      const body = schema.parse(req.body);
      const { poId, itemId } = ids(req);
      if (
        ![poId, itemId].every((value) => Number.isInteger(value) && value > 0)
      )
        throw new P2DemandQuantityError(
          'INVALID_ID',
          'A valid purchase order and line are required.',
          400
        );
      const actor = await resolveUserSnapshot(req.user!.id);
      const result = await recordP2DemandQuantityEvent({
        ...body,
        poId,
        itemId,
        actor: {
          userId: actor.userId,
          displayName: actor.displayName,
          role: req.user!.role!,
        },
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      fail(res, error);
    }
  }
);
export default router;
