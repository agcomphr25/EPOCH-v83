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
import {
  createPlanningClassificationDraft,
  getPlanningClassificationHistory,
  releasePlanningClassification,
} from '../services/p2PartPlanningClassificationService';

const router = Router();
const schema = z.object({
  eventType: z.enum(P2_DEMAND_EVENT_TYPES),
  quantityDelta: z.number().finite(),
  unitOfMeasure: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(2000),
  customerEvidenceReference: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const classificationSchema = z.object({
  classification: z.enum([
    'MANUFACTURED',
    'PURCHASED',
    'RAW_MATERIAL',
    'CUSTOMER_SUPPLIED',
  ]),
  partConfigurationRevision: z.string().trim().min(1).max(100),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  ownershipSource: z.string().trim().min(1).max(200),
  sourceRecordType: z.string().trim().min(1).max(100),
  sourceRecordId: z.string().trim().min(1).max(200),
  sourceRevision: z.string().trim().min(1).max(100),
  changeReason: z.string().trim().min(1).max(2000),
});
const releaseSchema = z.object({
  expectedConcurrencyVersion: z.number().int().positive(),
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

router.get(
  '/part-classifications/:inventoryItemId',
  authenticateToken,
  async (req, res) => {
    try {
      await authorize(req, 'projects.p2_demand_planning.view');
      const inventoryItemId = Number(req.params.inventoryItemId);
      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0)
        throw new P2DemandQuantityError(
          'INVALID_ID',
          'A valid part record is required.',
          400
        );
      res.json({
        classifications:
          await getPlanningClassificationHistory(inventoryItemId),
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/part-classifications/:inventoryItemId',
  authenticateToken,
  async (req, res) => {
    try {
      await authorize(req, 'projects.p2_part_classification.manage');
      const inventoryItemId = Number(req.params.inventoryItemId);
      const body = classificationSchema.parse(req.body);
      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0)
        throw new P2DemandQuantityError(
          'INVALID_ID',
          'A valid part record is required.',
          400
        );
      const snapshot = await resolveUserSnapshot(req.user!.id);
      res.status(201).json(
        await createPlanningClassificationDraft({
          ...body,
          inventoryItemId,
          actor: {
            userId: snapshot.userId,
            displayName: snapshot.displayName,
            role: req.user!.role!,
          },
        })
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/part-classifications/:inventoryItemId/:classificationId/release',
  authenticateToken,
  async (req, res) => {
    try {
      await authorize(req, 'projects.p2_part_classification.release');
      const inventoryItemId = Number(req.params.inventoryItemId);
      const body = releaseSchema.parse(req.body);
      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0)
        throw new P2DemandQuantityError(
          'INVALID_ID',
          'A valid part record is required.',
          400
        );
      const snapshot = await resolveUserSnapshot(req.user!.id);
      res.json(
        await releasePlanningClassification(
          inventoryItemId,
          req.params.classificationId,
          body.expectedConcurrencyVersion,
          {
            userId: snapshot.userId,
            displayName: snapshot.displayName,
            role: req.user!.role!,
          }
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);
export default router;
