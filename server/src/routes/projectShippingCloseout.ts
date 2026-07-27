import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import type { ProductionActor } from '../services/projectProductionExecutionService';
import {
  authorizeShipment,
  closeProject,
  confirmShipment,
  decideCloseoutReview,
  getShippingCloseoutDashboard,
  placeShippingHold,
  ProjectShippingCloseoutError,
  recordDelivery,
  releaseShippingHold,
  reopenProject,
  saveCloseoutReview,
  saveShippingReview,
  submitCloseoutReview,
  voidShipmentAuthorization,
} from '../services/projectShippingCloseoutService';

const router = Router({ mergeParams: true });
const expected = z.object({ expectedLockVersion: z.number().int().positive() });
const documentManifest = z.array(
  z.object({
    documentId: z.string().min(1),
    documentNumber: z.string().min(1),
    revision: z.string().min(1),
    status: z.string().min(1),
    checksum: z.string().optional(),
    inclusionReason: z.string().min(1),
    required: z.boolean().optional(),
  })
);
const shippingReview = z.object({
  expectedLockVersion: z.number().int().positive().optional(),
  allocationIds: z.array(z.string().uuid()).min(1),
  packaging: z.object({
    packagingMethod: z.string(),
    preservationMethod: z.string(),
    packageCount: z.number().int(),
    packageIdentifiers: z.array(z.string()).default([]),
    weightLbs: z.number(),
    dimensions: z.object({
      length: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    cushioningProtection: z.string().optional(),
    moistureFodControls: z.string().optional(),
    shelfLifeMarking: z.string().optional(),
    handlingLabels: z.array(z.string()).optional(),
    customerBagTagRequirements: z.string().optional(),
    photographs: z
      .array(z.object({ attachmentId: z.string(), name: z.string() }))
      .optional(),
  }),
  shipTo: z.record(z.unknown()),
  carrier: z.object({
    carrier: z.string(),
    serviceLevel: z.string(),
    manualTrackingAllowed: z.boolean().optional(),
    partialShipmentAllowed: z.boolean().optional(),
    deliveryRequired: z.boolean().optional(),
  }),
  documentManifest,
});
const authorize = expected.extend({
  idempotencyKey: z.string().min(8).max(200),
  signatureMeaning: z.string().min(1),
});
const confirm = z.object({
  idempotencyKey: z.string().min(8).max(200),
  trackingNumber: z.string().min(1),
  manualTracking: z.boolean(),
  shipDate: z.string().datetime().optional(),
});
const delivery = z.object({
  status: z.enum(['DELIVERED', 'DELIVERY_EXCEPTION', 'RETURNED']),
  deliveredAt: z.string().datetime().optional(),
  evidenceSource: z.enum(['CARRIER', 'MANUAL_POD', 'CUSTOMER_CONFIRMATION']),
  proofOfDeliveryReference: z.string().optional(),
  exception: z.string().optional(),
});
const hold = z.object({
  scope: z.string().min(1),
  reason: z.string().min(1),
  reviewId: z.string().uuid().optional(),
  authorizationId: z.string().uuid().optional(),
  releaseId: z.string().uuid().optional(),
});
const closeoutReview = z.object({
  expectedLockVersion: z.number().int().positive().optional(),
  deliveryRequired: z.boolean(),
  financeTransferredOrComplete: z.boolean(),
  financeDisposition: z.string().optional(),
  productionReconciled: z.boolean(),
  qualityReconciled: z.boolean(),
  supplierAndPropertyReconciled: z.boolean(),
  openActions: z.array(
    z.object({
      action: z.string().min(1),
      owner: z.string().min(1),
      status: z.string().min(1),
    })
  ),
  documentArchiveManifest: documentManifest,
});
const decision = expected.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});
const close = expected.extend({
  idempotencyKey: z.string().min(8).max(200),
  signatureMeaning: z.string().min(1),
});

function actor(req: Request): ProductionActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectShippingCloseoutError(
      'ACTOR_REQUIRED',
      'Authenticated actor identity is required.',
      401
    );
  return {
    userId: req.user.id,
    employeeId: req.user.employeeId ?? null,
    username: req.user.username,
    displayName: req.user.username,
    role: req.user.role,
  };
}

async function authorized(req: Request, capability: string) {
  const value = actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(capability))
    throw new ProjectShippingCloseoutError(
      'FORBIDDEN',
      `The ${capability} capability is required.`,
      403
    );
  return value;
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof ProjectShippingCloseoutError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Shipping & Project Closing error:', error);
  return res.status(500).json({
    error: 'SHIPPING_CLOSEOUT_ACTION_FAILED',
    message: 'The Shipping or Project Closing action failed.',
  });
}
const id = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getShippingCloseoutDashboard(id(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/shipping/readiness', async (req, res) => {
  try {
    const model = await getShippingCloseoutDashboard(id(req));
    res.json({
      review: model.review,
      eligibleAllocations: model.eligibleAllocations,
      holds: model.shippingHolds,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.get('/history', async (req, res) => {
  try {
    const model = await getShippingCloseoutDashboard(id(req));
    res.json({
      shippingReviews: model.reviews,
      shipments: model.authorizations,
      allocationLinks: model.links,
      closeouts: model.closeouts,
      approvals: model.approvals,
      closeoutEvents: model.closeoutEvents,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/shipping/reviews', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await saveShippingReview(
          id(req),
          shippingReview.parse(req.body),
          await authorized(req, 'projects.shipping_v2.manage')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.patch('/shipping/reviews/current', async (req, res) => {
  try {
    res.json(
      await saveShippingReview(
        id(req),
        shippingReview.parse(req.body),
        await authorized(req, 'projects.shipping_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/shipping/authorize', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await authorizeShipment(
          id(req),
          authorize.parse(req.body),
          await authorized(req, 'projects.shipping_v2.authorize')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post(
  '/shipping/authorizations/:authorizationId/confirm',
  async (req, res) => {
    try {
      res.json(
        await confirmShipment(
          id(req),
          String(req.params.authorizationId),
          confirm.parse(req.body),
          await authorized(req, 'projects.shipping_v2.confirm')
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post(
  '/shipping/authorizations/:authorizationId/delivery',
  async (req, res) => {
    try {
      res.json(
        await recordDelivery(
          id(req),
          String(req.params.authorizationId),
          delivery.parse(req.body),
          await authorized(req, 'projects.shipping_v2.delivery')
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post('/shipping/holds', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await placeShippingHold(
          id(req),
          hold.parse(req.body),
          await authorized(req, 'projects.shipping_v2.hold')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/shipping/holds/:holdId/release', async (req, res) => {
  try {
    const body = z
      .object({ releaseAuthorization: z.string().min(1) })
      .parse(req.body);
    res.json(
      await releaseShippingHold(
        id(req),
        String(req.params.holdId),
        body.releaseAuthorization,
        await authorized(req, 'projects.shipping_v2.hold')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post(
  '/shipping/authorizations/:authorizationId/void',
  async (req, res) => {
    try {
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      res.json(
        await voidShipmentAuthorization(
          id(req),
          String(req.params.authorizationId),
          body.reason,
          await authorized(req, 'projects.shipping_v2.authorize')
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post('/closeout/reviews', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await saveCloseoutReview(
          id(req),
          closeoutReview.parse(req.body),
          await authorized(req, 'projects.closeout_v2.manage')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/closeout/recalculate', async (req, res) => {
  try {
    res.json(
      await saveCloseoutReview(
        id(req),
        closeoutReview.parse(req.body),
        await authorized(req, 'projects.closeout_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/closeout/submit', async (req, res) => {
  try {
    const body = expected.parse(req.body);
    res.json(
      await submitCloseoutReview(
        id(req),
        body.expectedLockVersion,
        await authorized(req, 'projects.closeout_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
for (const [path, type, capability] of [
  [
    'project-management',
    'PROJECT_MANAGEMENT',
    'projects.closeout_v2.pm_decide',
  ],
  ['quality', 'QUALITY', 'projects.closeout_v2.quality_decide'],
  ['operations', 'OPERATIONS', 'projects.closeout_v2.operations_decide'],
  ['shipping', 'SHIPPING_LOGISTICS', 'projects.closeout_v2.shipping_decide'],
  ['finance', 'FINANCE', 'projects.closeout_v2.finance_decide'],
  ['supply-chain', 'SUPPLY_CHAIN', 'projects.closeout_v2.supply_chain_decide'],
] as const) {
  router.post(`/closeout/decisions/${path}`, async (req, res) => {
    try {
      const body = decision.parse(req.body);
      res.json(
        await decideCloseoutReview(
          id(req),
          body.expectedLockVersion,
          type,
          body.decision,
          body.signatureMeaning,
          body.reason,
          await authorized(req, capability)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  });
}
router.post('/closeout/close', async (req, res) => {
  try {
    res.json(
      await closeProject(
        id(req),
        close.parse(req.body),
        await authorized(req, 'projects.closeout_v2.close')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/closeout/reopen', async (req, res) => {
  try {
    const body = z
      .object({
        reason: z.string().min(1),
        responsibleOwner: z.string().min(1),
      })
      .parse(req.body);
    res.json(
      await reopenProject(
        id(req),
        body,
        await authorized(req, 'projects.closeout_v2.reopen')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
