import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('vendorPOReceiptAccountingService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/vendorPOReceiptAccountingService.ts'),
    'utf8',
  );

  it('posts vendor PO receipts through the GRNI accrual policy', () => {
    expect(source).toContain("transactionType: 'INVENTORY_RECEIPT_ACCRUAL'");
    expect(source).toContain("referenceType: 'vendor_po_receipt'");
    expect(source).toContain("sourceDocumentType: 'VENDOR_PO_RECEIPT'");
  });

  it('debits raw material inventory and credits GRNI', () => {
    expect(source).toContain("getRequiredAccount(tx, '12000', 'Inventory - Raw Materials')");
    expect(source).toContain("getRequiredAccount(tx, '21100', 'GRNI - Received Not Invoiced')");
    expect(source).toContain('accountId: rawMaterialsInventory.id');
    expect(source).toContain('accountId: grni.id');
  });

  it('keys receipt accruals by PO line and cumulative received quantity', () => {
    expect(source).toContain('const receiptKey = `${line.id}:${input.cumulativeReceivedQuantity}`');
    expect(source).toContain('eq(journalEntries.sourceDocumentNumber, receiptKey)');
  });
});
