import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  arInvoiceLines,
  arInvoices,
  p2Customers,
  p2DepositApplications,
  p2PurchaseOrders,
  projectClins,
  projects,
} from '../../schema';
import { createOrReplaceAccountingPosting } from './accountingPostingService';
import { reserveP2InvoiceNumber, recordP2InvoiceNumberAudit } from './p2InvoiceNumberService';

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateOnly(date);
}

function termsDays(terms: string): number {
  if (terms === 'DUE_ON_RECEIPT') return 0;
  if (terms === 'NET_15') return 15;
  if (terms === 'NET_45') return 45;
  if (terms === 'NET_60') return 60;
  return 30;
}

export async function getP2ProjectDepositWorkspace(projectId: string) {
  const [storedProject] = await db
    .select({
      id: projects.id,
      projectCode: projects.projectCode,
      projectName: projects.projectName,
      customerId: projects.customerId,
      customerName: projects.customerNameSnapshot,
      poId: projects.poId,
      poNumber: p2PurchaseOrders.poNumber,
      paymentTerms: p2Customers.paymentTerms,
    })
    .from(projects)
    .leftJoin(p2Customers, eq(projects.customerId, p2Customers.customerId))
    .leftJoin(p2PurchaseOrders, eq(projects.poId, p2PurchaseOrders.id))
    .where(eq(projects.id, projectId));

  if (!storedProject) throw new Error('Project not found');

  // P2 POs can be linked in either direction. Older/project-first records use
  // projects.po_id, while PO-first records use p2_purchase_orders.project_id.
  // Resolve the same current revision that the Project Hub displays so deposit
  // CLINs remain available even when only the PO-side association is populated.
  const effectivePoResult = await db.execute(sql`
    WITH linked_root AS (
      SELECT COALESCE(parent_po_id, id) AS root_id
        FROM p2_purchase_orders
       WHERE id = ${storedProject.poId ?? null}
    )
    SELECT po.id, po.po_number AS "poNumber"
      FROM p2_purchase_orders po
     WHERE po.project_id = ${projectId}::uuid
        OR po.id = (SELECT root_id FROM linked_root)
        OR po.parent_po_id = (SELECT root_id FROM linked_root)
     ORDER BY po.is_current_revision DESC,
              po.revision_number DESC,
              po.created_at DESC
     LIMIT 1
  `);
  const effectivePo = effectivePoResult.rows[0] as { id: number; poNumber: string } | undefined;
  const project = {
    ...storedProject,
    poId: effectivePo?.id ?? storedProject.poId,
    poNumber: effectivePo?.poNumber ?? storedProject.poNumber,
  };

  // Project deposits are created before shipping, so p2_billing_allocations may
  // not exist yet. Build the selectable CLIN list from the linked customer PO:
  // prefer explicit customer PO line numbers when billing allocations exist,
  // otherwise use the stable display order of the PO items.
  const poClinSource = project.poId ? await db.execute(sql`
    WITH explicit_clins AS (
      SELECT NULLIF(BTRIM(customer_po_line), '') AS "referenceKey",
             NULLIF(BTRIM(customer_po_line), '') AS "poLineNumber",
             NULL::text AS "customerClin",
             COALESCE(
               MAX(NULLIF(BTRIM(description), '')),
               MAX(NULLIF(BTRIM(bucket_label), ''))
             ) AS description,
             SUM(quantity_authorized::numeric * unit_price::numeric)::numeric AS "contractLineValue",
             1 AS source_priority
        FROM p2_billing_allocations
       WHERE po_id = ${project.poId}
         AND active = true
         AND NULLIF(BTRIM(customer_po_line), '') IS NOT NULL
       GROUP BY NULLIF(BTRIM(customer_po_line), '')
    ), po_item_clins AS (
      SELECT COALESCE(
               NULLIF(BTRIM(customer_po_line), ''),
               ROW_NUMBER() OVER (ORDER BY id)::text
             ) AS "referenceKey",
             COALESCE(
               NULLIF(BTRIM(customer_po_line), ''),
               ROW_NUMBER() OVER (ORDER BY id)::text
             ) AS "poLineNumber",
             NULLIF(BTRIM(customer_clin), '') AS "customerClin",
             CONCAT(part_number, CASE WHEN NULLIF(BTRIM(part_name), '') IS NOT NULL THEN ' - ' || part_name ELSE '' END) AS description,
             COALESCE(total_price::numeric, quantity::numeric * unit_price::numeric, 0)::numeric AS "contractLineValue",
             2 AS source_priority
        FROM p2_purchase_order_items
       WHERE po_id = ${project.poId}
    ), preferred_source AS (
      SELECT * FROM explicit_clins
      UNION ALL
      SELECT * FROM po_item_clins
       WHERE NOT EXISTS (SELECT 1 FROM explicit_clins)
    )
    SELECT "referenceKey", "poLineNumber", "customerClin", description, "contractLineValue"
      FROM preferred_source
     ORDER BY source_priority, "poLineNumber"
  `) : { rows: [] };

  for (const source of poClinSource.rows as Array<{ referenceKey: string; description: string | null }>) {
    await db.insert(projectClins).values({
      projectId,
      clinNumber: source.referenceKey,
      description: source.description,
      active: true,
    }).onConflictDoUpdate({
      target: [projectClins.projectId, projectClins.clinNumber],
      set: {
        description: source.description,
        active: true,
        updatedAt: new Date(),
      },
    });
  }

  const deposits = await db.execute(sql`
    SELECT ai.id, ai.invoice_number AS "invoiceNumber", ai.invoice_date AS "invoiceDate",
           ai.due_date AS "dueDate", ai.status, ai.total_amount::numeric AS "totalAmount",
           ai.customer_visible_notes AS "customerVisibleNotes",
           COALESCE((
             SELECT SUM(apa.amount_applied::numeric)
             FROM ar_payment_allocations apa
             JOIN ar_payments ap ON ap.id = apa.payment_id
             WHERE apa.invoice_id = ai.id AND COALESCE(ap.status, 'posted') = 'posted'
           ), 0)::numeric AS "paidAmount",
           COALESCE((
             SELECT SUM(pda.amount::numeric)
             FROM p2_deposit_applications pda
             WHERE pda.deposit_invoice_id = ai.id AND pda.status = 'POSTED'
           ), 0)::numeric AS "appliedAmount",
           GREATEST(
             COALESCE((SELECT SUM(apa.amount_applied::numeric) FROM ar_payment_allocations apa JOIN ar_payments ap ON ap.id = apa.payment_id WHERE apa.invoice_id = ai.id AND COALESCE(ap.status, 'posted') = 'posted'), 0)
             - COALESCE((SELECT SUM(pda.amount::numeric) FROM p2_deposit_applications pda WHERE pda.deposit_invoice_id = ai.id AND pda.status = 'POSTED'), 0),
             0
           )::numeric AS "availableAmount"
      FROM ar_invoices ai
     WHERE ai.project_id = ${projectId}::uuid
       AND ai.invoice_type = 'MATERIAL_DEPOSIT'
     ORDER BY ai.created_at DESC
  `);

  const finalInvoices = await db.execute(sql`
    SELECT DISTINCT ai.id, ai.invoice_number AS "invoiceNumber", ai.status,
           ai.total_amount::numeric AS "totalAmount",
           GREATEST(ai.total_amount::numeric
             - COALESCE((SELECT SUM(apa.amount_applied::numeric) FROM ar_payment_allocations apa JOIN ar_payments ap ON ap.id = apa.payment_id WHERE apa.invoice_id = ai.id AND COALESCE(ap.status, 'posted') = 'posted'), 0)
             - COALESCE((SELECT SUM(pda.amount::numeric) FROM p2_deposit_applications pda WHERE pda.final_invoice_id = ai.id AND pda.status = 'POSTED'), 0), 0)::numeric AS balance
      FROM ar_invoices ai
      LEFT JOIN ar_invoice_lines ail ON ail.invoice_id = ai.id
     WHERE ai.customer_id = ${project.customerId}
       AND COALESCE(ai.invoice_type, 'STANDARD') = 'STANDARD'
       AND ai.status IN ('POSTED', 'SENT')
       AND (
         ai.project_id = ${projectId}::uuid
         OR ail.project_id = ${projectId}
         OR (${project.poId ?? null}::integer IS NOT NULL AND ai.po_id = ${project.poId ? String(project.poId) : null})
       )
     ORDER BY ai.invoice_number
  `);

  const storedClins = await db
    .select({
      id: projectClins.id,
      clinNumber: projectClins.clinNumber,
      description: projectClins.description,
    })
    .from(projectClins)
    .where(and(eq(projectClins.projectId, projectId), eq(projectClins.active, true)));

  const poLineSources = new Map(
    (poClinSource.rows as Array<{ referenceKey: string; poLineNumber: string; customerClin: string | null; contractLineValue: string | number | null }>)
      .map((source) => [source.referenceKey, source])
  );
  const clins = storedClins.map((clin) => {
    const source = poLineSources.get(clin.clinNumber);
    return {
      ...clin,
      poLineNumber: source?.poLineNumber ?? clin.clinNumber,
      customerClin: source?.customerClin ?? null,
      contractLineValue: source ? money(source.contractLineValue) : null,
    };
  });

  return { project, deposits: deposits.rows, finalInvoices: finalInvoices.rows, clins };
}

type DepositClinAllocation = {
  clinId: number;
  customerClin?: string | null;
  amount: number;
  calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE';
  percentage?: number | null;
  contractLineValue?: number | null;
  description?: string | null;
};

export async function createP2MaterialDepositInvoice(input: {
  projectId: string;
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  terms?: string;
  poReference?: string | null;
  description?: string;
  depositPurpose?: string;
  customerVisibleNotes?: string | null;
  pointOfContactName?: string | null;
  pointOfContactPhone?: string | null;
  pointOfContactEmail?: string | null;
  clinAllocations?: DepositClinAllocation[];
  internalReason: string;
  createdBy?: string | null;
}) {
  const workspace = await getP2ProjectDepositWorkspace(input.projectId);
  const requestedAllocations = input.clinAllocations || [];
  const amount = money(requestedAllocations.length
    ? requestedAllocations.reduce((sum, allocation) => sum + money(allocation.amount), 0)
    : input.amount);
  if (amount <= 0) throw new Error('Deposit amount must be greater than zero');
  if (!input.internalReason?.trim()) throw new Error('An internal audit reason is required');

  const invoiceDate = input.invoiceDate || dateOnly(new Date());
  const terms = input.terms || workspace.project.paymentTerms || 'NET_30';
  const dueDate = input.dueDate || addDays(invoiceDate, termsDays(terms));
  const availableClins = new Map(workspace.clins.map((clin) => [clin.id, clin]));
  if (new Set(requestedAllocations.map((allocation) => allocation.clinId)).size !== requestedAllocations.length) {
    throw new Error('Each PO line may only appear once on a material deposit invoice');
  }
  const allocations = requestedAllocations.map((allocation) => {
    const clin = availableClins.get(allocation.clinId);
    if (!clin) throw new Error(`PO line ${allocation.clinId} is not active on this project`);
    const allocationAmount = money(allocation.amount);
    if (allocationAmount <= 0) throw new Error(`Deposit amount for PO line ${clin.poLineNumber} must be greater than zero`);
    if (allocation.calculationMethod === 'PERCENTAGE') {
      const percentage = Number(allocation.percentage || 0);
      const contractLineValue = money(clin.contractLineValue ?? allocation.contractLineValue);
      if (percentage <= 0 || percentage > 100 || contractLineValue <= 0) {
        throw new Error(`PO line ${clin.poLineNumber} requires a line value and percentage between 0 and 100`);
      }
      if (money(contractLineValue * percentage / 100) !== allocationAmount) {
        throw new Error(`PO line ${clin.poLineNumber} percentage calculation does not match its deposit amount`);
      }
    }
    return {
      ...allocation,
      amount: allocationAmount,
      contractLineValue: allocation.calculationMethod === 'PERCENTAGE'
        ? money(clin.contractLineValue ?? allocation.contractLineValue)
        : null,
      clin,
    };
  });
  const reservation = await reserveP2InvoiceNumber({
    customerId: workspace.project.customerId,
    customerName: workspace.project.customerName || workspace.project.customerId,
  });

  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(arInvoices).values({
      customerId: workspace.project.customerId,
      invoiceNumber: reservation.invoiceNumber,
      invoiceDate,
      dueDate,
      terms,
      poId: workspace.project.poId ? String(workspace.project.poId) : null,
      poOverride: input.poReference || workspace.project.poNumber || null,
      subtotal: amount.toFixed(2),
      discountAmount: '0',
      freightAmount: '0',
      taxAmount: '0',
      retainagePercent: '0',
      retainageAmount: '0',
      totalAmount: amount.toFixed(2),
      status: 'REVIEW',
      invoiceType: 'MATERIAL_DEPOSIT',
      projectId: input.projectId,
      depositPurpose: input.depositPurpose?.trim() || 'MATERIAL',
      pointOfContactName: input.pointOfContactName?.trim() || 'Glenn Jones',
      pointOfContactPhone: input.pointOfContactPhone?.trim() || '(256) 797-5405',
      pointOfContactEmail: input.pointOfContactEmail?.trim() || 'glenn.jones@agadvanced.com',
      autoCreated: false,
      customerVisibleNotes: input.customerVisibleNotes || null,
      internalNotes: `Material deposit for ${workspace.project.projectCode}. ${input.internalReason.trim()}`,
      createdBy: input.createdBy || null,
    }).returning();

    const invoiceLines = allocations.length ? allocations.map((allocation) => ({
      invoiceId: invoice.id,
      productionLine: 'P2',
      projectId: input.projectId,
      projectNameSnapshot: workspace.project.projectName,
      description: allocation.description?.trim() || allocation.clin.description || input.description?.trim() || `Material deposit - PO Line ${allocation.clin.poLineNumber}`,
      qty: '1',
      unitPrice: allocation.amount.toFixed(2),
      lineTotal: allocation.amount.toFixed(2),
      dimensionTags: {
        source: 'p2_material_deposit',
        invoiceType: 'MATERIAL_DEPOSIT',
        depositPurpose: input.depositPurpose?.trim() || 'MATERIAL',
        projectId: input.projectId,
        projectCode: workspace.project.projectCode,
        poLineId: allocation.clin.id,
        poLineNumber: allocation.clin.poLineNumber,
        clinNumber: allocation.customerClin?.trim() || allocation.clin.customerClin || null,
        calculationMethod: allocation.calculationMethod,
        percentage: allocation.percentage ?? null,
        contractLineValue: allocation.contractLineValue ?? null,
      },
    })) : [{
      invoiceId: invoice.id,
      productionLine: 'P2',
      projectId: input.projectId,
      projectNameSnapshot: workspace.project.projectName,
      description: input.description?.trim() || `Material deposit - ${workspace.project.projectCode} ${workspace.project.projectName}`,
      qty: '1',
      unitPrice: amount.toFixed(2),
      lineTotal: amount.toFixed(2),
      dimensionTags: { source: 'p2_material_deposit', invoiceType: 'MATERIAL_DEPOSIT', depositPurpose: input.depositPurpose?.trim() || 'MATERIAL', projectId: input.projectId, projectCode: workspace.project.projectCode },
    }];
    await tx.insert(arInvoiceLines).values(invoiceLines);

    return invoice;
  });

  await recordP2InvoiceNumberAudit({
    invoiceId: result.id,
    customerId: result.customerId,
    newInvoiceNumber: result.invoiceNumber,
    action: 'RESERVE_FOR_PROJECT_DEPOSIT',
    reason: input.internalReason,
    changedBy: input.createdBy || 'system',
    metadata: { projectId: input.projectId, purpose: input.depositPurpose?.trim() || 'MATERIAL', amount, poLineAllocations: allocations.map((allocation) => ({ poLineId: allocation.clin.id, poLineNumber: allocation.clin.poLineNumber, clinNumber: allocation.customerClin?.trim() || allocation.clin.customerClin || null, amount: allocation.amount, calculationMethod: allocation.calculationMethod })) },
  });

  return result;
}

async function invoiceAmounts(tx: any, invoiceId: string) {
  const result = await tx.execute(sql`
    SELECT ai.total_amount::numeric AS total,
           COALESCE((SELECT SUM(apa.amount_applied::numeric) FROM ar_payment_allocations apa JOIN ar_payments ap ON ap.id = apa.payment_id WHERE apa.invoice_id = ai.id AND COALESCE(ap.status, 'posted') = 'posted'), 0)::numeric AS paid,
           COALESCE((SELECT SUM(pda.amount::numeric) FROM p2_deposit_applications pda WHERE pda.deposit_invoice_id = ai.id AND pda.status = 'POSTED'), 0)::numeric AS used,
           COALESCE((SELECT SUM(pda.amount::numeric) FROM p2_deposit_applications pda WHERE pda.final_invoice_id = ai.id AND pda.status = 'POSTED'), 0)::numeric AS deposit_applied
      FROM ar_invoices ai WHERE ai.id = ${invoiceId}::uuid
  `);
  return result.rows[0] || { total: 0, paid: 0, used: 0, deposit_applied: 0 };
}

export async function applyP2ProjectDeposit(input: {
  depositInvoiceId: string;
  finalInvoiceId: string;
  amount: number;
  reason: string;
  appliedBy?: string | null;
}, existingTx?: any) {
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Application amount must be greater than zero');
  if (!input.reason?.trim()) throw new Error('An audit reason is required');

  const applyInTransaction = async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('p2-deposit-application'), hashtext(${input.depositInvoiceId}))`);
    const [deposit] = await tx.select().from(arInvoices).where(eq(arInvoices.id, input.depositInvoiceId));
    const [finalInvoice] = await tx.select().from(arInvoices).where(eq(arInvoices.id, input.finalInvoiceId));
    if (!deposit || deposit.invoiceType !== 'MATERIAL_DEPOSIT') throw new Error('Material deposit invoice not found');
    if (!finalInvoice || finalInvoice.invoiceType === 'MATERIAL_DEPOSIT') throw new Error('Final shipment invoice not found');
    if (deposit.customerId !== finalInvoice.customerId) throw new Error('Deposit and final invoice must belong to the same customer');
    if (!deposit.projectId) throw new Error('Deposit invoice is not linked to a project');
    if (['VOID', 'DRAFT', 'REVIEW'].includes(deposit.status)) throw new Error('Deposit invoice must be posted and paid before it can be applied');
    if (!['POSTED', 'SENT'].includes(finalInvoice.status)) {
      throw new Error('The final shipment invoice must be posted before a deposit can be applied');
    }

    const depositAmounts = await invoiceAmounts(tx, deposit.id);
    const finalAmounts = await invoiceAmounts(tx, finalInvoice.id);
    const available = money(depositAmounts.paid) - money(depositAmounts.used);
    const finalBalance = money(finalAmounts.total) - money(finalAmounts.paid) - money(finalAmounts.deposit_applied);
    if (amount > available + 0.005) throw new Error(`Application exceeds available paid deposit balance of $${available.toFixed(2)}`);
    if (amount > finalBalance + 0.005) throw new Error(`Application exceeds final invoice balance of $${finalBalance.toFixed(2)}`);

    const applicationId = randomUUID();
    const [application] = await tx.insert(p2DepositApplications).values({
      id: applicationId,
      depositInvoiceId: deposit.id,
      finalInvoiceId: finalInvoice.id,
      projectId: deposit.projectId,
      amount: amount.toFixed(2),
      reason: input.reason.trim(),
      appliedBy: input.appliedBy || null,
    }).returning();

    const posting = await createOrReplaceAccountingPosting({
      transactionType: 'P2_DEPOSIT_APPLICATION',
      referenceType: 'p2_deposit_application',
      referenceId: 0,
      referenceUuid: applicationId,
      effectiveDate: new Date().toISOString().slice(0, 10),
      memo: `Apply deposit ${deposit.invoiceNumber} to invoice ${finalInvoice.invoiceNumber}`,
      status: 'POSTED',
      sourceSystem: 'EPOCH',
      sourceDocumentType: 'P2_DEPOSIT_APPLICATION',
      sourceDocumentNumber: applicationId,
      postingMode: 'STANDARD',
      postedBy: input.appliedBy || null,
      createdBy: input.appliedBy || null,
      lines: [
        { accountNumber: '20600', accountName: 'Customer Deposits', debitAmount: amount, creditAmount: 0, customerId: deposit.customerId, projectId: deposit.projectId, productionLine: 'P2', dimensionTags: { source: 'p2_deposit_application', depositInvoiceId: deposit.id, finalInvoiceId: finalInvoice.id } },
        { accountNumber: '11000', accountName: 'Accounts Receivable', debitAmount: 0, creditAmount: amount, customerId: deposit.customerId, projectId: deposit.projectId, productionLine: 'P2', dimensionTags: { source: 'p2_deposit_application', depositInvoiceId: deposit.id, finalInvoiceId: finalInvoice.id } },
      ],
    }, { username: input.appliedBy || 'system' }, tx);

    await tx.update(p2DepositApplications).set({ journalEntryId: posting.journalEntryId }).where(eq(p2DepositApplications.id, applicationId));
    if (amount >= finalBalance - 0.005) {
      await tx.update(arInvoices).set({ status: 'PAID', updatedAt: new Date() }).where(eq(arInvoices.id, finalInvoice.id));
    }
    return { ...application, journalEntryId: posting.journalEntryId };
  };

  return existingTx ? applyInTransaction(existingTx) : db.transaction(applyInTransaction);
}
