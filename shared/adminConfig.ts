import { z } from 'zod';

/**
 * Admin Panel Field Configuration
 * 
 * This file defines which order fields can be edited in the admin panel,
 * their types, validation rules, and required permissions.
 * 
 * Adding new editable fields is as simple as adding a new entry here.
 */

export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'number' 
  | 'select' 
  | 'date' 
  | 'boolean'
  | 'technician-select';

export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'OWNER';

export interface AdminFieldConfig {
  label: string;
  type: FieldType;
  dbField: string; // Actual database column name
  requiredRole: UserRole | UserRole[]; // Who can edit this field
  options?: string[] | 'employees' | 'departments' | 'statuses'; // Static or dynamic options
  validation?: z.ZodType; // Zod validation schema
  description?: string; // Helper text for users
  inlineEditable?: boolean; // Can be edited directly in the table
  category?: string; // Group fields into categories in the side panel
}

// Field configurations for the admin panel
export const adminFieldConfigs: Record<string, AdminFieldConfig> = {
  // Department & Technician Assignment
  assignedTechnician: {
    label: 'Assigned Technician',
    type: 'technician-select',
    dbField: 'assigned_technician',
    requiredRole: ['ADMIN', 'OWNER'],
    options: 'employees',
    description: 'Technician assigned to work on this order',
    inlineEditable: true,
    category: 'Assignment',
  },
  
  currentDepartment: {
    label: 'Current Department',
    type: 'select',
    dbField: 'current_department',
    requiredRole: ['ADMIN', 'OWNER'],
    options: 'departments',
    description: 'Current production department',
    inlineEditable: true,
    category: 'Assignment',
  },

  // Status & Priority
  status: {
    label: 'Order Status',
    type: 'select',
    dbField: 'status',
    requiredRole: ['ADMIN', 'OWNER'],
    options: 'statuses',
    description: 'Overall order status',
    inlineEditable: true,
    category: 'Status',
  },

  urgency: {
    label: 'Urgency Level',
    type: 'select',
    dbField: 'urgency',
    requiredRole: ['ADMIN', 'OWNER'],
    options: ['critical', 'high', 'medium', 'low'],
    description: 'Priority urgency level',
    inlineEditable: true,
    category: 'Status',
  },

  isManualUrgency: {
    label: 'Manually Set Urgency',
    type: 'boolean',
    dbField: 'is_manual_urgency',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'Whether urgency was manually set by user',
    inlineEditable: false,
    category: 'Status',
  },

  priorityScore: {
    label: 'Priority Score',
    type: 'number',
    dbField: 'priority_score',
    requiredRole: ['ADMIN', 'OWNER'],
    validation: z.number().int().min(1).max(100),
    description: 'Lower numbers = higher priority (1-100)',
    inlineEditable: true,
    category: 'Status',
  },

  // Payment & Shipping Status
  isPaid: {
    label: 'Paid',
    type: 'boolean',
    dbField: 'is_paid',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'Whether order is fully paid',
    inlineEditable: true,
    category: 'Payment',
  },

  shippedDate: {
    label: 'Shipped Date',
    type: 'date',
    dbField: 'shipped_date',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    description: 'Date order was shipped',
    inlineEditable: false,
    category: 'Shipping',
  },

  estimatedDelivery: {
    label: 'Estimated Delivery',
    type: 'date',
    dbField: 'estimated_delivery',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    description: 'Estimated delivery date',
    inlineEditable: false,
    category: 'Shipping',
  },

  deliveryConfirmed: {
    label: 'Delivery Confirmed',
    type: 'boolean',
    dbField: 'delivery_confirmed',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    description: 'Whether delivery was confirmed',
    inlineEditable: true,
    category: 'Shipping',
  },

  // Price Overrides
  priceOverride: {
    label: 'Price Override',
    type: 'number',
    dbField: 'price_override',
    requiredRole: 'ADMIN',
    validation: z.number().min(0).nullable(),
    description: 'Manual price override for stock model',
    inlineEditable: false,
    category: 'Pricing',
  },

  flattopPriceOverride: {
    label: 'Flattop Price Override',
    type: 'number',
    dbField: 'flattop_price_override',
    requiredRole: 'ADMIN',
    validation: z.number().min(0).nullable(),
    description: 'Manual price override for flattop stocks',
    inlineEditable: false,
    category: 'Pricing',
  },

  shipping: {
    label: 'Shipping Cost',
    type: 'number',
    dbField: 'shipping',
    requiredRole: ['ADMIN', 'OWNER'],
    validation: z.number().min(0),
    description: 'Shipping cost in dollars',
    inlineEditable: false,
    category: 'Pricing',
  },

  // Dates
  dueDate: {
    label: 'Due Date',
    type: 'date',
    dbField: 'due_date',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'When the order is due',
    inlineEditable: false,
    category: 'Dates',
  },

  orderDate: {
    label: 'Order Date',
    type: 'date',
    dbField: 'order_date',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'When the order was placed',
    inlineEditable: false,
    category: 'Dates',
  },

  // Customer Information
  customerPO: {
    label: 'Customer PO',
    type: 'text',
    dbField: 'customer_po',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    validation: z.string().max(100).nullable(),
    description: 'Customer purchase order number',
    inlineEditable: true,
    category: 'Customer',
  },

  fbOrderNumber: {
    label: 'FishBowl Order #',
    type: 'text',
    dbField: 'fb_order_number',
    requiredRole: ['ADMIN', 'OWNER'],
    validation: z.string().max(50).nullable(),
    description: 'FishBowl order number (e.g., AK046)',
    inlineEditable: true,
    category: 'Customer',
  },

  // Order Details
  notes: {
    label: 'Order Notes',
    type: 'textarea',
    dbField: 'notes',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    description: 'Special instructions or notes',
    inlineEditable: false,
    category: 'Details',
  },

  // Production Tracking
  scrappedQuantity: {
    label: 'Scrapped Quantity',
    type: 'number',
    dbField: 'scrapped_quantity',
    requiredRole: ['ADMIN', 'OWNER'],
    validation: z.number().int().min(0),
    description: 'Number of items scrapped',
    inlineEditable: false,
    category: 'Production',
  },

  totalProduced: {
    label: 'Total Produced',
    type: 'number',
    dbField: 'total_produced',
    requiredRole: ['ADMIN', 'OWNER'],
    validation: z.number().int().min(0),
    description: 'Total items produced',
    inlineEditable: false,
    category: 'Production',
  },

  // Cancellation
  isCancelled: {
    label: 'Cancelled',
    type: 'boolean',
    dbField: 'is_cancelled',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'Whether this order is cancelled',
    inlineEditable: true,
    category: 'Status',
  },

  cancelReason: {
    label: 'Cancel Reason',
    type: 'textarea',
    dbField: 'cancel_reason',
    requiredRole: ['ADMIN', 'OWNER'],
    description: 'Reason for cancellation',
    inlineEditable: false,
    category: 'Status',
  },

  // Shipping
  trackingNumber: {
    label: 'Tracking Number',
    type: 'text',
    dbField: 'tracking_number',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    validation: z.string().max(100).nullable(),
    description: 'Shipping tracking number',
    inlineEditable: true,
    category: 'Shipping',
  },

  shippingCarrier: {
    label: 'Shipping Carrier',
    type: 'select',
    dbField: 'shipping_carrier',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    options: ['UPS', 'FedEx', 'USPS', 'DHL'],
    description: 'Shipping carrier',
    inlineEditable: true,
    category: 'Shipping',
  },

  shippingMethod: {
    label: 'Shipping Method',
    type: 'select',
    dbField: 'shipping_method',
    requiredRole: ['ADMIN', 'OWNER', 'EMPLOYEE'],
    options: ['Ground', 'Next Day Air', '2nd Day Air', '3 Day Select'],
    description: 'Shipping method/speed',
    inlineEditable: true,
    category: 'Shipping',
  },
};

// Categories for organizing fields in the side panel
export const fieldCategories = [
  { id: 'Assignment', label: 'Department & Assignment', icon: 'users' },
  { id: 'Status', label: 'Status & Priority', icon: 'flag' },
  { id: 'Dates', label: 'Date Information', icon: 'calendar' },
  { id: 'Customer', label: 'Customer Information', icon: 'user' },
  { id: 'Details', label: 'Order Details', icon: 'file-text' },
  { id: 'Production', label: 'Production Tracking', icon: 'package' },
  { id: 'Payment', label: 'Payment Status', icon: 'credit-card' },
  { id: 'Pricing', label: 'Pricing Overrides', icon: 'dollar-sign' },
  { id: 'Shipping', label: 'Shipping Information', icon: 'truck' },
] as const;

/**
 * Get fields that can be edited inline in the table
 */
export function getInlineEditableFields(): Record<string, AdminFieldConfig> {
  return Object.entries(adminFieldConfigs)
    .filter(([_, config]) => config.inlineEditable)
    .reduce((acc, [key, config]) => ({ ...acc, [key]: config }), {});
}

/**
 * Get fields organized by category
 */
export function getFieldsByCategory(): Record<string, Array<AdminFieldConfig & { key: string }>> {
  const result: Record<string, Array<AdminFieldConfig & { key: string }>> = {};
  
  for (const [key, config] of Object.entries(adminFieldConfigs)) {
    const category = config.category || 'Other';
    if (!result[category]) {
      result[category] = [];
    }
    result[category].push({ ...config, key });
  }
  
  return result;
}

/**
 * Check if a user has permission to edit a specific field
 */
export function canEditField(
  fieldKey: string,
  userRole: UserRole
): boolean {
  const config = adminFieldConfigs[fieldKey];
  if (!config) return false;

  const requiredRoles = Array.isArray(config.requiredRole)
    ? config.requiredRole
    : [config.requiredRole];

  return requiredRoles.includes(userRole);
}

// Zod validation schemas for API endpoints

/**
 * Schema for single field updates
 */
export const adminFieldUpdateSchema = z.object({
  fieldName: z.string().refine(
    (name) => name in adminFieldConfigs,
    { message: 'Invalid field name' }
  ),
  newValue: z.any(), // Type depends on field, validated at field level
});

export type AdminFieldUpdate = z.infer<typeof adminFieldUpdateSchema>;

/**
 * Schema for bulk updates
 */
export const adminBulkUpdateSchema = z.object({
  orderIds: z.array(z.string()).min(1, 'At least one order must be selected'),
  fieldName: z.string().refine(
    (name) => name in adminFieldConfigs,
    { message: 'Invalid field name' }
  ),
  newValue: z.any(), // Type depends on field, validated at field level
});

export type AdminBulkUpdate = z.infer<typeof adminBulkUpdateSchema>;

// Export alias for consistency
export const ADMIN_FIELD_CONFIG = adminFieldConfigs;
