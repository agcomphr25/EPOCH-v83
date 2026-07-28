import { describe, expect, it } from 'vitest';
import {
  assertP2InvoiceHonorsReservation,
  requireReservedP2InvoiceNumber,
} from '../src/services/p2InvoiceReservationInvariant';

describe('P2 invoice reservation invariant', () => {
  it('uses the invoice number reserved on the packing slip', () => {
    expect(
      requireReservedP2InvoiceNumber({
        packingSlipId: 'packing-slip-1',
        invoiceNumber: ' ROC26-0004 ',
      })
    ).toBe('ROC26-0004');
  });

  it('stops invoice creation when the packing slip has no reservation', () => {
    expect(() =>
      requireReservedP2InvoiceNumber({
        packingSlipId: 'packing-slip-1',
        invoiceNumber: null,
      })
    ).toThrow('does not have a reserved invoice number');
  });

  it('accepts an invoice whose number matches the packing-slip reservation', () => {
    expect(() =>
      assertP2InvoiceHonorsReservation({
        packingSlipId: 'packing-slip-1',
        reservedInvoiceNumber: 'ROC26-0004',
        actualInvoiceNumber: 'ROC26-0004',
      })
    ).not.toThrow();
  });

  it('stops when an existing or proposed invoice number differs from the reservation', () => {
    expect(() =>
      assertP2InvoiceHonorsReservation({
        packingSlipId: 'packing-slip-1',
        reservedInvoiceNumber: 'ROC26-0004',
        actualInvoiceNumber: 'ROC26-0007',
      })
    ).toThrow('reserved ROC26-0004, found ROC26-0007');
  });
});
