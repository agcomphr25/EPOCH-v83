/**
 * Audit Configuration - Defines all trackable fields for automatic change detection
 * 
 * This file is the single source of truth for which fields trigger audit events.
 * When a new field is added to an entity, add it here to enable automatic tracking.
 */

export interface AuditFieldConfig {
  fieldName: string;
  displayName: string;
  eventType: string;
  category: 'production' | 'finance' | 'shipping' | 'customer' | 'qc' | 'p2';
  entityTypes: ('p1_order' | 'p2_order' | 'p2_serialized_item' | 'p2_project')[];
  valueFormatter?: (value: any) => string;
  isTracked: boolean;
}

export interface AuditEventTypeConfig {
  eventType: string;
  displayName: string;
  description: string;
  category: string;
  isCritical: boolean;
  appliesTo: 'p1' | 'p2' | 'both';
}

// Fields that trigger audit events when changed
export const auditableFields: Record<string, AuditFieldConfig> = {
  // P1 Order - Production Fields
  currentDepartment: {
    fieldName: 'currentDepartment',
    displayName: 'Current Department',
    eventType: 'DEPARTMENT_CHANGE',
    category: 'production',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  status: {
    fieldName: 'status',
    displayName: 'Order Status',
    eventType: 'STATUS_CHANGE',
    category: 'production',
    entityTypes: ['p1_order', 'p2_order'],
    isTracked: true,
  },
  assignedTechnician: {
    fieldName: 'assignedTechnician',
    displayName: 'Assigned Technician',
    eventType: 'TECHNICIAN_ASSIGNED',
    category: 'production',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  urgency: {
    fieldName: 'urgency',
    displayName: 'Urgency Level',
    eventType: 'PRIORITY_CHANGE',
    category: 'production',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  priorityScore: {
    fieldName: 'priorityScore',
    displayName: 'Priority Score',
    eventType: 'PRIORITY_CHANGE',
    category: 'production',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  scrappedQuantity: {
    fieldName: 'scrappedQuantity',
    displayName: 'Scrapped Quantity',
    eventType: 'SCRAP_DECLARED',
    category: 'production',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  isCancelled: {
    fieldName: 'isCancelled',
    displayName: 'Cancelled Status',
    eventType: 'ORDER_CANCELLED',
    category: 'production',
    entityTypes: ['p1_order', 'p2_order'],
    isTracked: true,
  },
  cancelReason: {
    fieldName: 'cancelReason',
    displayName: 'Cancel Reason',
    eventType: 'ORDER_CANCELLED',
    category: 'production',
    entityTypes: ['p1_order', 'p2_order'],
    isTracked: true,
  },

  // P1 Order - Finance Fields
  shipping: {
    fieldName: 'shipping',
    displayName: 'Shipping Charge',
    eventType: 'SHIPPING_CHARGE_CHANGED',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  flattopPriceOverride: {
    fieldName: 'flattopPriceOverride',
    displayName: 'Flattop Price Override',
    eventType: 'PRICE_OVERRIDE',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  isPaid: {
    fieldName: 'isPaid',
    displayName: 'Payment Status',
    eventType: 'PAYMENT_RECEIVED',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  paymentAmount: {
    fieldName: 'paymentAmount',
    displayName: 'Payment Amount',
    eventType: 'PAYMENT_RECEIVED',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  priceOverride: {
    fieldName: 'priceOverride',
    displayName: 'Price Override',
    eventType: 'PRICE_OVERRIDE',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  discountCode: {
    fieldName: 'discountCode',
    displayName: 'Discount Code',
    eventType: 'DISCOUNT_APPLIED',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  customDiscountValue: {
    fieldName: 'customDiscountValue',
    displayName: 'Custom Discount',
    eventType: 'DISCOUNT_APPLIED',
    category: 'finance',
    entityTypes: ['p1_order'],
    isTracked: true,
  },

  // P1 Order - Shipping Fields
  trackingNumber: {
    fieldName: 'trackingNumber',
    displayName: 'Tracking Number',
    eventType: 'TRACKING_ADDED',
    category: 'shipping',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  shippedDate: {
    fieldName: 'shippedDate',
    displayName: 'Shipped Date',
    eventType: 'SHIPPED',
    category: 'shipping',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  deliveryConfirmed: {
    fieldName: 'deliveryConfirmed',
    displayName: 'Delivery Confirmed',
    eventType: 'DELIVERY_CONFIRMED',
    category: 'shipping',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  shippingCarrier: {
    fieldName: 'shippingCarrier',
    displayName: 'Shipping Carrier',
    eventType: 'SHIPPED',
    category: 'shipping',
    entityTypes: ['p1_order'],
    isTracked: true,
  },
  shippingMethod: {
    fieldName: 'shippingMethod',
    displayName: 'Shipping Method',
    eventType: 'SHIPPED',
    category: 'shipping',
    entityTypes: ['p1_order'],
    isTracked: true,
  },

  // P1 Order - Customer Fields
  notes: {
    fieldName: 'notes',
    displayName: 'Order Notes',
    eventType: 'NOTES_UPDATED',
    category: 'customer',
    entityTypes: ['p1_order', 'p2_order'],
    isTracked: true,
  },
  customerNotified: {
    fieldName: 'customerNotified',
    displayName: 'Customer Notified',
    eventType: 'CUSTOMER_NOTIFIED',
    category: 'customer',
    entityTypes: ['p1_order'],
    isTracked: true,
  },

  // P2 Serialized Item Fields
  currentDepartmentP2: {
    fieldName: 'currentDepartment',
    displayName: 'Current Department',
    eventType: 'DEPARTMENT_CHANGE',
    category: 'p2',
    entityTypes: ['p2_serialized_item'],
    isTracked: true,
  },
  itemStatus: {
    fieldName: 'status',
    displayName: 'Item Status',
    eventType: 'STATUS_CHANGE',
    category: 'p2',
    entityTypes: ['p2_serialized_item'],
    isTracked: true,
  },
  isOnHold: {
    fieldName: 'isOnHold',
    displayName: 'On Hold',
    eventType: 'STATUS_CHANGE',
    category: 'p2',
    entityTypes: ['p2_serialized_item'],
    isTracked: true,
  },
  isScrapped: {
    fieldName: 'isScrapped',
    displayName: 'Scrapped',
    eventType: 'SCRAP_DECLARED',
    category: 'p2',
    entityTypes: ['p2_serialized_item'],
    isTracked: true,
  },

  // P2 Project Fields
  projectStatus: {
    fieldName: 'status',
    displayName: 'Project Status',
    eventType: 'STATUS_CHANGE',
    category: 'p2',
    entityTypes: ['p2_project'],
    isTracked: true,
  },
};

// Get all tracked fields for a specific entity type
export function getTrackedFieldsForEntity(entityType: string): AuditFieldConfig[] {
  return Object.values(auditableFields).filter(
    (field) => field.isTracked && field.entityTypes.includes(entityType as any)
  );
}

// Check if a field should be audited for a given entity type
export function isFieldAuditable(fieldName: string, entityType: string): boolean {
  const config = auditableFields[fieldName];
  if (!config) return false;
  return config.isTracked && config.entityTypes.includes(entityType as any);
}

// Get the event type for a field change
export function getEventTypeForField(fieldName: string): string | null {
  const config = auditableFields[fieldName];
  return config?.eventType || null;
}

// Compare two objects and return changed fields
export function getChangedFields(
  before: Record<string, any>,
  after: Record<string, any>,
  entityType: string
): Record<string, { before: any; after: any; eventType: string }> {
  const changes: Record<string, { before: any; after: any; eventType: string }> = {};
  const trackedFields = getTrackedFieldsForEntity(entityType);

  for (const field of trackedFields) {
    const beforeVal = before[field.fieldName];
    const afterVal = after[field.fieldName];

    // Handle different types of comparison
    const beforeStr = JSON.stringify(beforeVal);
    const afterStr = JSON.stringify(afterVal);

    if (beforeStr !== afterStr) {
      changes[field.fieldName] = {
        before: beforeVal,
        after: afterVal,
        eventType: field.eventType,
      };
    }
  }

  return changes;
}

// Group event types by category for UI display
export const eventCategories = {
  production: {
    label: 'Production',
    description: 'Order creation, department changes, status updates',
    icon: 'Factory',
  },
  finance: {
    label: 'Finance',
    description: 'Payments, refunds, pricing changes',
    icon: 'DollarSign',
  },
  shipping: {
    label: 'Shipping',
    description: 'Tracking, shipment, delivery events',
    icon: 'Truck',
  },
  customer: {
    label: 'Customer',
    description: 'Notes, notifications, communications',
    icon: 'Users',
  },
  qc: {
    label: 'Quality Control',
    description: 'QC inspections, pass/fail events',
    icon: 'CheckCircle',
  },
  p2: {
    label: 'P2 Items',
    description: 'P2 purchase orders, serialized items, projects',
    icon: 'Package',
  },
};

// Department list for transition tracking
export const trackableDepartments = [
  'P1 Production Queue',
  'Layup',
  'Plugging',
  'CNC',
  'Finish',
  'Gunsmith',
  'Paint',
  'QC',
  'Shipping',
  // P2 Departments
  'Receiving',
  'Prep',
  'Layup',
  'Cure',
  'Trim',
  'Paint',
  'Final QC',
  'Pack/Ship',
];
