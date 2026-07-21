import { Router, Request, Response } from 'express';
import { db, pool } from '../../db';
import { quotes, quoteLineItems, projectSteps, projects, productionWorkOrders, projectStepTypeEnum, insertQuoteSchema, insertQuoteLineItemSchema, customers, type QuoteExecutionFeedback } from '../../schema';
import { eq, desc, max } from 'drizzle-orm';
import { resolveCustomersIntegerId } from '../lib/customerResolver';

// Resolve the best display name for a quote's customer.
// Priority:
//   1. Master customers table via integer bridge FK.
//   2. Master customers table via text customerId (numeric string → PK, then key/name).
//   3. Stored customerName snapshot as last resort.
async function resolveQuoteCustomerName(
  customersIntegerId: number | null | undefined,
  fallbackName: string,
  textCustomerId?: string | null
): Promise<string> {
  // Pass 1: integer bridge FK.
  if (customersIntegerId) {
    const [customer] = await db
      .select({ name: customers.name, company: customers.company })
      .from(customers)
      .where(eq(customers.id, customersIntegerId))
      .limit(1);
    if (customer) {
      return customer.company || customer.name || fallbackName;
    }
  }
  // Pass 2: text customerId fallback — use shared resolver to find the integer PK,
  // then fetch the display name from the master customers table.
  if (textCustomerId) {
    const resolvedId = await resolveCustomersIntegerId(textCustomerId);
    if (resolvedId != null) {
      const [customer] = await db
        .select({ name: customers.name, company: customers.company })
        .from(customers)
        .where(eq(customers.id, resolvedId))
        .limit(1);
      if (customer) {
        return customer.company || customer.name || fallbackName;
      }
    }
  }
  return fallbackName;
}
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
import { quoteAttachmentUpload, quoteAttachmentsDir } from '../../utils/fileUpload';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { storage } from '../../storage';
import { createQuoteSnapshot } from '../services/quoteContractService';
import { getWorkflowVersionForNewProject } from '../services/projectWorkflowVersionService';

type ProjectStepTypeValue = typeof projectStepTypeEnum.enumValues[number];

const PROJECT_STEP_TYPES: Array<{ type: ProjectStepTypeValue; order: number }> = [
  { type: 'rfq_risk_assessment', order: 1 },
  { type: 'quote', order: 2 },
  { type: 'purchase_review_checklist', order: 3 },
  { type: 'preproduction_checklist', order: 4 },
  { type: 'p2_order', order: 5 },
];

const router = Router();

async function getEstimatingQuoteReleaseGate(quoteId: string) {
  const rfqRows = await pool.query(
    `SELECT id, rfq_number FROM estimating_rfqs WHERE quote_id = $1 LIMIT 1`,
    [quoteId]
  );
  const rfq = rfqRows[0];
  if (!rfq) return null;

  const [approvals, pricingRows, latestRiskRows, blockingRiskItems] = await Promise.all([
    pool.query(`SELECT approval_role, approval_status FROM estimating_approvals WHERE rfq_id = $1`, [rfq.id]),
    pool.query(`SELECT extended_price, margin_percent FROM estimating_pricing_snapshots WHERE rfq_id = $1`, [rfq.id]),
    pool.query(
      `SELECT * FROM risk_assessments
       WHERE rfq_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [rfq.id]
    ),
    pool.query(
      `SELECT ri.*
       FROM risk_items ri
       JOIN risk_assessments ra ON ra.id = ri.risk_assessment_id
       WHERE ra.rfq_id = $1
         AND ri.status NOT IN ('CLOSED', 'MITIGATED', 'ACCEPTED')
         AND (ri.requires_approval = true OR ri.score >= 10)`,
      [rfq.id]
    ),
  ]);

  const totalEstimateValue = pricingRows.reduce((sum: number, row: any) => sum + Number(row.extended_price || 0), 0);
  const margins = pricingRows.map((row: any) => Number(row.margin_percent || 0));
  const minMarginPercent = margins.length ? Math.min(...margins) : null;
  const latestRisk = latestRiskRows[0] ?? null;
  const riskScore = Number(latestRisk?.overall_score ?? 0);
  const riskLevel = latestRisk?.overall_level ?? 'UNKNOWN';
  const executiveTriggers = [
    totalEstimateValue >= 50000 ? 'VALUE_50000_OR_GREATER' : null,
    minMarginPercent !== null && minMarginPercent < 15 ? 'MARGIN_BELOW_15_PERCENT' : null,
    riskScore >= 10 ? 'RISK_SCORE_10_OR_GREATER' : null,
    ['HIGH', 'CRITICAL'].includes(riskLevel) ? `RISK_LEVEL_${riskLevel}` : null,
  ].filter(Boolean);
  const requiredRoles = ['ESTIMATOR', 'ENGINEERING', 'FINANCE'];
  if (executiveTriggers.length > 0) requiredRoles.push('EXECUTIVE');

  const approvedRoles = new Set(
    approvals
      .filter((row: any) => row.approval_status === 'APPROVED')
      .map((row: any) => row.approval_role)
  );
  const missingRoles = requiredRoles.filter((role) => !approvedRoles.has(role));
  const riskReady = Boolean(latestRisk)
    && ['APPROVED', 'CLOSED'].includes(String(latestRisk.status))
    && blockingRiskItems.length === 0;

  return {
    rfqId: rfq.id,
    rfqNumber: rfq.rfq_number,
    readyForQuoteRelease: missingRoles.length === 0 && riskReady,
    requiredRoles,
    missingRoles,
    executiveRequired: executiveTriggers.length > 0,
    executiveTriggers,
    risk: {
      assessmentId: latestRisk?.id ?? null,
      status: latestRisk?.status ?? null,
      overallScore: riskScore,
      overallLevel: riskLevel,
      blockingRiskCount: blockingRiskItems.length,
    },
  };
}

// Generate unique quote number
async function generateQuoteNumber(): Promise<string> {
  const prefix = 'QUO';
  const year = new Date().getFullYear().toString().slice(-2);
  
  // Get all quotes for this year and find the highest number
  const allQuotes = await db
    .select()
    .from(quotes)
    .orderBy(desc(quotes.createdAt));

  let nextNumber = 1;
  const yearPattern = `${prefix}${year}`;
  
  // Find quotes matching this year's pattern and extract the highest sequence number
  for (const quote of allQuotes) {
    if (quote.quoteNumber && quote.quoteNumber.startsWith(yearPattern)) {
      const sequenceStr = quote.quoteNumber.slice(yearPattern.length);
      const sequenceNum = parseInt(sequenceStr, 10);
      if (!isNaN(sequenceNum) && sequenceNum >= nextNumber) {
        nextNumber = sequenceNum + 1;
      }
    }
  }

  return `${prefix}${year}${nextNumber.toString().padStart(4, '0')}`;
}

// Get all quotes
router.get('/api/quotes', async (req: Request, res: Response) => {
  try {
    const allQuotes = await db
      .select()
      .from(quotes)
      .orderBy(desc(quotes.createdAt));

    // Enrich each quote with a resolved customer name from the master customers
    // table. Two-pass strategy:
    //   Pass 1 (bridge FK path): batch lookup by integer FK for rows that have one.
    //   Pass 2 (text ID path): batch lookup by customer_key/name for rows without a
    //     bridge FK, so the master table is always consulted even on legacy records.
    const { inArray } = await import('drizzle-orm');

    // Pass 1: integer FK batch lookup.
    const integerIds = [...new Set(allQuotes.map((q) => q.customersIntegerId).filter((id): id is number => id != null))];
    const customerMap = new Map<number, string>();
    if (integerIds.length > 0) {
      const rows = await db
        .select({ id: customers.id, name: customers.name, company: customers.company })
        .from(customers)
        .where(inArray(customers.id, integerIds));
      for (const row of rows) {
        customerMap.set(row.id, row.company || row.name);
      }
    }

    // Pass 2: text ID fallback batch lookup for rows without a bridge FK.
    const textIdsWithoutBridge = [...new Set(
      allQuotes
        .filter((q) => !q.customersIntegerId && q.customerId)
        .map((q) => q.customerId as string)
    )];
    // textIdToName maps text customerId → display name from master customers table.
    const textIdToName = new Map<string, string>();
    if (textIdsWithoutBridge.length > 0) {
      // Numeric string IDs: look up by integer PK.
      const numericIds = textIdsWithoutBridge
        .filter((id) => /^\d+$/.test(id))
        .map((id) => parseInt(id, 10));
      if (numericIds.length > 0) {
        const rows = await db
          .select({ id: customers.id, name: customers.name, company: customers.company })
          .from(customers)
          .where(inArray(customers.id, numericIds));
        for (const row of rows) {
          textIdToName.set(String(row.id), row.company || row.name);
        }
      }
      // Non-numeric IDs: match by customer_key or name (case-insensitive).
      const nonNumericIds = textIdsWithoutBridge.filter((id) => !/^\d+$/.test(id));
      if (nonNumericIds.length > 0) {
        const allCustomers = await db
          .select({ id: customers.id, name: customers.name, company: customers.company, customerKey: customers.customerKey })
          .from(customers);
        for (const cust of allCustomers) {
          const displayName = cust.company || cust.name;
          for (const textId of nonNumericIds) {
            const lower = textId.toLowerCase();
            if (
              (cust.customerKey && cust.customerKey.toLowerCase() === lower) ||
              cust.name.toLowerCase() === lower
            ) {
              textIdToName.set(textId, displayName);
            }
          }
        }
      }
    }

    const enriched = allQuotes.map((q) => {
      let resolvedCustomerName: string;
      if (q.customersIntegerId && customerMap.has(q.customersIntegerId)) {
        // Bridge FK resolved — use authoritative master-table name.
        resolvedCustomerName = customerMap.get(q.customersIntegerId)!;
      } else if (q.customerId && textIdToName.has(q.customerId)) {
        // Text ID resolved via master-table fallback lookup.
        resolvedCustomerName = textIdToName.get(q.customerId)!;
      } else {
        // Last resort: stored snapshot.
        resolvedCustomerName = q.customerName ?? '';
      }
      return {
        ...q,
        // Overwrite the stored snapshot with the authoritative resolved name so
        // existing consumers that read customerName get the correct display value.
        customerName: resolvedCustomerName,
        resolvedCustomerName,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Get single quote with line items
router.get('/api/quotes/:id', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const lineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId))
      .orderBy(quoteLineItems.lineNumber);

    // Resolve the authoritative customer name: bridge FK first, then text ID fallback.
    const resolvedCustomerName = await resolveQuoteCustomerName(
      quote.customersIntegerId,
      quote.customerName,
      quote.customerId
    );

    // Overwrite customerName so existing consumers get the authoritative name
    // without needing to switch to reading resolvedCustomerName.
    res.json({ ...quote, customerName: resolvedCustomerName, lineItems, resolvedCustomerName });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

router.get('/api/quotes/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const { pool } = await import('../../db');

    const snapshotResult = await pool.query(
      `SELECT *
       FROM quote_snapshots
       WHERE quote_id = $1
       ORDER BY revision_number DESC`,
      [quoteId],
    );
    const snapshots = Array.isArray(snapshotResult) ? snapshotResult : snapshotResult.rows ?? [];

    const snapshotsWithLines = await Promise.all(
      snapshots.map(async (snapshot: any) => {
        const lineResult = await pool.query(
          `SELECT *
           FROM quote_line_snapshots
           WHERE quote_snapshot_id = $1
           ORDER BY line_number`,
          [snapshot.id],
        );
        const lines = Array.isArray(lineResult) ? lineResult : lineResult.rows ?? [];
        return { ...snapshot, lineItems: lines };
      }),
    );

    res.json(snapshotsWithLines);
  } catch (error) {
    console.error('Get quote snapshots error:', error);
    res.status(500).json({ error: 'Failed to fetch quote snapshots' });
  }
});

// Save quote (create or update as draft)
router.post('/api/quotes/save', async (req: Request, res: Response) => {
  try {
    // Validate request body structure
    const requestBody = req.body;
    if (!requestBody) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const {
      id,
      rfqNumber,
      customerId,
      customerName,
      customerCompany,
      fromName,
      fromEmail,
      fromPhone,
      paymentTerms,
      notes,
      validityDays,
      lineItems: items = [],
    } = requestBody;

    // Validate line items if present
    if (items.length > 0) {
      for (const item of items) {
        const validation = insertQuoteLineItemSchema.safeParse({
          quoteId: id || randomUUID(), // Temporary UUID for validation
          lineNumber: parseInt(String(item.lineNumber || 0)),
          quantity: parseFloat(String(item.quantity || 1)),
          description: String(item.description || ''),
          unitPrice: parseFloat(String(item.unitPrice || 0)),
          totalPrice: parseFloat(String(item.totalPrice || 0)),
          inventoryItemId: item.inventoryItemId ? parseInt(String(item.inventoryItemId)) : null,
          agPartNumber: item.agPartNumber || null,
        });
        if (!validation.success) {
          console.error('Line item validation error:', validation.error.format());
          return res.status(400).json({
            error: 'Invalid line item data',
            details: validation.error.format(),
          });
        }
      }
    }

    // Calculate total amount from line items
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);

    // Calculate valid until date
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + parseInt(validityDays || '30'));

    // Resolve the integer FK to the master customers table from the text customerId.
    // This ensures the bridge column is populated on every save, not just on RFQ conversion.
    const resolvedCustomersIntegerId = await resolveCustomersIntegerId(customerId);

    let quoteId = id;
    let quoteNumber = rfqNumber;

    if (!quoteId) {
      // Create new quote
      if (!quoteNumber) {
        quoteNumber = await generateQuoteNumber();
      }

      const newQuote = await db
        .insert(quotes)
        .values({
          quoteNumber,
          customerId: customerId || '',
          customerName: customerCompany || customerName || '',
          description: `From: ${fromName} (${fromEmail})`,
          totalAmount,
          status: 'DRAFT',
          validUntil,
          quotedBy: fromName,
          notes,
          customersIntegerId: resolvedCustomersIntegerId,
        })
        .returning();

      quoteId = newQuote[0].id;
    } else {
      const [existingQuote] = await db
        .select({ status: quotes.status })
        .from(quotes)
        .where(eq(quotes.id, quoteId))
        .limit(1);

      if (!existingQuote) {
        return res.status(404).json({ error: 'Quote not found' });
      }
      if (existingQuote.status !== 'DRAFT') {
        return res.status(409).json({
          error: 'Sent quotes are immutable. Create a new quote revision instead of editing the submitted quote.',
          currentStatus: existingQuote.status,
        });
      }

      // Update existing quote.
      // customersIntegerId update policy:
      //   - customerId provided (non-empty): always sync bridge FK to the resolved
      //     value (null if unresolvable) so we never retain a stale link after a
      //     customer change.
      //   - customerId absent/empty: preserve the existing bridge FK because the
      //     form did not touch the customer field (e.g. autosave updating notes).
      const updateSet: Record<string, unknown> = {
        customerName: customerCompany || customerName || '',
        description: `From: ${fromName} (${fromEmail})`,
        totalAmount,
        validUntil,
        quotedBy: fromName,
        notes,
        updatedAt: new Date(),
      };
      if (customerId) {
        updateSet.customerId = customerId;
        updateSet.customersIntegerId = resolvedCustomersIntegerId; // may be null (clears stale link)
      }

      await db
        .update(quotes)
        .set(updateSet)
        .where(eq(quotes.id, quoteId));

      // Delete existing line items
      await db
        .delete(quoteLineItems)
        .where(eq(quoteLineItems.quoteId, quoteId));
    }

    // Insert line items
    if (items.length > 0) {
      const lineItemsToInsert = items.map((item: any, index: number) => ({
        quoteId,
        lineNumber: index + 1,
        quantity: item.quantity || 1,
        description: item.description || '',
        unitPrice: item.unitPrice || 0,
        totalPrice: item.totalPrice || 0,
        inventoryItemId: item.inventoryItemId || null,
        agPartNumber: item.agPartNumber || null,
        laborHours: item.laborHours != null ? parseFloat(String(item.laborHours)) : null,
        department: item.department || null,
      }));

      await db.insert(quoteLineItems).values(lineItemsToInsert);
    }

    // Fetch the complete quote with line items
    const [savedQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    const savedLineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId))
      .orderBy(quoteLineItems.lineNumber);

    res.json({
      ...savedQuote,
      lineItems: savedLineItems,
    });
  } catch (error) {
    console.error('Save quote error:', error);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});

// Submit quote (change status to SENT and send email)
router.post('/api/quotes/submit', async (req: Request, res: Response) => {
  try {
    const { id, revisionLabel, exclusions, certRequirements, contractualClauses } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Quote ID is required' });
    }

    const [currentQuote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, id))
      .limit(1);

    if (!currentQuote) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    if (currentQuote.status !== 'DRAFT') {
      return res.status(409).json({
        error: 'Only draft quotes can be submitted. Sent quotes are immutable; create a new revision instead.',
        currentStatus: currentQuote.status,
      });
    }

    const estimatingGate = await getEstimatingQuoteReleaseGate(id);
    if (estimatingGate && !estimatingGate.readyForQuoteRelease) {
      return res.status(409).json({
        error: 'Quote cannot be submitted until the source RFQ has completed estimating approvals and risk release.',
        readiness: estimatingGate,
      });
    }

    const [submittedQuote] = await db
      .update(quotes)
      .set({
        status: 'SENT',
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, id))
      .returning();

    const submittedLineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, id))
      .orderBy(quoteLineItems.lineNumber);

    // TODO: Send email notification to customer
    // This would integrate with SendGrid or your email service
    // For now, we'll just update the status
    const snapshot = await createQuoteSnapshot(id, {
      revisionLabel,
      exclusions,
      certRequirements,
      contractualClauses,
    });

    res.json({
      ...submittedQuote,
      lineItems: submittedLineItems,
      snapshot,
      message: 'Quote submitted successfully',
    });
  } catch (error) {
    console.error('Submit quote error:', error);
    res.status(500).json({ error: 'Failed to submit quote' });
  }
});

// Update quote status (e.g., ACCEPTED, REJECTED, EXPIRED)
router.patch('/api/quotes/:id/status', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const { status } = req.body;

    const VALID_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // For non-ACCEPTED status changes, just update and return
    if (status !== 'ACCEPTED' || quote.status === 'ACCEPTED') {
      if (status === 'SENT' && quote.status !== 'DRAFT') {
        return res.status(409).json({
          error: 'Only draft quotes can be sent. Sent quotes are immutable; create a new revision instead.',
          currentStatus: quote.status,
        });
      }
      if (status === 'SENT') {
        const estimatingGate = await getEstimatingQuoteReleaseGate(quoteId);
        if (estimatingGate && !estimatingGate.readyForQuoteRelease) {
          return res.status(409).json({
            error: 'Quote cannot be sent until the source RFQ has completed estimating approvals and risk release.',
            readiness: estimatingGate,
          });
        }
      }

      const [updated] = await db
        .update(quotes)
        .set({ status, updatedAt: new Date() })
        .where(eq(quotes.id, quoteId))
        .returning();

      let snapshot = null;
      if (status === 'SENT') {
        snapshot = await createQuoteSnapshot(quoteId);
      }

      // Recovery path for legacy ACCEPTED quotes missing projectId:
      // scan project steps for a linked quote step to backfill the projectId.
      let resolvedProjectId = updated.projectId ?? null;
      if (updated.status === 'ACCEPTED' && !resolvedProjectId) {
        const [linkedStep] = await db
          .select({ projectId: projectSteps.projectId })
          .from(projectSteps)
          .where(eq(projectSteps.linkedQuoteId, quoteId))
          .limit(1);
        if (linkedStep) {
          resolvedProjectId = linkedStep.projectId;
          // Backfill the projectId on the quote for future lookups
          await db
            .update(quotes)
            .set({ projectId: resolvedProjectId, updatedAt: new Date() })
            .where(eq(quotes.id, quoteId));
          console.log(`[Quote→Project] Backfilled projectId ${resolvedProjectId} onto legacy accepted quote ${updated.quoteNumber}`);
        }
      }

      return res.json({ ...updated, projectId: resolvedProjectId, snapshot });
    }

    // ── ACCEPTANCE PATH: wrap everything in a transaction ──────────────────
    let resultProjectId: string;

    try {
      resultProjectId = await db.transaction(async (tx) => {
        // 1. Lock the quote row so concurrent acceptance requests serialize here,
        //    then re-read projectId from the locked row for an accurate duplicate check.
        const [lockedQuote] = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.id, quoteId))
          .for('update');

        // 2. Update the quote status (inside tx so it rolls back on any failure below)
        await tx
          .update(quotes)
          .set({ status: 'ACCEPTED', updatedAt: new Date() })
          .where(eq(quotes.id, quoteId));

        // 3. Duplicate guard — use the locked row's projectId so concurrent requests
        //    cannot both see null and both create projects at the same time.
        if (lockedQuote.projectId) {
          console.log(`[Quote→Project] Quote ${lockedQuote.quoteNumber} already linked to project ${lockedQuote.projectId}, skipping creation`);
          // Idempotent WAD check using tx
          const existingWads = await tx
            .select({ id: productionWorkOrders.id })
            .from(productionWorkOrders)
            .where(eq(productionWorkOrders.projectId, lockedQuote.projectId))
            .limit(1);
          if (existingWads.length === 0) {
            await tx.insert(productionWorkOrders).values({
              workOrderNumber: `WAD-${Date.now()}`,
              projectId: lockedQuote.projectId,
              partNumber: 'TBD',
              quantity: 1,
              status: 'PLANNED',
              description: `Auto-created WAD for ${lockedQuote.customerName} — ${lockedQuote.quoteNumber}`,
            });
          }
          return lockedQuote.projectId;
        }

        // 3. Derive the next project code (using tx)
        const [codeResult] = await tx
          .select({ maxCode: max(projects.projectCode) })
          .from(projects);
        const currentMax = codeResult?.maxCode;
        let nextCode = 'PRJ-001';
        if (currentMax) {
          const match = currentMax.match(/PRJ-(\d+)/);
          if (match) {
            nextCode = `PRJ-${(parseInt(match[1], 10) + 1).toString().padStart(3, '0')}`;
          }
        }

        // 4. Auto-create the project (using tx)
        const projectName = `${lockedQuote.customerName} — ${lockedQuote.quoteNumber}`;
        const [project] = await tx
          .insert(projects)
          .values({
            projectCode: nextCode,
            projectName,
            customerId: lockedQuote.customerId,
            description: lockedQuote.description ?? null,
            status: 'active',
            workflowVersion: getWorkflowVersionForNewProject(),
            // Carry the bridge FK from the quote so the project retains a resolvable
            // integer FK to the master customers table even though customerId is text.
            customersIntegerId: lockedQuote.customersIntegerId ?? null,
          })
          .returning();
        const projectId = project.id;
        console.log(`[Quote→Project] Auto-created project ${project.projectCode} from accepted quote ${quote.quoteNumber}`);

        // 5. Create all standard P2 workflow steps (using tx)
        for (const stepDef of PROJECT_STEP_TYPES) {
          await tx.insert(projectSteps).values({
            projectId,
            stepType: stepDef.type,
            stepOrder: stepDef.order,
            status: stepDef.order === 1 ? 'in_progress' : 'pending',
            startedAt: stepDef.order === 1 ? new Date() : null,
            linkedQuoteId: stepDef.type === 'quote' ? quoteId : null,
          });
        }

        // 6. Store projectId on the quote so future duplicate checks work (using tx)
        await tx
          .update(quotes)
          .set({ projectId, updatedAt: new Date() })
          .where(eq(quotes.id, quoteId));

        // 7. Provision the WAD (using tx)
        const lineItems = await tx
          .select()
          .from(quoteLineItems)
          .where(eq(quoteLineItems.quoteId, quoteId))
          .orderBy(quoteLineItems.lineNumber);

        // Collect all AG part numbers from line items so the WAD can be used
        // to generate travelers for each part.  Each individual part number is
        // capped at 40 chars so every line-item is preserved regardless of count.
        const explicitPartNumbers = lineItems
          .map((li) => li.agPartNumber?.trim().slice(0, 40))
          .filter((pn): pn is string => Boolean(pn));

        let wadPartNumber: string | null = null;
        if (explicitPartNumbers.length > 0) {
          wadPartNumber = explicitPartNumbers.join(', ');
        } else if (lineItems.length > 0) {
          const firstDescription = lineItems[0].description?.trim() ?? '';
          if (firstDescription) {
            wadPartNumber = firstDescription
              .replace(/[^a-zA-Z0-9\-_/. ]/g, '')
              .trim()
              .slice(0, 40)
              .trim() || null;
          }
        }

        // Budget hours: sum laborHours across all line items.
        const totalLaborHours = lineItems.reduce((sum, li) => sum + (li.laborHours ?? 0), 0);
        const wadBudgetHours = totalLaborHours > 0 ? String(totalLaborHours) : null;

        // Department budgets: aggregate laborHours per department.
        const deptBudgets: Record<string, number> = {};
        for (const li of lineItems) {
          if (li.department && li.laborHours && li.laborHours > 0) {
            deptBudgets[li.department] = (deptBudgets[li.department] ?? 0) + li.laborHours;
          }
        }

        await tx.insert(productionWorkOrders).values({
          workOrderNumber: `WAD-${Date.now()}`,
          projectId,
          partNumber: wadPartNumber || 'TBD',
          quantity: 1,
          status: 'PLANNED',
          description: `Auto-created WAD for ${projectName}`,
          ...(wadBudgetHours ? { totalBudgetHours: wadBudgetHours } : {}),
          ...(Object.keys(deptBudgets).length > 0 ? { departmentBudgets: deptBudgets } : {}),
        });

        return projectId;
      });
    } catch (err) {
      // Always log the full underlying error server-side so silent failures in
      // the quote → project promotion path (project insert, project_steps
      // insert, WAD insert, etc.) become visible to operators. The whole tx
      // has already rolled back, so the quote's status is untouched.
      console.error('[Quote→Project] Failed to accept quote — transaction rolled back:', err);
      const body: { error: string; detail?: string } = {
        error: 'Failed to accept quote: could not create the linked project. The quote status was not changed.',
      };
      // Only expose the raw error message in non-production environments to
      // avoid leaking internal DB/application details to clients.
      if (process.env.NODE_ENV !== 'production') {
        body.detail = err instanceof Error ? err.message : String(err);
      }
      return res.status(500).json(body);
    }

    // Return the updated quote with projectId for the frontend to use
    const [updated] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    return res.json({ ...updated, projectId: resultProjectId });
  } catch (error) {
    console.error('Update quote status error:', error);
    res.status(500).json({ error: 'Failed to update quote status' });
  }
});

// Delete quote
router.delete('/api/quotes/:id', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    // Line items will be deleted automatically due to cascade
    await db.delete(quotes).where(eq(quotes.id, quoteId));

    res.json({ success: true, message: 'Quote deleted successfully' });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

// Quote PDF Attachments
router.post('/api/quotes/:id/attachments', (req: Request, res: Response) => {
  quoteAttachmentUpload.array('files', 5)(req, res, async (err) => {
    if (err) {
      let message = 'Failed to upload attachments';
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = 'One or more files exceed the 10MB size limit.';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        message = 'Too many files. Maximum 5 files per upload.';
      } else if (err.message) {
        message = err.message;
      }
      return res.status(400).json({ error: message });
    }

    try {
      const quoteId = req.params.id;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      // Get the current quote
      const [quote] = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, quoteId));

      if (!quote) {
        // Clean up uploaded files since the quote doesn't exist
        for (const file of files) {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }
        return res.status(404).json({ error: 'Quote not found' });
      }

      // Store only filenames (relative paths)
      const uploadedFileNames: string[] = files.map((file) => file.filename);

      // Update quote with new attachment filenames
      const currentAttachments = quote.attachments || [];
      const updatedAttachments = [...currentAttachments, ...uploadedFileNames];

      const [updatedQuote] = await db
        .update(quotes)
        .set({
          attachments: updatedAttachments,
          updatedAt: new Date(),
        })
        .where(eq(quotes.id, quoteId))
        .returning();

      res.json({
        message: 'Files uploaded successfully',
        attachments: updatedAttachments,
        quote: updatedQuote,
      });
    } catch (error) {
      console.error('Upload quote attachment error:', error);
      res.status(500).json({ error: 'Failed to upload attachments' });
    }
  });
});

router.delete('/api/quotes/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;
    const { fileName } = req.params;

    // Get the current quote
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // Remove the filename from attachments array (stored as filenames only)
    const currentAttachments = quote.attachments || [];

    // Verify the requested file actually belongs to this quote
    const matchedEntry = currentAttachments.find(
      (stored) => path.basename(stored) === fileName
    );

    if (!matchedEntry) {
      return res.status(404).json({ error: 'Attachment not found on this quote' });
    }

    const updatedAttachments = currentAttachments.filter(
      (stored) => path.basename(stored) !== fileName
    );

    // Only delete the physical file if it belongs to this quote
    const fullFilePath = path.join(quoteAttachmentsDir, fileName);
    if (fs.existsSync(fullFilePath)) {
      fs.unlinkSync(fullFilePath);
    }

    // Update quote
    const [updatedQuote] = await db
      .update(quotes)
      .set({
        attachments: updatedAttachments,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId))
      .returning();

    res.json({
      message: 'Attachment deleted successfully',
      quote: updatedQuote,
    });
  } catch (error) {
    console.error('Delete quote attachment error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

router.get('/api/quotes/:id/attachments/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(quoteAttachmentsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Download quote attachment error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// Generate P2 Quote PDF
router.get('/api/quotes/:id/pdf', async (req: Request, res: Response) => {
  try {
    const quoteId = req.params.id;

    // Fetch quote with line items
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const lineItems = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId))
      .orderBy(quoteLineItems.lineNumber);

    // Load P2 template (if available)
    const {
      loadActiveTemplate,
      embedTemplateLogo,
      getTemplateFontSizes,
      getTemplateSpacing,
      getTemplateColors,
      getTemplateLineHeights,
      getTemplateCompanyInfo,
      getTemplateMargins,
    } = await import('../../utils/pdf/templateLoader');
    
    const template = await loadActiveTemplate('p2_purchase_order');
    console.log('📄 [P2 PDF] Using template:', template?.name || 'Default');

    // Import PDF generation utilities
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const { PAGE_SIZES, getPrintableArea } = await import('../../utils/pdf/pdfConfig');
    
    // Get template-specific or default settings
    const MARGINS = getTemplateMargins(template);
    const FONT_SIZES = getTemplateFontSizes(template);
    const SPACING = getTemplateSpacing(template);
    const COLORS = getTemplateColors(template);
    const LINE_HEIGHTS = getTemplateLineHeights(template);
    const COMPANY_INFO = getTemplateCompanyInfo(template);
    const LOGO_CONFIG = { WIDTH: 150, VERTICAL_SPACING: 15 };
    
    const DEFAULT_MARGIN = MARGINS.STANDARD;

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Embed logo once and reuse (performance + layout fix)
    const embeddedLogo = await embedTemplateLogo(pdfDoc, template);
    
    // Initialize first page
    let page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
    const pageSize = page.getSize();
    let dims = getPrintableArea(pageSize.width, pageSize.height);
    let currentY = dims.margin + dims.height;
    
    // Shared header drawing function (reuses embedded logo)
    const drawTemplateHeader = () => {
      currentY = dims.margin + dims.height;
      if (embeddedLogo) {
        const logoWidth = LOGO_CONFIG.WIDTH;
        const logoHeight = logoWidth * (embeddedLogo.height / embeddedLogo.width);
        
        page.drawImage(embeddedLogo, {
          x: dims.margin,
          y: currentY - logoHeight,
          width: logoWidth,
          height: logoHeight,
        });
        
        currentY -= logoHeight + LOGO_CONFIG.VERTICAL_SPACING;
        page.drawText(COMPANY_INFO.ADDRESS, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= LINE_HEIGHTS.COMPACT;
        page.drawText(`Phone: ${COMPANY_INFO.PHONE} | Email: ${COMPANY_INFO.EMAIL}`, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_SMALL,
          font: regularFont,
          color: COLORS.TEXT_SECONDARY,
        });
        currentY -= SPACING.SECTION_GAP_SMALL;
      } else {
        page.drawText(COMPANY_INFO.NAME, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.TITLE_LARGE,
          font: boldFont,
          color: COLORS.TEXT_PRIMARY,
        });
        currentY -= SPACING.SECTION_GAP_SMALL;
      }
    };
    
    // Draw initial header
    drawTemplateHeader();
    
    // Shared page management helpers
    const startNewPage = () => {
      page = pdfDoc.addPage(PAGE_SIZES.LETTER_PORTRAIT);
      const pageSize = page.getSize();
      dims = getPrintableArea(pageSize.width, pageSize.height);
      drawTemplateHeader();
    };

    const checkNewPage = async (requiredSpace: number) => {
      if (currentY - requiredSpace < dims.margin) {
        await startNewPage();
      }
    };
    
    // Helper functions for drawing (template-aware wrappers)
    const wrapText = (text: string, maxWidth: number, fontSize: number, font: any): string[] => {
      const paragraphs = text.split(/\r?\n/);
      const allLines: string[] = [];
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          allLines.push('');
          continue;
        }
        const words = paragraph.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          if (testWidth > maxWidth && currentLine) {
            allLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          allLines.push(currentLine);
        }
      }
      return allLines;
    };
    
    const drawSectionHeader = (pg: any, text: string, x: number, y: number, font: any): number => {
      pg.drawText(text, {
        x,
        y,
        size: FONT_SIZES.SECTION_HEADER,
        font,
        color: COLORS.TEXT_PRIMARY,
      });
      return LINE_HEIGHTS.SECTION;
    };
    
    const drawKeyValuePair = (pg: any, key: string, value: string, x: number, y: number, regFont: any, boldFontParam?: any): number => {
      pg.drawText(`${key}: ${value}`, {
        x,
        y,
        size: FONT_SIZES.BODY_MEDIUM,
        font: boldFontParam || regFont,
      });
      return LINE_HEIGHTS.BODY;
    };

    // Document title
    const titleText = 'Quote';
    const titleWidth = boldFont.widthOfTextAtSize(titleText, FONT_SIZES.TITLE_LARGE);
    page.drawText(titleText, {
      x: (dims.width / 2) - (titleWidth / 2) + dims.margin,
      y: currentY,
      size: FONT_SIZES.TITLE_LARGE,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });
    currentY -= SPACING.SECTION_GAP_LARGE;

    // Quote Information Section
    await checkNewPage(80);
    const quoteInfoHeight = drawSectionHeader(page, 'Quote Information', dims.margin, currentY, boldFont);
    currentY -= quoteInfoHeight;

    const quoteInfoItems = [
      { label: 'Quote Number', value: quote.quoteNumber },
      { label: 'Customer', value: quote.customerName },
      { label: 'Status', value: quote.status },
      { label: 'Quoted By', value: quote.quotedBy || 'N/A' },
      { label: 'Quote Date', value: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A' },
      { label: 'Valid Until', value: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'N/A' },
    ];

    for (const item of quoteInfoItems) {
      await checkNewPage(LINE_HEIGHTS.BODY);
      const itemHeight = drawKeyValuePair(page, item.label, item.value, dims.margin, currentY, regularFont, boldFont);
      currentY -= itemHeight;
    }

    currentY -= SPACING.SECTION_GAP_MEDIUM;

    // Line Items Section
    if (lineItems.length > 0) {
      await checkNewPage(100);
      const lineItemsHeaderHeight = drawSectionHeader(page, 'Line Items', dims.margin, currentY, boldFont);
      currentY -= lineItemsHeaderHeight;
      currentY -= 10; // Small gap after header

      // Draw table manually for line items
      for (const item of lineItems) {
        await checkNewPage(LINE_HEIGHTS.BODY * 2);
        
        // Line number and description
        page.drawText(`#${item.lineNumber}`, {
          x: dims.margin,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: boldFont,
          color: COLORS.TEXT_PRIMARY,
        });
        
        const descWrapped = wrapText(item.description || '', dims.width - 200, FONT_SIZES.BODY_MEDIUM, regularFont);
        let descY = currentY;
        for (const line of descWrapped) {
          page.drawText(line, {
            x: dims.margin + 50,
            y: descY,
            size: FONT_SIZES.BODY_MEDIUM,
            font: regularFont,
            color: COLORS.TEXT_PRIMARY,
          });
          descY -= LINE_HEIGHTS.COMPACT;
        }
        
        // Quantity, Unit Price, Total
        page.drawText(`Qty: ${item.quantity}`, {
          x: dims.margin + 350,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: regularFont,
          color: COLORS.TEXT_PRIMARY,
        });
        
        page.drawText(`$${item.unitPrice.toFixed(2)}`, {
          x: dims.margin + 420,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: regularFont,
          color: COLORS.TEXT_PRIMARY,
        });
        
        page.drawText(`$${item.totalPrice.toFixed(2)}`, {
          x: dims.margin + 490,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: boldFont,
          color: COLORS.TEXT_PRIMARY,
        });
        
        currentY -= Math.max(LINE_HEIGHTS.BODY * 2, descWrapped.length * LINE_HEIGHTS.COMPACT);
        currentY -= SPACING.SECTION_GAP_TINY;
      }
      
      currentY -= SPACING.SECTION_GAP_SMALL;
    }

    // Quote Total
    await checkNewPage(40);
    const totalHeight = drawKeyValuePair(page, 'Quote Total', `$${quote.totalAmount.toFixed(2)}`, dims.margin, currentY, boldFont, boldFont);
    currentY -= totalHeight;
    currentY -= SPACING.SECTION_GAP_MEDIUM;

    // Notes Section
    if (quote.notes) {
      await checkNewPage(60);
      const notesHeaderHeight = drawSectionHeader(page, 'Notes', dims.margin, currentY, boldFont);
      currentY -= notesHeaderHeight;

      const wrappedNotes = wrapText(quote.notes, dims.width - 20, FONT_SIZES.BODY_MEDIUM, regularFont);
      for (const line of wrappedNotes) {
        await checkNewPage(LINE_HEIGHTS.BODY);
        page.drawText(line, {
          x: dims.margin + 10,
          y: currentY,
          size: FONT_SIZES.BODY_MEDIUM,
          font: regularFont,
          color: COLORS.TEXT_PRIMARY,
        });
        currentY -= LINE_HEIGHTS.BODY;
      }
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Send PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Quote-${quote.quoteNumber}.pdf"`);
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Generate P2 Quote PDF error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ─── Quote Suggestion Engine ────────────────────────────────────────────────

const suggestionsBodySchema = z.object({
  partNumber: z.string().optional(),
  projectType: z.string().optional(),
  customerId: z.string().optional(),
});

/**
 * Pure similarity filter: returns all feedback records that match on any one
 * of the provided search fields (partNumber, projectType, customerId).
 */
function filterFeedbackByInput(
  records: QuoteExecutionFeedback[],
  input: { partNumber?: string; projectType?: string; customerId?: string },
): QuoteExecutionFeedback[] {
  return records.filter((r) => {
    if (input.partNumber && r.partNumber === input.partNumber) return true;
    if (input.projectType && r.projectType === input.projectType) return true;
    if (input.customerId && r.customerId === input.customerId) return true;
    return false;
  });
}

interface SuggestionSummary {
  avgLaborVariancePercent: number;
  avgActualLaborHours: number;
  overrunRisk: boolean;
  recommendedAdjustment: string;
}

/**
 * Pure aggregator: computes summary statistics from a list of matched records.
 * Returns null when the list is empty.
 */
function aggregateFeedback(matches: QuoteExecutionFeedback[]): SuggestionSummary | null {
  if (matches.length === 0) return null;

  const varianceValues = matches
    .map((r) => r.laborVariancePercent)
    .filter((v): v is number => v !== null && v !== undefined);

  const actualHoursValues = matches
    .map((r) => r.actualLaborHours)
    .filter((v): v is number => v !== null && v !== undefined);

  const avgLaborVariancePercent =
    varianceValues.length > 0
      ? varianceValues.reduce((sum, v) => sum + v, 0) / varianceValues.length
      : 0;

  const avgActualLaborHours =
    actualHoursValues.length > 0
      ? actualHoursValues.reduce((sum, v) => sum + v, 0) / actualHoursValues.length
      : 0;

  const overrunRisk = avgLaborVariancePercent > 10;

  let recommendedAdjustment: string;
  if (avgLaborVariancePercent > 20) {
    recommendedAdjustment = `Increase labor estimate by ~${Math.round(avgLaborVariancePercent)}% based on ${matches.length} similar project(s). High overrun risk detected.`;
  } else if (avgLaborVariancePercent > 10) {
    recommendedAdjustment = `Consider adding a ${Math.round(avgLaborVariancePercent)}% labor buffer based on ${matches.length} similar project(s).`;
  } else if (avgLaborVariancePercent > 0) {
    recommendedAdjustment = `Minor overruns observed (~${Math.round(avgLaborVariancePercent)}%) across ${matches.length} similar project(s). Current estimate appears reasonable.`;
  } else {
    recommendedAdjustment = `No significant overruns observed across ${matches.length} similar project(s). Current estimate appears reasonable.`;
  }

  return { avgLaborVariancePercent, avgActualLaborHours, overrunRisk, recommendedAdjustment };
}

// POST /api/quotes/suggestions
router.post('/api/quotes/suggestions', async (req: Request, res: Response) => {
  try {
    const parsed = suggestionsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.format() });
    }

    const input = parsed.data;

    if (!input.partNumber && !input.projectType && !input.customerId) {
      return res.status(400).json({ error: 'At least one of partNumber, projectType, or customerId is required' });
    }

    // Storage already performs OR-based DB-level filtering; results are the matches.
    const matches = await storage.getQuoteSuggestions(input);

    const summary = aggregateFeedback(matches);

    const risks: string[] = matches.flatMap((r) => {
      if (!r.keyRisks) return [];
      const raw = r.keyRisks as unknown;
      if (Array.isArray(raw)) return raw.map(String);
      return [];
    });

    const strengths: string[] = matches.flatMap((r) => {
      if (!r.strengths) return [];
      const raw = r.strengths as unknown;
      if (Array.isArray(raw)) return raw.map(String);
      return [];
    });

    const opportunities: string[] = matches.flatMap((r) => {
      if (!r.opportunities) return [];
      const raw = r.opportunities as unknown;
      if (Array.isArray(raw)) return raw.map(String);
      return [];
    });

    const recommendations: string[] = matches
      .map((r) => r.recommendedQuotingNotes)
      .filter((n): n is string => !!n);

    res.json({ matches, summary, risks, strengths, opportunities, recommendations });
  } catch (error) {
    console.error('Quote suggestions error:', error);
    res.status(500).json({ error: 'Failed to fetch quote suggestions' });
  }
});

export default router;
