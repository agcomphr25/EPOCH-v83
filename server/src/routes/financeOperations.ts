import { Router } from 'express';
import { z } from 'zod';

import { requireAdminOrOwner } from '../../middleware/auth';
import {
  getFinanceOperationsCapabilityState,
  requireFinancePilotUser,
} from '../lib/financeOperationsPolicy';
import {
  buildFinanceSyntheticPilotScenario,
  parseFinanceSyntheticVariant,
} from '../services/financeSyntheticPilot.service';
import { observeRealP2ArCandidates } from '../services/financeP2Observation.service';
import {
  createFinanceBillingRecipient,
  listFinanceBillingCustomers,
  listFinanceBillingRecipients,
  updateFinanceBillingRecipient,
} from '../services/financeBillingRecipients.service';

const router = Router();

const recipientBase = z.object({
  recipientName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  deliveryRole: z.enum(['TO', 'CC']),
  receivesInvoices: z.boolean().default(true),
  receivesStatements: z.boolean().default(false),
  receivesCreditMemos: z.boolean().default(false),
  active: z.boolean().default(true),
  effectiveFrom: z.string().date(),
  effectiveUntil: z.string().date().nullable().default(null),
  changeReason: z.string().trim().min(3).max(500),
});

const recipientCreate = recipientBase.extend({
  customerScope: z.enum(['P1', 'P2']),
  customerId: z.coerce.number().int().positive(),
});

router.use(...requireAdminOrOwner, requireFinancePilotUser);

router.get('/capabilities', (_req, res) => {
  res.json(getFinanceOperationsCapabilityState());
});

router.get('/pilot-scenarios/syn-p2-001', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(
    buildFinanceSyntheticPilotScenario(
      parseFinanceSyntheticVariant(req.query.variant)
    )
  );
});

router.get('/p2-candidates', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await observeRealP2ArCandidates(Number(req.query.limit ?? 100)));
  } catch (error) {
    console.error('[FinanceOperations] Failed to observe P2 candidates', error);
    res.status(500).json({ error: 'Failed to observe P2 invoice candidates' });
  }
});

router.get('/billing-recipients', async (req, res) => {
  const parsed = z
    .object({
      customerScope: z.enum(['P1', 'P2']),
      customerId: z.coerce.number().int().positive(),
    })
    .safeParse(req.query);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: 'Valid customerScope and customerId are required' });
  try {
    res.json(
      await listFinanceBillingRecipients(
        parsed.data.customerScope,
        parsed.data.customerId
      )
    );
  } catch (error) {
    console.error(
      '[FinanceOperations] Failed to list billing recipients',
      error
    );
    res.status(500).json({ error: 'Failed to list billing recipients' });
  }
});

router.get('/billing-customers', async (req, res) => {
  const parsed = z.enum(['P1', 'P2']).safeParse(req.query.customerScope);
  if (!parsed.success)
    return res.status(400).json({ error: 'customerScope must be P1 or P2' });
  try {
    res.json(await listFinanceBillingCustomers(parsed.data));
  } catch (error) {
    console.error(
      '[FinanceOperations] Failed to list billing customers',
      error
    );
    res.status(500).json({ error: 'Failed to list billing customers' });
  }
});

router.post('/billing-recipients', async (req, res) => {
  const parsed = recipientCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: 'Invalid billing recipient',
      issues: parsed.error.issues,
    });
  try {
    const recipient = await createFinanceBillingRecipient(
      parsed.data,
      req.user ?? {}
    );
    res.status(201).json(recipient);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505')
      return res
        .status(409)
        .json({ error: 'This email is already configured for the customer' });
    if (code === '23503')
      return res.status(400).json({ error: 'Customer does not exist' });
    console.error(
      '[FinanceOperations] Failed to create billing recipient',
      error
    );
    res.status(500).json({ error: 'Failed to create billing recipient' });
  }
});

router.patch('/billing-recipients/:id', async (req, res) => {
  const parsed = recipientBase.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: 'Invalid billing recipient',
      issues: parsed.error.issues,
    });
  try {
    const recipient = await updateFinanceBillingRecipient(
      req.params.id,
      parsed.data,
      req.user ?? {}
    );
    if (!recipient)
      return res.status(404).json({ error: 'Billing recipient not found' });
    res.json(recipient);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505')
      return res
        .status(409)
        .json({ error: 'This email is already configured for the customer' });
    console.error(
      '[FinanceOperations] Failed to update billing recipient',
      error
    );
    res.status(500).json({ error: 'Failed to update billing recipient' });
  }
});

export default router;
