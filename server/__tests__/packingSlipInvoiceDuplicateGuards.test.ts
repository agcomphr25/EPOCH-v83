import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('packing slip invoice duplicate guards', () => {
  it('guards P1 OEM shipment+PO invoice creation with a transaction lock and existing-invoice response', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/src/routes/poShippingQC.ts'),
      'utf8',
    );

    expect(source).toContain("pg_advisory_xact_lock(hashtext('p1-oem-packing-slip-invoice')");
    expect(source).toContain('const existingInTransaction = await findP1PackingSlipInvoice(id, poNumber);');
    expect(source).toContain('[P1InvoiceService] Duplicate prevented');
    expect(source).toContain('existing: true');
  });

  it('guards P2 packing-slip invoice creation with a transaction lock and existing-invoice response', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/src/services/invoiceFromPackingSlip.ts'),
      'utf8',
    );

    expect(source).toContain("pg_advisory_xact_lock(hashtext('p2-packing-slip-invoice')");
    expect(source).toContain('const [existingInTransaction] = await tx');
    expect(source).toContain('Duplicate prevented (transaction)');
    expect(source).toContain('existing: true');
  });

  it('locks and enforces the packing slip reserved number before creating a P2 invoice', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/src/services/invoiceFromPackingSlip.ts'),
      'utf8',
    );

    expect(source).toContain(".for('update')");
    expect(source).toContain("pg_advisory_xact_lock(hashtext('p2-invoice-number')");
    expect(source).toContain('const reservedInvoiceNumber = requireReservedP2InvoiceNumber');
    expect(source).toContain('assertP2InvoiceHonorsReservation');
    expect(source).toContain('invoiceNumber: reservedInvoiceNumber');
    expect(source).toContain('is already used by invoice');
  });
});
