export type RevenueStream =
  | 'P1_REGULAR_PREPAID'
  | 'P1_PO_NET30'
  | 'P2_NET30'
  | 'UNKNOWN_REVIEW';

export type RevenueRecognitionTiming =
  | 'DEPOSIT_UNTIL_SHIPMENT'
  | 'INVOICE_NET30'
  | 'MANUAL_REVIEW';

export type RevenueStreamClassification = {
  revenueStream: RevenueStream;
  recognitionTiming: RevenueRecognitionTiming;
  paymentTerms: 'PREPAID' | 'NET_30' | 'REVIEW';
  reason: string;
};

export type RevenueStreamClassificationInput = {
  productionLine?: string | null;
  sourceTable?: string | null;
  orderSource?: string | null;
  orderSourceV2?: string | null;
  sourcePoId?: number | string | null;
  p1PurchaseOrderId?: number | string | null;
  p2PurchaseOrderId?: number | string | null;
  packingSlipId?: string | null;
  terms?: string | null;
  customerPaymentTerms?: string | null;
  hasCustomerPrepayment?: boolean;
  hasP1PurchaseOrderItems?: boolean;
};

function norm(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isNet30(value: unknown): boolean {
  const normalized = norm(value).replace(/[\s_-]+/g, '');
  return normalized === 'NET30' || normalized === 'N30';
}

export function classifyRevenueStream(input: RevenueStreamClassificationInput): RevenueStreamClassification {
  const productionLine = norm(input.productionLine);
  const sourceTable = norm(input.sourceTable);
  const orderSource = norm(input.orderSource || input.orderSourceV2);

  if (
    productionLine === 'P2'
    || sourceTable.startsWith('P2_')
    || hasValue(input.p2PurchaseOrderId)
    || hasValue(input.packingSlipId)
  ) {
    return {
      revenueStream: 'P2_NET30',
      recognitionTiming: 'INVOICE_NET30',
      paymentTerms: 'NET_30',
      reason: 'P2 customer orders are invoiced through AR on Net 30 terms.',
    };
  }

  if (
    productionLine === 'P1'
    && (
      sourceTable === 'SHIPMENT_RECORDS'
      || hasValue(input.p1PurchaseOrderId)
      || hasValue(input.sourcePoId)
      || input.hasP1PurchaseOrderItems
      || orderSource === 'PO_RELEASE'
      || isNet30(input.terms)
      || isNet30(input.customerPaymentTerms)
    )
  ) {
    return {
      revenueStream: 'P1_PO_NET30',
      recognitionTiming: 'INVOICE_NET30',
      paymentTerms: 'NET_30',
      reason: 'P1 PO/customer-account orders should post through AR instead of customer deposits.',
    };
  }

  if (
    productionLine === 'P1'
    && (
      sourceTable === 'SHIPMENT_ACCOUNTING_SNAPSHOTS'
      || input.hasCustomerPrepayment
      || orderSource === 'SALES'
      || orderSource === ''
    )
  ) {
    return {
      revenueStream: 'P1_REGULAR_PREPAID',
      recognitionTiming: 'DEPOSIT_UNTIL_SHIPMENT',
      paymentTerms: 'PREPAID',
      reason: 'P1 regular orders are prepaid and revenue is recognized when the order ships.',
    };
  }

  return {
    revenueStream: 'UNKNOWN_REVIEW',
    recognitionTiming: 'MANUAL_REVIEW',
    paymentTerms: 'REVIEW',
    reason: 'Revenue stream could not be classified from the available order, PO, shipment, or terms evidence.',
  };
}

export function assertRevenueStream(
  classification: RevenueStreamClassification,
  expected: RevenueStream,
  context: string,
): void {
  if (classification.revenueStream !== expected) {
    throw new Error(
      `${context} expected ${expected} but classified as ${classification.revenueStream}: ${classification.reason}`,
    );
  }
}
