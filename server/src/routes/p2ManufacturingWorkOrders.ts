import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import {
  areP2ManufacturingWorkOrderExecutionEnabled,
  areP2ManufacturingWorkOrderMaterializationEnabled,
  areP2ManufacturingWorkOrderQueueReadsEnabled,
  areP2MaterialConsumptionWritesEnabled,
  areP2MaterialConsumptionReadsEnabled,
  areP2ManufacturedOutputReadsEnabled,
  areP2ManufacturedOutputWritesEnabled,
  areP2ManufacturedOutputCustodyReadsEnabled,
  areP2ManufacturedOutputCustodyWritesEnabled,
  areP2ManufacturedComponentIssueReadsEnabled,
  areP2ManufacturedComponentIssueWritesEnabled,
  areP2QualityShipmentReleaseReadsEnabled,
  areP2QualityShipmentReleaseWritesEnabled,
  isP2GenealogyViewerEnabled,
  areP2TravelerProvisioningWritesEnabled,
} from '../lib/featureFlags';
import {
  acceptP2WorkOrderOutput,
  completeP2WorkOrderOperation,
  evaluateP2WorkOrderReadiness,
  listP2WorkOrderQueue,
  materializeP2ManufacturingWorkOrders,
  P2WorkOrderError,
  startP2WorkOrder,
} from '../services/p2ManufacturingWorkOrderService';
import { provisionP2Travelers } from '../services/p2TravelerProvisioningService';
import {
  consumeP2ScannedMaterial,
  P2MaterialConsumptionError,
  reverseP2MaterialConsumption,
  resolveP2MaterialScan,
} from '../services/p2MaterialConsumptionService';
import {
  createP2ManufacturedOutput,
  getP2ManufacturedOutputGenealogy,
  P2ManufacturedOutputError,
  releaseP2ManufacturedOutput,
} from '../services/p2ManufacturedOutputGenealogyService';
import {
  getP2ManufacturedOutputCustody,
  P2ManufacturedOutputCustodyError,
  reverseP2ManufacturedOutputCustody,
} from '../services/p2ManufacturedOutputCustodyService';
import {
  getP2ManufacturedComponentGenealogy,
  issueP2ManufacturedComponent,
  P2ManufacturedComponentIssueError,
  reverseP2ManufacturedComponentIssue,
} from '../services/p2ManufacturedComponentIssueService';
import {
  getP2OutputQualityShipmentAuthority,
  P2QualityShipmentReleaseError,
  recordP2OutputQualityDisposition,
  releaseP2OutputForShipment,
} from '../services/p2QualityShipmentReleaseService';
import {
  P2GenealogyViewerError,
  searchP2Genealogy,
} from '../services/p2GenealogyViewerService';

const router = Router();
const materializeBody = z.object({
  expectedBaselineChecksum: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(1).max(200),
  signatureMeaning: z.string().trim().min(1).max(1000),
});
const startBody = z.object({
  expectedConcurrencyVersion: z.number().int().positive(),
});
const acceptanceBody = startBody.extend({
  acceptedQuantity: z.number().nonnegative(),
  signatureMeaning: z.string().trim().min(1).max(1000),
});
const provisionBody = startBody.extend({
  idempotencyKey: z.string().trim().min(1).max(200),
  batchQuantity: z.number().int().positive().optional(),
});
const materialConsumptionBody = z.object({
  travelerBarcode: z.string().trim().min(1).max(255),
  materialBarcode: z.string().trim().min(1).max(255),
  travelerStepId: z.string().trim().min(1).max(255),
  quantity: z.number().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
  operatorSessionToken: z.string().trim().min(1).max(2000),
  materialRequirementId: z.string().uuid(),
});
const materialResolveBody = materialConsumptionBody.pick({
  travelerBarcode: true,
  materialBarcode: true,
  travelerStepId: true,
});
const materialReversalBody = z.object({
  reasonCode: z.string().trim().min(1).max(100),
  reasonText: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const manufacturedOutputBody = z.object({
  outputIdentity: z.string().trim().min(1).max(255),
  outputQuantity: z.number().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const custodyReversalBody = z.object({
  quantity: z.number().positive(),
  reasonCode: z.string().trim().min(1).max(100),
  reasonText: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const manufacturedComponentIssueBody = z.object({
  custodyId: z.string().uuid(),
  materialRequirementId: z.string().uuid(),
  quantity: z.number().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const manufacturedComponentIssueReversalBody = z.object({
  reasonCode: z.string().trim().min(1).max(100),
  reasonText: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const qualityDispositionBody = z.object({
  custodyId: z.string().uuid(),
  disposition: z.enum(['ACCEPTED', 'REJECTED']),
  inspectionReference: z.string().trim().min(1).max(255),
  reasonText: z.string().trim().min(10).max(2000),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const shipmentReleaseBody = z.object({
  custodyId: z.string().uuid(),
  qualityAcceptanceId: z.string().uuid(),
  releaseReference: z.string().trim().min(1).max(255),
  idempotencyKey: z.string().trim().min(1).max(200),
});
const enabled = (value: boolean) => {
  if (!value)
    throw new P2WorkOrderError(
      'FEATURE_DISABLED',
      'P2 manufacturing work-order queues are disabled.',
      404
    );
};
const actor = async (req: Request) => {
  if (!req.user)
    throw new P2WorkOrderError(
      'AUTHENTICATED_USER_REQUIRED',
      'An authenticated user is required.',
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
const fail = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof P2WorkOrderError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  if (error instanceof P2MaterialConsumptionError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  if (error instanceof P2ManufacturedOutputCustodyError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
    });
  if (error instanceof P2ManufacturedComponentIssueError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
    });
  if (error instanceof P2QualityShipmentReleaseError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
    });
  if (error instanceof P2GenealogyViewerError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
    });
  if (error instanceof P2ManufacturedOutputError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message });
  console.error('[p2-manufacturing-work-orders]', error);
  return res.status(500).json({ error: 'P2_WORK_ORDER_FAILED' });
};

router.get(
  '/p2-genealogy/search',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(isP2GenealogyViewerEnabled());
      res.json(await searchP2Genealogy(String(req.query.q ?? '')));
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/queues/:departmentId',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderQueueReadsEnabled());
      res.json({
        departmentId: req.params.departmentId,
        workOrders: await listP2WorkOrderQueue(req.params.departmentId),
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/:authorityId/readiness',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderQueueReadsEnabled());
      res.json(await evaluateP2WorkOrderReadiness(req.params.authorityId));
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/projects/:projectId/frozen-production-demand/:baselineId/materialize-work-orders',
  authenticateToken,
  requirePermission('p2.work_orders.materialize'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderMaterializationEnabled());
      const body = materializeBody.parse(req.body);
      res
        .status(201)
        .json(
          await materializeP2ManufacturingWorkOrders(
            req.params.projectId,
            req.params.baselineId,
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
  '/p2-work-orders/:authorityId/travelers/provision',
  authenticateToken,
  requirePermission('p2.travelers.provision'),
  async (req, res) => {
    try {
      if (!areP2TravelerProvisioningWritesEnabled())
        throw new P2WorkOrderError(
          'FEATURE_DISABLED',
          'P2 traveler provisioning is disabled.',
          404
        );
      const body = provisionBody.parse(req.body);
      res
        .status(201)
        .json(
          await provisionP2Travelers(
            req.params.authorityId,
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
  '/p2-material-consumption/resolve',
  authenticateToken,
  requirePermission('p2.material_consumption.record'),
  async (req, res) => {
    try {
      if (!areP2MaterialConsumptionReadsEnabled())
        throw new P2MaterialConsumptionError(
          'FEATURE_DISABLED',
          'P2 controlled material consumption is disabled.',
          404
        );
      res.json(
        await resolveP2MaterialScan(materialResolveBody.parse(req.body))
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-material-consumption/consume',
  authenticateToken,
  requirePermission('p2.material_consumption.record'),
  async (req, res) => {
    try {
      if (
        !areP2MaterialConsumptionReadsEnabled() ||
        !areP2MaterialConsumptionWritesEnabled()
      )
        throw new P2MaterialConsumptionError(
          'FEATURE_DISABLED',
          'P2 controlled material consumption is disabled.',
          404
        );
      res
        .status(201)
        .json(
          await consumeP2ScannedMaterial(
            materialConsumptionBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-material-consumption/:eventId/reverse',
  authenticateToken,
  requirePermission('p2.material_consumption.reverse'),
  async (req, res) => {
    try {
      if (
        !areP2MaterialConsumptionReadsEnabled() ||
        !areP2MaterialConsumptionWritesEnabled()
      )
        throw new P2MaterialConsumptionError(
          'FEATURE_DISABLED',
          'P2 controlled material consumption is disabled.',
          404
        );
      res
        .status(201)
        .json(
          await reverseP2MaterialConsumption(
            req.params.eventId,
            materialReversalBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/operations/current/complete',
  authenticateToken,
  requirePermission('p2.work_orders.complete_operation'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderExecutionEnabled());
      const body = startBody.parse(req.body);
      res.json(
        await completeP2WorkOrderOperation(
          req.params.authorityId,
          body.expectedConcurrencyVersion,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/accept',
  authenticateToken,
  requirePermission('p2.work_orders.accept'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderExecutionEnabled());
      const body = acceptanceBody.parse(req.body);
      res.json(
        await acceptP2WorkOrderOutput(
          req.params.authorityId,
          body,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/:authorityId/manufactured-outputs',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedOutputReadsEnabled());
      res.json(await getP2ManufacturedOutputGenealogy(req.params.authorityId));
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-outputs',
  authenticateToken,
  requirePermission('p2.manufactured_output.record'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedOutputWritesEnabled());
      res
        .status(201)
        .json(
          await createP2ManufacturedOutput(
            req.params.authorityId,
            manufacturedOutputBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/release',
  authenticateToken,
  requirePermission('p2.manufactured_output.release'),
  requirePermission('p2.manufactured_output.custody_receive'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedOutputWritesEnabled());
      res.json(
        await releaseP2ManufacturedOutput(
          req.params.outputId,
          startBody.parse(req.body).expectedConcurrencyVersion,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/custody',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedOutputCustodyReadsEnabled());
      res.json({
        custody: await getP2ManufacturedOutputCustody(
          req.params.authorityId,
          req.params.outputId
        ),
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/custody/:custodyId/reverse',
  authenticateToken,
  requirePermission('p2.manufactured_output.custody_reverse'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedOutputCustodyWritesEnabled());
      res.json(
        await reverseP2ManufacturedOutputCustody(
          req.params.authorityId,
          req.params.outputId,
          req.params.custodyId,
          custodyReversalBody.parse(req.body),
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/quality-disposition',
  authenticateToken,
  requirePermission('p2.manufactured_output.quality_accept'),
  async (req, res) => {
    try {
      enabled(areP2QualityShipmentReleaseWritesEnabled());
      res
        .status(201)
        .json(
          await recordP2OutputQualityDisposition(
            req.params.authorityId,
            req.params.outputId,
            qualityDispositionBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/shipment-release',
  authenticateToken,
  requirePermission('p2.manufactured_output.shipment_release'),
  async (req, res) => {
    try {
      enabled(areP2QualityShipmentReleaseWritesEnabled());
      res
        .status(201)
        .json(
          await releaseP2OutputForShipment(
            req.params.authorityId,
            req.params.outputId,
            shipmentReleaseBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/:authorityId/manufactured-outputs/:outputId/quality-shipment-authority',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2QualityShipmentReleaseReadsEnabled());
      res.json(
        await getP2OutputQualityShipmentAuthority(
          req.params.authorityId,
          req.params.outputId
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-components/issues',
  authenticateToken,
  requirePermission('p2.manufactured_component.issue'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedComponentIssueWritesEnabled());
      res
        .status(201)
        .json(
          await issueP2ManufacturedComponent(
            req.params.authorityId,
            manufacturedComponentIssueBody.parse(req.body),
            await actor(req)
          )
        );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/manufactured-components/issues/:issueId/reverse',
  authenticateToken,
  requirePermission('p2.manufactured_component.issue_reverse'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedComponentIssueWritesEnabled());
      res.json(
        await reverseP2ManufacturedComponentIssue(
          req.params.authorityId,
          req.params.issueId,
          manufacturedComponentIssueReversalBody.parse(req.body),
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/p2-work-orders/:authorityId/manufactured-components/genealogy',
  authenticateToken,
  requirePermission('p2.work_orders.view'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturedComponentIssueReadsEnabled());
      res.json({
        edges: await getP2ManufacturedComponentGenealogy(
          req.params.authorityId
        ),
      });
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/p2-work-orders/:authorityId/start',
  authenticateToken,
  requirePermission('p2.work_orders.execute'),
  async (req, res) => {
    try {
      enabled(areP2ManufacturingWorkOrderExecutionEnabled());
      const body = startBody.parse(req.body);
      res.json(
        await startP2WorkOrder(
          req.params.authorityId,
          body.expectedConcurrencyVersion,
          await actor(req)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
