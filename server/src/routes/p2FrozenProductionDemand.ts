import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { getUserPermissions } from '../services/permissionService';
import {
  areP2FrozenProductionDemandReadsEnabled,
  areP2FrozenProductionDemandWritesEnabled,
  areP2FrozenProductionDemandReleasesEnabled,
} from '../lib/featureFlags';
import {
  cancelFrozenProductionDemand,
  createFrozenProductionDemandDraft,
  FrozenDemandError,
  frozenProductionDemandDetail,
  listFrozenProductionDemand,
  previewFrozenProductionDemand,
  releaseFrozenProductionDemand,
  validateFrozenProductionDemand,
} from '../services/p2FrozenProductionDemandService';

const router = Router({ mergeParams: true });
const version = z.object({
  expectedConcurrencyVersion: z.number().int().positive(),
});
const actor = async (req: Request) => {
  if (!req.user)
    throw new FrozenDemandError(
      'AUTHENTICATED_USER_REQUIRED',
      'An authenticated user is required.',
      401
    );
  const user = req.user;
  const s = await resolveUserSnapshot(user.id);
  return {
    userId: s.userId,
    employeeId: user.employeeId ?? null,
    displayName: s.displayName,
    role: String(user.role),
  };
};
const enabled = (on: boolean) => {
  if (!on)
    throw new FrozenDemandError(
      'FEATURE_DISABLED',
      'Frozen Production Demand is disabled.',
      404
    );
};
const fail = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof FrozenDemandError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  console.error('[p2-frozen-production-demand]', error);
  return res.status(500).json({ error: 'FROZEN_DEMAND_FAILED' });
};
router.get(
  '/projects/:projectId/frozen-production-demand',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.view'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandReadsEnabled());
      if (!req.user)
        throw new FrozenDemandError(
          'AUTHENTICATED_USER_REQUIRED',
          'An authenticated user is required.',
          401
        );
      const permissions = await getUserPermissions(
        req.user.id,
        String(req.user.role)
      );
      res.json({
        ...(await listFrozenProductionDemand(req.params.projectId)),
        authority: {
          canManage: permissions.permissionSet.has(
            'projects.frozen_production_demand.manage'
          ),
          canRelease: permissions.permissionSet.has(
            'projects.frozen_production_demand.release'
          ),
        },
      });
    } catch (e) {
      fail(res, e);
    }
  }
);
router.get(
  '/projects/:projectId/frozen-production-demand/preview',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.view'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandReadsEnabled());
      res.json(await previewFrozenProductionDemand(req.params.projectId));
    } catch (e) {
      fail(res, e);
    }
  }
);
router.get(
  '/projects/:projectId/frozen-production-demand/:id',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.view'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandReadsEnabled());
      res.json(
        await frozenProductionDemandDetail(req.params.projectId, req.params.id)
      );
    } catch (e) {
      fail(res, e);
    }
  }
);
router.post(
  '/projects/:projectId/frozen-production-demand',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.manage'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandWritesEnabled());
      const body = z
        .object({
          supersessionReason: z.string().trim().min(1).max(2000).optional(),
        })
        .parse(req.body);
      res
        .status(201)
        .json(
          await createFrozenProductionDemandDraft(
            req.params.projectId,
            await actor(req),
            body.supersessionReason
          )
        );
    } catch (e) {
      fail(res, e);
    }
  }
);
router.post(
  '/projects/:projectId/frozen-production-demand/:id/validate',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.manage'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandWritesEnabled());
      const body = version.parse(req.body);
      res.json(
        await validateFrozenProductionDemand(
          req.params.projectId,
          req.params.id,
          body.expectedConcurrencyVersion,
          await actor(req)
        )
      );
    } catch (e) {
      fail(res, e);
    }
  }
);
router.post(
  '/projects/:projectId/frozen-production-demand/:id/release',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.release'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandReleasesEnabled());
      const body = version
        .extend({ signatureMeaning: z.string().trim().min(1).max(1000) })
        .parse(req.body);
      res.json(
        await releaseFrozenProductionDemand(
          req.params.projectId,
          req.params.id,
          body.expectedConcurrencyVersion,
          body.signatureMeaning,
          await actor(req)
        )
      );
    } catch (e) {
      fail(res, e);
    }
  }
);
router.post(
  '/projects/:projectId/frozen-production-demand/:id/cancel',
  authenticateToken,
  requirePermission('projects.frozen_production_demand.manage'),
  async (req, res) => {
    try {
      enabled(areP2FrozenProductionDemandWritesEnabled());
      const body = version
        .extend({ reason: z.string().trim().min(1).max(2000) })
        .parse(req.body);
      res.json(
        await cancelFrozenProductionDemand(
          req.params.projectId,
          req.params.id,
          body.expectedConcurrencyVersion,
          body.reason,
          await actor(req)
        )
      );
    } catch (e) {
      fail(res, e);
    }
  }
);
export default router;
