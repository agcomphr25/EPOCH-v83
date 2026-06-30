import { describe, expect, it } from 'vitest';
import {
  accountingEventMatrix,
  summarizeAccountingEventMatrix,
} from '../src/services/accountingEventMatrix';

describe('accountingEventMatrix', () => {
  it('uses unique event ids', () => {
    const ids = accountingEventMatrix.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires implemented events to identify their journal metadata', () => {
    const implementedRows = accountingEventMatrix.filter((row) => row.implementationStatus === 'IMPLEMENTED');

    expect(implementedRows.length).toBeGreaterThan(0);
    for (const row of implementedRows) {
      expect(row.journalTransactionType).toEqual(expect.any(String));
      expect(row.journalReferenceType).toEqual(expect.any(String));
      expect(row.debitAccounts.length).toBeGreaterThan(0);
      expect(row.creditAccounts.length).toBeGreaterThan(0);
    }
  });

  it('surfaces the critical accounting gaps we need before financial statements', () => {
    const summary = summarizeAccountingEventMatrix();
    const criticalGapIds = summary.criticalGaps.map((row) => row.id);

    expect(summary.byStatus.GAP).toBeGreaterThan(0);
    expect(criticalGapIds).toEqual(expect.arrayContaining([
      'VENDOR_BILL_RECORDED',
      'INVENTORY_RECEIVED',
      'INVENTORY_ISSUED_TO_PRODUCTION',
      'FIXED_ASSET_ACQUIRED',
      'EQUIPMENT_LOAN_RECORDED',
      'OPENING_BALANCE_MIGRATION',
    ]));
  });

  it('keeps the revenue stream split explicit for P1 prepaid, P1 PO, and P2 Net 30 accounting', () => {
    const ids = accountingEventMatrix.map((row) => row.id);

    expect(ids).toEqual(expect.arrayContaining([
      'P1_CUSTOMER_PAYMENT_RECEIVED',
      'P1_PREPAID_SHIPMENT_REVENUE_RECOGNIZED',
      'P1_PO_NET30_INVOICE_POSTED',
      'P2_NET30_INVOICE_POSTED',
    ]));
  });

  it('tracks capital equipment, equipment loans, loan payments, and depreciation as accounting events', () => {
    const ids = accountingEventMatrix.map((row) => row.id);

    expect(ids).toEqual(expect.arrayContaining([
      'FIXED_ASSET_ACQUIRED',
      'EQUIPMENT_LOAN_RECORDED',
      'EQUIPMENT_LOAN_PAYMENT_MADE',
      'FIXED_ASSET_DEPRECIATION_POSTED',
    ]));
  });
});
