import { Router, type Request, type Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import {
  listInventoryLedgerEntries,
  recordInventoryLedgerEntry,
  reverseInventoryLedgerEntry,
  verifyInventoryLedgerHashes,
} from '../services/inventoryTransactionLedgerService';

const router = Router();

router.use(requireAdminOrOwner);

function currentUser(req: Request): { id?: number; username?: string } {
  return (req.user ?? {}) as { id?: number; username?: string };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    res.json(await listInventoryLedgerEntries({
      agPartNumber: typeof req.query.agPartNumber === 'string' ? req.query.agPartNumber : undefined,
      lotId: typeof req.query.lotId === 'string' ? req.query.lotId : undefined,
      sourceModule: typeof req.query.sourceModule === 'string' ? req.query.sourceModule : undefined,
      limit,
    }));
  } catch (error) {
    console.error('[inventory-transaction-ledger] list failed', error);
    res.status(500).json({ error: 'Failed to list inventory ledger entries' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : undefined;
    res.json(await verifyInventoryLedgerHashes({ limit }));
  } catch (error) {
    console.error('[inventory-transaction-ledger] verify failed', error);
    res.status(500).json({ error: 'Failed to verify inventory ledger hashes' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const user = currentUser(req);
    const entry = await recordInventoryLedgerEntry({
      ...req.body,
      performedByUserId: req.body?.performedByUserId ?? user.id ?? null,
      performedByDisplayName:
        req.body?.performedByDisplayName ??
        user.username ??
        'system',
    });
    res.status(201).json(entry);
  } catch (error: any) {
    console.error('[inventory-transaction-ledger] insert failed', error);
    res.status(400).json({ error: error.message ?? 'Failed to record inventory ledger entry' });
  }
});

router.post('/:id/reversal', async (req: Request, res: Response) => {
  try {
    const user = currentUser(req);
    const entry = await reverseInventoryLedgerEntry({
      transactionId: req.params.id,
      performedByDisplayName:
        req.body?.performedByDisplayName ??
        user.username ??
        'system',
      reasonCode: req.body?.reasonCode ?? 'REVERSAL',
      notes: req.body?.notes ?? null,
      approvedByUserId: req.body?.approvedByUserId ?? null,
      approvedByDisplayName: req.body?.approvedByDisplayName ?? null,
      digitalSignatureId: req.body?.digitalSignatureId ?? null,
    });
    res.status(201).json(entry);
  } catch (error: any) {
    console.error('[inventory-transaction-ledger] reversal failed', error);
    res.status(400).json({ error: error.message ?? 'Failed to reverse inventory ledger entry' });
  }
});

export default router;
