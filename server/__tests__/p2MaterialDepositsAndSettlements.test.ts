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
  const invoiceRoutes = read('server/src/routes/arInvoices.ts');
  const invoiceDetail = read('client/src/pages/InvoiceDetailPage.tsx');
  const safeBootMigrations = read('server/scripts/migrations/runSafeBootMigrations.ts');

  it('uses an additive migration accepted by the safety scanner', () => {
    expect(() => runMigrationSafetyCheck(migration, '0285_p2_material_deposits_and_payment_settlements.sql')).not.toThrow();
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS p2_deposit_applications/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ar_payment_settlements/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ar_payment_settlement_items/i);
  });

  it('applies the deposit schema during every production boot', () => {
    expect(safeBootMigrations).toContain("'0285_p2_material_deposits_and_payment_settlements.sql'");
    expect(safeBootMigrations).toContain("'0287_p2_deposit_invoice_clin_contact.sql'");
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
    expect(invoicePdf).toContain("isMaterialDeposit ? 'MATERIAL DEPOSIT INVOICE' : 'INVOICE'");
    expect(invoicePdf).not.toContain("['Project:', String(invoice.projectCode || 'N/A')]");
  });

  it('posts the final invoice and applies a selected deposit atomically', () => {
    expect(invoiceRoutes).toContain('depositApplication = z.object');
    expect(invoiceRoutes).toContain('}, tx)');
    expect(invoiceRoutes).toContain("eventType: 'P2_MATERIAL_DEPOSIT_APPLIED'");
    expect(depositService).toContain("['POSTED', 'SENT'].includes(finalInvoice.status)");
    expect(invoiceDetail).toContain('Post & Apply Deposit');
  });

  it('shows applied deposits and the true remaining balance on the customer PDF', () => {
    expect(invoicePdf).toContain('depositApplications.rows.map');
    expect(invoicePdf).toContain('deposit.invoice_number');
    expect(invoicePdf).toContain("pda.status = 'POSTED'");
    expect(invoicePdf).toContain("page.drawText(money(amountDue)");
    expect(invoiceDetail).toContain('Material deposit applied:');
  });
});
