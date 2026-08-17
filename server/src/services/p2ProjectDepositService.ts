import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  arInvoiceLines,
  arInvoices,
  p2Customers,
  p2DepositApplications,
  p2PurchaseOrders,
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
  if (terms === 'NET_15') return 15;
  if (terms === 'NET_60') return 60;
  return 30;
}

export async function getP2ProjectDepositWorkspace(projectId: string) {
  const [project] = await db
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

  if (!project) throw new Error('Project not found');

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
       AND ai.status NOT IN ('VOID', 'DRAFT')
       AND (
         ai.project_id = ${projectId}::uuid
         OR ail.project_id = ${projectId}
         OR (${project.poId ?? null}::integer IS NOT NULL AND ai.po_id = ${project.poId ? String(project.poId) : null})
       )
     ORDER BY ai.invoice_number
  `);

  return { project, deposits: deposits.rows, finalInvoices: finalInvoices.rows };
}

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
  internalReason: string;
  createdBy?: string | null;
}) {
  const workspace = await getP2ProjectDepositWorkspace(input.projectId);
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Deposit amount must be greater than zero');
  if (!input.internalReason?.trim()) throw new Error('An internal audit reason is required');

  const invoiceDate = input.invoiceDate || dateOnly(new Date());
  const terms = input.terms || workspace.project.paymentTerms || 'NET_30';
  const dueDate = input.dueDate || addDays(invoiceDate, termsDays(terms));
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
      autoCreated: false,
      customerVisibleNotes: input.customerVisibleNotes || null,
      internalNotes: `Material deposit for ${workspace.project.projectCode}. ${input.internalReason.trim()}`,
      createdBy: input.createdBy || null,
    }).returning();

    await tx.insert(arInvoiceLines).values({
      invoiceId: invoice.id,
      productionLine: 'P2',
      projectId: input.projectId,
      projectNameSnapshot: workspace.project.projectName,
      description: input.description?.trim() || `Material deposit - ${workspace.project.projectCode} ${workspace.project.projectName}`,
      qty: '1',
      unitPrice: amount.toFixed(2),
      lineTotal: amount.toFixed(2),
      dimensionTags: {
        source: 'p2_material_deposit',
        invoiceType: 'MATERIAL_DEPOSIT',
        depositPurpose: input.depositPurpose?.trim() || 'MATERIAL',
        projectId: input.projectId,
        projectCode: workspace.project.projectCode,
      },
    });

    return invoice;
  });

  await recordP2InvoiceNumberAudit({
    invoiceId: result.id,
    customerId: result.customerId,
    newInvoiceNumber: result.invoiceNumber,
    action: 'RESERVE_FOR_PROJECT_DEPOSIT',
    reason: input.internalReason,
    changedBy: input.createdBy || 'system',
    metadata: { projectId: input.projectId, purpose: input.depositPurpose?.trim() || 'MATERIAL', amount },
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
}) {
  const amount = money(input.amount);
  if (amount <= 0) throw new Error('Application amount must be greater than zero');
  if (!input.reason?.trim()) throw new Error('An audit reason is required');

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('p2-deposit-application'), hashtext(${input.depositInvoiceId}))`);
    const [deposit] = await tx.select().from(arInvoices).where(eq(arInvoices.id, input.depositInvoiceId));
    const [finalInvoice] = await tx.select().from(arInvoices).where(eq(arInvoices.id, input.finalInvoiceId));
    if (!deposit || deposit.invoiceType !== 'MATERIAL_DEPOSIT') throw new Error('Material deposit invoice not found');
    if (!finalInvoice || finalInvoice.invoiceType === 'MATERIAL_DEPOSIT') throw new Error('Final shipment invoice not found');
    if (deposit.customerId !== finalInvoice.customerId) throw new Error('Deposit and final invoice must belong to the same customer');
    if (!deposit.projectId) throw new Error('Deposit invoice is not linked to a project');
    if (['VOID', 'DRAFT', 'REVIEW'].includes(deposit.status)) throw new Error('Deposit invoice must be posted and paid before it can be applied');
    if (finalInvoice.status === 'VOID') throw new Error('Cannot apply a deposit to a voided invoice');

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
  });
}
