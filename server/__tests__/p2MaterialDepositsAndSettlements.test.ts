import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('P2 material deposits and customer payment settlements', () => {
  const migration = read('migrations/0285_p2_material_deposits_and_payment_settlements.sql');
  const invoicePosting = read('server/src/services/arInvoicePostingService.ts');
  const depositService = read('server/src/services/p2ProjectDepositService.ts');
  const settlementService = read('server/src/services/paymentSettlementService.ts');
  const invoicePdf = read('server/utils/pdf/arInvoicePdf.ts');

  it('uses an additive migration accepted by the safety scanner', () => {
    expect(() => runMigrationSafetyCheck(migration, '0285_p2_material_deposits_and_payment_settlements.sql')).not.toThrow();
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS p2_deposit_applications/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ar_payment_settlements/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ar_payment_settlement_items/i);
  });

  it('posts deposit invoices and applications through Customer Deposits', () => {
    expect(invoicePosting).toContain("invoice.invoiceType === 'MATERIAL_DEPOSIT'");
    expect(invoicePosting).toContain("accountByNumber('20600')");
    expect(depositService).toContain("transactionType: 'P2_DEPOSIT_APPLICATION'");
    expect(depositService).toContain("accountNumber: '20600'");
    expect(depositService).toContain("accountNumber: '11000'");
  });

  it('clears gross payments to bank net of fees', () => {
    expect(settlementService).toContain("accountNumber: '10100'");
    expect(settlementService).toContain("accountNumber: '77000'");
    expect(settlementService).toContain("accountNumber: '10300'");
    expect(settlementService).toContain('Net deposit must equal gross payments minus fees');
  });

  it('labels a deposit PDF distinctly from a shipment invoice', () => {
    expect(invoicePdf).toContain("isMaterialDeposit ? 'MATERIAL DEPOSIT' : 'INVOICE'");
    expect(invoicePdf).toContain("['Project:', String(invoice.projectCode || 'N/A')]");
  });
});
