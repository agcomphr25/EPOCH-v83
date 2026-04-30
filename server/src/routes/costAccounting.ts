import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { storage } from '../../storage';
import {
  insertAccountCategorySchema,
  insertAccountSchema,
  insertMonthlyAccountEntrySchema,
  insertAllocationRuleSchema,
  insertAllocationResultSchema,
  journalEntries,
  auditEvents,
} from '../../schema';
import { authenticateToken } from '../../middleware/auth';
import { requireAdminAccess } from '../../middleware/routeAuthorization';
import { processLaborCosts } from '../services/laborCostingService';
import { postLaborToGL, voidLaborPosting } from '../services/laborPostingService';
import { reconcileLaborCosts } from '../services/laborReconcileService';
import { z } from 'zod';

const router = Router();

router.use(authenticateToken);
router.use(requireAdminAccess);

// ========================================
// ACCOUNT CATEGORIES ROUTES
// ========================================

// GET /api/cost-accounting/categories - Get all account categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await storage.getAllAccountCategories();
    res.json(categories);
  } catch (error) {
    console.error('Get account categories error:', error);
    res.status(500).json({ error: 'Failed to fetch account categories' });
  }
});

// GET /api/cost-accounting/categories/:id - Get single account category
router.get('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await storage.getAccountCategory(id);

    if (!category) {
      return res.status(404).json({ error: 'Account category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Get account category error:', error);
    res.status(500).json({ error: 'Failed to fetch account category' });
  }
});

// POST /api/cost-accounting/categories - Create new account category
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const validation = insertAccountCategorySchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid account category data',
        details: validation.error.format(),
      });
    }

    const newCategory = await storage.createAccountCategory(validation.data);
    res.status(201).json(newCategory);
  } catch (error: any) {
    console.error('Create account category error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account category code or name already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create account category' });
  }
});

// PUT /api/cost-accounting/categories/:id - Update account category
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = insertAccountCategorySchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid account category data',
        details: validation.error.format(),
      });
    }

    const updatedCategory = await storage.updateAccountCategory(id, validation.data);
    res.json(updatedCategory);
  } catch (error: any) {
    console.error('Update account category error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account category code or name already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update account category' });
  }
});

// DELETE /api/cost-accounting/categories/:id - Delete account category
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deleteAccountCategory(id);
    res.json({ message: 'Account category deleted successfully' });
  } catch (error) {
    console.error('Delete account category error:', error);
    res.status(500).json({ error: 'Failed to delete account category' });
  }
});

// ========================================
// ACCOUNTS ROUTES
// ========================================

// GET /api/cost-accounting/accounts - Get all accounts
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.query;
    
    let accounts;
    if (categoryId && typeof categoryId === 'string') {
      accounts = await storage.getAccountsByCategoryId(categoryId);
    } else {
      accounts = await storage.getAllAccounts();
    }
    
    res.json(accounts);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/cost-accounting/accounts/:id - Get single account
router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = await storage.getAccount(id);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// POST /api/cost-accounting/accounts - Create new account (account number auto-generated)
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const validation = insertAccountSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid account data',
        details: validation.error.format(),
      });
    }

    const newAccount = await storage.createAccount(validation.data);
    res.status(201).json(newAccount);
  } catch (error: any) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/cost-accounting/accounts/:id - Update account
router.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = insertAccountSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid account data',
        details: validation.error.format(),
      });
    }

    const updatedAccount = await storage.updateAccount(id, validation.data);
    res.json(updatedAccount);
  } catch (error: any) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/cost-accounting/accounts/:id - Delete account (soft delete)
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deleteAccount(id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ========================================
// MONTHLY ACCOUNT ENTRIES ROUTES
// ========================================

// GET /api/cost-accounting/entries - Get all monthly entries
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const { accountId, year, month } = req.query;
    
    let entries;
    if (accountId && typeof accountId === 'string') {
      entries = await storage.getMonthlyAccountEntriesByAccount(accountId);
    } else if (year && month) {
      entries = await storage.getMonthlyAccountEntriesByPeriod(
        parseInt(year as string),
        parseInt(month as string)
      );
    } else {
      entries = await storage.getAllMonthlyAccountEntries();
    }
    
    res.json(entries);
  } catch (error) {
    console.error('Get monthly entries error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly entries' });
  }
});

// GET /api/cost-accounting/entries/:id - Get single monthly entry
router.get('/entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = await storage.getMonthlyAccountEntry(id);

    if (!entry) {
      return res.status(404).json({ error: 'Monthly entry not found' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Get monthly entry error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly entry' });
  }
});

// POST /api/cost-accounting/entries - Create new monthly entry
router.post('/entries', async (req: Request, res: Response) => {
  try {
    const validation = insertMonthlyAccountEntrySchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid monthly entry data',
        details: validation.error.format(),
      });
    }

    const newEntry = await storage.createMonthlyAccountEntry(validation.data);
    res.status(201).json(newEntry);
  } catch (error: any) {
    console.error('Create monthly entry error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Entry for this account and period already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create monthly entry' });
  }
});

// PUT /api/cost-accounting/entries/:id - Update monthly entry
router.put('/entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = insertMonthlyAccountEntrySchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid monthly entry data',
        details: validation.error.format(),
      });
    }

    const updatedEntry = await storage.updateMonthlyAccountEntry(id, validation.data);
    res.json(updatedEntry);
  } catch (error: any) {
    console.error('Update monthly entry error:', error);
    res.status(500).json({ error: 'Failed to update monthly entry' });
  }
});

// DELETE /api/cost-accounting/entries/:id - Delete monthly entry
router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deleteMonthlyAccountEntry(id);
    res.json({ message: 'Monthly entry deleted successfully' });
  } catch (error) {
    console.error('Delete monthly entry error:', error);
    res.status(500).json({ error: 'Failed to delete monthly entry' });
  }
});

// ========================================
// ALLOCATION RULES ROUTES
// ========================================

// GET /api/cost-accounting/allocation-rules - Get all allocation rules
router.get('/allocation-rules', async (req: Request, res: Response) => {
  try {
    const rules = await storage.getAllAllocationRules();
    res.json(rules);
  } catch (error) {
    console.error('Get allocation rules error:', error);
    res.status(500).json({ error: 'Failed to fetch allocation rules' });
  }
});

// GET /api/cost-accounting/allocation-rules/:id - Get single allocation rule
router.get('/allocation-rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rule = await storage.getAllocationRule(id);

    if (!rule) {
      return res.status(404).json({ error: 'Allocation rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Get allocation rule error:', error);
    res.status(500).json({ error: 'Failed to fetch allocation rule' });
  }
});

// POST /api/cost-accounting/allocation-rules - Create new allocation rule
router.post('/allocation-rules', async (req: Request, res: Response) => {
  try {
    const validation = insertAllocationRuleSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid allocation rule data',
        details: validation.error.format(),
      });
    }

    const newRule = await storage.createAllocationRule(validation.data);
    res.status(201).json(newRule);
  } catch (error: any) {
    console.error('Create allocation rule error:', error);
    res.status(500).json({ error: 'Failed to create allocation rule' });
  }
});

// PUT /api/cost-accounting/allocation-rules/:id - Update allocation rule
router.put('/allocation-rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = insertAllocationRuleSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid allocation rule data',
        details: validation.error.format(),
      });
    }

    const updatedRule = await storage.updateAllocationRule(id, validation.data);
    res.json(updatedRule);
  } catch (error: any) {
    console.error('Update allocation rule error:', error);
    res.status(500).json({ error: 'Failed to update allocation rule' });
  }
});

// DELETE /api/cost-accounting/allocation-rules/:id - Delete allocation rule (soft delete)
router.delete('/allocation-rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deleteAllocationRule(id);
    res.json({ message: 'Allocation rule deleted successfully' });
  } catch (error) {
    console.error('Delete allocation rule error:', error);
    res.status(500).json({ error: 'Failed to delete allocation rule' });
  }
});

// ========================================
// ALLOCATION RESULTS ROUTES
// ========================================

// GET /api/cost-accounting/allocation-results - Get all allocation results
router.get('/allocation-results', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    
    let results;
    if (year && month) {
      results = await storage.getAllocationResultsByPeriod(
        parseInt(year as string),
        parseInt(month as string)
      );
    } else {
      results = await storage.getAllAllocationResults();
    }
    
    res.json(results);
  } catch (error) {
    console.error('Get allocation results error:', error);
    res.status(500).json({ error: 'Failed to fetch allocation results' });
  }
});

// POST /api/cost-accounting/calculate-allocations - Calculate allocations for a period
router.post('/calculate-allocations', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    await storage.calculateAllocations(year, month);
    const results = await storage.getAllocationResultsByPeriod(year, month);
    
    res.json({ 
      message: 'Allocations calculated successfully',
      results 
    });
  } catch (error) {
    console.error('Calculate allocations error:', error);
    res.status(500).json({ error: 'Failed to calculate allocations' });
  }
});

// ========================================
// LABOR → GL POSTING ENGINE ROUTES
// ========================================

// POST /api/cost-accounting/calculate-labor-costs
// Compute labor_cost_records for all employees with punches in the period.
// Returns record count and cost totals by type.
router.post('/calculate-labor-costs', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.body;

    if (!year || !month || typeof year !== 'number' || typeof month !== 'number') {
      return res.status(400).json({ error: 'year (number) and month (number) are required' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    const result = await processLaborCosts(year, month);

    res.json({
      message: 'Labor costs calculated successfully',
      runId: result.runId,
      recordCount: result.recordCount,
      totalsByType: result.totalsByType,
      readModel: result.readModel,
      ...(result.fallbackReason !== undefined ? { fallbackReason: result.fallbackReason } : {}),
    });
  } catch (error: any) {
    console.error('Calculate labor costs error:', error);
    if (error.statusCode === 409 || (error.message && error.message.includes('already posted'))) {
      return res.status(409).json({ error: error.message });
    }
    if (error.code === 'APPROVAL_BYPASS_IN_POSTING_PIPELINE') {
      return res.status(422).json({
        error: error.message,
        code: error.code,
        unapprovedGroups: error.unapprovedGroups,
        totalUnapprovedSessions: error.totalUnapprovedSessions,
        totalUnapprovedHours: error.totalUnapprovedHours,
      });
    }
    res.status(500).json({ error: error.message || 'Failed to calculate labor costs' });
  }
});

// POST /api/cost-accounting/reconcile-labor-costs
// Compare the legacy punch_ledger costing model against the allocation-segment
// model for a given calendar month without modifying any data.
// Returns the per-session diff array and an aggregate summary.
const reconcileLaborCostsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

router.post('/reconcile-labor-costs', async (req: Request, res: Response) => {
  try {
    const parsed = reconcileLaborCostsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'year (integer 2000–2100) and month (integer 1–12) are required',
        details: parsed.error.format(),
      });
    }

    const { year, month } = parsed.data;
    const result = await reconcileLaborCosts(year, month);

    res.json(result);
  } catch (error: any) {
    console.error('Reconcile labor costs error:', error);
    res.status(500).json({ error: error.message || 'Failed to reconcile labor costs' });
  }
});

// POST /api/cost-accounting/void-labor-posting
// Void a POSTED labor period: marks journal entries VOIDED and clears cost record back-links.
router.post('/void-labor-posting', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.body;

    if (!year || !month || typeof year !== 'number' || typeof month !== 'number') {
      return res.status(400).json({ error: 'year (number) and month (number) are required' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    const result = await voidLaborPosting(year, month);

    res.json({
      message: `Labor posting for ${year}-${String(month).padStart(2, '0')} voided successfully`,
      runId: result.runId,
      voidedEntryIds: result.voidedEntryIds,
    });
  } catch (error: any) {
    console.error('Void labor posting error:', error);
    if (error.statusCode === 404) {
      return res.status(404).json({ error: error.message });
    }
    if (error.statusCode === 409) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to void labor posting' });
  }
});

// POST /api/cost-accounting/post-labor-to-gl
// Create balanced double-entry journal entries for a calculated period.
// Returns the posting run ID and journal entry IDs.
router.post('/post-labor-to-gl', async (req: Request, res: Response) => {
  try {
    const { year, month, postedBy } = req.body;

    if (!year || !month || typeof year !== 'number' || typeof month !== 'number') {
      return res.status(400).json({ error: 'year (number) and month (number) are required' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    const result = await postLaborToGL(year, month, postedBy ?? 'system');

    res.json({
      message: 'Labor costs posted to GL successfully',
      runId: result.runId,
      journalEntryIds: result.journalEntryIds,
      skippedAlreadyPosted: result.skippedAlreadyPosted,
    });
  } catch (error: any) {
    console.error('Post labor to GL error:', error);
    if (error.statusCode === 409 || (error.message && error.message.includes('already been posted'))) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to post labor costs to GL' });
  }
});

// ========================================
// WIRE PAYMENT JOURNAL ENTRY VOID ROUTE
// ========================================

// POST /api/cost-accounting/void-wire-payment-entry/:id
// Void a single DRAFT WIRE_PAYMENT journal entry with mandatory reason and full audit trail.
// Protections: blocks EXPORTED, VOIDED, non-WIRE_PAYMENT entries.
// Does not delete any rows. Does not touch journal_lines.
router.post('/void-wire-payment-entry/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid journal entry id — must be a positive integer' });
  }

  const { reason } = req.body as { reason?: string };
  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    return res.status(400).json({ error: 'void_reason is required and must be at least 10 characters' });
  }

  const actorName: string = (req.user as any)?.username || (req.user as any)?.email || (req.user as any)?.name || 'admin';
  const actorId: number | null = (req.user as any)?.id ?? null;
  const actorRole: string = (req.user as any)?.role || 'admin';

  try {
    // 1. Fetch the entry
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) {
      return res.status(404).json({ error: `Journal entry ${id} not found` });
    }

    // 2. Guard: WIRE_PAYMENT entries only — labor entries have their own void path
    if (entry.transactionType !== 'WIRE_PAYMENT') {
      return res.status(409).json({
        error: `Entry ${id} is type ${entry.transactionType}. This route only voids WIRE_PAYMENT entries. Use void-labor-posting for labor entries.`,
      });
    }

    // 3. Guard: already VOIDED
    if (entry.status === 'VOIDED') {
      return res.status(409).json({ error: `Entry ${id} is already VOIDED` });
    }

    // 4. Guard: exported entries — cannot void, must reverse via accountant
    if (entry.exportedAt !== null || entry.status === 'EXPORTED') {
      return res.status(409).json({
        error: `Entry ${id} has been exported (exported_at=${entry.exportedAt}). Exported entries cannot be voided — contact your accountant to issue a reversal.`,
      });
    }

    // 5. Guard: only DRAFT may be voided
    if (entry.status !== 'DRAFT') {
      return res.status(409).json({
        error: `Entry ${id} has status '${entry.status}'. Only DRAFT entries can be voided via this route.`,
      });
    }

    const now = new Date();

    // 6. Void the entry
    const [voided] = await db
      .update(journalEntries)
      .set({
        status: 'VOIDED',
        voidedAt: now,
        voidedBy: actorName,
        voidReason: reason.trim(),
        updatedAt: now,
      })
      .where(eq(journalEntries.id, id))
      .returning();

    // 7. Write audit event — required for DCAA trail
    await db.insert(auditEvents).values({
      entityType: 'journal_entry',
      entityId: String(id),
      action: 'JOURNAL_ENTRY_VOIDED',
      actorId,
      actorName,
      actorRole,
      reason: reason.trim(),
      fieldsChanged: {
        status: { from: entry.status, to: 'VOIDED' },
        voidedAt: now.toISOString(),
        voidedBy: actorName,
        voidReason: reason.trim(),
      },
      meta: {
        transactionType: entry.transactionType,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        effectiveDate: entry.effectiveDate,
        memo: entry.memo,
        originalCreatedBy: entry.createdBy,
      },
    });

    return res.json({
      message: `Journal entry ${id} voided successfully`,
      entry: voided,
    });
  } catch (error: any) {
    console.error(`[VoidWirePayment] Error voiding entry ${id}:`, error);
    return res.status(500).json({ error: error.message || 'Failed to void journal entry' });
  }
});

export default router;
