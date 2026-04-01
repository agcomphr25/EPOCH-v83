/**
 * AUDITED_ORDER_FIELDS — canonical list of all order fields tracked by the audit system.
 *
 * This is the single declaration used by all audit enforcement:
 *   - orderActivityService (canonical write service)
 *   - orderTransitionValidator (state-machine guard)
 *   - backfill scripts and future UI story mode
 *
 * Categories:
 *   production  — department, status, urgency, scrap, cancellation
 *   shipping    — tracking, carrier, method, shipment dates
 *   finance     — payment, pricing, discount fields
 *   spec        — core spec / build configuration fields
 */

export type AuditedFieldCategory =
  | 'production'
  | 'shipping'
  | 'finance'
  | 'spec';

export interface AuditedOrderField {
  field: string;
  category: AuditedFieldCategory;
  label: string;
}

export const AUDITED_ORDER_FIELDS: readonly AuditedOrderField[] = [
  // ── Status & Department ──────────────────────────────────────────────────
  { field: 'status',               category: 'production', label: 'Order Status' },
  { field: 'statusId',             category: 'production', label: 'Order Status ID' },
  { field: 'currentDepartment',    category: 'production', label: 'Current Department' },
  { field: 'currentDepartmentId',  category: 'production', label: 'Current Department ID' },

  // ── Timeline / Urgency ───────────────────────────────────────────────────
  { field: 'dueDate',              category: 'production', label: 'Due Date' },
  { field: 'urgency',              category: 'production', label: 'Urgency Level' },
  { field: 'isManualUrgency',      category: 'production', label: 'Manual Urgency Flag' },
  { field: 'manualPriorityOverride', category: 'production', label: 'Manual Priority Override' },
  { field: 'manualPriorityReason',   category: 'production', label: 'Manual Priority Reason' },

  // ── Scrap / Quantity ─────────────────────────────────────────────────────
  { field: 'scrappedQuantity',     category: 'production', label: 'Scrapped Quantity' },
  { field: 'totalProduced',        category: 'production', label: 'Total Produced' },
  { field: 'scrapDate',            category: 'production', label: 'Scrap Date' },
  { field: 'scrapReason',          category: 'production', label: 'Scrap Reason' },
  { field: 'scrapDisposition',     category: 'production', label: 'Scrap Disposition' },
  { field: 'scrapAuthorization',   category: 'production', label: 'Scrap Authorization' },

  // ── Cancellation ─────────────────────────────────────────────────────────
  { field: 'isCancelled',          category: 'production', label: 'Cancellation Flag' },
  { field: 'cancelledAt',          category: 'production', label: 'Cancelled At' },
  { field: 'cancelReason',         category: 'production', label: 'Cancel Reason' },

  // ── Shipping ─────────────────────────────────────────────────────────────
  { field: 'shipDate',             category: 'shipping', label: 'Ship Date' },
  { field: 'shippedDate',          category: 'shipping', label: 'Shipped Date' },
  { field: 'trackingNumber',       category: 'shipping', label: 'Tracking Number' },
  { field: 'shippingCarrier',      category: 'shipping', label: 'Shipping Carrier' },
  { field: 'shippingMethod',       category: 'shipping', label: 'Shipping Method' },
  { field: 'shippingLabelGenerated', category: 'shipping', label: 'Shipping Label Generated' },
  { field: 'estimatedDelivery',    category: 'shipping', label: 'Estimated Delivery' },
  { field: 'customerNotified',     category: 'shipping', label: 'Customer Notified' },
  { field: 'notificationMethod',   category: 'shipping', label: 'Notification Method' },
  { field: 'deliveryConfirmed',    category: 'shipping', label: 'Delivery Confirmed' },
  { field: 'deliveryConfirmedAt',  category: 'shipping', label: 'Delivery Confirmed At' },

  // ── Payment / Finance ────────────────────────────────────────────────────
  { field: 'isPaid',               category: 'finance', label: 'Payment Status' },
  { field: 'paymentType',          category: 'finance', label: 'Payment Type' },
  { field: 'paymentAmount',        category: 'finance', label: 'Payment Amount' },
  { field: 'paymentDate',          category: 'finance', label: 'Payment Date' },
  { field: 'paymentTimestamp',     category: 'finance', label: 'Payment Timestamp' },
  { field: 'priceOverride',        category: 'finance', label: 'Price Override' },
  { field: 'flattopPriceOverride', category: 'finance', label: 'Flattop Price Override' },
  { field: 'shipping',             category: 'finance', label: 'Shipping Charge' },
  { field: 'discountCode',         category: 'finance', label: 'Discount Code' },
  { field: 'discountType',         category: 'finance', label: 'Discount Type' },
  { field: 'discountValue',        category: 'finance', label: 'Discount Value' },
  { field: 'customDiscountType',   category: 'finance', label: 'Custom Discount Type' },
  { field: 'customDiscountValue',  category: 'finance', label: 'Custom Discount Value' },
  { field: 'calculatedTotal',      category: 'finance', label: 'Calculated Total' },

  // ── Core Spec / Build Fields ─────────────────────────────────────────────
  { field: 'modelId',              category: 'spec', label: 'Model ID' },
  { field: 'handedness',           category: 'spec', label: 'Handedness' },
  { field: 'shankLength',          category: 'spec', label: 'Shank Length' },
  { field: 'features',             category: 'spec', label: 'Features' },
  { field: 'featureQuantities',    category: 'spec', label: 'Feature Quantities' },
  { field: 'isFlattop',            category: 'spec', label: 'Is Flattop' },
  { field: 'isCustomOrder',        category: 'spec', label: 'Is Custom Order' },
  { field: 'notes',                category: 'spec', label: 'Order Notes' },
  { field: 'dueDate',              category: 'spec', label: 'Due Date' },
] as const;

/** Fast field-name → config lookup */
export const AUDITED_ORDER_FIELD_MAP: Readonly<Record<string, AuditedOrderField>> =
  Object.fromEntries(AUDITED_ORDER_FIELDS.map((f) => [f.field, f]));

/** Return only the field names as a plain string array */
export const AUDITED_ORDER_FIELD_NAMES: readonly string[] =
  AUDITED_ORDER_FIELDS.map((f) => f.field);

/** Check whether a given field name is audited */
export function isAuditedOrderField(field: string): boolean {
  return field in AUDITED_ORDER_FIELD_MAP;
}

/** Compute a field diff between two order snapshots — only audited fields */
export function computeFieldDiff(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, { before: any; after: any; label: string }> {
  const diff: Record<string, { before: any; after: any; label: string }> = {};

  for (const { field, label } of AUDITED_ORDER_FIELDS) {
    const bVal = before[field] ?? null;
    const aVal = after[field] ?? null;
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diff[field] = { before: bVal, after: aVal, label };
    }
  }

  return diff;
}
