import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import {
  areStockBuildRequestReadsEnabled,
  areStockBuildRequestWritesEnabled,
  areStockBuildReleaseReadinessWritesEnabled,
} from '../lib/featureFlags';
import {
  createStockBuildDraft,
  authorizeStockBuildReleaseReadiness,
  getStockBuildRequest,
  listActiveManufacturedStockBuildParts,
  previewStockBuildReleaseReadiness,
  StockBuildRequestError,
} from '../services/stockBuildReadinessService';

const router = Router();
const draftBody = z.object({
  inventoryItemId: z.number().int().positive(),
  requestedQuantity: z.number().int().positive(),
  priority: z.number().int().min(1).max(100).default(50),
  dueDate: z.string().date().optional(),
  targetStockLocation: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const releaseBody = z.object({
  expectedConcurrencyVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
  signatureMeaning: z.literal(
    'I authorize this controlled stock-build request as ready for work-order release.'
  ),
});

const fail = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof StockBuildRequestError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message });
  console.error('[stock-build-request]', error);
  return res.status(500).json({ error: 'STOCK_BUILD_REQUEST_FAILED' });
};

const actor = async (req: Request) => {
  if (!req.user)
    throw new StockBuildRequestError(
      'AUTHENTICATED_USER_REQUIRED',
      'Authentication is required.',
      401
    );
  const snapshot = await resolveUserSnapshot(req.user.id);
  return {
    userId: snapshot.userId,
    employeeId: req.user.employeeId ?? null,
    displayName: snapshot.displayName,
    role: String(req.user.role),
  };
};

router.get(
  '/parts',
  authenticateToken,
  requirePermission('manufacturing.stock_build.view'),
  async (_req, res) => {
    try {
      res.json({ parts: await listActiveManufacturedStockBuildParts() });
    } catch (error) {
      console.error('[stock-build-readiness]', error);
      res.status(500).json({ error: 'STOCK_BUILD_READINESS_FAILED' });
    }
  }
);

router.post(
  '/drafts',
  authenticateToken,
  requirePermission('manufacturing.stock_build.create'),
  async (req, res) => {
    try {
      if (!areStockBuildRequestWritesEnabled())
        throw new StockBuildRequestError(
          'FEATURE_DISABLED',
          'Stock-build draft creation is disabled.',
          404
        );
      const result = await createStockBuildDraft(
        draftBody.parse(req.body),
        await actor(req)
      );
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/requests/:id',
  authenticateToken,
  requirePermission('manufacturing.stock_build.view'),
  async (req, res) => {
    try {
      if (!areStockBuildRequestReadsEnabled())
        throw new StockBuildRequestError(
          'FEATURE_DISABLED',
          'Stock-build request reads are disabled.',
          404
        );
      res.json({ request: await getStockBuildRequest(req.params.id) });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/requests/:id/release-readiness',
  authenticateToken,
  requirePermission('manufacturing.stock_build.release'),
  async (req, res) => {
    try {
      if (!areStockBuildRequestReadsEnabled())
        throw new StockBuildRequestError(
          'FEATURE_DISABLED',
          'Stock-build request reads are disabled.',
          404
        );
      res.json(await previewStockBuildReleaseReadiness(req.params.id));
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/requests/:id/release-readiness/authorize',
  authenticateToken,
  requirePermission('manufacturing.stock_build.release'),
  async (req, res) => {
    try {
      if (!areStockBuildReleaseReadinessWritesEnabled())
        throw new StockBuildRequestError(
          'FEATURE_DISABLED',
          'Stock-build release-readiness authorization is disabled.',
          404
        );
      const body = releaseBody.parse(req.body);
      const result = await authorizeStockBuildReleaseReadiness(
        { requestId: req.params.id, ...body },
        await actor(req)
      );
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
