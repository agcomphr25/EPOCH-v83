import { describe, expect, it } from 'vitest';
import {
  assertRevenueStream,
  classifyRevenueStream,
} from '../src/services/revenueStreamClassifier';

describe('revenueStreamClassifier', () => {
  it('classifies regular P1 prepaid orders as deposit-until-shipment revenue', () => {
    const result = classifyRevenueStream({
      productionLine: 'P1',
      sourceTable: 'shipment_accounting_snapshots',
      orderSource: 'SALES',
      hasCustomerPrepayment: true,
    });

    expect(result).toMatchObject({
      revenueStream: 'P1_REGULAR_PREPAID',
      recognitionTiming: 'DEPOSIT_UNTIL_SHIPMENT',
      paymentTerms: 'PREPAID',
    });
  });

  it('classifies P1 purchase order shipments as Net 30 AR revenue', () => {
    const result = classifyRevenueStream({
      productionLine: 'P1',
      sourceTable: 'shipment_records',
      hasP1PurchaseOrderItems: true,
      terms: 'Net 30',
    });

    expect(result).toMatchObject({
      revenueStream: 'P1_PO_NET30',
      recognitionTiming: 'INVOICE_NET30',
      paymentTerms: 'NET_30',
    });
  });

  it('classifies P2 packing slip invoices as Net 30 AR revenue', () => {
    const result = classifyRevenueStream({
      productionLine: 'P2',
      sourceTable: 'p2_packing_slips',
      packingSlipId: '7e28c247-1ea8-4db0-bcbc-4c29ace1749d',
    });

    expect(result).toMatchObject({
      revenueStream: 'P2_NET30',
      recognitionTiming: 'INVOICE_NET30',
      paymentTerms: 'NET_30',
    });
  });

  it('blocks a posting path when the stream evidence points to a different accounting treatment', () => {
    const result = classifyRevenueStream({
      productionLine: 'P1',
      sourceTable: 'shipment_records',
      hasP1PurchaseOrderItems: true,
    });

    expect(() => assertRevenueStream(result, 'P1_REGULAR_PREPAID', 'test shipment')).toThrow(
      'expected P1_REGULAR_PREPAID but classified as P1_PO_NET30',
    );
  });
});
