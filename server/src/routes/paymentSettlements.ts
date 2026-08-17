import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/requirePermission';
import { recordAuditEvent } from '../services/auditLedgerService';
import { createPaymentSettlement, getPaymentSettlementWorkspace } from '../services/paymentSettlementService';

const router = Router();

router.get('/', requirePermission('finance.manage_payments'), async (_req: Request, res: Response) => {
  try {
    res.json(await getPaymentSettlementWorkspace());
  } catch (error) {
    console.error('Failed to load payment settlement workspace:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load payment settlement workspace' });
  }
});

router.post('/', requirePermission('finance.manage_payments'), async (req: Request, res: Response) => {
  try {
    const input = z.object({
      settlementDate: z.string().min(10),
      processor: z.string().min(1),
      bankReference: z.string().min(1),
      grossAmount: z.coerce.number().positive(),
      feeAmount: z.coerce.number().min(0),
      netAmount: z.coerce.number().min(0),
      reason: z.string().min(3),
      items: z.array(z.object({
        paymentSource: z.enum(['AR_PAYMENT', 'P1_PAYMENT']),
        paymentId: z.string().min(1),
        amount: z.coerce.number().positive(),
      })).min(1),
    }).parse(req.body);
    const username = (req as any).user?.username || null;
    const settlement = await createPaymentSettlement({ ...input, createdBy: username });
    await recordAuditEvent({
      eventType: 'CUSTOMER_PAYMENT_SETTLEMENT_POSTED',
      subjectType: 'ar_payment_settlement',
      subjectId: settlement.id,
      sourceService: 'paymentSettlements.route',
      actor: { username },
      reason: input.reason,
      payload: {
        processor: input.processor,
        bankReference: input.bankReference,
        grossAmount: input.grossAmount,
        feeAmount: input.feeAmount,
        netAmount: input.netAmount,
        paymentCount: input.items.length,
      },
    });
    res.status(201).json(settlement);
  } catch (error) {
    console.error('Failed to create payment settlement:', error);
    const status = error instanceof z.ZodError ? 400 : 409;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Failed to create payment settlement' });
  }
});

export default router;
