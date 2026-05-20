export type AccountingEventStatus = 'IMPLEMENTED' | 'PARTIAL' | 'GAP' | 'NON_POSTING';

export type AccountingEventRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AccountingEventMatrixRow = {
  id: string;
  domain: string;
  sourceEvent: string;
  sourceTables: string[];
  postingTrigger: string;
  gaapTreatment: string;
  debitAccounts: string[];
  creditAccounts: string[];
  journalTransactionType: string | null;
  journalReferenceType: string | null;
  implementationStatus: AccountingEventStatus;
  risk: AccountingEventRisk;
  evidence: string[];
  nextControlAction: string;
};

export const accountingEventMatrix = [
  {
    id: 'AR_INVOICE_POSTED',
    domain: 'Revenue / AR',
    sourceEvent: 'Customer invoice is posted',
    sourceTables: ['ar_invoices', 'ar_invoice_lines'],
    postingTrigger: 'Invoice status changes to POSTED',
    gaapTreatment: 'Recognize receivable and earned revenue when the invoice is posted.',
    debitAccounts: ['Accounts Receivable'],
    creditAccounts: ['Product Revenue', 'Shipping Income', 'Retainage Receivable when applicable'],
    journalTransactionType: 'AR_INVOICE',
    journalReferenceType: 'ar_invoice',
    implementationStatus: 'IMPLEMENTED',
    risk: 'LOW',
    evidence: ['server/src/routes/arInvoices.ts'],
    nextControlAction: 'Verify line-level revenue account mapping for discounts, freight, retainage, and product categories.',
  },
  {
    id: 'AR_INVOICE_VOIDED',
    domain: 'Revenue / AR',
    sourceEvent: 'Posted customer invoice is voided',
    sourceTables: ['ar_invoices', 'journal_entries', 'journal_lines'],
    postingTrigger: 'Invoice status changes to VOID after posting',
    gaapTreatment: 'Reverse the original invoice journal entry rather than deleting the posted accounting history.',
    debitAccounts: ['Original revenue accounts'],
    creditAccounts: ['Accounts Receivable'],
    journalTransactionType: 'AR_INVOICE_REVERSAL',
    journalReferenceType: 'ar_invoice',
    implementationStatus: 'IMPLEMENTED',
    risk: 'LOW',
    evidence: ['server/src/routes/arInvoices.ts'],
    nextControlAction: 'Confirm reversals preserve source document number and reversal link for account-register drillback.',
  },
  {
    id: 'AR_PAYMENT_RECEIVED',
    domain: 'Cash / AR',
    sourceEvent: 'Customer AR payment is received and allocated',
    sourceTables: ['ar_payments', 'ar_payment_allocations', 'ar_invoices'],
    postingTrigger: 'Payment is created or allocated to one or more invoices',
    gaapTreatment: 'Increase customer payment clearing and reduce accounts receivable; bank reconciliation later clears payment-level detail to the bank account.',
    debitAccounts: ['Customer Payment Clearing'],
    creditAccounts: ['Accounts Receivable'],
    journalTransactionType: 'AR_PAYMENT',
    journalReferenceType: 'ar_payment',
    implementationStatus: 'IMPLEMENTED',
    risk: 'MEDIUM',
    evidence: ['server/src/routes/arPayments.ts', 'server/src/services/arPaymentPostingService.ts'],
    nextControlAction: 'Add bank reconciliation matching from Customer Payment Clearing to Bank Checking or processor settlement accounts.',
  },
  {
    id: 'P1_CUSTOMER_PAYMENT_RECEIVED',
    domain: 'Cash / Customer Deposits',
    sourceEvent: 'P1 customer payment is saved',
    sourceTables: ['payments', 'all_orders', 'customers'],
    postingTrigger: 'P1 payment is created or updated',
    gaapTreatment: 'Record individually traceable customer payment clearing and recognize the customer deposit liability until later fulfillment, invoicing, or reconciliation clears it.',
    debitAccounts: ['Customer Payment Clearing'],
    creditAccounts: ['Customer Deposits'],
    journalTransactionType: 'P1_CUSTOMER_PAYMENT',
    journalReferenceType: 'p1_payment',
    implementationStatus: 'IMPLEMENTED',
    risk: 'MEDIUM',
    evidence: ['server/src/services/p1PaymentPostingService.ts', 'server/src/routes/payments.ts', 'server/src/routes/orders.ts'],
    nextControlAction: 'Define deposit application on shipment/invoice and bank reconciliation settlement from Customer Payment Clearing.',
  },
  {
    id: 'AR_CREDIT_MEMO_ISSUED',
    domain: 'Revenue / AR',
    sourceEvent: 'Credit memo is issued against a posted invoice',
    sourceTables: ['credit_memos', 'ar_invoices'],
    postingTrigger: 'Credit memo is created',
    gaapTreatment: 'Reduce revenue or record contra revenue, and reduce accounts receivable.',
    debitAccounts: ['Discounts and Allowances or Product Revenue'],
    creditAccounts: ['Accounts Receivable'],
    journalTransactionType: 'AR_CREDIT_MEMO',
    journalReferenceType: 'credit_memo',
    implementationStatus: 'PARTIAL',
    risk: 'HIGH',
    evidence: ['server/src/routes/creditMemos.ts'],
    nextControlAction: 'Fix account lookup to current COA seed and classify credit reasons to contra revenue vs revenue reversal.',
  },
  {
    id: 'CUSTOMER_REFUND_ISSUED',
    domain: 'Cash / AR',
    sourceEvent: 'Customer refund is approved or paid',
    sourceTables: ['refunds', 'payments', 'credit_memos'],
    postingTrigger: 'Refund payment is issued',
    gaapTreatment: 'Reduce cash and clear customer credit, deposit liability, or receivable balance.',
    debitAccounts: ['Customer Deposits or Accounts Receivable'],
    creditAccounts: ['Bank Checking'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'HIGH',
    evidence: ['server/src/routes/refunds.ts'],
    nextControlAction: 'Map refund source to liability, AR, or credit memo before posting cash reduction.',
  },
  {
    id: 'VENDOR_BILL_RECORDED',
    domain: 'Purchasing / AP',
    sourceEvent: 'Vendor invoice or bill is recorded from PO/receipt',
    sourceTables: ['vendor_pos', 'vendor_po_items', 'received_units'],
    postingTrigger: 'Vendor invoice is matched and approved',
    gaapTreatment: 'Recognize expense or inventory and accounts payable when the obligation is incurred.',
    debitAccounts: ['Inventory - Raw Materials', 'Direct Materials', 'Manufacturing Overhead', 'G&A Expenses'],
    creditAccounts: ['Accounts Payable'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'CRITICAL',
    evidence: ['server/src/routes/vendorPOs.ts', 'server/src/routes/receiving.ts'],
    nextControlAction: 'Introduce vendor bill/AP posting from three-way match: PO, receipt, and vendor invoice.',
  },
  {
    id: 'VENDOR_PAYMENT_MADE',
    domain: 'Purchasing / AP',
    sourceEvent: 'Vendor bill is paid',
    sourceTables: ['vendor_pos'],
    postingTrigger: 'Payment is issued against an approved vendor bill',
    gaapTreatment: 'Reduce accounts payable and cash.',
    debitAccounts: ['Accounts Payable'],
    creditAccounts: ['Bank Checking'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'HIGH',
    evidence: ['server/src/routes/vendorPOs.ts'],
    nextControlAction: 'Create AP payment source table or extend vendor bill workflow before posting cash disbursement.',
  },
  {
    id: 'INVENTORY_RECEIVED',
    domain: 'Inventory / AP',
    sourceEvent: 'Purchased inventory is received',
    sourceTables: ['inventory_transactions', 'inventory_transaction_ledger', 'material_lots', 'received_units'],
    postingTrigger: 'Receipt is accepted into inventory',
    gaapTreatment: 'Capitalize received materials to inventory when title/receipt criteria are met; accrue AP or GRNI if invoice is not present.',
    debitAccounts: ['Inventory - Raw Materials'],
    creditAccounts: ['Accounts Payable or Accrued Expenses'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'CRITICAL',
    evidence: ['server/src/routes/receiving.ts', 'server/src/routes/materialLots.ts', 'server/src/services/inventoryTransactionLedgerService.ts'],
    nextControlAction: 'Decide receipt accounting policy: post receipt accrual immediately or wait for vendor bill match.',
  },
  {
    id: 'INVENTORY_ISSUED_TO_PRODUCTION',
    domain: 'Inventory / Production',
    sourceEvent: 'Material is issued or consumed to a traveler/work order',
    sourceTables: ['inventory_transaction_ledger', 'material_lots', 'labor_allocations'],
    postingTrigger: 'Material issue or consumption is confirmed',
    gaapTreatment: 'Move material value from raw material inventory to WIP or COGS depending on production costing policy.',
    debitAccounts: ['Inventory - Work in Process or Direct Materials'],
    creditAccounts: ['Inventory - Raw Materials'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'CRITICAL',
    evidence: ['server/src/services/materialIssueService.ts', 'server/src/routes/materialLots.ts'],
    nextControlAction: 'Add item valuation source and production cost destination before GL posting.',
  },
  {
    id: 'INVENTORY_ADJUSTMENT_POSTED',
    domain: 'Inventory / Controls',
    sourceEvent: 'Cycle count, scrap, or inventory adjustment is approved',
    sourceTables: ['inventory_transaction_ledger', 'cycle_counts'],
    postingTrigger: 'Adjustment passes approval threshold',
    gaapTreatment: 'Adjust inventory to actual quantity and record offset to inventory adjustment expense or variance.',
    debitAccounts: ['Inventory - Raw Materials or Inventory Adjustments'],
    creditAccounts: ['Inventory - Raw Materials or Inventory Adjustments'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'HIGH',
    evidence: ['server/src/services/cycleCountService.ts', 'server/src/services/inventoryApprovalExecutor.ts'],
    nextControlAction: 'Post only approved adjustments and require variance reason/documentation on material adjustments.',
  },
  {
    id: 'LABOR_COST_POSTED',
    domain: 'Payroll / Cost Accounting',
    sourceEvent: 'Approved labor costs are posted for a payroll/accounting period',
    sourceTables: ['labor_cost_records', 'labor_posting_runs', 'journal_entries', 'journal_lines'],
    postingTrigger: 'Accounting posts a labor posting run',
    gaapTreatment: 'Record direct, overhead, or G&A labor expense and accrued payroll liability.',
    debitAccounts: ['Direct Labor Expense', 'Overhead Labor', 'G&A Labor'],
    creditAccounts: ['Accrued Payroll'],
    journalTransactionType: 'LABOR_COST',
    journalReferenceType: 'labor_posting_run',
    implementationStatus: 'IMPLEMENTED',
    risk: 'MEDIUM',
    evidence: ['server/src/services/laborPostingService.ts'],
    nextControlAction: 'Confirm labor entries are promoted from DRAFT to POSTED only through accounting close controls.',
  },
  {
    id: 'EMPLOYEE_REIMBURSEMENT_APPROVED',
    domain: 'Expenses / AP',
    sourceEvent: 'Employee reimbursement, petty cash, or owner expense is approved',
    sourceTables: ['accounting_expense_transactions'],
    postingTrigger: 'Expense transaction reaches APPROVED or PAID',
    gaapTreatment: 'Recognize expense and employee/owner payable, or cash reduction if already paid by company funds.',
    debitAccounts: ['Mapped expense account'],
    creditAccounts: ['Accrued Expenses, Accounts Payable, Owner Capital, or Bank Checking'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'HIGH',
    evidence: ['server/src/routes/accountingControl.ts', 'migrations/0103_accounting_control_center.sql'],
    nextControlAction: 'Add GL posting when DCAA/allowability review and COA assignment are complete.',
  },
  {
    id: 'OPENING_BALANCE_MIGRATION',
    domain: 'Migration / Equity',
    sourceEvent: 'Historical QBO balances are imported or adjusted',
    sourceTables: ['journal_entries', 'journal_lines'],
    postingTrigger: 'Accounting admin imports opening balances',
    gaapTreatment: 'Load historical balances into real accounts with offset to opening balance equity until reconciled.',
    debitAccounts: ['Migrated debit-balance accounts'],
    creditAccounts: ['Migrated credit-balance accounts', 'Opening Balance Equity'],
    journalTransactionType: null,
    journalReferenceType: null,
    implementationStatus: 'GAP',
    risk: 'CRITICAL',
    evidence: ['migrations/0124_chart_of_accounts_foundation.sql'],
    nextControlAction: 'Create controlled migration import with batch id, supporting file, and trial-balance tie-out.',
  },
] satisfies AccountingEventMatrixRow[];

export function getAccountingEventMatrix(): AccountingEventMatrixRow[] {
  return accountingEventMatrix.map((row) => ({ ...row }));
}

export function summarizeAccountingEventMatrix(rows: AccountingEventMatrixRow[] = accountingEventMatrix) {
  const byStatus = rows.reduce<Record<AccountingEventStatus, number>>(
    (summary, row) => {
      summary[row.implementationStatus] += 1;
      return summary;
    },
    { IMPLEMENTED: 0, PARTIAL: 0, GAP: 0, NON_POSTING: 0 },
  );

  const byRisk = rows.reduce<Record<AccountingEventRisk, number>>(
    (summary, row) => {
      summary[row.risk] += 1;
      return summary;
    },
    { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
  );

  const criticalGaps = rows.filter((row) => row.implementationStatus === 'GAP' && row.risk === 'CRITICAL');

  return {
    totalEvents: rows.length,
    byStatus,
    byRisk,
    criticalGaps,
  };
}
