import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  arInvoiceLines,
  arInvoices,
  chartOfAccounts,
  productionLineAccountingMap,
} from '../../schema';
import {
  createOrReplaceAccountingPosting,
  type AccountingPostingLineInput,
} from './accountingPostingService';
import { resolveRevenueAccountForProductionLine } from './productionLineAccounting';
import {
  classifyRevenueStream,
  type RevenueStreamClassification,
} from './revenueStreamClassifier';

type DbExecutor = typeof db | any;
type ArInvoice = typeof arInvoices.$inferSelect;
type ArInvoiceLine = typeof arInvoiceLines.$inferSelect;

function money(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function firstWith<K extends keyof ArInvoiceLine>(
  invoiceLines: ArInvoiceLine[],
  key: K,
): ArInvoiceLine[K] | null {
  return invoiceLines.find((line) => line[key] !== null && line[key] !== undefined)?.[key] ?? null;
}

export function classifyArInvoiceRevenueStream(
  invoice: ArInvoice,
  invoiceLines: ArInvoiceLine[],
): RevenueStreamClassification {
  const productionLines = new Set(invoiceLines.map((line) => String(line.productionLine || '').toUpperCase()));
  const hasP2Line = productionLines.has('P2');
  const hasP1Line = productionLines.has('P1');

  if (hasP2Line || invoice.packingSlipId || invoice.lotId || invoiceLines.some((line) => line.poItemId)) {
    return classifyRevenueStream({
      productionLine: 'P2',
      sourceTable: 'ar_invoices',
      packingSlipId: invoice.packingSlipId,
      p2PurchaseOrderId: firstWith(invoiceLines, 'poItemId') as number | null,
      terms: invoice.terms,
    });
  }

  if (hasP1Line || invoice.poId || invoice.poOverride) {
    return classifyRevenueStream({
      productionLine: 'P1',
      sourceTable: 'ar_invoices',
      p1PurchaseOrderId: invoice.poId || invoice.poOverride,
      terms: invoice.terms || 'NET_30',
    });
  }

  return classifyRevenueStream({
    productionLine: firstWith(invoiceLines, 'productionLine') as string | null,
    sourceTable: 'ar_invoices',
    terms: invoice.terms,
  });
}

export async function postArInvoiceAccounting({
  invoice,
  invoiceLines,
  user,
  tx,
}: {
  invoice: ArInvoice;
  invoiceLines: ArInvoiceLine[];
  user?: { username?: string | null } | string | null;
  tx: DbExecutor;
}) {
  const username = typeof user === 'string' ? user : user?.username ?? null;
  const total = money(invoice.totalAmount);
  const discount = money(invoice.discountAmount);
  const freight = money(invoice.freightAmount);
  const tax = money(invoice.taxAmount);
  const retainage = money(invoice.retainageAmount);
  const classification = classifyArInvoiceRevenueStream(invoice, invoiceLines);

  const allAccounts = await tx.select().from(chartOfAccounts);
  const revenueMaps = await tx
    .select()
    .from(productionLineAccountingMap)
    .where(eq(productionLineAccountingMap.active, true));

  const accountByNumber = (accountNumber: string) => allAccounts.find((a: any) => a.accountNumber === accountNumber);
  const accountByName = (accountName: string) => allAccounts.find((a: any) => a.accountName === accountName);
  const revenueAccountFallback = accountByNumber('41000') ?? accountByName('Product Revenue') ?? accountByName('Revenue - P2 Products');

  if (!accountByNumber('11000') && !accountByName('Accounts Receivable')) {
    throw new Error('Required chart-of-accounts entry not found: 11000 Accounts Receivable');
  }
  if (!revenueAccountFallback) {
    throw new Error('Required chart-of-accounts entry not found: 41000 Product Revenue');
  }
  if (retainage > 0 && !accountByNumber('11200')) {
    throw new Error('Retainage Receivable account not found in chart of accounts');
  }
  if (freight > 0 && !accountByNumber('43000')) {
    throw new Error('Shipping Income account not found in chart of accounts');
  }
  if (discount > 0 && !accountByNumber('49000')) {
    throw new Error('Discounts and Allowances account not found in chart of accounts');
  }
  if (tax > 0 && !accountByNumber('20500') && !accountByName('Sales Tax Payable')) {
    throw new Error('Sales Tax Payable account not found in chart of accounts');
  }

  const commonDimensions = {
    customerId: invoice.customerId,
    productionLine: invoiceLines.length === 1 ? invoiceLines[0].productionLine : 'MIXED',
    customerType: firstWith(invoiceLines, 'customerType') as string | null,
    projectId: firstWith(invoiceLines, 'projectId') as string | null,
    projectNameSnapshot: firstWith(invoiceLines, 'projectNameSnapshot') as string | null,
    salespersonUserId: firstWith(invoiceLines, 'salespersonUserId') as number | null,
    salespersonNameSnapshot: firstWith(invoiceLines, 'salespersonNameSnapshot') as string | null,
    csrUserId: firstWith(invoiceLines, 'csrUserId') as number | null,
    csrNameSnapshot: firstWith(invoiceLines, 'csrNameSnapshot') as string | null,
    allowability: 'ALLOWABLE',
    directIndirect: 'DIRECT',
    costPool: 'DIRECT',
    dimensionTags: {
      source: 'ar_invoice',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      revenueStream: classification.revenueStream,
      revenueRecognitionTiming: classification.recognitionTiming,
      revenuePaymentTerms: classification.paymentTerms,
      revenueClassificationReason: classification.reason,
    } as Record<string, unknown>,
  };

  const lines: AccountingPostingLineInput[] = [
    {
      ...commonDimensions,
      accountNumber: '11000',
      accountName: 'Accounts Receivable',
      debitAmount: total,
      creditAmount: 0,
    },
  ];

  if (discount > 0) {
    lines.push({
      ...commonDimensions,
      accountNumber: '49000',
      accountName: 'Discounts and Allowances',
      debitAmount: discount,
      creditAmount: 0,
    });
  }
  if (retainage > 0) {
    lines.push({
      ...commonDimensions,
      accountNumber: '11200',
      accountName: 'Retainage Receivable',
      debitAmount: retainage,
      creditAmount: 0,
    });
  }

  for (const line of invoiceLines) {
    const lineCredit = money(line.lineTotal);
    if (lineCredit <= 0) continue;

    const lineProductionLine = line.productionLine || 'MIGRATION_REVIEW';
    const lineRevenueAccount = resolveRevenueAccountForProductionLine({
      productionLine: lineProductionLine,
      accounts: allAccounts,
      revenueMaps,
      fallbackRevenueAccount: revenueAccountFallback,
    });
    lines.push({
      ...commonDimensions,
      accountNumber: lineRevenueAccount.accountNumber || '41000',
      accountName: lineRevenueAccount.accountName,
      debitAmount: 0,
      creditAmount: lineCredit,
      productionLine: lineProductionLine,
      projectId: nullable(line.projectId),
      projectNameSnapshot: nullable(line.projectNameSnapshot),
      salespersonUserId: nullable(line.salespersonUserId),
      salespersonNameSnapshot: nullable(line.salespersonNameSnapshot),
      csrUserId: nullable(line.csrUserId),
      csrNameSnapshot: nullable(line.csrNameSnapshot),
      customerType: nullable(line.customerType),
      inventoryItemId: nullable(line.inventoryItemId),
      partNumber: nullable(line.partNumber),
      dimensionTags: {
        ...commonDimensions.dimensionTags,
        ...(line.dimensionTags && typeof line.dimensionTags === 'object' ? line.dimensionTags : {}),
        arInvoiceLineId: line.id,
        lineDescription: line.description,
        revenueAccountNumber: lineRevenueAccount.accountNumber,
        revenueAccountName: lineRevenueAccount.accountName,
      },
    });
  }

  if (freight > 0) {
    lines.push({
      ...commonDimensions,
      accountNumber: '43000',
      accountName: 'Shipping Income',
      debitAmount: 0,
      creditAmount: freight,
    });
  }
  if (tax > 0) {
    lines.push({
      ...commonDimensions,
      accountNumber: '20500',
      accountName: 'Sales Tax Payable',
      debitAmount: 0,
      creditAmount: tax,
      directIndirect: 'UNASSIGNED',
      costPool: 'NONE',
    });
  }

  return createOrReplaceAccountingPosting(
    {
      transactionType: 'AR_INVOICE',
      referenceType: 'ar_invoice',
      referenceId: 0,
      referenceUuid: invoice.id,
      effectiveDate: invoice.invoiceDate,
      memo: `AR Invoice ${invoice.invoiceNumber} - ID: ${invoice.id}`,
      status: 'POSTED',
      sourceSystem: 'EPOCH',
      sourceDocumentType: 'AR_INVOICE',
      sourceDocumentNumber: invoice.invoiceNumber,
      postingMode: 'STANDARD',
      postedBy: username,
      createdBy: username,
      lines,
    },
    typeof user === 'string' ? { username: user } : user ?? null,
    tx,
  );
}
