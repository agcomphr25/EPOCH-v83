import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import {
  areCombinedManufacturingProcessReadsEnabled,
  areCombinedManufacturingProcessMaterializationWritesEnabled,
  areCombinedManufacturingProcessPlanningWritesEnabled,
  areCombinedManufacturingProcessWritesEnabled,
} from '../lib/featureFlags';
import {
  approveCombinedManufacturingProcess,
  CombinedProcessError,
  createCombinedManufacturingProcess,
  listCombinedManufacturingProcesses,
  listCombinedProcessSelections,
  materializeCombinedProcessSelection,
  recommendCombinedManufacturingProcesses,
  selectCombinedProcessRecommendation,
  withdrawCombinedProcessSelection,
} from '../services/combinedManufacturingProcessService';

const router = Router();
const outputSchema = z.object({
  inventoryItemId: z.number().int().positive(),
  quantityPerRun: z.number().positive(),
  isPrimary: z.boolean().default(false),
});
const processSchema = z
  .object({
    processCode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).optional().nullable(),
    leadDepartmentId: z.number().int().positive(),
    minimumRuns: z.number().int().positive().default(1),
    maximumRuns: z.number().int().positive().optional().nullable(),
    setupMinutes: z.number().int().nonnegative().default(0),
    cycleMinutesPerRun: z.number().int().nonnegative().default(0),
    allowExcessOutput: z.boolean().default(false),
    outputs: z.array(outputSchema).min(2),
  })
  .refine(
    (value) =>
      value.maximumRuns == null || value.maximumRuns >= value.minimumRuns,
    {
      message: 'maximumRuns must be greater than or equal to minimumRuns',
      path: ['maximumRuns'],
    }
  );
const selectionSchema = z.object({
  processId: z.string().uuid(),
  expectedBaselineChecksum: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(1000),
});
const withdrawalSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
const materializationSchema = z.object({
  expectedBaselineChecksum: z.string().trim().min(1),
  requestKey: z.string().trim().min(1).max(255),
});

const enabled = (value: boolean) => {
  if (!value)
    throw new CombinedProcessError(
      'FEATURE_DISABLED',
      'Combined manufacturing process administration is disabled.',
      404
    );
};
const actor = async (req: Request) => {
  if (!req.user)
    throw new CombinedProcessError(
      'AUTHENTICATED_USER_REQUIRED',
      'Authentication is required.',
      401
    );
  const snapshot = await resolveUserSnapshot(req.user.id);
  return { userId: snapshot.userId, displayName: snapshot.displayName };
};
const fail = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof CombinedProcessError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  console.error('[combined-manufacturing-processes]', error);
  return res
    .status(500)
    .json({ error: 'COMBINED_MANUFACTURING_PROCESS_FAILED' });
};

router.get(
  '/manufacturing/combined-processes',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.view'),
  async (_req, res) => {
    try {
      enabled(areCombinedManufacturingProcessReadsEnabled());
      res.json({ processes: await listCombinedManufacturingProcesses() });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/projects/:projectId/frozen-production-demand/:baselineId/combined-process-selections',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.view'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessReadsEnabled());
      res.json({
        selections: await listCombinedProcessSelections(
          req.params.projectId,
          req.params.baselineId
        ),
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/projects/:projectId/frozen-production-demand/:baselineId/combined-process-selections',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.plan'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessPlanningWritesEnabled());
      const body = selectionSchema.parse(req.body);
      res
        .status(201)
        .json(
          await selectCombinedProcessRecommendation(
            req.params.projectId,
            req.params.baselineId,
            body.processId,
            body,
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/projects/:projectId/frozen-production-demand/:baselineId/combined-process-selections/:selectionId/withdraw',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.plan'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessPlanningWritesEnabled());
      const body = withdrawalSchema.parse(req.body);
      res.json(
        await withdrawCombinedProcessSelection(
          req.params.projectId,
          req.params.baselineId,
          req.params.selectionId,
          body.reason,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/projects/:projectId/frozen-production-demand/:baselineId/combined-process-selections/:selectionId/materialize',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.materialize'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessMaterializationWritesEnabled());
      const body = materializationSchema.parse(req.body);
      res
        .status(201)
        .json(
          await materializeCombinedProcessSelection(
            req.params.projectId,
            req.params.baselineId,
            req.params.selectionId,
            body,
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/manufacturing/combined-processes',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.manage'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessWritesEnabled());
      res
        .status(201)
        .json(
          await createCombinedManufacturingProcess(
            processSchema.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/manufacturing/combined-processes/:processId/approve',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.approve'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessWritesEnabled());
      res.json(
        await approveCombinedManufacturingProcess(
          req.params.processId,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/projects/:projectId/frozen-production-demand/:baselineId/combined-process-recommendations',
  authenticateToken,
  requirePermission('manufacturing.combined_processes.view'),
  async (req, res) => {
    try {
      enabled(areCombinedManufacturingProcessReadsEnabled());
      res.json({
        recommendations: await recommendCombinedManufacturingProcesses(
          req.params.projectId,
          req.params.baselineId
        ),
        materializesWorkOrders: false,
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
