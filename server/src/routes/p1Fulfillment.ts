import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/requirePermission';
import {
  cancelP1FulfillmentException,
  completeP1FulfillmentAttempt,
  failP1FulfillmentAttempt,
  listOpenP1FulfillmentExceptions,
  listP1FulfillmentControlGaps,
  recordP1FulfillmentStep,
  startP1FulfillmentAttempt,
} from '../services/p1FulfillmentAttemptService';

const router = Router();

const createAttemptSchema = z.object({
  orderId: z.string().min(1),
  source: z.string().min(1).default('shipping'),
  sourceRoute: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const stepSchema = z.object({
  step: z.enum([
    'READINESS',
    'UPS_LABEL',
    'SHIPMENT_RECORD',
    'FULFILLMENT_UPDATE',
    'ACCOUNTING_HANDOFF',
    'CUSTOMER_NOTIFICATION',
  ]),
  metadata: z.record(z.unknown()).optional(),
  trackingNumber: z.string().optional().nullable(),
  shipmentRecordId: z.string().uuid().optional().nullable(),
  journalEntryId: z.number().int().optional().nullable(),
  notificationStatus: z.string().optional().nullable(),
});

const failSchema = z.object({
  failedStep: stepSchema.shape.step,
  failureCode: z.string().min(1),
  failureMessage: z.string().min(1),
  remediationHint: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const completeSchema = z.object({
  metadata: z.record(z.unknown()).optional(),
  trackingNumber: z.string().optional().nullable(),
  shipmentRecordId: z.string().uuid().optional().nullable(),
  journalEntryId: z.number().int().optional().nullable(),
  notificationStatus: z.string().optional().nullable(),
});

const cancelSchema = z.object({
  reason: z.string().min(1),
});

function actorFromRequest(req: Request) {
  return {
    id: (req as any).user?.id ?? null,
    username: (req as any).user?.username ?? (req as any).user?.role ?? null,
  };
}

router.get('/exceptions', requirePermission('shipping.view'), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 250);
    const rows = await listOpenP1FulfillmentExceptions(limit);
    res.json({ rows, count: rows.length });
  } catch (error) {
    console.error('[P1Fulfillment] Failed to list exceptions:', error);
    res.status(500).json({ error: 'Failed to list P1 fulfillment exceptions' });
  }
});

router.get('/control-gaps', requirePermission('shipping.view'), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 250);
    const rows = await listP1FulfillmentControlGaps(limit);
    res.json({ rows, count: rows.length });
  } catch (error) {
    console.error('[P1Fulfillment] Failed to list control gaps:', error);
    res.status(500).json({ error: 'Failed to list P1 fulfillment control gaps' });
  }
});

router.post('/attempts', requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const input = createAttemptSchema.parse(req.body);
    const attempt = await startP1FulfillmentAttempt({
      ...input,
      actor: actorFromRequest(req),
    });
    res.status(201).json(attempt);
  } catch (error) {
    console.error('[P1Fulfillment] Failed to create attempt:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid attempt payload', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create P1 fulfillment attempt' });
  }
});

router.post('/attempts/:attemptId/step', requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const input = stepSchema.parse(req.body);
    const attempt = await recordP1FulfillmentStep({
      attemptId: req.params.attemptId,
      ...input,
    });
    res.json(attempt);
  } catch (error) {
    console.error('[P1Fulfillment] Failed to record step:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid step payload', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to record P1 fulfillment step' });
  }
});

router.post('/attempts/:attemptId/fail', requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const input = failSchema.parse(req.body);
    const attempt = await failP1FulfillmentAttempt({
      attemptId: req.params.attemptId,
      ...input,
    });
    res.json(attempt);
  } catch (error) {
    console.error('[P1Fulfillment] Failed to mark exception:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid failure payload', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to mark P1 fulfillment exception' });
  }
});

router.post('/attempts/:attemptId/complete', requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const input = completeSchema.parse(req.body);
    const attempt = await completeP1FulfillmentAttempt({
      attemptId: req.params.attemptId,
      ...input,
    });
    res.json(attempt);
  } catch (error) {
    console.error('[P1Fulfillment] Failed to complete attempt:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid complete payload', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to complete P1 fulfillment attempt' });
  }
});

router.post('/attempts/:attemptId/cancel', requirePermission('shipping.mark_shipped'), async (req: Request, res: Response) => {
  try {
    const input = cancelSchema.parse(req.body);
    const attempt = await cancelP1FulfillmentException({
      attemptId: req.params.attemptId,
      reason: input.reason,
      actor: actorFromRequest(req),
    });
    res.json(attempt);
  } catch (error) {
    console.error('[P1Fulfillment] Failed to cancel exception:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid cancel payload', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to cancel P1 fulfillment exception' });
  }
});

export default router;
