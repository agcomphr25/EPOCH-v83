/*
EPOCH USER IDENTITY STANDARD

All user references must store:
- <field>UserId (integer FK)
- <field>DisplayName (text snapshot)

Never:
- Store only numeric user ID
- Store only username string
- Return numeric ID to frontend

Use resolveUserSnapshot() or resolveEmployeeSnapshot() for all inserts.
See: server/utils/userSnapshot.ts
*/

import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  json,
  real,
  date,
  pgEnum,
  unique,
  uuid,
  numeric,
  index,
  uniqueIndex,
  serial,
  varchar,
  doublePrecision,
  bigint,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { getManufacturingRouteDefinition as resolveManufacturingRouteDefinition } from '../shared/utils/manufacturingRouting';

// Order Department Types Reference Table (separate from order_departments tracking table)
export const inventoryDepartments = pgTable('inventory_departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  defaultReceivingLocation: text('default_receiving_location'),
  defaultReceivingFreezer: integer('default_receiving_freezer'),
});

export const insertInventoryDepartmentSchema = createInsertSchema(inventoryDepartments).omit({
  id: true,
}).extend({
  name: z.string().min(1, 'Name is required'),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  defaultReceivingLocation: z.string().optional().nullable(),
  defaultReceivingFreezer: z.number().int().optional().nullable(),
});

export type InventoryDepartment = typeof inventoryDepartments.$inferSelect;
export type InsertInventoryDepartment = z.infer<typeof insertInventoryDepartmentSchema>;

export const inventoryItemDepartments = pgTable('inventory_item_departments', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  departmentId: integer('department_id').notNull().references(() => inventoryDepartments.id, { onDelete: 'cascade' }),
});

export const orderDepartmentTypes = pgTable('order_department_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Order Status Types Reference Table
export const orderStatusTypes = pgTable('order_status_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// All finalized orders - production table
export const allOrders = pgTable('all_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  customerId: text('customer_id'),
  customerPO: text('customer_po'),
  fbOrderNumber: text('fb_order_number'),
  agrOrderDetails: text('agr_order_details'),
  isFlattop: boolean('is_flattop').default(false),
  isCustomOrder: text('is_custom_order'), // "yes", "no", or null
  modelId: text('model_id'),
  handedness: text('handedness'),
  shankLength: text('shank_length'),
  features: jsonb('features'),
  featureQuantities: jsonb('feature_quantities'),
  discountCode: text('discount_code'),
  discountType: text('discount_type'),
  discountValue: numeric('discount_value'),
  discountAppliesTo: text('discount_applies_to'),
  notes: text('notes'), // Order notes/special instructions
  departmentNotes: jsonb('department_notes').$type<Array<{ id?: string; text: string; departments: string[] }>>().default(sql`'[]'::jsonb`),
  customDiscountType: text('custom_discount_type').default('percent'),
  customDiscountValue: real('custom_discount_value').default(0),
  showCustomDiscount: boolean('show_custom_discount').default(false),
  priceOverride: real('price_override'), // Manual price override for stock model
  flattopPriceOverride: real('flattop_price_override'), // Manual price override for flattop stocks
  shipping: real('shipping').default(0),
  tikkaOption: text('tikka_option'),
  status: text('status').default('FINALIZED'), // Legacy - will be removed after migration
  statusId: integer('status_id').references(() => orderStatusTypes.id), // New FK reference
  barcode: text('barcode'), // Code 39 barcode for order identification
  // Order Source and PO Linkage Fields
  orderSource: text('source').default('SALES'), // SALES = customer order, PO_RELEASE = production-only from PO
  sourcePoId: integer('source_po_id'), // Reference to purchase_orders.id for PO_RELEASE orders
  sourcePoItemId: integer('source_po_item_id'), // Reference to purchase_order_items.id for PO_RELEASE orders
  // Department Progression Fields
  currentDepartment: text('current_department').default('P1 Production Queue'), // Default to P1 Production Queue until scheduled
  currentDepartmentId: integer('current_department_id').references(
    () => orderDepartmentTypes.id
  ), // New FK reference
  departmentHistory: jsonb('department_history').default('[]'),
  scrappedQuantity: integer('scrapped_quantity').default(0),
  totalProduced: integer('total_produced').default(0),
  // Department Completion Timestamps
  layupCompletedAt: timestamp('layup_completed_at'),
  pluggingCompletedAt: timestamp('plugging_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  finishAcceptedAt: timestamp('finish_accepted_at'),
  finishAcceptedBy: text('finish_accepted_by'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  // Scrap Information
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  // Replacement Information
  isReplacement: boolean('is_replacement').default(false),
  replacedOrderId: text('replaced_order_id'),
  // Payment Information
  isPaid: boolean('is_paid').default(false),
  paymentType: text('payment_type'), // cash, credit, check, etc.
  paymentAmount: real('payment_amount'),
  paymentDate: timestamp('payment_date'),
  paymentTimestamp: timestamp('payment_timestamp'),
  // Shipping and Tracking Information
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier').default('UPS'),
  shippingMethod: text('shipping_method').default('Ground'),
  shippedDate: timestamp('shipped_date'),
  estimatedDelivery: timestamp('estimated_delivery'),
  shippingLabelGenerated: boolean('shipping_label_generated').default(false),
  customerNotified: boolean('customer_notified').default(false),
  notificationMethod: text('notification_method'), // email, sms, both
  notificationSentAt: timestamp('notification_sent_at'),
  deliveryConfirmed: boolean('delivery_confirmed').default(false),
  deliveryConfirmedAt: timestamp('delivery_confirmed_at'),
  // Forecast Accuracy Tracking
  forecastCompletionDate: timestamp('forecast_completion_date'),
  actualCompletionDate: timestamp('actual_completion_date'),
  forecastErrorDays: real('forecast_error_days'),
  // Cancellation Information
  isCancelled: boolean('is_cancelled').default(false),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  // Verification Information
  isVerified: boolean('is_verified').default(false),
  // Date Tracking Information
  isManualDueDate: boolean('is_manual_due_date').default(false),
  isManualOrderDate: boolean('is_manual_order_date').default(false),
  // Alt Ship To Address Information
  hasAltShipTo: boolean('has_alt_ship_to').default(false),
  altShipToCustomerId: text('alt_ship_to_customer_id'), // Reference to existing customer
  altShipToName: text('alt_ship_to_name'), // Manual entry name
  altShipToCompany: text('alt_ship_to_company'), // Manual entry company
  altShipToEmail: text('alt_ship_to_email'), // Manual entry email
  altShipToPhone: text('alt_ship_to_phone'), // Manual entry phone
  altShipToAddress: jsonb('alt_ship_to_address'), // Manual entry address object
  // Special Shipping Instructions
  specialShippingInternational: boolean(
    'special_shipping_international'
  ).default(false),
  specialShippingNextDayAir: boolean('special_shipping_next_day_air').default(
    false
  ),
  specialShippingBillToReceiver: boolean(
    'special_shipping_bill_to_receiver'
  ).default(false),
  // Technician Assignment
  assignedTechnician: text('assigned_technician'),
  // Priority and Urgency Information
  urgency: text('urgency').default('low'), // 'critical', 'high', 'medium', 'low'
  priorityScore: integer('priority_score').default(9999), // DEPRECATED: Use computeEffectivePriority() instead. Kept for backward compatibility.
  isManualUrgency: boolean('is_manual_urgency').default(false), // True if manually set by user
  // NEW: Unified Priority Model Fields
  manualPriorityOverride: integer('manual_priority_override'), // Admin-set priority (nullable, takes precedence when set)
  manualPriorityReason: text('manual_priority_reason'), // Reason for manual override
  manualPrioritySetBy: text('manual_priority_set_by'), // Who set the manual priority
  manualPrioritySetAt: timestamp('manual_priority_set_at'), // When manual priority was set
  prioritySource: text('priority_source').default('default'), // 'default' | 'urgency' | 'manual' | 'system'
  // Customer Signature Data
  signatureData: text('signature_data'), // Base64 signature image from customer
  signedAt: timestamp('signed_at'), // When customer signed the order
  // QD Same-Side Confirmation (when QD side matches handedness, which is unusual)
  qdSameSideConfirmed: boolean('qd_same_side_confirmed').default(false), // CSR confirmed with customer
  qdSameSideConfirmedBy: text('qd_same_side_confirmed_by'), // Who confirmed it (user ID or name)
  qdSameSideConfirmedAt: timestamp('qd_same_side_confirmed_at'), // When it was confirmed
  // RTS Order Tracking
  isRtsOrder: boolean('is_rts_order').default(false), // True if this order was created from RTS inventory sale
  rtsSaleId: text('rts_sale_id'), // Reference to RTS sale if applicable (stored as varchar in DB)
  // BOM Reference for Costing and MRP
  bomDefinitionId: text('bom_definition_id'), // Store BOM definition ID as text for production compatibility
  // Production Queue Eligibility
  productionReadinessStatus: text('production_readiness_status').default('pending'), // 'ready', 'missing_model', 'missing_action_length', 'pending'
  // Bottom Metal Demand Tracking
  bottomMetalSource: text('bottom_metal_source').default('AG_SUPPLIES'), // 'AG_SUPPLIES' or 'CUSTOMER_OWNS'
  // Additional Department Completion Timestamps (populated by department transitions)
  p1ProductionQueueCompletedAt: timestamp('p1_production_queue_completed_at'),
  layupPluggingCompletedAt: timestamp('layup_plugging_completed_at'),
  barcodeCompletedAt: timestamp('barcode_completed_at'),
  finishAssignmentCompletedAt: timestamp('finish_assignment_completed_at'),
  qcFinishCompletedAt: timestamp('qc_finish_completed_at'),
  qcShippingCompletedAt: timestamp('qc_shipping_completed_at'),
  // Calculated total (used for payment and discount calculations)
  calculatedTotal: numeric('calculated_total'),
  // Order source as separate column (SALES, PO_RELEASE) — distinct from legacy 'source' column
  orderSourceV2: text('order_source').default('SALES'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Legacy orders table - keeping for compatibility
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  customer: text('customer').notNull(),
  product: text('product').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull(),
  statusId: integer('status_id').references(() => orderStatusTypes.id),
  date: timestamp('date').notNull(),
  // Department progression fields
  currentDepartment: text('current_department')
    .default('P1 Production Queue')
    .notNull(),
  currentDepartmentId: integer('current_department_id').references(() => orderDepartmentTypes.id),
  isOnSchedule: boolean('is_on_schedule').default(true),
  priorityScore: integer('priority_score').default(9999), // DEPRECATED: Use computeEffectivePriority()
  rushTier: text('rush_tier'),
  poId: text('po_id'),
  dueDate: timestamp('due_date'),
  departmentHistory: json('department_history'),
  // Track department completion timestamps
  productionQueueCompletedAt: timestamp('production_queue_completed_at'),
  layupPluggingCompletedAt: timestamp('layup_plugging_completed_at'),
  layupCompletedAt: timestamp('layup_completed_at'),
  pluggingCompletedAt: timestamp('plugging_completed_at'),
  barcodeCompletedAt: timestamp('barcode_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingQcCompletedAt: timestamp('shipping_qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  // Scrapping fields
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  isReplacement: boolean('is_replacement').default(false),
  replacedOrderId: text('replaced_order_id'),
  // State confirmation fields for Attention & State-Confidence system
  viewedBy: jsonb('viewed_by').$type<Record<string, string>>().default(sql`'{}'::jsonb`), // { [userId]: ISO timestamp }
  lastConfirmedAt: timestamp('last_confirmed_at'), // When state was last confirmed as accurate
  lastConfirmedByUserId: integer('last_confirmed_by_user_id'), // Who confirmed the state
  confirmationNote: text('confirmation_note'), // Optional short note with confirmation
  attentionRisk: text('attention_risk').$type<'low' | 'medium' | 'high'>(), // Computed staleness risk level
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Linked Orders - Groups of orders that must be processed/shipped together
export const linkedOrderGroups = pgTable('linked_order_groups', {
  id: serial('id').primaryKey(),
  name: text('name'),
  requiresApprovalToSeparate: boolean('requires_approval_to_separate').default(true),
  approvalCode: text('approval_code'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const linkedOrders = pgTable('linked_orders', {
  id: serial('id').primaryKey(),
  linkGroupId: integer('link_group_id').references(() => linkedOrderGroups.id, { onDelete: 'cascade' }).notNull(),
  orderId: text('order_id').notNull().unique(),
  addedAt: timestamp('added_at').defaultNow(),
});

// Follow-up Orders - New orders that require customer signature before production
export const followupOrders = pgTable('followup_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  customerId: text('customer_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  // PUBLIC SIGNATURE ID: URL-safe identifier for signature links (no query params)
  // Format: sig_XXXXXXXX (8 uppercase alphanumeric chars)
  // This is the ONLY value exposed in URLs - never contains secrets
  publicSignatureId: text('public_signature_id').unique(),
  // SIGNATURE LINK CONTRACT: Environment field for cross-environment safety
  // Token must only be used in the environment it was created in
  environment: text('environment').default('dev'), // 'prod' or 'dev'
  // Email Tracking
  emailSent: boolean('email_sent').default(false),
  emailSentAt: timestamp('email_sent_at'),
  emailError: text('email_error'),
  // PDF Generation
  pdfGenerated: boolean('pdf_generated').default(false),
  pdfPath: text('pdf_path'),
  pdfGeneratedAt: timestamp('pdf_generated_at'),
  // SIGNATURE LINK CONTRACT: Token is SERVER-ONLY - never exposed in URLs
  // Used only for server-side authorization, never sent to client
  signatureToken: text('signature_token'), // Server-only secret for authorization
  signatureSigned: boolean('signature_signed').default(false),
  signatureData: text('signature_data'), // Base64 signature image
  signedAt: timestamp('signed_at'),
  signedPdfPath: text('signed_pdf_path'), // Path to PDF with embedded signature
  // Production Status
  movedToProduction: boolean('moved_to_production').default(false),
  movedToProductionAt: timestamp('moved_to_production_at'),
  // Reminder Tracking
  reminderSent: boolean('reminder_sent').default(false),
  reminderSentAt: timestamp('reminder_sent_at'),
  reminderCount: integer('reminder_count').default(0), // Number of reminder emails sent
  // Order Summary for Email Display
  orderSummary: jsonb('order_summary'), // Contains order details for email body
  // ORDER SNAPSHOT: Frozen order data captured at signature email creation
  // INVARIANT: Created ONLY during initial signature email, NEVER updated on resend
  // Used for SIGNATURE_EMAIL, RESEND_EMAIL, and SIGNED_ARCHIVE intents
  orderSnapshot: jsonb('order_snapshot'), // Complete order data frozen at creation time
  // SUPERSESSION TRACKING: When an updated order is sent, previous unsigned followups are superseded
  // Only ONE active (non-superseded, unsigned) followup_order per order at a time
  // Signed followups are IMMUTABLE and never superseded
  supersededAt: timestamp('superseded_at'), // When this followup was replaced by a newer one
  supersededBy: integer('superseded_by'), // ID of the followup order that replaced this one
  supersessionReason: text('supersession_reason'), // 'order_updated' | 'manual_invalidation' etc.
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Order Filter Presets - Save custom filter combinations for reporting
export const orderFilterPresets = pgTable('order_filter_presets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  filters: jsonb('filters').notNull(), // Stores filter criteria
  createdBy: text('created_by').notNull(),
  isShared: boolean('is_shared').default(false), // Whether preset is available to all users
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const csvData = pgTable('csv_data', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull(),
  data: jsonb('data').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export const customerTypes = pgTable('customer_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const persistentDiscounts = pgTable('persistent_discounts', {
  id: serial('id').primaryKey(),
  customerTypeId: integer('customer_type_id')
    .references(() => customerTypes.id)
    .notNull(),
  name: text('name').notNull(), // e.g., "GB-20", "GB-25", "GB-30", "MIL/LEO"
  percent: integer('percent'), // null for fixed amount discounts
  fixedAmount: integer('fixed_amount'), // amount in cents for fixed discounts like MIL/LEO
  description: text('description'), // Optional description for the discount tier
  appliesTo: text('applies_to').default('stock_model').notNull(), // "total" or "stock_model"
  isActive: integer('is_active').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const shortTermSales = pgTable('short_term_sales', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  percent: integer('percent').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  appliesTo: text('applies_to').default('total').notNull(), // "total" or "stock_model"
  isActive: integer('is_active').default(1).notNull(),
  // Override fields for CSR administrative corrections
  overrideActive: boolean('override_active').default(false).notNull(), // When true, allows use regardless of expiration
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit table for promo code override actions
export const promoCodeOverrideAudit = pgTable('promo_code_override_audit', {
  id: serial('id').primaryKey(),
  promoCodeId: integer('promo_code_id').references(() => shortTermSales.id).notNull(),
  userId: text('user_id').notNull(), // Username of CSR who made the override
  previousStatus: boolean('previous_status').notNull(), // overrideActive value before change
  newStatus: boolean('new_status').notNull(), // overrideActive value after change
  reason: text('reason').notNull(), // Required reason for the override
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const featureCategories = pgTable('feature_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const featureSubCategories = pgTable('feature_sub_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  categoryId: text('category_id').references(() => featureCategories.id),
  price: real('price').default(0),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const features = pgTable('features', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  type: text('type').notNull(), // 'dropdown', 'combobox', 'text', 'number', 'checkbox', 'textarea'
  required: boolean('required').default(false),
  placeholder: text('placeholder'),
  options: json('options'), // JSON array for dropdown options
  validation: json('validation'), // JSON object for validation rules
  category: text('category').references(() => featureCategories.id),
  subCategory: text('sub_category').references(() => featureSubCategories.id),
  price: real('price').default(0),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const stockModels = pgTable('stock_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  price: real('price').notNull(),
  description: text('description'),
  handedness: text('handedness'), // "LH", "RH", null for ambidextrous
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Customer-specific pricing overrides (for future use)
export const customerStockModelPrices = pgTable('customer_stock_model_prices', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id').notNull(), // Customer identifier
  stockModelId: text('stock_model_id')
    .references(() => stockModels.id)
    .notNull(),
  customPrice: real('custom_price').notNull(),
  notes: text('notes'), // Optional notes about why this customer has special pricing
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Bulk payment batches table for grouping bulk payment submissions
export const bulkPaymentBatches = pgTable('bulk_payment_batches', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').notNull(),
  customerId: text('customer_id').notNull(),
  totalAmount: real('total_amount').notNull(),
  paymentMethod: text('payment_method').notNull(),
  notes: text('notes'),
});

export const insertBulkPaymentBatchSchema = createInsertSchema(bulkPaymentBatches).omit({ id: true, createdAt: true });
export type BulkPaymentBatch = typeof bulkPaymentBatches.$inferSelect;
export type InsertBulkPaymentBatch = z.infer<typeof insertBulkPaymentBatchSchema>;

// Payments table for multiple payments per order
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: text('order_id')
    .references(() => allOrders.orderId)
    .notNull(),
  paymentType: text('payment_type').notNull(), // credit_card, agr, check, cash, ach, wire
  paymentAmount: real('payment_amount').notNull(),
  paymentDate: timestamp('payment_date').notNull(),
  notes: text('notes'), // Optional notes for the payment
  processingFee: real('processing_fee'), // Optional wire/bank processing fee (nullable)
  batchId: integer('batch_id').references(() => bulkPaymentBatches.id),
  status: text('status').default('posted').notNull(), // posted, pending_accounting_approval, voided, reversal
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
  reversalOfPaymentId: integer('reversal_of_payment_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Credit card transactions table for Authorize.Net integration
export const creditCardTransactions = pgTable('credit_card_transactions', {
  id: serial('id').primaryKey(),
  paymentId: integer('payment_id')
    .references(() => payments.id)
    .notNull(),
  orderId: text('order_id').notNull(),
  transactionId: text('transaction_id').notNull(), // Authorize.Net transaction ID
  authCode: text('auth_code'), // Authorization code from Authorize.Net
  responseCode: text('response_code'), // 1 = Approved, 2 = Declined, 3 = Error, 4 = Held for Review (nullable for auth failures)
  responseReasonCode: text('response_reason_code'), // Detailed reason code
  responseReasonText: text('response_reason_text'), // Human readable response
  avsResult: text('avs_result'), // Address Verification Service result
  cvvResult: text('cvv_result'), // Card Verification Value result
  cardType: text('card_type'), // Visa, MasterCard, etc.
  lastFourDigits: text('last_four_digits'), // Last 4 digits of card number
  amount: real('amount').notNull(),
  taxAmount: real('tax_amount').default(0),
  shippingAmount: real('shipping_amount').default(0),
  customerEmail: text('customer_email'),
  billingFirstName: text('billing_first_name'),
  billingLastName: text('billing_last_name'),
  billingAddress: text('billing_address'),
  billingCity: text('billing_city'),
  billingState: text('billing_state'),
  billingZip: text('billing_zip'),
  billingCountry: text('billing_country').default('US'),
  isTest: boolean('is_test').default(false), // Track if this was a test transaction
  rawResponse: jsonb('raw_response'), // Store full Authorize.Net response for debugging
  status: text('status').default('pending'), // pending, completed, failed, refunded, voided
  refundedAmount: real('refunded_amount').default(0),
  voidedAt: timestamp('voided_at'),
  refundedAt: timestamp('refunded_at'),
  processedAt: timestamp('processed_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Refund requests table for two-tiered refund system
export const refundRequests = pgTable('refund_requests', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // Reference to order
  refundType: text('refund_type'), // ORDER_TIME or POST_DELIVERY
  amount: real('amount'), // Alternative amount field
  reason: text('reason').notNull(), // Free-form reason for refund
  notes: text('notes'), // Additional notes
  status: text('status').default('PENDING').notNull(), // PENDING, APPROVED, REJECTED, PROCESSED
  requestedBy: text('requested_by').notNull(), // CSR username who requested refund
  requestedAt: timestamp('requested_at').defaultNow(), // When request was made
  approvedBy: text('approved_by'), // Manager username who approved/rejected
  approvedAt: timestamp('approved_at'), // When approved/rejected
  processedBy: text('processed_by'), // Who processed the refund
  processedAt: timestamp('processed_at'), // When refund was processed
  transactionId: text('transaction_id'), // Transaction ID
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  customerId: text('customer_id'), // Reference to customer (nullable for compatibility)
  refundAmount: real('refund_amount'), // Amount to be refunded
  rejectionReason: text('rejection_reason'), // Reason for rejection if applicable
  authNetTransactionId: text('auth_net_transaction_id'), // Authorize.Net refund transaction ID
  authNetRefundId: text('auth_net_refund_id'), // Authorize.Net refund reference
  originalTransactionId: text('original_transaction_id'), // Original transaction being refunded
  lastRemindedAt: timestamp('last_reminded_at'), // When the last pending-reminder was sent
});

export const forms = pgTable('forms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  fields: jsonb('fields').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const formSubmissions = pgTable('form_submissions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id')
    .references(() => forms.id)
    .notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Inventory Item Type Enums
export const inventoryItemTypeEnum = pgEnum('inventory_item_type', ['PURCHASED', 'MANUFACTURED']);
export const inventoryManufacturedCategoryEnum = pgEnum('inventory_manufactured_category', ['PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY', 'FINAL_ASSEMBLY', 'COMPOSITE', 'COMPONENT']);
export const inventoryManufacturingLevelEnum = pgEnum('inventory_manufacturing_level', ['COMPONENT', 'INTERMEDIATE', 'FINAL']);

// Manufacturing routing mapping — re-exported from canonical shared utility
export type { ManufacturedCategory, ManufacturingQueueType, ManufacturingSwimlane, SupplySourceDashboard } from '../shared/utils/manufacturingRouting';
export {
  getManufacturingCategoriesForDashboard,
  getManufacturingCategoriesForDepartment,
  getManufacturingRouteDefinition,
  getSupplySourceDashboard,
  supplySourceDashboardToLegacyDept,
  getDashboardCategories,
} from '../shared/utils/supplySourceDashboard';

// Inventory Management Tables
export const inventoryItems = pgTable('inventory_items', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  agPartNumber: text('ag_part_number').notNull().unique(), // AG Part#
  name: text('name').notNull(), // Name
  source: text('source'), // Source
  supplierPartNumber: text('supplier_part_number'), // Supplier Part #
  orderUrl: text('order_url'), // Website link for ordering this item
  costPer: real('cost_per'), // Purchase cost from vendor (e.g., $491.20 for 80lb box)
  orderDate: date('order_date'), // Order Date
  notes: text('notes'), // Notes
  department: text('department'), // Dept. (legacy - kept for backward compatibility)
  assignedDepartments: jsonb('assigned_departments').$type<string[]>().default(sql`'[]'::jsonb`), // Departments that can request/use this part
  secondarySource: text('secondary_source'), // Secondary Source
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Legacy columns (preserved for data integrity)
  code: text('code'), // Legacy code field
  description: text('description'), // Legacy description
  category: text('category'), // Legacy category
  quantityInStock: integer('quantity_in_stock'), // Legacy quantity
  unitCost: real('unit_cost'), // Legacy unit cost
  supplier: text('supplier'), // Legacy supplier text field
  status: text('status'), // Legacy status
  onHand: integer('on_hand'), // On-hand quantity
  location: text('location'), // Storage location
  minimumStock: integer('minimum_stock'), // Minimum stock level
  lastUpdated: timestamp('last_updated'), // Last update timestamp
  committed: integer('committed'), // Committed quantity
  available: integer('available'), // Available quantity
  reorderPoint: integer('reorder_point'), // Reorder point
  // Current/Enhanced MRP columns
  sku: text('sku'), // SKU - Links to stock models (informational)
  secondarySupplierPartNumber: text('secondary_supplier_part_number'), // Secondary Supplier Part #
  vendorUnit: text('vendor_unit'), // Vendor's unit of sale (e.g., "BOX", "DRUM", "PAIL")
  purchaseUnitLabel: text('purchase_unit_label'), // Human-readable vendor unit (e.g., "80 lb box", "5 gallon pail")
  purchaseUnit: text('purchase_unit'), // Standard purchase unit for calculations (e.g., "lb", "gal")
  purchaseQuantity: real('purchase_quantity'), // Quantity in purchase unit per vendor unit (e.g., 80 lbs per BOX)
  consumptionRate: real('consumption_rate'), // Amount per item manufactured (e.g., 50 grams per rod)
  usageUnit: text('usage_unit'), // Unit of measurement for consumption (e.g., "g", "oz", "ea")
  cogsPerUnit: real('cogs_per_unit'), // Calculated or manual COGS per manufactured unit
  latestCost: real('latest_cost'), // Latest cost per usage unit (auto-calculated from PO receipts)
  allowManualCostOverride: boolean('allow_manual_cost_override').default(false), // Allow manual COGS override
  leadTimeDays: integer('lead_time_days'), // Lead time in days for forecasting/MRP
  isStockItem: boolean('is_stock_item').default(false), // Used in stock models
  utilizedInPL1: boolean('utilized_in_pl1').default(false), // Used in Production Line 1
  utilizedInPL2: boolean('utilized_in_pl2').default(false), // Used in Production Line 2
  utilizedInPL3: boolean('utilized_in_pl3').default(false), // Used in Production Line 3
  traceabilityRequired: boolean('traceability_required').default(false), // Traceability required for P2 items
  traceabilityFields: jsonb('traceability_fields').$type<string[]>().default(sql`'[]'::jsonb`), // Specific traceability fields required (Lot #, Batch #, Exp Date, Part #)
  utilizedInFacilities: boolean('utilized_in_facilities').default(false), // Used in Facilities
  utilizedInAdmin: boolean('utilized_in_admin').default(false), // Used in Admin
  utilizedInServices: boolean('utilized_in_services').default(false), // Used in Services
  isPacket: boolean('is_packet').default(false), // Packet item for cutting table BOM
  isPacketPart: boolean('is_packet_part').default(false), // Part of cutting table packet
  isFabric: boolean('is_fabric').default(false), // Fabric for cutting table
  type: text('type'), // Type: Purchased or Manufactured
  manufacturingDepartment: text('manufacturing_department'), // Manufacturing department: CNC, Cutting Table, or Cores (required when type is Manufactured)
  vendorId: integer('vendor_id').references(() => vendors.id), // Primary vendor for this part
  hasSds: boolean('has_sds').default(false), // Has Safety Data Sheet
  sdsFilePath: text('sds_file_path'), // Path to uploaded SDS PDF file
  hasTds: boolean('has_tds').default(false), // Has Technical Data Sheet
  tdsFilePath: text('tds_file_path'), // Path to uploaded TDS PDF file
  hasOtherDocs: boolean('has_other_docs').default(false), // Has Other Documents
  otherDocsFilePath: text('other_docs_file_path'), // Path to uploaded Other Docs PDF file
  assignedToAsset: text('assigned_to_asset'), // Asset this item is assigned to (name + tag from /assets)
  defaultOrderMethod: text('default_order_method'), // Default procurement method: 'PO', 'WEBSITE', or 'EMAIL'
  purchaseUnitId: integer('purchase_unit_id').references(() => units.id), // FK → units (measurement unit for purchasing)
  usageUnitId: integer('usage_unit_id').references(() => units.id), // FK → units (measurement unit for consumption)
  // Formal item type classification (replaces loose text `type` field)
  itemType: inventoryItemTypeEnum('item_type'), // PURCHASED | MANUFACTURED
  // Manufactured items only — category determines production routing
  manufacturedCategory: inventoryManufacturedCategoryEnum('manufactured_category'), // PACKET | KIT | MACHINED_PART | CORE | SUB_ASSEMBLY | ASSEMBLY | FINAL_ASSEMBLY | COMPOSITE | COMPONENT
  // Manufactured items only — production level independent of category
  manufacturingLevel: inventoryManufacturingLevelEnum('manufacturing_level'), // COMPONENT | INTERMEDIATE | FINAL
  // Machined parts only — type of machine required to produce the part
  machineType: text('machine_type'),
  machiningTimeMinutes: integer('machining_time_minutes'),
  // Required receiving documents — enforced on acceptance in Receiving Control Center
  requiresSds: boolean('requires_sds').notNull().default(false),
  requiresTds: boolean('requires_tds').notNull().default(false),
  requiresCoc: boolean('requires_coc').notNull().default(false),       // Certificate of Conformance
  requiresTestReport: boolean('requires_test_report').notNull().default(false),
  requiresPackingSlipPhoto: boolean('requires_packing_slip_photo').notNull().default(false),
  primaryImageMediaId: uuid('primary_image_media_id'),
  // Per-field traceability configuration — map of received_units field name → visibility setting
  // Fields: lotNumber, batchNumber, serialNumber, expirationDate, manufactureDate, heatLot, rollNumber, certReference
  // Values: 'required' | 'optional' | 'hidden'
  // When null/absent, all fields are treated as optional (legacy behavior)
  traceabilityFieldConfig: jsonb('traceability_field_config').$type<Record<string, 'required' | 'optional' | 'hidden'>>(),
  // Shelf-life & out-time policy (Task #165)
  shelfLifeControlled: boolean('shelf_life_controlled').notNull().default(false),
  frozenShelfLifeDays: integer('frozen_shelf_life_days'),
  roomTempShelfLifeDays: integer('room_temp_shelf_life_days'),
  defaultMaxOutTimeMinutes: integer('default_max_out_time_minutes'),
  outTimeEnforcementRequired: boolean('out_time_enforcement_required').notNull().default(false),
});

// Inventory Item Cost History - Tracks price changes over time
export const inventoryItemCostHistory = pgTable('inventory_item_cost_history', {
  id: serial('id').primaryKey(),
  inventoryItemId: integer('inventory_item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' })
    .notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id), // Which vendor supplied at this price
  receivedDate: timestamp('received_date').notNull(), // When this cost was recorded
  purchaseUnitCost: real('purchase_unit_cost').notNull(), // Cost per purchase unit (e.g., $491.20 per box)
  usageUnitCost: real('usage_unit_cost').notNull(), // Calculated cost per usage unit (e.g., $6.14 per lb)
  currency: text('currency').default('USD'), // Currency code
  poLineItemId: integer('po_line_item_id'), // Reference to the PO line item (optional)
  notes: text('notes'), // Additional notes about this cost entry
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => employees.id), // Who recorded this cost
});

// Item Groups for inventory categorization
export const itemGroups = pgTable('item_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Junction table for inventory items and groups (many-to-many)
export const inventoryItemGroups = pgTable('inventory_item_groups', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' })
    .notNull(),
  groupId: integer('group_id')
    .references(() => itemGroups.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueItemGroup: unique().on(table.itemId, table.groupId),
}));

// Vendor scope - individual items
export const vendorScopeItems = pgTable('vendor_scope_items', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id, { onDelete: 'cascade' })
    .notNull(),
  itemId: integer('item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueVendorItem: unique().on(table.vendorId, table.itemId),
}));

// Vendor scope - item groups
export const vendorScopeGroups = pgTable('vendor_scope_groups', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id, { onDelete: 'cascade' })
    .notNull(),
  groupId: integer('group_id')
    .references(() => itemGroups.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueVendorGroup: unique().on(table.vendorId, table.groupId),
}));

export const inventoryScans = pgTable('inventory_scans', {
  id: serial('id').primaryKey(),
  itemCode: text('item_code').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  expirationDate: date('expiration_date'),
  manufactureDate: date('manufacture_date'),
  lotNumber: text('lot_number'),
  batchNumber: text('batch_number'),
  aluminumHeatNumber: text('aluminum_heat_number'), // New field for P2 products
  barcode: text('barcode'), // 39-line barcode for P2 products
  receivingDate: date('receiving_date'), // Date when received
  technicianId: text('technician_id'),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

export const partsRequests = pgTable('parts_requests', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number').references(() => inventoryItems.agPartNumber), // Link to inventory item (nullable for ad-hoc requests)
  partNumber: text('part_number').notNull(), // Part number (can be AG part or external)
  partName: text('part_name').notNull(),
  requestedBy: text('requested_by').notNull(),
  requestedByUserId: integer('requested_by_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  requestedForEmployeeId: integer('requested_for_employee_id').references((): AnyPgColumn => employees.id, { onDelete: 'set null' }),
  requestedForDisplayName: text('requested_for_display_name'),
  productionLine: text('production_line'), // Optional P1/P2/P3 line requested for this part
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  department: text('department'), // Department name (legacy text field)
  departmentId: integer('department_id').references(() => inventoryDepartments.id, { onDelete: 'set null' }), // FK to inventory_departments
  quantity: integer('quantity').notNull(),
  urgency: text('urgency').notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  supplier: text('supplier'),
  estimatedCost: real('estimated_cost'),
  reason: text('reason'), // Why the part is needed
  status: text('status').default('PENDING').notNull(), // PENDING, APPROVED, ORDERED, RECEIVED, DELIVERED_TO_DEPT, REJECTED
  approvalRequiredRole: text('approval_required_role').default('INVENTORY_MANAGER'), // INVENTORY_MANAGER, OWNER
  approvalStatus: text('approval_status').default('PENDING'), // PENDING, OWNER_PENDING, APPROVED, REJECTED
  ownerApprovedBy: text('owner_approved_by'),
  ownerApprovedAt: timestamp('owner_approved_at'),
  digitalApprovalSignature: text('digital_approval_signature'),
  approvalHistory: jsonb('approval_history').$type<Array<Record<string, unknown>>>().default(sql`'[]'::jsonb`),
  requestDate: timestamp('request_date').defaultNow().notNull(),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  orderDate: timestamp('order_date'),
  expectedDelivery: date('expected_delivery'),
  actualDelivery: date('actual_delivery'),
  deliveredToDepartment: timestamp('delivered_to_department'), // When parts were turned over to requesting department
  receivedByDepartment: text('received_by_department'), // Who in the department received the parts
  vendorPoId: integer('vendor_po_id').references(() => vendorPOs.id), // Link to vendor PO if ordered
  vendorId: integer('vendor_id').references(() => vendors.id), // Assigned vendor for ordering
  orderMethod: text('order_method'), // 'PO', 'WEBSITE', 'EMAIL', or operational methods such as 'LOCAL_PICKUP'
  vendorPartNumber: text('vendor_part_number'),
  productUrl: text('product_url'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  catalogFixNeeded: boolean('catalog_fix_needed').default(false),
  outOfDeptReason: text('out_of_dept_reason'),
  cancelReason: text('cancel_reason'),
  cancelRequestedAt: timestamp('cancel_requested_at'),
  cancelRequestedBy: text('cancel_requested_by'),
  rejectionReason: text('rejection_reason'),
  rejectedBy: text('rejected_by'),
  rejectedAt: timestamp('rejected_at'),
  batchId: integer('batch_id'),
  qtyOrdered: integer('qty_ordered').default(0),
  qtyReceived: integer('qty_received').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partsRequestBatches = pgTable('parts_request_batches', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').references(() => vendors.id),
  vendorName: text('vendor_name'),
  orderMethod: text('order_method'),
  status: text('status').default('CREATED').notNull(),
  createdBy: text('created_by').notNull(),
  notes: text('notes'),
  orderDate: timestamp('order_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partsRequestOrderLines = pgTable('parts_request_order_lines', {
  id: serial('id').primaryKey(),
  batchId: integer('batch_id').references(() => partsRequestBatches.id).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id),
  partNumber: text('part_number'),
  partName: text('part_name'),
  agPartNumber: text('ag_part_number'),
  qtyOrdered: integer('qty_ordered').notNull().default(0),
  qtyReceived: integer('qty_received').notNull().default(0),
  unitCost: real('unit_cost'),
  status: text('status').default('ORDERED').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partsRequestOrderAllocations = pgTable('parts_request_order_allocations', {
  id: serial('id').primaryKey(),
  orderLineId: integer('order_line_id').references(() => partsRequestOrderLines.id).notNull(),
  partsRequestId: integer('parts_request_id').references(() => partsRequests.id).notNull(),
  qtyAllocated: integer('qty_allocated').notNull().default(0),
  qtyReceivedApplied: integer('qty_received_applied').notNull().default(0),
  departmentId: integer('department_id').references(() => departments.id),
  status: text('status').default('ALLOCATED').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partsRequestReceipts = pgTable('parts_request_receipts', {
  id: serial('id').primaryKey(),
  batchId: integer('batch_id').references(() => partsRequestBatches.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  receivedBy: text('received_by').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const partsRequestReceiptLines = pgTable('parts_request_receipt_lines', {
  id: serial('id').primaryKey(),
  receiptId: integer('receipt_id').references(() => partsRequestReceipts.id),
  orderLineId: integer('order_line_id').references(() => partsRequestOrderLines.id),
  partsRequestId: integer('parts_request_id').references(() => partsRequests.id),
  qtyReceived: integer('qty_received').notNull(),
  allocatedDepartmentId: integer('allocated_department_id').references(() => departments.id),
  allocationNotes: text('allocation_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const partsRequestStatusHistory = pgTable('parts_request_status_history', {
  id: serial('id').primaryKey(),
  partsRequestId: integer('parts_request_id').references(() => partsRequests.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedBy: text('changed_by').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Ready to Sell (RTS) Inventory - Finished products on hand
export const rtsInventory = pgTable('rts_inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  rtsNumber: text('rts_number')
    .notNull()
    .unique()
    .default(sql`'RTS-I-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('rts_item_number_seq')::text, 6, '0')`),
  stockModel: text('stock_model').notNull(),
  actionLength: text('action_length'),
  action: text('action'),
  barrel: text('barrel'),
  bottomMetal: text('bottom_metal'),
  color: text('color'),
  extras: text('extras'), // Order/identifier codes
  lastDepartment: text('last_department'), // Last completed production department before RTS
  price: real('price'), // Sale price for this item
  status: text('status').notNull().default('AVAILABLE'), // AVAILABLE, SHIPPED, IN_PRODUCTION, SOLD, REMOVED
  currentDepartment: text('current_department'), // If sent back to production
  returnReason: text('return_reason'), // Why sent back to production
  returnNotes: text('return_notes'), // Notes about changes needed
  shippedDate: timestamp('shipped_date'),
  shippedBy: text('shipped_by'),
  returnedToProductionDate: timestamp('returned_to_production_date'),
  returnedBy: text('returned_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// RTS Inventory Action History
export const rtsInventoryHistory = pgTable('rts_inventory_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  rtsInventoryId: uuid('rts_inventory_id').references(() => rtsInventory.id).notNull(),
  action: text('action').notNull(), // CREATED, SHIPPED, RETURNED_TO_PRODUCTION
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  department: text('department'), // Department sent to
  reason: text('reason'),
  notes: text('notes'),
  performedBy: text('performed_by').notNull(),
  performedAt: timestamp('performed_at').defaultNow(),
});

// RTS Sales Transactions - Track sales of RTS inventory to customers
export const rtsSales = pgTable('rts_sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleNumber: text('sale_number').notNull(), // e.g., RTS-2024-001
  customerId: text('customer_id').notNull(),
  orderId: text('order_id'), // Reference to order created for this sale
  // Shipping Information
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier').default('UPS'),
  shippingMethod: text('shipping_method'),
  shippingCost: real('shipping_cost'),
  shippingLabelUrl: text('shipping_label_url'), // URL to shipping label PDF
  // Ship To Address
  shipToName: text('ship_to_name'),
  shipToCompany: text('ship_to_company'),
  shipToStreet: text('ship_to_street'),
  shipToStreet2: text('ship_to_street2'),
  shipToCity: text('ship_to_city'),
  shipToState: text('ship_to_state'),
  shipToZipCode: text('ship_to_zip_code'),
  shipToCountry: text('ship_to_country').default('US'),
  shipToPhone: text('ship_to_phone'),
  isResidential: boolean('is_residential').default(true),
  // Pricing
  subtotal: real('subtotal'),
  tax: real('tax'),
  totalAmount: real('total_amount'),
  // Payment
  paymentStatus: text('payment_status').default('UNPAID'), // UNPAID, PARTIAL, PAID
  amountPaid: real('amount_paid').default(0),
  balanceDue: real('balance_due'),
  // Status
  status: text('status').default('PENDING'), // PENDING, LABELED, SHIPPED, DELIVERED
  // Dates
  saleDate: timestamp('sale_date').defaultNow(),
  shippedDate: timestamp('shipped_date'),
  deliveredDate: timestamp('delivered_date'),
  // Notes
  notes: text('notes'),
  // Audit
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// RTS Sales Line Items - Individual items sold in each transaction
export const rtsSaleItems = pgTable('rts_sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  rtsSaleId: uuid('rts_sale_id').references(() => rtsSales.id).notNull(),
  rtsInventoryId: uuid('rts_inventory_id').references(() => rtsInventory.id).notNull(),
  // Snapshot of item details at time of sale
  stockModel: text('stock_model').notNull(),
  actionLength: text('action_length'),
  action: text('action'),
  barrel: text('barrel'),
  bottomMetal: text('bottom_metal'),
  color: text('color'),
  extras: text('extras'),
  // Pricing
  unitPrice: real('unit_price').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  lineTotal: real('line_total').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Canonical Identities - Central identity management for cross-system deduplication
export const canonicalIdentities = pgTable('canonical_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayName: text('display_name').notNull(),
  primaryEmail: text('primary_email').unique(),
  source: text('source').notNull().default('epoch'), // epoch, timeclock, external
  status: text('status').notNull().default('active'), // active, inactive, merged
  mergedIntoId: uuid('merged_into_id'), // If merged, points to surviving identity
  metadata: jsonb('metadata'), // Additional identity attributes
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


// Enhanced Employee Management System
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  employeeCode: text('employee_code'), // Constraint exists in production as employees_employee_code_unique
  canonicalId: uuid('canonical_id'), // Link to canonical identity for cross-system deduplication
  name: text('name').notNull(),
  preferredName: text('preferred_name'), // Name employee goes by (optional)
  email: text('email'),
  phone: text('phone'),
  jobTitle: text('job_title'), // Informational only - e.g., "Department Manager", "HR Specialist"
  userRole: text('user_role').notNull().default('EMPLOYEE'), // ADMIN, EMPLOYEE, OWNER - system access level
  department: text('department'),
  hireDate: date('hire_date'),
  dateOfBirth: date('date_of_birth'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  emergencyContact: text('emergency_contact'),
  emergencyPhone: text('emergency_phone'),
  gateCardNumber: text('gate_card_number'),
  vehicleType: text('vehicle_type'),
  vehicleMakeModel: text('vehicle_make_model'), // e.g., "Toyota Camry"
  licensePlate: text('license_plate'),
  driversLicenseNumber: text('drivers_license_number'),
  driversLicenseState: text('drivers_license_state'),
  driversLicenseExpiration: date('drivers_license_expiration'), // For tracking expiring licenses
  bankName: text('bank_name'),
  bankRoutingNumber: text('bank_routing_number'),
  bankAccountNumber: text('bank_account_number'),
  bankAccountType: text('bank_account_type'), // 'checking' or 'savings'
  buildingKeyAccess: boolean('building_key_access').default(false),
  tciAccess: boolean('tci_access').default(false),
  employmentType: text('employment_type').default('FULL_TIME'), // FULL_TIME, PART_TIME, CONTRACT
  employmentStatus: text('employment_status').notNull().default('ACTIVE'), // ACTIVE, TERMINATED, LEAVE, CONTRACTOR
  terminationDate: date('termination_date'),
  terminationReasonCode: text('termination_reason_code'),
  terminationReason: text('termination_reason'),
  eligibleForRehire: boolean('eligible_for_rehire'),
  finalPaycheckDate: date('final_paycheck_date'),
  terminationNotes: text('termination_notes'),
  terminatedByUserId: integer('terminated_by_user_id').references((): AnyPgColumn => users.id),
  terminatedByName: text('terminated_by_name'),
  terminatedAt: timestamp('terminated_at'),
  payType: text('pay_type'), // 'HOURLY' | 'SALARY'
  hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }),
  salary: numeric('salary', { precision: 12, scale: 2 }),
  portalToken: text('portal_token'), // UUID for employee portal access
  portalTokenExpiry: timestamp('portal_token_expiry'),
  isFinishTechnician: boolean('is_finish_technician').default(false), // Mark employee as Finish technician for department assignments
  isToleranceAuthorizer: boolean('is_tolerance_authorizer').default(false), // Can approve tolerance deviations for P2 orders
  badgeScanCode: text('badge_scan_code').unique(), // Non-guessable UUID encoded in physical badge barcode - not printed visibly
  isActive: boolean('is_active').default(true),
  timekeeperPin: text('timekeeper_pin'), // bcrypt-hashed PIN for kiosk authentication — canonical PIN source for timekeeping module
  timezone: text('timezone').notNull().default('UTC'), // Employee's local timezone for punch time calculations
  supervisorEmployeeId: integer('supervisor_employee_id').references((): AnyPgColumn => employees.id), // Nullable supervisor assignment for PTO routing
  notificationPreferences: jsonb('notification_preferences')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Certifications Management
export const certifications = pgTable('certifications', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name').notNull(),
  description: text('description'),
  category: varchar('category'),
  validityPeriodMonths: integer('validity_period_months'),
  isRequired: boolean('is_required'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  issuingOrganization: varchar('issuing_organization'),
  validityPeriod: integer('validity_period'),
  requirements: text('requirements'),
  isActive: boolean('is_active'),
  requirementsData: jsonb('requirements_data'),
  workInstructions: text('work_instructions'),
});

// Employee Evaluations
export const evaluations = pgTable('evaluations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  evaluatorId: integer('evaluator_id')
    .references(() => employees.id)
    .notNull(),
  evaluationType: text('evaluation_type').notNull(), // ANNUAL, QUARTERLY, PROBATIONARY, PROJECT_BASED
  evaluationPeriodStart: date('evaluation_period_start').notNull(),
  evaluationPeriodEnd: date('evaluation_period_end').notNull(),
  overallRating: integer('overall_rating'), // 1-5 scale
  performanceGoals: jsonb('performance_goals'), // JSON array of goals
  achievements: text('achievements'),
  areasForImprovement: text('areas_for_improvement'),
  developmentPlan: text('development_plan'),
  comments: text('comments'),
  employeeComments: text('employee_comments'),
  status: text('status').default('DRAFT'), // DRAFT, SUBMITTED, REVIEWED, COMPLETED
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Document Storage for Employee Files
export const employeeDocuments = pgTable('employee_documents', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  documentType: text('document_type').notNull(), // CERTIFICATE, HANDBOOK, CONTRACT, ID, etc.
  fileName: text('file_name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: text('uploaded_by'), // Changed from user ID reference to text field
  isConfidential: boolean('is_confidential').default(false),
  tags: text('tags').array(), // Array of tags for organization
  description: text('description'),
  expiryDate: date('expiry_date'), // For documents that expire
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Audit Trail for Employee Actions
export const employeeAuditLog = pgTable('employee_audit_log', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  action: text('action').notNull(), // LOGIN, LOGOUT, DOCUMENT_VIEW, DOCUMENT_UPLOAD, etc.
  resourceType: text('resource_type'), // DOCUMENT, EVALUATION, CERTIFICATION
  resourceId: text('resource_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Admin Panel Audit Log - Track all admin panel order changes
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: serial('id').primaryKey(),
    orderId: text('order_id').notNull(), // Order being modified
    fieldName: text('field_name').notNull(), // Field that was changed (e.g., 'assigned_technician')
    fieldLabel: text('field_label').notNull(), // Human-readable field name (e.g., 'Assigned Technician')
    oldValue: jsonb('old_value'), // Previous value (preserves type)
    newValue: jsonb('new_value'), // New value (preserves type)
    changedBy: text('changed_by').notNull(), // Username of person who made the change
    userRole: text('user_role').notNull(), // Role of person who made the change (ADMIN, OWNER, EMPLOYEE)
    changeType: text('change_type').notNull(), // INLINE, SIDE_PANEL, BULK
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for query performance
    orderIdIdx: index('admin_audit_order_id_idx').on(table.orderId),
    changedByIdx: index('admin_audit_changed_by_idx').on(table.changedBy),
    timestampIdx: index('admin_audit_timestamp_idx').on(table.timestamp),
    orderTimeIdx: index('admin_audit_order_time_idx').on(
      table.orderId,
      table.timestamp
    ),
  })
);

// Training Modules - Store training content
export const trainingModules = pgTable('training_modules', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  content: text('content'), // Rich text content or markdown
  contentHtml: text('content_html'), // HTML version of content
  category: text('category'), // SAFETY, TECHNICAL, COMPLIANCE, QUALITY, etc.
  estimatedMinutes: integer('estimated_minutes').default(30),
  passingScore: integer('passing_score').default(80), // Percentage
  requiresCertification: boolean('requires_certification').default(false),
  certificationId: integer('certification_id').references(
    () => certifications.id
  ),
  pdfSource: text('pdf_source'), // URL or path to source PDF if imported
  version: integer('version').default(1),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Questions - Quiz questions for modules
export const trainingQuestions = pgTable('training_questions', {
  id: serial('id').primaryKey(),
  moduleId: integer('module_id')
    .references(() => trainingModules.id)
    .notNull(),
  questionText: text('question_text').notNull(),
  questionType: text('question_type').notNull().default('MULTIPLE_CHOICE'), // MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER
  correctAnswer: text('correct_answer'), // For TRUE_FALSE or SHORT_ANSWER
  explanation: text('explanation'), // Explanation of the correct answer
  points: integer('points').default(1),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Question Options - Multiple choice options
export const trainingQuestionOptions = pgTable('training_question_options', {
  id: serial('id').primaryKey(),
  questionId: integer('question_id')
    .references(() => trainingQuestions.id)
    .notNull(),
  optionText: text('option_text').notNull(),
  isCorrect: boolean('is_correct').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Training Records - Track completed training
export const employeeTrainingRecords = pgTable('employee_training_records', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  moduleId: integer('module_id')
    .references(() => trainingModules.id)
    .notNull(),
  status: text('status').notNull().default('NOT_STARTED'), // NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  score: integer('score'), // Percentage score
  attempts: integer('attempts').default(0),
  certificateIssued: boolean('certificate_issued').default(false),
  certificateNumber: text('certificate_number'),
  certificateUrl: text('certificate_url'), // URL to generated certificate PDF
  expiryDate: timestamp('expiry_date'), // If certification expires
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Quiz Attempts - Detailed quiz attempt records
export const employeeQuizAttempts = pgTable('employee_quiz_attempts', {
  id: serial('id').primaryKey(),
  trainingRecordId: integer('training_record_id')
    .references(() => employeeTrainingRecords.id)
    .notNull(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  moduleId: integer('module_id')
    .references(() => trainingModules.id)
    .notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  answers: jsonb('answers'), // JSON array of {questionId, answer, isCorrect}
  score: integer('score'), // Percentage
  passed: boolean('passed').default(false),
  timeSpentSeconds: integer('time_spent_seconds'),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Matrix - Legacy training matrix and requirements
export const trainingMatrix = pgTable('training_matrix', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id),
  employeeName: text('employee_name'), // For legacy data without employee_id
  jobTitle: text('job_title'),
  department: text('department'),
  trainingName: text('training_name').notNull(),
  requiredBy: text('required_by'), // JOB_ROLE, DEPARTMENT, REGULATORY, etc.
  frequency: text('frequency'), // ONCE, ANNUAL, QUARTERLY, MONTHLY
  lastCompleted: timestamp('last_completed'),
  lastScore: integer('last_score'), // Most recent quiz score percentage
  nextDue: timestamp('next_due'),
  status: text('status').default('PENDING'), // PENDING, COMPLETED, OVERDUE, NOT_REQUIRED
  documentationUrl: text('documentation_url'),
  notes: text('notes'),
  isLegacy: boolean('is_legacy').default(false), // Mark imported legacy data
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Programs - Structured training program definitions
export const trainingPrograms = pgTable('training_programs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  role: text('role').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Program Tasks - Individual tasks within a program
export const trainingProgramTasks = pgTable('training_program_tasks', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').references(() => trainingPrograms.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  estimatedMinutes: integer('estimated_minutes'),
  dayNumber: integer('day_number').default(1), // Which day of training this task is on
  requiresObservation: boolean('requires_observation').default(false), // Trainer must observe for certification
  // AI-generated 4-step training content
  step1Content: text('step1_content'), // Step 1: Trainer Does/Explains
  step2Content: text('step2_content'), // Step 2: Trainer Does/Trainee Explains
  step3Content: text('step3_content'), // Step 3: Trainee Does/Trainer Coaches
  step4Content: text('step4_content'), // Step 4: Trainee Does/Trainer Observes
  trainingMaterialId: integer('training_material_id'), // Link to training topic/document
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Assignments - Assign programs to employees (trainees) with optional trainer
export const trainingAssignments = pgTable('training_assignments', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').references(() => trainingPrograms.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(), // Trainee
  trainerId: integer('trainer_id').references(() => employees.id), // Assigned trainer
  assignedBy: integer('assigned_by'),
  startDate: timestamp('start_date').defaultNow(),
  dueDate: timestamp('due_date'),
  status: text('status').default('pending'), // pending, in_progress, completed
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  partNumber: text('part_number'), // Optional: when set, certifications from this assignment inherit this part number
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Builder Sessions - Active sessions for training program execution
export const trainingBuilderSessions = pgTable('training_builder_sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  assignmentId: integer('assignment_id').references(() => trainingAssignments.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  programId: integer('program_id').references(() => trainingPrograms.id).notNull(),
  status: text('status').default('active'), // active, completed
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  supervisorSignoff: integer('supervisor_signoff'),
  signoffNotes: text('signoff_notes'),
  signoffAt: timestamp('signoff_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Builder Task Progress - Track completion of individual tasks in a session
export const trainingBuilderTaskProgress = pgTable('training_builder_task_progress', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => trainingBuilderSessions.id).notNull(),
  taskId: integer('task_id').references(() => trainingProgramTasks.id).notNull(),
  status: text('status').default('pending'), // pending, completed
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  // 4-step progression tracking
  currentStep: integer('current_step').default(1), // 1-4
  step1CompletedAt: timestamp('step1_completed_at'),
  step2CompletedAt: timestamp('step2_completed_at'),
  step3CompletedAt: timestamp('step3_completed_at'),
  step4CompletedAt: timestamp('step4_completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Program Quiz References - Link programs/tasks to quiz questions
export const trainingProgramQuizRefs = pgTable('training_program_quiz_refs', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').references(() => trainingPrograms.id).notNull(),
  taskId: integer('task_id').references(() => trainingProgramTasks.id), // Optional: link to specific task
  dayNumber: integer('day_number').notNull(), // Which day this quiz appears
  quizQuestionId: integer('quiz_question_id').references(() => trainingQuestions.id), // Preferred: link to existing question
  questionDraft: jsonb('question_draft'), // Fallback: store question draft as JSON
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training SOA Daily Notes - Daily Strengths-Opportunities-Actions coaching notes
export const trainingSoaNotes = pgTable('training_soa_notes', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id').references(() => trainingAssignments.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  dayNumber: integer('day_number').notNull(), // Which day of training
  noteDate: timestamp('note_date').defaultNow().notNull(),
  // S-O-A Model fields
  strengths: text('strengths'), // What did the trainee do well?
  opportunities: text('opportunities'), // What could be improved?
  actions: text('actions'), // What will we do differently next time?
  // Additional notes
  generalNotes: text('general_notes'),
  trainerSignoff: boolean('trainer_signoff').default(false),
  traineeAcknowledged: boolean('trainee_acknowledged').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas for training program tables
export const insertTrainingProgramSchema = createInsertSchema(trainingPrograms).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingProgramTaskSchema = createInsertSchema(trainingProgramTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingAssignmentSchema = createInsertSchema(trainingAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingBuilderSessionSchema = createInsertSchema(trainingBuilderSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingBuilderTaskProgressSchema = createInsertSchema(trainingBuilderTaskProgress).omit({ id: true, createdAt: true });
export const insertTrainingProgramQuizRefSchema = createInsertSchema(trainingProgramQuizRefs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingSoaNoteSchema = createInsertSchema(trainingSoaNotes).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertTrainingProgram = z.infer<typeof insertTrainingProgramSchema>;
export type InsertTrainingProgramTask = z.infer<typeof insertTrainingProgramTaskSchema>;
export type InsertTrainingAssignment = z.infer<typeof insertTrainingAssignmentSchema>;
export type InsertTrainingBuilderSession = z.infer<typeof insertTrainingBuilderSessionSchema>;
export type InsertTrainingBuilderTaskProgress = z.infer<typeof insertTrainingBuilderTaskProgressSchema>;

export type TrainingProgram = typeof trainingPrograms.$inferSelect;
export type TrainingProgramTask = typeof trainingProgramTasks.$inferSelect;
export type TrainingAssignment = typeof trainingAssignments.$inferSelect;
export type TrainingBuilderSession = typeof trainingBuilderSessions.$inferSelect;
export type TrainingBuilderTaskProgress = typeof trainingBuilderTaskProgress.$inferSelect;
export type TrainingProgramQuizRef = typeof trainingProgramQuizRefs.$inferSelect;
export type InsertTrainingProgramQuizRef = z.infer<typeof insertTrainingProgramQuizRefSchema>;
export type TrainingSoaNote = typeof trainingSoaNotes.$inferSelect;
export type InsertTrainingSoaNote = z.infer<typeof insertTrainingSoaNoteSchema>;

// Work Instructions - Task-specific procedural documents with critical points and safety considerations
export const workInstructions = pgTable('work_instructions', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  processArea: text('process_area'), // Specific area like "Layup", "CNC", "Paint"
  documentNumber: text('document_number'), // WI-001, WI-002 format
  version: integer('version').default(1),
  status: text('status').default('draft'), // draft, active, archived
  // Structured content
  objective: text('objective'), // What the trainee will learn
  prerequisites: jsonb('prerequisites').$type<string[]>(), // Required prior training
  ppeRequired: jsonb('ppe_required').$type<string[]>(), // Safety equipment needed
  tools: jsonb('tools').$type<string[]>(), // Tools and materials needed
  steps: jsonb('steps').$type<{
    stepNumber: number;
    instruction: string;
    criticalPoint?: string;
    safetyNote?: string;
    imageUrl?: string;
  }[]>(), // Step-by-step procedures with critical points
  criticalPoints: jsonb('critical_points').$type<string[]>(), // Summary of all critical points
  safetyConsiderations: jsonb('safety_considerations').$type<string[]>(), // Summary of safety items
  qualityCheckpoints: jsonb('quality_checkpoints').$type<string[]>(), // Quality verification points
  estimatedMinutes: integer('estimated_minutes').default(30),
  createdBy: integer('created_by'),
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Task Work Instruction Links - Connect tasks to work instructions
export const trainingTaskWorkInstructions = pgTable('training_task_work_instructions', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => trainingProgramTasks.id).notNull(),
  workInstructionId: integer('work_instruction_id').references(() => workInstructions.id).notNull(),
  // 4-Step Training Model tracking
  trainingStep: integer('training_step').default(1), // 1-4 corresponding to the 4-step model
  stepDescription: text('step_description'), // e.g., "Trainer Does / Trainer Explains"
  createdAt: timestamp('created_at').defaultNow(),
});

// S-O-A Coaching Feedback - Track coaching feedback during training sessions
export const trainingSOAFeedback = pgTable('training_soa_feedback', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => trainingBuilderSessions.id).notNull(),
  taskId: integer('task_id').references(() => trainingProgramTasks.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  // S-O-A Model fields
  strength: text('strength'), // What did the trainee do well?
  opportunity: text('opportunity'), // What could be improved?
  action: text('action'), // What will we do differently next time?
  // 4-Step Model tracking
  currentStep: integer('current_step').default(1), // Which step of 4-step model
  stepCompleted: boolean('step_completed').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Builder Quizzes - Quiz definitions for competency verification (Training Builder module)
export const trainingBuilderQuizzes = pgTable('training_builder_quizzes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  programId: integer('program_id').references(() => trainingPrograms.id), // Optional link to program
  taskId: integer('task_id').references(() => trainingProgramTasks.id), // Optional link to specific task
  passingScore: integer('passing_score').default(80), // Percentage needed to pass
  maxAttempts: integer('max_attempts').default(3),
  timeLimitMinutes: integer('time_limit_minutes'),
  isActive: boolean('is_active').default(true),
  createdBy: integer('created_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Builder Quiz Questions - Individual quiz questions (Training Builder module)
export const trainingBuilderQuizQuestions = pgTable('training_builder_quiz_questions', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => trainingBuilderQuizzes.id).notNull(),
  questionText: text('question_text').notNull(),
  questionType: text('question_type').default('multiple_choice'), // multiple_choice, true_false, short_answer
  options: jsonb('options').$type<string[]>(), // Array of options for multiple choice
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'), // Shown after answer
  points: integer('points').default(1),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily Quiz Selections - Facility selects which quizzes to give each day
export const trainingDailyQuizSelections = pgTable('training_daily_quiz_selections', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => trainingBuilderQuizzes.id).notNull(),
  scheduledDate: timestamp('scheduled_date').notNull(),
  department: text('department'),
  selectedBy: integer('selected_by').references(() => employees.id),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Builder Quiz Attempts - Track employee quiz attempts (Training Builder module)
export const trainingBuilderQuizAttempts = pgTable('training_builder_quiz_attempts', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => trainingBuilderQuizzes.id).notNull(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  sessionId: integer('session_id').references(() => trainingBuilderSessions.id),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  score: integer('score'), // Percentage score
  passed: boolean('passed'),
  attemptNumber: integer('attempt_number').default(1),
  answers: jsonb('answers').$type<Record<number, string>>(), // questionId -> answer
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Certifications - Final certification when trainer observes trainee
export const trainingCertifications = pgTable('training_certifications', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id').references(() => trainingAssignments.id).notNull(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  programId: integer('program_id').references(() => trainingPrograms.id).notNull(),
  // Certification details
  observationDate: timestamp('observation_date').notNull(),
  allQuizzesPassed: boolean('all_quizzes_passed').default(false),
  allTasksCompleted: boolean('all_tasks_completed').default(false),
  trainerSignoff: boolean('trainer_signoff').default(false),
  trainerNotes: text('trainer_notes'),
  traineeSignoff: boolean('trainee_signoff').default(false),
  traineeNotes: text('trainee_notes'),
  // Status tracking
  status: text('status').default('pending'), // pending, certified, failed, revoked
  certifiedAt: timestamp('certified_at'),
  expiresAt: timestamp('expires_at'), // Optional expiration
  // Operation-level cert linkage: when set, this record satisfies the certifications.id requirement
  // on routing_operations.certification_id. Nullable for legacy records that pre-date this field.
  certificationId: integer('certification_id').references(() => certifications.id),
  partNumber: text('part_number'), // Optional: when set, this cert applies only to this part number
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas for Work Instructions and S-O-A tables
export const insertWorkInstructionSchema = createInsertSchema(workInstructions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingTaskWorkInstructionSchema = createInsertSchema(trainingTaskWorkInstructions).omit({ id: true, createdAt: true });
export const insertTrainingSOAFeedbackSchema = createInsertSchema(trainingSOAFeedback).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingBuilderQuizSchema = createInsertSchema(trainingBuilderQuizzes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingBuilderQuizQuestionSchema = createInsertSchema(trainingBuilderQuizQuestions).omit({ id: true, createdAt: true });
export const insertTrainingDailyQuizSelectionSchema = createInsertSchema(trainingDailyQuizSelections).omit({ id: true, createdAt: true });
export const insertTrainingBuilderQuizAttemptSchema = createInsertSchema(trainingBuilderQuizAttempts).omit({ id: true, createdAt: true });
export const insertTrainingCertificationSchema = createInsertSchema(trainingCertifications).omit({ id: true, createdAt: true, updatedAt: true });

export type WorkInstruction = typeof workInstructions.$inferSelect;
export type InsertWorkInstruction = z.infer<typeof insertWorkInstructionSchema>;
export type TrainingTaskWorkInstruction = typeof trainingTaskWorkInstructions.$inferSelect;
export type InsertTrainingTaskWorkInstruction = z.infer<typeof insertTrainingTaskWorkInstructionSchema>;
export type TrainingSOAFeedback = typeof trainingSOAFeedback.$inferSelect;
export type InsertTrainingSOAFeedback = z.infer<typeof insertTrainingSOAFeedbackSchema>;
export type TrainingBuilderQuiz = typeof trainingBuilderQuizzes.$inferSelect;
export type InsertTrainingBuilderQuiz = z.infer<typeof insertTrainingBuilderQuizSchema>;
export type TrainingBuilderQuizQuestion = typeof trainingBuilderQuizQuestions.$inferSelect;
export type InsertTrainingBuilderQuizQuestion = z.infer<typeof insertTrainingBuilderQuizQuestionSchema>;
export type TrainingDailyQuizSelection = typeof trainingDailyQuizSelections.$inferSelect;
export type InsertTrainingDailyQuizSelection = z.infer<typeof insertTrainingDailyQuizSelectionSchema>;
export type TrainingBuilderQuizAttempt = typeof trainingBuilderQuizAttempts.$inferSelect;
export type InsertTrainingBuilderQuizAttempt = z.infer<typeof insertTrainingBuilderQuizAttemptSchema>;
export type TrainingCertification = typeof trainingCertifications.$inferSelect;
export type InsertTrainingCertification = z.infer<typeof insertTrainingCertificationSchema>;

// User Authentication Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('EMPLOYEE'), // ADMIN, EMPLOYEE, OWNER
  employeeId: integer('employee_id').references(() => employees.id),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email'),
  canOverridePrices: boolean('can_override_prices').default(false),
  isFinishTechnician: boolean('is_finish_technician').default(false),
  isActive: boolean('is_active').default(true),
  accessStatus: text('access_status').notNull().default('ACTIVE'), // ACTIVE, DISABLED, LIMITED, EMERGENCY_ONLY
  accessExceptionReason: text('access_exception_reason'),
  accessExceptionApprovedByUserId: integer('access_exception_approved_by_user_id').references(() => users.id),
  accessExceptionApprovedByName: text('access_exception_approved_by_name'),
  accessExceptionApprovedAt: timestamp('access_exception_approved_at'),
  accessExceptionExpiresAt: timestamp('access_exception_expires_at'),
  lastLogin: timestamp('last_login'),
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  accountLockedUntil: timestamp('account_locked_until'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User Sessions Table
export const userSessions = pgTable('user_sessions', {
  id: serial('id').primaryKey(),
  sessionToken: text('session_token').notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  username: text('username').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: timestamp('last_activity_at'),
  isActive: boolean('is_active').default(true),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  mfaVerifiedAt: timestamp('mfa_verified_at'),
  securityPolicyVersion: text('security_policy_version').default('cmmc-itar-v1'),
  lastCredentialVerifiedAt: timestamp('last_credential_verified_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Action Tokens Table - Short-lived tokens for inline credential validation
// Used by Timer Station and other public-view pages for action-level auth
export const actionTokens = pgTable('action_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// User Integrations Table - OAuth connections for Google and Outlook
export const userIntegrations = pgTable('user_integrations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  integrationType: text('integration_type').notNull(), // 'google-drive', 'google-gmail', 'google-calendar', 'google-sheets', 'outlook'
  isConnected: boolean('is_connected').default(false),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  accountEmail: text('account_email'), // The email address of the connected account
  accountName: text('account_name'), // Display name of the connected account
  lastSyncedAt: timestamp('last_synced_at'),
  metadata: jsonb('metadata'), // Additional integration-specific metadata
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Capability-Based Permission System
export const capabilities = pgTable('capabilities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // e.g., "VIEW_ORDERS", "EDIT_INVENTORY", "APPROVE_PARTS_REQUESTS" (constraint exists in production as capabilities_name_key)
  displayName: text('display_name').notNull(), // e.g., "View Orders", "Edit Inventory"
  category: text('category').notNull(), // e.g., "ORDERS", "INVENTORY", "EMPLOYEES", "REPORTS"
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee-Capability Junction Table with toggle for hardcoded capabilities
export const employeeCapabilities = pgTable('employee_capabilities', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  capabilityId: integer('capability_id')
    .references(() => capabilities.id)
    .notNull(),
  grantedBy: text('granted_by'), // Username or system that granted this capability
  isHardcoded: boolean('is_hardcoded').default(false), // True if this is a hardcoded capability
  useHardcodedValue: boolean('use_hardcoded_value').default(true), // Toggle to enable/disable hardcoded capabilities
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Unique constraint exists in production as unique_employee_capability
});

// User-Capability Junction Table with toggle for hardcoded capabilities
export const userCapabilities = pgTable(
  'user_capabilities',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    capabilityId: integer('capability_id')
      .references(() => capabilities.id)
      .notNull(),
    grantedBy: text('granted_by'), // Username or system that granted this capability
    isHardcoded: boolean('is_hardcoded').default(false), // True if this is a hardcoded capability
    useHardcodedValue: boolean('use_hardcoded_value').default(true), // Toggle to enable/disable hardcoded capabilities
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    // Unique constraint to prevent duplicate capability grants
    uniqueUserCapability: unique().on(table.userId, table.capabilityId),
  })
);

// QC and Preventive Maintenance Tables
export const qcDefinitions = pgTable('qc_definitions', {
  id: serial('id').primaryKey(),
  line: text('line').notNull(), // P1, P2
  department: text('department').notNull(),
  final: boolean('final').default(false),
  key: text('key').notNull(),
  label: text('label').notNull(),
  type: text('type').notNull(), // checkbox, number, text
  required: boolean('required').default(false),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const qcSubmissions = pgTable('qc_submissions', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  line: text('line').notNull(),
  department: text('department').notNull(),
  sku: text('sku').notNull(),
  final: boolean('final').default(false),
  data: jsonb('data').notNull(),
  signature: text('signature'), // base64 encoded signature
  summary: text('summary'), // PASS, FAIL
  status: text('status').default('pending'), // pending, completed
  dueDate: timestamp('due_date'),
  submittedAt: timestamp('submitted_at').defaultNow(),
  submittedBy: text('submitted_by'),
});

export const maintenanceSchedules = pgTable('maintenance_schedules', {
  id: serial('id').primaryKey(),
  equipment: text('equipment').notNull(),
  frequency: text('frequency').notNull(), // ANNUAL, SEMIANNUAL, QUARTERLY, BIWEEKLY
  startDate: timestamp('start_date').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const maintenanceLogs = pgTable('maintenance_logs', {
  id: serial('id').primaryKey(),
  scheduleId: integer('schedule_id')
    .references(() => maintenanceSchedules.id)
    .notNull(),
  completedAt: timestamp('completed_at').notNull(),
  completedBy: text('completed_by'),
  notes: text('notes'),
  nextDueDate: timestamp('next_due_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const freezerTemperatureLogs = pgTable(
  'freezer_temperature_logs',
  {
    id: serial('id').primaryKey(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    freezer1Temperature: numeric('freezer_1_temperature', { precision: 6, scale: 2 }).notNull(),
    freezer2Temperature: numeric('freezer_2_temperature', { precision: 6, scale: 2 }).notNull(),
    freezer3Temperature: numeric('freezer_3_temperature', { precision: 6, scale: 2 }).notNull(),
    freezer4Temperature: numeric('freezer_4_temperature', { precision: 6, scale: 2 }).notNull(),
    layupRoomTemperature: numeric('layup_room_temperature', { precision: 6, scale: 2 }).notNull(),
    refrigeratorContainerTemperature: numeric('refrigerator_container_temperature', { precision: 6, scale: 2 }).notNull(),
    notes: text('notes'),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id).notNull(),
    recordedByDisplayName: text('recorded_by_display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recordedAtIdx: index('freezer_temperature_logs_recorded_at_idx').on(table.recordedAt),
  })
);

// Employee Portal & Time Keeping Tables
export const timeClockEntries = pgTable('time_clock_entries', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  clockIn: timestamp('clock_in', { withTimezone: true }),
  clockOut: timestamp('clock_out', { withTimezone: true }),
  date: date('date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  productionWorkOrderId: uuid('production_work_order_id'),
  travelerId: uuid('traveler_id'),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),
  operationBatchId: integer('operation_batch_id'),
  machineId: integer('machine_id'),
  machineName: text('machine_name'),
  department: text('department'),
  operation: text('operation'),
  chargeCode: text('charge_code'),
  approvalStatus: text('approval_status').default('AUTO'),
  laborApprovalId: integer('labor_approval_id').references((): AnyPgColumn => laborApprovals.id),
  laborBudgetOverrideId: integer('labor_budget_override_id').references((): AnyPgColumn => laborBudgetOverrides.id),
});

export const laborApprovals = pgTable('labor_approvals', {
  id: serial('id').primaryKey(),
  productionWorkOrderId: uuid('production_work_order_id').notNull(),
  employeeId: text('employee_id').notNull(),
  approvedBy: text('approved_by').notNull(),
  department: text('department'),
  reason: text('reason').notNull(),
  approvedAt: timestamp('approved_at').defaultNow(),
  hoursAtApproval: numeric('hours_at_approval'),
});

export const insertLaborApprovalSchema = createInsertSchema(laborApprovals).omit({ id: true, approvedAt: true });
export type LaborApproval = typeof laborApprovals.$inferSelect;
export type InsertLaborApproval = z.infer<typeof insertLaborApprovalSchema>;

// ─── LABOR BUDGET OVERRIDE REQUESTS ─────────────────────────────────────────
// Operators blocked by budget exhaustion can request a shift-level unlock;
// supervisors approve or deny the request in-app (DCAA-traceable).

export const laborBudgetOverrides = pgTable('labor_budget_overrides', {
  id: serial('id').primaryKey(),
  // FK to production_work_orders (forward ref — table defined later in schema)
  productionWorkOrderId: uuid('production_work_order_id').notNull(),
  // Operator identity (EPOCH standard: ID + display name snapshot)
  operatorEmployeeId: text('operator_employee_id').notNull(),
  operatorDisplayName: text('operator_display_name').notNull(),
  // What the operator is requesting
  requestedHours: numeric('requested_hours').notNull(),
  note: text('note'),
  // Workflow status: PENDING → APPROVED or DENIED
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'DENIED'
  // Supervisor identity — set when resolved
  supervisorEmployeeId: text('supervisor_employee_id'),
  supervisorDisplayName: text('supervisor_display_name'),
  supervisorNote: text('supervisor_note'),
  resolvedAt: timestamp('resolved_at'),
  // Time-boxed expiry for approved overrides (shift-level unlock)
  expiresAt: timestamp('expires_at'),
  // Consumed when the operator actually clocks in under this override
  consumedAt: timestamp('consumed_at'),
  requestedAt: timestamp('requested_at').defaultNow(),
});

export const insertLaborBudgetOverrideSchema = createInsertSchema(laborBudgetOverrides)
  .omit({ id: true, requestedAt: true, status: true, supervisorEmployeeId: true, supervisorDisplayName: true, supervisorNote: true, resolvedAt: true, expiresAt: true, consumedAt: true })
  .extend({
    requestedHours: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal'),
  });

export type LaborBudgetOverride = typeof laborBudgetOverrides.$inferSelect;
export type InsertLaborBudgetOverride = z.infer<typeof insertLaborBudgetOverrideSchema>;

// ── UNIFIED PUNCH LEDGER (Task #1186) ─────────────────────────────────────────
// Single source of truth for ALL labor events: Kiosk, Traveler scan, Portal.
// Replaces the dual-system: public.time_clock_entries + timekeeping.punches.
// source enum: KIOSK | TRAVELER | PORTAL | TIMETRAKGO_IMPORT | ADMIN
// laborClass: REGULAR | BREAK
// ─────────────────────────────────────────────────────────────────────────────
export const punchLedger = pgTable('punch_ledger', {
  id: serial('id').primaryKey(),

  // Employee identity (FK to public.employees — no free-text IDs)
  employeeId: integer('employee_id').notNull().references((): AnyPgColumn => employees.id),

  // Session boundaries
  clockIn: timestamp('clock_in', { withTimezone: true }).notNull().defaultNow(),
  clockOut: timestamp('clock_out', { withTimezone: true }),

  // Capture source
  source: text('source').notNull().default('KIOSK'), // KIOSK | TRAVELER | PORTAL | TIMETRAKGO_IMPORT | ADMIN

  // Labor attribution (nullable FKs — no free-text charge codes)
  travelerId: text('traveler_id').references((): AnyPgColumn => travelers.id),
  productionWorkOrderId: uuid('production_work_order_id').references((): AnyPgColumn => productionWorkOrders.id, { onDelete: 'set null' }),
  chargeCodeId: integer('charge_code_id').references((): AnyPgColumn => chargeCodes.id),
  chargeCode: text('charge_code'), // snapshot of code at time of punch
  department: text('department'),
  operation: text('operation'),
  laborClass: text('labor_class').default('REGULAR'), // REGULAR | BREAK

  // WAD/project traceability (Task #1235 — derived server-side, never from client)
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  clinId: integer('clin_id').references((): AnyPgColumn => projectClins.id, { onDelete: 'set null' }),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),

  // Certification and budget state at session/step start (phase 1: WARN policy)
  certificationStatus: text('certification_status'), // VALID | EXPIRED | MISSING
  isOverrun: boolean('is_overrun').notNull().default(false),
  overrunReason: text('overrun_reason'),

  // Budget / approval linkage
  overrideReason: text('override_reason'),
  // Allowed values: PENDING_APPROVAL | APPROVED | REJECTED | APPROVED_OVERRUN | FLAGGED | AUTO
  // Per Architecture Constitution §5.2 (Task #77): TRAVELER-source punches must enter as
  // PENDING_APPROVAL and may only become APPROVED via supervisor sign-off. AUTO is reserved
  // for non-WAD system-reconciliation entries (e.g., salaried draft posting, kiosk/portal
  // punches with no WAD link). A DB CHECK constraint forbids AUTO when source = 'TRAVELER'.
  approvalStatus: text('approval_status').notNull().default('PENDING_APPROVAL'),
  laborApprovalId: integer('labor_approval_id').references((): AnyPgColumn => laborApprovals.id),
  laborBudgetOverrideId: integer('labor_budget_override_id').references((): AnyPgColumn => laborBudgetOverrides.id),

  // DCAA audit trail
  createdBy: integer('created_by').references((): AnyPgColumn => employees.id),
  createdByDisplayName: text('created_by_display_name'),
  updatedBy: integer('updated_by').references((): AnyPgColumn => employees.id),
  updatedByDisplayName: text('updated_by_display_name'),
  isEdited: boolean('is_edited').notNull().default(false),
  editNote: text('edit_note'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertPunchLedgerSchema = createInsertSchema(punchLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PunchLedgerEntry = typeof punchLedger.$inferSelect;
export type InsertPunchLedger = z.infer<typeof insertPunchLedgerSchema>;

export const laborAllocations = pgTable('labor_allocations', {
  id: serial('id').primaryKey(),

  // Session FK (required)
  punchLedgerId: integer('punch_ledger_id').notNull().references((): AnyPgColumn => punchLedger.id, { onDelete: 'cascade' }),

  // Employee identity (denormalized)
  employeeId: integer('employee_id').notNull().references((): AnyPgColumn => employees.id),

  // Time boundaries for this allocation segment
  allocationStart: timestamp('allocation_start', { withTimezone: true }).notNull(),
  allocationEnd: timestamp('allocation_end', { withTimezone: true }),

  // Labor attribution FKs (nullable)
  chargeCodeId: integer('charge_code_id').references((): AnyPgColumn => chargeCodes.id),
  travelerId: text('traveler_id').references((): AnyPgColumn => travelers.id),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),
  productionWorkOrderId: uuid('production_work_order_id').references((): AnyPgColumn => productionWorkOrders.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  clinId: integer('clin_id').references((): AnyPgColumn => projectClins.id, { onDelete: 'set null' }),
  department: text('department'),
  operation: text('operation'),

  // Labor classification
  laborClass: text('labor_class').notNull().default('REGULAR'), // REGULAR | BREAK

  // State
  status: text('status').notNull().default('OPEN'), // OPEN | CLOSED | AMENDED

  // Certification snapshot at allocation start
  certificationStatus: text('certification_status'), // VALID | EXPIRED | MISSING

  // Budget / overrun flags
  isOverrun: boolean('is_overrun').notNull().default(false),
  overrunReason: text('overrun_reason'),

  // Budget / approval linkage
  laborApprovalId: integer('labor_approval_id').references((): AnyPgColumn => laborApprovals.id),
  laborBudgetOverrideId: integer('labor_budget_override_id').references((): AnyPgColumn => laborBudgetOverrides.id),

  // Amendment chain (self-referential)
  amendsAllocationId: integer('amends_allocation_id').references((): AnyPgColumn => laborAllocations.id),

  // Capture source
  source: text('source').notNull().default('LIVE'), // BACKFILL | LIVE | PORTAL | CORRECTION

  // Ordering within a session (1-based)
  sequenceOrder: integer('sequence_order').notNull().default(1),

  // DCAA audit trail
  createdBy: integer('created_by').references((): AnyPgColumn => employees.id),
  createdByDisplayName: text('created_by_display_name'),
  updatedBy: integer('updated_by').references((): AnyPgColumn => employees.id),
  updatedByDisplayName: text('updated_by_display_name'),
  isEdited: boolean('is_edited').notNull().default(false),
  editNote: text('edit_note'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertLaborAllocationSchema = createInsertSchema(laborAllocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LaborAllocation = typeof laborAllocations.$inferSelect;
export type InsertLaborAllocation = z.infer<typeof insertLaborAllocationSchema>;

export const checklistItems = pgTable('checklist_items', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  date: date('date').notNull(),
  label: text('label').notNull(),
  type: text('type').notNull(), // "checkbox", "dropdown", "text"
  options: json('options'), // for dropdown options
  value: text('value'), // stored value
  required: boolean('required').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const onboardingDocs = pgTable('onboarding_docs', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(), // PDF URL
  signed: boolean('signed').default(false),
  signatureDataURL: text('signature_data_url'), // base64 signature image
  signedAt: timestamp('signed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Insert schemas and types for order departments and statuses
export const insertOrderDepartmentTypeSchema = createInsertSchema(
  orderDepartmentTypes
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderStatusTypeSchema = createInsertSchema(
  orderStatusTypes
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OrderDepartmentType = typeof orderDepartmentTypes.$inferSelect;
export type InsertOrderDepartmentType = z.infer<
  typeof insertOrderDepartmentTypeSchema
>;

export type OrderStatusType = typeof orderStatusTypes.$inferSelect;
export type InsertOrderStatusType = z.infer<typeof insertOrderStatusTypeSchema>;

export const insertOrderSchema = createInsertSchema(orders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    customer: z.string().min(1, 'Customer is required'),
    product: z.string().min(1, 'Product is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    status: z.string().min(1, 'Status is required'), // Legacy field
    statusId: z.number().optional().nullable(), // New FK field
    date: z.coerce.date(),
    currentDepartment: z.string().default('Layup'), // Legacy field
    currentDepartmentId: z.number().optional().nullable(), // New FK field
    isOnSchedule: z.boolean().default(true),
    priorityScore: z.number().default(9999), // DEPRECATED: Use computeEffectivePriority()
    rushTier: z.string().optional().nullable(),
    poId: z.string().optional().nullable(),
    dueDate: z.coerce.date().optional().nullable(),
  });

export const insertCSVDataSchema = createInsertSchema(csvData).omit({
  id: true,
  uploadedAt: true,
});

export const insertCustomerTypeSchema = createInsertSchema(customerTypes).omit({
  id: true,
  createdAt: true,
});

export const insertPersistentDiscountSchema = createInsertSchema(
  persistentDiscounts
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Name is required'),
    percent: z.number().min(0).max(100).optional(),
    fixedAmount: z.number().min(0).optional(),
  });

export const insertShortTermSaleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  percent: z.number().min(0).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.number().default(1),
  overrideActive: z.boolean().default(false),
});

export const insertFeatureCategorySchema = createInsertSchema(featureCategories)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string().optional(), // Allow client to provide ID or we'll generate one
    name: z.string().min(1, 'Name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    sortOrder: z.number().min(0).default(0),
    isActive: z.boolean().default(true),
  });

export const insertFeatureSubCategorySchema = createInsertSchema(
  featureSubCategories
)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string().optional(), // Allow client to provide ID or we'll generate one
    name: z.string().min(1, 'Name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    categoryId: z.string().min(1, 'Category is required'),
    price: z.number().min(0).default(0),
    sortOrder: z.number().min(0).default(0),
    isActive: z.boolean().default(true),
  });

export const insertFeatureSchema = createInsertSchema(features)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string().optional(), // Allow client to provide ID or we'll generate one
    name: z.string().min(1, 'Name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    type: z.enum([
      'dropdown',
      'text',
      'number',
      'checkbox',
      'textarea',
      'multiselect',
    ]),
    required: z.boolean().default(false),
    placeholder: z.string().optional().nullable(),
    category: z.string().min(1, 'Category is required'),
    price: z.number().min(0).default(0),
    sortOrder: z.number().min(0).default(0),
    isActive: z.boolean().default(true),
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
          description: z.string().optional(),
          price: z.number().optional(),
        })
      )
      .optional()
      .nullable(),
    validation: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().optional(),
      })
      .optional()
      .nullable(),
  });

export const insertStockModelSchema = createInsertSchema(stockModels)
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string().optional(), // Allow client to provide ID or we'll generate one
    name: z.string().min(1, 'Name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    price: z.number().min(0, 'Price must be positive'),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().min(0).default(0),
  });

export const insertAllOrderSchema = createInsertSchema(allOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    orderDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    customerId: z.string().optional().nullable(),
    customerPO: z.string().optional().nullable(),
    fbOrderNumber: z.string().optional().nullable(),
    agrOrderDetails: z.string().optional().nullable(),
    isCustomOrder: z.enum(['yes', 'no']).optional().nullable(),
    modelId: z.string().optional().nullable(),
    handedness: z.string().optional().nullable(),
    features: z.record(z.any()).optional().nullable(),
    featureQuantities: z.record(z.any()).optional().nullable(),
    discountCode: z.string().optional().nullable(),
    discountType: z.string().optional().nullable(),
    discountValue: z.union([
      z.string().transform(val => {
        const trimmed = val?.trim() || '';
        if (trimmed === '') return null;
        if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
          throw new Error('Discount value must be a valid number');
        }
        return trimmed;
      }),
      z.number().transform(val => String(val)),
    ]).optional().nullable(),
    discountAppliesTo: z.string().optional().nullable(),
    shipping: z.number().min(0).default(0),
    tikkaOption: z.string().optional().nullable(),
    status: z.string().default('DRAFT'), // Legacy field
    statusId: z.number().optional().nullable(), // New FK field
    currentDepartment: z.string().default('Layup'), // Legacy field
    currentDepartmentId: z.number().optional().nullable(), // New FK field
    // Payment fields
    isPaid: z.boolean().default(false),
    paymentType: z.string().optional().nullable(),
    paymentAmount: z.number().min(0).optional().nullable(),
    paymentDate: z.coerce.date().optional().nullable(),
    paymentTimestamp: z.coerce.date().optional().nullable(),
    // Verification field
    isVerified: z.boolean().default(false),
    // BOM Reference
    bomDefinitionId: z.string().optional().nullable(),
    // QD Same-Side Confirmation
    qdSameSideConfirmed: z.boolean().default(false),
    qdSameSideConfirmedBy: z.string().optional().nullable(),
    qdSameSideConfirmedAt: z.coerce.date().optional().nullable(),
  });

export const insertLinkedOrderGroupSchema = createInsertSchema(linkedOrderGroups)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().optional().nullable(),
    requiresApprovalToSeparate: z.boolean().default(true),
    approvalCode: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    createdBy: z.string().optional().nullable(),
  });

export const insertLinkedOrderSchema = createInsertSchema(linkedOrders)
  .omit({
    id: true,
    addedAt: true,
  })
  .extend({
    linkGroupId: z.number().min(1, 'Link group ID is required'),
    orderId: z.string().min(1, 'Order ID is required'),
  });

export const insertFollowupOrderSchema = createInsertSchema(followupOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerEmail: z.string().email('Valid email is required'),
    publicSignatureId: z.string().min(1, 'Public signature ID is required'),
    signatureToken: z.string().min(1, 'Signature token is required'),
    orderSummary: z.record(z.any()).optional().nullable(),
  });

export const insertOrderFilterPresetSchema = createInsertSchema(orderFilterPresets)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Preset name is required'),
    description: z.string().optional().nullable(),
    filters: z.record(z.any()),
    createdBy: z.string().min(1, 'Created by is required'),
    isShared: z.boolean().default(false),
  });

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    paymentType: z.enum(['credit_card', 'agr', 'check', 'cash', 'ach', 'aaaa', 'wire', 'payment_reversal']),
    paymentAmount: z
      .number()
      .refine((amount) => Number.isFinite(amount), 'Payment amount must be a valid number'),
    paymentDate: z.coerce.date(),
    notes: z.string().optional().nullable(),
  });

export const insertCreditCardTransactionSchema = createInsertSchema(
  creditCardTransactions
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    processedAt: true,
  })
  .extend({
    paymentId: z.number().min(1, 'Payment ID is required'),
    orderId: z.string().min(1, 'Order ID is required'),
    transactionId: z.string().min(1, 'Transaction ID is required'),
    responseCode: z.string().min(1, 'Response code is required'),
    amount: z.number().min(0.01, 'Amount must be greater than 0'),
    customerEmail: z.string().email().optional().nullable(),
    billingFirstName: z.string().min(1, 'First name is required'),
    billingLastName: z.string().min(1, 'Last name is required'),
    billingAddress: z.string().min(1, 'Address is required'),
    billingCity: z.string().min(1, 'City is required'),
    billingState: z.string().min(1, 'State is required'),
    billingZip: z.string().min(1, 'ZIP code is required'),
  });

export const insertFormSchema = createInsertSchema(forms)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().nullable(),
    fields: z
      .array(
        z.object({
          id: z.string().optional(),
          label: z.string().min(1, 'Label is required'),
          key: z.string().min(1, 'Key is required'),
          type: z.enum([
            'text',
            'number',
            'date',
            'dropdown',
            'autocomplete',
            'textarea',
            'checkbox',
          ]),
          required: z.boolean().default(false),
          roles: z.array(z.string()).default([]),
          options: z.array(z.string()).optional(),
        })
      )
      .default([]),
  });

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    formId: z.number().min(1, 'Form ID is required'),
    data: z.record(z.any()),
  });

export const insertInventoryItemSchema = createInsertSchema(inventoryItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    agPartNumber: z.string().min(1, 'AG Part# is required'),
    sku: z.string().optional().nullable(),
    name: z.string().min(1, 'Name is required'),
    type: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    vendorId: z.number().int().positive().optional().nullable(),
    supplierPartNumber: z.string().optional().nullable(),
    orderUrl: z.string().optional().nullable(),
    secondarySupplierPartNumber: z.string().optional().nullable(),
    costPer: z.number().min(0).optional().nullable(),
    purchaseUnit: z.string().optional().nullable(),
    consumptionRate: z.number().min(0).optional().nullable(),
    usageUnit: z.string().optional().nullable(),
    cogsPerUnit: z.number().min(0).optional().nullable(),
    orderDate: z.coerce.date().optional().nullable(),
    department: z.string().optional().nullable(),
    assignedDepartments: z.array(z.string()).default([]),
    secondarySource: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isStockItem: z.boolean().default(false),
    utilizedInPL1: z.boolean().default(false),
    utilizedInPL2: z.boolean().default(false),
    utilizedInPL3: z.boolean().default(false),
    traceabilityRequired: z.boolean().default(false),
    traceabilityFields: z.array(z.string()).default([]),
    traceabilityFieldConfig: z.record(z.enum(['required', 'optional', 'hidden'])).optional().nullable(),
    utilizedInFacilities: z.boolean().default(false),
    utilizedInAdmin: z.boolean().default(false),
    utilizedInServices: z.boolean().default(false),
    isActive: z.boolean().default(true),
    itemType: z.enum(['PURCHASED', 'MANUFACTURED']).optional().nullable(),
    manufacturedCategory: z.enum(['PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY', 'FINAL_ASSEMBLY', 'COMPOSITE', 'COMPONENT']).optional().nullable(),
    manufacturingLevel: z.enum(['COMPONENT', 'INTERMEDIATE', 'FINAL']).optional().nullable(),
    machineType: z.string().optional().nullable(),
    machiningTimeMinutes: z.number().int().min(0).optional().nullable(),
    shelfLifeControlled: z.boolean().default(false),
    frozenShelfLifeDays: z.number().int().min(0).optional().nullable(),
    roomTempShelfLifeDays: z.number().int().min(0).optional().nullable(),
    defaultMaxOutTimeMinutes: z.number().int().min(0).optional().nullable(),
    outTimeEnforcementRequired: z.boolean().default(false),
  });

export const insertInventoryScanSchema = createInsertSchema(inventoryScans)
  .omit({
    id: true,
    scannedAt: true,
  })
  .extend({
    itemCode: z.string().min(1, 'Item code is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
    expirationDate: z.coerce.date().optional().nullable(),
    manufactureDate: z.coerce.date().optional().nullable(),
    lotNumber: z.string().optional().nullable(),
    batchNumber: z.string().optional().nullable(),
    aluminumHeatNumber: z.string().optional().nullable(),
    barcode: z.string().optional().nullable(),
    receivingDate: z.coerce.date().optional().nullable(),
    technicianId: z.string().optional().nullable(),
  });

export const insertItemGroupSchema = createInsertSchema(itemGroups)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Group name is required'),
    description: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

export const insertInventoryItemGroupSchema = createInsertSchema(inventoryItemGroups)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    itemId: z.number().int().positive('Item ID is required'),
    groupId: z.number().int().positive('Group ID is required'),
  });

export const insertVendorScopeItemSchema = createInsertSchema(vendorScopeItems)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorId: z.number().int().positive('Vendor ID is required'),
    itemId: z.number().int().positive('Item ID is required'),
  });

export const insertVendorScopeGroupSchema = createInsertSchema(vendorScopeGroups)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorId: z.number().int().positive('Vendor ID is required'),
    groupId: z.number().int().positive('Group ID is required'),
  });

// Canonical Identity schema for cross-system identity management
export const insertCanonicalIdentitySchema = createInsertSchema(canonicalIdentities)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    displayName: z.string().min(1, 'Display name is required'),
    primaryEmail: z.string().email().optional().nullable(),
    source: z.enum(['epoch', 'timeclock', 'external']).default('epoch'),
    status: z.enum(['active', 'inactive', 'merged']).default('active'),
    mergedIntoId: z.string().uuid().optional().nullable(),
    metadata: z.record(z.any()).optional().nullable(),
  });


const optionalDateSchema = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.coerce.date().optional().nullable()
);

export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    portalToken: true,
    portalTokenExpiry: true,
  })
  .extend({
    name: z.string().min(1, 'Employee name is required'),
    email: z.string().email('Valid email is required').optional().nullable(),
    phone: z.string().optional().nullable(),
    jobTitle: z.string().optional().nullable(), // Informational job title
    userRole: z.enum(['ADMIN', 'EMPLOYEE', 'OWNER']).default('EMPLOYEE'), // System role
    department: z.string().optional().nullable(),
    hireDate: optionalDateSchema,
    dateOfBirth: optionalDateSchema,
    address: z.string().optional().nullable(),
    emergencyContact: z.string().optional().nullable(),
    emergencyPhone: z.string().optional().nullable(),
    payType: z.enum(['HOURLY', 'SALARY']).optional().nullable(),
    salary: z.number().min(0).optional().nullable(),
    hourlyRate: z.number().min(0).optional().nullable(),
    employmentType: z
      .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT'])
      .default('FULL_TIME'),
    isActive: z.boolean().default(true),
    timekeeperPin: z.string().optional().nullable(),
    timezone: z.string().optional(),
    notificationPreferences: z.record(z.unknown()).optional(),
  });

// Certifications schemas
export const insertCertificationSchema = createInsertSchema(certifications)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Certification name is required'),
    description: z.string().optional().nullable(),
    issuingOrganization: z.string().optional().nullable(),
    validityPeriod: z.number().min(0).optional().nullable(),
    category: z.string().optional().nullable(),
    requirements: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

// Evaluations schemas
export const insertEvaluationSchema = createInsertSchema(evaluations)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    submittedAt: true,
    reviewedAt: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    evaluatorId: z.number().min(1, 'Evaluator ID is required'),
    evaluationType: z.enum([
      'ANNUAL',
      'QUARTERLY',
      'PROBATIONARY',
      'PROJECT_BASED',
    ]),
    evaluationPeriodStart: z.coerce.date(),
    evaluationPeriodEnd: z.coerce.date(),
    overallRating: z.number().min(1).max(5).optional().nullable(),
    performanceGoals: z.array(z.any()).optional().nullable(),
    achievements: z.string().optional().nullable(),
    areasForImprovement: z.string().optional().nullable(),
    developmentPlan: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    employeeComments: z.string().optional().nullable(),
    status: z
      .enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'COMPLETED'])
      .default('DRAFT'),
  });

// Employee documents schema
export const insertEmployeeDocumentSchema = createInsertSchema(
  employeeDocuments
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    documentType: z.string().min(1, 'Document type is required'),
    fileName: z.string().min(1, 'File name is required'),
    originalFileName: z.string().min(1, 'Original file name is required'),
    fileSize: z.number().min(0, 'File size must be positive'),
    mimeType: z.string().min(1, 'MIME type is required'),
    filePath: z.string().min(1, 'File path is required'),
    uploadedBy: z.string().optional().nullable(), // Changed from number to string
    isConfidential: z.boolean().default(false),
    tags: z.array(z.string()).optional().nullable(),
    description: z.string().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
  });

// Audit log schema
export const insertEmployeeAuditLogSchema = createInsertSchema(employeeAuditLog)
  .omit({
    id: true,
    timestamp: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    action: z.string().min(1, 'Action is required'),
    resourceType: z.string().optional().nullable(),
    resourceId: z.string().optional().nullable(),
    details: z.record(z.any()).optional().nullable(),
    ipAddress: z.string().optional().nullable(),
    userAgent: z.string().optional().nullable(),
  });

// Admin Panel Audit Log schema
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog)
  .omit({
    id: true,
    timestamp: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    fieldName: z.string().min(1, 'Field name is required'),
    fieldLabel: z.string().min(1, 'Field label is required'),
    oldValue: z.any().nullable(), // JSONB can be any type
    newValue: z.any().nullable(), // JSONB can be any type
    changedBy: z.string().min(1, 'Changed by is required'),
    userRole: z.enum(['ADMIN', 'OWNER', 'EMPLOYEE']),
    changeType: z.enum(['INLINE', 'SIDE_PANEL', 'BULK']),
    ipAddress: z.string().optional().nullable(),
    userAgent: z.string().optional().nullable(),
  });

// Training Modules schemas
export const insertTrainingModuleSchema = createInsertSchema(trainingModules)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().nullable(),
    content: z.string().optional().nullable(),
    contentHtml: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    estimatedMinutes: z.number().min(1).default(30),
    passingScore: z.number().min(0).max(100).default(80),
    requiresCertification: z.boolean().default(false),
    certificationId: z.number().optional().nullable(),
    pdfSource: z.string().optional().nullable(),
    version: z.number().default(1),
    isActive: z.boolean().default(true),
    createdBy: z.string().optional().nullable(),
  });

export const insertTrainingQuestionSchema = createInsertSchema(
  trainingQuestions
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    moduleId: z.number().min(1, 'Module ID is required'),
    questionText: z.string().min(1, 'Question text is required'),
    questionType: z
      .enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'])
      .default('MULTIPLE_CHOICE'),
    correctAnswer: z.string().optional().nullable(),
    explanation: z.string().optional().nullable(),
    points: z.number().default(1),
    sortOrder: z.number().default(0),
    isActive: z.boolean().default(true),
  });

export const insertTrainingQuestionOptionSchema = createInsertSchema(
  trainingQuestionOptions
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    questionId: z.number().min(1, 'Question ID is required'),
    optionText: z.string().min(1, 'Option text is required'),
    isCorrect: z.boolean().default(false),
    sortOrder: z.number().default(0),
  });

export const insertEmployeeTrainingRecordSchema = createInsertSchema(
  employeeTrainingRecords
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    moduleId: z.number().min(1, 'Module ID is required'),
    status: z
      .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'])
      .default('NOT_STARTED'),
    startedAt: z.coerce.date().optional().nullable(),
    completedAt: z.coerce.date().optional().nullable(),
    score: z.number().min(0).max(100).optional().nullable(),
    attempts: z.number().default(0),
    certificateIssued: z.boolean().default(false),
    certificateNumber: z.string().optional().nullable(),
    certificateUrl: z.string().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

export const insertEmployeeQuizAttemptSchema = createInsertSchema(
  employeeQuizAttempts
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    trainingRecordId: z.number().min(1, 'Training record ID is required'),
    employeeId: z.number().min(1, 'Employee ID is required'),
    moduleId: z.number().min(1, 'Module ID is required'),
    attemptNumber: z.number().min(1, 'Attempt number is required'),
    answers: z.array(z.any()).optional().nullable(),
    score: z.number().min(0).max(100).optional().nullable(),
    passed: z.boolean().default(false),
    timeSpentSeconds: z.number().optional().nullable(),
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().optional().nullable(),
  });

export const insertTrainingMatrixSchema = createInsertSchema(trainingMatrix)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.number().optional().nullable(),
    employeeName: z.string().optional().nullable(),
    jobTitle: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    trainingName: z.string().min(1, 'Training name is required'),
    requiredBy: z.string().optional().nullable(),
    frequency: z.string().optional().nullable(),
    lastCompleted: z.coerce.date().optional().nullable(),
    nextDue: z.coerce.date().optional().nullable(),
    status: z
      .enum(['PENDING', 'COMPLETED', 'OVERDUE', 'NOT_REQUIRED'])
      .default('PENDING'),
    documentationUrl: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isLegacy: z.boolean().default(false),
  });

// Capability schemas
export const insertCapabilitySchema = createInsertSchema(capabilities)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Capability name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    category: z.string().min(1, 'Category is required'),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

export const insertEmployeeCapabilitySchema = createInsertSchema(
  employeeCapabilities
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    capabilityId: z.number().min(1, 'Capability ID is required'),
    grantedBy: z.string().optional().nullable(),
    isHardcoded: z.boolean().default(false),
    useHardcodedValue: z.boolean().default(true),
    notes: z.string().optional().nullable(),
  });

export const insertUserCapabilitySchema = createInsertSchema(userCapabilities)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    userId: z.number().min(1, 'User ID is required'),
    capabilityId: z.number().min(1, 'Capability ID is required'),
    grantedBy: z.string().optional().nullable(),
    isHardcoded: z.boolean().default(false),
    useHardcodedValue: z.boolean().default(true),
    notes: z.string().optional().nullable(),
  });

export const insertQcDefinitionSchema = createInsertSchema(qcDefinitions)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    line: z.enum(['P1', 'P2']),
    department: z.string().min(1, 'Department is required'),
    final: z.boolean().default(false),
    key: z.string().min(1, 'Key is required'),
    label: z.string().min(1, 'Label is required'),
    type: z.enum(['checkbox', 'number', 'text']),
    required: z.boolean().default(false),
    sortOrder: z.number().default(0),
    isActive: z.boolean().default(true),
  });

export const insertQcSubmissionSchema = createInsertSchema(qcSubmissions)
  .omit({
    id: true,
    submittedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    line: z.enum(['P1', 'P2']),
    department: z.string().min(1, 'Department is required'),
    sku: z.string().min(1, 'SKU is required'),
    final: z.boolean().default(false),
    data: z.record(z.any()),
    signature: z.string().optional().nullable(),
    summary: z.enum(['PASS', 'FAIL']).optional().nullable(),
    status: z.string().default('pending'),
    dueDate: z.coerce.date().optional().nullable(),
    submittedBy: z.string().optional().nullable(),
  });

export const insertMaintenanceScheduleSchema = createInsertSchema(
  maintenanceSchedules
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    equipment: z.string().min(1, 'Equipment is required'),
    frequency: z.enum(['ANNUAL', 'SEMIANNUAL', 'QUARTERLY', 'BIWEEKLY']),
    startDate: z.coerce.date(),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    scheduleId: z.number().positive('Schedule ID is required'),
    completedAt: z.coerce.date(),
    completedBy: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    nextDueDate: z.coerce.date().optional().nullable(),
  });

const freezerTemperatureValueSchema = z.coerce
  .number()
  .min(-200, 'Temperature must be at least -200')
  .max(200, 'Temperature must be no more than 200');

export const insertFreezerTemperatureLogSchema = createInsertSchema(
  freezerTemperatureLogs
)
  .omit({
    id: true,
    recordedByUserId: true,
    recordedByDisplayName: true,
    createdAt: true,
  })
  .extend({
    recordedAt: z.coerce.date(),
    freezer1Temperature: freezerTemperatureValueSchema,
    freezer2Temperature: freezerTemperatureValueSchema,
    freezer3Temperature: freezerTemperatureValueSchema,
    freezer4Temperature: freezerTemperatureValueSchema,
    layupRoomTemperature: freezerTemperatureValueSchema,
    refrigeratorContainerTemperature: freezerTemperatureValueSchema,
    notes: z.string().trim().max(2000).optional().nullable(),
  });

export const insertTimeClockEntrySchema = createInsertSchema(timeClockEntries)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.string().min(1, 'Employee ID is required'),
    clockIn: z.coerce.date().optional().nullable(),
    clockOut: z.coerce.date().optional().nullable(),
    date: z.coerce.date(),
  });

export const insertChecklistItemSchema = createInsertSchema(checklistItems)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.string().min(1, 'Employee ID is required'),
    date: z.coerce.date(),
    label: z.string().min(1, 'Label is required'),
    type: z.enum(['checkbox', 'dropdown', 'text']),
    options: z.array(z.string()).optional().nullable(),
    value: z.string().optional().nullable(),
    required: z.boolean().default(false),
  });

export const insertOnboardingDocSchema = createInsertSchema(onboardingDocs)
  .omit({
    id: true,
    createdAt: true,
    signedAt: true,
  })
  .extend({
    employeeId: z.string().min(1, 'Employee ID is required'),
    title: z.string().min(1, 'Title is required'),
    url: z.string().url('Must be a valid URL'),
    signed: z.boolean().default(false),
    signatureDataURL: z.string().optional().nullable(),
  });

export const insertPartsRequestSchema = createInsertSchema(partsRequests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    requestDate: true,
  })
  .extend({
    agPartNumber: z.string().optional().nullable(),
    partNumber: z.string().min(1, 'Part number is required'),
    partName: z.string().min(1, 'Part name is required'),
    requestedBy: z.string().min(1, 'Requested by is required'),
    productionLine: z.enum(['P1', 'P2', 'P3']).optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    department: z.string().optional().nullable(),
    departmentId: z.number().optional().nullable(),
    quantity: z.number().positive('Quantity must be positive'),
    urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    supplier: z.string().optional().nullable(),
    estimatedCost: z.number().min(0).optional().nullable(),
    reason: z.string().optional().nullable(),
    status: z
      .enum(['PENDING', 'PENDING_OWNER_APPROVAL', 'APPROVED', 'ORDERED', 'ORDERED_PARTIAL', 'RECEIVED', 'RECEIVED_PARTIAL', 'DELIVERED_TO_DEPT', 'REJECTED', 'CANCEL_REQUESTED', 'CANCELED'])
      .default('PENDING'),
    approvalRequiredRole: z.enum(['INVENTORY_MANAGER', 'OWNER']).default('INVENTORY_MANAGER').optional(),
    approvalStatus: z.enum(['PENDING', 'OWNER_PENDING', 'APPROVED', 'REJECTED']).default('PENDING').optional(),
    ownerApprovedBy: z.string().optional().nullable(),
    ownerApprovedAt: z.coerce.date().optional().nullable(),
    digitalApprovalSignature: z.string().optional().nullable(),
    approvalHistory: z.array(z.record(z.unknown())).optional().nullable(),
    approvedBy: z.string().optional().nullable(),
    approvedDate: z.coerce.date().optional().nullable(),
    orderDate: z.coerce.date().optional().nullable(),
    expectedDelivery: z.coerce.date().optional().nullable(),
    actualDelivery: z.coerce.date().optional().nullable(),
    deliveredToDepartment: z.coerce.date().optional().nullable(),
    receivedByDepartment: z.string().optional().nullable(),
    vendorPoId: z.number().optional().nullable(),
    vendorId: z.number().optional().nullable(),
    orderMethod: z.enum(['PO', 'WEBSITE', 'EMAIL']).optional().nullable(),
    vendorPartNumber: z.string().optional().nullable(),
    productUrl: z.string().url().optional().nullable(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    catalogFixNeeded: z.boolean().default(false),
    outOfDeptReason: z.string().optional().nullable(),
    cancelReason: z.string().optional().nullable(),
    rejectionReason: z.string().optional().nullable(),
    batchId: z.number().optional().nullable(),
    qtyOrdered: z.number().default(0).optional(),
    qtyReceived: z.number().default(0).optional(),
  });

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertCSVData = z.infer<typeof insertCSVDataSchema>;
export type CSVData = typeof csvData.$inferSelect;

export type InsertCustomerType = z.infer<typeof insertCustomerTypeSchema>;
export type CustomerType = typeof customerTypes.$inferSelect;
export type InsertPersistentDiscount = z.infer<
  typeof insertPersistentDiscountSchema
>;
export type PersistentDiscount = typeof persistentDiscounts.$inferSelect;
export type InsertShortTermSale = z.infer<typeof insertShortTermSaleSchema>;
export type ShortTermSale = typeof shortTermSales.$inferSelect;

// Promo code override audit types
export const insertPromoCodeOverrideAuditSchema = z.object({
  promoCodeId: z.number(),
  userId: z.string().min(1, 'User ID is required'),
  previousStatus: z.boolean(),
  newStatus: z.boolean(),
  reason: z.string().min(1, 'Reason is required'),
});
export type InsertPromoCodeOverrideAudit = z.infer<typeof insertPromoCodeOverrideAuditSchema>;
export type PromoCodeOverrideAudit = typeof promoCodeOverrideAudit.$inferSelect;
export type InsertFeatureCategory = z.infer<typeof insertFeatureCategorySchema>;
export type FeatureCategory = typeof featureCategories.$inferSelect;
export type InsertFeatureSubCategory = z.infer<
  typeof insertFeatureSubCategorySchema
>;
export type FeatureSubCategory = typeof featureSubCategories.$inferSelect;
export type InsertFeature = z.infer<typeof insertFeatureSchema>;
export type Feature = typeof features.$inferSelect;
export type InsertStockModel = z.infer<typeof insertStockModelSchema>;
export type StockModel = typeof stockModels.$inferSelect;
export type InsertAllOrder = z.infer<typeof insertAllOrderSchema>;
export type AllOrder = typeof allOrders.$inferSelect;

// Bottom Metal Demands Tracking Table
export const bottomMetalDemands = pgTable('bottom_metal_demands', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  bottomMetalSku: text('bottom_metal_sku').notNull(),
  quantity: integer('quantity').notNull().default(1),
  status: text('status').notNull().default('open'), // 'open', 'cancelled', 'fulfilled'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertBottomMetalDemandSchema = createInsertSchema(bottomMetalDemands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBottomMetalDemand = z.infer<typeof insertBottomMetalDemandSchema>;
export type BottomMetalDemand = typeof bottomMetalDemands.$inferSelect;

export const railDemands = pgTable('rail_demands', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  railSku: text('rail_sku').notNull(),
  quantity: integer('quantity').notNull().default(1),
  status: text('status').notNull().default('open'), // 'open', 'cancelled', 'fulfilled'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orderRailUnique: uniqueIndex('rail_demands_order_rail_unique').on(table.orderId, table.railSku),
}));

export const insertRailDemandSchema = createInsertSchema(railDemands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRailDemand = z.infer<typeof insertRailDemandSchema>;
export type RailDemand = typeof railDemands.$inferSelect;

// Metal Accessory Audit Log
export const metalAccessoryAuditLog = pgTable('metal_accessory_audit_log', {
  id: serial('id').primaryKey(),
  accessoryId: integer('accessory_id').notNull(),
  changeType: text('change_type').notNull(), // 'inventory', 'machined', 'anodizer'
  oldValue: integer('old_value').notNull(),
  newValue: integer('new_value').notNull(),
  userId: text('user_id').notNull().default('system'),
  timestamp: timestamp('timestamp').defaultNow(),
});

export const insertMetalAccessoryAuditLogSchema = createInsertSchema(metalAccessoryAuditLog).omit({
  id: true,
  timestamp: true,
});

export type InsertMetalAccessoryAuditLog = z.infer<typeof insertMetalAccessoryAuditLogSchema>;
export type MetalAccessoryAuditLog = typeof metalAccessoryAuditLog.$inferSelect;

// Backward compatibility aliases (order_drafts table removed, now using all_orders)
export type InsertOrderDraft = InsertAllOrder;
export type OrderDraft = AllOrder;
export type InsertLinkedOrderGroup = z.infer<typeof insertLinkedOrderGroupSchema>;
export type LinkedOrderGroup = typeof linkedOrderGroups.$inferSelect;
export type InsertLinkedOrder = z.infer<typeof insertLinkedOrderSchema>;
export type LinkedOrder = typeof linkedOrders.$inferSelect;
export type InsertFollowupOrder = z.infer<typeof insertFollowupOrderSchema>;
export type FollowupOrder = typeof followupOrders.$inferSelect;
export type InsertOrderFilterPreset = z.infer<typeof insertOrderFilterPresetSchema>;
export type OrderFilterPreset = typeof orderFilterPresets.$inferSelect;
export type InsertForm = z.infer<typeof insertFormSchema>;
export type Form = typeof forms.$inferSelect;
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryItemWithDashboard = InventoryItem & { supplySourceDashboard: SupplySourceDashboard | null };
export type InsertInventoryScan = z.infer<typeof insertInventoryScanSchema>;
export type InventoryScan = typeof inventoryScans.$inferSelect;
export type InsertItemGroup = z.infer<typeof insertItemGroupSchema>;
export type ItemGroup = typeof itemGroups.$inferSelect;
export type InsertInventoryItemGroup = z.infer<typeof insertInventoryItemGroupSchema>;
export type InventoryItemGroup = typeof inventoryItemGroups.$inferSelect;
export type InsertVendorScopeItem = z.infer<typeof insertVendorScopeItemSchema>;
export type VendorScopeItem = typeof vendorScopeItems.$inferSelect;
export type InsertVendorScopeGroup = z.infer<typeof insertVendorScopeGroupSchema>;
export type VendorScopeGroup = typeof vendorScopeGroups.$inferSelect;
export type InsertCanonicalIdentity = z.infer<typeof insertCanonicalIdentitySchema>;
export type CanonicalIdentity = typeof canonicalIdentities.$inferSelect;
// PunchEvent is a plain DTO interface — not a Drizzle model.
// The punch_events database table was dropped. This type is retained
// here so that service files (laborSummary.ts, missedPunchAwareness.ts)
// that operate on punch-shaped data from other sources keep a shared,
// consistent type to program against.
export interface PunchEvent {
  id: string;
  externalPunchId: string;
  canonicalId: string;
  epochEmployeeId: number | null;
  punchType: string;
  punchTime: Date;
  source: string;
  departmentCode: string | null;
  jobCode: string | null;
  locationCode: string | null;
  metadata: Record<string, unknown> | null;
  signature: string | null;
  receivedAt: Date;
  createdAt: Date;
}
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// User authentication types
export const insertUserSchema = createInsertSchema(users)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    password: z.string().optional(),
  })
  .omit({ passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// User session types
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

// User integrations types
export const insertUserIntegrationSchema = createInsertSchema(userIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserIntegration = z.infer<typeof insertUserIntegrationSchema>;
export type UserIntegration = typeof userIntegrations.$inferSelect;

// New employee-related types
export type InsertCertification = z.infer<typeof insertCertificationSchema>;
export type Certification = typeof certifications.$inferSelect;
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluations.$inferSelect;
// User session types removed with authentication system
export type InsertEmployeeDocument = z.infer<
  typeof insertEmployeeDocumentSchema
>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeAuditLog = z.infer<
  typeof insertEmployeeAuditLogSchema
>;
export type EmployeeAuditLog = typeof employeeAuditLog.$inferSelect;

export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

// Training system types
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModule = typeof trainingModules.$inferSelect;
export type InsertTrainingQuestion = z.infer<
  typeof insertTrainingQuestionSchema
>;
export type TrainingQuestion = typeof trainingQuestions.$inferSelect;
export type InsertTrainingQuestionOption = z.infer<
  typeof insertTrainingQuestionOptionSchema
>;
export type TrainingQuestionOption =
  typeof trainingQuestionOptions.$inferSelect;
export type InsertEmployeeTrainingRecord = z.infer<
  typeof insertEmployeeTrainingRecordSchema
>;
export type EmployeeTrainingRecord =
  typeof employeeTrainingRecords.$inferSelect;
export type InsertEmployeeQuizAttempt = z.infer<
  typeof insertEmployeeQuizAttemptSchema
>;
export type EmployeeQuizAttempt = typeof employeeQuizAttempts.$inferSelect;
export type InsertTrainingMatrix = z.infer<typeof insertTrainingMatrixSchema>;
export type TrainingMatrixEntry = typeof trainingMatrix.$inferSelect;

export type InsertCapability = z.infer<typeof insertCapabilitySchema>;
export type Capability = typeof capabilities.$inferSelect;
export type InsertEmployeeCapability = z.infer<
  typeof insertEmployeeCapabilitySchema
>;
export type EmployeeCapability = typeof employeeCapabilities.$inferSelect;
export type InsertUserCapability = z.infer<typeof insertUserCapabilitySchema>;
export type UserCapability = typeof userCapabilities.$inferSelect;
export type InsertQcDefinition = z.infer<typeof insertQcDefinitionSchema>;
export type QcDefinition = typeof qcDefinitions.$inferSelect;
export type InsertQcSubmission = z.infer<typeof insertQcSubmissionSchema>;
export type QcSubmission = typeof qcSubmissions.$inferSelect;
export type InsertMaintenanceSchedule = z.infer<
  typeof insertMaintenanceScheduleSchema
>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type InsertFreezerTemperatureLog = z.infer<
  typeof insertFreezerTemperatureLogSchema
>;
export type FreezerTemperatureLog = typeof freezerTemperatureLogs.$inferSelect;
export type InsertTimeClockEntry = z.infer<typeof insertTimeClockEntrySchema>;
export type TimeClockEntry = typeof timeClockEntries.$inferSelect;
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type InsertOnboardingDoc = z.infer<typeof insertOnboardingDocSchema>;
export type OnboardingDoc = typeof onboardingDocs.$inferSelect;
export type InsertPartsRequest = z.infer<typeof insertPartsRequestSchema>;
export type PartsRequest = typeof partsRequests.$inferSelect;
export type PartsRequestBatch = typeof partsRequestBatches.$inferSelect;
export type PartsRequestOrderLine = typeof partsRequestOrderLines.$inferSelect;
export type PartsRequestOrderAllocation = typeof partsRequestOrderAllocations.$inferSelect;
export type PartsRequestReceipt = typeof partsRequestReceipts.$inferSelect;
export type PartsRequestReceiptLine = typeof partsRequestReceiptLines.$inferSelect;
export type PartsRequestStatusHistory = typeof partsRequestStatusHistory.$inferSelect;

// Purchase Review Checklist Table
export const purchaseReviewChecklists = pgTable('purchase_review_checklists', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id'),
  formData: jsonb('form_data').notNull(),
  createdBy: text('created_by'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertPurchaseReviewChecklistSchema = createInsertSchema(
  purchaseReviewChecklists
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.string().optional().nullable(),
    formData: z.record(z.any()),
    createdBy: z.string().optional().nullable(),
    status: z
      .enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'])
      .default('DRAFT'),
  });

export type InsertPurchaseReviewChecklist = z.infer<
  typeof insertPurchaseReviewChecklistSchema
>;
export type PurchaseReviewChecklist =
  typeof purchaseReviewChecklists.$inferSelect;

// Manufacturer's Certificate of Conformance Table
export const manufacturersCertificates = pgTable('manufacturers_certificates', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  customerAddress: text('customer_address'),
  poNumber: text('po_number'),
  partNumber: text('part_number'),
  lotNumber: text('lot_number'),
  formData: jsonb('form_data').notNull(),
  createdBy: text('created_by'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertManufacturersCertificateSchema = createInsertSchema(
  manufacturersCertificates
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.string().optional().nullable(),
    customerName: z.string().optional().nullable(),
    customerAddress: z.string().optional().nullable(),
    poNumber: z.string().optional().nullable(),
    partNumber: z.string().optional().nullable(),
    lotNumber: z.string().optional().nullable(),
    formData: z.record(z.any()),
    createdBy: z.string().optional().nullable(),
    status: z
      .enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'])
      .default('DRAFT'),
  });

export type InsertManufacturersCertificate = z.infer<
  typeof insertManufacturersCertificateSchema
>;
export type ManufacturersCertificate =
  typeof manufacturersCertificates.$inferSelect;

// Layup Scheduler Tables
export const molds = pgTable('molds', {
  id: serial('id').primaryKey(),
  moldId: text('mold_id').notNull(),
  modelName: text('model_name').notNull(),
  stockModels: text('stock_models').array().default([]), // Array of associated stock model IDs
  instanceNumber: integer('instance_number').notNull(),
  enabled: boolean('enabled').default(true),
  multiplier: integer('multiplier').default(1).notNull(), // Daily capacity multiplier
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const employeeLayupSettings = pgTable('employee_layup_settings', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id')
    .references(() => employees.employeeCode)
    .notNull(),
  rate: real('rate').default(1).notNull(), // Molds per hour
  hours: real('hours').default(8).notNull(), // Working hours per day
  department: text('department').default('Layup').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const productionQueue = pgTable('production_queue', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  priorityScore: integer('priority_score').notNull(), // Lower numbers = higher priority
  department: text('department').default('Layup').notNull(),
  status: text('status').default('FINALIZED').notNull(),
  customer: text('customer').notNull(),
  product: text('product').notNull(),
  // LOP Adjustment fields
  needsLOPAdjustment: boolean('needs_lop_adjustment').default(false),
  priority: integer('priority').default(50), // 1-100 priority level
  priorityChangedAt: timestamp('priority_changed_at'),
  lastScheduledLOPAdjustmentDate: timestamp(
    'last_scheduled_lop_adjustment_date'
  ),
  scheduledLOPAdjustmentDate: timestamp('scheduled_lop_adjustment_date'),
  lopAdjustmentOverrideReason: text('lop_adjustment_override_reason'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const layupSchedule = pgTable('layup_schedule', {
  id: serial('id').primaryKey(),
  orderId: text('order_id')
    .references(() => productionQueue.orderId)
    .notNull(),
  scheduledDate: timestamp('scheduled_date').notNull(),
  moldId: text('mold_id')
    .references(() => molds.moldId)
    .notNull(),
  employeeAssignments: jsonb('employee_assignments').notNull().default('[]'), // Array of {employeeId, workload}
  isOverride: boolean('is_override').default(false), // Manual override flag
  overriddenAt: timestamp('overridden_at'),
  overriddenBy: text('overridden_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Additional fields from database
  layupDay: date('layup_day'), // Specific layup day
  weekLocked: boolean('week_locked').default(false), // Indicates if this week has been locked
  customerName: text('customer_name'), // Customer name for display
  stockModel: text('stock_model'), // Stock model for production
  materialType: text('material_type'), // Material type
  actionLength: text('action_length'), // Action length specification
  lopValue: text('lop_value'), // LOP value
  fbOrderNumber: text('fb_order_number'), // FishBowl order number
  scheduleSnapshot: jsonb('schedule_snapshot'), // Snapshot of schedule data for printing
});

// Insert schemas for Layup Scheduler
export const insertMoldSchema = createInsertSchema(molds)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    moldId: z.string().min(1, 'Mold ID is required'),
    modelName: z.string().min(1, 'Model name is required'),
    instanceNumber: z.number().min(1, 'Instance number must be positive'),
    enabled: z.boolean().default(true),
    multiplier: z.number().min(1, 'Multiplier must be at least 1'),
    isActive: z.boolean().default(true),
  });

export const insertEmployeeLayupSettingsSchema = createInsertSchema(
  employeeLayupSettings
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.string().min(1, 'Employee ID is required'),
    rate: z.number().min(0, 'Rate must be positive'),
    hours: z.number().min(0, 'Hours must be positive'),
    department: z.string().default('Layup'),
    isActive: z.boolean().default(true),
  });

export const insertProductionQueueSchema = createInsertSchema(productionQueue)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    orderDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    priorityScore: z.number().min(1, 'Priority score must be positive').default(9999), // DEPRECATED
    department: z.string().default('Layup'),
    status: z.string().default('FINALIZED'),
    customer: z.string().min(1, 'Customer is required'),
    product: z.string().min(1, 'Product is required'),
    // LOP Adjustment fields
    needsLOPAdjustment: z.boolean().default(false),
    priority: z.number().min(1).max(100).default(50),
    priorityChangedAt: z.coerce.date().optional().nullable(),
    lastScheduledLOPAdjustmentDate: z.coerce.date().optional().nullable(),
    scheduledLOPAdjustmentDate: z.coerce.date().optional().nullable(),
    lopAdjustmentOverrideReason: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

export const insertLayupScheduleSchema = createInsertSchema(layupSchedule)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    scheduledDate: z.coerce.date(),
    moldId: z.string().min(1, 'Mold ID is required'),
    employeeAssignments: z
      .array(
        z.object({
          employeeId: z.string(),
          workload: z.number().min(0),
        })
      )
      .default([]),
    weekLocked: z.boolean().default(false),
    isOverride: z.boolean().default(false),
    overriddenBy: z.string().optional().nullable(),
  });

// Type exports for Layup Scheduler
export type InsertMold = z.infer<typeof insertMoldSchema>;
export type Mold = typeof molds.$inferSelect;
export type InsertEmployeeLayupSettings = z.infer<
  typeof insertEmployeeLayupSettingsSchema
>;
export type EmployeeLayupSettings = typeof employeeLayupSettings.$inferSelect;
export type InsertProductionQueue = z.infer<typeof insertProductionQueueSchema>;
export type ProductionQueue = typeof productionQueue.$inferSelect;
export type InsertLayupSchedule = z.infer<typeof insertLayupScheduleSchema>;
export type LayupSchedule = typeof layupSchedule.$inferSelect;

// Module 8: API Integrations & Communications
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  customerKey: text('customer_key'),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  contact: text('contact'),
  customerType: text('customer_type').default('standard'),
  preferredCommunicationMethod: json('preferred_communication_method'), // Array of strings: ["email", "sms"]
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  isInternational: boolean('is_international').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerAddresses = pgTable('customer_addresses', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull(),
  street: text('street').notNull(),
  street2: text('street2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zipCode: text('zip_code').notNull(),
  country: text('country'),
  type: text('type'),
  isDefault: boolean('is_default'),
  isValidated: boolean('is_validated'),
  validationStatus: text('validation_status'),
  validatedAt: timestamp('validated_at'),
  validationProvider: text('validation_provider'),
  dpvMatchCode: text('dpv_match_code'),
  overrideReason: text('override_reason'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const customerContacts = pgTable('customer_contacts', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').notNull().default(false),
  receivesInvoices: boolean('receives_invoices').notNull().default(true),
  receivesShippingNotifications: boolean('receives_shipping_notifications').notNull().default(false),
  receivesOrderConfirmations: boolean('receives_order_confirmations').notNull().default(false),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Vendors table for supplier management
export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  email: text('email'),
  additionalEmail: text('additional_email'),
  phone: text('phone'),
  address: text('address'), // Legacy field - kept for backward compatibility
  street: text('street'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  country: text('country').default('United States'),
  validationStatus: text('validation_status'),
  validatedAt: timestamp('validated_at'),
  validationProvider: text('validation_provider'),
  dpvMatchCode: text('dpv_match_code'),
  overrideReason: text('override_reason'),
  scope: text('scope'), // Materials/products vendor is approved to supply
  approvalLevel: text('approval_level'), // A, B, or C - vendor approval level
  approvalSource: text('approval_source'), // "Certification" or "Supplier Approval Form"
  approvalPdfUrl: text('approval_pdf_url'), // Path to uploaded PDF document
  mainDocumentUrl: text('main_document_url'), // Main vendor document (W-9, agreement, etc.) - uploaded or from media library
  startRenewalDate: date('start_renewal_date'), // Date when vendor approval started or was renewed
  approvalExpiration: date('approval_expiration'), // Date when vendor approval expires
  approved: boolean('approved').notNull().default(false),
  debarmentStatus: text('debarment_status').notNull().default('unknown'),
  debarmentCheckedAt: timestamp('debarment_checked_at'),
  debarmentEvidenceUrl: text('debarment_evidence_url'),
  debarmentNotes: text('debarment_notes'),
  evaluated: boolean('evaluated').notNull().default(false),
  evaluationDate: date('evaluation_date'),
  qualityScore: integer('quality_score'), // 1-5: 1=Poor, 2=Needs improvement, 3=Acceptable, 4=Good, 5=Excellent
  costScore: integer('cost_score'), // 1-5: 1=Poor, 2=Needs improvement, 3=Acceptable, 4=Good, 5=Excellent
  deliveryScore: integer('delivery_score'), // 1-5: 1=Poor, 2=Needs improvement, 3=Acceptable, 4=Good, 5=Excellent
  responseScore: integer('response_score'), // 1-5: 1=Poor, 2=Needs improvement, 3=Acceptable, 4=Good, 5=Excellent
  notes: text('notes'),
  termsAndConditions: text('terms_and_conditions'), // Vendor-specific PO terms and conditions
  paymentTerms: text('payment_terms'), // Vendor-specific payment terms
  shippingInstructions: text('shipping_instructions'), // Vendor-specific shipping instructions
  defaultOrderMethod: text('default_order_method'), // Default procurement method: 'PO', 'WEBSITE', or 'EMAIL'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendorContacts = pgTable('vendor_contacts', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id)
    .notNull(),
  name: text('name').notNull(),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').default(false),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendorMonthlyEvaluations = pgTable('vendor_monthly_evaluations', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id, { onDelete: 'cascade' })
    .notNull(),
  month: integer('month').notNull(), // 1-12 for Jan-Dec
  year: integer('year').notNull(),
  qualityScore: integer('quality_score'), // 1-5
  costScore: integer('cost_score'), // 1-5
  deliveryScore: integer('delivery_score'), // 1-5
  responseScore: integer('response_score'), // 1-5
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supplierScopes = pgTable('supplier_scopes', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  scopeCode: text('scope_code').notNull(),
  description: text('description'),
  productionLine: text('production_line'),
  materialCategory: text('material_category'),
  partNumberPattern: text('part_number_pattern'),
  status: text('status').notNull().default('active'),
  approvedByUserId: integer('approved_by_user_id'),
  approvedByDisplayName: text('approved_by_display_name'),
  approvedAt: timestamp('approved_at'),
  expiresAt: date('expires_at'),
  evidenceUrl: text('evidence_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  vendorIdx: index('idx_supplier_scopes_vendor_id').on(table.vendorId),
  statusIdx: index('idx_supplier_scopes_status').on(table.status),
  vendorScopeUnique: unique('supplier_scopes_vendor_scope_unique').on(table.vendorId, table.scopeCode),
}));

export const supplierAudits = pgTable('supplier_audits', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  auditType: text('audit_type').notNull().default('qualification'),
  status: text('status').notNull().default('open'),
  performedByUserId: integer('performed_by_user_id'),
  performedByDisplayName: text('performed_by_display_name'),
  auditDate: date('audit_date').notNull(),
  nextAuditDue: date('next_audit_due'),
  findings: text('findings'),
  correctiveActions: text('corrective_actions'),
  evidenceUrl: text('evidence_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  vendorIdx: index('idx_supplier_audits_vendor_id').on(table.vendorId),
  statusIdx: index('idx_supplier_audits_status').on(table.status),
  nextDueIdx: index('idx_supplier_audits_next_due').on(table.nextAuditDue),
}));

export const supplierScorecards = pgTable('supplier_scorecards', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  qualityScore: integer('quality_score').notNull(),
  deliveryScore: integer('delivery_score').notNull(),
  costScore: integer('cost_score').notNull(),
  responsivenessScore: integer('responsiveness_score').notNull(),
  overallScore: real('overall_score').notNull(),
  status: text('status').notNull().default('acceptable'),
  reviewedByUserId: integer('reviewed_by_user_id'),
  reviewedByDisplayName: text('reviewed_by_display_name'),
  reviewedAt: timestamp('reviewed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  vendorIdx: index('idx_supplier_scorecards_vendor_id').on(table.vendorId),
  periodIdx: index('idx_supplier_scorecards_period').on(table.periodStart, table.periodEnd),
  vendorPeriodUnique: unique('supplier_scorecards_vendor_period_unique').on(table.vendorId, table.periodStart, table.periodEnd),
}));

// Enhanced Inventory MRP Tables

// Inventory Balances - Real-time stock levels by location
export const inventoryBalances = pgTable('inventory_balances', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' })
    .notNull(),
  locationId: text('location_id').notNull(), // warehouse, production, etc.
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  quantityAllocated: integer('quantity_allocated').notNull().default(0), // For progressive allocation
  quantityAvailable: integer('quantity_available').notNull().default(0), // Computed: onHand - allocated
  reorderPoint: integer('reorder_point').default(0),
  lastCountedAt: timestamp('last_counted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Department-Location Mapping for derived department tracking
// Department-Location Mapping for physical staging locations
// Maps physical warehouse/production locations to manufacturing departments
export const DEPARTMENT_LOCATION_MAP: Record<string, { departmentId: number; departmentName: string }> = {
  'P1-PRODUCTION-QUEUE': { departmentId: 1, departmentName: 'Production Queue' },
  'P1-LAYUP': { departmentId: 2, departmentName: 'Layup/Plugging' },
  'P1-BARCODE': { departmentId: 3, departmentName: 'Barcode' },
  'P1-CNC': { departmentId: 4, departmentName: 'CNC' },
  'P1-GUNSMITH': { departmentId: 5, departmentName: 'Gunsmith' },
  'P1-FINISH': { departmentId: 6, departmentName: 'Finish' },
  'P1-FINISH-QC': { departmentId: 7, departmentName: 'Finish QC' },
  'P1-SHIPPING-QC': { departmentId: 8, departmentName: 'Shipping QC' },
  'P1-SHIPPING': { departmentId: 9, departmentName: 'Shipping' },
  'WAREHOUSE-MAIN': { departmentId: 1, departmentName: 'Production Queue' }, // General staging
  'WAREHOUSE-OVERFLOW': { departmentId: 1, departmentName: 'Production Queue' },
};

// Enriched balance response types
export type DepartmentBalanceMeta = {
  departmentId: number;
  departmentName: string;
  locationId: string;
};

export type DepartmentBalanceBreakdown = {
  departmentId: number;
  departmentName: string;
  totalQuantityOnHand: number;
  totalQuantityAllocated: number;
  totalQuantityAvailable: number;
  locations: string[];
};

export type InventorySerializedItemOption = {
  id: string;
  serialNumber: string;
  barcode: string;
  travelerBarcode?: string | null;
  travelerId?: string | null;
  travelerNumber?: string | null;
  dispositionId?: number | null;
  dispositionType?: string | null;
};

export type EnrichedInventoryBalance = typeof inventoryBalances.$inferSelect & {
  partName?: string;
  departmentMeta?: DepartmentBalanceMeta;
  serializedItems?: InventorySerializedItemOption[];
};

export type InventoryBalanceWithDepartments = {
  balance: typeof inventoryBalances.$inferSelect & { partName?: string };
  departmentMeta?: DepartmentBalanceMeta;
  departmentBreakdown: DepartmentBalanceBreakdown[];
};

// Inventory Transactions - Movement audit trail
export const inventoryTransactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' })
    .notNull(),
  transactionType: text('transaction_type').notNull(), // receipt, consumption, adjustment, transfer, return, issue
  quantity: real('quantity').notNull(), // Can be negative for issues/consumption
  unitOfMeasure: text('unit_of_measure'), // lbs, each, box, etc.
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  referenceType: text('reference_type'), // PO, WorkOrder, Adjustment, Manual, etc.
  referenceId: text('reference_id'), // ID of the related record (PO number, work order, etc.)
  costPerUnit: numeric('cost_per_unit', { precision: 12, scale: 2 }), // Cost at time of transaction (exact money math)
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }), // quantity * costPerUnit (exact money math)
  notes: text('notes'),
  performedBy: text('performed_by').notNull(), // Username of person who performed transaction
  metadata: jsonb('metadata').$type<Record<string, unknown>>(), // Flexible field for future expansion (JSON data)
  transactionDate: timestamp('transaction_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryLedgerTransactionTypeEnum = pgEnum('inventory_ledger_transaction_type', [
  'RECEIVE',
  'ISSUE',
  'RETURN',
  'TRANSFER',
  'MOVE',
  'RESERVE',
  'UNRESERVE',
  'CONSUME',
  'ADJUST',
  'SCRAP',
  'SPLIT',
  'MERGE',
  'COUNT_ADJUSTMENT',
  'STATUS_CHANGE',
  'QUARANTINE',
  'RELEASE',
  'EXPIRE',
  'REVERSAL',
]);

export const inventoryTransactionLedger = pgTable('inventory_transaction_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionNumber: text('transaction_number').notNull().unique(),
  transactionType: inventoryLedgerTransactionTypeEnum('transaction_type').notNull(),
  inventoryItemId: integer('inventory_item_id')
    .references(() => inventoryItems.id)
    .notNull(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber)
    .notNull(),
  lotId: uuid('lot_id').references(() => materialLots.id),
  locationId: text('location_id'),
  quantityDelta: numeric('quantity_delta', { precision: 14, scale: 4 }).notNull(),
  quantityBefore: numeric('quantity_before', { precision: 14, scale: 4 }).notNull(),
  quantityAfter: numeric('quantity_after', { precision: 14, scale: 4 }).notNull(),
  unitOfMeasure: text('unit_of_measure').default('EA').notNull(),
  statusBefore: text('status_before'),
  statusAfter: text('status_after'),
  performedByUserId: integer('performed_by_user_id').references(() => users.id),
  performedByDisplayName: text('performed_by_display_name').notNull(),
  approvedByUserId: integer('approved_by_user_id').references(() => users.id),
  approvedByDisplayName: text('approved_by_display_name'),
  approvalId: uuid('approval_id'),
  projectId: uuid('project_id').references(() => projects.id),
  productionWorkOrderId: uuid('production_work_order_id').references(() => productionWorkOrders.id),
  travelerId: varchar('traveler_id', { length: 255 }).references(() => travelers.id),
  travelerStepId: varchar('traveler_step_id', { length: 255 }).references(() => travelerSteps.id),
  chargeCodeId: integer('charge_code_id').references(() => chargeCodes.id),
  reasonCode: text('reason_code'),
  notes: text('notes'),
  digitalSignatureId: uuid('digital_signature_id'),
  sourceModule: text('source_module').notNull(),
  sourceRecordId: text('source_record_id'),
  eventHash: text('event_hash').notNull(),
  reversedTransactionId: uuid('reversed_transaction_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  transactionTypeIdx: index('itl_transaction_type_idx').on(table.transactionType),
  inventoryItemIdx: index('itl_inventory_item_idx').on(table.inventoryItemId),
  agPartNumberIdx: index('itl_ag_part_number_idx').on(table.agPartNumber),
  lotIdx: index('itl_lot_idx').on(table.lotId),
  locationIdx: index('itl_location_idx').on(table.locationId),
  projectIdx: index('itl_project_idx').on(table.projectId),
  workOrderIdx: index('itl_work_order_idx').on(table.productionWorkOrderId),
  travelerIdx: index('itl_traveler_idx').on(table.travelerId),
  chargeCodeIdx: index('itl_charge_code_idx').on(table.chargeCodeId),
  sourceIdx: index('itl_source_idx').on(table.sourceModule, table.sourceRecordId),
  reversedTransactionIdx: index('itl_reversed_transaction_idx').on(table.reversedTransactionId),
  createdAtIdx: index('itl_created_at_idx').on(table.createdAt),
}));

// Vendor Parts - Links parts to vendors with pricing and lead times
export const vendorParts = pgTable('vendor_parts', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' })
    .notNull(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id, { onDelete: 'cascade' })
    .notNull(),
  vendorPartNumber: text('vendor_part_number'),
  unitPrice: real('unit_price'),
  leadTimeDays: integer('lead_time_days'),
  minimumOrderQty: integer('minimum_order_qty').default(1),
  isPreferred: boolean('is_preferred').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniquePartVendor: unique().on(table.agPartNumber, table.vendorId),
}));

// Vendor Purchase Orders
export const vendorPOs = pgTable('vendor_pos', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number'),
  externalPoNumber: text('external_po_number'), // Legacy / external ERP reference number
  vendorId: integer('vendor_id')
    .references(() => vendors.id)
    .notNull(),
  productionLine: text('production_line'), // P1 | P2 | GENERAL | R_AND_D; P2 requires compliance review before project allocation
  status: text('status').notNull().default('Draft'), // Draft, RFQ Sent, Quote Received, Declined, Expired, Sent, Partially Received, Fully Received, Cancelled
  orderDate: date('order_date'),
  expectedDeliveryDate: date('expected_delivery_date'),
  actualDeliveryDate: date('actual_delivery_date'),
  shipVia: text('ship_via'),
  barcode: text('barcode').unique(),
  subtotal: real('subtotal').default(0),
  tax: real('tax').default(0),
  shippingCost: real('shipping_cost').default(0),
  totalCost: real('total_cost').default(0),
  notes: text('notes'),
  createdBy: text('created_by'),
  // Revision tracking fields
  revisionNumber: integer('revision_number').default(0).notNull(), // R0 = original, R1 = first revision, etc.
  parentPoId: integer('parent_po_id'), // Self-reference to original PO (null for originals)
  changeReason: text('change_reason'), // Required explanation for revisions
  isCurrentRevision: boolean('is_current_revision').default(true).notNull(), // Only one revision should be current
  revisedAt: timestamp('revised_at'), // When this revision was created
  revisedBy: text('revised_by'), // Who created this revision
  issuedWithoutEmail: boolean('issued_without_email').default(false),
  issuedWithoutEmailReason: text('issued_without_email_reason'),
  issuedWithoutEmailAt: timestamp('issued_without_email_at'),
  rfqOutcomeNotes: text('rfq_outcome_notes'),
  vendorConfirmedAt: timestamp('vendor_confirmed_at'),
  vendorConfirmedAction: text('vendor_confirmed_action'), // 'confirm' | 'reject' | 'acknowledge'
  archived: boolean('archived').default(false).notNull(),
  // Task #83 — Purchasing Controls (Requisition → Approval → PO)
  requisitionId: integer('requisition_id'), // FK to purchase_requisitions; required unless directPoException is set
  competitionMethod: text('competition_method'), // competed | sole-source | small-purchase | exception
  soleSourceJustification: text('sole_source_justification'),
  directPoExceptionApprovedById: integer('direct_po_exception_approved_by_id'),
  directPoExceptionApprovedByName: text('direct_po_exception_approved_by_name'),
  directPoExceptionReason: text('direct_po_exception_reason'),
  directPoExceptionApprovedAt: timestamp('direct_po_exception_approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Vendor PO Line Items
export const vendorPOItems = pgTable('vendor_po_items', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id')
    .references(() => vendorPOs.id, { onDelete: 'cascade' })
    .notNull(),
  lineNumber: integer('line_number').notNull(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber), // Nullable for ad-hoc items
  description: text('description'), // For ad-hoc items without agPartNumber
  // Purchase Unit Fields (what user enters)
  purchaseQty: real('purchase_qty'), // Quantity in purchase units (e.g., 366 sqm)
  purchaseUnitPrice: real('purchase_unit_price'), // Price per purchase unit (e.g., $17.18/sqm)
  purchaseUnit: text('purchase_unit'), // Unit for purchase (e.g., "sqm")
  // Vendor Unit Fields (what shows on PO)
  quantity: real('quantity').notNull(), // Quantity in vendor units (e.g., 3 rolls) - changed from integer to real
  unitPrice: real('unit_price').notNull(), // Price per vendor unit (e.g., $2,095.96/roll)
  vendorUnit: text('vendor_unit'), // Unit for vendor (e.g., "roll")
  conversionFactor: real('conversion_factor'), // Purchase qty per vendor unit (e.g., 122 sqm/roll)
  lineTotal: real('line_total').notNull(),
  receivedQuantity: real('received_quantity').default(0),
  receivedDate: date('received_date'),
  notes: text('notes'),
  customerPoId: integer('customer_po_id')
    .references(() => p2PurchaseOrders.id), // Optional link to customer PO (internal tracking only)
  projectId: uuid('project_id')
    .references((): AnyPgColumn => projects.id, { onDelete: 'set null' }), // Optional project traceability
  productionWorkOrderId: uuid('production_work_order_id')
    .references((): AnyPgColumn => productionWorkOrders.id, { onDelete: 'set null' }), // Optional WAD/work order traceability
  chargeCodeId: integer('charge_code_id')
    .references((): AnyPgColumn => chargeCodes.id, { onDelete: 'set null' }), // Optional cost objective traceability
  otherIdentifier: text('other_identifier'), // Optional identifier when no customer PO (internal tracking only)
  historicalAvgPrice: real('historical_avg_price'),
  priceVariancePercent: real('price_variance_percent'),
  varianceFlag: boolean('variance_flag').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Central Company Settings (singleton table for company-wide information)
export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name'),
  companyAddress: text('company_address'),
  companyPhone: text('company_phone'),
  companyEmail: text('company_email'),
  companyWebsite: text('company_website'),
  companyLogoUrl: text('company_logo_url'),
  companyLogoFilename: text('company_logo_filename'),
  companyLogoMimetype: text('company_logo_mimetype'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Vendor PO Settings (singleton table for global PO settings)
export const vendorPOSettings = pgTable('vendor_po_settings', {
  id: serial('id').primaryKey(),
  // PO Contact Person
  contactName: text('contact_name'),
  contactTitle: text('contact_title'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  // PO Terms and Instructions
  termsAndConditions: text('terms_and_conditions'),
  paymentTerms: text('payment_terms'),
  shippingInstructions: text('shipping_instructions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Optional Settings - Reusable statements that can be added to individual POs
export const optionalSettings = pgTable('optional_settings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  statement: text('statement').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// PO Optional Settings - Junction table linking POs to optional settings
export const poOptionalSettings = pgTable('po_optional_settings', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id')
    .references(() => vendorPOs.id, { onDelete: 'cascade' })
    .notNull(),
  optionalSettingId: integer('optional_setting_id')
    .references(() => optionalSettings.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Vendor PO Attachments - Files attached to vendor POs (emails, reference docs, etc.)
export const vendorPoAttachments = pgTable('vendor_po_attachments', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id')
    .references(() => vendorPOs.id, { onDelete: 'cascade' })
    .notNull(),
  fileName: text('file_name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: text('uploaded_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Vendor PO Compliance Reviews — Pre-issue compliance gate (FAR/DFARS/DPAS/CoC/MTR etc.)
export const vendorPoComplianceReviews = pgTable('vendor_po_compliance_reviews', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id')
    .references(() => vendorPOs.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // One active review record per PO (upsert pattern)
  governmentContract: boolean('government_contract').notNull().default(false),
  farRequired: boolean('far_required').notNull().default(false),
  dpasRequired: boolean('dpas_required').notNull().default(false),
  cocRequired: boolean('coc_required').notNull().default(false),
  mtrRequired: boolean('mtr_required').notNull().default(false),
  sourceInspectionRequired: boolean('source_inspection_required').notNull().default(false),
  secondPartyComplete: boolean('second_party_complete').notNull().default(false),
  vendorApproved: boolean('vendor_approved').notNull().default(false),
  reviewNotes: text('review_notes').notNull().default(''), // Mandatory justification field
  reviewedByUserId: integer('reviewed_by_user_id'),
  reviewedByDisplayName: text('reviewed_by_display_name'),
  reviewedAt: timestamp('reviewed_at'),
  reviewStatus: text('review_status').notNull().default('pending'), // pending | reviewed | blocked
  historicalBackfill: boolean('historical_backfill').notNull().default(false),
  legacyExceptionFlagged: boolean('legacy_exception_flagged').notNull().default(false),
  legacyExceptionReason: text('legacy_exception_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertVendorPoComplianceReviewSchema = createInsertSchema(vendorPoComplianceReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  reviewNotes: z.string().min(1, 'Justification is required'),
  reviewStatus: z.enum(['pending', 'reviewed', 'blocked', 'requires_attention']).optional(),
});

export type VendorPoComplianceReview = typeof vendorPoComplianceReviews.$inferSelect;
export type InsertVendorPoComplianceReview = z.infer<typeof insertVendorPoComplianceReviewSchema>;

// Procurement Compliance Effective Date — stores the date from which mandatory compliance
// enforcement began. POs issued before this date are "legacy pre-policy" and are NOT
// scored as failures. Each change is appended as a new row for full audit history.
export const procurementComplianceEffectiveDates = pgTable('procurement_compliance_effective_dates', {
  id: serial('id').primaryKey(),
  effectiveDate: date('effective_date').notNull(),
  configuredByUserId: integer('configured_by_user_id'),
  configuredByDisplayName: text('configured_by_display_name').notNull(),
  configuredAt: timestamp('configured_at').defaultNow().notNull(),
  reason: text('reason').notNull(),
});

export const insertProcurementComplianceEffectiveDateSchema = createInsertSchema(procurementComplianceEffectiveDates).omit({
  id: true,
  configuredAt: true,
}).extend({
  effectiveDate: z.string().min(1, 'Effective date is required'),
  reason: z.string().min(1, 'Reason is required'),
});

export type ProcurementComplianceEffectiveDate = typeof procurementComplianceEffectiveDates.$inferSelect;
export type InsertProcurementComplianceEffectiveDate = z.infer<typeof insertProcurementComplianceEffectiveDateSchema>;

// ─── Communication Governance Layer ───────────────────────────────────────────

export const emailTemplates = pgTable('email_templates', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),
  allowedVariables: jsonb('allowed_variables').default('[]'),
  attachmentRules: jsonb('attachment_rules').default('{}'),
  version: integer('version').notNull().default(1),
  currentVersion: integer('current_version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: varchar('updated_by'),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

export const emailTemplateVersions = pgTable('email_template_versions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar('template_id').notNull(),
  version: integer('version').notNull(),
  subject: text('subject'),
  bodyHtml: text('body_html'),
  bodyText: text('body_text'),
  attachmentRules: jsonb('attachment_rules'),
  allowedVariables: jsonb('allowed_variables'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdBy: varchar('created_by'),
  changeNote: text('change_note'),
});

export type EmailTemplateVersion = typeof emailTemplateVersions.$inferSelect;
export type InsertEmailTemplateVersion = typeof emailTemplateVersions.$inferInsert;

export const emailTemplateEditLogs = pgTable('email_template_edit_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar('template_id').notNull(),
  editedBy: varchar('edited_by'),
  previousVersion: integer('previous_version').notNull(),
  newVersion: integer('new_version').notNull(),
  changeNote: text('change_note'),
  editedAt: timestamp('edited_at', { withTimezone: true }).defaultNow(),
});

export type EmailTemplateEditLog = typeof emailTemplateEditLogs.$inferSelect;

// ──────────────────────────────────────────────────────────────────────────────

export const communicationLogs = pgTable('communication_logs', {
  id: serial('id').primaryKey(),
  orderId: text('order_id'), // Made nullable for general communications
  messageType: text('message_type').notNull().default('transactional'), // transactional, marketing, notification
  customerId: text('customer_id').notNull(),
  type: text('type').notNull(), // order-confirmation, shipping-notification, quality-alert
  context: text('context'), // initial, resend, reminder - for order confirmation emails
  method: text('method').notNull(), // email, sms
  recipient: text('recipient').notNull(), // email address or phone number
  sender: text('sender'), // sender email/phone for inbound messages
  subject: text('subject'),
  message: text('message'),
  status: text('status').notNull().default('pending'), // pending, sent, failed, received
  skipReason: text('skip_reason'), // For skipped outcomes: dedup, cooldown, max_attempts
  error: text('error'),
  direction: text('direction').default('outbound'), // inbound, outbound
  externalId: text('external_id'), // External message ID from Twilio/SendGrid
  trackingNumber: text('tracking_number'), // For shipping notifications - enables structured deduplication
  signatureToken: text('signature_token'), // For order confirmations - legacy deduplication key
  publicSignatureId: text('public_signature_id'), // HARDENING: User-visible dedup key (sig_XXXXXXXX)
  isRead: boolean('is_read').default(false), // Whether message has been read
  sentAt: timestamp('sent_at'),
  receivedAt: timestamp('received_at'), // For inbound messages
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // ── Governance columns (Communication Domain) ──
  templateKey: varchar('template_key', { length: 255 }),
  templateVersion: integer('template_version'),
  triggeredBy: varchar('triggered_by'),
  bodyHtml: text('body_html'),
  recipients: jsonb('recipients'),
  cc: jsonb('cc'),
  attachmentsMeta: jsonb('attachments_meta'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
});

// New table for customer communications to record both incoming and outgoing messages
export const customerCommunications = pgTable('customer_communications', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  communicationLogId: integer('communication_log_id').references(
    () => communicationLogs.id
  ), // Link to the actual log entry
  threadId: text('thread_id'), // For grouping related messages
  direction: text('direction').notNull(), // 'inbound' or 'outbound'
  type: text('type').notNull(), // e.g., 'inquiry', 'response', 'support-ticket', 'feedback'
  subject: text('subject'),
  message: text('message').notNull(),
  priority: text('priority').default('normal').notNull(), // 'low', 'normal', 'high', 'urgent'
  assignedTo: text('assigned_to'), // User responsible for handling the communication
  status: text('status').default('open').notNull(), // 'open', 'in-progress', 'resolved', 'closed'
  externalId: text('external_id'), // ID from external communication system (e.g., email thread ID)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pdfDocuments = pgTable('pdf_documents', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  type: text('type').notNull(), // order-confirmation, packing-slip, invoice
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull().default('application/pdf'),
  size: integer('size').notNull(),
  path: text('path').notNull(), // file storage path
  isGenerated: boolean('is_generated').default(false),
  generatedAt: timestamp('generated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Insert schemas for Module 8
export const insertCustomerSchema = createInsertSchema(customers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Customer name is required'),
    email: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (email) => !email || z.string().email().safeParse(email).success,
        { message: 'Invalid email format' }
      ),
    phone: z.string().optional(),
    company: z.string().optional(),
    customerType: z.string().default('standard'),
    preferredCommunicationMethod: z.array(z.enum(['email', 'sms'])).optional(),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  });

export const insertCustomerContactSchema = createInsertSchema(customerContacts)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1, 'Contact name is required'),
    title: z.string().optional().nullable(),
    email: z
      .string()
      .optional()
      .nullable()
      .transform((val) => (val === '' ? null : val))
      .refine(
        (email) => !email || z.string().email().safeParse(email).success,
        { message: 'Invalid email format' }
      ),
    phone: z.string().optional().nullable(),
    isPrimary: z.boolean().default(false),
    receivesInvoices: z.boolean().default(true),
    receivesShippingNotifications: z.boolean().default(false),
    receivesOrderConfirmations: z.boolean().default(false),
    notes: z.string().optional().nullable(),
    active: z.boolean().default(true),
  });

export const insertVendorSchema = createInsertSchema(vendors)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Vendor name is required'),
    email: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (email) => !email || z.string().email().safeParse(email).success,
        { message: 'Invalid email format' }
      ),
    additionalEmail: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (email) => !email || z.string().email().safeParse(email).success,
        { message: 'Invalid email format' }
      ),
    contactPerson: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    defaultOrderMethod: z.enum(['PO', 'WEBSITE', 'EMAIL']).optional().nullable(),
    scope: z.string().optional(),
    approvalSource: z.string().optional(),
    approvalPdfUrl: z.string().optional(),
    startRenewalDate: z.string().optional().nullable(),
    approvalExpiration: z.string().optional().nullable(),
    approved: z.boolean().default(false),
    debarmentStatus: z.enum(['unknown', 'clear', 'debarred', 'suspended', 'excluded', 'blocked']).optional(),
    debarmentCheckedAt: z.string().optional().nullable(),
    debarmentEvidenceUrl: z.string().optional().nullable(),
    debarmentNotes: z.string().optional().nullable(),
    evaluated: z.boolean().default(false),
    evaluationDate: z.string().optional().nullable(),
    qualityScore: z.number().int().min(1).max(5).optional().nullable(),
    costScore: z.number().int().min(1).max(5).optional().nullable(),
    deliveryScore: z.number().int().min(1).max(5).optional().nullable(),
    responseScore: z.number().int().min(1).max(5).optional().nullable(),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  });

export const insertVendorContactSchema = createInsertSchema(vendorContacts)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    vendorId: z.number().int(),
    name: z.string().min(1, 'Contact name is required'),
    title: z.string().optional(),
    email: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine(
        (email) => !email || z.string().email().safeParse(email).success,
        { message: 'Invalid email format' }
      ),
    phone: z.string().optional(),
    isPrimary: z.boolean().default(false),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  });

export const insertVendorMonthlyEvaluationSchema = createInsertSchema(vendorMonthlyEvaluations)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    vendorId: z.number().int(),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    qualityScore: z.number().int().min(1).max(5).optional().nullable(),
    costScore: z.number().int().min(1).max(5).optional().nullable(),
    deliveryScore: z.number().int().min(1).max(5).optional().nullable(),
    responseScore: z.number().int().min(1).max(5).optional().nullable(),
    notes: z.string().optional(),
  });

// Enhanced Inventory MRP Insert Schemas

export const insertInventoryBalanceSchema = createInsertSchema(inventoryBalances)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    agPartNumber: z.string().min(1, 'Part number is required'),
    locationId: z.string().min(1, 'Location is required'),
    quantityOnHand: z.number().int().default(0),
    quantityAllocated: z.number().int().default(0),
    quantityAvailable: z.number().int().default(0),
    reorderPoint: z.number().int().default(0).optional(),
  });
export type InsertInventoryBalance = z.infer<typeof insertInventoryBalanceSchema>;
export type InventoryBalance = typeof inventoryBalances.$inferSelect;

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions)
  .omit({
    id: true,
    createdAt: true,
    transactionDate: true, // Auto-generated
  })
  .extend({
    agPartNumber: z.string().min(1, 'Part number is required'),
    transactionType: z.enum(['receipt', 'consumption', 'adjustment', 'transfer', 'return', 'issue']),
    quantity: z.number(), // Real number, can be positive or negative
    unitOfMeasure: z.string().optional().nullable(),
    fromLocation: z.string().optional().nullable(),
    toLocation: z.string().optional().nullable(),
    referenceType: z.string().optional().nullable(),
    referenceId: z.string().optional().nullable(),
    costPerUnit: z.coerce.number().optional().nullable(), // Coerce string to number for exact money math
    totalCost: z.coerce.number().optional().nullable(), // Coerce string to number for exact money math
    notes: z.string().optional().nullable(),
    performedBy: z.string().min(1, 'Performed by is required'), // Required field
    metadata: z.record(z.unknown()).optional().nullable(), // JSONB - typed as Record<string, unknown>
  });
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;

export const insertInventoryTransactionLedgerSchema = createInsertSchema(inventoryTransactionLedger)
  .omit({
    id: true,
    transactionNumber: true,
    eventHash: true,
    createdAt: true,
  })
  .extend({
    transactionType: z.enum([
      'RECEIVE',
      'ISSUE',
      'RETURN',
      'TRANSFER',
      'MOVE',
      'RESERVE',
      'UNRESERVE',
      'CONSUME',
      'ADJUST',
      'SCRAP',
      'SPLIT',
      'MERGE',
      'COUNT_ADJUSTMENT',
      'STATUS_CHANGE',
      'QUARANTINE',
      'RELEASE',
      'EXPIRE',
      'REVERSAL',
    ]),
    inventoryItemId: z.number().int().positive(),
    agPartNumber: z.string().min(1, 'Part number is required'),
    quantityDelta: z.union([z.string(), z.number()]),
    quantityBefore: z.union([z.string(), z.number()]),
    quantityAfter: z.union([z.string(), z.number()]),
    unitOfMeasure: z.string().min(1).default('EA'),
    performedByDisplayName: z.string().min(1, 'Performed by is required'),
    sourceModule: z.string().min(1, 'Source module is required'),
  });
export type InsertInventoryTransactionLedger = z.infer<typeof insertInventoryTransactionLedgerSchema>;
export type InventoryTransactionLedger = typeof inventoryTransactionLedger.$inferSelect;

// Task #145 — Digital signatures (Phase 3): per-user signing keypair (Ed25519,
// private key wrapped at rest with AES-256-GCM under a scrypt(password)-derived
// KEK) and the immutable signature ledger that ties a person + role + canonical
// payload to a verifiable cryptographic signature. Both tables are append-only;
// rotation = insert a new active key + stamp `revoked_at` on the old.
export const userSigningKeys = pgTable('user_signing_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').notNull().references(() => users.id),
  algorithm: text('algorithm').notNull().default('Ed25519'),
  publicKey: text('public_key').notNull(),
  wrappedPrivateKey: text('wrapped_private_key').notNull(),
  wrapAlgorithm: text('wrap_algorithm').notNull().default('AES-256-GCM'),
  wrapIv: text('wrap_iv').notNull(),
  wrapAuthTag: text('wrap_auth_tag').notNull(),
  kdf: text('kdf').notNull().default('scrypt'),
  kdfSalt: text('kdf_salt').notNull(),
  kdfParams: jsonb('kdf_params').$type<Record<string, unknown>>().notNull().default(sql`'{"N":16384,"r":8,"p":1,"keylen":32}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: text('revoked_reason'),
  rotatedFromId: uuid('rotated_from_id'),
}, (t) => ({
  userIdx: index('user_signing_keys_user_idx').on(t.userId),
}));

export type UserSigningKey = typeof userSigningKeys.$inferSelect;
export type InsertUserSigningKey = typeof userSigningKeys.$inferInsert;

export const digitalSignatures = pgTable('digital_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  signerUserId: integer('signer_user_id').notNull().references(() => users.id),
  signerRole: text('signer_role').notNull(),
  signerUsername: text('signer_username'),
  certificateId: uuid('certificate_id').notNull().references(() => userSigningKeys.id),
  algorithm: text('algorithm').notNull().default('Ed25519'),
  transactionClass: text('transaction_class').notNull(),
  signatureMeaning: text('signature_meaning'),
  signatureReason: text('signature_reason'),
  linkedObjectType: text('linked_object_type'),
  linkedObjectId: text('linked_object_id'),
  approvalRequestId: uuid('approval_request_id'),
  payloadHash: text('payload_hash').notNull(),
  payloadCanonical: jsonb('payload_canonical').$type<Record<string, unknown>>().notNull(),
  signatureBytes: text('signature_bytes').notNull(),
  signingDeviceFingerprint: text('signing_device_fingerprint'),
  signedAt: timestamp('signed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  signerIdx: index('digital_signatures_signer_idx').on(t.signerUserId),
  classIdx: index('digital_signatures_class_idx').on(t.transactionClass),
  certificateIdx: index('digital_signatures_certificate_idx').on(t.certificateId),
  linkedObjectIdx: index('digital_signatures_linked_object_idx').on(t.linkedObjectType, t.linkedObjectId),
  approvalRequestIdx: index('digital_signatures_approval_request_idx').on(t.approvalRequestId),
}));

export type DigitalSignature = typeof digitalSignatures.$inferSelect;
export type InsertDigitalSignature = typeof digitalSignatures.$inferInsert;

export const insertVendorPartSchema = createInsertSchema(vendorParts)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    agPartNumber: z.string().min(1, 'Part number is required'),
    vendorId: z.number().int().positive('Vendor ID is required'),
    vendorPartNumber: z.string().optional().nullable(),
    unitPrice: z.number().optional().nullable(),
    leadTimeDays: z.number().int().optional().nullable(),
    minimumOrderQty: z.number().int().default(1),
    isPreferred: z.boolean().default(false),
    notes: z.string().optional().nullable(),
  });
export type InsertVendorPart = z.infer<typeof insertVendorPartSchema>;
export type VendorPart = typeof vendorParts.$inferSelect;

export const insertVendorPOSchema = createInsertSchema(vendorPOs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    poNumber: z.string().nullable().optional(),
    vendorId: z.number().int().positive('Vendor ID is required'),
    productionLine: z.enum(['P1', 'P2', 'GENERAL', 'R_AND_D'], {
      required_error: 'Production line is required',
    }),
    status: z.enum(['Draft', 'RFQ Sent', 'Quote Received', 'Declined', 'Expired', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled']).default('Draft'),
    orderDate: z.string().optional().nullable(),
    expectedDeliveryDate: z.string().optional().nullable(),
    actualDeliveryDate: z.string().optional().nullable(),
    shipVia: z.string().optional().nullable(),
    barcode: z.string().optional().nullable(),
    subtotal: z.number().default(0),
    tax: z.number().default(0),
    shippingCost: z.number().default(0),
    totalCost: z.number().default(0),
    notes: z.string().optional().nullable(),
    createdBy: z.string().optional().nullable(),
    externalPoNumber: z.string().trim().optional().nullable(),
  });
export type InsertVendorPO = z.infer<typeof insertVendorPOSchema>;
export type VendorPO = typeof vendorPOs.$inferSelect;

export const insertVendorPOItemSchema = createInsertSchema(vendorPOItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    vendorPoId: z.number().int().positive('Vendor PO ID is required'),
    lineNumber: z.number().int().positive().optional(),
    agPartNumber: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    // Purchase unit fields (what user enters)
    purchaseQty: z.number().positive().optional().nullable(),
    purchaseUnitPrice: z.number().min(0).optional().nullable(),
    purchaseUnit: z.string().optional().nullable(),
    // Vendor unit fields (what shows on PO)
    quantity: z.number().positive('Quantity must be greater than 0'),
    unitPrice: z.number().min(0, 'Unit price must be 0 or greater'),
    vendorUnit: z.string().optional().nullable(),
    conversionFactor: z.number().positive().optional().nullable(),
    lineTotal: z.number(),
    receivedQuantity: z.number().default(0),
    receivedDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    customerPoId: z.number().int().positive().optional().nullable(), // Optional link to customer PO (internal tracking only)
    otherIdentifier: z.string().optional().nullable(), // Optional identifier when no customer PO (internal tracking only)
  });
export type InsertVendorPOItem = z.infer<typeof insertVendorPOItemSchema>;
export type VendorPOItem = typeof vendorPOItems.$inferSelect;

export const insertVendorPOSettingsSchema = createInsertSchema(vendorPOSettings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    termsAndConditions: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    shippingInstructions: z.string().optional().nullable(),
  });
export type InsertVendorPOSettings = z.infer<typeof insertVendorPOSettingsSchema>;
export type VendorPOSettings = typeof vendorPOSettings.$inferSelect;

export const insertCompanySettingsSchema = createInsertSchema(companySettings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

export const insertOptionalSettingSchema = createInsertSchema(optionalSettings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Name is required'),
    statement: z.string().min(1, 'Statement is required'),
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  });
export type InsertOptionalSetting = z.infer<typeof insertOptionalSettingSchema>;
export type OptionalSetting = typeof optionalSettings.$inferSelect;

export const insertPOOptionalSettingSchema = createInsertSchema(poOptionalSettings)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    vendorPoId: z.number().int().positive('Vendor PO ID is required'),
    optionalSettingId: z.number().int().positive('Optional Setting ID is required'),
  });
export type InsertPOOptionalSetting = z.infer<typeof insertPOOptionalSettingSchema>;
export type POOptionalSetting = typeof poOptionalSettings.$inferSelect;

export const insertVendorPoAttachmentSchema = createInsertSchema(vendorPoAttachments)
  .omit({
    id: true,
    createdAt: true,
  });
export type InsertVendorPoAttachment = z.infer<typeof insertVendorPoAttachmentSchema>;
export type VendorPoAttachment = typeof vendorPoAttachments.$inferSelect;

// Order Attachments Table
export const orderAttachments = pgTable('order_attachments', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // References orders.id
  fileName: text('file_name').notNull(), // Stored filename (unique)
  originalFileName: text('original_file_name').notNull(), // User's original filename
  fileSize: integer('file_size').notNull(), // File size in bytes
  mimeType: text('mime_type').notNull(), // MIME type (image/jpeg, application/pdf, etc.)
  filePath: text('file_path').notNull(), // Full path to file
  uploadedBy: text('uploaded_by'), // User who uploaded (optional for now)
  notes: text('notes'), // Optional notes about the attachment
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertOrderAttachmentSchema = createInsertSchema(
  orderAttachments
).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderAttachment = z.infer<typeof insertOrderAttachmentSchema>;
export type OrderAttachment = typeof orderAttachments.$inferSelect;

export const insertCustomerAddressSchema = createInsertSchema(customerAddresses)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.string().min(1, 'Customer ID is required'),
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipCode: z.string().min(1, 'ZIP code is required'),
    country: z.string().min(1, 'Country is required'),
    type: z.enum(['shipping', 'billing', 'both']).default('shipping'),
    isDefault: z.boolean().default(false),
  });

export const insertCommunicationLogSchema = createInsertSchema(
  communicationLogs
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    orderId: z.string().optional(),
    messageType: z.enum(['transactional', 'marketing', 'notification']).default('transactional'),
    customerId: z.string().min(1, 'Customer ID is required'),
    type: z.enum([
      'order-confirmation',
      'shipping-notification',
      'quality-alert',
      'customer-inquiry',
      'customer-response',
      'general',
    ]),
    method: z.enum(['email', 'sms']),
    direction: z.enum(['inbound', 'outbound']),
    recipient: z.string().min(1, 'Recipient is required'),
    sender: z.string().optional(),
    subject: z.string().optional(),
    message: z.string().min(1, 'Message is required'),
    status: z
      .enum(['pending', 'sent', 'failed', 'received'])
      .default('pending'),
    externalId: z.string().optional(),
  });

export const insertPdfDocumentSchema = createInsertSchema(pdfDocuments)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    type: z.enum(['order-confirmation', 'packing-slip', 'invoice']),
    filename: z.string().min(1, 'Filename is required'),
    contentType: z.string().default('application/pdf'),
    size: z.number().min(0),
    path: z.string().min(1, 'Path is required'),
  });

// Nonconformance Tracking - Module 17
export const nonconformanceRecords = pgTable('nonconformance_records', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  rmaNumber: text('rma_number'),
  orderId: text('order_id'),
  serialNumber: text('serial_number'),
  customerName: text('customer_name'),
  poNumber: text('po_number'),
  stockModel: text('stock_model'),
  quantity: integer('quantity').default(1),
  additionalOrderIds: text('additional_order_ids').array().default(sql`ARRAY[]::text[]`),
  additionalSerialNumbers: text('additional_serial_numbers').array().default(sql`ARRAY[]::text[]`),
  issueCause: text('issue_cause').notNull(),
  manufacturerDefect: boolean('manufacturer_defect').default(false),
  disposition: text('disposition').notNull(),
  authorization: text('auth_person').notNull(),
  dispositionDate: date('disposition_date').notNull(),
  dateReceived: date('date_received'),
  notes: text('notes'),
  status: text('status').default('Open'), // Open, Resolved
  resolvedAt: timestamp('resolved_at'),
  // Classification fields (added to DB before Drizzle ORM tracking)
  p1OrP2: text('p1_or_p2').notNull().default('P1'), // 'P1' or 'P2'
  type: text('type').notNull().default('return'), // 'return', 'warranty', etc.
  sku: text('sku'),
  customerId: integer('customer_id'),
  dispositionAction: text('disposition_action'),
  resolutionType: text('resolution_type'),
  newOrderId: text('new_order_id'),
  repairDepartment: text('repair_department'),
  repairNotes: text('repair_notes'),
  hasCustomerPartsToReturn: boolean('has_customer_parts_to_return').default(false),
  addedToRts: boolean('added_to_rts').default(false),
  rtsAddedAt: timestamp('rts_added_at'),
  useOrderAddress: boolean('use_order_address').default(false),
  repairAddress: jsonb('repair_address'),
  // Shipping fields for RMA shipments
  shippingStatus: text('shipping_status'), // null, 'Ready to Ship', 'Shipped'
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier'),
  shippedDate: date('shipped_date'),
  customerNotified: boolean('customer_notified').default(false),
  // State confirmation fields for Attention & State-Confidence system
  viewedBy: jsonb('viewed_by').$type<Record<string, string>>().default(sql`'{}'::jsonb`), // { [userId]: ISO timestamp }
  lastConfirmedAt: timestamp('last_confirmed_at'), // When state was last confirmed as accurate
  lastConfirmedByUserId: integer('last_confirmed_by_user_id'), // Who confirmed the state
  confirmationNote: text('confirmation_note'), // Optional short note with confirmation
  attentionRisk: text('attention_risk').$type<'low' | 'medium' | 'high'>(), // Computed staleness risk level
  containmentAction: text('containment_action'),
  containmentOwner: text('containment_owner'),
  containmentDueDate: date('containment_due_date'),
  containmentCompletedAt: timestamp('containment_completed_at'),
  rootCause: text('root_cause'),
  rootCauseMethod: text('root_cause_method'),
  correctiveAction: text('corrective_action'),
  preventiveAction: text('preventive_action'),
  capaRequired: boolean('capa_required').default(false),
  capaId: uuid('capa_id'),
  dispositionRationale: text('disposition_rationale'),
  dispositionApprovedByUserId: integer('disposition_approved_by_user_id'),
  dispositionApprovedByDisplayName: text('disposition_approved_by_display_name'),
  dispositionApprovedAt: timestamp('disposition_approved_at'),
  effectivenessReview: text('effectiveness_review'),
  effectivenessStatus: text('effectiveness_status').default('not_started'),
  effectivenessReviewedByUserId: integer('effectiveness_reviewed_by_user_id'),
  effectivenessReviewedByDisplayName: text('effectiveness_reviewed_by_display_name'),
  effectivenessReviewedAt: timestamp('effectiveness_reviewed_at'),
  recurrenceDetected: boolean('recurrence_detected').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const capaRecords = pgTable('capa_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  capaNumber: text('capa_number').notNull().unique(),
  sourceType: text('source_type').notNull().default('NCR'),
  sourceId: text('source_id'),
  nonconformanceId: integer('nonconformance_id').references(() => nonconformanceRecords.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  problemStatement: text('problem_statement').notNull(),
  containmentAction: text('containment_action'),
  rootCause: text('root_cause'),
  correctiveAction: text('corrective_action'),
  preventiveAction: text('preventive_action'),
  recurrenceCheckPlan: text('recurrence_check_plan'),
  recurrenceDetected: boolean('recurrence_detected').default(false).notNull(),
  effectivenessCriteria: text('effectiveness_criteria'),
  effectivenessReview: text('effectiveness_review'),
  effectivenessStatus: text('effectiveness_status').notNull().default('not_started'),
  status: text('status').notNull().default('open'),
  ownerUserId: integer('owner_user_id'),
  ownerDisplayName: text('owner_display_name'),
  dueDate: date('due_date'),
  closedByUserId: integer('closed_by_user_id'),
  closedByDisplayName: text('closed_by_display_name'),
  closedAt: timestamp('closed_at'),
  evidenceUrls: text('evidence_urls').array().notNull().default(sql`ARRAY[]::text[]`),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index('capa_records_source_idx').on(table.sourceType, table.sourceId),
  ncrIdx: index('capa_records_ncr_idx').on(table.nonconformanceId),
  statusIdx: index('capa_records_status_idx').on(table.status),
  effectivenessIdx: index('capa_records_effectiveness_idx').on(table.effectivenessStatus),
}));

export const calibrationAssets = pgTable('calibration_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetTag: text('asset_tag').notNull().unique(),
  name: text('name').notNull(),
  assetType: text('asset_type').notNull().default('gage'),
  serialNumber: text('serial_number'),
  location: text('location'),
  ownerDepartment: text('owner_department'),
  status: text('status').notNull().default('active'),
  calibrationIntervalDays: integer('calibration_interval_days').notNull().default(365),
  lastCalibrationDate: date('last_calibration_date'),
  calibrationDueDate: date('calibration_due_date'),
  evidenceUrl: text('evidence_url'),
  lockoutReason: text('lockout_reason'),
  lockedOutAt: timestamp('locked_out_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  assetTagIdx: index('calibration_assets_asset_tag_idx').on(table.assetTag),
  statusIdx: index('calibration_assets_status_idx').on(table.status),
  dueDateIdx: index('calibration_assets_due_date_idx').on(table.calibrationDueDate),
}));

export const calibrationEvents = pgTable('calibration_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => calibrationAssets.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull().default('calibration'),
  eventDate: date('event_date').notNull(),
  result: text('result').notNull().default('pass'),
  performedBy: text('performed_by'),
  vendorName: text('vendor_name'),
  certificateNumber: text('certificate_number'),
  evidenceUrl: text('evidence_url'),
  nextDueDate: date('next_due_date'),
  notes: text('notes'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  assetIdx: index('calibration_events_asset_idx').on(table.assetId),
  eventDateIdx: index('calibration_events_date_idx').on(table.eventDate),
}));

export const calibrationUseLogs = pgTable('calibration_use_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').references(() => calibrationAssets.id, { onDelete: 'set null' }),
  assetTag: text('asset_tag').notNull(),
  travelerId: varchar('traveler_id', { length: 255 }),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),
  routingOperationId: integer('routing_operation_id'),
  orderId: text('order_id'),
  usedByUserId: integer('used_by_user_id'),
  usedByDisplayName: text('used_by_display_name'),
  useStatus: text('use_status').notNull().default('accepted'),
  gateMessage: text('gate_message'),
  usedAt: timestamp('used_at').defaultNow().notNull(),
}, (table) => ({
  assetTagIdx: index('calibration_use_logs_asset_tag_idx').on(table.assetTag),
  travelerIdx: index('calibration_use_logs_traveler_idx').on(table.travelerId),
  statusIdx: index('calibration_use_logs_status_idx').on(table.useStatus),
}));

export const insertNonconformanceRecordSchema = createInsertSchema(
  nonconformanceRecords
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    rmaNumber: z.string().optional(),
    orderId: z.string().optional(),
    serialNumber: z.string().optional(),
    customerName: z.string().optional(),
    poNumber: z.string().optional(),
    stockModel: z.string().optional(),
    quantity: z.number().min(1).default(1),
    additionalOrderIds: z.array(z.string()).optional().nullable(),
    additionalSerialNumbers: z.array(z.string()).optional().nullable(),
    issueCause: z.string().min(1, 'Issue cause is required'),
    manufacturerDefect: z.boolean().default(false),
    disposition: z.string().min(1, 'Disposition is required'),
    authorization: z.string().min(1, 'Authorization is required'),
    dispositionDate: z.string().min(1, 'Disposition date is required'),
    dateReceived: z.string().optional().nullable(),
    notes: z.string().optional(),
    status: z.enum(['Open', 'Resolved']).default('Open'),
    useOrderAddress: z.boolean().optional().default(false),
    repairAddress: z.object({
      street: z.string().optional().nullable(),
      street2: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zipCode: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
    }).optional().nullable(),
    // Shipping fields
    shippingStatus: z.string().optional().nullable(),
    trackingNumber: z.string().optional().nullable(),
    shippingCarrier: z.string().optional().nullable(),
    shippedDate: z.string().optional().nullable(),
    customerNotified: z.boolean().optional().default(false),
    containmentAction: z.string().optional().nullable(),
    containmentOwner: z.string().optional().nullable(),
    containmentDueDate: z.string().optional().nullable(),
    containmentCompletedAt: z.coerce.date().optional().nullable(),
    rootCause: z.string().optional().nullable(),
    rootCauseMethod: z.string().optional().nullable(),
    correctiveAction: z.string().optional().nullable(),
    preventiveAction: z.string().optional().nullable(),
    capaRequired: z.boolean().optional().default(false),
    capaId: z.string().uuid().optional().nullable(),
    dispositionRationale: z.string().optional().nullable(),
    dispositionApprovedByUserId: z.number().int().optional().nullable(),
    dispositionApprovedByDisplayName: z.string().optional().nullable(),
    dispositionApprovedAt: z.coerce.date().optional().nullable(),
    effectivenessReview: z.string().optional().nullable(),
    effectivenessStatus: z.enum(['not_started', 'pending_review', 'effective', 'ineffective']).optional().default('not_started'),
    effectivenessReviewedByUserId: z.number().int().optional().nullable(),
    effectivenessReviewedByDisplayName: z.string().optional().nullable(),
    effectivenessReviewedAt: z.coerce.date().optional().nullable(),
    recurrenceDetected: z.boolean().optional().default(false),
  });

// Types for Module 8
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = z.infer<typeof insertCustomerContactSchema>;
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type InsertCommunicationLog = z.infer<
  typeof insertCommunicationLogSchema
>;
export type CommunicationLog = typeof communicationLogs.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendorContact = z.infer<typeof insertVendorContactSchema>;
export type VendorContact = typeof vendorContacts.$inferSelect;
export type InsertVendorMonthlyEvaluation = z.infer<typeof insertVendorMonthlyEvaluationSchema>;
export type VendorMonthlyEvaluation = typeof vendorMonthlyEvaluations.$inferSelect;

// Types for Module 17 - Nonconformance
export type InsertNonconformanceRecord = z.infer<
  typeof insertNonconformanceRecordSchema
>;
export type NonconformanceRecord = typeof nonconformanceRecords.$inferSelect;
export const insertCapaRecordSchema = createInsertSchema(capaRecords)
  .omit({ id: true, capaNumber: true, createdAt: true, updatedAt: true, closedAt: true })
  .extend({
    title: z.string().min(1, 'CAPA title is required'),
    problemStatement: z.string().min(1, 'Problem statement is required'),
    status: z.enum(['open', 'in_progress', 'effectiveness_review', 'closed', 'void']).default('open'),
    effectivenessStatus: z.enum(['not_started', 'pending_review', 'effective', 'ineffective']).default('not_started'),
    evidenceUrls: z.array(z.string()).optional().default([]),
  });
export type CapaRecord = typeof capaRecords.$inferSelect;
export type InsertCapaRecord = z.infer<typeof insertCapaRecordSchema>;

export const insertCalibrationAssetSchema = createInsertSchema(calibrationAssets)
  .omit({ id: true, createdAt: true, updatedAt: true, lockedOutAt: true })
  .extend({
    assetTag: z.string().min(1, 'Asset tag is required'),
    name: z.string().min(1, 'Asset name is required'),
    status: z.enum(['active', 'due_soon', 'expired', 'locked_out', 'retired']).default('active'),
  });
export const insertCalibrationEventSchema = createInsertSchema(calibrationEvents)
  .omit({ id: true, createdAt: true })
  .extend({
    assetId: z.string().uuid(),
    eventDate: z.string().min(1, 'Event date is required'),
    result: z.enum(['pass', 'fail', 'limited_use']).default('pass'),
  });
export type CalibrationAsset = typeof calibrationAssets.$inferSelect;
export type InsertCalibrationAsset = z.infer<typeof insertCalibrationAssetSchema>;
export type CalibrationEvent = typeof calibrationEvents.$inferSelect;
export type InsertCalibrationEvent = z.infer<typeof insertCalibrationEventSchema>;
export type InsertPdfDocument = z.infer<typeof insertPdfDocumentSchema>;
export type PdfDocument = typeof pdfDocuments.$inferSelect;

// Enhanced Forms Schema
export const enhancedFormCategories = pgTable('enhanced_form_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const enhancedForms = pgTable('enhanced_forms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(
    () => enhancedFormCategories.id
  ),
  tableName: text('table_name'),
  layout: jsonb('layout').notNull(),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const enhancedFormVersions = pgTable('enhanced_form_versions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id')
    .references(() => enhancedForms.id)
    .notNull(),
  version: integer('version').notNull(),
  layout: jsonb('layout').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const enhancedFormSubmissions = pgTable('enhanced_form_submissions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id')
    .references(() => enhancedForms.id)
    .notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P1 Purchase Order Attachment type
export interface P1POAttachment {
  id: string;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string | null;
  uploadedAt: string;
  notes: string | null;
}

// Purchase Order Management Tables
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(), // Denormalized for performance
  itemType: text('item_type').notNull().default('single'), // single, multiple
  poDate: date('po_date').notNull(),
  expectedDelivery: date('expected_delivery').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, CANCELED
  notes: text('notes'),
  attachments: jsonb('attachments').$type<any[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id')
    .references(() => purchaseOrders.id)
    .notNull(),
  stockModelId: text('stock_model_id'),
  stockModelName: text('stock_model_name'),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price').default('0'),
  totalPrice: numeric('total_price').default('0'),
  handedness: text('handedness'),
  features: jsonb('features'),
  customOptions: jsonb('custom_options'),
  dueDate: date('due_date'),
  productionNotes: text('production_notes'),
  itemType: text('item_type'),
  itemId: text('item_id'),
  itemName: text('item_name'),
  specifications: jsonb('specifications'),
  notes: text('notes'),
  orderCount: integer('order_count').default(0),
  overrideP1Priority: boolean('override_p1_priority'),
  itemPipelineConfig: jsonb('item_pipeline_config'),
  stockStatus: text('stock_status'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Customer Management - separate customer database for P2 operations
export const p2Customers = pgTable('p2_customers', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  billingAddress: text('billing_address'),
  billingCity: text('billing_city'),
  billingState: text('billing_state'),
  billingZip: text('billing_zip'),
  shippingCompanyName: text('shipping_company_name'),
  shippingContactName: text('shipping_contact_name'),
  shippingAddress: text('shipping_address'),
  shippingAddress2: text('shipping_address_2'),
  shippingCity: text('shipping_city'),
  shippingState: text('shipping_state'),
  shippingZip: text('shipping_zip'),
  shipToAddress: text('ship_to_address'),
  paymentTerms: text('payment_terms').default('NET_30'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE, SUSPENDED
  notes: text('notes'),
  rfqPrefix: text('rfq_prefix'), // 3-letter prefix for RFQ numbers (e.g., "STR" for Strata-G)
  rfqSequences: jsonb('rfq_sequences').default('{}'), // Tracks RFQ sequence by year: {"2025": 15, "2024": 50}
  serialSequences: jsonb('serial_sequences').default('{}'), // Tracks serial number sequence by year: {"2026": 1}
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Customer Contacts - Additional contacts for P2 customers
export const p2CustomerContacts = pgTable('p2_customer_contacts', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull(),
  name: text('name').notNull(),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Purchase Order Management Tables
export const p2PurchaseOrders = pgTable('p2_purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  customerId: text('customer_id')
    .references(() => p2Customers.customerId)
    .notNull(),
  customerName: text('customer_name').notNull(), // Denormalized for performance
  poDate: date('po_date').notNull(),
  expectedDelivery: date('expected_delivery').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, CANCELED
  notes: text('notes'),
  attachments: jsonb('attachments').$type<string[]>().default(sql`'[]'::jsonb`),
  // Tolerance authorization - who can approve tolerance deviations for this PO
  toleranceAuthorizerId: integer('tolerance_authorizer_id').references(() => employees.id),
  toleranceAuthorizerName: text('tolerance_authorizer_name'), // Denormalized for display
  toleranceNotes: text('tolerance_notes'), // Special tolerance requirements or notes
  // BOM configuration tracking
  bomConfigured: boolean('bom_configured').default(false), // True when all line items have BOMs configured
  // Lock-after-generation - PO becomes immutable once locked
  lockedAt: timestamp('locked_at'), // Set when PO is finalized/generated - prevents further edits
  lockedBy: integer('locked_by').references(() => employees.id), // Who locked the PO

  sourceQuoteId: uuid('source_quote_id').references(() => quotes.id), // Links PO to originating quote
  contractReviewRole: text('contract_review_role').notNull().default('secondary'), // primary requires contract review before P2 release; secondary does not
  
  // Ownership fields for accountability and audit compliance
  createdById: integer('created_by_id').references(() => employees.id), // Who created the PO
  createdByName: text('created_by_name'), // Denormalized for display
  assignedToId: integer('assigned_to_id').references(() => employees.id), // Who is responsible for this PO
  assignedToName: text('assigned_to_name'), // Denormalized for display
  bomOwnerId: integer('bom_owner_id').references(() => employees.id), // Who owns the BOM configuration
  bomOwnerName: text('bom_owner_name'), // Denormalized for display
  scheduledById: integer('scheduled_by_id').references(() => employees.id), // Who scheduled this PO
  scheduledByName: text('scheduled_by_name'), // Denormalized for display
  productionLeadId: integer('production_lead_id').references(() => employees.id), // Production lead for this PO
  productionLeadName: text('production_lead_name'), // Denormalized for display
  
  // Project association for PM/P2 continuity
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  projectName: text('project_name'),
  // Revision tracking mirrors Vendor PO revision behavior for customer P2 POs
  revisionNumber: integer('revision_number').default(0).notNull(),
  parentPoId: integer('parent_po_id'),
  changeReason: text('change_reason'),
  isCurrentRevision: boolean('is_current_revision').default(true).notNull(),
  revisedAt: timestamp('revised_at'),
  revisedBy: text('revised_by'),
  securityClassification: text('security_classification').notNull().default('internal'), // public | internal | cui | itar
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  customerFileAccessRule: text('customer_file_access_rule').notNull().default('authenticated'),

  // Scrap rate tracking — incremented by nonconforming disposition workflow
  scrappedItemCount: integer('scrapped_item_count').notNull().default(0),
  scrapRatePercent: real('scrap_rate_percent').notNull().default(0),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const p2PurchaseOrderItems = pgTable('p2_purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id')
    .references(() => p2PurchaseOrders.id)
    .notNull(),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id), // FK to inventory_items
  partNumber: text('part_number').notNull(), // P2-specific part number
  partName: text('part_name').notNull(), // Display name for the part
  quantity: integer('quantity').notNull(),
  dueDate: date('due_date'),
  unitPrice: real('unit_price').default(0), // Price per unit
  totalPrice: real('total_price').default(0), // quantity * unitPrice
  specifications: text('specifications'), // Part specifications
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectRomDrafts = pgTable('project_rom_drafts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id').notNull().references((): AnyPgColumn => projects.id, { onDelete: 'cascade' }).unique(),
  status: text('status').notNull().default('draft'),
  summary: text('summary'),
  assumptions: text('assumptions'),
  riskNotes: text('risk_notes'),
  categories: jsonb('categories').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  lockedAt: timestamp('locked_at'),
  lockedReason: text('locked_reason'),
  createdBy: integer('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  createdByDisplayName: text('created_by_display_name'),
  updatedBy: integer('updated_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  updatedByDisplayName: text('updated_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdx: index('project_rom_drafts_project_idx').on(table.projectId),
  statusIdx: index('project_rom_drafts_status_idx').on(table.status),
}));

export const insertProjectRomDraftSchema = createInsertSchema(projectRomDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lockedAt: true,
});

export type ProjectRomDraft = typeof projectRomDrafts.$inferSelect;
export type InsertProjectRomDraft = z.infer<typeof insertProjectRomDraftSchema>;

// RFQ Risk Assessments - stores RFQ risk assessment records
export const rfqRiskAssessments = pgTable('rfq_risk_assessments', {
  id: serial('id').primaryKey(),
  rfqNumber: text('rfq_number').notNull(),
  customerId: text('customer_id')
    .references(() => p2Customers.customerId)
    .notNull(),
  customerName: text('customer_name').notNull(),
  description: text('description'),
  formData: jsonb('form_data').notNull(), // Stores all the risk assessment form data
  totalOverallPoints: integer('total_overall_points').default(0),
  adjustedRiskLevel: integer('adjusted_risk_level').default(0),
  riskDetermination: text('risk_determination'),
  bidDecision: text('bid_decision'),
  status: text('status').notNull().default('draft'), // draft or submitted
  securityClassification: text('security_classification').notNull().default('internal'), // public | internal | cui | itar
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  submittedBy: text('submitted_by'), // Username who submitted
  submittedAt: timestamp('submitted_at'), // When it was submitted
  attachments: text('attachments').array(), // PDF file paths
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  createdAtIdx: index('idx_rfq_created').on(table.createdAt),
}));

// P2 Part Certification Requirements - defines which certifications are required for parts by department
export const p2PartCertifications = pgTable('p2_part_certifications', {
  id: serial('id').primaryKey(),
  partNumber: text('part_number').notNull(), // Composite # from P2 PO items
  partName: text('part_name'), // Display name for reference
  departments: text('departments').array().notNull(), // Departments where certification is required
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Employee Part Certifications - tracks employee completion of certifications for specific parts
export const p2EmployeePartCertifications = pgTable('p2_employee_part_certifications', {
  id: serial('id').primaryKey(),
  partCertificationId: integer('part_certification_id')
    .references(() => p2PartCertifications.id, { onDelete: 'restrict' })
    .notNull(),
  partNumber: text('part_number').notNull(), // Denormalized for queries
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  employeeName: text('employee_name'), // Denormalized for performance
  department: text('department').notNull(),
  // Three competency checkboxes
  drawingKnowledge: boolean('drawing_knowledge').default(false), // Knowledge of drawing and department standards
  specSheetUnderstanding: boolean('spec_sheet_understanding').default(false), // Spec Sheet Understanding
  procedureCompletion: boolean('procedure_completion').default(false), // Completion of procedure after proper training
  certifiedDate: timestamp('certified_date'),
  certifiedBy: text('certified_by'), // Who verified the certification
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Department Workflow Stages - Ordered stages for serialized items
export const P2_DEPARTMENT_STAGES = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
] as const;

export type P2DepartmentStage = typeof P2_DEPARTMENT_STAGES[number];

// P2 Serialized Items - Individual tracked items from P2 PO items
export const p2SerializedItems = pgTable('p2_serialized_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  serialNumber: text('serial_number').notNull(), // Unique serial for this item (constraint exists in production as p2_serialized_items_serial_number_key)
  barcode: text('barcode').notNull(), // Format: {PONumber}-{PartNumber}-{Sequence} (constraint exists in production as p2_serialized_items_barcode_key)
  poId: integer('po_id')
    .references(() => p2PurchaseOrders.id)
    .notNull(),
  poItemId: integer('po_item_id')
    .references(() => p2PurchaseOrderItems.id)
    .notNull(),
  poNumber: text('po_number').notNull(), // Denormalized for performance
  partNumber: text('part_number').notNull(), // Denormalized for performance
  partName: text('part_name').notNull(), // Denormalized for display
  customerId: text('customer_id').notNull(), // Denormalized from PO
  customerName: text('customer_name').notNull(), // Denormalized from PO
  sequenceNumber: integer('sequence_number').notNull(), // Item sequence within PO item (1, 2, 3...)
  currentDepartment: text('current_department').notNull().default('Layup'), // Current workflow stage
  currentStageIndex: integer('current_stage_index').notNull().default(0), // Index in P2_DEPARTMENT_STAGES array
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, COMPLETED, SCRAPPED, HOLD
  departmentHistory: jsonb('department_history').default('[]'), // Quick-read cache of transitions
  metadata: jsonb('metadata'), // Flexible field for specifications, custom data
  // Department completion timestamps
  layupCompletedAt: timestamp('layup_completed_at'),
  assembleDisassemblyCompletedAt: timestamp('assemble_disassembly_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  finalQcCompletedAt: timestamp('final_qc_completed_at'),
  completedAt: timestamp('completed_at'), // When item finished all stages
  // Build family + late finalization fields
  buildFamilyKey: text('build_family_key'),
  partRoutingId: varchar('part_routing_id', { length: 255 }),
  partRoutingRevision: integer('part_routing_revision'),
  sku: text('sku'),
  drawingName: text('drawing_name'),
  customerSerialNumber: text('customer_serial_number'),
  customerSerialAssignedAt: timestamp('customer_serial_assigned_at'),
  customerSerialAssignedBy: text('customer_serial_assigned_by'),
  finalizedAt: timestamp('finalized_at'),
  finalizedBy: text('finalized_by'),
  // Hold and scrap tracking
  travelerBarcode: text('traveler_barcode'), // Physical traveler barcode (e.g. SG022317-4002P0001 REV N-022)
  holdReason: text('hold_reason'),
  holdBy: text('hold_by'), // Username who placed hold
  holdAt: timestamp('hold_at'),
  scrapReason: text('scrap_reason'),
  scrapBy: text('scrap_by'), // Username who scrapped item
  scrapAt: timestamp('scrap_at'),
  notes: text('notes'),
  barcodePrintedAt: timestamp('barcode_printed_at'), // First time a barcode label was printed for this item
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Serialized Item Events - Append-only audit log for all item transitions
export const p2SerializedItemEvents = pgTable('p2_serialized_item_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(), // Denormalized for quick queries
  eventType: text('event_type').notNull(), // GENERATED, TRANSITION, HOLD, RELEASE, SCRAP, NOTE
  fromDepartment: text('from_department'),
  toDepartment: text('to_department'),
  fromStageIndex: integer('from_stage_index'),
  toStageIndex: integer('to_stage_index'),
  performedBy: text('performed_by').notNull(), // Username who performed action
  notes: text('notes'),
  metadata: jsonb('metadata'), // Event-specific data
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  barcodeIdx: index('p2_serialized_item_events_barcode_idx').on(table.barcode),
  itemIdIdx: index('p2_serialized_item_events_item_id_idx').on(table.serializedItemId),
}));

// P2 Routing Departments - User-managed department list for part routing wizard
export const p2RoutingDepartments = pgTable('p2_routing_departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertP2RoutingDepartmentSchema = createInsertSchema(p2RoutingDepartments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertP2RoutingDepartment = z.infer<typeof insertP2RoutingDepartmentSchema>;
export type P2RoutingDepartment = typeof p2RoutingDepartments.$inferSelect;

// Routing Type Enum - Manufacturing mode classification for part routings
export const routingTypeEnum = pgEnum('routing_type', [
  'COMPOSITE',
  'CNC',
  'CORE',
  'KIT',
  'SUB_ASSEMBLY',
  'ASSEMBLY',
  'OUTSIDE_PROCESS',
  'INSPECTION',
]);

// Part Routing Definitions - Custom department sequences and traceability requirements per inventory item
export const partRoutings = pgTable('part_routings', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull(), // Reference to inventory item
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }), // Nullable for legacy routings
  partNumber: text('part_number').notNull(), // Denormalized for display
  partName: text('part_name').notNull(), // Denormalized for display
  routingName: text('routing_name').default('Default').notNull(), // AS9100 routing name for revision control
  routingRevision: integer('routing_revision').default(1).notNull(), // AS9100 controlled revision number
  departmentSequence: jsonb('department_sequence').notNull(), // Array of department names in order: ["Layup", "CNC", "Finish"]
  traceabilityConfig: jsonb('traceability_config').notNull(), // Requirements per department: { "Layup": ["lot_number", "batch_number", "expiration"], "CNC": ["custom_1"] }
  departmentConfig: jsonb('department_config'), // Full department configuration: { "Layup": { materials: [{partId, partNumber, partName, requiredFields, entryMethod}], technicianRequired: bool, qcStandards: [{standard, tolerance, requirement}] } }
  // Special Process Configuration - Same structure as department config for special processes
  specialProcessConfig: jsonb('special_process_config'), // { "processName": { materials: [{partId, partNumber, requiredFields}], qcStandards: [{standard, tolerance}], customFields: [{fieldName, fieldType, isRequired}] } }
  materialsConfig: jsonb('materials_config'), // Materials requiring traceability: [{partId, partNumber, partName, requiresLotNumber, requiresExpiration, entryMethod}]
  qcStandards: jsonb('qc_standards'), // QC standards configuration: [{standardName, specification, tolerance, requirement, measurementType}]
  customFields: jsonb('custom_fields'), // Custom data entry fields: [{fieldName, fieldLabel, fieldType, isRequired, options, defaultValue}]
  preferredMachine: text('preferred_machine'), // Preferred CNC machine or workstation for this routing
  routingType: routingTypeEnum('routing_type').default('COMPOSITE').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // Template traceability — stamped when created from a production control template
  createdFromTemplateId: uuid('created_from_template_id'),
  createdFromTemplateVersion: integer('created_from_template_version'),
  createdBy: text('created_by').notNull(), // Username who created routing
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  inventoryItemIdx: index('part_routings_inventory_item_idx').on(table.inventoryItemId),
  projectIdx: index('part_routings_project_idx').on(table.projectId),
}));

// Routing Operations - Step-by-step operations within a part routing
export const routingOperations = pgTable('routing_operations', {
  id: serial('id').primaryKey(),

  partRoutingId: uuid('part_routing_id')
    .references(() => partRoutings.id)
    .notNull(),

  stepNumber: integer('step_number').notNull(),
  departmentName: text('department_name').notNull(),

  operationName: text('operation_name').notNull(),

  operationType: text('operation_type', {
    enum: ['SETUP', 'RUN', 'INSPECT', 'OSP', 'MATERIAL', 'QC'],
  }).notNull(),

  workCenter: text('work_center'),

  estimatedMinutes: integer('estimated_minutes'),

  requiresSignature: boolean('requires_signature').default(false),
  requiresCertification: boolean('requires_certification').default(false),
  certificationId: integer('certification_id').references(() => certifications.id),

  isOutsideProcess: boolean('is_outside_process').default(false),
  vendorId: integer('vendor_id'),

  outsideProcessType: text('outside_process_type'),
  expectedLeadDays: integer('expected_lead_days'),
  certificateRequired: boolean('certificate_required').default(false),
  receivingInspectionRequired: boolean('receiving_inspection_required').default(false),
  requiredCalibrationAssetTags: text('required_calibration_asset_tags').array().notNull().default(sql`ARRAY[]::text[]`),

  instructionPack: jsonb('instruction_pack').default('{}'),

  createdAt: timestamp('created_at').defaultNow(),
});

// CNC Extension for Routing Operations - links CNC-specific data to a routing operation
export const routingCncOperations = pgTable('routing_cnc_operations', {
  id: serial('id').primaryKey(),

  routingOperationId: integer('routing_operation_id')
    .references(() => routingOperations.id)
    .notNull(),

  machineClass: text('machine_class'),
  preferredMachineId: integer('preferred_machine_id'),

  programId: integer('program_id')
    .references(() => cncPrograms.id),

  fixture: text('fixture'),

  estimatedSetupMinutes: integer('estimated_setup_minutes'),
  estimatedCycleMinutes: integer('estimated_cycle_minutes'),

  proveOutRequired: boolean('prove_out_required').default(false),
});

// Routing Templates - Reusable routing configurations by manufacturing type
export const routingTemplates = pgTable('routing_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateName: text('template_name').notNull(),
  routingType: routingTypeEnum('routing_type').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  departmentSequence: jsonb('department_sequence').default([]).notNull(),
  departmentConfig: jsonb('department_config').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  routingTypeIdx: index('routing_templates_routing_type_idx').on(table.routingType),
  isActiveIdx: index('routing_templates_is_active_idx').on(table.isActive),
}));

// Routing Template Operations - Standard operations for a template
export const routingTemplateOperations = pgTable('routing_template_operations', {
  id: serial('id').primaryKey(),
  routingTemplateId: uuid('routing_template_id')
    .references(() => routingTemplates.id)
    .notNull(),
  stepNumber: integer('step_number').notNull(),
  departmentName: text('department_name').notNull(),
  operationName: text('operation_name').notNull(),
  operationType: text('operation_type', {
    enum: ['SETUP', 'RUN', 'INSPECT', 'OSP', 'MATERIAL', 'QC'],
  }).notNull(),
  workCenter: text('work_center'),
  estimatedMinutes: integer('estimated_minutes'),
  requiresSignature: boolean('requires_signature').default(false),
  requiresCertification: boolean('requires_certification').default(false),
  isOutsideProcess: boolean('is_outside_process').default(false),
  vendorId: integer('vendor_id'),
  instructionPack: jsonb('instruction_pack').default('{}'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('routing_template_operations_template_id_idx').on(table.routingTemplateId),
}));

// Anodize Jobs - Outside process tracking for anodizing
export const anodizeJobs = pgTable('anodize_jobs', {
  id: serial('id').primaryKey(),

  routingOperationId: integer('routing_operation_id')
    .references(() => routingOperations.id)
    .notNull(),

  travelerId: varchar('traveler_id', { length: 255 }),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),
  partRoutingId: uuid('part_routing_id'),

  partNumber: text('part_number').notNull(),
  partName: text('part_name').notNull(),
  quantity: integer('quantity').default(1).notNull(),

  vendorId: integer('vendor_id'),
  vendorRef: text('vendor_ref'),

  anodizeType: text('anodize_type'),
  finishSpec: text('finish_spec'),
  color: text('color'),

  status: text('status', {
    enum: ['PENDING', 'READY_TO_SEND', 'SENT', 'RECEIVED', 'VERIFIED', 'HOLD', 'CANCELLED'],
  }).default('PENDING').notNull(),

  sentAt: timestamp('sent_at'),
  sentBy: text('sent_by'),
  vendorPoNumber: text('vendor_po_number'),
  expectedReturnDate: date('expected_return_date'),

  receivedAt: timestamp('received_at'),
  receivedBy: text('received_by'),
  certReceived: boolean('cert_received').default(false),
  inspectionPassed: boolean('inspection_passed').default(false),

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('anodize_jobs_status_idx').on(table.status),
  travelerIdIdx: index('anodize_jobs_traveler_id_idx').on(table.travelerId),
  routingOpIdIdx: index('anodize_jobs_routing_operation_id_idx').on(table.routingOperationId),
  partNumberIdx: index('anodize_jobs_part_number_idx').on(table.partNumber),
  vendorIdIdx: index('anodize_jobs_vendor_id_idx').on(table.vendorId),
}));

// Anodize Job Documents - Cert/CoC/process doc tracking for OSP jobs
export const anodizeJobDocuments = pgTable('anodize_job_documents', {
  id: serial('id').primaryKey(),
  anodizeJobId: integer('anodize_job_id')
    .references(() => anodizeJobs.id, { onDelete: 'cascade' })
    .notNull(),
  documentType: text('document_type', {
    enum: ['CERT', 'COC', 'PROCESS_CERT', 'THICKNESS_REPORT', 'PACKING_SLIP', 'OTHER'],
  }).default('OTHER').notNull(),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  uploadedBy: text('uploaded_by'),
  notes: text('notes'),
  isRequired: boolean('is_required').default(false).notNull(),
  isAccepted: boolean('is_accepted').default(false).notNull(),
}, (table) => ({
  jobIdIdx: index('anodize_job_documents_job_id_idx').on(table.anodizeJobId),
}));

// Anodize Job Receiving Inspections - One per job, tracks receiving inspection result
export const anodizeJobReceivingInspections = pgTable('anodize_job_receiving_inspections', {
  id: serial('id').primaryKey(),
  anodizeJobId: integer('anodize_job_id')
    .references(() => anodizeJobs.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  inspectionStatus: text('inspection_status', {
    enum: ['PENDING', 'PASS', 'FAIL'],
  }).default('PENDING').notNull(),
  inspectedAt: timestamp('inspected_at'),
  inspectedBy: text('inspected_by'),
  notes: text('notes'),
  thicknessVerified: boolean('thickness_verified').default(false).notNull(),
  colorVerified: boolean('color_verified').default(false).notNull(),
  damageFree: boolean('damage_free').default(false).notNull(),
  quantityVerified: boolean('quantity_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  jobIdIdx: index('anodize_job_receiving_inspections_job_id_idx').on(table.anodizeJobId),
}));

// Routing Dependencies - Assembly/sub-assembly prerequisite gating
export const routingDependencies = pgTable('routing_dependencies', {
  id: serial('id').primaryKey(),

  partRoutingId: uuid('part_routing_id')
    .references(() => partRoutings.id)
    .notNull(),

  dependencyType: text('dependency_type', {
    enum: ['CHILD_PART', 'SUB_ASSEMBLY', 'KIT', 'MATERIAL', 'TRAVELER', 'DOCUMENT', 'CERTIFICATION'],
  }).notNull(),

  requiredItemId: integer('required_item_id'),
  requiredPartNumber: text('required_part_number'),
  requiredDescription: text('required_description'),
  requiredQty: integer('required_qty'),

  isSerialized: boolean('is_serialized').default(false),
  mustBeCompleted: boolean('must_be_completed').default(true),
  mustBeAllocated: boolean('must_be_allocated').default(false),
  mustBeScanned: boolean('must_be_scanned').default(false),
  mustBeIssued: boolean('must_be_issued').default(false),
  mustBeScannedToParent: boolean('must_be_scanned_to_parent').default(false),

  blockingScope: text('blocking_scope', {
    enum: ['TRAVELER_START', 'STEP_START', 'TASK_COMPLETE'],
  }).default('TRAVELER_START').notNull(),

  routingOperationId: integer('routing_operation_id'),
  appliesToDepartment: text('applies_to_department'),
  appliesToOperationId: integer('applies_to_operation_id'),

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  partRoutingIdIdx: index('routing_dependencies_part_routing_id_idx').on(table.partRoutingId),
  dependencyTypeIdx: index('routing_dependencies_dependency_type_idx').on(table.dependencyType),
  requiredItemIdIdx: index('routing_dependencies_required_item_id_idx').on(table.requiredItemId),
  appliesToDeptIdx: index('routing_dependencies_applies_to_department_idx').on(table.appliesToDepartment),
}));

// ============================================================================
// MATERIAL TRACEABILITY SYSTEM - AS9100 Digital Material Control
// ============================================================================

// Material Lots - One record per received lot/container with unique ICN
export const materialLots = pgTable('material_lots', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // Link to inventory item (material definition)
  inventoryItemId: integer('inventory_item_id').notNull(),
  materialPartNumber: text('material_part_number').notNull(), // Denormalized
  materialName: text('material_name').notNull(), // Denormalized
  
  // Unique identifier
  internalControlNumber: text('internal_control_number').notNull().unique(), // ICN-MAT-20251223-000184
  
  // Supplier info
  supplier: text('supplier').notNull(),
  supplierLotNumber: text('supplier_lot_number'),
  supplierPartNumber: text('supplier_part_number'),
  
  // Receiving info
  purchaseOrderNumber: text('purchase_order_number'),
  receivingRecordNumber: text('receiving_record_number'),
  
  // Quantity tracking
  receivedQty: numeric('received_qty').notNull(),
  remainingQty: numeric('remaining_qty').notNull(),
  unitOfMeasure: text('unit_of_measure').default('EA').notNull(), // EA, LB, FT, SQ_FT, GAL, etc.
  
  // Date tracking
  expirationDate: timestamp('expiration_date'),
  cureDate: timestamp('cure_date'), // For prepregs
  manufactureDate: timestamp('manufacture_date'),
  
  // Storage
  storageLocation: text('storage_location'), // Freezer #, rack, bin
  storageRequirements: text('storage_requirements'), // Temperature, humidity requirements
  
  // Status tracking
  status: text('status').default('RECEIVED').notNull(), // RECEIVED | QUARANTINE | ACCEPTED | REJECTED | EXPIRED | ISSUED | CONSUMED | SCRAPPED | HOLD | LOCKED
  
  // Out-time tracking (for prepregs/time-sensitive materials)
  totalOutTimeMinutes: integer('total_out_time_minutes').default(0),
  maxOutTimeMinutes: integer('max_out_time_minutes'), // Limit before material expires
  currentlyOutOfStorage: boolean('currently_out_of_storage').default(false),
  lastOutAt: timestamp('last_out_at'),
  // Shelf-life lock metadata (Task #165)
  lockedReason: text('locked_reason'),
  lockedAt: timestamp('locked_at'),
  
  // Parent lot (for splits)
  parentLotId: uuid('parent_lot_id'),
  
  // Documents
  cocAttachment: text('coc_attachment'), // Certificate of Conformance file path
  inspectionAttachment: text('inspection_attachment'),
  
  // Audit
  receivedBy: text('received_by').notNull(),
  receivedAt: timestamp('received_at').defaultNow(),
  inspectedBy: text('inspected_by'),
  inspectedAt: timestamp('inspected_at'),
  acceptedBy: text('accepted_by'),
  acceptedAt: timestamp('accepted_at'),
  
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  icnIdx: index('material_lots_icn_idx').on(table.internalControlNumber),
  inventoryItemIdx: index('material_lots_inventory_item_idx').on(table.inventoryItemId),
  statusIdx: index('material_lots_status_idx').on(table.status),
  supplierIdx: index('material_lots_supplier_idx').on(table.supplier),
}));

// Material Lot Transactions - Audit trail for all material lot movements
export const materialLotTransactions = pgTable('material_lot_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id, { onDelete: 'cascade' })
    .notNull(),
  internalControlNumber: text('internal_control_number').notNull(), // Denormalized for queries
  
  // Transaction type
  transactionType: text('transaction_type').notNull(), // RECEIVE | MOVE | ISSUE | ADJUST | SCRAP | RETURN | SPLIT | OUT_START | OUT_END | ACCEPT | REJECT | QUARANTINE | EXPIRE | HOLD
  
  // Quantity change
  qtyBefore: numeric('qty_before'),
  qtyChange: numeric('qty_change'), // Negative for decreases
  qtyAfter: numeric('qty_after'),
  
  // Location tracking
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  
  // Reference — for RECEIVE transactions both receipt and unit are linked
  referenceType: text('reference_type'), // TRAVELER | WORK_ORDER | ADJUSTMENT | SCRAP_REPORT | received_unit
  referenceId: text('reference_id'),     // ID of the primary reference object (received_unit.id for RECEIVE)
  receiptId: integer('receipt_id'),      // Explicit FK to receiving_receipts for traceability queries
  
  // Actor
  performedBy: text('performed_by').notNull(),
  performedAt: timestamp('performed_at').defaultNow(),
  
  // Reason/notes
  reason: text('reason'),
  notes: text('notes'),
  
  // Override tracking
  wasOverride: boolean('was_override').default(false),
  overrideApprovedBy: text('override_approved_by'),
  overrideReason: text('override_reason'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  lotIdIdx: index('material_lot_transactions_lot_id_idx').on(table.materialLotId),
  icnIdx: index('material_lot_transactions_icn_idx').on(table.internalControlNumber),
  typeIdx: index('material_lot_transactions_type_idx').on(table.transactionType),
}));

// Traveler Material Consumption - Links materials to traveler steps
// NOTE: Foreign keys to travelers/travelerSteps defined via SQL since those tables are defined later
export const travelerMaterialConsumption = pgTable('traveler_material_consumption', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // Traveler reference (foreign keys added via database, not Drizzle refs due to table order)
  travelerId: uuid('traveler_id').notNull(),
  travelerStepId: uuid('traveler_step_id').notNull(),
  travelerTaskId: uuid('traveler_task_id'), // Optional link to specific TRACE task
  
  // Material reference
  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id)
    .notNull(),
  internalControlNumber: text('internal_control_number').notNull(), // Denormalized
  
  // What was consumed
  materialPartNumber: text('material_part_number').notNull(),
  materialName: text('material_name').notNull(),
  
  // Quantity
  qtyUsed: numeric('qty_used').notNull(),
  unitOfMeasure: text('unit_of_measure').notNull(),
  
  // Validation status at time of scan
  validationStatus: text('validation_status').notNull(), // VALID | OVERRIDE | WARNING
  validationDetails: jsonb('validation_details'), // { expired: false, correctType: true, sufficientQty: true, ... }
  
  // Who scanned it
  scannedBy: text('scanned_by').notNull(),
  scannedAt: timestamp('scanned_at').defaultNow(),
  badgeScan: text('badge_scan'),
  
  // Override tracking
  wasOverride: boolean('was_override').default(false),
  overrideApprovedBy: text('override_approved_by'),
  overrideReason: text('override_reason'),

  // Physical receiving unit linkage (Phase 2 — traveler consumption integration)
  // Nullable: pre-Phase-2 records and lots without a linked received_unit will be NULL
  receivedUnitId: integer('received_unit_id').references(() => receivedUnits.id, { onDelete: 'set null' }),

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  travelerIdIdx: index('traveler_material_consumption_traveler_idx').on(table.travelerId),
  stepIdIdx: index('traveler_material_consumption_step_idx').on(table.travelerStepId),
  lotIdIdx: index('traveler_material_consumption_lot_idx').on(table.materialLotId),
  icnIdx: index('traveler_material_consumption_icn_idx').on(table.internalControlNumber),
  receivedUnitIdIdx: index('traveler_material_consumption_received_unit_idx').on(table.receivedUnitId),
}));

// ============================================================================
// MATERIAL LOT RESERVATIONS - Pre-production quantity reservation
// ============================================================================
// A reservation pre-commits a quantity from a lot before physical consumption.
// This prevents over-commit across concurrent production orders.

export const materialLotReservations = pgTable('material_lot_reservations', {
  id: serial('id').primaryKey(),

  // Core foreign keys
  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id, { onDelete: 'cascade' })
    .notNull(),
  receivedUnitId: integer('received_unit_id'), // nullable — FK to received_units.id
  travelerId: uuid('traveler_id'),             // nullable — which traveler holds this reservation
  workOrderId: integer('work_order_id'),        // nullable — link to production work order

  // Quantity
  quantityReserved: numeric('quantity_reserved').notNull(),
  unitOfMeasure: text('unit_of_measure').notNull(),

  // Lifecycle: active → fulfilled (on consumption) | cancelled
  status: text('status').notNull().default('active'), // active | fulfilled | cancelled

  // Routing-step intent (Task #144). Pins the reservation to a specific
  // routing step so that material reserved for "Layup" cannot be consumed
  // during "Cutting", and vice versa. Nullable for legacy rows; new
  // reservations created via MaterialIssueService MUST set it.
  intendedRoutingStepId: varchar('intended_routing_step_id', { length: 255 }),

  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  lotIdIdx: index('material_lot_reservations_lot_idx').on(table.materialLotId),
  statusIdx: index('material_lot_reservations_status_idx').on(table.status),
  travelerIdIdx: index('material_lot_reservations_traveler_idx').on(table.travelerId),
  receivedUnitIdIdx: index('material_lot_reservations_ru_idx').on(table.receivedUnitId),
  intendedStepIdx: index('material_lot_reservations_intended_step_idx').on(table.intendedRoutingStepId),
}));

// ============================================================================
// MATERIAL-ISSUE OVERRIDE APPROVALS (Task #144 Phase 2)
// ============================================================================
//
// Every MaterialIssueService override must reference a row in this table.
// Approvers create the row out-of-band (UI / API call backed by a real
// authentication context) BEFORE the operator attempts the draw. The
// service loads the row, verifies status='APPROVED' + reason/blocker/lot/
// traveler context match + not expired, then transitions it to CONSUMED
// in the same transaction as the ledger write. Single-use, immutable
// audit artifact.

export const materialIssueApprovals = pgTable('material_issue_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  reason: text('reason').notNull(),
  bypassesBlocker: text('bypasses_blocker').notNull(),
  materialLotId: uuid('material_lot_id').references(() => materialLots.id, { onDelete: 'set null' }),
  travelerId: uuid('traveler_id'),
  intendedRoutingStepId: varchar('intended_routing_step_id', { length: 255 }),
  approverUserId: integer('approver_user_id').notNull().references(() => users.id),
  approverRoleAtApproval: text('approver_role_at_approval').notNull(),
  writtenReason: text('written_reason').notNull(),
  status: text('status').notNull().default('APPROVED'),
  approvedAt: timestamp('approved_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  consumedByLedgerEntryId: uuid('consumed_by_ledger_entry_id'),
  revokedAt: timestamp('revoked_at'),
  revokedByUserId: integer('revoked_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('material_issue_approvals_status_idx').on(table.status),
  lotIdx: index('material_issue_approvals_lot_idx').on(table.materialLotId),
  travelerIdx: index('material_issue_approvals_traveler_idx').on(table.travelerId),
}));

// ============================================================================
// NATIVE CHARGE CODE REGISTRY
// ============================================================================

export const chargeCodes = pgTable('charge_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description'),
  type: text('type').notNull().default('DIRECT'), // DIRECT | OVERHEAD | G_AND_A
  costHandling: text('cost_handling').notNull().default('DIRECT_CONTRACT'), // DIRECT_CONTRACT | IRAD | BID_PROPOSAL | FRINGE | OVERHEAD | G_AND_A | UNALLOWABLE | OTHER
  productionLine: text('production_line'), // P1 | P2 | P3 | P4...
  activityCategory: text('activity_category'), // Reporting rollup, e.g. Layup, QC, Cleanup, CSR
  costObjectivePolicy: text('cost_objective_policy').notNull().default('NONE'), // NONE | P1_INVENTORY_WIP_GENERAL_STOCK | PROJECT_REQUIRED | CONFIGURED
  inventoryWipPolicy: text('inventory_wip_policy'), // P1_INVENTORY_WIP_GENERAL_STOCK when P1 direct stock should capitalize after approval
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  chargePhase: text('charge_phase'),
  allowProject: boolean('allow_project').notNull().default(false),
  requireProject: boolean('require_project').notNull().default(false),
  allowClin: boolean('allow_clin').notNull().default(false),
  requireClin: boolean('require_clin').notNull().default(false),
  contractReference: text('contract_reference'),
  department: text('department'),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  maxHoursPerDay: doublePrecision('max_hours_per_day'),
  billable: boolean('billable').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const insertChargeCodeSchema = createInsertSchema(chargeCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChargeCode = z.infer<typeof insertChargeCodeSchema>;
export type ChargeCode = typeof chargeCodes.$inferSelect;

export const chargeCodeEmployeeAssignments = pgTable('charge_code_employee_assignments', {
  id: serial('id').primaryKey(),
  chargeCodeId: integer('charge_code_id').notNull().references(() => chargeCodes.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  assignedByUserId: integer('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  isDefault: boolean('is_default').notNull().default(false),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueChargeCodeEmployee: unique().on(table.chargeCodeId, table.employeeId),
  oneDefaultPerEmployee: uniqueIndex('charge_code_employee_assignments_one_default_per_employee_idx').on(table.employeeId).where(sql`is_default = true`),
  chargeCodeIdx: index('charge_code_employee_assignments_charge_code_idx').on(table.chargeCodeId),
  employeeIdx: index('charge_code_employee_assignments_employee_idx').on(table.employeeId),
}));

export type ChargeCodeEmployeeAssignment = typeof chargeCodeEmployeeAssignments.$inferSelect;

export const wadChargeCodeRequests = pgTable('wad_charge_code_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  wadId: uuid('wad_id').references((): AnyPgColumn => productionWorkOrders.id, { onDelete: 'cascade' }),
  department: text('department').notNull(),
  operation: text('operation').notNull(),
  laborCategory: text('labor_category'),
  classification: text('classification').notNull().default('DIRECT'),
  budgetedHours: numeric('budgeted_hours'),
  requestedByUserId: integer('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestedByDisplayName: text('requested_by_display_name').notNull().default('Unknown'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull().default('PENDING'),
  assignedChargeCodeId: integer('assigned_charge_code_id').references(() => chargeCodes.id, { onDelete: 'set null' }),
  assignedByUserId: integer('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  notes: text('notes'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('wad_charge_code_requests_status_idx').on(table.status, table.requestedAt),
  wadIdx: index('wad_charge_code_requests_wad_idx').on(table.wadId),
  openOperationIdx: uniqueIndex('wad_charge_code_requests_open_operation_idx')
    .on(table.wadId, table.department, table.operation)
    .where(sql`status = 'PENDING'`),
}));

export type WadChargeCodeRequest = typeof wadChargeCodeRequests.$inferSelect;

// ============================================================================
// TRAVELER SYSTEM - AS9100 Digital Travelers (Execution Records)
// ============================================================================

// Travelers - Header/controlled record for production execution
export const travelers = pgTable('travelers', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerNumber: varchar('traveler_number', { length: 255 }).notNull().unique(),
  travelerRevision: integer('traveler_revision').default(1).notNull(),

  inventoryItemId: varchar('inventory_item_id', { length: 255 }),
  partNumber: varchar('part_number', { length: 255 }),
  partName: varchar('part_name', { length: 255 }),

  salesOrderId: varchar('sales_order_id', { length: 255 }),
  workOrderId: varchar('work_order_id', { length: 255 }),
  productionWorkOrderId: uuid('production_work_order_id').references((): AnyPgColumn => productionWorkOrders.id),
  wadRevisionId: uuid('wad_revision_id'),
  projectId: uuid('project_id').references((): AnyPgColumn => projects.id),
  defaultChargeCodeId: integer('default_charge_code_id').references(() => chargeCodes.id, { onDelete: 'set null' }),

  lotNumber: varchar('lot_number', { length: 255 }),
  serialNumber: varchar('serial_number', { length: 255 }),
  internalControlNumber: varchar('internal_control_number', { length: 255 }),
  quantity: integer('quantity').default(1),

  status: varchar('status', { length: 50 }).default('DRAFT').notNull(),

  partRoutingId: varchar('part_routing_id', { length: 255 }),
  partRoutingRevision: integer('part_routing_revision'),

  // Template traceability — stamped when created from a production control template
  createdFromTemplateId: uuid('created_from_template_id'),
  createdFromTemplateVersion: integer('created_from_template_version'),

  // Editable, non-truncated link/notes pasted when an item is completed
  // off-system from the P2 Production Queue. Mirrors the `Off-system: …`
  // summary that is also stamped into `workOrderId` for legacy display.
  offSystemCompletionLink: text('off_system_completion_link'),

  completedAt: timestamp('completed_at', { withTimezone: true }),

  createdBy: varchar('created_by', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  travelerNumberIdx: index('travelers_number_idx').on(table.travelerNumber),
  statusIdx: index('travelers_status_idx').on(table.status),
  partNumberIdx: index('travelers_part_number_idx').on(table.partNumber),
  workOrderIdx: index('travelers_work_order_idx').on(table.workOrderId),
  wadRevisionIdx: index('travelers_wad_revision_idx').on(table.wadRevisionId),
}));

// Traveler Steps - Departments in sequence
export const travelerSteps = pgTable('traveler_steps', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerId: varchar('traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'cascade' })
    .notNull(),

  departmentName: varchar('department_name', { length: 255 }).notNull(),
  stepNumber: integer('step_number').notNull(),
  status: varchar('status', { length: 50 }).default('NOT_STARTED').notNull(),

  assignedTechnicianId: varchar('assigned_technician_id', { length: 255 }),
  
  startedAt: timestamp('started_at', { withTimezone: true }),
  startedBy: varchar('started_by', { length: 255 }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: varchar('completed_by', { length: 255 }),
  blockedAt: timestamp('blocked_at', { withTimezone: true }),
  blockedReason: text('blocked_reason'),
  notes: text('notes'),
}, (table) => ({
  travelerIdIdx: index('traveler_steps_traveler_id_idx').on(table.travelerId),
  stepNumberIdx: index('traveler_steps_step_number_idx').on(table.stepNumber),
}));

// Traveler Tasks - Start/end tasks, QC tasks, special process tasks per step
export const travelerTasks = pgTable('traveler_tasks', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerStepId: varchar('traveler_step_id', { length: 255 })
    .references(() => travelerSteps.id, { onDelete: 'cascade' })
    .notNull(),

  taskType: varchar('task_type', { length: 100 }).notNull(),
  taskPhase: text('task_phase').notNull().default('WORK'),

  title: varchar('title', { length: 255 }).notNull(),
  instructions: text('instructions'),
  required: boolean('required').default(true),
  sortOrder: integer('sort_order').default(0),

  timePolicy: varchar('time_policy', { length: 50 }).default('AUTO_ON_COMPLETE'),
  requiresSignature: boolean('requires_signature').default(false),
  signatureRole: varchar('signature_role', { length: 50 }),
  requiresCertification: boolean('requires_certification').default(false),

  instructionPack: jsonb('instruction_pack'),

  status: varchar('status', { length: 50 }).default('NOT_STARTED').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: varchar('completed_by', { length: 255 }),

  // Template traceability — set when checkpoint injected from QC template
  templateSourceId: uuid('template_source_id'),
}, (table) => ({
  stepIdIdx: index('traveler_tasks_step_id_idx').on(table.travelerStepId),
  taskTypeIdx: index('traveler_tasks_type_idx').on(table.taskType),
  taskPhaseIdx: index('traveler_tasks_phase_idx').on(table.taskPhase),
}));

// Traveler Task Fields - Data capture per task (flexible, AS9100 evidence)
export const travelerTaskFields = pgTable('traveler_task_fields', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerTaskId: varchar('traveler_task_id', { length: 255 })
    .references(() => travelerTasks.id, { onDelete: 'cascade' })
    .notNull(),

  fieldKey: varchar('field_key', { length: 255 }).notNull(),
  fieldLabel: varchar('field_label', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).default('text'),
  required: boolean('required').default(false),

  value: text('value'),
  validation: jsonb('validation'),
  
  recordedBy: varchar('recorded_by', { length: 255 }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }),
}, (table) => ({
  taskIdIdx: index('traveler_task_fields_task_id_idx').on(table.travelerTaskId),
  uniqTaskFieldKey: uniqueIndex('uniq_traveler_task_field_key').on(table.travelerTaskId, table.fieldKey),
}));

// Traveler Signatures - Digital signature required for step completion
export const travelerSignatures = pgTable('traveler_signatures', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerStepId: varchar('traveler_step_id', { length: 255 })
    .references(() => travelerSteps.id, { onDelete: 'cascade' })
    .notNull(),
  travelerTaskId: varchar('traveler_task_id', { length: 255 }),

  signedBy: varchar('signed_by', { length: 255 }).notNull(),
  signedByName: varchar('signed_by_name', { length: 255 }),
  signatureRole: varchar('signature_role', { length: 50 }),
  badgeScan: varchar('badge_scan', { length: 255 }),
  signedAt: timestamp('signed_at', { withTimezone: true }).default(sql`now()`),

  meaning: varchar('meaning', { length: 100 }).notNull(),
  notes: text('notes'),
  signatureHash: text('signature_hash'),
  signatureData: text('signature_data'),
}, (table) => ({
  stepIdIdx: index('traveler_signatures_step_id_idx').on(table.travelerStepId),
  taskIdIdx: index('traveler_signatures_task_id_idx').on(table.travelerTaskId),
}));

// Traveler Events - Audit trail for all actions
export const travelerEvents = pgTable('traveler_events', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerId: varchar('traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'cascade' })
    .notNull(),

  actor: varchar('actor', { length: 255 }).notNull(),
  actorName: varchar('actor_name', { length: 255 }),
  action: varchar('action', { length: 100 }).notNull(),
  details: jsonb('details'),

  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  travelerIdIdx: index('traveler_events_traveler_id_idx').on(table.travelerId),
  actionIdx: index('traveler_events_action_idx').on(table.action),
}));

export const travelerAuthorizedNotes = pgTable('traveler_authorized_notes', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::character varying`),
  travelerId: varchar('traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'cascade' })
    .notNull(),
  department: varchar('department', { length: 255 }).notNull(),
  note: text('note').notNull(),
  linkedPurchaseOrderId: varchar('linked_purchase_order_id', { length: 255 }),
  linkedDocumentUrls: jsonb('linked_document_urls').default([]),
  toleranceChangeAuthorized: boolean('tolerance_change_authorized').default(false),
  signedBy: varchar('signed_by', { length: 255 }).notNull(),
  signedByName: varchar('signed_by_name', { length: 255 }).notNull(),
  signatureRole: varchar('signature_role', { length: 50 }),
  signatureData: text('signature_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  travelerIdIdx: index('traveler_authorized_notes_traveler_id_idx').on(table.travelerId),
  departmentIdx: index('traveler_authorized_notes_department_idx').on(table.department),
}));

// P2 Serialized Item Traceability - Stores scanned/entered traceability data per department
export const p2SerializedItemTraceability = pgTable('p2_serialized_item_traceability', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  department: text('department').notNull(), // Department where traceability was recorded
  inventoryPartId: text('inventory_part_id'), // ID of the inventory part/material this traceability is for (nullable for backward compatibility)
  inventoryPartNumber: text('inventory_part_number'), // Denormalized part number for display
  traceabilityType: text('traceability_type').notNull(), // lot_number, batch_number, expiration, custom
  traceabilityLabel: text('traceability_label').notNull(), // Display label (e.g., "Lot #", "Batch #", or custom name)
  traceabilityValue: text('traceability_value').notNull(), // The scanned/entered value
  recordedBy: text('recorded_by').notNull(), // Username who recorded the data
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_serialized_item_traceability_item_id_idx').on(table.serializedItemId),
  departmentIdx: index('p2_serialized_item_traceability_department_idx').on(table.department),
}));

// P2 Serialized Item Custom Data - Stores custom field values entered by technicians per department
export const p2SerializedItemCustomData = pgTable('p2_serialized_item_custom_data', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  department: text('department').notNull(), // Department where custom data was recorded
  customData: jsonb('custom_data').notNull(), // Object mapping field names to values: { "Temperature": "350°F", "Mold Number": "M-123" }
  recordedBy: text('recorded_by').notNull(), // Username who recorded the data
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_serialized_item_custom_data_item_id_idx').on(table.serializedItemId),
  departmentIdx: index('p2_serialized_item_custom_data_department_idx').on(table.department),
}));

// P2 Layup Schedules - Schedule P2 serialized items for layup with full traceability
export const p2LayupSchedules = pgTable('p2_layup_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(),
  poNumber: text('po_number').notNull(),
  partNumber: text('part_number').notNull(),
  partName: text('part_name').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledBy: text('scheduled_by').notNull(),
  assignedTechnician: text('assigned_technician'),
  status: text('status').notNull().default('SCHEDULED'),
  cuttingPacketId: text('cutting_packet_id'),
  cuttingPacketNumber: text('cutting_packet_number'),
  startedAt: timestamp('started_at'),
  startedBy: text('started_by'),
  completedAt: timestamp('completed_at'),
  completedBy: text('completed_by'),
  cancelledAt: timestamp('cancelled_at'),
  cancelledBy: text('cancelled_by'),
  cancelReason: text('cancel_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  serializedItemIdx: index('p2_layup_schedules_item_id_idx').on(table.serializedItemId),
  scheduledDateIdx: index('p2_layup_schedules_date_idx').on(table.scheduledDate),
  barcodeIdx: index('p2_layup_schedules_barcode_idx').on(table.barcode),
  statusIdx: index('p2_layup_schedules_status_idx').on(table.status),
}));

// P2 Work Tasks - Tracks individual task sessions with start/end times for AS9100 traceability
export const p2WorkTasks = pgTable('p2_work_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(), // Denormalized for quick queries
  poNumber: text('po_number').notNull(), // Denormalized from serialized item
  partNumber: text('part_number').notNull(), // Denormalized for display
  partName: text('part_name').notNull(), // Denormalized for display
  customerId: text('customer_id').notNull(), // Denormalized from serialized item
  customerName: text('customer_name').notNull(), // Denormalized from serialized item
  department: text('department').notNull(), // Department where task was performed
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'restrict' })
    .notNull(),
  employeeCode: text('employee_code').notNull(), // Employee badge code
  employeeName: text('employee_name').notNull(), // Denormalized for display
  certificationId: integer('certification_id')
    .references(() => p2EmployeePartCertifications.id, { onDelete: 'set null' }), // Link to certification used for audit trail
  travelerId: varchar('traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'set null' }),
  travelerStepId: varchar('traveler_step_id', { length: 255 })
    .references(() => travelerSteps.id, { onDelete: 'set null' }),
  productionWorkOrderId: uuid('production_work_order_id')
    .references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'set null' }),
  chargeCodeId: integer('charge_code_id')
    .references(() => chargeCodes.id, { onDelete: 'set null' }),
  operationName: text('operation_name'),
  operationScanValue: text('operation_scan_value'),
  operationScannedAt: timestamp('operation_scanned_at'),
  operationScannedBy: integer('operation_scanned_by').references(() => employees.id, { onDelete: 'set null' }),
  electronicSignoffRequired: boolean('electronic_signoff_required').notNull().default(true),
  electronicSignoffStatus: text('electronic_signoff_status').notNull().default('PENDING'),
  electronicSignoffAt: timestamp('electronic_signoff_at'),
  electronicSignoffBy: integer('electronic_signoff_by').references(() => employees.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('IN_PROGRESS'), // IN_PROGRESS, COMPLETED, PAUSED
  startedAt: timestamp('started_at').notNull().defaultNow(), // Task start timestamp
  completedAt: timestamp('completed_at'), // Task completion timestamp
  durationMinutes: integer('duration_minutes'), // Calculated duration in minutes
  traceabilityData: jsonb('traceability_data'), // Materials/components scanned/entered: [{ inventoryPartId, partNumber, type, label, value }]
  customData: jsonb('custom_data'), // Custom field values entered by technician
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_work_tasks_item_id_idx').on(table.serializedItemId),
  employeeIdIdx: index('p2_work_tasks_employee_id_idx').on(table.employeeId),
  statusIdx: index('p2_work_tasks_status_idx').on(table.status),
  departmentIdx: index('p2_work_tasks_department_idx').on(table.department),
  itemStatusIdx: index('p2_work_tasks_item_status_idx').on(table.serializedItemId, table.status),
  travelerIdx: index('p2_work_tasks_traveler_id_idx').on(table.travelerId),
  travelerStepIdx: index('p2_work_tasks_traveler_step_id_idx').on(table.travelerStepId),
  wadIdx: index('p2_work_tasks_wad_id_idx').on(table.productionWorkOrderId),
  projectIdx: index('p2_work_tasks_project_id_idx').on(table.projectId),
}));

// P2 Oven Cure Logs - Records oven cure cycles for AS9100 traceability
export const p2OvenCureLogs = pgTable('p2_oven_cure_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(),
  partNumber: text('part_number').notNull(),
  department: text('department').notNull(),
  ovenId: text('oven_id'), // Equipment identifier
  cycleNumber: text('cycle_number'), // Oven cycle number
  targetTemperature: real('target_temperature'), // Target temp in °F
  actualTemperature: real('actual_temperature'), // Actual recorded temp
  targetDuration: integer('target_duration'), // Target duration in minutes
  actualDuration: integer('actual_duration'), // Actual duration in minutes
  rampUpTime: integer('ramp_up_time'), // Time to reach target temp (minutes)
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  result: text('result').notNull().default('PENDING'), // PENDING, PASS, FAIL
  failureReason: text('failure_reason'),
  operatorId: integer('operator_id').references(() => employees.id),
  operatorName: text('operator_name'),
  signature: text('signature'), // Base64 encoded signature
  notes: text('notes'),
  metadata: jsonb('metadata'), // Additional cure parameters
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_oven_cure_logs_item_id_idx').on(table.serializedItemId),
  barcodeIdx: index('p2_oven_cure_logs_barcode_idx').on(table.barcode),
}));

// P2 Vacuum Leak Tests - Records vacuum bag leak test results for AS9100 traceability
export const p2VacuumLeakTests = pgTable('p2_vacuum_leak_tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(),
  partNumber: text('part_number').notNull(),
  department: text('department').notNull(),
  testNumber: text('test_number'), // Test sequence number
  initialPressure: real('initial_pressure'), // Initial vacuum pressure (inHg)
  finalPressure: real('final_pressure'), // Final vacuum pressure after hold time
  pressureDrop: real('pressure_drop'), // Calculated pressure drop
  maxAllowableDrop: real('max_allowable_drop'), // Maximum allowable pressure drop
  holdTime: integer('hold_time'), // Hold time in minutes
  testDuration: integer('test_duration'), // Total test duration in minutes
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  result: text('result').notNull().default('PENDING'), // PENDING, PASS, FAIL
  failureReason: text('failure_reason'),
  repairAction: text('repair_action'), // Action taken if failed
  retestRequired: boolean('retest_required').default(false),
  retestOf: uuid('retest_of'), // Reference to original failed test
  operatorId: integer('operator_id').references(() => employees.id),
  operatorName: text('operator_name'),
  signature: text('signature'), // Base64 encoded signature
  notes: text('notes'),
  metadata: jsonb('metadata'), // Additional test parameters
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_vacuum_leak_tests_item_id_idx').on(table.serializedItemId),
  barcodeIdx: index('p2_vacuum_leak_tests_barcode_idx').on(table.barcode),
}));

// P2 Final Inspection Results - Records final inspection and tolerance checks
export const p2FinalInspectionResults = pgTable('p2_final_inspection_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(),
  partNumber: text('part_number').notNull(),
  department: text('department').notNull().default('Final QC'),
  inspectionDate: timestamp('inspection_date').notNull().defaultNow(),
  inspectionType: text('inspection_type').notNull(), // VISUAL, DIMENSIONAL, FUNCTIONAL, FINAL
  overallResult: text('overall_result').notNull().default('PENDING'), // PENDING, PASS, FAIL, CONDITIONAL
  toleranceChecks: jsonb('tolerance_checks'), // Array of { dimension, nominal, tolerance, measured, result }
  visualChecks: jsonb('visual_checks'), // Array of { item, required, actual, result }
  functionalChecks: jsonb('functional_checks'), // Array of { test, criteria, result }
  nonConformanceIds: jsonb('non_conformance_ids'), // Array of NCR IDs if any issues found
  correctiveActions: text('corrective_actions'),
  acceptedAsIs: boolean('accepted_as_is').default(false),
  acceptedAsIsReason: text('accepted_as_is_reason'),
  inspectorId: integer('inspector_id').references(() => employees.id),
  inspectorName: text('inspector_name'),
  signature: text('signature'), // Base64 encoded signature
  qaMgrApproval: text('qa_mgr_approval'), // QA Manager signature if needed
  qaMgrApprovalDate: timestamp('qa_mgr_approval_date'),
  // Tolerance deviation authorization - required when tolerance checks fail
  toleranceDeviationRequired: boolean('tolerance_deviation_required').default(false), // True if any tolerance check failed
  toleranceAuthorizerId: integer('tolerance_authorizer_id').references(() => employees.id),
  toleranceAuthorizerName: text('tolerance_authorizer_name'),
  toleranceAuthorizerSignature: text('tolerance_authorizer_signature'), // Base64 encoded signature
  toleranceAuthorizationDate: timestamp('tolerance_authorization_date'),
  toleranceDeviationReason: text('tolerance_deviation_reason'), // Why tolerance deviation was approved
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  itemIdIdx: index('p2_final_inspection_item_id_idx').on(table.serializedItemId),
  barcodeIdx: index('p2_final_inspection_barcode_idx').on(table.barcode),
}));

// P2 Lot Numbers - Manages lot number generation and assignment
export const p2LotNumbers = pgTable('p2_lot_numbers', {
  id: uuid('id').defaultRandom().primaryKey(),
  lotNumber: text('lot_number').notNull().unique(), // Format: LOT-YYYYMMDD-XXXX
  lotType: text('lot_type').notNull().default('PRODUCTION'), // PRODUCTION, SHIPPING, MATERIAL
  partNumber: text('part_number'),
  partName: text('part_name'),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  poNumber: text('po_number'), // Kept as denormalized text for display/legacy
  poId: integer('po_id').references(() => p2PurchaseOrders.id), // Hard FK — replaces fragile text join
  poItemId: integer('po_item_id').references(() => p2PurchaseOrderItems.id),
  quantity: integer('quantity').default(1),
  serializedItemIds: jsonb('serialized_item_ids'), // Array of serialized item UUIDs in this lot
  barcodes: jsonb('barcodes'), // Array of barcodes in this lot for easy reference
  manufacturingDate: timestamp('manufacturing_date'),
  expirationDate: timestamp('expiration_date'),
  status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, SHIPPED
  closedAt: timestamp('closed_at'),
  closedBy: text('closed_by'),
  shippedAt: timestamp('shipped_at'),
  shippedBy: text('shipped_by'),
  packingSlipId: uuid('packing_slip_id'), // Reference to packing slip if generated
  certificateId: uuid('certificate_id'), // Reference to certificate of conformance
  notes: text('notes'),
  trackingNumber: text('tracking_number'),
  carrier: text('carrier'),
  billOfLadingUrl: text('bill_of_lading_url'),
  lotValidationReportUrl: text('lot_validation_report_url'),
  packingSlipUploadUrl: text('packing_slip_upload_url'),
  certificateUploadUrl: text('certificate_upload_url'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  lotNumberIdx: index('p2_lot_numbers_lot_number_idx').on(table.lotNumber),
  customerIdx: index('p2_lot_numbers_customer_idx').on(table.customerId),
  poNumberIdx: index('p2_lot_numbers_po_number_idx').on(table.poNumber),
}));

// P2 Packing Slips - Stores generated packing slip records
export const p2PackingSlips = pgTable('p2_packing_slips', {
  id: uuid('id').defaultRandom().primaryKey(),
  packingSlipNumber: text('packing_slip_number').notNull().unique(),
  lotNumberId: uuid('lot_number_id').references(() => p2LotNumbers.id),
  lotNumber: text('lot_number'),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  customerAddress: text('customer_address'),
  poNumber: text('po_number'),
  invoiceNumber: text('invoice_number'),
  shipDate: timestamp('ship_date'),
  shipmentNumber: text('shipment_number'),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  lineItems: jsonb('line_items').notNull(), // Array of { partNumber, partName, quantity, serialNumbers }
  totalQuantity: integer('total_quantity').notNull().default(0),
  packedBy: text('packed_by'),
  packedBySignature: text('packed_by_signature'),
  verifiedBy: text('verified_by'),
  verifiedBySignature: text('verified_by_signature'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, FINALIZED, SHIPPED
  notes: text('notes'),
  externalPdfUrl: text('external_pdf_url'),
  // Replacement shipment linkage (Phase 5C)
  // Self-referential FK is intentionally omitted from Drizzle .references() to avoid
  // circular TypeScript inference issues (same pattern as mediaFolders.parentId).
  // The FK constraint is enforced at the database level via migration 0031.
  replacesPackingSlipId: uuid('replaces_packing_slip_id'),
  replacementReason: text('replacement_reason'),
  isNoChargeReplacement: boolean('is_no_charge_replacement').notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  packingSlipNumberIdx: index('p2_packing_slips_number_idx').on(table.packingSlipNumber),
  customerIdx: index('p2_packing_slips_customer_idx').on(table.customerId),
}));

// P2 Certificates of Conformance - Stores generated COC records
export const p2CertificatesOfConformance = pgTable('p2_certificates_of_conformance', {
  id: uuid('id').defaultRandom().primaryKey(),
  certificateNumber: text('certificate_number').notNull().unique(),
  lotNumberId: uuid('lot_number_id').references(() => p2LotNumbers.id),
  lotNumber: text('lot_number'),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  customerAddress: text('customer_address'),
  poNumber: text('po_number'),
  partNumber: text('part_number'),
  partName: text('part_name'),
  quantity: integer('quantity').notNull().default(1),
  serialNumbers: jsonb('serial_numbers'), // Array of serial numbers covered
  manufacturingDate: timestamp('manufacturing_date'),
  shipDate: timestamp('ship_date'),
  certificationText: text('certification_text'), // Main certification statement
  specifications: jsonb('specifications'), // Customer specs/requirements met
  materialCertifications: jsonb('material_certifications'), // Array of { material, certNumber, supplier }
  processRecords: jsonb('process_records'), // Array of { process, recordId, result }
  inspectionSummary: jsonb('inspection_summary'), // Summary of all inspections
  traceabilityData: jsonb('traceability_data'), // All material traceability data
  templateDocumentId: uuid('template_document_id').references(() => controlledDocuments.id),
  templateDocumentName: text('template_document_name'),
  templateDocumentNumber: text('template_document_number'),
  templateVersion: text('template_version'),
  templateVersionDate: date('template_version_date'),
  templateDisplay: text('template_display'),
  qaMgrName: text('qa_mgr_name'),
  qaMgrSignature: text('qa_mgr_signature'),
  qaMgrDate: timestamp('qa_mgr_date'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, APPROVED, ISSUED
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  issuedAt: timestamp('issued_at'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  certificateNumberIdx: index('p2_coc_number_idx').on(table.certificateNumber),
  customerIdx: index('p2_coc_customer_idx').on(table.customerId),
  lotNumberIdx: index('p2_coc_lot_number_idx').on(table.lotNumber),
}));

// P2 Shipping Audit Log - CMMC/DCAA compliant override history for shipped data
export const p2ShippingAuditLog = pgTable('p2_shipping_audit_log', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'lot_number' | 'packing_slip'
  entityId: text('entity_id').notNull(), // UUID of the lot or packing slip
  fieldName: text('field_name').notNull(), // e.g. 'lot_number', 'shipped_at', 'ship_date'
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedBy: text('changed_by').notNull(), // username of actor
  changedAt: timestamp('changed_at').defaultNow().notNull(),
  reason: text('reason').notNull(),
});

export const insertP2ShippingAuditLogSchema = createInsertSchema(p2ShippingAuditLog).omit({
  id: true,
  changedAt: true,
});
export type InsertP2ShippingAuditLog = z.infer<typeof insertP2ShippingAuditLogSchema>;
export type P2ShippingAuditLog = typeof p2ShippingAuditLog.$inferSelect;

// P2 Test for Conformance Reports - Customer-facing conformance test reports
export const p2TestForConformanceReports = pgTable('p2_test_for_conformance_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportNumber: text('report_number').notNull().unique(),
  certificateId: uuid('certificate_id').references(() => p2CertificatesOfConformance.id),
  lotNumberId: uuid('lot_number_id').references(() => p2LotNumbers.id),
  lotNumber: text('lot_number'),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  poNumber: text('po_number'),
  partNumber: text('part_number'),
  partName: text('part_name'),
  quantity: integer('quantity').notNull().default(1),
  serialNumbers: jsonb('serial_numbers'),
  testDate: timestamp('test_date').notNull().defaultNow(),
  testCategories: jsonb('test_categories'), // Array of test categories performed
  testResults: jsonb('test_results'), // Detailed test results by category
  ovenCureResults: jsonb('oven_cure_results'), // Summary of all oven cure logs
  vacuumTestResults: jsonb('vacuum_test_results'), // Summary of all vacuum tests
  dimensionalResults: jsonb('dimensional_results'), // Dimensional inspection results
  visualInspectionResults: jsonb('visual_inspection_results'), // Visual inspection summary
  overallConformance: text('overall_conformance').notNull().default('PENDING'), // PENDING, CONFORMING, NON_CONFORMING
  deviations: jsonb('deviations'), // Any deviations from requirements
  waivers: jsonb('waivers'), // Any waivers granted
  customerRequirements: jsonb('customer_requirements'), // Customer-specific requirements
  testerName: text('tester_name'),
  testerSignature: text('tester_signature'),
  reviewerName: text('reviewer_name'),
  reviewerSignature: text('reviewer_signature'),
  reviewedAt: timestamp('reviewed_at'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, REVIEWED, APPROVED, ISSUED
  issuedAt: timestamp('issued_at'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  reportNumberIdx: index('p2_tfc_report_number_idx').on(table.reportNumber),
  customerIdx: index('p2_tfc_customer_idx').on(table.customerId),
}));

// Production Orders - separate from regular orders for PO tracking
export const productionOrders = pgTable('production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // Customer-based format: ABC00199-0001
  poId: integer('po_id')
    .references(() => purchaseOrders.id, { onDelete: 'cascade' })
    .notNull(),
  poItemId: integer('po_item_id')
    .references(() => purchaseOrderItems.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  poNumber: text('po_number').notNull(),
  itemType: text('item_type').notNull(),
  itemId: text('item_id').notNull(),
  itemName: text('item_name').notNull(),
  specifications: jsonb('specifications'), // Product specifications
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  // Production tracking fields
  productionStatus: text('production_status').notNull().default('PENDING'), // PENDING, IN_PROGRESS, SHIPPED
  currentDepartment: text('current_department').default('Barcode'), // Department progression tracking
  departmentHistory: jsonb('department_history').default('[]'), // History of department movements
  barcodeCompletedAt: timestamp('barcode_completed_at'),
  layupCompletedAt: timestamp('layup_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  finishAcceptedAt: timestamp('finish_accepted_at'),
  finishAcceptedBy: text('finish_accepted_by'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  laidUpAt: timestamp('laid_up_at'),
  shippedAt: timestamp('shipped_at'),
  // External fulfillment tracking (shipped through another system)
  isFulfilled: boolean('is_fulfilled').default(false).notNull(),
  fulfilledDate: timestamp('fulfilled_date'),
  fulfilledBy: text('fulfilled_by'), // Username who marked as fulfilled
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Department Progression Fields
  priorityScore: integer('priority_score'),
  currentPipelineConfig: jsonb('current_pipeline_config'),
  hasP1Priority: boolean('has_p1_priority').default(false),
  materialCanonical: text('material_canonical').notNull().default(''),
  sourceSnapshot: jsonb('source_snapshot'),
  // P2 PO reference for orders that originated from P2 purchase orders
  p2PoItemId: integer('p2_po_item_id'), // Reference to p2_purchase_order_items.id
  // Canonical item code (UPPER+TRIM normalized, indexed for fast lookup)
  itemCode: text('item_code'),
  // Technician assigned when the order moves through Finish QC
  assignedTechnician: text('assigned_technician'),
});

// Enhanced Form Insert Schemas
export const insertEnhancedFormCategorySchema = createInsertSchema(
  enhancedFormCategories
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Category name is required'),
    description: z.string().optional(),
  });

export const insertEnhancedFormSchema = createInsertSchema(enhancedForms)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Form name is required'),
    description: z.string().optional(),
    categoryId: z.number().optional(),
    tableName: z.string().optional(),
    layout: z.any(),
    version: z.number().default(1),
  });

export const insertEnhancedFormVersionSchema = createInsertSchema(
  enhancedFormVersions
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    formId: z.number().min(1, 'Form ID is required'),
    version: z.number().min(1, 'Version is required'),
    layout: z.any(),
  });

export const insertEnhancedFormSubmissionSchema = createInsertSchema(
  enhancedFormSubmissions
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    formId: z.number().min(1, 'Form ID is required'),
    data: z.any(),
  });

// Purchase Order Insert Schemas
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    poNumber: z.string().min(1, 'PO Number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    itemType: z.enum(['single', 'multiple']).default('single'),
    poDate: z.coerce.date(),
    expectedDelivery: z.coerce.date(),
    status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).default('OPEN'),
    notes: z.string().optional().nullable(),
  });

export const insertPurchaseOrderItemSchema = createInsertSchema(
  purchaseOrderItems
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    poId: z.number().min(1, 'PO ID is required'),
    itemType: z.enum(['stock_model', 'custom_model', 'feature_item']),
    itemId: z.string().min(1, 'Item ID is required'),
    itemName: z.string().min(1, 'Item Name is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0).default(0),
    totalPrice: z.number().min(0).default(0),
    specifications: z.any().optional().nullable(),
    notes: z.string().optional().nullable(),
    orderCount: z.number().min(0).default(0),
  });

// P2 Customer Insert Schema
export const insertP2CustomerSchema = createInsertSchema(p2Customers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    contactEmail: z.string().email().optional().nullable(),
    contactPhone: z.string().optional().nullable(),
    billingAddress: z.string().optional().nullable(),
    billingCity: z.string().optional().nullable(),
    billingState: z.string().optional().nullable(),
    billingZip: z.string().optional().nullable(),
    shippingAddress: z.string().optional().nullable(),
    shippingCity: z.string().optional().nullable(),
    shippingState: z.string().optional().nullable(),
    shippingZip: z.string().optional().nullable(),
    shipToAddress: z.string().optional().nullable(),
    paymentTerms: z.string().default('NET_30'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
    notes: z.string().optional().nullable(),
    rfqPrefix: z.string().length(3).optional().nullable(),
    rfqSequences: z.any().optional().nullable(),
  });

// P2 Customer Contacts Insert Schema
export const insertP2CustomerContactSchema = createInsertSchema(p2CustomerContacts)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.number().int(),
    name: z.string().min(1, 'Contact name is required'),
    title: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    isPrimary: z.boolean().default(false),
  });

// P2 Purchase Order Insert Schemas
export const insertP2PurchaseOrderSchema = createInsertSchema(p2PurchaseOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    poNumber: z.string().min(1, 'PO Number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    poDate: z.coerce.date(),
    expectedDelivery: z.coerce.date(),
    status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).default('OPEN'),
    notes: z.string().optional().nullable(),
    sourceQuoteId: z.string().uuid().optional().nullable(),
    contractReviewRole: z.enum(['primary', 'secondary']).default('secondary'),
    projectId: z.string().uuid().optional().nullable(),
  });

export const insertP2PurchaseOrderItemSchema = createInsertSchema(
  p2PurchaseOrderItems
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    poId: z.number().min(1, 'PO ID is required'),
    inventoryItemId: z.number().int().positive().optional().nullable(),
    partNumber: z.string().min(1, 'Part Number is required'),
    partName: z.string().min(1, 'Part Name is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0).default(0),
    totalPrice: z.number().min(0).default(0),
    specifications: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

// RFQ Risk Assessment Insert Schema
export const insertRFQRiskAssessmentSchema = createInsertSchema(rfqRiskAssessments)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    rfqNumber: z.string().min(1, 'RFQ Number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    description: z.string().optional().nullable(),
    formData: z.any(),
    totalOverallPoints: z.number().min(0).default(0),
    adjustedRiskLevel: z.number().min(0).default(0),
    riskDetermination: z.string().optional().nullable(),
    bidDecision: z.string().optional().nullable(),
  });

// P2 Part Certification Schemas
export const insertP2PartCertificationSchema = createInsertSchema(p2PartCertifications)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    partNumber: z.string().min(1, 'Part Number is required'),
    partName: z.string().optional().nullable(),
    departments: z.array(z.string()).min(1, 'At least one department is required'),
    notes: z.string().optional().nullable(),
  });

export const insertP2EmployeePartCertificationSchema = createInsertSchema(
  p2EmployeePartCertifications
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    partCertificationId: z.number().min(1, 'Part Certification ID is required'),
    partNumber: z.string().min(1, 'Part Number is required'),
    employeeId: z.number().min(1, 'Employee ID is required'),
    employeeName: z.string().optional().nullable(),
    department: z.string().min(1, 'Department is required'),
    drawingKnowledge: z.boolean().default(false),
    specSheetUnderstanding: z.boolean().default(false),
    procedureCompletion: z.boolean().default(false),
    certifiedDate: z.coerce.date().optional().nullable(),
    certifiedBy: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

// P2 Serialized Items Schemas
export const insertP2SerializedItemSchema = createInsertSchema(p2SerializedItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    serialNumber: z.string().min(1, 'Serial number is required'),
    barcode: z.string().min(1, 'Barcode is required'),
    poId: z.number().min(1, 'PO ID is required'),
    poItemId: z.number().min(1, 'PO Item ID is required'),
    poNumber: z.string().min(1, 'PO Number is required'),
    partNumber: z.string().min(1, 'Part Number is required'),
    partName: z.string().min(1, 'Part Name is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    sequenceNumber: z.number().min(1, 'Sequence number is required'),
    currentDepartment: z.string().default('Layup'),
    currentStageIndex: z.number().min(0).default(0),
    status: z.enum(['ACTIVE', 'COMPLETED', 'SCRAPPED', 'HOLD']).default('ACTIVE'),
    departmentHistory: z.any().optional(),
    metadata: z.any().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

export const insertP2SerializedItemEventSchema = createInsertSchema(p2SerializedItemEvents)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    serializedItemId: z.number().min(1, 'Serialized Item ID is required'),
    barcode: z.string().min(1, 'Barcode is required'),
    eventType: z.enum(['GENERATED', 'TRANSITION', 'HOLD', 'RELEASE', 'SCRAP', 'NOTE']),
    fromDepartment: z.string().optional().nullable(),
    toDepartment: z.string().optional().nullable(),
    fromStageIndex: z.number().optional().nullable(),
    toStageIndex: z.number().optional().nullable(),
    performedBy: z.string().min(1, 'Performed by is required'),
    notes: z.string().optional().nullable(),
    metadata: z.any().optional().nullable(),
  });

// Production Order Schema
export const insertProductionOrderSchema = createInsertSchema(productionOrders)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    poId: z.number().min(1, 'PO ID is required'),
    poItemId: z.number().min(1, 'PO Item ID is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer Name is required'),
    poNumber: z.string().min(1, 'PO Number is required'),
    itemType: z.enum(['stock_model', 'custom_model', 'feature_item']),
    itemId: z.string().min(1, 'Item ID is required'),
    itemName: z.string().min(1, 'Item Name is required'),
    specifications: z.any().optional().nullable(),
    orderDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    productionStatus: z
      .enum(['PENDING', 'IN_PROGRESS', 'LAID_UP', 'SHIPPED', 'CANCELLED'])
      .default('PENDING'),
    laidUpAt: z.coerce.date().optional().nullable(),
    shippedAt: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
    materialCanonical: z.string().optional().default(''),
    sourceSnapshot: z.any().optional().nullable(),
  });

// Enhanced Form Types
export type InsertEnhancedFormCategory = z.infer<
  typeof insertEnhancedFormCategorySchema
>;
export type EnhancedFormCategory = typeof enhancedFormCategories.$inferSelect;
export type InsertEnhancedForm = z.infer<typeof insertEnhancedFormSchema>;
export type EnhancedForm = typeof enhancedForms.$inferSelect;
export type InsertEnhancedFormVersion = z.infer<
  typeof insertEnhancedFormVersionSchema
>;
export type EnhancedFormVersion = typeof enhancedFormVersions.$inferSelect;
export type InsertEnhancedFormSubmission = z.infer<
  typeof insertEnhancedFormSubmissionSchema
>;
export type EnhancedFormSubmission =
  typeof enhancedFormSubmissions.$inferSelect;

// Purchase Order Types
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<
  typeof insertPurchaseOrderItemSchema
>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

// P2 Purchase Order Types
export type InsertP2Customer = z.infer<typeof insertP2CustomerSchema>;
export type P2Customer = typeof p2Customers.$inferSelect;
export type InsertP2CustomerContact = z.infer<typeof insertP2CustomerContactSchema>;
export type P2CustomerContact = typeof p2CustomerContacts.$inferSelect;
export type InsertP2PurchaseOrder = z.infer<typeof insertP2PurchaseOrderSchema>;
export type P2PurchaseOrder = typeof p2PurchaseOrders.$inferSelect;
export type InsertP2PurchaseOrderItem = z.infer<
  typeof insertP2PurchaseOrderItemSchema
>;
export type P2PurchaseOrderItem = typeof p2PurchaseOrderItems.$inferSelect;

// RFQ Risk Assessment Types
export type InsertRFQRiskAssessment = z.infer<typeof insertRFQRiskAssessmentSchema>;
export type RFQRiskAssessment = typeof rfqRiskAssessments.$inferSelect;

// P2 Part Certification Types
export type InsertP2PartCertification = z.infer<typeof insertP2PartCertificationSchema>;
export type P2PartCertification = typeof p2PartCertifications.$inferSelect;
export type InsertP2EmployeePartCertification = z.infer<
  typeof insertP2EmployeePartCertificationSchema
>;
export type P2EmployeePartCertification = typeof p2EmployeePartCertifications.$inferSelect;

// P2 Serialized Items Types
export type InsertP2SerializedItem = z.infer<typeof insertP2SerializedItemSchema>;
export type P2SerializedItem = typeof p2SerializedItems.$inferSelect;
export type InsertP2SerializedItemEvent = z.infer<typeof insertP2SerializedItemEventSchema>;
export type P2SerializedItemEvent = typeof p2SerializedItemEvents.$inferSelect;

// Part Routing Schemas
export const insertPartRoutingSchema = createInsertSchema(partRoutings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    inventoryItemId: z.string().min(1, 'Inventory item ID is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    partName: z.string().min(1, 'Part name is required'),
    departmentSequence: z.array(z.string()).min(1, 'At least one department required'),
    traceabilityConfig: z.record(z.array(z.string())),
    createdBy: z.string().min(1, 'Created by is required'),
  });

export const updatePartRoutingSchema = insertPartRoutingSchema
  .partial()
  .strict()
  .refine(
    (data) => {
      // If departmentSequence is provided, it must not be empty
      if ('departmentSequence' in data && data.departmentSequence !== undefined) {
        return Array.isArray(data.departmentSequence) && data.departmentSequence.length > 0;
      }
      return true;
    },
    { message: 'Department sequence must contain at least one department when provided' }
  )
  .refine(
    (data) => {
      // If traceabilityConfig is provided, it must not be empty
      if ('traceabilityConfig' in data && data.traceabilityConfig !== undefined) {
        return typeof data.traceabilityConfig === 'object' && Object.keys(data.traceabilityConfig).length > 0;
      }
      return true;
    },
    { message: 'Traceability config must contain at least one department when provided' }
  );

export const insertP2SerializedItemTraceabilitySchema = createInsertSchema(p2SerializedItemTraceability)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    department: z.string().min(1, 'Department is required'),
    traceabilityType: z.string().min(1, 'Traceability type is required'),
    traceabilityLabel: z.string().min(1, 'Traceability label is required'),
    traceabilityValue: z.string().min(1, 'Traceability value is required'),
    recordedBy: z.string().min(1, 'Recorded by is required'),
  });

export const insertP2SerializedItemCustomDataSchema = createInsertSchema(p2SerializedItemCustomData)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    department: z.string().min(1, 'Department is required'),
    customData: z.record(z.string()),
    recordedBy: z.string().min(1, 'Recorded by is required'),
  });

export const insertP2LayupScheduleSchema = createInsertSchema(p2LayupSchedules)

export const insertP2WorkTaskSchema = createInsertSchema(p2WorkTasks)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    barcode: z.string().min(1, 'Barcode is required'),
    poNumber: z.string().min(1, 'PO number is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    partName: z.string().min(1, 'Part name is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    department: z.string().min(1, 'Department is required'),
    employeeId: z.number().min(1, 'Employee ID is required'),
    employeeCode: z.string().min(1, 'Employee code is required'),
    employeeName: z.string().min(1, 'Employee name is required'),
    certificationId: z.number().optional().nullable(),
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'PAUSED']).default('IN_PROGRESS'),
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().optional().nullable(),
    durationMinutes: z.number().optional().nullable(),
    traceabilityData: z.any().optional().nullable(),
    customData: z.any().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

// Part Routing Types
export type InsertPartRouting = z.infer<typeof insertPartRoutingSchema>;
export type UpdatePartRouting = z.infer<typeof updatePartRoutingSchema>;
export type PartRouting = typeof partRoutings.$inferSelect;

// Routing Operations Insert Schema and Types
export const insertRoutingOperationSchema = createInsertSchema(routingOperations).omit({
  id: true,
  createdAt: true,
});
export type InsertRoutingOperation = z.infer<typeof insertRoutingOperationSchema>;
export type RoutingOperation = typeof routingOperations.$inferSelect;

// Routing CNC Operations Insert Schema and Types
export const insertRoutingCncOperationSchema = createInsertSchema(routingCncOperations).omit({
  id: true,
});
export type InsertRoutingCncOperation = z.infer<typeof insertRoutingCncOperationSchema>;
export type RoutingCncOperation = typeof routingCncOperations.$inferSelect;

// Routing Templates Insert/Update Schemas and Types
export const insertRoutingTemplateSchema = createInsertSchema(routingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateRoutingTemplateSchema = insertRoutingTemplateSchema.partial();
export type InsertRoutingTemplate = z.infer<typeof insertRoutingTemplateSchema>;
export type UpdateRoutingTemplate = z.infer<typeof updateRoutingTemplateSchema>;
export type RoutingTemplate = typeof routingTemplates.$inferSelect;

// Routing Template Operations Insert/Update Schemas and Types
export const insertRoutingTemplateOperationSchema = createInsertSchema(routingTemplateOperations).omit({
  id: true,
  createdAt: true,
});
export const updateRoutingTemplateOperationSchema = insertRoutingTemplateOperationSchema.partial();
export type InsertRoutingTemplateOperation = z.infer<typeof insertRoutingTemplateOperationSchema>;
export type UpdateRoutingTemplateOperation = z.infer<typeof updateRoutingTemplateOperationSchema>;
export type RoutingTemplateOperation = typeof routingTemplateOperations.$inferSelect;

// Routing Dependencies Insert/Update Schemas and Types
export const insertRoutingDependencySchema = createInsertSchema(routingDependencies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateRoutingDependencySchema = insertRoutingDependencySchema.partial();
export type InsertRoutingDependency = z.infer<typeof insertRoutingDependencySchema>;
export type UpdateRoutingDependency = z.infer<typeof updateRoutingDependencySchema>;
export type RoutingDependency = typeof routingDependencies.$inferSelect;

// Anodize Jobs Insert/Update Schemas and Types
export const insertAnodizeJobSchema = createInsertSchema(anodizeJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateAnodizeJobSchema = insertAnodizeJobSchema.partial();
export type InsertAnodizeJob = z.infer<typeof insertAnodizeJobSchema>;
export type UpdateAnodizeJob = z.infer<typeof updateAnodizeJobSchema>;
export type AnodizeJob = typeof anodizeJobs.$inferSelect;

// Anodize Job Documents Insert/Update Schemas and Types
export const insertAnodizeJobDocumentSchema = createInsertSchema(anodizeJobDocuments).omit({
  id: true,
  uploadedAt: true,
});
export const updateAnodizeJobDocumentSchema = insertAnodizeJobDocumentSchema.partial();
export type InsertAnodizeJobDocument = z.infer<typeof insertAnodizeJobDocumentSchema>;
export type UpdateAnodizeJobDocument = z.infer<typeof updateAnodizeJobDocumentSchema>;
export type AnodizeJobDocument = typeof anodizeJobDocuments.$inferSelect;

// Anodize Job Receiving Inspections Insert/Update Schemas and Types
export const insertAnodizeJobReceivingInspectionSchema = createInsertSchema(anodizeJobReceivingInspections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateAnodizeJobReceivingInspectionSchema = insertAnodizeJobReceivingInspectionSchema.partial();
export type InsertAnodizeJobReceivingInspection = z.infer<typeof insertAnodizeJobReceivingInspectionSchema>;
export type UpdateAnodizeJobReceivingInspection = z.infer<typeof updateAnodizeJobReceivingInspectionSchema>;
export type AnodizeJobReceivingInspection = typeof anodizeJobReceivingInspections.$inferSelect;

// ============================================================================
// TRAVELER COMPONENT ASSOCIATIONS - Parent-child scan/association records
// ============================================================================
export const travelerComponentAssociations = pgTable('traveler_component_associations', {
  id: serial('id').primaryKey(),

  parentTravelerId: varchar('parent_traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'cascade' })
    .notNull(),

  parentTravelerStepId: integer('parent_traveler_step_id'),

  childTravelerId: varchar('child_traveler_id', { length: 255 }),
  childInventoryItemId: integer('child_inventory_item_id'),
  childPartNumber: text('child_part_number'),
  childSerialNumber: text('child_serial_number'),
  childLotNumber: text('child_lot_number'),
  childInternalControlNumber: text('child_internal_control_number'),

  associationType: text('association_type', {
    enum: ['TRAVELER', 'INVENTORY_ITEM', 'SERIALIZED_COMPONENT', 'LOT_COMPONENT'],
  }).notNull().default('TRAVELER'),

  quantity: integer('quantity').notNull().default(1),
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
  scannedBy: text('scanned_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  parentTravelerIdIdx: index('tca_parent_traveler_id_idx').on(table.parentTravelerId),
  parentStepIdIdx: index('tca_parent_step_id_idx').on(table.parentTravelerStepId),
  childTravelerIdIdx: index('tca_child_traveler_id_idx').on(table.childTravelerId),
  childInventoryItemIdIdx: index('tca_child_inventory_item_id_idx').on(table.childInventoryItemId),
  childPartNumberIdx: index('tca_child_part_number_idx').on(table.childPartNumber),
  childSerialNumberIdx: index('tca_child_serial_number_idx').on(table.childSerialNumber),
  childIcnIdx: index('tca_child_icn_idx').on(table.childInternalControlNumber),
}));

export const insertTravelerComponentAssociationSchema = createInsertSchema(travelerComponentAssociations).omit({
  id: true,
  createdAt: true,
});
export type InsertTravelerComponentAssociation = z.infer<typeof insertTravelerComponentAssociationSchema>;
export type TravelerComponentAssociation = typeof travelerComponentAssociations.$inferSelect;

// ============================================================================
// MATERIAL TRACEABILITY SYSTEM - Insert Schemas and Types
// ============================================================================

// Material Lot Insert Schema
export const insertMaterialLotSchema = createInsertSchema(materialLots)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    inventoryItemId: z.number().int().positive('Inventory item ID is required'),
    materialPartNumber: z.string().min(1, 'Material part number is required'),
    materialName: z.string().min(1, 'Material name is required'),
    internalControlNumber: z.string().min(1, 'ICN is required'),
    supplier: z.string().min(1, 'Supplier is required'),
    supplierLotNumber: z.string().optional().nullable(),
    supplierPartNumber: z.string().optional().nullable(),
    purchaseOrderNumber: z.string().optional().nullable(),
    receivingRecordNumber: z.string().optional().nullable(),
    receivedQty: z.string().min(1, 'Received quantity is required'),
    remainingQty: z.string().min(1, 'Remaining quantity is required'),
    unitOfMeasure: z.string().default('EA'),
    expirationDate: z.coerce.date().optional().nullable(),
    cureDate: z.coerce.date().optional().nullable(),
    manufactureDate: z.coerce.date().optional().nullable(),
    storageLocation: z.string().optional().nullable(),
    storageRequirements: z.string().optional().nullable(),
    status: z.enum(['RECEIVED', 'QUARANTINE', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ISSUED', 'CONSUMED', 'SCRAPPED', 'HOLD', 'LOCKED']).default('RECEIVED'),
    totalOutTimeMinutes: z.number().int().default(0),
    maxOutTimeMinutes: z.number().int().optional().nullable(),
    currentlyOutOfStorage: z.boolean().default(false),
    lastOutAt: z.coerce.date().optional().nullable(),
    parentLotId: z.string().uuid().optional().nullable(),
    cocAttachment: z.string().optional().nullable(),
    inspectionAttachment: z.string().optional().nullable(),
    receivedBy: z.string().min(1, 'Received by is required'),
    receivedAt: z.coerce.date().optional(),
    inspectedBy: z.string().optional().nullable(),
    inspectedAt: z.coerce.date().optional().nullable(),
    acceptedBy: z.string().optional().nullable(),
    acceptedAt: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

export const updateMaterialLotSchema = insertMaterialLotSchema.partial();

// Material Lot Transaction Insert Schema
export const insertMaterialLotTransactionSchema = createInsertSchema(materialLotTransactions)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    materialLotId: z.string().uuid('Invalid material lot ID'),
    internalControlNumber: z.string().min(1, 'ICN is required'),
    transactionType: z.enum(['RECEIVE', 'MOVE', 'ISSUE', 'ADJUST', 'SCRAP', 'RETURN', 'SPLIT', 'OUT_START', 'OUT_END', 'ACCEPT', 'REJECT', 'QUARANTINE', 'EXPIRE', 'HOLD', 'PAUSE', 'RESUME', 'LOCK']),
    qtyBefore: z.string().optional().nullable(),
    qtyChange: z.string().optional().nullable(),
    qtyAfter: z.string().optional().nullable(),
    fromLocation: z.string().optional().nullable(),
    toLocation: z.string().optional().nullable(),
    referenceType: z.string().optional().nullable(),
    referenceId: z.string().optional().nullable(),
    receiptId: z.number().int().optional().nullable(),
    performedBy: z.string().min(1, 'Performed by is required'),
    performedAt: z.coerce.date().optional(),
    reason: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    wasOverride: z.boolean().optional().default(false),
    overrideApprovedBy: z.string().optional().nullable(),
    overrideReason: z.string().optional().nullable(),
  });

// Traveler Material Consumption Insert Schema
export const insertTravelerMaterialConsumptionSchema = createInsertSchema(travelerMaterialConsumption)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    travelerId: z.string().uuid('Invalid traveler ID'),
    travelerStepId: z.string().uuid('Invalid traveler step ID'),
    travelerTaskId: z.string().uuid().optional().nullable(),
    materialLotId: z.string().uuid('Invalid material lot ID'),
    internalControlNumber: z.string().min(1, 'ICN is required'),
    materialPartNumber: z.string().min(1, 'Material part number is required'),
    materialName: z.string().min(1, 'Material name is required'),
    qtyUsed: z.string().min(1, 'Quantity used is required'),
    unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
    validationStatus: z.enum(['VALID', 'OVERRIDE', 'WARNING']),
    validationDetails: z.any().optional().nullable(),
    scannedBy: z.string().min(1, 'Scanned by is required'),
    scannedAt: z.coerce.date().optional(),
    badgeScan: z.string().optional().nullable(),
    wasOverride: z.boolean().optional().default(false),
    overrideApprovedBy: z.string().optional().nullable(),
    overrideReason: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    receivedUnitId: z.number().int().positive().optional().nullable(),
  });

// Material Traceability Types
export type InsertMaterialLot = z.infer<typeof insertMaterialLotSchema>;
export type UpdateMaterialLot = z.infer<typeof updateMaterialLotSchema>;
export type MaterialLot = typeof materialLots.$inferSelect;

export type InsertMaterialLotTransaction = z.infer<typeof insertMaterialLotTransactionSchema>;
export type MaterialLotTransaction = typeof materialLotTransactions.$inferSelect;

export type InsertTravelerMaterialConsumption = z.infer<typeof insertTravelerMaterialConsumptionSchema>;
export type TravelerMaterialConsumption = typeof travelerMaterialConsumption.$inferSelect;

// Material Lot Reservation Insert Schema
export const insertMaterialLotReservationSchema = createInsertSchema(materialLotReservations)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    materialLotId: z.string().uuid('Invalid material lot ID'),
    receivedUnitId: z.number().int().positive().optional().nullable(),
    travelerId: z.string().uuid().optional().nullable(),
    workOrderId: z.number().int().positive().optional().nullable(),
    quantityReserved: z.string().min(1, 'Quantity required'),
    unitOfMeasure: z.string().min(1, 'Unit of measure required'),
    status: z.enum(['active', 'fulfilled', 'cancelled']).optional().default('active'),
    notes: z.string().optional().nullable(),
    createdBy: z.string().min(1, 'Created by required'),
  });

export type InsertMaterialLotReservation = z.infer<typeof insertMaterialLotReservationSchema>;
export type MaterialLotReservation = typeof materialLotReservations.$inferSelect;

// ============================================================================
// TRAVELER SYSTEM - Insert Schemas and Types
// ============================================================================

// Traveler Insert Schema
export const insertTravelerSchema = createInsertSchema(travelers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    travelerNumber: z.string().min(1, 'Traveler number is required'),
    travelerRevision: z.number().int().positive().default(1),
    inventoryItemId: z.string().min(1, 'Inventory item ID is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    partName: z.string().min(1, 'Part name is required'),
    salesOrderId: z.string().optional().nullable(),
    workOrderId: z.string().optional().nullable(),
    productionWorkOrderId: z.string().uuid().optional().nullable(),
    lotNumber: z.string().optional().nullable(),
    serialNumber: z.string().optional().nullable(),
    internalControlNumber: z.string().optional().nullable(),
    quantity: z.number().int().positive().default(1),
    status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELED']).default('DRAFT'),
    partRoutingId: z.string().uuid().optional().nullable(),
    partRoutingRevision: z.number().int().optional().nullable(),
    createdBy: z.string().min(1, 'Created by is required'),
  });

export const updateTravelerSchema = insertTravelerSchema.partial();

// Traveler Step Insert Schema
export const insertTravelerStepSchema = createInsertSchema(travelerSteps)
  .omit({
    id: true,
  })
  .extend({
    travelerId: z.string().uuid('Invalid traveler ID'),
    departmentName: z.string().min(1, 'Department name is required'),
    stepNumber: z.number().int().positive(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).default('NOT_STARTED'),
    assignedTechnicianId: z.number().int().optional().nullable(),
    startedAt: z.coerce.date().optional().nullable(),
    startedBy: z.string().optional().nullable(),
    completedAt: z.coerce.date().optional().nullable(),
    completedBy: z.string().optional().nullable(),
  });

export const updateTravelerStepSchema = insertTravelerStepSchema.partial();

// Traveler Task Insert Schema
export const insertTravelerTaskSchema = createInsertSchema(travelerTasks)
  .omit({
    id: true,
  })
  .extend({
    travelerStepId: z.string().uuid('Invalid traveler step ID'),
    taskType: z.enum(['CHECK', 'PROCESS', 'QC', 'TRACEABILITY', 'DOCUMENT', 'SIGNATURE',
      'TRACE', 'CUSTOM_FIELD', 'QUESTIONS', 'SPECIAL_PROCESS', 'NOTES', 'START_GATE', 'END_GATE', 'GATE_CHECK']),
    taskPhase: z.enum(['START', 'WORK', 'FINISH']).default('WORK'),
    title: z.string().min(1, 'Task title is required'),
    instructions: z.string().optional().nullable(),
    required: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    timePolicy: z.enum(['AUTO_ON_START', 'AUTO_ON_COMPLETE', 'MANUAL_ENTRY']).default('AUTO_ON_COMPLETE'),
    requiresSignature: z.boolean().default(false),
    signatureRole: z.enum(['OPERATOR', 'LEAD', 'QC', 'ENGINEERING', 'CUSTOM']).optional().nullable(),
    requiresCertification: z.boolean().default(false),
    instructionPack: z.object({
      workInstructionRefs: z.array(z.object({
        documentId: z.string(),
        title: z.string().optional(),
        pageRange: z.string().optional(),
        anchor: z.string().optional(),
      })).optional().default([]),
      aiSnippets: z.array(z.object({
        title: z.string(),
        bullets: z.array(z.string()),
        sourceDocumentId: z.string().optional(),
        confidence: z.number().optional(),
      })).optional().default([]),
      specialNotes: z.string().optional().default(''),
      media: z.array(z.object({
        type: z.enum(['image', 'pdf']),
        documentId: z.string(),
        caption: z.string().optional(),
      })).optional().default([]),
    }).optional().nullable(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED']).default('NOT_STARTED'),
    startedAt: z.coerce.date().optional().nullable(),
    completedAt: z.coerce.date().optional().nullable(),
    completedBy: z.string().optional().nullable(),
  });

export const updateTravelerTaskSchema = insertTravelerTaskSchema.partial();

// Traveler Task Field Insert Schema
export const insertTravelerTaskFieldSchema = createInsertSchema(travelerTaskFields)
  .omit({
    id: true,
  })
  .extend({
    travelerTaskId: z.string().uuid('Invalid traveler task ID'),
    fieldKey: z.string().min(1, 'Field key is required'),
    fieldLabel: z.string().min(1, 'Field label is required'),
    fieldType: z.enum(['text', 'number', 'date', 'yes_no', 'dropdown', 'barcode', 'attachment', 'json']),
    required: z.boolean().default(false),
    value: z.any().optional().nullable(),
    validation: z.any().optional().nullable(),
    recordedBy: z.string().optional().nullable(),
    recordedAt: z.coerce.date().optional().nullable(),
  });

export const updateTravelerTaskFieldSchema = insertTravelerTaskFieldSchema.partial();

// Traveler Signature Insert Schema
export const insertTravelerSignatureSchema = createInsertSchema(travelerSignatures)
  .omit({
    id: true,
  })
  .extend({
    travelerStepId: z.string().uuid('Invalid traveler step ID'),
    travelerTaskId: z.string().optional().nullable(),
    signedBy: z.string().min(1, 'Signed by is required'),
    signedByName: z.string().optional().nullable(),
    signatureRole: z.string().optional().nullable(),
    badgeScan: z.string().optional().nullable(),
    signedAt: z.coerce.date().optional(),
    meaning: z.enum(['PERFORMED', 'INSPECTED', 'VERIFIED', 'RELEASED', 'COMPLETED']),
    signatureHash: z.string().optional().nullable(),
    signatureData: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

// Traveler Event Insert Schema
export const insertTravelerEventSchema = createInsertSchema(travelerEvents)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    travelerId: z.string().uuid('Invalid traveler ID'),
    actor: z.string().min(1, 'Actor is required'),
    actorName: z.string().optional().nullable(),
    action: z.string().min(1, 'Action is required'),
    details: z.any().optional().nullable(),
  });

// Traveler Types
export type InsertTraveler = z.infer<typeof insertTravelerSchema>;
export type UpdateTraveler = z.infer<typeof updateTravelerSchema>;
export type Traveler = typeof travelers.$inferSelect;

export type InsertTravelerStep = z.infer<typeof insertTravelerStepSchema>;
export type UpdateTravelerStep = z.infer<typeof updateTravelerStepSchema>;
export type TravelerStep = typeof travelerSteps.$inferSelect;

export type InsertTravelerTask = z.infer<typeof insertTravelerTaskSchema>;
export type UpdateTravelerTask = z.infer<typeof updateTravelerTaskSchema>;
export type TravelerTask = typeof travelerTasks.$inferSelect;

export type InsertTravelerTaskField = z.infer<typeof insertTravelerTaskFieldSchema>;
export type UpdateTravelerTaskField = z.infer<typeof updateTravelerTaskFieldSchema>;
export type TravelerTaskField = typeof travelerTaskFields.$inferSelect;

export type InsertTravelerSignature = z.infer<typeof insertTravelerSignatureSchema>;
export type TravelerSignature = typeof travelerSignatures.$inferSelect;

export type InsertTravelerEvent = z.infer<typeof insertTravelerEventSchema>;
export type TravelerEvent = typeof travelerEvents.$inferSelect;

export const insertTravelerAuthorizedNoteSchema = createInsertSchema(travelerAuthorizedNotes)
  .omit({ id: true, createdAt: true })
  .extend({
    travelerId: z.string().min(1, 'Traveler ID is required'),
    department: z.string().min(1, 'Department is required'),
    note: z.string().min(1, 'Note is required'),
    signedBy: z.string().min(1, 'Signer ID is required'),
    signedByName: z.string().min(1, 'Signer name is required'),
    linkedPurchaseOrderId: z.string().optional().nullable(),
    linkedDocumentUrls: z.array(z.object({
      url: z.string().min(1),
      label: z.string().min(1),
    })).optional().default([]),
    toleranceChangeAuthorized: z.boolean().optional().default(false),
    signatureRole: z.string().optional().nullable(),
    signatureData: z.string().optional().nullable(),
  });

export type InsertTravelerAuthorizedNote = z.infer<typeof insertTravelerAuthorizedNoteSchema>;
export type TravelerAuthorizedNote = typeof travelerAuthorizedNotes.$inferSelect;

export type InsertP2SerializedItemTraceability = z.infer<typeof insertP2SerializedItemTraceabilitySchema>;
export type P2SerializedItemTraceability = typeof p2SerializedItemTraceability.$inferSelect;
export type InsertP2SerializedItemCustomData = z.infer<typeof insertP2SerializedItemCustomDataSchema>;
export type P2SerializedItemCustomData = typeof p2SerializedItemCustomData.$inferSelect;
export type InsertP2LayupSchedule = z.infer<typeof insertP2LayupScheduleSchema>;
export type P2LayupSchedule = typeof p2LayupSchedules.$inferSelect;
export type InsertP2WorkTask = z.infer<typeof insertP2WorkTaskSchema>;
export type P2WorkTask = typeof p2WorkTasks.$inferSelect;

// P2 Oven Cure Log Insert Schemas and Types
export const insertP2OvenCureLogSchema = createInsertSchema(p2OvenCureLogs)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    barcode: z.string().min(1, 'Barcode is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    department: z.string().min(1, 'Department is required'),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional().nullable(),
    result: z.enum(['PENDING', 'PASS', 'FAIL']).default('PENDING'),
  });
export type InsertP2OvenCureLog = z.infer<typeof insertP2OvenCureLogSchema>;
export type P2OvenCureLog = typeof p2OvenCureLogs.$inferSelect;

// P2 Vacuum Leak Test Insert Schemas and Types
export const insertP2VacuumLeakTestSchema = createInsertSchema(p2VacuumLeakTests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    barcode: z.string().min(1, 'Barcode is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    department: z.string().min(1, 'Department is required'),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional().nullable(),
    result: z.enum(['PENDING', 'PASS', 'FAIL']).default('PENDING'),
  });
export type InsertP2VacuumLeakTest = z.infer<typeof insertP2VacuumLeakTestSchema>;
export type P2VacuumLeakTest = typeof p2VacuumLeakTests.$inferSelect;

// P2 Final Inspection Result Insert Schemas and Types
export const insertP2FinalInspectionResultSchema = createInsertSchema(p2FinalInspectionResults)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    barcode: z.string().min(1, 'Barcode is required'),
    partNumber: z.string().min(1, 'Part number is required'),
    inspectionType: z.enum(['VISUAL', 'DIMENSIONAL', 'FUNCTIONAL', 'FINAL']),
    overallResult: z.enum(['PENDING', 'PASS', 'FAIL', 'CONDITIONAL']).default('PENDING'),
  });
export type InsertP2FinalInspectionResult = z.infer<typeof insertP2FinalInspectionResultSchema>;
export type P2FinalInspectionResult = typeof p2FinalInspectionResults.$inferSelect;

// P2 Lot Number Insert Schemas and Types
export const insertP2LotNumberSchema = createInsertSchema(p2LotNumbers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    lotNumber: z.string().min(1, 'Lot number is required'),
    lotType: z.enum(['PRODUCTION', 'SHIPPING', 'MATERIAL']).default('PRODUCTION'),
    status: z.enum(['OPEN', 'CLOSED', 'SHIPPED']).default('OPEN'),
    createdBy: z.string().min(1, 'Created by is required'),
  });
export type InsertP2LotNumber = z.infer<typeof insertP2LotNumberSchema>;
export type P2LotNumber = typeof p2LotNumbers.$inferSelect;

// P2 Packing Slip Insert Schemas and Types
export const insertP2PackingSlipSchema = createInsertSchema(p2PackingSlips)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    packingSlipNumber: z.string().min(1, 'Packing slip number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    lineItems: z.array(z.object({
      partNumber: z.string(),
      partName: z.string(),
      quantity: z.number(),
      serialNumbers: z.array(z.string()).optional(),
    })),
    status: z.enum(['DRAFT', 'FINALIZED', 'SHIPPED']).default('DRAFT'),
    createdBy: z.string().min(1, 'Created by is required'),
  });
export type InsertP2PackingSlip = z.infer<typeof insertP2PackingSlipSchema>;
export type P2PackingSlip = typeof p2PackingSlips.$inferSelect;

// P2 Certificate of Conformance Insert Schemas and Types
export const insertP2CertificateOfConformanceSchema = createInsertSchema(p2CertificatesOfConformance)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    certificateNumber: z.string().min(1, 'Certificate number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    status: z.enum(['DRAFT', 'APPROVED', 'ISSUED']).default('DRAFT'),
    createdBy: z.string().min(1, 'Created by is required'),
  });
export type InsertP2CertificateOfConformance = z.infer<typeof insertP2CertificateOfConformanceSchema>;
export type P2CertificateOfConformance = typeof p2CertificatesOfConformance.$inferSelect;

// P2 Test for Conformance Report Insert Schemas and Types
export const insertP2TestForConformanceReportSchema = createInsertSchema(p2TestForConformanceReports)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    reportNumber: z.string().min(1, 'Report number is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    overallConformance: z.enum(['PENDING', 'CONFORMING', 'NON_CONFORMING']).default('PENDING'),
    status: z.enum(['DRAFT', 'REVIEWED', 'APPROVED', 'ISSUED']).default('DRAFT'),
    createdBy: z.string().min(1, 'Created by is required'),
  });
export type InsertP2TestForConformanceReport = z.infer<typeof insertP2TestForConformanceReportSchema>;
export type P2TestForConformanceReport = typeof p2TestForConformanceReports.$inferSelect;

// Production Order Types
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionOrder = typeof productionOrders.$inferSelect;

// P1 Purchase Order Queue Types (from po_products table)
export interface P1POQueueItem {
  id: number;
  poNumber: string;
  productName: string;
  stockModel: string | null;
  specifications: Record<string, any> | null;
  actionLength: string | null;
  material: string | null;
  handedness: string | null;
  actionInlet: string | null;
  bottomMetal: string | null;
  barrelInlet: string | null;
  qds: string | null;
  swivelStuds: string | null;
  paintOptions: string | null;
  texture: string | null;
  flatTop: boolean | null;
  orderedQuantity: number;
  availableQuantity: number;
  departmentStatuses: Record<string, number>;
  quantity: number;
  status: string | null;
  notes: string | null;
  dueDate: string | null;
  linkedOrderId: string | null;
}

export interface P1POQueueCustomer {
  customerId: string;
  customerName: string;
  purchaseOrders: {
    poNumber: string;
    poDate: string | null;
    expectedDelivery: string | null;
    totalItems: number;
    items: P1POQueueItem[];
  }[];
}

export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'CONFIRMED',
  'FINALIZED',
  'CANCELLED',
  'RESERVED',
  'FULFILLED',
]);

// Missing production enums
export const frequencyTypeEnum = pgEnum('frequency_type', [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'ONGOING',
]);

export const taskTypeEnum = pgEnum('task_type', [
  'RECURRING',
  'DYNAMIC',
  'MANUAL',
]);

export const surveyQuestionTypeEnum = pgEnum('survey_question_type', [
  'multiple_choice',
  'rating_scale',
  'text',
  'yes_no',
  'dropdown',
  'matrix',
  'nps',
]);

// Survey Engine Enums - Generic survey system for reuse across applications
export const surveyRespondentTypeEnum = pgEnum('survey_respondent_type', [
  'customer',
  'employee',
  'vendor',
  'anonymous',
  'other',
]);

export const surveyContextTypeEnum = pgEnum('survey_context_type', [
  'order',
  'project',
  'service',
  'event',
  'general',
  'other',
]);

// BOM (Bill of Materials) Management Tables for P2
export const bomDefinitions = pgTable('bom_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku'),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id),
  modelName: text('model_name').notNull(),
  revision: text('revision').notNull().default('A'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const bomItems = pgTable('bom_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  bomId: uuid('bom_id')
    .references(() => bomDefinitions.id)
    .notNull(),
  partName: text('part_name').notNull(),
  quantity: real('quantity').notNull().default(1),
  firstDept: text('first_dept').notNull().default('Layup'),
  itemType: text('item_type').notNull().default('manufactured'), // 'manufactured', 'material', 'sub_assembly', or 'labor'
  // Multi-Level Hierarchy Support
  referenceBomId: uuid('reference_bom_id').references(
    () => bomDefinitions.id
  ), // Points to another BOM if this item is a sub-assembly
  assemblyLevel: integer('assembly_level').default(0), // 0=top level, 1=sub-assembly, 2=component, etc.
  // Component Library Support
  quantityMultiplier: integer('quantity_multiplier').default(1), // Multiplies quantities when used as sub-assembly
  notes: text('notes'), // Manufacturing notes or special instructions
  // Optional Components & Labor Tracking
  isOptional: boolean('is_optional').default(false), // For optional components/labor
  laborHours: real('labor_hours'), // For labor items - estimated hours
  hourlyRate: real('hourly_rate'), // For labor items - standard hourly rate
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas for BOM
export const insertBomDefinitionSchema = createInsertSchema(bomDefinitions)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    sku: z.string().optional(),
    modelName: z.string().min(1, 'Model name is required'),
    revision: z.string().min(1, 'Revision is required').default('A'),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
  });

export const insertBomItemSchema = createInsertSchema(bomItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    bomId: z.string().uuid('BOM ID must be a valid UUID'),
    partName: z.string().min(1, 'Part name is required'),
    quantity: z.number().min(0.0001, 'Quantity must be greater than 0').default(1),
    firstDept: z
      .enum([
        'Layup',
        'Assembly/Disassembly',
        'Finish',
        'Paint',
        'QC',
        'Shipping',
      ])
      .default('Layup'),
    itemType: z
      .enum(['manufactured', 'material', 'sub_assembly', 'labor'])
      .default('manufactured'),
    referenceBomId: z.number().optional(), // Optional reference to another BOM
    assemblyLevel: z.number().default(0),
    quantityMultiplier: z.number().min(1).default(1),
    notes: z.string().optional(),
    isOptional: z.boolean().default(false),
    laborHours: z.number().optional().nullable(),
    hourlyRate: z.number().optional().nullable(),
    isActive: z.boolean().default(true),
  });

// BOM Types
export type InsertBomDefinition = z.infer<typeof insertBomDefinitionSchema>;
export type BomDefinition = typeof bomDefinitions.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
export type BomItem = typeof bomItems.$inferSelect;

// ========================================
// ROBUST BOM SYSTEM - Advanced BOM with Revisions, Parts Library, and Multi-level Explosions
// Uses UUID primary keys for better scalability and avoiding serial ID issues
// ========================================

// Parts library - stores all parts that can be used in BOMs
export const parts = pgTable('parts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  uom: text('uom').notNull().default('EA'),
  stdCost: numeric('std_cost', { precision: 18, scale: 6 }).notNull().default('0'),
  weight: numeric('weight', { precision: 18, scale: 6 }).notNull().default('0'),
  isMake: boolean('is_make').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  bySku: index('parts_sku_idx').on(t.sku),
}));

// BOM definitions - parent record for each BOM
// Now references inventoryItems instead of deprecated parts table
export const boms = pgTable('boms', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentPartAgNumber: text('parent_part_ag_number').notNull().references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  description: text('description').default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  byParent: index('boms_parent_idx').on(t.parentPartAgNumber),
  byCode: index('boms_code_idx').on(t.code),
}));

// BOM revisions - allows multiple versions of each BOM with release control
export const bomRevisions = pgTable('bom_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  bomId: uuid('bom_id').notNull().references(() => boms.id, { onDelete: 'cascade' }),
  revCode: text('rev_code').notNull(),
  notes: text('notes').default(''),
  isReleased: boolean('is_released').notNull().default(false),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqueBomRev: index('bom_rev_unique').on(t.bomId, t.revCode),
}));

// BOM lines - individual line items within a revision
// Now references inventoryItems instead of deprecated parts table
export const bomLines = pgTable('bom_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  revisionId: uuid('revision_id').notNull().references(() => bomRevisions.id, { onDelete: 'cascade' }),
  childPartAgNumber: text('child_part_ag_number').notNull().references(() => inventoryItems.agPartNumber, { onDelete: 'restrict' }),
  qtyPer: numeric('qty_per', { precision: 18, scale: 6 }).notNull().default('1'),
  scrapPct: numeric('scrap_pct', { precision: 6, scale: 3 }).notNull().default('0'),
  reference: text('reference').default(''),
  operationSeq: integer('operation_seq').default(10),
  notes: text('notes').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  byRev: index('bom_lines_rev_idx').on(t.revisionId),
  byChild: index('bom_lines_child_idx').on(t.childPartAgNumber),
}));

// Robust BOM Relations
// Note: parts relations kept for backward compatibility (deprecated table)
export const partsRelations = relations(parts, ({ many }) => ({
  childBomLines: many(bomLines),
  parentBoms: many(boms),
}));

export const bomsRelations = relations(boms, ({ many, one }) => ({
  revisions: many(bomRevisions),
  parentInventoryItem: one(inventoryItems, { fields: [boms.parentPartAgNumber], references: [inventoryItems.agPartNumber] }),
}));

export const bomRevisionsRelations = relations(bomRevisions, ({ many, one }) => ({
  bom: one(boms, { fields: [bomRevisions.bomId], references: [boms.id] }),
  lines: many(bomLines),
}));

export const bomLinesRelations = relations(bomLines, ({ one }) => ({
  revision: one(bomRevisions, { fields: [bomLines.revisionId], references: [bomRevisions.id] }),
  childInventoryItem: one(inventoryItems, { fields: [bomLines.childPartAgNumber], references: [inventoryItems.agPartNumber] }),
}));

// Robust BOM Insert Schemas
export const insertPartSchema = createInsertSchema(parts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  uom: z.string().default('EA'),
  stdCost: z.string().default('0'),
  weight: z.string().default('0'),
  isMake: z.boolean().default(false),
});

export const insertBomSchema = createInsertSchema(boms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  parentPartAgNumber: z.string().min(1, 'Parent part AG Number is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().default(''),
});

export const insertBomRevisionSchema = createInsertSchema(bomRevisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bomId: z.string().uuid('Invalid BOM ID'),
  revCode: z.string().min(1, 'Revision code is required'),
  notes: z.string().default(''),
  isReleased: z.boolean().default(false),
  effectiveFrom: z.date().optional(),
  effectiveTo: z.date().optional(),
});

export const insertBomLineSchema = createInsertSchema(bomLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  revisionId: z.string().uuid('Invalid revision ID'),
  childPartAgNumber: z.string().min(1, 'Child part AG Number is required'),
  qtyPer: z.union([z.string(), z.number()]).transform(val => String(val)).default('1'),
  scrapPct: z.union([z.string(), z.number()]).transform(val => String(val)).default('0'),
  uom: z.string().default('EA'),
  reference: z.string().default(''),
  operationSeq: z.number().default(10),
  notes: z.string().default(''),
});

// Robust BOM Types
export type Part = typeof parts.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
export type Bom = typeof boms.$inferSelect;
export type InsertBom = z.infer<typeof insertBomSchema>;
export type BomRevision = typeof bomRevisions.$inferSelect;
export type InsertBomRevision = z.infer<typeof insertBomRevisionSchema>;
export type BomLine = typeof bomLines.$inferSelect;
export type InsertBomLine = z.infer<typeof insertBomLineSchema>;

// Order ID Reservation System - Eliminates race conditions for concurrent order creation
export const orderIdReservations = pgTable('order_id_reservations', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // The reserved Order ID (e.g., AG003)
  yearMonthPrefix: text('year_month_prefix').notNull(), // Year-month prefix (e.g., AG)
  sequenceNumber: integer('sequence_number').notNull(), // Sequential number (e.g., 3 for AG003)
  reservedAt: timestamp('reserved_at').defaultNow().notNull(), // When ID was reserved
  expiresAt: timestamp('expires_at').notNull(), // When reservation expires (5 minutes default)
  isUsed: boolean('is_used').default(false), // Whether the reserved ID has been used
  usedAt: timestamp('used_at'), // When the ID was actually used
  sessionId: text('session_id'), // Optional: track which session reserved the ID
  createdAt: timestamp('created_at').defaultNow(),
});

// Index for efficient cleanup of expired reservations
// CREATE INDEX CONCURRENTLY idx_order_id_reservations_expires_at ON order_id_reservations(expires_at) WHERE is_used = false;

export const insertOrderIdReservationSchema = createInsertSchema(
  orderIdReservations
).omit({
  id: true,
  createdAt: true,
});

export type InsertOrderIdReservation = z.infer<
  typeof insertOrderIdReservationSchema
>;
export type OrderIdReservation = typeof orderIdReservations.$inferSelect;

// Order ID Sequence System - Database-level atomic sequence for guaranteed unique order IDs
// Replaces the reservation system with a simpler, faster, and 100% reliable approach
export const orderIdSequences = pgTable('order_id_sequences', {
  id: serial('id').primaryKey(),
  yearMonthPrefix: text('year_month_prefix').notNull(), // Year-month prefix (e.g., EH for Aug 2025)
  currentSequence: integer('current_sequence').notNull().default(0), // Current sequence number
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(), // Last time this prefix was used
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertOrderIdSequenceSchema = createInsertSchema(
  orderIdSequences
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const p2OrderIdSequences = pgTable('p2_order_id_sequences', {
  yearMonthPrefix: text('year_month_prefix').primaryKey(),
  currentSequence: integer('current_sequence').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type InsertOrderIdSequence = z.infer<typeof insertOrderIdSequenceSchema>;
export type OrderIdSequence = typeof orderIdSequences.$inferSelect;

// Idempotency Keys - Prevents duplicate order creation from retried requests
// Stores a mapping of client-provided idempotency keys to created order IDs
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: serial('id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull().unique(), // Client-provided unique key (x-idempotency-key header)
  endpoint: text('endpoint').notNull(), // API endpoint that was called
  orderId: text('order_id'), // The order ID that was created (null if request failed)
  responseStatus: integer('response_status'), // HTTP status code of original response
  responseBody: jsonb('response_body'), // Cached response to return on replay
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(), // Auto-cleanup after expiration (24 hours default)
}, (table) => ({
  keyEndpointIdx: index('idempotency_keys_key_endpoint_idx').on(table.idempotencyKey, table.endpoint),
  expiresAtIdx: index('idempotency_keys_expires_at_idx').on(table.expiresAt),
}));

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({
  id: true,
  createdAt: true,
});

export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

// P2 Production Orders - Generated from P2 Purchase Orders based on BOM
export const p2ProductionOrders = pgTable('p2_production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // P2-PO123-001, P2-PO123-002, etc.
  p2PoId: integer('p2_po_id')
    .references(() => p2PurchaseOrders.id)
    .notNull(),
  p2PoItemId: integer('p2_po_item_id')
    .references(() => p2PurchaseOrderItems.id)
    .notNull(),
  // Task #242: scope p2 production rows to a specific project when the
  // PO is shared by multiple projects. Nullable: rows that cannot be
  // deterministically attributed to a single project fall back to the
  // PO-wide view in the PM Control Center.
  projectId: uuid('project_id'),
  bomDefinitionId: uuid('bom_definition_id'), // Foreign key to BOM definition
  bomItemId: uuid('bom_item_id'), // Foreign key to BOM item
  sku: text('sku').notNull(), // From BOM definition
  partName: text('part_name').notNull(), // From BOM item
  quantity: integer('quantity').notNull(), // BOM item quantity * PO quantity
  quantityManufactured: integer('quantity_manufactured').default(0).notNull(), // Track how many have been made
  department: text('department').notNull(), // From BOM item firstDept
  status: text('status').default('PENDING').notNull(), // PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  priority: integer('priority').default(50), // 1-100, lower = higher priority
  dueDate: timestamp('due_date'),
  scheduledLayupDate: timestamp('scheduled_layup_date'), // When this part is scheduled for layup
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertP2ProductionOrderSchema = createInsertSchema(
  p2ProductionOrders
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    p2PoId: z.number().min(1, 'P2 PO ID is required'),
    p2PoItemId: z.number().min(1, 'P2 PO Item ID is required'),
    bomDefinitionId: z.string().min(1, 'BOM Definition ID is required'),
    bomItemId: z.string().min(1, 'BOM Item ID is required'),
    sku: z.string().min(1, 'SKU is required'),
    partName: z.string().min(1, 'Part name is required'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    quantityManufactured: z.number().min(0).default(0),
    department: z.enum([
      'Layup',
      'Assembly/Disassembly',
      'Finish',
      'Paint',
      'QC',
      'Shipping',
    ]),
    status: z
      .enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
      .default('PENDING'),
    priority: z.number().min(1).max(100).default(50),
    dueDate: z.string().datetime().optional(),
    scheduledLayupDate: z.string().datetime().optional(),
    notes: z.string().optional(),
  });

export type InsertP2ProductionOrder = z.infer<
  typeof insertP2ProductionOrderSchema
>;
export type P2ProductionOrder = typeof p2ProductionOrders.$inferSelect;

// Shipment Records - P1 PO Shipping Tracking System
export const shipmentRecords = pgTable('shipment_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  reference: text('reference').notNull(), // Internal reference like "SHIP-RH-20251111-001"
  poNumbers: text('po_numbers').notNull(), // Comma-separated PO numbers (for display)
  carrier: text('carrier').notNull().default('UPS'), // UPS, FedEx, USPS, etc.
  serviceLevel: text('service_level').notNull(), // Ground, 2-Day Air, Next Day Air, etc.
  billType: text('bill_type').notNull().default('SENDER'), // SENDER, RECEIVER, THIRD_PARTY
  thirdPartyAccount: text('third_party_account'), // UPS account if bill_type is THIRD_PARTY
  masterTrackingNumber: text('master_tracking_number').notNull(), // Primary tracking number
  packageCount: integer('package_count').notNull().default(1),
  totalWeightLbs: numeric('total_weight_lbs', { precision: 10, scale: 2 }).notNull(),
  shippedAt: timestamp('shipped_at').defaultNow().notNull(),
  estimatedDelivery: timestamp('estimated_delivery'),
  shipFromSnapshot: jsonb('ship_from_snapshot').notNull(), // AG Composites address
  shipToSnapshot: jsonb('ship_to_snapshot').notNull(), // Customer shipping address
  notificationMetadata: jsonb('notification_metadata').default({}), // { emailSentAt, smsSentAt, retries, channels }
  documents: jsonb('documents').notNull().default([]), // Array of { type, fileName, mime, storagePath, bytes }
  shippingLabelBase64: text('shipping_label_base64'), // Base64-encoded UPS shipping label (GIF)
  invoiceNumber: text('invoice_number'), // Persisted invoice # for P1 packing slips
  createdBy: text('created_by').notNull(), // Username who created the shipment
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertShipmentRecordSchema = createInsertSchema(shipmentRecords)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    reference: z.string().min(1, 'Reference is required'),
    poNumbers: z.string().min(1, 'PO numbers are required'),
    carrier: z.string().default('UPS'),
    serviceLevel: z.string().min(1, 'Service level is required'),
    billType: z.enum(['SENDER', 'RECEIVER', 'THIRD_PARTY']).default('SENDER'),
    thirdPartyAccount: z.string().optional(),
    masterTrackingNumber: z.string().min(1, 'Tracking number is required'),
    packageCount: z.number().min(1).default(1),
    totalWeightLbs: z.number().min(0.1),
    estimatedDelivery: z.string().datetime().optional(),
    shipFromSnapshot: z.any(),
    shipToSnapshot: z.any(),
    notificationMetadata: z.any().optional(),
    documents: z.any(),
    invoiceNumber: z.string().nullable().optional(),
    createdBy: z.string().min(1, 'Created by is required'),
  });

export type InsertShipmentRecord = z.infer<typeof insertShipmentRecordSchema>;
export type ShipmentRecord = typeof shipmentRecords.$inferSelect;

// Shipment Items - Join table linking shipments to PO items and production orders
export const shipmentItems = pgTable('shipment_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  shipmentId: uuid('shipment_id')
    .references(() => shipmentRecords.id, { onDelete: 'cascade' })
    .notNull(),
  poItemId: integer('po_item_id')
    .references(() => purchaseOrderItems.id)
    .notNull(),
  orderId: text('order_id').notNull(), // Production order ID (e.g., "AG123-1")
  quantity: integer('quantity').notNull().default(1),
  weightLbs: numeric('weight_lbs', { precision: 10, scale: 2 }),
  notes: text('notes'),
  description: text('description'), // Item description for display
  poNumber: text('po_number'), // PO number for this item
  packingSlipBase64: text('packing_slip_base64'), // Base64-encoded packing slip PDF
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertShipmentItemSchema = createInsertSchema(shipmentItems)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    shipmentId: z.string().uuid('Shipment ID must be a valid UUID'),
    poItemId: z.number().min(1, 'PO item ID is required'),
    orderId: z.string().min(1, 'Order ID is required'),
    quantity: z.number().min(1).default(1),
    weightLbs: z.number().min(0).optional(),
    notes: z.string().optional(),
    description: z.string().optional(),
    poNumber: z.string().optional(),
    packingSlipBase64: z.string().optional(),
  });

export type InsertShipmentItem = z.infer<typeof insertShipmentItemSchema>;
export type ShipmentItem = typeof shipmentItems.$inferSelect;

// Task Tracker - Collaborative task management system
export const taskItems = pgTable('task_items', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(), // Item description/title
  description: text('description'), // Optional detailed description
  category: text('category'), // Optional category/project grouping
  priority: text('priority').default('Medium').notNull(), // Low, Medium, High, Critical
  dueDate: timestamp('due_date'),

  // Status checkboxes
  gjStatus: boolean('gj_status').default(false).notNull(), // GJ checkbox
  tmStatus: boolean('tm_status').default(false).notNull(), // TM checkbox
  finishedStatus: boolean('finished_status').default(false).notNull(), // Finished checkbox

  // Tracking fields
  assignedTo: text('assigned_to'), // Who is responsible
  createdBy: text('created_by').notNull(), // Who created the task
  gjCompletedBy: text('gj_completed_by'), // Who checked GJ
  gjCompletedAt: timestamp('gj_completed_at'), // When GJ was checked
  tmCompletedBy: text('tm_completed_by'), // Who checked TM
  tmCompletedAt: timestamp('tm_completed_at'), // When TM was checked
  finishedCompletedBy: text('finished_completed_by'), // Who marked as finished
  finishedCompletedAt: timestamp('finished_completed_at'), // When marked as finished

  notes: text('notes'), // Additional notes/comments
  isActive: boolean('is_active').default(true).notNull(), // For soft delete
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertTaskItemSchema = createInsertSchema(taskItems)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z
      .string()
      .min(1, 'Title is required')
      .max(255, 'Title must be less than 255 characters'),
    description: z
      .string()
      .max(1000, 'Description must be less than 1000 characters')
      .optional(),
    category: z
      .string()
      .max(100, 'Category must be less than 100 characters')
      .optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
    dueDate: z.string().datetime().optional(),
    assignedTo: z
      .string()
      .max(100, 'Assigned to must be less than 100 characters')
      .optional(),
    createdBy: z
      .string()
      .min(1, 'Created by is required')
      .max(100, 'Created by must be less than 100 characters'),
    notes: z
      .string()
      .max(2000, 'Notes must be less than 2000 characters')
      .optional(),
  });

export type InsertTaskItem = z.infer<typeof insertTaskItemSchema>;
export type TaskItem = typeof taskItems.$inferSelect;

// Kickback Tracking Table
export const kickbacks = pgTable('kickbacks', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  kickbackDept: text('kickback_dept').notNull(), // Department where kickback occurred
  reasonCode: text('reason_code').notNull(), // MATERIAL_DEFECT, OPERATOR_ERROR, MACHINE_FAILURE, etc.
  reasonText: text('reason_text'), // Detailed description
  kickbackDate: timestamp('kickback_date').notNull(),
  reportedBy: text('reported_by').notNull(), // User who reported the kickback
  resolvedAt: timestamp('resolved_at'), // When the kickback was resolved
  resolvedBy: text('resolved_by'), // User who resolved the kickback
  resolutionNotes: text('resolution_notes'), // Notes about the resolution
  status: text('status').default('OPEN').notNull(), // OPEN, IN_PROGRESS, RESOLVED, CLOSED
  priority: text('priority').default('MEDIUM').notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  impactedDepartments: text('impacted_departments').array(), // Other departments affected
  rootCause: text('root_cause'), // Identified root cause
  correctiveAction: text('corrective_action'), // Actions taken to prevent recurrence
  // State confirmation fields for Attention & State-Confidence system
  viewedBy: jsonb('viewed_by').$type<Record<string, string>>().default(sql`'{}'::jsonb`), // { [userId]: ISO timestamp }
  lastConfirmedAt: timestamp('last_confirmed_at'), // When state was last confirmed as accurate
  lastConfirmedByUserId: integer('last_confirmed_by_user_id'), // Who confirmed the state
  confirmationNote: text('confirmation_note'), // Optional short note with confirmation
  attentionRisk: text('attention_risk').$type<'low' | 'medium' | 'high'>(), // Computed staleness risk level
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertKickbackSchema = createInsertSchema(kickbacks)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    kickbackDept: z.enum(['Barcode', 'Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping']),
    reasonCode: z.enum([
      'MATERIAL_DEFECT',
      'OPERATOR_ERROR',
      'MACHINE_FAILURE',
      'DESIGN_ISSUE',
      'QUALITY_ISSUE',
      'PROCESS_ISSUE',
      'SUPPLIER_ISSUE',
      'OTHER',
    ]),
    reasonText: z.string().optional().nullable(),
    kickbackDate: z.coerce.date(),
    reportedBy: z.string().min(1, 'Reporter is required'),
    resolvedAt: z.coerce.date().optional().nullable(),
    resolvedBy: z.string().optional().nullable(),
    resolutionNotes: z.string().optional().nullable(),
    status: z
      .enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
      .default('OPEN'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    impactedDepartments: z.array(z.string()).default([]),
    rootCause: z.string().optional().nullable(),
    correctiveAction: z.string().optional().nullable(),
  });

export type InsertKickback = z.infer<typeof insertKickbackSchema>;
export type Kickback = typeof kickbacks.$inferSelect;

// Production Delays - Active blockers requiring periodic confirmation
export const productionDelays = pgTable('production_delays', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: text('order_id').notNull(),
  delayType: text('delay_type').notNull(), // MATERIAL, EQUIPMENT, LABOR, VENDOR, CUSTOMER, OTHER
  description: text('description').notNull(),
  department: text('department').notNull(),
  estimatedResolutionDate: timestamp('estimated_resolution_date'),
  actualResolutionDate: timestamp('actual_resolution_date'),
  delayOwnerUserId: integer('delay_owner_user_id'), // Person responsible for resolving
  status: text('status').default('ACTIVE').notNull(), // ACTIVE, RESOLVED, CANCELLED
  priority: text('priority').default('MEDIUM').notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  blockerDetails: text('blocker_details'), // What specifically is blocking
  resolutionNotes: text('resolution_notes'),
  // State confirmation fields for Attention & State-Confidence system
  viewedBy: jsonb('viewed_by').$type<Record<string, string>>().default(sql`'{}'::jsonb`),
  lastConfirmedAt: timestamp('last_confirmed_at'), // "Delay still valid / blocker remains"
  lastConfirmedByUserId: integer('last_confirmed_by_user_id'),
  confirmationNote: text('confirmation_note'),
  attentionRisk: text('attention_risk').$type<'low' | 'medium' | 'high'>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdx: index('production_delays_order_idx').on(table.orderId),
  statusIdx: index('production_delays_status_idx').on(table.status),
  ownerIdx: index('production_delays_owner_idx').on(table.delayOwnerUserId),
  riskIdx: index('production_delays_risk_idx').on(table.attentionRisk),
}));

export const insertProductionDelaySchema = createInsertSchema(productionDelays).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewedBy: true,
  lastConfirmedAt: true,
  lastConfirmedByUserId: true,
  attentionRisk: true,
});

export type InsertProductionDelay = z.infer<typeof insertProductionDelaySchema>;
export type ProductionDelay = typeof productionDelays.$inferSelect;

// Staleness Configuration - Defines thresholds for attention risk escalation
export const stalenessConfig = pgTable('staleness_config', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'ticket', 'order', 'qc_item', 'production_delay'
  statusValue: text('status_value').notNull(), // The specific status (e.g., 'waiting_on_vendor', 'escalated')
  hoursUntilLow: integer('hours_until_low').notNull().default(24), // Hours before LOW risk
  hoursUntilMedium: integer('hours_until_medium').notNull().default(48), // Hours before MEDIUM risk
  hoursUntilHigh: integer('hours_until_high').notNull().default(72), // Hours before HIGH risk
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  entityStatusIdx: index('staleness_config_entity_status_idx').on(table.entityType, table.statusValue),
}));

export const insertStalenessConfigSchema = createInsertSchema(stalenessConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStalenessConfig = z.infer<typeof insertStalenessConfigSchema>;
export type StalenessConfig = typeof stalenessConfig.$inferSelect;

// Document Management System Tables
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  fileName: text('file_name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  documentType: text('document_type').notNull(), // 'RFQ', 'QUOTE', 'PO', 'PACKING_SLIP', 'RISK_ASSESSMENT', 'FORM_SUBMISSION'
  uploadDate: timestamp('upload_date').defaultNow(),
  uploadedBy: text('uploaded_by'), // Changed from user ID reference to text field
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentTags = pgTable('document_tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'), // 'project', 'customer', 'po_number', 'status', 'document_type'
  color: text('color').default('#3B82F6'), // Hex color for UI
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentTagRelations = pgTable(
  'document_tag_relations',
  {
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: integer('tag_id')
      .references(() => documentTags.id, { onDelete: 'cascade' })
      .notNull(),
    addedAt: timestamp('added_at').defaultNow(),
  },
  (table) => ({
    pk: { primaryKey: table.documentId, tagId: table.tagId },
  })
);

export const documentCollections = pgTable('document_collections', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  collectionType: text('collection_type').notNull(), // 'purchase_order', 'customer_project', 'quote_process', 'form_workflow'
  primaryIdentifier: text('primary_identifier'), // PO number, customer ID, quote number
  status: text('status').default('active'), // 'active', 'completed', 'archived', 'cancelled'
  metadata: jsonb('metadata'), // Additional flexible data
  createdBy: text('created_by'), // Changed from user ID reference to text field
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentCollectionRelations = pgTable(
  'document_collection_relations',
  {
    collectionId: integer('collection_id')
      .references(() => documentCollections.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    relationshipType: text('relationship_type').default('primary'), // 'primary', 'supporting', 'revision', 'reference'
    displayOrder: integer('display_order').default(0),
    addedAt: timestamp('added_at').defaultNow(),
    addedBy: text('added_by'), // Changed from user ID reference to text field
  },
  (table) => ({
    pk: { primaryKey: table.collectionId, documentId: table.documentId },
  })
);

// Document Management Insert Schemas
export const insertDocumentSchema = createInsertSchema(documents)
  .omit({
    id: true,
    uploadDate: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, 'Title is required'),
    fileName: z.string().min(1, 'File name is required'),
    originalFileName: z.string().min(1, 'Original file name is required'),
    filePath: z.string().min(1, 'File path is required'),
    fileSize: z.number().positive('File size must be positive'),
    mimeType: z.string().min(1, 'MIME type is required'),
    documentType: z.enum([
      'RFQ',
      'QUOTE',
      'PO',
      'PACKING_SLIP',
      'RISK_ASSESSMENT',
      'FORM_SUBMISSION',
      'SPECIFICATION',
      'CONTRACT',
      'INVOICE',
      'OTHER',
    ]),
    uploadedBy: z.string().optional().nullable(), // Changed from number to string
    description: z.string().optional().nullable(),
  });

export const insertDocumentTagSchema = createInsertSchema(documentTags)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    name: z.string().min(1, 'Tag name is required'),
    category: z
      .enum([
        'project',
        'customer',
        'po_number',
        'status',
        'document_type',
        'priority',
        'department',
        'other',
      ])
      .optional()
      .nullable(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
      .default('#3B82F6'),
    description: z.string().optional().nullable(),
  });

export const insertDocumentCollectionSchema = createInsertSchema(
  documentCollections
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Collection name is required'),
    collectionType: z.enum([
      'purchase_order',
      'customer_project',
      'quote_process',
      'form_workflow',
      'general',
    ]),
    primaryIdentifier: z.string().optional().nullable(),
    status: z
      .enum(['active', 'completed', 'archived', 'cancelled'])
      .default('active'),
    description: z.string().optional().nullable(),
    metadata: z.record(z.any()).optional().nullable(),
    createdBy: z.number().optional().nullable(),
  });

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocumentTag = z.infer<typeof insertDocumentTagSchema>;
export type DocumentTag = typeof documentTags.$inferSelect;
export type InsertDocumentCollection = z.infer<
  typeof insertDocumentCollectionSchema
>;
export type DocumentCollection = typeof documentCollections.$inferSelect;

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// New validation schema for Customer Communications
export const insertCustomerCommunicationSchema = createInsertSchema(
  customerCommunications
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    customerId: z.string().min(1, 'Customer ID is required'),
    communicationLogId: z.number().optional(),
    threadId: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    assignedTo: z.string().optional(),
    // Include fields from communicationLogs that might be relevant here, if needed
    // This depends on how customerCommunications is intended to be used alongside communicationLogs
    // For now, assuming it augments communicationLogs with customer-specific context
  });

export const orderAttachmentsRelations = relations(
  orderAttachments,
  ({ one }) => ({
    order: one(allOrders, {
      fields: [orderAttachments.orderId],
      references: [allOrders.orderId],
    }),
  })
);

// Gateway Reports temporarily removed for deployment - will be re-added later

// Customer Satisfaction Survey tables
export const customerSatisfactionSurveys = pgTable(
  'customer_satisfaction_surveys',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    // Survey questions stored as JSON
    questions: jsonb('questions').notNull().default('[]'),
    // Survey configuration settings
    settings: jsonb('settings').default('{}'),
    createdBy: text('created_by'), // Changed from user ID reference to text field
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  }
);

export const customerSatisfactionResponses = pgTable(
  'customer_satisfaction_responses',
  {
    id: serial('id').primaryKey(),
    surveyId: integer('survey_id')
      .references(() => customerSatisfactionSurveys.id)
      .notNull(),
    customerId: integer('customer_id')
      .references(() => customers.id)
      .notNull(),
    orderId: text('order_id'), // Optional - link to specific order
    // Survey responses stored as JSON
    responses: jsonb('responses').notNull().default('{}'),
    // Calculated scores
    overallSatisfaction: integer('overall_satisfaction'), // 1-10 scale
    npsScore: integer('nps_score'), // 0-10 scale for Net Promoter Score
    aggregateScore: integer('aggregate_score'), // Sum of all question responses (out of 50 for 5 questions)
    // Additional metadata
    responseTimeSeconds: integer('response_time_seconds'), // Time to complete survey
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    csrName: text('csr_name'), // Customer Service Representative name
    surveyDate: timestamp('survey_date'), // Date selected by user in the survey form
    // Status tracking
    isComplete: boolean('is_complete').default(false),
    scannedPdfPath: text('scanned_pdf_path'),
    submittedAt: timestamp('submitted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  }
);

// Insert schemas for Customer Satisfaction
export const insertCustomerSatisfactionSurveySchema = createInsertSchema(
  customerSatisfactionSurveys
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, 'Survey title is required'),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    questions: z
      .array(
        z.object({
          id: z.string(),
          type: z.enum([
            'rating',
            'multiple_choice',
            'text',
            'textarea',
            'yes_no',
            'nps',
          ]),
          question: z.string().min(1, 'Question text is required'),
          required: z.boolean().default(false),
          options: z.array(z.string()).optional(), // For multiple choice questions
          scale: z
            .object({
              min: z.number(),
              max: z.number(),
              minLabel: z.string().optional(),
              maxLabel: z.string().optional(),
            })
            .optional(), // For rating questions
        })
      )
      .default([]),
    settings: z
      .object({
        allowAnonymous: z.boolean().default(false),
        sendEmailReminders: z.boolean().default(true),
        showProgressBar: z.boolean().default(true),
        autoSave: z.boolean().default(true),
      })
      .default({}),
    createdBy: z.string().optional().nullable(),
  });

export const insertCustomerSatisfactionResponseSchema = createInsertSchema(
  customerSatisfactionResponses
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    surveyId: z.number().min(1, 'Survey ID is required'),
    customerId: z.number().min(1, 'Customer ID is required'),
    orderId: z.string().optional().nullable(),
    responses: z.record(z.any()).default({}), // Question ID to response mapping
    overallSatisfaction: z.number().min(1).max(10).optional().nullable(),
    npsScore: z.number().min(0).max(10).optional().nullable(),
    aggregateScore: z.number().optional().nullable(),
    responseTimeSeconds: z.number().optional().nullable(),
    ipAddress: z.string().optional().nullable(),
    userAgent: z.string().optional().nullable(),
    csrName: z.string().optional().nullable(), // Customer Service Representative name
    surveyDate: z.string().optional().nullable(), // ISO date string - user-selected survey date
    isComplete: z.boolean().default(false),
    submittedAt: z.string().optional().nullable(), // ISO date string
  });

// Types for Customer Satisfaction
export type InsertCustomerSatisfactionSurvey = z.infer<
  typeof insertCustomerSatisfactionSurveySchema
>;
export type CustomerSatisfactionSurvey =
  typeof customerSatisfactionSurveys.$inferSelect;
export type InsertCustomerSatisfactionResponse = z.infer<
  typeof insertCustomerSatisfactionResponseSchema
>;
export type CustomerSatisfactionResponse =
  typeof customerSatisfactionResponses.$inferSelect;

// Audit Log for Customer Satisfaction Response Actions
export const customerSatisfactionAuditLog = pgTable(
  'customer_satisfaction_audit_log',
  {
    id: serial('id').primaryKey(),
    action: text('action').notNull(), // 'created' | 'updated' | 'deleted'
    responseId: integer('response_id').notNull(),
    customerName: text('customer_name'),
    surveyTitle: text('survey_title'),
    performedBy: text('performed_by'),
    reason: text('reason'),
    metadata: jsonb('metadata').default('{}'),
    createdAt: timestamp('created_at').defaultNow(),
  }
);

export const insertCustomerSatisfactionAuditLogSchema = createInsertSchema(
  customerSatisfactionAuditLog
).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerSatisfactionAuditLog = z.infer<
  typeof insertCustomerSatisfactionAuditLogSchema
>;
export type CustomerSatisfactionAuditLog =
  typeof customerSatisfactionAuditLog.$inferSelect;

// ============================================================================
// SURVEY ENGINE - Generic reusable survey system
// ============================================================================

// Generic Surveys table - application-agnostic survey definitions
export const surveys = pgTable('surveys', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  isActive: boolean('is_active').default(true),
  isTemplate: boolean('is_template').default(false),
  welcomeMessage: text('welcome_message'),
  thankYouMessage: text('thank_you_message').default('Thank you for your feedback!'),
  createdById: integer('created_by_id'),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Generic Survey Responses table
export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id')
    .references(() => surveys.id)
    .notNull(),
  orderId: text('order_id'),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  responseToken: text('response_token'),
  isComplete: boolean('is_complete').default(false),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  triggerId: uuid('trigger_id'),
  metadata: jsonb('metadata'),
});

// Insert schema for Generic Surveys
export const insertSurveySchema = createInsertSchema(surveys)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(1, 'Survey title is required'),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
    questions: z
      .array(
        z.object({
          id: z.string(),
          type: z.enum([
            'rating',
            'multiple_choice',
            'text',
            'textarea',
            'yes_no',
            'nps',
          ]),
          question: z.string().min(1, 'Question text is required'),
          required: z.boolean().default(false),
          options: z.array(z.string()).optional(),
          scale: z
            .object({
              min: z.number(),
              max: z.number(),
              minLabel: z.string().optional(),
              maxLabel: z.string().optional(),
            })
            .optional(),
        })
      )
      .default([]),
    settings: z
      .object({
        allowAnonymous: z.boolean().default(false),
        sendEmailReminders: z.boolean().default(true),
        showProgressBar: z.boolean().default(true),
        autoSave: z.boolean().default(true),
      })
      .default({}),
    createdBy: z.string().optional().nullable(),
  });

// Insert schema for Generic Survey Responses
export const insertSurveyResponseSchema = createInsertSchema(surveyResponses)
  .omit({
    id: true,
  })
  .extend({
    surveyId: z.string().uuid('Survey ID must be a valid UUID'),
    respondentId: z.string().min(1, 'Respondent ID is required'),
    respondentType: z
      .enum(['customer', 'employee', 'vendor', 'anonymous', 'other'])
      .default('customer'),
    respondentName: z.string().optional().nullable(),
    respondentEmail: z.string().email().optional().nullable(),
    contextId: z.string().optional().nullable(),
    contextType: z
      .enum(['order', 'project', 'service', 'event', 'general', 'other'])
      .default('general'),
    responses: z.record(z.any()).default({}),
    overallSatisfaction: z.number().min(1).max(10).optional().nullable(),
    npsScore: z.number().min(0).max(10).optional().nullable(),
    aggregateScore: z.number().optional().nullable(),
    responseTimeSeconds: z.number().optional().nullable(),
    ipAddress: z.string().optional().nullable(),
    userAgent: z.string().optional().nullable(),
    submittedBy: z.string().optional().nullable(),
    surveyDate: z.string().optional().nullable(),
    isComplete: z.boolean().default(false),
    submittedAt: z.string().optional().nullable(),
  });

// Types for Generic Survey Engine
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveys.$inferSelect;
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;
export type SurveyResponse = typeof surveyResponses.$inferSelect;

// PO Products table for Purchase Order product configurations - Updated for P1 PO Queue System
export const poProducts = pgTable('po_products', {
  id: serial('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  productName: text('product_name').notNull(),
  material: text('material'),
  handedness: text('handedness'),
  stockModel: text('stock_model'),
  actionLength: text('action_length'),
  actionInlet: text('action_inlet'),
  bottomMetal: text('bottom_metal'),
  barrelInlet: text('barrel_inlet'),
  qds: text('qds'),
  swivelStuds: text('swivel_studs'),
  paintOptions: text('paint_options'),
  texture: text('texture'),
  price: real('price').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  flatTop: boolean('flat_top').default(false),
  notes: text('notes'),
  productType: text('product_type'),
  // New fields for P1 PO Queue system
  poNumber: text('po_number'),
  dueDate: date('due_date'),
  quantity: integer('quantity').default(1),
  customerPoLine: text('customer_po_line'),
  targetWeek: text('target_week'),
  linkedOrderId: text('linked_order_id'),
  status: text('status').default('pending'),
  priorityNote: text('priority_note'),
  barcode: text('barcode'),
  customerProductNumber: text('customer_product_number'),
});

// PO Product Selections table for tracking selection batches
export const poProductSelections = pgTable('po_product_selections', {
  id: serial('id').primaryKey(),
  poProductId: integer('po_product_id').notNull().references(() => poProducts.id, { onDelete: 'cascade' }),
  selectionBatchId: text('selection_batch_id').notNull(),
  quantitySelected: integer('quantity_selected').notNull().default(1),
  selectionSource: text('selection_source').default('p1'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Weekly Schedule Assignments table for tracking layup scheduling
export const weeklyScheduleAssignments = pgTable('weekly_schedule_assignments', {
  id: serial('id').primaryKey(),
  weekStartDate: date('week_start_date').notNull(),
  dayOfWeek: text('day_of_week').notNull(),
  itemType: text('item_type').notNull(),
  orderId: text('order_id'),
  poProductId: integer('po_product_id').references(() => poProducts.id, { onDelete: 'cascade' }),
  moldCount: integer('mold_count').notNull().default(1),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schema for PO Products - Updated for P1 PO Queue System
export const insertPOProductSchema = createInsertSchema(poProducts, {
  customerName: z.string().min(1, 'Customer name is required'),
  productName: z.string().min(1, 'Product name is required'),
  price: z.number().min(0, 'Price must be positive').default(0),
  quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
  otherOptions: z.array(z.string()).optional().default([]),
})
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

// Insert schema for PO Product Selections
export const insertPOProductSelectionSchema = createInsertSchema(poProductSelections, {
  poProductId: z.number().min(1, 'PO Product ID is required'),
  selectionBatchId: z.string().min(1, 'Selection batch ID is required'),
  quantitySelected: z.number().min(1, 'Quantity must be at least 1'),
})
  .omit({
    id: true,
    createdAt: true,
  });

// Insert schema for Weekly Schedule Assignments
export const insertWeeklyScheduleAssignmentSchema = createInsertSchema(weeklyScheduleAssignments, {
  weekStartDate: z.string().min(1, 'Week start date is required'),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
  itemType: z.enum(['order', 'po_product']),
  moldCount: z.number().min(1, 'Mold count must be at least 1'),
})
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

// Types for PO Products
export type InsertPOProduct = z.infer<typeof insertPOProductSchema>;
export type POProduct = typeof poProducts.$inferSelect;

// Types for PO Product Selections
export type InsertPOProductSelection = z.infer<typeof insertPOProductSelectionSchema>;
export type POProductSelection = typeof poProductSelections.$inferSelect;

// Types for Weekly Schedule Assignments
export type InsertWeeklyScheduleAssignment = z.infer<typeof insertWeeklyScheduleAssignmentSchema>;
export type WeeklyScheduleAssignment = typeof weeklyScheduleAssignments.$inferSelect;

// Insert schema for Refund Requests
export const insertRefundRequestSchema = createInsertSchema(refundRequests)
  .omit({
    id: true,
    status: true,
    approvedBy: true,
    approvedAt: true,
    processedAt: true,
    rejectionReason: true,
    authNetTransactionId: true,
    authNetRefundId: true,
    createdAt: true,
    updatedAt: true,
    lastRemindedAt: true,
  })
  .extend({
    orderId: z.string().min(1, 'Order ID is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    requestedBy: z.string().min(1, 'Requested by is required'),
    refundAmount: z.number().min(0.01, 'Refund amount must be greater than 0'),
    reason: z.string().min(1, 'Reason is required'),
    originalTransactionId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  });

// Types for Refund Requests
export type InsertRefundRequest = z.infer<typeof insertRefundRequestSchema>;
export type RefundRequest = typeof refundRequests.$inferSelect;

// OEM Priority Settings table for storing priority configurations
export const oemPrioritySettings = pgTable('oem_priority_settings', {
  id: serial('id').primaryKey(),
  vendorId: text('vendor_id').notNull(), // The vendor (customer) ID from purchase orders
  vendorName: text('vendor_name').notNull(), // Vendor display name for reference
  poId: integer('po_id').notNull(), // Purchase order ID
  poNumber: text('po_number').notNull(), // PO number for reference
  selectionMode: text('selection_mode').notNull(), // 'entire_po' or 'specific_items'
  stockItemIds: json('stock_item_ids'), // Array of stock item IDs for specific_items mode
  manualQuantities: json('manual_quantities'), // Manual quantity overrides { [itemId]: quantity }
  priorityLevel: integer('priority_level').default(1), // Priority level (1 = highest)
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by'), // User who created this priority setting
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schema for OEM Priority Settings
export const insertOemPrioritySettingsSchema = createInsertSchema(
  oemPrioritySettings
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    vendorId: z.string().min(1, 'Vendor ID is required'),
    vendorName: z.string().min(1, 'Vendor name is required'),
    poId: z.number().min(1, 'PO ID is required'),
    poNumber: z.string().min(1, 'PO number is required'),
    selectionMode: z.enum(['entire_po', 'specific_items'], {
      required_error: 'Selection mode is required',
    }),
    stockItemIds: z.array(z.string()).optional().nullable(),
    manualQuantities: z.record(z.string(), z.number()).optional().nullable(), // { [itemId]: quantity }
    priorityLevel: z.number().min(1).max(10).default(1),
    isActive: z.boolean().default(true),
    createdBy: z.string().optional().nullable(),
  });

// Types for OEM Priority Settings
export type InsertOemPrioritySettings = z.infer<
  typeof insertOemPrioritySettingsSchema
>;
export type OemPrioritySettings = typeof oemPrioritySettings.$inferSelect;

// Internal Messaging System Tables

// Departments table for internal messaging and parts requests
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name'), // Display name for UI
  description: text('description'),
  locationId: text('location_id'), // Physical location/storage area for parts
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Internal messages table
export const internalMessages = pgTable('internal_messages', {
  id: serial('id').primaryKey(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  senderId: integer('sender_id'),
  senderName: text('sender_name').notNull(),
  recipientType: text('recipient_type').notNull(), // 'user' or 'department'
  recipientUserId: integer('recipient_user_id'),
  recipientDepartmentId: integer('recipient_department_id'),
  recipientName: text('recipient_name').notNull(),
  isUrgent: boolean('is_urgent').default(false),
  hasReminder: boolean('has_reminder').default(false),
  reminderDate: timestamp('reminder_date'),
  sentAt: timestamp('sent_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Message recipients table (for tracking read/accomplished status)
export const messageRecipients = pgTable('message_recipients', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull(),
  userId: integer('user_id').notNull(),
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at'),
  isAccomplished: boolean('is_accomplished').default(false),
  accomplishedAt: timestamp('accomplished_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Message attachments table
export const messageAttachments = pgTable('message_attachments', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  fileUrl: text('file_url').notNull(),
  attachmentType: text('attachment_type'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

// Insert schemas for internal messaging
export const insertDepartmentSchema = createInsertSchema(departments)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Name is required'),
    displayName: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    locationId: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  });

export const insertInternalMessageSchema = createInsertSchema(
  internalMessages
).omit({
  id: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageRecipientSchema = createInsertSchema(
  messageRecipients
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageAttachmentSchema = createInsertSchema(
  messageAttachments
).omit({
  id: true,
  uploadedAt: true,
});

// Types for internal messaging
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export type InternalMessage = typeof internalMessages.$inferSelect;
export type InsertInternalMessage = z.infer<typeof insertInternalMessageSchema>;

export type MessageRecipient = typeof messageRecipients.$inferSelect;
export type InsertMessageRecipient = z.infer<
  typeof insertMessageRecipientSchema
>;

export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertMessageAttachment = z.infer<
  typeof insertMessageAttachmentSchema
>;

// Metal Accessories Tracker
export const metalAccessories = pgTable('metal_accessories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  inventory: integer('inventory').notNull().default(0), // Can be negative to account for uncommitted orders
  minimumThreshold: integer('minimum_threshold').notNull().default(0), // Minimum stock level to maintain
  machined: integer('machined').notNull().default(0),
  atAnodizer: integer('at_anodizer').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertMetalAccessorySchema = createInsertSchema(
  metalAccessories
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MetalAccessory = typeof metalAccessories.$inferSelect;
export type InsertMetalAccessory = z.infer<typeof insertMetalAccessorySchema>;

// Feature Selection Tracking - AI-powered smart sorting
export const featureSelections = pgTable('feature_selections', {
  id: serial('id').primaryKey(),
  featureName: text('feature_name').notNull(), // e.g., 'action_inlet'
  optionValue: text('option_value').notNull(), // e.g., 'impact'
  optionLabel: text('option_label').notNull(), // e.g., 'Impact'
  selectionCount: integer('selection_count').notNull().default(0),
  lastSelectedAt: timestamp('last_selected_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  selectionCountIdx: index('idx_feature_selections_count').on(table.selectionCount),
}));

export const insertFeatureSelectionSchema = createInsertSchema(
  featureSelections
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type FeatureSelection = typeof featureSelections.$inferSelect;
export type InsertFeatureSelection = z.infer<
  typeof insertFeatureSelectionSchema
>;

// Magic Link Tokens - Passwordless authentication and secure actions
export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull(), // Unique cryptographic token (constraint exists in production as magic_link_tokens_token_key)
  email: text('email').notNull(), // Email address to send link to
  purpose: text('purpose').notNull(), // e.g., 'login', 'order_confirmation', 'password_reset', 'customer_action'
  metadata: jsonb('metadata'), // Additional data (userId, orderId, customerId, etc.)
  expiresAt: timestamp('expires_at').notNull(), // Token expiration time
  usedAt: timestamp('used_at'), // When token was used (null if not used)
  ipAddress: text('ip_address'), // IP that requested the link
  userAgent: text('user_agent'), // User agent that requested the link
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertMagicLinkTokenSchema = createInsertSchema(
  magicLinkTokens
).omit({
  id: true,
  createdAt: true,
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;

// Bulk Shipping Schemas - For API requests/responses (not stored in DB)
export const receiverAccountSchema = z.object({
  accountNumber: z.string().min(1, 'Account number is required'),
  zipCode: z.string().min(5, 'ZIP code is required'),
});

export const bulkShipmentPreferenceSchema = z.object({
  orderId: z.string(),
  serviceCode: z.string().default('03'), // UPS Ground default
  billingOption: z.enum(['sender', 'receiver']).default('sender'),
  receiverAccount: receiverAccountSchema.optional(),
  declaredValue: z.number().default(100), // Insurance amount in dollars
});

export const bulkRatesRequestSchema = z.object({
  orderIds: z.array(z.string()).min(1, 'At least one order required'),
  packageDefaults: z.object({
    weight: z.number().min(0.1).default(5),
    length: z.number().min(1).default(12),
    width: z.number().min(1).default(12),
    height: z.number().min(1).default(12),
    declaredValue: z.number().min(0).default(100),
  }),
  applyServiceToAll: z.boolean().default(true), // If true, use same service for all orders
});

export const bulkLabelRequestSchema = z.object({
  shipments: z.array(bulkShipmentPreferenceSchema).min(1),
  packageDefaults: z.object({
    weight: z.number().min(0.1),
    length: z.number().min(1),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
});

// Types for bulk shipping
export type ReceiverAccount = z.infer<typeof receiverAccountSchema>;
export type BulkShipmentPreference = z.infer<typeof bulkShipmentPreferenceSchema>;
export type BulkRatesRequest = z.infer<typeof bulkRatesRequestSchema>;
export type BulkLabelRequest = z.infer<typeof bulkLabelRequestSchema>;

// RTS Inventory Schemas
export const insertRtsInventorySchema = createInsertSchema(rtsInventory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRtsInventoryHistorySchema = createInsertSchema(rtsInventoryHistory).omit({
  id: true,
  performedAt: true,
});

export type RtsInventory = typeof rtsInventory.$inferSelect;
export type InsertRtsInventory = z.infer<typeof insertRtsInventorySchema>;
export type RtsInventoryHistory = typeof rtsInventoryHistory.$inferSelect;
export type InsertRtsInventoryHistory = z.infer<typeof insertRtsInventoryHistorySchema>;

// RTS Sales Schemas
export const insertRtsSaleSchema = createInsertSchema(rtsSales).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRtsSaleItemSchema = createInsertSchema(rtsSaleItems).omit({
  id: true,
  createdAt: true,
});

export type RtsSale = typeof rtsSales.$inferSelect;
export type InsertRtsSale = z.infer<typeof insertRtsSaleSchema>;
export type RtsSaleItem = typeof rtsSaleItems.$inferSelect;
export type InsertRtsSaleItem = z.infer<typeof insertRtsSaleItemSchema>;

// Cutting Table - Material tracking
export const cuttingMaterials = pgTable('cutting_materials', {
  id: uuid('id').defaultRandom().primaryKey(),
  materialName: text('material_name').notNull().unique(),
  materialType: text('material_type').notNull(), // Carbon Fiber, Fiberglass, Primtex, etc.
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Product Items - Reusable product items for P2 PO line items
export const p2ProductItems = pgTable('p2_product_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku').notNull(), // SKU# from the drawing
  revision: text('revision').default('A'), // Rev (x)
  description: text('description').notNull(), // Description related to the drawing
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  internalName: text('internal_name'), // Internal name for reference
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Internal Names - Track previously used internal names for autocomplete
export const p2InternalNames = pgTable('p2_internal_names', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Cutting Table - Fabric Types (persist user-defined fabric types)
export const cuttingFabricTypes = pgTable('cutting_fabric_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Production Lines
export const cuttingProductionLines = pgTable('cutting_production_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  lineName: text('line_name').notNull(), // "Production Line 1", "Production Line 2"
  lineNumber: integer('line_number').notNull(), // 1 or 2
  description: text('description'), // "Gun stock products", "Aircraft products"
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Product Categories
export const cuttingProductCategories = pgTable('cutting_product_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  productionLineId: uuid('production_line_id').references(() => cuttingProductionLines.id),
  categoryName: text('category_name').notNull(), // "Fiberglass Stock Packets", "Rudders", etc.
  displayOrder: integer('display_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Components
export const cuttingComponents = pgTable('cutting_components', {
  id: uuid('id').defaultRandom().primaryKey(),
  componentName: text('component_name').notNull(),
  materialId: uuid('material_id').references(() => cuttingMaterials.id),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id), // Link to general inventory items (part numbers)
  yieldPerCut: integer('yield_per_cut'), // How many pieces per cut (e.g., 70 buttstocks, 500 wrist)
  fabricType: text('fabric_type'), // Carbon Fiber, Fiberglass, etc.
  thickness: text('thickness'), // Thin, Thick
  wasteFactor: real('waste_factor').default(0.05), // Waste factor for calculations (e.g., 0.05 = 5%)
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Packet Compositions (what components make up each packet type)
export const cuttingPacketCompositions = pgTable('cutting_packet_compositions', {
  id: uuid('id').defaultRandom().primaryKey(),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  componentId: uuid('component_id').references(() => cuttingComponents.id), // Nullable - can link via component or direct inventory item
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id), // Direct link to inventory items
  quantityNeeded: integer('quantity_needed').notNull(), // How many of this component per packet
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Packet BOMs (defines packet recipes with materials and yields)
export const cuttingPacketBOMs = pgTable('cutting_packet_boms', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetType: text('packet_type').notNull(), // e.g., "CF_P2", "FG_P1"
  partNumber: text('part_number').notNull(), // Part number for the packet
  description: text('description'), // Description of the packet
  cutsConfig: jsonb('cuts_config'), // JSON config for cuts with assigned parts: [{materialPartNumber, materialName, cutsNeeded, assignedParts: [{partNumber, partsPerCut}]}]
  cutProgramsConfig: jsonb('cut_programs_config'), // Cut programs from Step 3: [{programName, squareMetersPerCut, assignedParts: [{partNumber, yieldPerCut}]}]
  noPlySchedule: boolean('no_ply_schedule').default(false), // Whether this BOM has no ply schedule
  plyScheduleConfig: jsonb('ply_schedule_config'), // Ply schedule from Step 4: [{plyNumber, assignedParts: [{partNumber, quantity}]}]
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id), // Link to inventory item that triggered this BOM
  squareMetersPerCut: real('square_meters_per_cut').notNull().default(0), // Square meters consumed per cut
  yieldPerCut: integer('yield_per_cut').notNull().default(4), // Number of pieces yielded per cut
  wasteFactor: real('waste_factor').notNull().default(0.05), // Waste factor percentage
  isP2: boolean('is_p2').default(false), // Whether this is a P2 packet (for label generation)
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  partNumberIdx: index('cutting_packet_boms_part_number_idx').on(table.partNumber),
  packetTypeIdx: index('cutting_packet_boms_packet_type_idx').on(table.packetType),
}));

// Cutting Table - Packet BOM Materials (materials needed for each packet BOM)
export const cuttingPacketBOMMaterials = pgTable('cutting_packet_bom_materials', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetBomId: uuid('packet_bom_id').references(() => cuttingPacketBOMs.id, { onDelete: 'cascade' }).notNull(),
  fabricType: text('fabric_type').notNull(), // Type of fabric required
  commonName: text('common_name'), // Common/nickname for the fabric
  quantityNeeded: integer('quantity_needed').notNull().default(1), // Quantity needed per packet
  rollsRequired: integer('rolls_required').notNull().default(1), // Number of rolls needed (for multi-roll packets)
  squareMetersRequired: real('square_meters_required'), // Square meters required from this material
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  packetBomIdx: index('cutting_packet_bom_materials_bom_idx').on(table.packetBomId),
}));

// Cutting Table - Packet BOM Parts (individual parts that make up a packet with their own yields)
export const cuttingPacketBOMParts = pgTable('cutting_packet_bom_parts', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetBomId: uuid('packet_bom_id').references(() => cuttingPacketBOMs.id, { onDelete: 'cascade' }).notNull(),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id), // Link to inventory item (packet part)
  partNumber: text('part_number').notNull(), // Part number for this specific piece (e.g., T501, T502)
  partDescription: text('part_description'), // Description of this part
  fabricType: text('fabric_type').notNull(), // Type of fabric used for this part
  commonName: text('common_name'), // Common/nickname for the fabric
  quantityNeeded: integer('quantity_needed').notNull().default(1), // Quantity of this part needed per packet
  cutProgramName: text('cut_program_name'), // Name of the cut program for this part
  squareMetersPerCut: real('square_meters_per_cut'), // Square meters consumed per cut
  yieldPerCut: integer('yield_per_cut').notNull().default(1), // How many of this part are produced per cut
  squareMetersPerPart: real('square_meters_per_part'), // Square meters consumed per part
  sortOrder: integer('sort_order').default(0), // Order within the packet
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  packetBomIdx: index('cutting_packet_bom_parts_bom_idx').on(table.packetBomId),
  partNumberIdx: index('cutting_packet_bom_parts_part_number_idx').on(table.partNumber),
}));

// Cutting Table - Packet BOM Cut Tracking (tracks actual cuts and yields for a packet BOM)
export const cuttingPacketBOMCuts = pgTable('cutting_packet_bom_cuts', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetBomId: uuid('packet_bom_id').references(() => cuttingPacketBOMs.id, { onDelete: 'cascade' }).notNull(),
  fabricInventoryId: uuid('fabric_inventory_id').references(() => cuttingFabricInventory.id),
  mfgQueueItemId: integer('mfg_queue_item_id'), // Link to manufacturing queue item
  cutDate: timestamp('cut_date').notNull().defaultNow(),
  squareMetersUsed: real('square_meters_used').notNull(), // Actual square meters used
  piecesYielded: integer('pieces_yielded').notNull(), // Actual pieces yielded
  rollNumber: text('roll_number'), // Roll number used for traceability
  lotNumber: text('lot_number'), // Lot number for traceability
  operatorName: text('operator_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  packetBomIdx: index('cutting_packet_bom_cuts_bom_idx').on(table.packetBomId),
  dateIdx: index('cutting_packet_bom_cuts_date_idx').on(table.cutDate),
}));

// Cutting Table - Weekly Production Data
export const cuttingWeeklyData = pgTable('cutting_weekly_data', {
  id: uuid('id').defaultRandom().primaryKey(),
  weekDate: date('week_date').notNull(), // Monday of the week
  productionLineId: uuid('production_line_id').references(() => cuttingProductionLines.id),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  quantity: integer('quantity').notNull(), // Number of product packets/units needed
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Daily Cut Progress
export const cuttingCutProgress = pgTable('cutting_cut_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  weekDate: date('week_date').notNull(), // Monday of the week
  workDate: date('work_date').notNull(), // Actual work day (Mon-Thu)
  materialId: uuid('material_id').references(() => cuttingMaterials.id),
  productionLineId: uuid('production_line_id').references(() => cuttingProductionLines.id),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  componentId: uuid('component_id').references(() => cuttingComponents.id),
  cutsCompleted: integer('cuts_completed').default(0),
  cutsRequired: integer('cuts_required').notNull(),
  isCompleted: boolean('is_completed').default(false),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Fabric Inventory
export const cuttingFabricInventory = pgTable('cutting_fabric_inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  materialId: uuid('material_id').references(() => cuttingMaterials.id),
  productionLineId: uuid('production_line_id').references(() => cuttingProductionLines.id),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id),
  source: text('source'), // Fabric source/manufacturer
  fabric: text('fabric'), // Fabric type/description
  fabricPartNumber: text('fabric_part_number'), // Part number for the fabric type
  nickname: text('nickname'), // In-house nickname for the fabric
  supplierPartNumber: text('supplier_part_number'), // Supplier's part number
  supplierPoNumber: text('supplier_po_number'), // Supplier's purchase order number
  manufacturerPoNumber: text('manufacturer_po_number'), // Manufacturer's PO/reference number
  internalControlNumber: text('internal_control_number'), // Internal control number
  lotNumber: text('lot_number'), // Lot number for traceability
  batchNumber: text('batch_number'), // Batch number
  rollNumber: text('roll_number'), // Roll number
  manufactureDate: date('manufacture_date'),
  receivedDate: date('received_date'),
  expirationDate: date('expiration_date'),
  location: text('location'), // Storage location/freezer #
  freezerNumber: integer('freezer_number'), // Freezer assignment number (1-5)
  conformanceDocumentLink: text('conformance_document_link'), // Link to conformance/traceability paperwork
  quantityInStock: real('quantity_in_stock').notNull().default(0),
  squareMeters: numeric('square_meters', { precision: 10, scale: 2 }), // Total square meters of fabric
  lowStockThreshold: integer('low_stock_threshold').default(10),
  barcode: text('barcode'), // Auto-generated for P2 items
  notes: text('notes'),
  status: text('status').default('active'), // active, depleted - for traceability
  depletedAt: timestamp('depleted_at'), // When the roll was marked as depleted
  depletedBy: text('depleted_by'), // Who marked it as depleted
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  expirationIdx: index('cutting_fabric_inventory_expiration_idx').on(table.expirationDate),
  statusIdx: index('cutting_fabric_inventory_status_idx').on(table.status),
}));

// Cutting Table - Packet Sessions (tracks when packets are built)
export const cuttingPacketSessions = pgTable('cutting_packet_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id).notNull(),
  weekDate: date('week_date'), // Week this session is associated with
  workDate: date('work_date'), // Actual work date
  packetsTarget: integer('packets_target').notNull(), // How many packets being built
  createdBy: text('created_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Packet Session Lots (tracks which inventory lots were used for a packet session)
export const cuttingPacketSessionLots = pgTable('cutting_packet_session_lots', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => cuttingPacketSessions.id, { onDelete: 'cascade' }).notNull(),
  componentId: uuid('component_id').references(() => cuttingComponents.id).notNull(),
  fabricInventoryId: uuid('fabric_inventory_id').references(() => cuttingFabricInventory.id).notNull(),
  cutsPlanned: integer('cuts_planned').notNull(), // How many cuts planned from this lot
  quantityUsed: integer('quantity_used').notNull(), // Quantity consumed from this lot
  wasteFactorApplied: real('waste_factor_applied').default(0.05), // Waste factor used in calculation
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Fabric Inventory Transactions (audit trail for all inventory changes)
export const cuttingFabricInventoryTransactions = pgTable('cutting_fabric_inventory_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fabricInventoryId: uuid('fabric_inventory_id').references(() => cuttingFabricInventory.id).notNull(),
  sessionLotId: uuid('session_lot_id').references(() => cuttingPacketSessionLots.id),
  changeType: text('change_type').notNull(), // 'RECEIPT', 'ISSUE', 'ADJUSTMENT'
  quantityDelta: integer('quantity_delta').notNull(), // Positive for receipts, negative for issues
  notes: text('notes'),
  performedBy: text('performed_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting Table - Cut Records (track actual yields and fabric usage per cut)
export const cuttingCutRecords = pgTable('cutting_cut_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  workDate: text('work_date').notNull(), // Date of the cut
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id), // Optional - either this or partNumber should be set
  piecesYielded: integer('pieces_yielded').notNull(), // Actual pieces produced from the cut
  fabricSquareMetersUsed: numeric('fabric_square_meters_used', { precision: 10, scale: 2 }).notNull(), // Square meters of fabric used
  fabricType: text('fabric_type'), // Type of fabric used (Carbon Fiber, Fiberglass, etc.)
  partNumber: text('part_number'), // AG part number being cut
  itemDescription: text('item_description'), // Description of the item being cut
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  workDateIdx: index('cutting_cut_records_work_date_idx').on(table.workDate),
  productCategoryIdx: index('cutting_cut_records_category_idx').on(table.productCategoryId),
}));

// Cutting Table - Built Packets (individual packets with full traceability)
export const cuttingBuiltPackets = pgTable('cutting_built_packets', {
  id: serial('id').primaryKey(),
  sessionId: uuid('session_id'),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id).notNull(),
  barcode: text('barcode').notNull().unique(),
  packetNumber: integer('packet_number').notNull(),
  buildDate: timestamp('build_date').notNull().defaultNow(),
  status: text('status').notNull().default('AVAILABLE'),
  allocatedToOrder: text('allocated_to_order'),
  consumedAt: timestamp('consumed_at'),
  consumedBy: text('consumed_by'),
  isMixedFabric: boolean('is_mixed_fabric').default(false),
  fabricSourceCount: integer('fabric_source_count').default(1),
  // Routing-step intent (Task #144). A packet built for "Layup" is pinned
  // to the Layup routing step on its destination traveler; consume calls
  // against any other step are rejected as WRONG_ROUTING_STEP.
  intendedRoutingStepId: varchar('intended_routing_step_id', { length: 255 }),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  barcodeIdx: index('cutting_built_packets_barcode_idx').on(table.barcode),
  statusIdx: index('cutting_built_packets_status_idx').on(table.status),
  sessionIdx: index('cutting_built_packets_session_idx').on(table.sessionId),
  intendedStepIdx: index('cutting_built_packets_intended_step_idx').on(table.intendedRoutingStepId),
}));

// Cutting Table - Built Packet Fabric Sources (for mixed fabric traceability)
export const cuttingBuiltPacketFabricSources = pgTable('cutting_built_packet_fabric_sources', {
  id: serial('id').primaryKey(),
  builtPacketId: integer('built_packet_id')
    .references(() => cuttingBuiltPackets.id, { onDelete: 'cascade' })
    .notNull(),
  fabricInventoryId: uuid('fabric_inventory_id')
    .references(() => cuttingFabricInventory.id),
  componentId: uuid('component_id'),
  fabricType: text('fabric_type'),
  lotNumber: text('lot_number'),
  batchNumber: text('batch_number'),
  rollNumber: text('roll_number'),
  supplierPartNumber: text('supplier_part_number'),
  internalControlNumber: text('internal_control_number'),
  expirationDate: date('expiration_date'),
  quantityUsed: integer('quantity_used').notNull().default(1),
  isPrimary: boolean('is_primary').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  packetIdx: index('cutting_built_packet_sources_packet_idx').on(table.builtPacketId),
  inventoryIdx: index('cutting_built_packet_sources_inventory_idx').on(table.fabricInventoryId),
}));

// Manufacturing Queue - Track items that need to be manufactured by department
export const manufacturingQueue = pgTable('manufacturing_queue', {
  id: serial('id').primaryKey(),
  inventoryItemId: integer('inventory_item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' })
    .notNull(),
  vendorPoId: integer('vendor_po_id'), // Reference to vendor PO that generated this queue entry
  vendorPoLineNumber: integer('vendor_po_line_number'), // Line number in the PO (legacy — use vendorPoItemId for new lookups)
  vendorPoItemId: integer('vendor_po_item_id').references(() => vendorPOItems.id, { onDelete: 'cascade' }), // FK to vendor_po_items.id (nullable — backfilled from line number)
  p2PoId: integer('p2_po_id'), // Reference to P2 PO that generated this queue entry
  p2PoItemId: integer('p2_po_item_id'), // Reference to P2 PO item
  // BOM explosion lineage — set when this record is created by explodeBomDemand
  parentProductionOrderId: text('parent_production_order_id'), // Production order that triggered this demand (FK to production_orders.order_id)
  department: text('department').notNull(), // Derived from manufactured category routing
  quantityRequested: integer('quantity_requested').notNull().default(1),
  quantityCompleted: integer('quantity_completed').default(0),
  priority: integer('priority').default(50), // 1-100, lower = higher priority
  status: text('status').notNull().default('PENDING'), // PENDING, IN_PROGRESS, COMPLETED, CANCELLED, RELEASED
  releasedAt: timestamp('released_at'),
  dueDate: timestamp('due_date'),
  requestedBy: text('requested_by'),
  assignedTo: text('assigned_to'),
  notes: text('notes'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  // Traceability fields for materials used in manufacturing
  fabricLot: text('fabric_lot'), // Fabric lot number for traceability
  fabricBatch: text('fabric_batch'), // Fabric batch number
  fabricRoll: text('fabric_roll'), // Fabric roll number
  materialDetails: text('material_details'), // Additional material information (type, supplier, etc.)
  completionNotes: text('completion_notes'), // Operator notes when completing the item
  completedBy: text('completed_by'), // Username of operator who completed the item
  sourceId: text('source_id'), // Source identifier (e.g. PO number, order ID) that generated this entry
  sourceType: text('source_type'), // Source type (e.g. 'vendor_po', 'production_order', 'manual')
  // Readiness tracking fields (added for queue readiness engine)
  queueType: text('queue_type'), // CUTTING_TABLE | KIT | CNC | CORE | SUB_ASSEMBLY | ASSEMBLY | FINAL_ASSEMBLY | LAYUP
  readinessStatus: text('readiness_status').default('NOT_READY'), // NOT_READY | PARTIAL | READY | BLOCKED
  percentReady: numeric('percent_ready').default('0'),
  blockedReason: text('blocked_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  departmentStatusIdx: index('manufacturing_queue_department_status_idx').on(table.department, table.status),
  dueDateIdx: index('manufacturing_queue_due_date_idx').on(table.dueDate),
  vendorPoIdx: index('manufacturing_queue_vendor_po_idx').on(table.vendorPoId, table.vendorPoLineNumber),
  p2PoIdx: index('manufacturing_queue_p2_po_idx').on(table.p2PoId, table.p2PoItemId),
}));

// Cutting Table Insert Schemas
export const insertCuttingMaterialSchema = createInsertSchema(cuttingMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertP2ProductItemSchema = createInsertSchema(p2ProductItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertP2InternalNameSchema = createInsertSchema(p2InternalNames).omit({
  id: true,
  createdAt: true,
});

export const insertCuttingFabricTypeSchema = createInsertSchema(cuttingFabricTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingProductionLineSchema = createInsertSchema(cuttingProductionLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingProductCategorySchema = createInsertSchema(cuttingProductCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingComponentSchema = createInsertSchema(cuttingComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingWeeklyDataSchema = createInsertSchema(cuttingWeeklyData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingCutProgressSchema = createInsertSchema(cuttingCutProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingFabricInventorySchema = createInsertSchema(cuttingFabricInventory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketCompositionSchema = createInsertSchema(cuttingPacketCompositions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketBOMSchema = createInsertSchema(cuttingPacketBOMs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketBOMMaterialSchema = createInsertSchema(cuttingPacketBOMMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketBOMPartSchema = createInsertSchema(cuttingPacketBOMParts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketBOMCutSchema = createInsertSchema(cuttingPacketBOMCuts).omit({
  id: true,
  createdAt: true,
});

export const insertCuttingPacketSessionSchema = createInsertSchema(cuttingPacketSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingPacketSessionLotSchema = createInsertSchema(cuttingPacketSessionLots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingCutRecordSchema = createInsertSchema(cuttingCutRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => data.productCategoryId !== null || data.partNumber !== null,
  { message: 'Either productCategoryId or partNumber must be provided' }
);

export const insertCuttingFabricInventoryTransactionSchema = createInsertSchema(cuttingFabricInventoryTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingBuiltPacketSchema = createInsertSchema(cuttingBuiltPackets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCuttingBuiltPacketFabricSourceSchema = createInsertSchema(cuttingBuiltPacketFabricSources).omit({
  id: true,
  createdAt: true,
});

export const insertManufacturingQueueSchema = createInsertSchema(manufacturingQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Cutting Packet Barcode Aliases — preserves the link between previously-printed
// MFG-{id}-… barcodes and the surviving manufacturing_queue row after the original
// row is consolidated by the duplicate-grouping backfill, deleted via the
// unschedule endpoint, or replaced by a fresh sync. This lets scan-start keep
// resolving old labels without forcing a reprint every time the queue churns.
export const cuttingPacketBarcodeAliases = pgTable('cutting_packet_barcode_aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  // The queue id that was baked into the printed barcode (now missing or merged).
  originalQueueId: integer('original_queue_id').notNull().unique(),
  // The surviving queue id that should answer this barcode, or NULL if there is
  // currently no successor (e.g. the row was unscheduled and never replaced).
  successorQueueId: integer('successor_queue_id'),
  // Identity captured from the deleted/merged row so a future
  // upsertGroupedCuttingQueueEntry can backfill the successor on the same packet.
  inventoryItemId: integer('inventory_item_id'),
  packetName: text('packet_name'),
  // 'YYYY-MM-DD' (UTC date-of) or 'null' — same bucket key used by the grouping helper.
  dueDateBucket: text('due_date_bucket'),
  reason: text('reason').notNull(), // 'merged' | 'unscheduled' | 'replaced' | 'historical'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  successorIdx: index('cutting_packet_barcode_aliases_successor_idx').on(table.successorQueueId),
  packetIdx: index('cutting_packet_barcode_aliases_packet_idx').on(table.inventoryItemId, table.dueDateBucket),
}));

export const insertCuttingPacketBarcodeAliasSchema = createInsertSchema(cuttingPacketBarcodeAliases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CuttingPacketBarcodeAlias = typeof cuttingPacketBarcodeAliases.$inferSelect;
export type InsertCuttingPacketBarcodeAlias = z.infer<typeof insertCuttingPacketBarcodeAliasSchema>;

// Cutting Table Types
export type CuttingMaterial = typeof cuttingMaterials.$inferSelect;
export type InsertCuttingMaterial = z.infer<typeof insertCuttingMaterialSchema>;

export type P2ProductItem = typeof p2ProductItems.$inferSelect;
export type InsertP2ProductItem = z.infer<typeof insertP2ProductItemSchema>;

export type P2InternalName = typeof p2InternalNames.$inferSelect;
export type InsertP2InternalName = z.infer<typeof insertP2InternalNameSchema>;

export type CuttingFabricType = typeof cuttingFabricTypes.$inferSelect;
export type InsertCuttingFabricType = z.infer<typeof insertCuttingFabricTypeSchema>;

export type CuttingProductionLine = typeof cuttingProductionLines.$inferSelect;
export type InsertCuttingProductionLine = z.infer<typeof insertCuttingProductionLineSchema>;

export type CuttingProductCategory = typeof cuttingProductCategories.$inferSelect;
export type InsertCuttingProductCategory = z.infer<typeof insertCuttingProductCategorySchema>;

export type CuttingComponent = typeof cuttingComponents.$inferSelect;
export type InsertCuttingComponent = z.infer<typeof insertCuttingComponentSchema>;

export type CuttingWeeklyData = typeof cuttingWeeklyData.$inferSelect;
export type InsertCuttingWeeklyData = z.infer<typeof insertCuttingWeeklyDataSchema>;

export type CuttingCutProgress = typeof cuttingCutProgress.$inferSelect;
export type InsertCuttingCutProgress = z.infer<typeof insertCuttingCutProgressSchema>;

export type CuttingFabricInventory = typeof cuttingFabricInventory.$inferSelect;
export type InsertCuttingFabricInventory = z.infer<typeof insertCuttingFabricInventorySchema>;

export type CuttingPacketComposition = typeof cuttingPacketCompositions.$inferSelect;
export type InsertCuttingPacketComposition = z.infer<typeof insertCuttingPacketCompositionSchema>;

export type CuttingPacketBOM = typeof cuttingPacketBOMs.$inferSelect;
export type InsertCuttingPacketBOM = z.infer<typeof insertCuttingPacketBOMSchema>;

export type CuttingPacketBOMMaterial = typeof cuttingPacketBOMMaterials.$inferSelect;
export type InsertCuttingPacketBOMMaterial = z.infer<typeof insertCuttingPacketBOMMaterialSchema>;

export type CuttingPacketBOMPart = typeof cuttingPacketBOMParts.$inferSelect;
export type InsertCuttingPacketBOMPart = z.infer<typeof insertCuttingPacketBOMPartSchema>;

export type CuttingPacketBOMCut = typeof cuttingPacketBOMCuts.$inferSelect;
export type InsertCuttingPacketBOMCut = z.infer<typeof insertCuttingPacketBOMCutSchema>;

export type CuttingPacketSession = typeof cuttingPacketSessions.$inferSelect;
export type InsertCuttingPacketSession = z.infer<typeof insertCuttingPacketSessionSchema>;

export type CuttingPacketSessionLot = typeof cuttingPacketSessionLots.$inferSelect;
export type InsertCuttingPacketSessionLot = z.infer<typeof insertCuttingPacketSessionLotSchema>;

export type CuttingFabricInventoryTransaction = typeof cuttingFabricInventoryTransactions.$inferSelect;
export type InsertCuttingFabricInventoryTransaction = z.infer<typeof insertCuttingFabricInventoryTransactionSchema>;

export type CuttingBuiltPacket = typeof cuttingBuiltPackets.$inferSelect;
export type InsertCuttingBuiltPacket = z.infer<typeof insertCuttingBuiltPacketSchema>;

export type CuttingBuiltPacketFabricSource = typeof cuttingBuiltPacketFabricSources.$inferSelect;
export type InsertCuttingBuiltPacketFabricSource = z.infer<typeof insertCuttingBuiltPacketFabricSourceSchema>;

// ============================================================================
// CUTTING DOCUMENTS - Reference files for cutting operators (ply charts, work instructions, etc.)
// ============================================================================
export const cuttingDocuments = pgTable('cutting_documents', {
  id: serial('id').primaryKey(),
  displayName: text('display_name').notNull(),
  fileUrl: text('file_url').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  fileSize: integer('file_size').notNull().default(0),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export const insertCuttingDocumentSchema = createInsertSchema(cuttingDocuments).omit({
  id: true,
  uploadedAt: true,
});
export type InsertCuttingDocument = z.infer<typeof insertCuttingDocumentSchema>;
export type CuttingDocument = typeof cuttingDocuments.$inferSelect;

export type ManufacturingQueue = typeof manufacturingQueue.$inferSelect;
export type InsertManufacturingQueue = z.infer<typeof insertManufacturingQueueSchema>;

// ============================================================================
// ALLOCATION REQUIREMENTS - Per-queue-item material allocation tracking
// ============================================================================
export const allocationRequirements = pgTable('allocation_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),

  manufacturingQueueId: integer('manufacturing_queue_id')
    .notNull()
    .references(() => manufacturingQueue.id, { onDelete: 'cascade' }),

  requiredItemId: integer('required_item_id')
    .references(() => inventoryItems.id, { onDelete: 'set null' }),

  requiredPartNumber: text('required_part_number').notNull(),
  requiredPartName: text('required_part_name'),

  requirementType: text('requirement_type').notNull(),
  // MATERIAL | COMPONENT | KIT_ITEM | SUBASSEMBLY | CONSUMABLE

  unitOfMeasure: text('unit_of_measure').notNull().default('EA'),

  requiredQty: numeric('required_qty').notNull(),
  allocatedQty: numeric('allocated_qty').default('0'),
  stagedQty: numeric('staged_qty').default('0'),
  consumedQty: numeric('consumed_qty').default('0'),

  allocationStatus: text('allocation_status').default('OPEN'),
  // OPEN | PARTIAL | ALLOCATED | STAGED | CONSUMED | CANCELLED

  isCritical: boolean('is_critical').default(true),

  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id, { onDelete: 'set null' }),
  materialLotReservationId: integer('material_lot_reservation_id')
    .references(() => materialLotReservations.id, { onDelete: 'set null' }),
  internalControlNumber: text('internal_control_number'),

  routingDependencyId: integer('routing_dependency_id')
    .references(() => routingDependencies.id, { onDelete: 'set null' }),
  sourceType: text('source_type').default('manual'),
  // 'routing_dependency' | 'bom_explosion' | 'manual'

  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  queueIdIdx: index('allocation_requirements_queue_id_idx').on(table.manufacturingQueueId),
  statusIdx: index('allocation_requirements_status_idx').on(table.allocationStatus),
  lotIdIdx: index('allocation_requirements_lot_id_idx').on(table.materialLotId),
}));

export const insertAllocationRequirementSchema = createInsertSchema(allocationRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AllocationRequirement = typeof allocationRequirements.$inferSelect;
export type InsertAllocationRequirement = z.infer<typeof insertAllocationRequirementSchema>;

// mapQueueType — compatibility wrapper around the canonical manufactured category routing map.
export type QueueType = import('../shared/utils/manufacturingRouting').ManufacturingQueueType;

export function mapQueueType(category: import('../shared/utils/supplySourceDashboard').ManufacturedCategory | null): { queueType: QueueType; department: string } | null {
  const route = resolveManufacturingRouteDefinition(category);
  if (!route?.queueType || !route.department) return null;
  return { queueType: route.queueType, department: route.department };
}

// Controlled Documents - Master Document Register
export const controlledDocuments = pgTable('controlled_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateKey: text('template_key'),
  documentNumber: text('document_number').notNull(), // e.g., DOC-001
  documentName: text('document_name').notNull(),
  documentType: text('document_type').notNull(), // SOP, Work Instruction, Form, etc.
  department: text('department').notNull(), // P1, P2, Quality, etc.
  category: text('category'), // Optional additional categorization
  description: text('description'),
  currentVersion: text('current_version').notNull().default('1.0'), // Major.Minor format
  versionDate: date('version_date'),
  originationDate: date('origination_date'),
  status: text('status').notNull().default('draft'), // draft, pending, approved, expired
  effectiveDate: date('effective_date'),
  expirationDate: date('expiration_date'),
  retentionLength: text('retention_length'), // Optional: e.g., "7 years", "permanent"
  documentOwner: text('document_owner'), // Employee responsible
  filePath: text('file_path'), // Path to current version file
  // CMMC Classification: visibility level for access control enforcement
  classification: text('classification').notNull().default('internal'), // public | internal | restricted | classified
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  customerId: text('customer_id'),
  contractArtifactType: text('contract_artifact_type'),
  accessRule: text('access_rule').notNull().default('authenticated'), // authenticated | explicit_grant | admin_only
  mfaRequired: boolean('mfa_required').notNull().default(false),
  downloadTrackingRequired: boolean('download_tracking_required').notNull().default(true),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Document Version History
export const documentVersionHistory = pgTable('document_version_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => controlledDocuments.id).notNull(),
  versionNumber: text('version_number').notNull(), // e.g., "1.0", "1.1", "2.0"
  changeDescription: text('change_description'),
  changeType: text('change_type'), // major, minor
  filePath: text('file_path'), // Path to version file
  status: text('status').notNull(), // draft, pending, approved
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  effectiveDate: date('effective_date'),
  expirationDate: date('expiration_date'),
});

// Insert Schemas
export const insertControlledDocumentSchema = createInsertSchema(controlledDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentVersionHistorySchema = createInsertSchema(documentVersionHistory).omit({
  id: true,
  createdAt: true,
});

// Types
export type ControlledDocument = typeof controlledDocuments.$inferSelect;
export type InsertControlledDocument = z.infer<typeof insertControlledDocumentSchema>;

export type DocumentVersionHistory = typeof documentVersionHistory.$inferSelect;
export type InsertDocumentVersionHistory = z.infer<typeof insertDocumentVersionHistorySchema>;

// ============================================================================
// OBJECT ACCESS LOG — CMMC Secure Vault
// Immutable append-only log of every view, download, and denied access event
// for controlled or sensitive documents. Required for CMMC access audit trail.
// ============================================================================
export const objectAccessLog = pgTable('object_access_log', {
  id: serial('id').primaryKey(),
  documentId: uuid('document_id').references(() => controlledDocuments.id),
  vaultDocumentId: integer('vault_document_id'),
  userId: text('user_id').notNull(), // username of the actor
  action: text('action').notNull(), // 'view' | 'download' | 'denied' | 'link_issued'
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceFingerprint: text('device_fingerprint'),
  linkExpiresAt: timestamp('link_expires_at'),
  sessionId: integer('session_id'),
  accessedAt: timestamp('accessed_at').defaultNow().notNull(),
}, (table) => ({
  documentIdIdx: index('object_access_log_document_id_idx').on(table.documentId),
  vaultDocumentIdIdx: index('object_access_log_vault_document_id_idx').on(table.vaultDocumentId),
  userIdIdx: index('object_access_log_user_id_idx').on(table.userId),
  accessedAtIdx: index('object_access_log_accessed_at_idx').on(table.accessedAt),
  actionIdx: index('object_access_log_action_idx').on(table.action),
}));

export const insertObjectAccessLogSchema = createInsertSchema(objectAccessLog).omit({
  id: true,
  accessedAt: true,
});
export type InsertObjectAccessLog = z.infer<typeof insertObjectAccessLogSchema>;
export type ObjectAccessLog = typeof objectAccessLog.$inferSelect;


// Invoice Number Tracking - Sequential invoice numbers per customer per year
export const invoiceNumbers = pgTable('invoice_numbers', {
  id: serial('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  customerCode: text('customer_code').notNull(), // RH, PP, etc.
  year: integer('year').notNull(), // 2025, 2026, etc.
  lastNumber: integer('last_number').notNull().default(199), // Starts at 199, first will be 200
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schema
export const insertInvoiceNumberSchema = createInsertSchema(invoiceNumbers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InvoiceNumber = typeof invoiceNumbers.$inferSelect;
export type InsertInvoiceNumber = z.infer<typeof insertInvoiceNumberSchema>;

// PDFME SYSTEM COMMENTED OUT - NOT IN USE - Table replaced with new pdf_templates design below

// Quotes - Customer quotes for P2 business (stub for future implementation)
export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteNumber: text('quote_number').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  description: text('description'),
  totalAmount: real('total_amount').notNull().default(0),
  status: text('status').notNull().default('DRAFT'), // DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
  projectId: uuid('project_id'), // Set when quote is accepted and a project is created
  validUntil: timestamp('valid_until'),
  quotedBy: text('quoted_by'),
  notes: text('notes'),
  attachments: text('attachments').array(), // PDF file paths
  securityClassification: text('security_classification').notNull().default('internal'), // public | internal | cui | itar
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  customerFileAccessRule: text('customer_file_access_rule').notNull().default('authenticated'),
  // Bridge column: integer FK to customers.id for joining back to the master customers table.
  // Populated on insert from the resolved customers record matching the text customer_id,
  // or copied directly from the parent RFQ when a quote is created from an estimating RFQ.
  customersIntegerId: integer('customers_integer_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schema
export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

// Quote Line Items - Individual line items for quotes
export const quoteLineItems = pgTable('quote_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  quantity: real('quantity').notNull().default(1),
  description: text('description').notNull(),
  unitPrice: real('unit_price').notNull().default(0),
  totalPrice: real('total_price').notNull().default(0),
  inventoryItemId: integer('inventory_item_id'), // Optional reference to inventory item
  agPartNumber: text('ag_part_number'), // Captured for reference
  laborHours: real('labor_hours'), // Estimated labor hours for this line item (used to seed WAD totalBudgetHours)
  department: text('department'), // Department responsible (used to seed WAD departmentBudgets)
  createdAt: timestamp('created_at').defaultNow(),
});

// Insert Schema
export const insertQuoteLineItemSchema = createInsertSchema(quoteLineItems).omit({
  id: true,
  createdAt: true,
});

// Types
export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type InsertQuoteLineItem = z.infer<typeof insertQuoteLineItemSchema>;

// Quote Snapshots - Immutable contractual quote revisions captured when a quote is sent.
export const quoteSnapshots = pgTable('quote_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'restrict' }),
  quoteNumber: text('quote_number').notNull(),
  revisionNumber: integer('revision_number').notNull(),
  revisionLabel: text('revision_label').notNull(),
  statusAtSnapshot: text('status_at_snapshot').notNull().default('SENT'),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  customersIntegerId: integer('customers_integer_id'),
  description: text('description'),
  totalAmount: real('total_amount').notNull().default(0),
  validUntil: timestamp('valid_until'),
  quotedBy: text('quoted_by'),
  notes: text('notes'),
  bomAssumptions: jsonb('bom_assumptions').$type<Record<string, unknown> | unknown[] | null>(),
  laborAssumptions: jsonb('labor_assumptions').$type<Record<string, unknown> | unknown[] | null>(),
  leadTimes: jsonb('lead_times').$type<Record<string, unknown> | unknown[] | null>(),
  exclusions: jsonb('exclusions').$type<Record<string, unknown> | unknown[] | null>(),
  certRequirements: jsonb('cert_requirements').$type<Record<string, unknown> | unknown[] | null>(),
  contractualClauses: jsonb('contractual_clauses').$type<Record<string, unknown> | unknown[] | null>(),
  sourceData: jsonb('source_data').$type<Record<string, unknown> | null>(),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  quoteRevisionUnique: uniqueIndex('quote_snapshots_quote_revision_unique').on(table.quoteId, table.revisionNumber),
  quoteIdIdx: index('quote_snapshots_quote_id_idx').on(table.quoteId),
}));

export const insertQuoteSnapshotSchema = createInsertSchema(quoteSnapshots).omit({
  id: true,
  createdAt: true,
});

export type QuoteSnapshot = typeof quoteSnapshots.$inferSelect;
export type InsertQuoteSnapshot = z.infer<typeof insertQuoteSnapshotSchema>;

export const quoteLineSnapshots = pgTable('quote_line_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteSnapshotId: uuid('quote_snapshot_id').notNull().references(() => quoteSnapshots.id, { onDelete: 'restrict' }),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'restrict' }),
  quoteLineItemId: uuid('quote_line_item_id').references(() => quoteLineItems.id, { onDelete: 'set null' }),
  lineNumber: integer('line_number').notNull(),
  quantity: real('quantity').notNull().default(1),
  description: text('description').notNull(),
  unitPrice: real('unit_price').notNull().default(0),
  totalPrice: real('total_price').notNull().default(0),
  inventoryItemId: integer('inventory_item_id'),
  agPartNumber: text('ag_part_number'),
  lineRevision: text('line_revision'),
  laborHours: real('labor_hours'),
  department: text('department'),
  bomAssumptions: jsonb('bom_assumptions').$type<Record<string, unknown> | unknown[] | null>(),
  laborAssumptions: jsonb('labor_assumptions').$type<Record<string, unknown> | unknown[] | null>(),
  leadTimeDays: integer('lead_time_days'),
  certRequirements: jsonb('cert_requirements').$type<Record<string, unknown> | unknown[] | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  snapshotIdx: index('quote_line_snapshots_snapshot_id_idx').on(table.quoteSnapshotId),
  quoteIdIdx: index('quote_line_snapshots_quote_id_idx').on(table.quoteId),
}));

export const insertQuoteLineSnapshotSchema = createInsertSchema(quoteLineSnapshots).omit({
  id: true,
  createdAt: true,
});

export type QuoteLineSnapshot = typeof quoteLineSnapshots.$inferSelect;
export type InsertQuoteLineSnapshot = z.infer<typeof insertQuoteLineSnapshotSchema>;

export const quotePoReconciliations = pgTable('quote_po_reconciliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'restrict' }),
  quoteSnapshotId: uuid('quote_snapshot_id').references(() => quoteSnapshots.id, { onDelete: 'restrict' }),
  p2PurchaseOrderId: integer('p2_purchase_order_id').notNull().references(() => p2PurchaseOrders.id, { onDelete: 'cascade' }),
  poNumber: text('po_number').notNull(),
  status: text('status').notNull().default('MATCH'),
  revisionMismatch: boolean('revision_mismatch').notNull().default(false),
  pricingMismatch: boolean('pricing_mismatch').notNull().default(false),
  clauseMismatch: boolean('clause_mismatch').notNull().default(false),
  scheduleMismatch: boolean('schedule_mismatch').notNull().default(false),
  quantityMismatch: boolean('quantity_mismatch').notNull().default(false),
  mismatchSummary: jsonb('mismatch_summary').$type<Record<string, unknown> | null>(),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  poIdx: index('quote_po_reconciliations_po_id_idx').on(table.p2PurchaseOrderId),
  quoteIdx: index('quote_po_reconciliations_quote_id_idx').on(table.quoteId),
}));

export const insertQuotePoReconciliationSchema = createInsertSchema(quotePoReconciliations).omit({
  id: true,
  createdAt: true,
});

export type QuotePoReconciliation = typeof quotePoReconciliations.$inferSelect;
export type InsertQuotePoReconciliation = z.infer<typeof insertQuotePoReconciliationSchema>;

// Cost Centers - Track business units, departments, and projects for expense allocation
export const costCenters = pgTable('cost_centers', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull(), // Short identifier (e.g., LAYUP, ADMIN)
  name: text('name').notNull(), // Full name (e.g., Layup Department)
  type: text('type').notNull(), // DEPARTMENT, PROJECT, OVERHEAD, ADMINISTRATIVE, FRINGE
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE
  annualBudget: real('annual_budget'), // Optional annual budget
  monthlyBudget: real('monthly_budget'), // Optional monthly budget
  managerId: integer('manager_id').references(() => employees.id), // Employee responsible
  description: text('description'), // Notes about this cost center
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schema
export const insertCostCenterSchema = createInsertSchema(costCenters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  code: z.string().min(1, 'Code is required').max(20, 'Code must be 20 characters or less'),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['DEPARTMENT', 'PROJECT', 'OVERHEAD', 'ADMINISTRATIVE', 'FRINGE']),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  annualBudget: z.number().positive().optional().nullable(),
  monthlyBudget: z.number().positive().optional().nullable(),
  managerId: z.number().positive().optional().nullable(),
  description: z.string().optional().nullable(),
});

// Types
export type CostCenter = typeof costCenters.$inferSelect;
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;

// Purchase Review Checklist Submissions
export const purchaseReviewChecklistSubmissions = pgTable('purchase_review_checklist_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // References
  customerId: text('customer_id'),
  quoteId: text('quote_id'),
  
  // Section A - Customer Information
  existingCustomer: text('existing_customer'),
  significantChanges: text('significant_changes'),
  companyName: text('company_name'),
  address: text('address'),
  contractingOfficer: text('contracting_officer'),
  phone: text('phone'),
  email: text('email'),
  ffl: text('ffl'),
  fflCopyOnHand: text('ffl_copy_on_hand'),
  creditCheckAuth: text('credit_check_auth'),
  creditApproval: text('credit_approval'),
  poNumber: text('po_number'),
  contractNumber: text('contract_number'),
  invoiceRemittance: text('invoice_remittance'),
  paymentTerms: text('payment_terms'),
  earlyPayDiscount: text('early_pay_discount'),
  paymentMethod: text('payment_method'),
  paymentMethodOther: text('payment_method_other'),
  
  // Section B - Service/Product Requested and Prices
  outsideServices: text('outside_services'),
  quantityRequested: text('quantity_requested'),
  unitOfMeasure: text('unit_of_measure'),
  unitPrice: text('unit_price'),
  toolingPrice: text('tooling_price'),
  additionalItems: text('additional_items'),
  additionalCost: text('additional_cost'),
  amount: text('amount'),
  disbursementSchedule: text('disbursement_schedule'),
  
  // Level 1 Assembly
  level1ItemNumber: text('level1_item_number'),
  level1PartsKits: text('level1_parts_kits'),
  level1Exhibits: text('level1_exhibits'),
  
  // Level 2 CNC
  level2ItemNumber: text('level2_item_number'),
  level2PartsKits: text('level2_parts_kits'),
  level2Programming: text('level2_programming'),
  
  // Level 3 Manufacturing
  level3ItemNumber: text('level3_item_number'),
  level3PartsKits: text('level3_parts_kits'),
  level3Exhibits: text('level3_exhibits'),
  
  // Section C - Description/Specifications
  criticalSafetyItems: text('critical_safety_items'),
  qualityRequirements: text('quality_requirements'),
  acceptanceRejectionCriteria: text('acceptance_rejection_criteria'),
  verificationOperations: text('verification_operations'),
  verificationRequirements: text('verification_requirements'),
  verificationSequence: text('verification_sequence'),
  measurementResults: text('measurement_results'),
  measurementEquipment: text('measurement_equipment'),
  specialInstructions: text('special_instructions'),
  materialSourcing: text('material_sourcing'),
  optionalDesignElements: text('optional_design_elements'),
  tolerancesProvided: text('tolerances_provided'),
  
  // Section D - Inspection and Acceptance
  firstArticleQuantity: text('first_article_quantity'),
  firstArticleDueDate: text('first_article_due_date'),
  inspectionLocation: text('inspection_location'),
  acceptanceTimeframe: text('acceptance_timeframe'),
  
  // Section E - Shipping
  specialPackaging: text('special_packaging'),
  specialMarking: text('special_marking'),
  fobType: text('fob_type'),
  shippingCompany: text('shipping_company'),
  clientAccountNumber: text('client_account_number'),
  shippingType: text('shipping_type'),
  deliverySchedule: text('delivery_schedule'),
  shipToInformation: text('ship_to_information'),
  
  // Section F - Special Contract Requirements
  certifications: text('certifications').array(),
  retentionRequirements: text('retention_requirements'),
  dpasRating: text('dpas_rating'),
  
  // Reviewers
  reviewerName: text('reviewer_name'),
  reviewerTitle: text('reviewer_title'),
  acceptance: text('acceptance'),
  signature: text('signature'), // Base64 encoded signature image
  date: text('date'),
  
  // Metadata
  submittedBy: text('submitted_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schema
export const insertPurchaseReviewChecklistSubmissionSchema = createInsertSchema(purchaseReviewChecklistSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type PurchaseReviewChecklistSubmission = typeof purchaseReviewChecklistSubmissions.$inferSelect;
export type InsertPurchaseReviewChecklistSubmission = z.infer<typeof insertPurchaseReviewChecklistSubmissionSchema>;

// Employee Badge Actions - Configure custom badge scan actions per employee
export const employeeBadgeActions = pgTable('employee_badge_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'cascade' }).notNull(),
  actionType: text('action_type').notNull(), // 'P1_DEPARTMENT_PROGRESS', 'P2_DEPARTMENT_PROGRESS', 'QUICK_NAVIGATION', 'CLOCK_IN_OUT'
  actionConfig: jsonb('action_config').notNull(), // Configuration specific to action type
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  employeeIdIdx: index('employee_badge_actions_employee_id_idx').on(table.employeeId),
  isActiveIdx: index('employee_badge_actions_is_active_idx').on(table.isActive),
}));

// Insert Schema
export const insertEmployeeBadgeActionSchema = createInsertSchema(employeeBadgeActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type EmployeeBadgeAction = typeof employeeBadgeActions.$inferSelect;
export type InsertEmployeeBadgeAction = z.infer<typeof insertEmployeeBadgeActionSchema>;

// Badge Scan Audit Log - Track all badge scan events for accountability and troubleshooting
export const badgeScanAuditLog = pgTable('badge_scan_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'set null' }),
  employeeCode: text('employee_code').notNull(), // Store code in case employee is deleted
  actionType: text('action_type').notNull(), // Action type that was executed
  actionPayload: jsonb('action_payload'), // Barcode scanned, target department, etc.
  outcome: text('outcome').notNull(), // 'success', 'error', 'validation_failed'
  errorMessage: text('error_message'), // Error details if outcome is not success
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
}, (table) => ({
  employeeIdIdx: index('badge_scan_audit_log_employee_id_idx').on(table.employeeId),
  scannedAtIdx: index('badge_scan_audit_log_scanned_at_idx').on(table.scannedAt),
  outcomeIdx: index('badge_scan_audit_log_outcome_idx').on(table.outcome),
}));

// Insert Schema
export const insertBadgeScanAuditLogSchema = createInsertSchema(badgeScanAuditLog).omit({
  id: true,
  scannedAt: true,
});

// Types
export type BadgeScanAuditLog = typeof badgeScanAuditLog.$inferSelect;
export type InsertBadgeScanAuditLog = z.infer<typeof insertBadgeScanAuditLogSchema>;

// Customer Watch Rules - Configurable monitoring rules for specific customers and departments
export const customerWatchRules = pgTable('customer_watch_rules', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(), // User who created this rule (e.g., 'darleneb')
  customerId: text('customer_id').notNull(), // Customer ID to watch
  customerName: text('customer_name').notNull(), // Customer name for display
  departmentId: integer('department_id').references(() => orderDepartmentTypes.id), // Department to watch
  departmentName: text('department_name').notNull(), // Department name for display
  label: text('label'), // Optional custom label for the rule
  trackedOrderIds: text('tracked_order_ids').array().default([]), // Specific order IDs to track (empty = all orders)
  visibilityScope: text('visibility_scope').default('USER_ONLY').notNull(), // 'USER_ONLY', 'EVERYONE', 'SPECIFIC_EMPLOYEES'
  visibilityEmployeeId: integer('visibility_employee_id').references(() => employees.id), // DEPRECATED - kept for backward compatibility
  visibilityEmployeeIds: integer('visibility_employee_ids').array().default([]), // Employees who can see (if SPECIFIC_EMPLOYEES)
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdIdx: index('customer_watch_rules_user_id_idx').on(table.userId),
  isActiveIdx: index('customer_watch_rules_is_active_idx').on(table.isActive),
}));

// Insert Schema
export const insertCustomerWatchRuleSchema = createInsertSchema(customerWatchRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type CustomerWatchRule = typeof customerWatchRules.$inferSelect;
export type InsertCustomerWatchRule = z.infer<typeof insertCustomerWatchRuleSchema>;

// ===========================
// COST ACCOUNTING MODULE
// ===========================

// Account Categories - Classifications for chart of accounts
export const accountCategories = pgTable('account_categories', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  name: varchar('name', { length: 255 }).notNull().unique(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertAccountCategorySchema = createInsertSchema(accountCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AccountCategory = typeof accountCategories.$inferSelect;
export type InsertAccountCategory = z.infer<typeof insertAccountCategorySchema>;

// Chart of Accounts - Individual accounting line items
export const accounts = pgTable('accounts', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  accountNumber: varchar('account_number', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  categoryId: varchar('category_id', { length: 255 }).references(() => accountCategories.id).notNull(),
  description: text('description'),
  isAllocated: boolean('is_allocated').default(false),
  allocationBasis: varchar('allocation_basis', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  categoryIdIdx: index('accounts_category_id_idx').on(table.categoryId),
  isActiveIdx: index('accounts_is_active_idx').on(table.isActive),
}));

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  accountNumber: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

// Monthly Account Entries - Actual monthly amounts for each account
export const monthlyAccountEntries = pgTable('monthly_account_entries', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  accountId: varchar('account_id', { length: 255 }).references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  source: varchar('source', { length: 50 }).default('manual'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  accountIdIdx: index('monthly_entries_account_id_idx').on(table.accountId),
  yearMonthIdx: index('monthly_entries_year_month_idx').on(table.year, table.month),
  uniqueAccountYearMonth: unique('unique_account_year_month').on(table.accountId, table.year, table.month),
}));

export const insertMonthlyAccountEntrySchema = createInsertSchema(monthlyAccountEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MonthlyAccountEntry = typeof monthlyAccountEntries.$inferSelect;
export type InsertMonthlyAccountEntry = z.infer<typeof insertMonthlyAccountEntrySchema>;

// Allocation Rules - Define how to allocate overhead, indirect materials, etc.
export const allocationRules = pgTable('allocation_rules', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  name: varchar('name', { length: 255 }).notNull(),
  sourceAccountId: varchar('source_account_id', { length: 255 }).references(() => accounts.id).notNull(),
  targetAccountId: varchar('target_account_id', { length: 255 }).references(() => accounts.id).notNull(),
  allocationMethod: varchar('allocation_method', { length: 100 }).notNull(),
  allocationValue: numeric('allocation_value', { precision: 12, scale: 2 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  sourceAccountIdIdx: index('allocation_rules_source_account_id_idx').on(table.sourceAccountId),
  isActiveIdx: index('allocation_rules_is_active_idx').on(table.isActive),
}));

export const insertAllocationRuleSchema = createInsertSchema(allocationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AllocationRule = typeof allocationRules.$inferSelect;
export type InsertAllocationRule = z.infer<typeof insertAllocationRuleSchema>;

// Allocation Results - Store calculated allocations for each period
export const allocationResults = pgTable('allocation_results', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
  allocationRuleId: varchar('allocation_rule_id', { length: 255 }).references(() => allocationRules.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  allocatedAmount: numeric('allocated_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  ruleIdIdx: index('allocation_results_rule_id_idx').on(table.allocationRuleId),
  yearMonthIdx: index('allocation_results_year_month_idx').on(table.year, table.month),
  uniqueRuleYearMonth: unique('unique_rule_year_month').on(table.allocationRuleId, table.year, table.month),
}));

export const insertAllocationResultSchema = createInsertSchema(allocationResults).omit({
  id: true,
  createdAt: true,
});

export type AllocationResult = typeof allocationResults.$inferSelect;
export type InsertAllocationResult = z.infer<typeof insertAllocationResultSchema>;

// PDF Configuration Settings (Singleton table - should only have one row)
export const pdfConfigSettings = pgTable('pdf_config_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  margins: jsonb('margins').notNull().default({
    STANDARD: 40,
    COMPACT: 30,
    WIDE: 50,
  }),
  fontSizes: jsonb('font_sizes').notNull().default({
    TITLE_LARGE: 18,
    TITLE_MEDIUM: 16,
    TITLE_SMALL: 14,
    SECTION_HEADER: 12,
    BODY_LARGE: 10,
    BODY_MEDIUM: 9,
    BODY_SMALL: 8,
    TINY: 7,
  }),
  lineHeights: jsonb('line_heights').notNull().default({
    TITLE: 25,
    SECTION: 20,
    BODY: 15,
    COMPACT: 12,
    DENSE: 10,
  }),
  spacing: jsonb('spacing').notNull().default({
    SECTION_GAP_LARGE: 40,
    SECTION_GAP_MEDIUM: 30,
    SECTION_GAP_SMALL: 20,
    SECTION_GAP_TINY: 15,
    COLUMN_GAP: 20,
    BOX_PADDING: 8,
    BOX_PADDING_SMALL: 5,
    LINE_SPACING_LARGE: 15,
    LINE_SPACING_MEDIUM: 13,
    LINE_SPACING_SMALL: 11,
    LINE_SPACING_COMPACT: 9,
  }),
  colors: jsonb('colors').notNull().default({
    TEXT_PRIMARY: { r: 0, g: 0, b: 0 },
    TEXT_SECONDARY: { r: 0.3, g: 0.3, b: 0.3 },
    TEXT_TERTIARY: { r: 0.5, g: 0.5, b: 0.5 },
    TEXT_LIGHT: { r: 0.6, g: 0.6, b: 0.6 },
    BG_TABLE_HEADER: { r: 0.9, g: 0.9, b: 0.9 },
    BG_WHITE: { r: 1, g: 1, b: 1 },
    BG_LIGHT_GRAY: { r: 0.95, g: 0.95, b: 0.95 },
    BORDER_BLACK: { r: 0, g: 0, b: 0 },
    BORDER_GRAY: { r: 0.7, g: 0.7, b: 0.7 },
    BORDER_LIGHT: { r: 0.85, g: 0.85, b: 0.85 },
    ACCENT_RED: { r: 0.8, g: 0, b: 0 },
    ACCENT_BLUE: { r: 0, g: 0, b: 0.8 },
    ACCENT_GREEN: { r: 0, g: 0.6, b: 0 },
  }),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
});

export const insertPdfConfigSettingsSchema = createInsertSchema(pdfConfigSettings).omit({
  id: true,
  updatedAt: true,
});

export type PdfConfigSettings = typeof pdfConfigSettings.$inferSelect;
export type InsertPdfConfigSettings = z.infer<typeof insertPdfConfigSettingsSchema>;

// PDF Templates - Template library for different PDF types with custom logos and styling
export const pdfTemplates = pgTable('pdf_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  templateType: text('template_type').notNull(), // 'P1', 'P2', 'RFQ', 'SALES_ORDER', 'INVOICE', etc.
  description: text('description'),
  logoPath: text('logo_path'), // Path to uploaded logo file
  companyName: text('company_name'),
  companyAddress: text('company_address'),
  companyPhone: text('company_phone'),
  companyEmail: text('company_email'),
  companyWebsite: text('company_website'),
  headerText: text('header_text'),
  footerText: text('footer_text'),
  margins: jsonb('margins').notNull().default({
    STANDARD: 40,
    COMPACT: 30,
    WIDE: 50,
  }),
  fontSizes: jsonb('font_sizes').notNull().default({
    TITLE_LARGE: 18,
    TITLE_MEDIUM: 16,
    TITLE_SMALL: 14,
    SECTION_HEADER: 12,
    BODY_LARGE: 10,
    BODY_MEDIUM: 9,
    BODY_SMALL: 8,
    TINY: 7,
  }),
  lineHeights: jsonb('line_heights').notNull().default({
    TITLE: 25,
    SECTION: 20,
    BODY: 15,
    COMPACT: 12,
    DENSE: 10,
  }),
  spacing: jsonb('spacing').notNull().default({
    SECTION_GAP_LARGE: 40,
    SECTION_GAP_MEDIUM: 30,
    SECTION_GAP_SMALL: 20,
    SECTION_GAP_TINY: 15,
    COLUMN_GAP: 20,
    BOX_PADDING: 8,
    BOX_PADDING_SMALL: 5,
    LINE_SPACING_LARGE: 15,
    LINE_SPACING_MEDIUM: 13,
    LINE_SPACING_SMALL: 11,
    LINE_SPACING_COMPACT: 9,
  }),
  colors: jsonb('colors').notNull().default({
    TEXT_PRIMARY: { r: 0, g: 0, b: 0 },
    TEXT_SECONDARY: { r: 0.3, g: 0.3, b: 0.3 },
    TEXT_TERTIARY: { r: 0.5, g: 0.5, b: 0.5 },
    TEXT_LIGHT: { r: 0.6, g: 0.6, b: 0.6 },
    BG_TABLE_HEADER: { r: 0.9, g: 0.9, b: 0.9 },
    BG_WHITE: { r: 1, g: 1, b: 1 },
    BG_LIGHT_GRAY: { r: 0.95, g: 0.95, b: 0.95 },
    BORDER_BLACK: { r: 0, g: 0, b: 0 },
    BORDER_GRAY: { r: 0.7, g: 0.7, b: 0.7 },
    BORDER_LIGHT: { r: 0.85, g: 0.85, b: 0.85 },
    ACCENT_RED: { r: 0.8, g: 0, b: 0 },
    ACCENT_BLUE: { r: 0, g: 0, b: 0.8 },
    ACCENT_GREEN: { r: 0, g: 0.6, b: 0 },
  }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => ({
  templateTypeIdx: index('pdf_templates_type_idx').on(table.templateType),
}));

export const insertPdfTemplateSchema = createInsertSchema(pdfTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PdfTemplate = typeof pdfTemplates.$inferSelect;
export type InsertPdfTemplate = z.infer<typeof insertPdfTemplateSchema>;

// Gateway Reports - Weekly production tracking for 4 functions (Mon-Fri only)
export const gatewayReports = pgTable('gateway_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  weekStartDate: date('week_start_date').notNull(), // Monday of the week
  year: integer('year').notNull(),
  weekNumber: integer('week_number').notNull(), // ISO week number
  // Buttpads daily totals (Mon-Fri)
  buttpadsMon: integer('buttpads_mon').notNull().default(0),
  buttpadsTue: integer('buttpads_tue').notNull().default(0),
  buttpadsWed: integer('buttpads_wed').notNull().default(0),
  buttpadsThu: integer('buttpads_thu').notNull().default(0),
  buttpadsFri: integer('buttpads_fri').notNull().default(0),
  // Sandblasting daily totals (Mon-Fri)
  sandblastingMon: integer('sandblasting_mon').notNull().default(0),
  sandblastingTue: integer('sandblasting_tue').notNull().default(0),
  sandblastingWed: integer('sandblasting_wed').notNull().default(0),
  sandblastingThu: integer('sandblasting_thu').notNull().default(0),
  sandblastingFri: integer('sandblasting_fri').notNull().default(0),
  // Duratec daily totals (Mon-Fri)
  duratecMon: integer('duratec_mon').notNull().default(0),
  duratecTue: integer('duratec_tue').notNull().default(0),
  duratecWed: integer('duratec_wed').notNull().default(0),
  duratecThu: integer('duratec_thu').notNull().default(0),
  duratecFri: integer('duratec_fri').notNull().default(0),
  // Texture daily totals (Mon-Fri)
  textureMon: integer('texture_mon').notNull().default(0),
  textureTue: integer('texture_tue').notNull().default(0),
  textureWed: integer('texture_wed').notNull().default(0),
  textureThu: integer('texture_thu').notNull().default(0),
  textureFri: integer('texture_fri').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => ({
  weekStartIdx: index('gateway_reports_week_start_idx').on(table.weekStartDate),
  yearWeekIdx: index('gateway_reports_year_week_idx').on(table.year, table.weekNumber),
  uniqueWeekStart: unique('unique_week_start').on(table.weekStartDate),
}));

export const insertGatewayReportSchema = createInsertSchema(gatewayReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GatewayReport = typeof gatewayReports.$inferSelect;
export type InsertGatewayReport = z.infer<typeof insertGatewayReportSchema>;

// Marketing Communications - Message Templates
export const marketingTemplates = pgTable('marketing_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  contentHtml: text('content_html'),
  category: text('category').default('general'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertMarketingTemplateSchema = createInsertSchema(marketingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketingTemplate = typeof marketingTemplates.$inferSelect;
export type InsertMarketingTemplate = z.infer<typeof insertMarketingTemplateSchema>;

// Marketing Communications - Sent Messages History
export const marketingMessages = pgTable('marketing_messages', {
  id: serial('id').primaryKey(),
  subject: text('subject').notNull(),
  content: text('content').notNull(),
  contentHtml: text('content_html'),
  messageType: text('message_type').notNull().default('email'),
  recipientCount: integer('recipient_count').default(0),
  successCount: integer('success_count').default(0),
  failedCount: integer('failed_count').default(0),
  customerTypeFilter: text('customer_type_filter'),
  templateId: integer('template_id').references(() => marketingTemplates.id),
  sentBy: text('sent_by'),
  sentAt: timestamp('sent_at').defaultNow(),
  status: text('status').default('sent'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertMarketingMessageSchema = createInsertSchema(marketingMessages).omit({
  id: true,
  createdAt: true,
});

export type MarketingMessage = typeof marketingMessages.$inferSelect;
export type InsertMarketingMessage = z.infer<typeof insertMarketingMessageSchema>;

// Marketing Communications - Individual Recipient Log
export const marketingRecipients = pgTable('marketing_recipients', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').references(() => marketingMessages.id).notNull(),
  customerId: integer('customer_id'),
  recipientEmail: text('recipient_email'),
  recipientPhone: text('recipient_phone'),
  status: text('status').default('pending'),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
});

export const insertMarketingRecipientSchema = createInsertSchema(marketingRecipients).omit({
  id: true,
});

export type MarketingRecipient = typeof marketingRecipients.$inferSelect;
export type InsertMarketingRecipient = z.infer<typeof insertMarketingRecipientSchema>;

// P2 Department Transfer Signatures - AS9100 compliant electronic signatures for work completion
export const p2DepartmentTransferSignatures = pgTable('p2_department_transfer_signatures', {
  id: uuid('id').defaultRandom().primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' })
    .notNull(),
  barcode: text('barcode').notNull(),
  partNumber: text('part_number').notNull(),
  fromDepartment: text('from_department').notNull(),
  toDepartment: text('to_department').notNull(),
  workInstructionRef: text('work_instruction_ref'),
  workInstructionVersion: text('work_instruction_version'),
  signatureData: text('signature_data').notNull(),
  signedByEmployeeId: integer('signed_by_employee_id').references(() => employees.id),
  signedByName: text('signed_by_name').notNull(),
  signedByUsername: text('signed_by_username').notNull(),
  declarationText: text('declaration_text').notNull(),
  declarationAccepted: boolean('declaration_accepted').notNull().default(true),
  signedAt: timestamp('signed_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  notes: text('notes'),
}, (table) => ({
  itemIdIdx: index('p2_transfer_sig_item_id_idx').on(table.serializedItemId),
  barcodeIdx: index('p2_transfer_sig_barcode_idx').on(table.barcode),
  deptIdx: index('p2_transfer_sig_dept_idx').on(table.fromDepartment),
  signedByIdx: index('p2_transfer_sig_signed_by_idx').on(table.signedByEmployeeId),
}));

export const insertP2DepartmentTransferSignatureSchema = createInsertSchema(p2DepartmentTransferSignatures).omit({
  id: true,
  signedAt: true,
});

export type P2DepartmentTransferSignature = typeof p2DepartmentTransferSignatures.$inferSelect;
export type InsertP2DepartmentTransferSignature = z.infer<typeof insertP2DepartmentTransferSignatureSchema>;

// P2 Production Changes (PCF/PCR) - AS9100 Configuration Control
// Scope: Affects routing, BOM, process, materials, or inspection requirements
export const p2ProductionChanges = pgTable('p2_production_changes', {
  id: uuid('id').defaultRandom().primaryKey(),
  changeNumber: text('change_number').notNull().unique(), // PCF-2026-001 format
  changeType: text('change_type').notNull(), // PROCESS | MATERIAL | ROUTING | BOM | INSPECTION
  scope: text('scope').notNull().default('PO'), // GLOBAL | PO | PART
  partNumber: text('part_number'),
  poId: integer('po_id').references(() => p2PurchaseOrders.id),
  routingId: uuid('routing_id'), // References routing document if applicable
  currentRevision: text('current_revision'),
  proposedRevision: text('proposed_revision'),
  proposedChange: text('proposed_change').notNull(),
  reason: text('reason').notNull(),
  riskAssessment: text('risk_assessment'),
  affectedDocuments: jsonb('affected_documents').$type<string[]>().default(sql`'[]'::jsonb`),
  requiredActions: jsonb('required_actions').$type<string[]>().default(sql`'[]'::jsonb`),
  approverEmployeeId: integer('approver_employee_id').references(() => employees.id),
  approverEmployeeName: text('approver_employee_name'),
  approvalRequestId: uuid('approval_request_id'),
  approvalRequestIds: jsonb('approval_request_ids').$type<string[]>().default(sql`'[]'::jsonb`),
  approvalAssignments: jsonb('approval_assignments').$type<Array<{
    roleKey: string;
    roleLabel: string;
    required: boolean;
    employeeId: number | null;
    employeeName: string | null;
    userId: number | null;
  }>>().default(sql`'[]'::jsonb`),
  implementationRequired: boolean('implementation_required').default(false),
  requiresCustomerApproval: boolean('requires_customer_approval').default(false),
  status: text('status').notNull().default('DRAFT'), // DRAFT | SUBMITTED | APPROVED | REJECTED | IMPLEMENTED
  submittedById: integer('submitted_by_id').references(() => employees.id),
  submittedByName: text('submitted_by_name'),
  submittedAt: timestamp('submitted_at'),
  approvedById: integer('approved_by_id').references(() => employees.id),
  approvedByName: text('approved_by_name'),
  approvedAt: timestamp('approved_at'),
  rejectedById: integer('rejected_by_id').references(() => employees.id),
  rejectedByName: text('rejected_by_name'),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  implementedAt: timestamp('implemented_at'),
  effectiveDate: date('effective_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  poIdIdx: index('p2_prod_changes_po_id_idx').on(table.poId),
  statusIdx: index('p2_prod_changes_status_idx').on(table.status),
  changeTypeIdx: index('p2_prod_changes_type_idx').on(table.changeType),
}));

export const insertP2ProductionChangeSchema = createInsertSchema(p2ProductionChanges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type P2ProductionChange = typeof p2ProductionChanges.$inferSelect;
export type InsertP2ProductionChange = z.infer<typeof insertP2ProductionChangeSchema>;

// P2 Traveler Changes / Deviations - AS9100 Controlled Deviations
// Scope: Affects specific traveler only, routing stays intact
export const p2TravelerChanges = pgTable('p2_traveler_changes', {
  id: uuid('id').defaultRandom().primaryKey(),
  changeNumber: text('change_number').notNull().unique(), // DEV-2026-001 format
  travelerId: uuid('traveler_id').notNull(), // References traveler
  serializedItemId: uuid('serialized_item_id').references(() => p2SerializedItems.id),
  changeCategory: text('change_category').notNull(), // DEVIATION | REWORK | REPAIR | TEMPORARY
  description: text('description').notNull(),
  affectedStepIds: jsonb('affected_step_ids').$type<string[]>().default(sql`'[]'::jsonb`),
  justification: text('justification').notNull(),
  qualityImpact: text('quality_impact'),
  status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  blocksTraveler: boolean('blocks_traveler').default(false), // If true, traveler cannot continue
  authorizedById: integer('authorized_by_id').references(() => employees.id),
  authorizedByName: text('authorized_by_name'),
  authorizationDate: timestamp('authorization_date'),
  rejectedById: integer('rejected_by_id').references(() => employees.id),
  rejectedByName: text('rejected_by_name'),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  createdById: integer('created_by_id').references(() => employees.id),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  travelerIdIdx: index('p2_traveler_changes_traveler_id_idx').on(table.travelerId),
  serializedItemIdIdx: index('p2_traveler_changes_item_id_idx').on(table.serializedItemId),
  statusIdx: index('p2_traveler_changes_status_idx').on(table.status),
  categoryIdx: index('p2_traveler_changes_category_idx').on(table.changeCategory),
}));

export const insertP2TravelerChangeSchema = createInsertSchema(p2TravelerChanges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type P2TravelerChange = typeof p2TravelerChanges.$inferSelect;
export type InsertP2TravelerChange = z.infer<typeof insertP2TravelerChangeSchema>;

// Credit Memos - Customer credit management
// sourceType: 'manual' = manual adjustment, 'overpayment' = order overpayment, 'return' = returned item/refund not sent to payment method
export const creditMemos = pgTable('credit_memos', {
  id: serial('id').primaryKey(),
  memoNumber: text('memo_number').notNull(),
  customerId: text('customer_id').notNull(),
  amount: real('amount').notNull(),
  appliedAmount: real('applied_amount').default(0),
  unappliedAmount: real('unapplied_amount').notNull(),
  reason: text('reason').notNull(),
  notes: text('notes'),
  status: text('status').default('active').notNull(),
  sourceType: text('source_type').default('manual').notNull(), // 'manual', 'overpayment', 'return', 'invoice_correction'
  sourceReference: text('source_reference'), // Reference to source (e.g., order_id for overpayment, refund_request_id for return)
  issuedDate: timestamp('issued_date').defaultNow().notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // arInvoiceId — FK to ar_invoices; set when this memo is linked to a specific AR invoice
  // Note: .references() intentionally omitted — the FK constraint exists in the DB under
  // a legacy naming convention; removing it here prevents drizzle-kit from renaming it.
  arInvoiceId: uuid('ar_invoice_id'),
}, (table) => ({
  customerIdIdx: index('credit_memos_customer_id_idx').on(table.customerId),
  statusIdx: index('credit_memos_status_idx').on(table.status),
  sourceTypeIdx: index('credit_memos_source_type_idx').on(table.sourceType),
}));

export const insertCreditMemoSchema = createInsertSchema(creditMemos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreditMemo = typeof creditMemos.$inferSelect;
export type InsertCreditMemo = z.infer<typeof insertCreditMemoSchema>;

// Credit Memo Applications - Track how credit memos are applied to orders/invoices
export const creditMemoApplications = pgTable('credit_memo_applications', {
  id: serial('id').primaryKey(),
  creditMemoId: integer('credit_memo_id')
    .references(() => creditMemos.id)
    .notNull(),
  orderId: text('order_id').notNull(),
  amountApplied: real('amount_applied').notNull(),
  appliedDate: timestamp('applied_date').defaultNow().notNull(),
  appliedBy: text('applied_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  creditMemoIdIdx: index('credit_memo_apps_memo_id_idx').on(table.creditMemoId),
  orderIdIdx: index('credit_memo_apps_order_id_idx').on(table.orderId),
}));

export const insertCreditMemoApplicationSchema = createInsertSchema(creditMemoApplications).omit({
  id: true,
  createdAt: true,
});

export type CreditMemoApplication = typeof creditMemoApplications.$inferSelect;
export type InsertCreditMemoApplication = z.infer<typeof insertCreditMemoApplicationSchema>;

// ==========================================
// PRE-PRODUCTION CHECKLIST SYSTEM
// ==========================================

// Pre-Production Checklist Templates - reusable checklist templates
export const preproductionTemplates = pgTable('preproduction_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertPreproductionTemplateSchema = createInsertSchema(preproductionTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PreproductionTemplate = typeof preproductionTemplates.$inferSelect;
export type InsertPreproductionTemplate = z.infer<typeof insertPreproductionTemplateSchema>;

// Pre-Production Template Sections - sections within a template
export const preproductionTemplateSections = pgTable('preproduction_template_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id')
    .references(() => preproductionTemplates.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('preproduction_template_sections_template_id_idx').on(table.templateId),
}));

export const insertPreproductionTemplateSectionSchema = createInsertSchema(preproductionTemplateSections).omit({
  id: true,
  createdAt: true,
});

export type PreproductionTemplateSection = typeof preproductionTemplateSections.$inferSelect;
export type InsertPreproductionTemplateSection = z.infer<typeof insertPreproductionTemplateSectionSchema>;

// Pre-Production Template Tasks - tasks within a template section
export const preproductionTemplateTasks = pgTable('preproduction_template_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sectionId: uuid('section_id')
    .references(() => preproductionTemplateSections.id, { onDelete: 'cascade' })
    .notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  sectionIdIdx: index('preproduction_template_tasks_section_id_idx').on(table.sectionId),
}));

export const insertPreproductionTemplateTaskSchema = createInsertSchema(preproductionTemplateTasks).omit({
  id: true,
  createdAt: true,
});

export type PreproductionTemplateTask = typeof preproductionTemplateTasks.$inferSelect;
export type InsertPreproductionTemplateTask = z.infer<typeof insertPreproductionTemplateTaskSchema>;

// Pre-Production Checklists - project-specific checklist instances
export const preproductionChecklists = pgTable('preproduction_checklists', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: text('project_id').notNull(), // e.g., STR250015
  projectName: text('project_name').notNull(), // e.g., "75 Disruptors"
  poNumber: text('po_number'), // Purchase order reference
  templateId: uuid('template_id').references(() => preproductionTemplates.id),
  // Timeline milestones
  preProductionDueDate: timestamp('pre_production_due_date'),
  materialArrivalDate: timestamp('material_arrival_date'),
  firstArticleDueDate: timestamp('first_article_due_date'),
  as9102CompletionDate: timestamp('as9102_completion_date'),
  firstArticleApprovedDate: timestamp('first_article_approved_date'),
  fullProductionStartDate: timestamp('full_production_start_date'),
  poDueDate: timestamp('po_due_date'),
  poDueQuantity: integer('po_due_quantity'), // e.g., 75
  // Milestone visibility toggles (all visible by default)
  showPreProductionDueDate: boolean('show_pre_production_due_date').default(true),
  showMaterialArrivalDate: boolean('show_material_arrival_date').default(true),
  showFirstArticleDueDate: boolean('show_first_article_due_date').default(true),
  showAs9102CompletionDate: boolean('show_as9102_completion_date').default(true),
  showFirstArticleApprovedDate: boolean('show_first_article_approved_date').default(true),
  showFullProductionStartDate: boolean('show_full_production_start_date').default(true),
  showPoDueDate: boolean('show_po_due_date').default(true),
  // Status and sign-off
  status: text('status').default('in_progress'), // in_progress, completed, cancelled
  signatureData: text('signature_data'), // Base64 signature
  signedBy: text('signed_by'),
  signedAt: timestamp('signed_at'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('preproduction_checklists_project_id_idx').on(table.projectId),
  statusIdx: index('preproduction_checklists_status_idx').on(table.status),
}));

export const insertPreproductionChecklistSchema = createInsertSchema(preproductionChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PreproductionChecklist = typeof preproductionChecklists.$inferSelect;
export type InsertPreproductionChecklist = z.infer<typeof insertPreproductionChecklistSchema>;

// Pre-Production Checklist Sections - sections within a project checklist
export const preproductionChecklistSections = pgTable('preproduction_checklist_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  checklistId: uuid('checklist_id')
    .references(() => preproductionChecklists.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  checklistIdIdx: index('preproduction_checklist_sections_checklist_id_idx').on(table.checklistId),
}));

export const insertPreproductionChecklistSectionSchema = createInsertSchema(preproductionChecklistSections).omit({
  id: true,
  createdAt: true,
});

export type PreproductionChecklistSection = typeof preproductionChecklistSections.$inferSelect;
export type InsertPreproductionChecklistSection = z.infer<typeof insertPreproductionChecklistSectionSchema>;

// Pre-Production Checklist Tasks - tasks within a project checklist section
export const preproductionChecklistTasks = pgTable('preproduction_checklist_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  sectionId: uuid('section_id')
    .references(() => preproductionChecklistSections.id, { onDelete: 'cascade' })
    .notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').default(0),
  isCompleted: boolean('is_completed').default(false),
  completedAt: timestamp('completed_at'),
  completedBy: text('completed_by'),
  assignedTo: text('assigned_to'), // Username or employee name
  assignedToEmployeeId: integer('assigned_to_employee_id').references(() => employees.id),
  notes: text('notes'),
  link: text('link'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  sectionIdIdx: index('preproduction_checklist_tasks_section_id_idx').on(table.sectionId),
  assignedToIdx: index('preproduction_checklist_tasks_assigned_to_idx').on(table.assignedToEmployeeId),
  completedIdx: index('preproduction_checklist_tasks_completed_idx').on(table.isCompleted),
}));

export const insertPreproductionChecklistTaskSchema = createInsertSchema(preproductionChecklistTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PreproductionChecklistTask = typeof preproductionChecklistTasks.$inferSelect;
export type InsertPreproductionChecklistTask = z.infer<typeof insertPreproductionChecklistTaskSchema>;

export const preproductionChecklistAllowedEmployees = pgTable('preproduction_checklist_allowed_employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  checklistId: uuid('checklist_id').notNull().references(() => preproductionChecklists.id),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  checklistIdIdx: index('preproduction_checklist_allowed_employees_checklist_id_idx').on(table.checklistId),
  employeeIdIdx: index('preproduction_checklist_allowed_employees_employee_id_idx').on(table.employeeId),
  uniqueIdx: unique('preproduction_checklist_allowed_employees_unique_idx').on(table.checklistId, table.employeeId),
}));

export const insertPreproductionChecklistAllowedEmployeeSchema = createInsertSchema(preproductionChecklistAllowedEmployees).omit({
  id: true,
  createdAt: true,
});

export type PreproductionChecklistAllowedEmployee = typeof preproductionChecklistAllowedEmployees.$inferSelect;
export type InsertPreproductionChecklistAllowedEmployee = z.infer<typeof insertPreproductionChecklistAllowedEmployeeSchema>;

// ============================================
// SYSTEM HEALTH CHECKS
// ============================================

// Health Check Types - built-in and custom check definitions
export const healthCheckTypes = pgTable('health_check_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., 'sendgrid_email', 'database_connection', 'duplicate_orders'
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category').default('system'), // 'system', 'email', 'database', 'custom'
  isBuiltIn: boolean('is_built_in').default(true), // Built-in checks cannot be deleted
  isEnabled: boolean('is_enabled').default(true), // Whether this check runs in automated daily checks
  checkFunction: text('check_function'), // For custom checks: SQL query or function name
  testEmailAddress: text('test_email_address'), // For email checks: where to send test emails
  testSmsPhone: text('test_sms_phone'), // For SMS checks: where to send test SMS
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertHealthCheckTypeSchema = createInsertSchema(healthCheckTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HealthCheckType = typeof healthCheckTypes.$inferSelect;
export type InsertHealthCheckType = z.infer<typeof insertHealthCheckTypeSchema>;

// Health Check Configuration - global settings
export const healthCheckConfig = pgTable('health_check_config', {
  id: serial('id').primaryKey(),
  scheduledTime: text('scheduled_time').default('08:00'), // HH:MM format for daily automated run
  notificationEmail: text('notification_email'), // Where to send alerts if checks fail
  testSmsPhone: text('test_sms_phone'), // Phone number to send test SMS health checks to
  timezone: text('timezone').default('America/Chicago'), // Timezone for scheduled checks (default Central Time)
  isScheduleEnabled: boolean('is_schedule_enabled').default(true), // Whether automated daily checks are enabled
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertHealthCheckConfigSchema = createInsertSchema(healthCheckConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type HealthCheckConfig = typeof healthCheckConfig.$inferSelect;
export type InsertHealthCheckConfig = z.infer<typeof insertHealthCheckConfigSchema>;

// Health Check Results - history of check runs
export const healthCheckResults = pgTable('health_check_results', {
  id: serial('id').primaryKey(),
  checkTypeId: integer('check_type_id').references(() => healthCheckTypes.id),
  checkName: text('check_name').notNull(), // Denormalized for history
  status: text('status').notNull(), // 'pass', 'fail', 'warning', 'skipped'
  message: text('message'), // Details about the result
  details: jsonb('details'), // Additional structured data (e.g., duplicate order IDs found)
  executionTimeMs: integer('execution_time_ms'), // How long the check took
  runType: text('run_type').default('manual'), // 'manual', 'scheduled'
  runBatchId: text('run_batch_id'), // Groups checks that ran together
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  checkTypeIdIdx: index('health_check_results_check_type_id_idx').on(table.checkTypeId),
  statusIdx: index('health_check_results_status_idx').on(table.status),
  createdAtIdx: index('health_check_results_created_at_idx').on(table.createdAt),
  runBatchIdIdx: index('health_check_results_run_batch_id_idx').on(table.runBatchId),
}));

export const insertHealthCheckResultSchema = createInsertSchema(healthCheckResults).omit({
  id: true,
  createdAt: true,
});

export type HealthCheckResult = typeof healthCheckResults.$inferSelect;
export type InsertHealthCheckResult = z.infer<typeof insertHealthCheckResultSchema>;

// Monitored Links - URLs to check for 404s and availability
export const monitoredLinks = pgTable('monitored_links', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // Friendly name for the link
  url: text('url').notNull(), // Full URL to check
  linkType: text('link_type').notNull().default('external'), // 'external', 'internal'
  description: text('description'), // What this link is for
  isEnabled: boolean('is_enabled').default(true), // Whether to include in health checks
  expectedStatus: integer('expected_status').default(200), // Expected HTTP status code
  lastCheckedAt: timestamp('last_checked_at'),
  lastStatus: integer('last_status'), // Last HTTP status received
  lastCheckResult: text('last_check_result'), // 'pass', 'fail', 'warning'
  consecutiveFailures: integer('consecutive_failures').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  linkTypeIdx: index('monitored_links_link_type_idx').on(table.linkType),
  isEnabledIdx: index('monitored_links_is_enabled_idx').on(table.isEnabled),
}));

export const insertMonitoredLinkSchema = createInsertSchema(monitoredLinks).omit({
  id: true,
  lastCheckedAt: true,
  lastStatus: true,
  lastCheckResult: true,
  consecutiveFailures: true,
  createdAt: true,
  updatedAt: true,
});

export type MonitoredLink = typeof monitoredLinks.$inferSelect;
export type InsertMonitoredLink = z.infer<typeof insertMonitoredLinkSchema>;

// ============================================
// P2 PROJECTS MODULE
// ============================================

// Project Step Status Enum
export const projectStepStatusEnum = pgEnum('project_step_status', [
  'pending',
  'in_progress', 
  'completed',
  'blocked',
  'skipped',
  'not_applicable'
]);

// Project Status Enum
export const projectStatusEnum = pgEnum('project_status', [
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'inactive',
  'won',
  'lost'
]);

// Project Step Types (workflow order)
export const projectStepTypeEnum = pgEnum('project_step_type', [
  'rfq_risk_assessment',
  'quote',
  'purchase_review_checklist',
  'preproduction_checklist',
  'p2_order'
]);

// Projects - Main project tracking table
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectCode: text('project_code').notNull().unique(), // e.g., "PRJ-001"
  projectName: text('project_name').notNull(),
  customerId: text('customer_id').notNull(), // Reference to customer
  description: text('description'),
  status: projectStatusEnum('status').default('active'),
  workflowVersion: text('workflow_version'),
  currentStepType: projectStepTypeEnum('current_step_type').default('rfq_risk_assessment'),
  targetShipDate: date('target_ship_date'),
  actualShipDate: date('actual_ship_date'),
  currentStage: text('current_stage').default('rfq_received'),
  stageUpdatedAt: timestamp('stage_updated_at').defaultNow(),
  currentRevisionNumber: integer('current_revision_number').notNull().default(0),
  currentRevisionLabel: text('current_revision_label').notNull().default('Rev 0'),
  poId: integer('po_id').references(() => p2PurchaseOrders.id),
  p2PoItemId: integer('p2_po_item_id').references(() => p2PurchaseOrderItems.id),
  p2BillingAllocationId: uuid('p2_billing_allocation_id'),
  projectManagerId: integer('project_manager_id').references(() => employees.id),
  reminderDays: integer('reminder_days').default(3), // Days before reminder is sent for stuck steps
  lastReminderSentAt: timestamp('last_reminder_sent_at'),
  notes: text('notes'),
  defaultChargeCodeId: integer('default_charge_code_id').references(() => chargeCodes.id, { onDelete: 'set null' }),
  createdBy: integer('created_by').references(() => employees.id),
  // Bridge column: integer FK to customers.id. Mirrors quotes.customers_integer_id
  // and is populated from the parent quote during auto-creation (quote acceptance) or
  // manual project creation when the customer can be resolved to the master customers table.
  customersIntegerId: integer('customers_integer_id'),
  // Denormalized customer name snapshot captured at project creation from the originating quote
  customerNameSnapshot: text('customer_name_snapshot'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  customerIdIdx: index('projects_customer_id_idx').on(table.customerId),
  statusIdx: index('projects_status_idx').on(table.status),
  projectManagerIdIdx: index('projects_project_manager_id_idx').on(table.projectManagerId),
}));

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const projectClins = pgTable('project_clins', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  clinNumber: text('clin_number').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueProjectClin: unique('project_clins_project_id_clin_number_unique').on(table.projectId, table.clinNumber),
  projectIdIdx: index('project_clins_project_id_idx').on(table.projectId),
  activeIdx: index('project_clins_active_idx').on(table.active),
}));

export const insertProjectClinSchema = createInsertSchema(projectClins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectClin = typeof projectClins.$inferSelect;
export type InsertProjectClin = z.infer<typeof insertProjectClinSchema>;

// Project Revisions - Controlled changes to project scope, PO linkage, and production basis
export const projectRevisions = pgTable('project_revisions', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  revisionLabel: text('revision_label').notNull(),
  revisionType: text('revision_type').notNull().default('PROJECT_CHANGE'),
  revisionDate: date('revision_date').notNull().default(sql`CURRENT_DATE`),
  hasPoChange: boolean('has_po_change').notNull().default(false),
  summary: text('summary').notNull(),
  reason: text('reason').notNull(),
  previousPoId: integer('previous_po_id').references(() => p2PurchaseOrders.id),
  newPoId: integer('new_po_id').references(() => p2PurchaseOrders.id),
  createdBy: integer('created_by').references(() => employees.id),
  createdByDisplayName: text('created_by_display_name'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_revisions_project_id_idx').on(table.projectId),
  projectRevisionUnique: uniqueIndex('project_revisions_project_revision_unique').on(table.projectId, table.revisionNumber),
  createdAtIdx: index('project_revisions_created_at_idx').on(table.createdAt),
}));

export const insertProjectRevisionSchema = createInsertSchema(projectRevisions).omit({
  id: true,
  createdAt: true,
});

export type ProjectRevision = typeof projectRevisions.$inferSelect;
export type InsertProjectRevision = z.infer<typeof insertProjectRevisionSchema>;

// Project Steps - Individual workflow steps for each project
export const projectSteps = pgTable('project_steps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepType: projectStepTypeEnum('step_type').notNull(),
  stepOrder: integer('step_order').notNull(), // 1, 2, 3, 4, 5
  status: projectStepStatusEnum('status').default('pending'),
  // Linked record references (nullable - linked when step is started/completed)
  linkedRfqId: integer('linked_rfq_id').references(() => rfqRiskAssessments.id),
  linkedQuoteId: uuid('linked_quote_id').references(() => quotes.id),
  linkedPurchaseReviewId: integer('linked_purchase_review_id').references(() => purchaseReviewChecklists.id),
  linkedPreproductionChecklistId: uuid('linked_preproduction_checklist_id').references(() => preproductionChecklists.id),
  linkedP2OrderId: integer('linked_p2_order_id').references(() => p2PurchaseOrders.id),
  // Step tracking
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  completedBy: integer('completed_by').references(() => employees.id),
  completedByDisplayName: text('completed_by_display_name'),
  dueDate: date('due_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_steps_project_id_idx').on(table.projectId),
  stepTypeIdx: index('project_steps_step_type_idx').on(table.stepType),
  statusIdx: index('project_steps_status_idx').on(table.status),
}));

export const insertProjectStepSchema = createInsertSchema(projectSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectStep = typeof projectSteps.$inferSelect;
export type InsertProjectStep = z.infer<typeof insertProjectStepSchema>;

// Project Activity Log - Track all project activity for audit/history
export const projectActivityLog = pgTable('project_activity_log', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(), // 'step_started', 'step_completed', 'note_added', 'reminder_sent', etc.
  stepType: projectStepTypeEnum('step_type'),
  description: text('description').notNull(),
  performedBy: integer('performed_by').references(() => employees.id),
  performedByDisplayName: text('performed_by_display_name'),
  metadata: jsonb('metadata'), // Additional context data
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_activity_log_project_id_idx').on(table.projectId),
  createdAtIdx: index('project_activity_log_created_at_idx').on(table.createdAt),
}));

export const insertProjectActivityLogSchema = createInsertSchema(projectActivityLog).omit({
  id: true,
  createdAt: true,
});

export type ProjectActivityLog = typeof projectActivityLog.$inferSelect;
export type InsertProjectActivityLog = z.infer<typeof insertProjectActivityLogSchema>;

// Project Notifications - Notifications for project managers
export const projectNotifications = pgTable('project_notifications', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  recipientId: integer('recipient_id').notNull().references(() => employees.id),
  notificationType: text('notification_type').notNull(), // 'step_completed', 'reminder', 'blocked', etc.
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  recipientIdIdx: index('project_notifications_recipient_id_idx').on(table.recipientId),
  isReadIdx: index('project_notifications_is_read_idx').on(table.isRead),
  createdAtIdx: index('project_notifications_created_at_idx').on(table.createdAt),
}));

export const insertProjectNotificationSchema = createInsertSchema(projectNotifications).omit({
  id: true,
  createdAt: true,
});

export type ProjectNotification = typeof projectNotifications.$inferSelect;
export type InsertProjectNotification = z.infer<typeof insertProjectNotificationSchema>;

// Project Step Attachments - Documents/PDFs attached to workflow steps
export const projectStepAttachments = pgTable('project_step_attachments', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepId: uuid('step_id').notNull().references(() => projectSteps.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  originalFileName: text('original_file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: integer('uploaded_by').references(() => employees.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('project_step_attachments_project_id_idx').on(table.projectId),
  stepIdIdx: index('project_step_attachments_step_id_idx').on(table.stepId),
}));

export const insertProjectStepAttachmentSchema = createInsertSchema(projectStepAttachments).omit({
  id: true,
  createdAt: true,
});

export type ProjectStepAttachment = typeof projectStepAttachments.$inferSelect;
export type InsertProjectStepAttachment = z.infer<typeof insertProjectStepAttachmentSchema>;

// Project Closing - Formal end-of-project record capturing lessons learned
export const projectClosings = pgTable('project_closings', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  whatWentWrong: text('what_went_wrong'),
  strengths: text('strengths'),
  opportunities: text('opportunities'),
  similaritiesToPriorProjects: text('similarities_to_prior_projects'),
  nextProjectRecommendations: text('next_project_recommendations'),
  closedBy: integer('closed_by').references(() => employees.id),
  closedByDisplayName: text('closed_by_display_name'),
  approvedBy: integer('approved_by').references(() => employees.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_closings_project_id_idx').on(table.projectId),
}));

export const insertProjectClosingSchema = createInsertSchema(projectClosings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectClosing = typeof projectClosings.$inferSelect;
export type InsertProjectClosing = z.infer<typeof insertProjectClosingSchema>;

// Project Closing Risks - Risks identified during project closing
export const projectClosingRisks = pgTable('project_closing_risks', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  closingId: integer('closing_id').notNull().references(() => projectClosings.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
  description: text('description').notNull(),
  department: text('department'),
  owner: text('owner'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_closing_risks_project_id_idx').on(table.projectId),
  closingIdIdx: index('project_closing_risks_closing_id_idx').on(table.closingId),
}));

export const insertProjectClosingRiskSchema = createInsertSchema(projectClosingRisks).omit({
  id: true,
  createdAt: true,
});

export type ProjectClosingRisk = typeof projectClosingRisks.$inferSelect;
export type InsertProjectClosingRisk = z.infer<typeof insertProjectClosingRiskSchema>;

// Project Closing Actions - Follow-up actions from the closing review
export const projectClosingActions = pgTable('project_closing_actions', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  closingId: integer('closing_id').notNull().references(() => projectClosings.id, { onDelete: 'cascade' }),
  actionText: text('action_text').notNull(),
  owner: text('owner'),
  department: text('department'),
  dueDate: date('due_date'),
  status: text('status').default('open'), // 'open', 'in_progress', 'completed', 'cancelled'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('project_closing_actions_project_id_idx').on(table.projectId),
  closingIdIdx: index('project_closing_actions_closing_id_idx').on(table.closingId),
}));

export const insertProjectClosingActionSchema = createInsertSchema(projectClosingActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectClosingAction = typeof projectClosingActions.$inferSelect;
export type InsertProjectClosingAction = z.infer<typeof insertProjectClosingActionSchema>;

// AQL Sampling Chart - Standard quality sampling requirements based on lot size
export const aqlSamplingChart = pgTable('aql_sampling_chart', {
  id: serial('id').primaryKey(),
  lotSizeMin: integer('lot_size_min').notNull(),
  lotSizeMax: integer('lot_size_max').notNull(),
  sampleSize: integer('sample_size').notNull(),
  inspectionLevel: text('inspection_level').default('normal'), // 'normal', 'tightened', 'reduced'
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertAqlSamplingChartSchema = createInsertSchema(aqlSamplingChart).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AqlSamplingChart = typeof aqlSamplingChart.$inferSelect;
export type InsertAqlSamplingChart = z.infer<typeof insertAqlSamplingChartSchema>;

// ============================================
// AUDIT SYSTEM TABLES
// ============================================

// Audit Settings - Configurable event toggles for what to track
export const auditSettings = pgTable('audit_settings', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(), // 'p1_orders', 'p2_items', 'production', 'finance', 'shipping', 'qc'
  eventType: text('event_type').notNull().unique(), // e.g., 'ORDER_CREATED', 'DEPARTMENT_CHANGE', etc.
  displayName: text('display_name').notNull(),
  description: text('description'),
  isEnabled: boolean('is_enabled').default(true),
  isCritical: boolean('is_critical').default(false), // Critical events cannot be disabled
  appliesTo: text('applies_to').default('both'), // 'p1', 'p2', 'both'
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertAuditSettingsSchema = createInsertSchema(auditSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AuditSettings = typeof auditSettings.$inferSelect;
export type InsertAuditSettings = z.infer<typeof insertAuditSettingsSchema>;

// Audit Events - Main event log for all tracked changes (matches existing table)
export const auditEvents = pgTable('audit_events', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'p1_order', 'p2_order', 'p2_serialized_item', 'p2_project'
  entityId: text('entity_id').notNull(), // The ID of the order/item being tracked
  action: text('action').notNull(), // Event type: 'ORDER_CREATED', 'DEPARTMENT_CHANGE', etc.
  actorId: integer('actor_id').references(() => employees.id), // Who made the change
  actorName: text('actor_name'), // Denormalized actor name
  actorRole: text('actor_role'), // Actor's role at time of action
  reason: text('reason'), // Optional reason/description
  fieldsChanged: jsonb('fields_changed'), // { fieldName: { before, after } }
  meta: jsonb('meta'), // Additional context data
  ipAddress: text('ip_address'), // Optional IP tracking
  userAgent: text('user_agent'), // Optional browser/client info
  timestamp: timestamp('timestamp').defaultNow(), // When the action occurred
  createdAt: timestamp('created_at').defaultNow(),
  // ── Task #85: unified ledger / hash-chain columns ─────────────────────
  subjectType: text('subject_type'),
  subjectId: text('subject_id'),
  payloadJson: jsonb('payload_json'),
  payloadHash: text('payload_hash'),
  prevHash: text('prev_hash'),
  rowHash: text('row_hash'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
  sourceService: text('source_service'),
  sequenceNumber: bigint('sequence_number', { mode: 'number' }),
}, (table) => ({
  entityTypeIdx: index('audit_events_entity_type_idx').on(table.entityType),
  entityIdIdx: index('audit_events_entity_id_idx').on(table.entityId),
  actionIdx: index('audit_events_action_idx').on(table.action),
  actorIdIdx: index('audit_events_actor_id_idx').on(table.actorId),
  createdAtIdx: index('audit_events_created_at_idx').on(table.createdAt),
  subjectIdx: index('audit_events_subject_idx').on(table.subjectType, table.subjectId),
  sourceServiceIdx: index('audit_events_source_service_idx').on(table.sourceService),
  occurredAtIdx: index('audit_events_occurred_at_idx').on(table.occurredAt),
}));

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  timestamp: true,
  createdAt: true,
});

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

// Order Department Transitions - Track time spent in each department
export const orderDepartmentTransitions = pgTable('order_department_transitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: text('entity_type').notNull(), // 'p1_order', 'p2_serialized_item'
  entityId: text('entity_id').notNull(), // Order ID or serialized item ID
  cycleNumber: integer('cycle_number').default(1), // Restart cycle (1 = original, 2+ = after scrap/restart)
  department: text('department').notNull(),
  enteredAt: timestamp('entered_at').notNull(),
  exitedAt: timestamp('exited_at'), // Null if still in department
  durationMinutes: integer('duration_minutes'), // Calculated on exit
  enteredByUserId: integer('entered_by_user_id').references(() => employees.id),
  exitedByUserId: integer('exited_by_user_id').references(() => employees.id),
  exitReason: text('exit_reason'), // 'completed', 'scrap', 'hold', 'skip'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  entityTypeIdx: index('dept_transitions_entity_type_idx').on(table.entityType),
  entityIdIdx: index('dept_transitions_entity_id_idx').on(table.entityId),
  departmentIdx: index('dept_transitions_department_idx').on(table.department),
  cycleNumberIdx: index('dept_transitions_cycle_number_idx').on(table.cycleNumber),
  enteredAtIdx: index('dept_transitions_entered_at_idx').on(table.enteredAt),
}));

export const insertOrderDepartmentTransitionSchema = createInsertSchema(orderDepartmentTransitions).omit({
  id: true,
  createdAt: true,
});

export type OrderDepartmentTransition = typeof orderDepartmentTransitions.$inferSelect;
export type InsertOrderDepartmentTransition = z.infer<typeof insertOrderDepartmentTransitionSchema>;

// Order Scrap Cycles - Track scrap events and link to restart orders
export const orderScrapCycles = pgTable('order_scrap_cycles', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: text('entity_type').notNull(), // 'p1_order', 'p2_serialized_item'
  originalEntityId: text('original_entity_id').notNull(), // Original order/item ID
  cycleNumber: integer('cycle_number').notNull(), // Which cycle this scrap ended
  scrapEventId: integer('scrap_event_id').references(() => auditEvents.id), // Link to the scrap audit event
  scrapReason: text('scrap_reason').notNull(),
  scrapDepartment: text('scrap_department'), // Department where scrap occurred
  scrapAuthorizedBy: integer('scrap_authorized_by').references(() => employees.id),
  restartEntityId: text('restart_entity_id'), // New order/item ID after restart (null if not restarted)
  restartedAt: timestamp('restarted_at'),
  restartedByUserId: integer('restarted_by_user_id').references(() => employees.id),
  scrappedAt: timestamp('scrapped_at').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  entityTypeIdx: index('scrap_cycles_entity_type_idx').on(table.entityType),
  originalEntityIdIdx: index('scrap_cycles_original_entity_id_idx').on(table.originalEntityId),
  cycleNumberIdx: index('scrap_cycles_cycle_number_idx').on(table.cycleNumber),
  scrappedAtIdx: index('scrap_cycles_scrapped_at_idx').on(table.scrappedAt),
}));

export const insertOrderScrapCycleSchema = createInsertSchema(orderScrapCycles).omit({
  id: true,
  createdAt: true,
});

export type OrderScrapCycle = typeof orderScrapCycles.$inferSelect;
export type InsertOrderScrapCycle = z.infer<typeof insertOrderScrapCycleSchema>;

// Media Folders - Hierarchical folder structure for organizing documents
export const mediaFolders = pgTable('media_folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // Self-referencing for nested folders, null = root level
  visibleToRoles: text('visible_to_roles').array(), // Role-based access control (null = visible to all)
  createdById: integer('created_by_id').references(() => employees.id),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  parentIdIdx: index('media_folders_parent_id_idx').on(table.parentId),
  nameIdx: index('media_folders_name_idx').on(table.name),
}));

export const insertMediaFolderSchema = createInsertSchema(mediaFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MediaFolder = typeof mediaFolders.$inferSelect;
export type InsertMediaFolder = z.infer<typeof insertMediaFolderSchema>;

// Media Library - Central storage for captured images/documents
export const mediaLibrary = pgTable('media_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  filename: text('filename').notNull(), // Original filename
  storagePath: text('storage_path').notNull(), // Path in storage folder
  mimeType: text('mime_type').notNull(), // image/jpeg, image/png, application/pdf
  fileSize: integer('file_size'), // Size in bytes
  folderId: uuid('folder_id').references(() => mediaFolders.id), // Folder this document belongs to (null = root)
  capturedById: integer('captured_by_id').references(() => employees.id),
  capturedByName: text('captured_by_name'), // Denormalized for display
  captureDate: timestamp('capture_date').defaultNow(),
  title: text('title'), // Optional user-friendly title
  notes: text('notes'), // Description or notes
  tags: text('tags').array(), // Array of tags for filtering
  category: text('category'), // 'packing_slip', 'invoice', 'receipt', 'photo', 'document', 'other'
  thumbnailPath: text('thumbnail_path'), // Path to generated thumbnail
  isArchived: boolean('is_archived').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  folderIdIdx: index('media_library_folder_id_idx').on(table.folderId),
  capturedByIdIdx: index('media_library_captured_by_id_idx').on(table.capturedById),
  captureDateIdx: index('media_library_capture_date_idx').on(table.captureDate),
  categoryIdx: index('media_library_category_idx').on(table.category),
  isArchivedIdx: index('media_library_is_archived_idx').on(table.isArchived),
}));

export const insertMediaLibrarySchema = createInsertSchema(mediaLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MediaLibrary = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibrary = z.infer<typeof insertMediaLibrarySchema>;

// Media Attachments - Links media items to entities (orders, invoices, POs, etc.)
export const mediaAttachments = pgTable('media_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  mediaId: uuid('media_id').references(() => mediaLibrary.id, { onDelete: 'cascade' }).notNull(),
  entityType: text('entity_type').notNull(), // 'order', 'invoice', 'purchase_order', 'customer', 'vendor', 'p2_order'
  entityId: text('entity_id').notNull(), // The ID of the entity
  attachedById: integer('attached_by_id').references(() => employees.id),
  attachedByName: text('attached_by_name'),
  attachedAt: timestamp('attached_at').defaultNow(),
  notes: text('notes'), // Optional note about this specific attachment
}, (table) => ({
  mediaIdIdx: index('media_attachments_media_id_idx').on(table.mediaId),
  entityTypeIdx: index('media_attachments_entity_type_idx').on(table.entityType),
  entityIdIdx: index('media_attachments_entity_id_idx').on(table.entityId),
  entityCompositeIdx: index('media_attachments_entity_composite_idx').on(table.entityType, table.entityId),
}));

export const insertMediaAttachmentSchema = createInsertSchema(mediaAttachments).omit({
  id: true,
  attachedAt: true,
});

export type MediaAttachment = typeof mediaAttachments.$inferSelect;
export type InsertMediaAttachment = z.infer<typeof insertMediaAttachmentSchema>;

// ============================================
// VOICE NOTES - Voice-recorded notes for orders and general issues
// ============================================

// Voice Notes - Store transcribed voice recordings linked to orders
export const voiceNotes = pgTable('voice_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  transcription: text('transcription').notNull(), // The transcribed text from voice
  title: text('title'),
  summary: text('summary'),
  linkedOrderId: text('linked_order_id'), // Order ID extracted from speech (e.g., "EL069")
  noteType: text('note_type').notNull().default('journal'), // 'journal', 'production_concern', etc.
  category: text('category'), // User-defined category (e.g., "metal insert", "duratec", "thickness")
  tags: text('tags').array(), // Extracted keywords/tags for searching
  extractedTasks: jsonb('extracted_tasks').$type<string[]>(),
  suggestedLinks: jsonb('suggested_links').$type<Array<{ type: string; id: string; label: string; confidence?: string }>>(),
  followUpQuestions: jsonb('follow_up_questions').$type<string[]>(),
  visibility: text('visibility').notNull().default('private'),
  recordedById: integer('recorded_by_id').references(() => employees.id),
  recordedByUsername: text('recorded_by_username').notNull(), // Username for quick reference
  recordedAt: timestamp('recorded_at').defaultNow(),
  isResolved: boolean('is_resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  resolvedById: integer('resolved_by_id').references(() => employees.id),
  resolvedNotes: text('resolved_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  linkedOrderIdIdx: index('voice_notes_linked_order_id_idx').on(table.linkedOrderId),
  noteTypeIdx: index('voice_notes_note_type_idx').on(table.noteType),
  recordedByIdIdx: index('voice_notes_recorded_by_id_idx').on(table.recordedById),
  recordedAtIdx: index('voice_notes_recorded_at_idx').on(table.recordedAt),
  categoryIdx: index('voice_notes_category_idx').on(table.category),
  isResolvedIdx: index('voice_notes_is_resolved_idx').on(table.isResolved),
}));

export const insertVoiceNoteSchema = createInsertSchema(voiceNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VoiceNote = typeof voiceNotes.$inferSelect;
export type InsertVoiceNote = z.infer<typeof insertVoiceNoteSchema>;

// Voice Note Follow-up Questions - Configurable questions for general notes
export const voiceNoteQuestions = pgTable('voice_note_questions', {
  id: serial('id').primaryKey(),
  questionText: text('question_text').notNull(),
  questionType: text('question_type').notNull().default('text'), // 'text', 'select', 'employee_select', 'number'
  options: jsonb('options').$type<string[]>(), // For 'select' type questions
  isRequired: boolean('is_required').default(false),
  category: text('category'), // Which note categories trigger this question
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertVoiceNoteQuestionSchema = createInsertSchema(voiceNoteQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VoiceNoteQuestion = typeof voiceNoteQuestions.$inferSelect;
export type InsertVoiceNoteQuestion = z.infer<typeof insertVoiceNoteQuestionSchema>;

// Voice Note Responses - Answers to follow-up questions
export const voiceNoteResponses = pgTable('voice_note_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  voiceNoteId: uuid('voice_note_id').references(() => voiceNotes.id, { onDelete: 'cascade' }).notNull(),
  questionId: integer('question_id').references(() => voiceNoteQuestions.id).notNull(),
  responseValue: text('response_value'), // The answer
  employeeId: integer('employee_id').references(() => employees.id), // If response is an employee selection
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  voiceNoteIdIdx: index('voice_note_responses_voice_note_id_idx').on(table.voiceNoteId),
  questionIdIdx: index('voice_note_responses_question_id_idx').on(table.questionId),
}));

export const insertVoiceNoteResponseSchema = createInsertSchema(voiceNoteResponses).omit({
  id: true,
  createdAt: true,
});

export type VoiceNoteResponse = typeof voiceNoteResponses.$inferSelect;
export type InsertVoiceNoteResponse = z.infer<typeof insertVoiceNoteResponseSchema>;

// ============================================
// ORDER SIGNED DOCUMENTS - Link signed approval documents to orders
// ============================================

export const orderSignedDocuments = pgTable('order_signed_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: text('order_id').notNull(), // Reference to order
  mediaId: uuid('media_id').references(() => mediaLibrary.id, { onDelete: 'cascade' }).notNull(),
  approvalType: text('approval_type').notNull().default('customer_approval'), // 'customer_approval', 'production_approval', 'quality_approval', 'shipping_approval'
  signedBy: text('signed_by').notNull(), // Name of the person who signed
  signedAt: timestamp('signed_at').defaultNow().notNull(),
  notes: text('notes'), // Additional notes about this signature
  createdById: integer('created_by_id').references(() => employees.id),
  createdByName: text('created_by_name'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  orderIdIdx: index('order_signed_documents_order_id_idx').on(table.orderId),
  mediaIdIdx: index('order_signed_documents_media_id_idx').on(table.mediaId),
  approvalTypeIdx: index('order_signed_documents_approval_type_idx').on(table.approvalType),
  signedAtIdx: index('order_signed_documents_signed_at_idx').on(table.signedAt),
}));

export const insertOrderSignedDocumentSchema = createInsertSchema(orderSignedDocuments).omit({
  id: true,
  createdAt: true,
});

export type OrderSignedDocument = typeof orderSignedDocuments.$inferSelect;
export type InsertOrderSignedDocument = z.infer<typeof insertOrderSignedDocumentSchema>;

// ============================================
// SIGNATURE WORKFLOW - Multi-signer document routing
// ============================================

// Main signature request - represents a document that needs signatures
export const signatureRequests = pgTable('signature_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  
  // Document source - either a media file or a form instance
  documentType: text('document_type').notNull(), // 'media', 'form_instance', 'generated_pdf'
  mediaId: uuid('media_id').references(() => mediaLibrary.id, { onDelete: 'set null' }),
  formInstanceId: text('form_instance_id'), // Reference to a form submission if applicable
  
  // Original document path (before any signatures)
  originalDocumentPath: text('original_document_path'),
  // Current document path (with signatures applied so far)
  currentDocumentPath: text('current_document_path'),
  
  // Workflow status
  status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled', 'rejected'
  currentSignerOrder: integer('current_signer_order').default(1), // Which signer is currently active
  
  // Initiator info
  initiatedById: integer('initiated_by_id').references(() => employees.id),
  initiatedByName: text('initiated_by_name').notNull(),
  
  // Optional: link to an order
  orderId: text('order_id'),
  
  // Deadlines and reminders
  dueDate: timestamp('due_date'),
  reminderEnabled: boolean('reminder_enabled').default(true),
  lastReminderSentAt: timestamp('last_reminder_sent_at'),
  
  // Completion tracking
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('signature_requests_status_idx').on(table.status),
  initiatedByIdIdx: index('signature_requests_initiated_by_id_idx').on(table.initiatedById),
  orderIdIdx: index('signature_requests_order_id_idx').on(table.orderId),
  dueDateIdx: index('signature_requests_due_date_idx').on(table.dueDate),
}));

export const insertSignatureRequestSchema = createInsertSchema(signatureRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type InsertSignatureRequest = z.infer<typeof insertSignatureRequestSchema>;

// Individual signers for each request - ordered sequence
export const signatureSigners = pgTable('signature_signers', {
  id: uuid('id').defaultRandom().primaryKey(),
  signatureRequestId: uuid('signature_request_id').references(() => signatureRequests.id, { onDelete: 'cascade' }).notNull(),
  
  // Signer info - can be an employee or external
  employeeId: integer('employee_id').references(() => employees.id),
  signerName: text('signer_name').notNull(),
  signerEmail: text('signer_email'),
  
  // Signing order (1 = first, 2 = second, etc.)
  signOrder: integer('sign_order').notNull().default(1),
  
  // Status tracking
  status: text('status').notNull().default('pending'), // 'pending', 'current', 'completed', 'skipped', 'rejected'
  
  // Signature data when completed
  signatureData: text('signature_data'), // Base64 signature image
  signedAt: timestamp('signed_at'),
  signatureNotes: text('signature_notes'), // Notes from signer
  
  // Rejection info
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  
  // Notification tracking
  notifiedAt: timestamp('notified_at'),
  reminderCount: integer('reminder_count').default(0),
  lastReminderAt: timestamp('last_reminder_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  signatureRequestIdIdx: index('signature_signers_request_id_idx').on(table.signatureRequestId),
  employeeIdIdx: index('signature_signers_employee_id_idx').on(table.employeeId),
  statusIdx: index('signature_signers_status_idx').on(table.status),
  signOrderIdx: index('signature_signers_sign_order_idx').on(table.signOrder),
}));

export const insertSignatureSignerSchema = createInsertSchema(signatureSigners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SignatureSigner = typeof signatureSigners.$inferSelect;
export type InsertSignatureSigner = z.infer<typeof insertSignatureSignerSchema>;

// Signature activity log - tracks all actions on a signature request
export const signatureActivityLog = pgTable('signature_activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  signatureRequestId: uuid('signature_request_id').references(() => signatureRequests.id, { onDelete: 'cascade' }).notNull(),
  signerId: uuid('signer_id').references(() => signatureSigners.id, { onDelete: 'set null' }),
  
  action: text('action').notNull(), // 'created', 'sent', 'viewed', 'signed', 'rejected', 'reminder_sent', 'completed', 'cancelled'
  performedById: integer('performed_by_id').references(() => employees.id),
  performedByName: text('performed_by_name'),
  
  details: jsonb('details'), // Additional action details
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  signatureRequestIdIdx: index('signature_activity_log_request_id_idx').on(table.signatureRequestId),
  actionIdx: index('signature_activity_log_action_idx').on(table.action),
}));

export const insertSignatureActivityLogSchema = createInsertSchema(signatureActivityLog).omit({
  id: true,
  createdAt: true,
});

export type SignatureActivityLog = typeof signatureActivityLog.$inferSelect;
export type InsertSignatureActivityLog = z.infer<typeof insertSignatureActivityLogSchema>;

// Process Runner Events - ingestion from external Timer app
export const processRunnerEvents = pgTable('process_runner_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').notNull().default('process_runner'),
  programRunId: text('program_run_id').notNull(),
  programName: text('program_name').notNull(),
  eventType: text('event_type').notNull(), // 'program_started', 'step_advanced', 'program_completed'
  stepIndex: integer('step_index'),
  totalElapsedMinutes: real('total_elapsed_minutes'),
  eventTimestamp: timestamp('event_timestamp').notNull(),
  metadata: jsonb('metadata'),
  rawPayload: jsonb('raw_payload'), // Store full original payload
  receivedAt: timestamp('received_at').defaultNow(),
}, (table) => ({
  programRunIdIdx: index('process_runner_events_program_run_id_idx').on(table.programRunId),
  eventTypeIdx: index('process_runner_events_event_type_idx').on(table.eventType),
  receivedAtIdx: index('process_runner_events_received_at_idx').on(table.receivedAt),
}));

export const insertProcessRunnerEventSchema = createInsertSchema(processRunnerEvents).omit({
  id: true,
  receivedAt: true,
});

export type ProcessRunnerEvent = typeof processRunnerEvents.$inferSelect;
export type InsertProcessRunnerEvent = z.infer<typeof insertProcessRunnerEventSchema>;

// Process Run Links - Optional associations to EPOCH entities for traceability
export const processRunLinks = pgTable('process_run_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  programRunId: text('program_run_id').notNull(), // References process run by run ID
  entityType: text('entity_type').notNull(), // 'order', 'job', 'work_center'
  entityId: text('entity_id').notNull(), // The ID of the linked entity
  entityLabel: text('entity_label'), // Optional display label (e.g., order number)
  linkedBy: text('linked_by'), // Username who created the link
  linkedAt: timestamp('linked_at').defaultNow(),
}, (table) => ({
  programRunIdIdx: index('process_run_links_program_run_id_idx').on(table.programRunId),
  entityTypeIdx: index('process_run_links_entity_type_idx').on(table.entityType),
  entityIdIdx: index('process_run_links_entity_id_idx').on(table.entityId),
}));

export const insertProcessRunLinkSchema = createInsertSchema(processRunLinks).omit({
  id: true,
  linkedAt: true,
});

export type ProcessRunLink = typeof processRunLinks.$inferSelect;
export type InsertProcessRunLink = z.infer<typeof insertProcessRunLinkSchema>;

// Trusted Timer Integrations - Machine authentication for Process Runner events
export const trustedTimerIntegrations = pgTable('trusted_timer_integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull().unique(), // Unique tenant identifier
  integrationKeyHash: text('integration_key_hash').notNull(), // SHA-256 hash, never plaintext
  description: text('description'), // Optional description for admin reference
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'), // Null = active, set = revoked
}, (table) => ({
  tenantIdIdx: index('trusted_timer_integrations_tenant_id_idx').on(table.tenantId),
}));

export const insertTrustedTimerIntegrationSchema = createInsertSchema(trustedTimerIntegrations).omit({
  id: true,
  createdAt: true,
});

export type TrustedTimerIntegration = typeof trustedTimerIntegrations.$inferSelect;
export type InsertTrustedTimerIntegration = z.infer<typeof insertTrustedTimerIntegrationSchema>;

// Donna Process Runner Observations - Quiet pattern detection
export const donnaProcessObservations = pgTable('donna_process_observations', {
  id: uuid('id').defaultRandom().primaryKey(),
  observationType: text('observation_type').notNull(), // 'duration_deviation', 'pattern_change', 'sequence_impact'
  programName: text('program_name').notNull(), // The program being observed
  observationKey: text('observation_key').notNull(), // Unique key to prevent duplicates
  message: text('message').notNull(), // Human-readable observation
  details: jsonb('details'), // Additional context data
  baselineMinutes: real('baseline_minutes'), // Expected typical duration
  recentAvgMinutes: real('recent_avg_minutes'), // Recent average duration
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'), // Auto-expire stale observations
}, (table) => ({
  programNameIdx: index('donna_process_observations_program_name_idx').on(table.programName),
  observationKeyIdx: index('donna_process_observations_key_idx').on(table.observationKey),
}));

export type DonnaProcessObservation = typeof donnaProcessObservations.$inferSelect;

// Donna Observation Dismissals - Track user dismissals
export const donnaObservationDismissals = pgTable('donna_observation_dismissals', {
  id: uuid('id').defaultRandom().primaryKey(),
  observationKey: text('observation_key').notNull(), // Matches observation's key
  dismissedBy: text('dismissed_by'), // Username who dismissed
  dismissedAt: timestamp('dismissed_at').defaultNow().notNull(),
  cooldownUntil: timestamp('cooldown_until').notNull(), // Don't show again until this time
}, (table) => ({
  observationKeyIdx: index('donna_observation_dismissals_key_idx').on(table.observationKey),
}));

export type DonnaObservationDismissal = typeof donnaObservationDismissals.$inferSelect;

// API Integration Keys - Machine-to-machine authentication for external systems
export const apiIntegrationKeys = pgTable('api_integration_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sourceSystem: text('source_system').notNull(), // 'time_clock', 'process_runner', etc.
  keyHash: text('key_hash').notNull(), // SHA-256 hashed API key
  keyPrefix: text('key_prefix').notNull(), // First 8 chars for identification
  permissions: text('permissions').array().notNull(), // ['emit:labor_events', 'emit:process_events']
  label: text('label'), // Human-readable label
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: text('created_by'),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  tenantSourceIdx: index('api_integration_keys_tenant_source_idx').on(table.tenantId, table.sourceSystem),
  keyPrefixIdx: index('api_integration_keys_prefix_idx').on(table.keyPrefix),
}));

export type ApiIntegrationKey = typeof apiIntegrationKeys.$inferSelect;

// EPOCH External Events - Universal ingestion table for external system events
export const epochExternalEvents = pgTable('epoch_external_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sourceSystem: text('source_system').notNull(), // 'time_clock', 'process_runner', etc.
  eventType: text('event_type').notNull(), // 'TIME_PUNCH_IN', 'TIME_PUNCH_OUT', etc.
  eventId: text('event_id'), // Original event ID from source system
  occurredAt: timestamp('occurred_at').notNull(), // When the event happened
  payload: jsonb('payload').notNull(), // Full event payload as authoritative fact
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  schemaVersion: integer('schema_version').default(1).notNull(),
  deduplicationKey: text('deduplication_key'), // Optional unique key for idempotency
}, (table) => ({
  tenantSourceIdx: index('epoch_external_events_tenant_source_idx').on(table.tenantId, table.sourceSystem),
  eventTypeIdx: index('epoch_external_events_type_idx').on(table.eventType),
  occurredAtIdx: index('epoch_external_events_occurred_at_idx').on(table.occurredAt),
  deduplicationKeyIdx: index('epoch_external_events_dedup_key_idx').on(table.deduplicationKey),
}));

export type EpochExternalEvent = typeof epochExternalEvents.$inferSelect;

// EPOCH Labor Facts - Read-only projection of Time Clock events for traceability
// This table is APPEND-ONLY: no updates, no deletes
// TIME_PUNCH_EDITED creates a new row (correction fact)
// Time Clock remains the sole authority on time - EPOCH only observes
export const epochLaborFacts = pgTable('epoch_labor_facts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sourceEventId: uuid('source_event_id').notNull(), // References epoch_external_events.id
  sourceSystem: text('source_system').default('time_clock').notNull(),
  eventType: text('event_type').notNull(), // TIME_PUNCH_IN, TIME_PUNCH_OUT, TIME_JOB_SWITCH, TIME_PUNCH_EDITED
  occurredAt: timestamp('occurred_at').notNull(), // When the labor event happened
  employeeId: text('employee_id').notNull(), // External reference only - not linked to EPOCH employees
  employeeDisplayName: text('employee_display_name'), // Human-readable name for display
  role: text('role'), // Optional role/position
  siteId: text('site_id'), // Location/site identifier
  jobId: text('job_id'), // Optional job/order reference
  shiftDurationMinutes: integer('shift_duration_minutes'), // Duration if applicable
  dayTotalMinutes: integer('day_total_minutes'), // Running total if provided
  payload: jsonb('payload').notNull(), // Raw authoritative payload from Time Clock
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('epoch_labor_facts_tenant_idx').on(table.tenantId),
  employeeIdx: index('epoch_labor_facts_employee_idx').on(table.tenantId, table.employeeId),
  occurredAtIdx: index('epoch_labor_facts_occurred_at_idx').on(table.occurredAt),
  jobIdIdx: index('epoch_labor_facts_job_id_idx').on(table.jobId),
  siteIdIdx: index('epoch_labor_facts_site_id_idx').on(table.siteId),
  sourceEventIdx: index('epoch_labor_facts_source_event_idx').on(table.sourceEventId),
}));

export type EpochLaborFact = typeof epochLaborFacts.$inferSelect;
export type InsertEpochLaborFact = typeof epochLaborFacts.$inferInsert;

// EPOCH Connector Health - Quiet observability for connector delivery status
// Append-only snapshots per connector per time window
// No alerts, no dashboards - just calm awareness
export const epochConnectorHealth = pgTable('epoch_connector_health', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sourceSystem: text('source_system').notNull(), // 'time_clock', 'process_runner', etc.
  windowStart: timestamp('window_start').notNull(),
  windowEnd: timestamp('window_end').notNull(),
  receivedCount: integer('received_count').default(0).notNull(),
  deliveredCount: integer('delivered_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  lastEventAt: timestamp('last_event_at'),
  lastFailureAt: timestamp('last_failure_at'),
  status: text('status').notNull(), // 'healthy' | 'degraded' | 'offline'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantSourceIdx: index('epoch_connector_health_tenant_source_idx').on(table.tenantId, table.sourceSystem),
  windowIdx: index('epoch_connector_health_window_idx').on(table.windowStart, table.windowEnd),
  statusIdx: index('epoch_connector_health_status_idx').on(table.status),
}));

export type EpochConnectorHealth = typeof epochConnectorHealth.$inferSelect;
export type InsertEpochConnectorHealth = typeof epochConnectorHealth.$inferInsert;

// ============================================================
// EPOCH OUTREACH ENGINE - Deterministic Customer Outreach
// Coverage-style engine: minimum contacts, explicit escalation
// ============================================================

// Outreach Needs - Defined reasons to contact customers
export const epochOutreachNeeds = pgTable('epoch_outreach_needs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: text('tenant_id').notNull(),
  entityType: text('entity_type').notNull(), // 'order' | 'job' | 'invoice'
  entityId: text('entity_id').notNull(),
  reasonCode: text('reason_code').notNull(), // 'order_delayed', 'action_required', 'missing_info', etc.
  requiredResponses: integer('required_responses').default(1).notNull(),
  status: text('status').default('open').notNull(), // 'open' | 'fulfilled' | 'exhausted'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  fulfilledAt: timestamp('fulfilled_at'),
}, (table) => ({
  tenantIdx: index('epoch_outreach_needs_tenant_idx').on(table.tenantId),
  entityIdx: index('epoch_outreach_needs_entity_idx').on(table.entityType, table.entityId),
  statusIdx: index('epoch_outreach_needs_status_idx').on(table.status),
  reasonIdx: index('epoch_outreach_needs_reason_idx').on(table.reasonCode),
}));

export type EpochOutreachNeed = typeof epochOutreachNeeds.$inferSelect;
export type InsertEpochOutreachNeed = typeof epochOutreachNeeds.$inferInsert;

// Outreach Candidates - Potential contacts for each need
export const epochOutreachCandidates = pgTable('epoch_outreach_candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  outreachNeedId: uuid('outreach_need_id').notNull().references(() => epochOutreachNeeds.id),
  contactId: text('contact_id').notNull(), // Reference to customer/contact
  contactName: text('contact_name'), // Display name for reference
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  channelPreference: text('channel_preference').default('email').notNull(), // 'email' | 'sms'
  priority: integer('priority').default(0).notNull(), // Lower = higher priority
  status: text('status').default('pending').notNull(), // 'pending' | 'contacted' | 'responded' | 'declined' | 'skipped'
  attemptCount: integer('attempt_count').default(0).notNull(),
  lastAttemptAt: timestamp('last_attempt_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  needIdx: index('epoch_outreach_candidates_need_idx').on(table.outreachNeedId),
  statusIdx: index('epoch_outreach_candidates_status_idx').on(table.status),
  priorityIdx: index('epoch_outreach_candidates_priority_idx').on(table.priority),
}));

export type EpochOutreachCandidate = typeof epochOutreachCandidates.$inferSelect;
export type InsertEpochOutreachCandidate = typeof epochOutreachCandidates.$inferInsert;

// Outreach Attempts - Record of each contact attempt
export const epochOutreachAttempts = pgTable('epoch_outreach_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  outreachCandidateId: uuid('outreach_candidate_id').notNull().references(() => epochOutreachCandidates.id),
  channelUsed: text('channel_used').notNull(), // 'email' | 'sms'
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  outcome: text('outcome').notNull(), // 'sent' | 'failed' | 'responded'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  candidateIdx: index('epoch_outreach_attempts_candidate_idx').on(table.outreachCandidateId),
  outcomeIdx: index('epoch_outreach_attempts_outcome_idx').on(table.outcome),
  sentAtIdx: index('epoch_outreach_attempts_sent_at_idx').on(table.sentAt),
}));

export type EpochOutreachAttempt = typeof epochOutreachAttempts.$inferSelect;
export type InsertEpochOutreachAttempt = typeof epochOutreachAttempts.$inferInsert;



// ============================================================
// FIELD - Calm Thinking Surface (Unstructured, Opaque)
// Field is intentionally unstructured
// Field does not affect EPOCH data
// No automation or integration is allowed here
// All transitions out of Field are human-initiated
// ============================================================

export const fieldState = pgTable('field_state', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().unique(), // Single user only: admin_glennj
  state: jsonb('state').notNull().default({}), // Opaque JSON blob - no schema, no validation
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('field_state_user_idx').on(table.userId),
}));

export type FieldState = typeof fieldState.$inferSelect;
export type InsertFieldState = typeof fieldState.$inferInsert;

// ============================================================
// TICKETING SYSTEM - Internal CSR Tool
// Phase 0: Basic ticket tracking for complaints, order status, internal issues
// ============================================================

export const ticketTypeEnum = pgEnum('ticket_type', ['customer', 'internal', 'technical']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'normal', 'high']);
export const ticketStatusEnum = pgEnum('ticket_status', [
  'new',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_production',
  'resolved',
  'closed'
]);
export const ticketActivityTypeEnum = pgEnum('ticket_activity_type', [
  'comment',
  'status_change',
  'assignment',
  'priority_change'
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketType: ticketTypeEnum('ticket_type').notNull().default('customer'),
  category: text('category'),
  priority: ticketPriorityEnum('priority').notNull().default('normal'),
  status: ticketStatusEnum('status').notNull().default('new'),
  title: text('title').notNull(),
  description: text('description'),
  customerId: integer('customer_id'), // Nullable - tickets may not have a customer
  ownerUserId: integer('owner_user_id').notNull(), // Original creator of the ticket
  assignedUserId: integer('assigned_user_id'), // Legacy: single person assigned (kept for backwards compatibility)
  assignedUserIds: jsonb('assigned_user_ids').$type<number[]>().default(sql`'[]'::jsonb`), // Multiple assignees
  slaDueAt: timestamp('sla_due_at'),
  slaBreached: boolean('sla_breached').default(false),
  lastActivityAt: timestamp('last_activity_at').defaultNow(), // Last time ticket was updated/commented
  reminderCount: integer('reminder_count').default(0), // Number of stale reminders sent
  lastReminderAt: timestamp('last_reminder_at'), // When last reminder was sent
  viewedBy: jsonb('viewed_by').$type<Record<string, string>>().default(sql`'{}'::jsonb`), // { [userId]: ISO timestamp } - tracks who viewed and when
  // State confirmation fields for Attention & State-Confidence system
  lastConfirmedAt: timestamp('last_confirmed_at'), // When state was last confirmed as accurate
  lastConfirmedByUserId: integer('last_confirmed_by_user_id'), // Who confirmed the state
  confirmationNote: text('confirmation_note'), // Optional short note with confirmation
  attentionRisk: text('attention_risk').$type<'low' | 'medium' | 'high'>(), // Computed staleness risk level
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (table) => ({
  statusIdx: index('tickets_status_idx').on(table.status),
  priorityIdx: index('tickets_priority_idx').on(table.priority),
  ownerIdx: index('tickets_owner_idx').on(table.ownerUserId),
  assignedIdx: index('tickets_assigned_idx').on(table.assignedUserId),
  slaIdx: index('tickets_sla_idx').on(table.slaDueAt),
  typeIdx: index('tickets_type_idx').on(table.ticketType),
  attentionRiskIdx: index('tickets_attention_risk_idx').on(table.attentionRisk),
}));

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastActivityAt: true,
  reminderCount: true,
  lastReminderAt: true,
  viewedBy: true,
  lastConfirmedAt: true,
  lastConfirmedByUserId: true,
  attentionRisk: true,
});

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

// Junction table for many-to-many relationship between tickets and orders
export const ticketOrders = pgTable('ticket_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  orderId: text('order_id').notNull(), // Order ID string (e.g., "AG589")
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  ticketIdx: index('ticket_orders_ticket_idx').on(table.ticketId),
  orderIdx: index('ticket_orders_order_idx').on(table.orderId),
  uniqueTicketOrder: unique('unique_ticket_order').on(table.ticketId, table.orderId),
}));

export type TicketOrder = typeof ticketOrders.$inferSelect;
export type InsertTicketOrder = typeof ticketOrders.$inferInsert;

// Activity log for tickets - all changes and comments
export const ticketActivity = pgTable('ticket_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  activityType: ticketActivityTypeEnum('activity_type').notNull(),
  message: text('message'),
  previousValue: text('previous_value'), // For tracking changes
  newValue: text('new_value'), // For tracking changes
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  ticketIdx: index('ticket_activity_ticket_idx').on(table.ticketId),
  createdAtIdx: index('ticket_activity_created_at_idx').on(table.createdAt),
}));

export const insertTicketActivitySchema = createInsertSchema(ticketActivity).omit({
  id: true,
  createdAt: true,
});

export type TicketActivity = typeof ticketActivity.$inferSelect;
export type InsertTicketActivity = z.infer<typeof insertTicketActivitySchema>;

// ========================================================================
// MISSING PRODUCTION TABLES - Added for schema alignment
// ========================================================================

// Additional stocks for order drafts
export const additionalStocks = pgTable('additional_stocks', {
  id: integer('id').primaryKey(),
  orderDraftId: integer('order_draft_id').notNull(),
  stockNumber: integer('stock_number').notNull(),
  modelId: text('model_id'),
  handedness: text('handedness'),
  shankLength: text('shank_length'),
  features: jsonb('features'),
  featureQuantities: jsonb('feature_quantities'),
  tikkaOption: text('tikka_option'),
  priceOverride: real('price_override'),
  currentDepartment: text('current_department'),
  departmentHistory: jsonb('department_history'),
  layupCompletedAt: timestamp('layup_completed_at'),
  pluggingCompletedAt: timestamp('plugging_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  status: text('status'),
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  isCustomOrder: text('is_custom_order'),
});

// Chatbot conversations
export const chatbotConversations = pgTable('chatbot_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id'),
  username: text('username'),
  query: text('query').notNull(),
  response: text('response').notNull(),
  queryType: text('query_type'),
  referencedInventoryIds: text('referenced_inventory_ids').array(),
  referencedKnowledgeIds: text('referenced_knowledge_ids').array(),
  wasHelpful: boolean('was_helpful'),
  feedbackNotes: text('feedback_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Chatbot knowledge base
export const chatbotKnowledgeBase = pgTable('chatbot_knowledge_base', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  documentType: text('document_type').notNull(),
  category: text('category'),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  extractedText: text('extracted_text'),
  keywords: text('keywords').array(),
  relatedPartNumbers: text('related_part_numbers').array(),
  relatedMaterials: text('related_materials').array(),
  isActive: boolean('is_active').notNull().default(true),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  lastAccessedAt: timestamp('last_accessed_at'),
  accessCount: integer('access_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// EPOCH Copilot conversations
export const epochCopilotConversations = pgTable('epoch_copilot_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id'),
  username: text('username').notNull(),
  title: text('title').notNull().default('New Copilot conversation'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const epochCopilotMessages = pgTable('epoch_copilot_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => epochCopilotConversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const epochCopilotDraftGuides = pgTable('epoch_copilot_draft_guides', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  prompt: text('prompt'),
  guide: jsonb('guide').notNull(),
  createdByUserId: text('created_by_user_id'),
  createdByUsername: text('created_by_username').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Checklist metadata
export const checklistMetadata = pgTable('checklist_metadata', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  frequency: frequencyTypeEnum('frequency').notNull().default('DAILY'),
  reportRecipients: integer('report_recipients').array(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cut yield configs
export const cutYieldConfigs = pgTable('cut_yield_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  partNumber: text('part_number'),
  partName: text('part_name').notNull(),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  fabricType: text('fabric_type'),
  cutsPerRoll: integer('cuts_per_roll'),
  yieldPerCut: integer('yield_per_cut').notNull().default(1),
  squareMetersPerCut: numeric('square_meters_per_cut', { precision: 10, scale: 4 }),
  wasteFactor: numeric('waste_factor', { precision: 5, scale: 4 }).default('0.05'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting packet schedule
export const cuttingPacketSchedule = pgTable('cutting_packet_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetType: varchar('packet_type').notNull(),
  packetBomId: uuid('packet_bom_id'),
  mfgQueueItemId: integer('mfg_queue_item_id'),
  partNumber: varchar('part_number'),
  partName: varchar('part_name'),
  quantityNeeded: integer('quantity_needed').default(1),
  quantityCompleted: integer('quantity_completed').default(0),
  priority: integer('priority').default(50),
  scheduledDate: date('scheduled_date'),
  scheduledBy: varchar('scheduled_by'),
  assignedOperator: varchar('assigned_operator'),
  status: varchar('status').default('SCHEDULED'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cutting run log
export const cuttingRunLog = pgTable('cutting_run_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetScheduleId: uuid('packet_schedule_id').references(() => cuttingPacketSchedule.id),
  plyScheduleId: uuid('ply_schedule_id').references(() => plySchedule.id),
  operatorName: varchar('operator_name').notNull(),
  fabricInventoryId: uuid('fabric_inventory_id'),
  fabricType: varchar('fabric_type'),
  fabricLot: varchar('fabric_lot'),
  fabricBatch: varchar('fabric_batch'),
  fabricRoll: varchar('fabric_roll'),
  freezerLocation: varchar('freezer_location'),
  sessionStartedAt: timestamp('session_started_at').defaultNow(),
  sessionCompletedAt: timestamp('session_completed_at'),
  cutsCompleted: integer('cuts_completed').default(0),
  partsYielded: integer('parts_yielded').default(0),
  squareMetersUsed: numeric('square_meters_used'),
  isRollEmpty: boolean('is_roll_empty').default(false),
  rollRemainingMeters: numeric('roll_remaining_meters'),
  labelsGenerated: integer('labels_generated').default(0),
  labelsPrinted: boolean('labels_printed').default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Daily task notifications
export const dailyTaskNotifications = pgTable('daily_task_notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  notifyUserId: integer('notify_user_id').notNull().references(() => users.id),
  taskDate: date('task_date').notNull(),
  notificationTime: text('notification_time').notNull(),
  message: text('message'),
  sent: boolean('sent').notNull().default(false),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily tasks
export const dailyTasks = pgTable('daily_tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  taskDate: date('task_date').notNull(),
  taskType: taskTypeEnum('task_type').notNull().default('RECURRING'),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  priority: integer('priority').notNull().default(3),
  isCompleted: boolean('is_completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
  dueTime: text('due_time'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Fabric receiving log
export const fabricReceivingLog = pgTable('fabric_receiving_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  fabricInventoryId: uuid('fabric_inventory_id').references(() => cuttingFabricInventory.id),
  receivedDate: timestamp('received_date').notNull().defaultNow(),
  receivedBy: text('received_by'),
  vendorName: text('vendor_name'),
  purchaseOrderNumber: text('purchase_order_number'),
  materialType: text('material_type').notNull(),
  fabricName: text('fabric_name'),
  lotNumber: text('lot_number').notNull(),
  batchNumber: text('batch_number'),
  rollNumber: text('roll_number'),
  manufactureDate: date('manufacture_date'),
  expirationDate: date('expiration_date'),
  quantityReceived: integer('quantity_received').notNull().default(1),
  squareMeters: numeric('square_meters', { precision: 10, scale: 2 }),
  freezerNumber: integer('freezer_number'),
  conformanceDocumentPath: text('conformance_document_path'),
  inspectionStatus: text('inspection_status').default('PENDING'),
  inspectedBy: text('inspected_by'),
  inspectedAt: timestamp('inspected_at'),
  notes: text('notes'),
  barcode: text('barcode'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Freezer locations
export const freezerLocations = pgTable('freezer_locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  freezerNumber: integer('freezer_number').notNull(),
  name: text('name'),
  description: text('description'),
  temperature: numeric('temperature', { precision: 4, scale: 1 }),
  isActive: boolean('is_active').notNull().default(true),
  capacity: integer('capacity'),
  currentItemCount: integer('current_item_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Layup orders
export const layupOrders = pgTable('layup_orders', {
  id: integer('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  priorityScore: integer('priority_score').notNull(),
  department: text('department').notNull(),
  status: text('status').notNull(),
  customer: text('customer').notNull(),
  product: text('product').notNull(),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// Migration audit
export const migrationAudit = pgTable('migration_audit', {
  id: serial('id').primaryKey(),
  tableSource: text('table_source').notNull(),
  orderId: text('order_id'),
  action: text('action').notNull(),
  reason: text('reason'),
  originalData: jsonb('original_data'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Non-conforming items
export const nonConformingItems = pgTable('non_conforming_items', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  p1OrP2: text('p1_or_p2').notNull(),
  customer: text('customer').notNull(),
  sku: text('sku').notNull(),
  qty: integer('qty').notNull().default(1),
  issueCause: text('issue_cause').notNull(),
  manufacturerDefect: boolean('manufacturer_defect').notNull().default(false),
  disposition: text('disposition').notNull(),
  authorization: text('authorization').notNull(),
  serialTagNumber: text('serial_tag_number'),
  dispositionDate: date('disposition_date'),
  correctiveActionNotes: text('corrective_action_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Notification triggers
export const notificationTriggers = pgTable('notification_triggers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  customerId: integer('customer_id'),
  customerName: text('customer_name'),
  targetDepartment: text('target_department').notNull(),
  recipientUserId: integer('recipient_user_id').references(() => users.id),
  recipientUsername: text('recipient_username').notNull(),
  triggerOnFirstEntry: boolean('trigger_on_first_entry').default(false),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Order departments tracking
export const orderDepartments = pgTable('order_departments', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => ordersUnified.orderId),
  department: text('department').notNull(),
  completedAt: timestamp('completed_at').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Order drafts
export const orderDrafts = pgTable('order_drafts', {
  id: integer('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  customerId: text('customer_id'),
  customerPO: text('customer_po'),
  fbOrderNumber: text('fb_order_number'),
  agrOrderDetails: text('agr_order_details'),
  modelId: text('model_id'),
  handedness: text('handedness'),
  features: jsonb('features'),
  featureQuantities: jsonb('feature_quantities'),
  discountCode: text('discount_code'),
  shipping: real('shipping'),
  status: text('status'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  shankLength: text('shank_length'),
  tikkaOption: text('tikka_option'),
  customDiscountType: text('custom_discount_type'),
  customDiscountValue: real('custom_discount_value'),
  showCustomDiscount: boolean('show_custom_discount'),
  isCustomOrder: text('is_custom_order'),
  priceOverride: real('price_override'),
  barcode: text('barcode'),
  currentDepartment: text('current_department').default('P1 Production Queue'),
  departmentHistory: jsonb('department_history'),
  scrappedQuantity: integer('scrapped_quantity'),
  totalProduced: integer('total_produced'),
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  isReplacement: boolean('is_replacement'),
  replacedOrderId: text('replaced_order_id'),
  layupCompletedAt: timestamp('layup_completed_at'),
  pluggingCompletedAt: timestamp('plugging_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  notes: text('notes'),
  departmentNotes: jsonb('department_notes').$type<Array<{ id?: string; text: string; departments: string[] }>>().default(sql`'[]'::jsonb`),
  isPaid: boolean('is_paid'),
  paymentType: text('payment_type'),
  paymentAmount: real('payment_amount'),
  paymentDate: timestamp('payment_date'),
  paymentTimestamp: timestamp('payment_timestamp'),
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier'),
  shippingMethod: text('shipping_method'),
  shippedDate: timestamp('shipped_date'),
  estimatedDelivery: timestamp('estimated_delivery'),
  shippingLabelGenerated: boolean('shipping_label_generated'),
  customerNotified: boolean('customer_notified'),
  notificationMethod: text('notification_method'),
  notificationSentAt: timestamp('notification_sent_at'),
  deliveryConfirmed: boolean('delivery_confirmed'),
  deliveryConfirmedAt: timestamp('delivery_confirmed_at'),
  p1ProductionQueueCompletedAt: timestamp('p1_production_queue_completed_at'),
  layupPluggingCompletedAt: timestamp('layup_plugging_completed_at'),
  barcodeCompletedAt: timestamp('barcode_completed_at'),
  finishAssignmentCompletedAt: timestamp('finish_assignment_completed_at'),
  qcFinishCompletedAt: timestamp('qc_finish_completed_at'),
  qcShippingCompletedAt: timestamp('qc_shipping_completed_at'),
  source: text('source'),
  isFlattop: boolean('is_flattop'),
  isVerified: boolean('is_verified'),
  assignedTechnician: text('assigned_technician'),
  isManualDueDate: boolean('is_manual_due_date'),
  isManualOrderDate: boolean('is_manual_order_date'),
  hasAltShipTo: boolean('has_alt_ship_to'),
  altShipToCustomerId: text('alt_ship_to_customer_id'),
  altShipToName: text('alt_ship_to_name'),
  altShipToCompany: text('alt_ship_to_company'),
  altShipToEmail: text('alt_ship_to_email'),
  altShipToPhone: text('alt_ship_to_phone'),
  altShipToAddress: jsonb('alt_ship_to_address'),
  specialShippingInternational: boolean('special_shipping_international'),
  specialShippingNextDayAir: boolean('special_shipping_next_day_air'),
  specialShippingBillToReceiver: boolean('special_shipping_bill_to_receiver'),
  statusId: integer('status_id').references(() => orderStatuses.id),
  currentDepartmentId: integer('current_department_id').references(() => orderDepartments.id),
  qdSameSideConfirmed: boolean('qd_same_side_confirmed').default(false),
  qdSameSideConfirmedBy: text('qd_same_side_confirmed_by'),
  qdSameSideConfirmedAt: timestamp('qd_same_side_confirmed_at'),
});

// Order statuses
export const orderStatuses = pgTable('order_statuses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Orders unified
export const ordersUnified = pgTable('orders_unified', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  orderDate: timestamp('order_date').notNull(),
  dueDate: timestamp('due_date'),
  customerId: text('customer_id'),
  customerPO: text('customer_po'),
  fbOrderNumber: text('fb_order_number'),
  agrOrderDetails: text('agr_order_details'),
  isFlattop: boolean('is_flattop').default(false),
  isCustomOrder: text('is_custom_order'),
  modelId: text('model_id'),
  handedness: text('handedness'),
  shankLength: text('shank_length'),
  features: jsonb('features'),
  featureQuantities: jsonb('feature_quantities'),
  discountCode: text('discount_code'),
  notes: text('notes'),
  customDiscountType: text('custom_discount_type').default('percent'),
  customDiscountValue: real('custom_discount_value').default(0),
  showCustomDiscount: boolean('show_custom_discount').default(false),
  priceOverride: real('price_override'),
  shipping: real('shipping').default(0),
  tikkaOption: text('tikka_option'),
  status: orderStatusEnum('status').notNull(),
  barcode: text('barcode'),
  currentDepartment: text('current_department'),
  scrappedQuantity: integer('scrapped_quantity').default(0),
  totalProduced: integer('total_produced').default(0),
  layupCompletedAt: timestamp('layup_completed_at'),
  pluggingCompletedAt: timestamp('plugging_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
  gunsmithCompletedAt: timestamp('gunsmith_completed_at'),
  paintCompletedAt: timestamp('paint_completed_at'),
  qcCompletedAt: timestamp('qc_completed_at'),
  shippingCompletedAt: timestamp('shipping_completed_at'),
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  isReplacement: boolean('is_replacement').default(false),
  replacedOrderId: text('replaced_order_id'),
  isPaid: boolean('is_paid').default(false),
  paymentType: text('payment_type'),
  paymentAmount: real('payment_amount'),
  paymentDate: timestamp('payment_date'),
  paymentTimestamp: timestamp('payment_timestamp'),
  trackingNumber: text('tracking_number'),
  shippingCarrier: text('shipping_carrier').default('UPS'),
  shippingMethod: text('shipping_method').default('Ground'),
  shippedDate: timestamp('shipped_date'),
  estimatedDelivery: timestamp('estimated_delivery'),
  shippingLabelGenerated: boolean('shipping_label_generated').default(false),
  customerNotified: boolean('customer_notified').default(false),
  notificationMethod: text('notification_method'),
  notificationSentAt: timestamp('notification_sent_at'),
  deliveryConfirmed: boolean('delivery_confirmed').default(false),
  deliveryConfirmedAt: timestamp('delivery_confirmed_at'),
  isCancelled: boolean('is_cancelled').default(false),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  isVerified: boolean('is_verified').default(false),
  isManualDueDate: boolean('is_manual_due_date').default(false),
  isManualOrderDate: boolean('is_manual_order_date').default(false),
  hasAltShipTo: boolean('has_alt_ship_to').default(false),
  altShipToCustomerId: text('alt_ship_to_customer_id'),
  altShipToName: text('alt_ship_to_name'),
  altShipToCompany: text('alt_ship_to_company'),
  altShipToEmail: text('alt_ship_to_email'),
  altShipToPhone: text('alt_ship_to_phone'),
  altShipToAddress: jsonb('alt_ship_to_address'),
  specialShippingInternational: boolean('special_shipping_international').default(false),
  specialShippingNextDayAir: boolean('special_shipping_next_day_air').default(false),
  specialShippingBillToReceiver: boolean('special_shipping_bill_to_receiver').default(false),
  assignedTechnician: text('assigned_technician'),
  customer: text('customer'),
  product: text('product'),
  quantity: integer('quantity'),
  date: timestamp('date'),
  isOnSchedule: boolean('is_on_schedule').default(true),
  priorityScore: integer('priority_score').default(9999), // DEPRECATED: Use computeEffectivePriority()
  rushTier: text('rush_tier'),
  poId: integer('po_id'),
  itemId: text('item_id'),
  stockModelId: text('stock_model_id'),
});

// P1 packet inventory
export const p1PacketInventory = pgTable('p1_packet_inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetType: text('packet_type').notNull(),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  productionLineId: uuid('production_line_id').references(() => cuttingProductionLines.id),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  minimumThreshold: integer('minimum_threshold').notNull().default(400),
  reorderPoint: integer('reorder_point').default(450),
  maxCapacity: integer('max_capacity'),
  location: text('location'),
  lastCountDate: date('last_count_date'),
  lastCountedBy: text('last_counted_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P1 packet manufacturing queue
export const p1PacketManufacturingQueue = pgTable('p1_packet_manufacturing_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  weekStartDate: date('week_start_date').notNull(),
  packetInventoryId: uuid('packet_inventory_id').references(() => p1PacketInventory.id),
  productCategoryId: uuid('product_category_id').references(() => cuttingProductCategories.id),
  packetType: text('packet_type').notNull(),
  quantityScheduled: integer('quantity_scheduled').notNull(),
  quantityProduced: integer('quantity_produced').default(0),
  quantityRemainingFromPrevious: integer('quantity_remaining_from_previous').default(0),
  status: text('status').notNull().default('PENDING'),
  priority: integer('priority').default(50),
  dueDate: date('due_date'),
  assignedTo: text('assigned_to'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P1 packet production records
export const p1PacketProductionRecords = pgTable('p1_packet_production_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  queueItemId: uuid('queue_item_id').references(() => p1PacketManufacturingQueue.id),
  packetInventoryId: uuid('packet_inventory_id').references(() => p1PacketInventory.id),
  productionDate: date('production_date').notNull(),
  quantityProduced: integer('quantity_produced').notNull(),
  fabricInventoryId: uuid('fabric_inventory_id').references(() => cuttingFabricInventory.id),
  fabricLot: text('fabric_lot'),
  fabricBatch: text('fabric_batch'),
  fabricRoll: text('fabric_roll'),
  fabricExpirationDate: date('fabric_expiration_date'),
  cutYieldConfigId: uuid('cut_yield_config_id').references(() => cutYieldConfigs.id),
  cutsPerformed: integer('cuts_performed'),
  squareMetersUsed: numeric('square_meters_used', { precision: 10, scale: 4 }),
  producedBy: text('produced_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Packet compositions
export const packetCompositions = pgTable('packet_compositions', {
  id: uuid('id').defaultRandom().primaryKey(),
  productCategoryId: uuid('product_category_id').notNull().references(() => cuttingProductCategories.id),
  componentId: uuid('component_id').notNull().references(() => cuttingComponents.id),
  quantityPerPacket: integer('quantity_per_packet').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Ply schedule
export const plySchedule = pgTable('ply_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name'),
  packetBomId: uuid('packet_bom_id'),
  packetScheduleId: uuid('packet_schedule_id').references(() => cuttingPacketSchedule.id),
  totalPlies: integer('total_plies').default(0),
  totalCuts: integer('total_cuts').default(0),
  status: varchar('status').default('DRAFT'),
  createdBy: varchar('created_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Ply schedule items
export const plyScheduleItems = pgTable('ply_schedule_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  plyScheduleId: uuid('ply_schedule_id').notNull().references(() => plySchedule.id),
  sortOrder: integer('sort_order').default(0),
  partNumber: varchar('part_number'),
  partDescription: varchar('part_description'),
  fabricType: varchar('fabric_type'),
  materialPartNumber: varchar('material_part_number'),
  cutsNeeded: integer('cuts_needed').default(1),
  cutsCompleted: integer('cuts_completed').default(0),
  partsPerCut: integer('parts_per_cut').default(1),
  status: varchar('status').default('PENDING'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sessions
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  sessionToken: text('session_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Survey questions (for generic survey engine)
export const surveyQuestions = pgTable('survey_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id').notNull().references(() => surveys.id),
  questionText: text('question_text').notNull(),
  questionType: surveyQuestionTypeEnum('question_type').notNull(),
  isRequired: boolean('is_required').default(false),
  sortOrder: integer('sort_order').default(0),
  options: jsonb('options'),
  settings: jsonb('settings'),
  conditionalLogic: jsonb('conditional_logic'),
  placeholder: text('placeholder'),
  helpText: text('help_text'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Survey response answers
export const surveyResponseAnswers = pgTable('survey_response_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  responseId: uuid('response_id').notNull().references(() => surveyResponses.id),
  questionId: uuid('question_id').notNull().references(() => surveyQuestions.id),
  answerValue: text('answer_value'),
  answerNumeric: real('answer_numeric'),
  answerJson: jsonb('answer_json'),
  answeredAt: timestamp('answered_at').defaultNow(),
});

// Survey send log
export const surveySendLog = pgTable('survey_send_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id').notNull().references(() => surveys.id),
  triggerId: uuid('trigger_id').references(() => surveyTriggers.id),
  orderId: text('order_id').notNull(),
  customerId: text('customer_id'),
  customerEmail: text('customer_email'),
  responseId: uuid('response_id').references(() => surveyResponses.id),
  sentAt: timestamp('sent_at').defaultNow(),
  sentVia: text('sent_via').default('email'),
  status: text('status').default('sent'),
});

// Survey triggers
export const surveyTriggers = pgTable('survey_triggers', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id').notNull().references(() => surveys.id),
  triggerStatus: text('trigger_status').notNull(),
  delayDays: integer('delay_days').default(0),
  emailSubject: text('email_subject').default("We'd love your feedback!"),
  emailBody: text('email_body'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Task templates
export const taskTemplates = pgTable('task_templates', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  priority: integer('priority').notNull().default(3),
  dueTime: text('due_time'),
  isActive: boolean('is_active').notNull().default(true),
  daysOfWeek: text('days_of_week').array(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  checklistId: integer('checklist_id').references(() => checklistMetadata.id),
  dayOfMonth: integer('day_of_month'),
});

// Training attendees
export const trainingAttendees = pgTable('training_attendees', {
  id: serial('id').primaryKey(),
  attendeeId: text('attendee_id').notNull(),
  sessionId: text('session_id').notNull().references(() => trainingSessions.sessionId),
  employeeId: integer('employee_id'),
  employeeName: text('employee_name').notNull(),
  employeeNumber: text('employee_number'),
  department: text('department'),
  signedInAt: timestamp('signed_in_at').defaultNow(),
  signedOutAt: timestamp('signed_out_at'),
  attendanceStatus: text('attendance_status').notNull().default('PRESENT'),
  quizStartedAt: timestamp('quiz_started_at'),
  quizCompletedAt: timestamp('quiz_completed_at'),
  quizScore: integer('quiz_score'),
  quizResponses: jsonb('quiz_responses'),
  passed: boolean('passed').default(false),
  certificateGenerated: boolean('certificate_generated').default(false),
  certificateGeneratedAt: timestamp('certificate_generated_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training completions
export const trainingCompletions = pgTable('training_completions', {
  id: serial('id').primaryKey(),
  moduleId: integer('module_id').notNull().references(() => trainingModules.id),
  employeeId: varchar('employee_id', { length: 50 }).notNull(),
  employeeName: varchar('employee_name', { length: 255 }).notNull(),
  score: integer('score').notNull(),
  passed: boolean('passed').notNull(),
  answers: jsonb('answers').notNull(),
  certificateIssued: boolean('certificate_issued').default(false),
  completedAt: timestamp('completed_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});

// Training quiz answers
export const trainingQuizAnswers = pgTable('training_quiz_answers', {
  id: serial('id').primaryKey(),
  questionId: integer('question_id').notNull().references(() => trainingQuizQuestions.id),
  answerText: text('answer_text').notNull(),
  sortOrder: integer('sort_order').default(0),
  isCorrect: boolean('is_correct').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training quiz questions
export const trainingQuizQuestions = pgTable('training_quiz_questions', {
  id: serial('id').primaryKey(),
  moduleId: integer('module_id').notNull().references(() => trainingModules.id),
  question: text('question').notNull(),
  questionType: text('question_type').notNull().default('multiple_choice'),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training sessions
export const trainingSessions = pgTable('training_sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  topic: text('topic').notNull(),
  description: text('description'),
  instructorId: integer('instructor_id'),
  instructorName: text('instructor_name').notNull(),
  sessionDate: timestamp('session_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  location: text('location').default('Conference Room'),
  maxAttendees: integer('max_attendees').default(50),
  materials: jsonb('materials'),
  quizQuestions: jsonb('quiz_questions'),
  passingScore: integer('passing_score').default(80),
  status: text('status').notNull().default('SCHEDULED'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Vendor evaluations
export const vendorEvaluations = pgTable('vendor_evaluations', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  evaluationMonth: date('evaluation_month').notNull(),
  qualityScore: integer('quality_score'),
  deliveryRating: integer('delivery_rating'),
  deliveryOccurrence: integer('delivery_occurrence'),
  costScore: integer('cost_score'),
  communicationScore: integer('communication_score'),
  aggregateScore: real('aggregate_score'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Vendor PO optional settings
export const vendorPoOptionalSettings = pgTable('vendor_po_optional_settings', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Vendor PO specific settings
export const vendorPoSpecificSettings = pgTable('vendor_po_specific_settings', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id').notNull().references(() => vendorPOs.id),
  selectedOptionalSettings: integer('selected_optional_settings').array().default([]),
  adHocSettings: text('ad_hoc_settings'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export * from './calendar.schema';

// ============================================================================
// DOCUMENT MANAGEMENT SYSTEM - Routing Documents, Spec Sheets, Templates
// ============================================================================

// Routing Documents - Uploaded or system-generated documents linked to routings
export const routingDocuments = pgTable('routing_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  partRoutingId: uuid('part_routing_id'),
  partNumber: varchar('part_number', { length: 255 }),
  departmentName: varchar('department_name', { length: 255 }),
  
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  
  documentType: varchar('document_type', { length: 100 }).notNull().default('work_instruction'),
  sourceType: varchar('source_type', { length: 50 }).notNull().default('uploaded'),
  
  fileUrl: text('file_url'),
  fileName: varchar('file_name', { length: 500 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'),
  
  extractedText: text('extracted_text'),
  aiExtractedContent: jsonb('ai_extracted_content'),
  aiExtractedFields: jsonb('ai_extracted_fields'),
  aiProcessedAt: timestamp('ai_processed_at', { withTimezone: true }),
  
  isTemplate: boolean('is_template').default(false),
  isActive: boolean('is_active').default(true),
  
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  partRoutingIdx: index('routing_documents_part_routing_idx').on(table.partRoutingId),
  partNumberIdx: index('routing_documents_part_number_idx').on(table.partNumber),
  departmentIdx: index('routing_documents_department_idx').on(table.departmentName),
}));

// Spec Sheets - Generalized specification documents
export const specSheets = pgTable('spec_sheets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  partRoutingId: uuid('part_routing_id'),
  partNumber: varchar('part_number', { length: 255 }),
  
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  version: integer('version').default(1).notNull(),
  
  sourceType: varchar('source_type', { length: 50 }).notNull().default('uploaded'),
  
  fileUrl: text('file_url'),
  fileName: varchar('file_name', { length: 500 }),
  fileType: varchar('file_type', { length: 100 }),
  fileSize: integer('file_size'),
  
  specifications: jsonb('specifications'),
  aiExtractedContent: jsonb('ai_extracted_content'),
  aiExtractedFields: jsonb('ai_extracted_fields'),
  aiProcessedAt: timestamp('ai_processed_at', { withTimezone: true }),
  
  isTemplate: boolean('is_template').default(false),
  isActive: boolean('is_active').default(true),
  
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  partRoutingIdx: index('spec_sheets_part_routing_idx').on(table.partRoutingId),
  partNumberIdx: index('spec_sheets_part_number_idx').on(table.partNumber),
}));

// Document Templates - AI-learned templates from past documents
export const documentTemplates = pgTable('document_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  
  templateName: varchar('template_name', { length: 500 }).notNull(),
  templateType: varchar('template_type', { length: 100 }).notNull(),
  description: text('description'),
  
  sourceDocumentIds: text('source_document_ids').array(),
  learnedFromCount: integer('learned_from_count').default(0),
  
  structure: jsonb('structure'),
  sections: jsonb('sections'),
  defaultFields: jsonb('default_fields'),
  
  aiGeneratedPrompt: text('ai_generated_prompt'),
  
  isActive: boolean('is_active').default(true),
  
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  templateTypeIdx: index('document_templates_type_idx').on(table.templateType),
}));

// Template Fields - Configurable fields for document templates
export const templateFields = pgTable('template_fields', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'cascade' }).notNull(),
  
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  fieldLabel: varchar('field_label', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull().default('text'),
  
  isRequired: boolean('is_required').default(false),
  isUniquePerSerial: boolean('is_unique_per_serial').default(false),
  
  defaultValue: text('default_value'),
  validationRules: jsonb('validation_rules'),
  options: jsonb('options'),
  
  sectionName: varchar('section_name', { length: 255 }),
  sortOrder: integer('sort_order').default(0),
  
  aiSuggested: boolean('ai_suggested').default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  templateIdx: index('template_fields_template_idx').on(table.templateId),
}));

// Routing Document Links - Links documents to routing steps
export const routingDocumentLinks = pgTable('routing_document_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  partRoutingId: uuid('part_routing_id').notNull(),
  departmentName: varchar('department_name', { length: 255 }),
  
  documentType: varchar('document_type', { length: 100 }).notNull(),
  documentId: uuid('document_id').notNull(),
  
  isPrimary: boolean('is_primary').default(false),
  sortOrder: integer('sort_order').default(0),
  
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  partRoutingIdx: index('routing_document_links_routing_idx').on(table.partRoutingId),
  documentIdx: index('routing_document_links_document_idx').on(table.documentId),
}));

// Certification Task Links - Links certifications to specific tasks/steps
export const certificationTaskLinks = pgTable('certification_task_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  certificationId: integer('certification_id').notNull(),
  
  partRoutingId: uuid('part_routing_id'),
  departmentName: varchar('department_name', { length: 255 }),
  
  routingDocumentId: uuid('routing_document_id'),
  travelerStepId: uuid('traveler_step_id'),
  travelerTaskId: uuid('traveler_task_id'),
  
  taskDescription: text('task_description'),
  
  isRequired: boolean('is_required').default(true),
  
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  certificationIdx: index('certification_task_links_cert_idx').on(table.certificationId),
  routingIdx: index('certification_task_links_routing_idx').on(table.partRoutingId),
}));

// Document Distribution Logs - Track printing/distribution of documents
export const documentDistributionLogs = pgTable('document_distribution_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  
  poId: integer('po_id'),
  poNumber: varchar('po_number', { length: 255 }),
  
  documentType: varchar('document_type', { length: 100 }).notNull(),
  documentId: uuid('document_id').notNull(),
  documentTitle: varchar('document_title', { length: 500 }),
  
  departmentName: varchar('department_name', { length: 255 }),
  recipientId: integer('recipient_id'),
  recipientName: varchar('recipient_name', { length: 255 }),
  
  distributionMethod: varchar('distribution_method', { length: 50 }).notNull().default('print'),
  
  printedAt: timestamp('printed_at', { withTimezone: true }).default(sql`now()`),
  printedBy: varchar('printed_by', { length: 255 }),
  
  acknowledged: boolean('acknowledged').default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
  
  notes: text('notes'),
}, (table) => ({
  poIdx: index('document_distribution_logs_po_idx').on(table.poId),
  departmentIdx: index('document_distribution_logs_dept_idx').on(table.departmentName),
  documentIdx: index('document_distribution_logs_doc_idx').on(table.documentId),
}));

// ============================================================================
// DOCUMENT MANAGEMENT - Insert Schemas and Types
// ============================================================================

export const insertRoutingDocumentSchema = createInsertSchema(routingDocuments)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, 'Title is required'),
    documentType: z.enum([
      'work_instruction',
      'assembly_instruction',
      'operator_instruction',
      'maintenance_schedule',
      'maintenance_instruction',
      'inspection_form',
      'quality_checklist',
      'training_form',
      'procedure',
      'quality_procedure',
      'spec_sheet',
      'specification',
      'reference',
      'traveler_template',
      'other',
    ]).default('work_instruction'),
    sourceType: z.enum(['uploaded', 'generated', 'imported']).default('uploaded'),
  });

export const insertSpecSheetSchema = createInsertSchema(specSheets)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    title: z.string().min(1, 'Title is required'),
    sourceType: z.enum(['uploaded', 'generated', 'imported']).default('uploaded'),
  });

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplates)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    templateName: z.string().min(1, 'Template name is required'),
    templateType: z.enum([
      'work_instruction',
      'assembly_instruction',
      'operator_instruction',
      'maintenance_schedule',
      'maintenance_instruction',
      'inspection_form',
      'quality_checklist',
      'training_form',
      'procedure',
      'quality_procedure',
      'spec_sheet',
      'traveler_template',
      'traveler',
      'mixed',
      'other',
    ]),
  });

export const insertTemplateFieldSchema = createInsertSchema(templateFields)
  .omit({ id: true, createdAt: true })
  .extend({
    templateId: z.string().uuid('Invalid template ID'),
    fieldName: z.string().min(1, 'Field name is required'),
    fieldLabel: z.string().min(1, 'Field label is required'),
    fieldType: z.enum(['text', 'number', 'date', 'textarea', 'dropdown', 'checkbox', 'barcode', 'signature']),
  });

export const insertRoutingDocumentLinkSchema = createInsertSchema(routingDocumentLinks)
  .omit({ id: true, createdAt: true })
  .extend({
    partRoutingId: z.string().uuid('Invalid routing ID'),
    documentType: z.enum([
      'work_instruction',
      'assembly_instruction',
      'operator_instruction',
      'maintenance_schedule',
      'maintenance_instruction',
      'inspection_form',
      'quality_checklist',
      'training_form',
      'procedure',
      'quality_procedure',
      'spec_sheet',
      'traveler_template',
      'other',
    ]),
    documentId: z.string().uuid('Invalid document ID'),
  });

export const insertCertificationTaskLinkSchema = createInsertSchema(certificationTaskLinks)
  .omit({ id: true, createdAt: true })
  .extend({
    certificationId: z.number().int().positive('Invalid certification ID'),
  });

export const insertDocumentDistributionLogSchema = createInsertSchema(documentDistributionLogs)
  .omit({ id: true, printedAt: true })
  .extend({
    documentType: z.enum([
      'work_instruction',
      'assembly_instruction',
      'operator_instruction',
      'maintenance_schedule',
      'maintenance_instruction',
      'inspection_form',
      'quality_checklist',
      'training_form',
      'procedure',
      'quality_procedure',
      'spec_sheet',
      'traveler_template',
      'traveler',
      'other',
    ]),
    documentId: z.string().uuid('Invalid document ID'),
    distributionMethod: z.enum(['print', 'email', 'digital']).default('print'),
  });

// Historical Monthly Data - for tracking legacy data from previous systems
export const historicalMonthlyData = pgTable('historical_monthly_data', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  dataType: text('data_type').notNull(),
  category: text('category').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueEntry: unique().on(table.year, table.month, table.dataType, table.category),
}));

export const insertHistoricalMonthlyDataSchema = createInsertSchema(historicalMonthlyData)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    year: z.number().int().min(2020).max(2030),
    month: z.number().int().min(1).max(12),
    dataType: z.enum(['credit_card', 'revenue']),
    category: z.enum(['online', 'phone', 'aerospace', 'stocks', 'combined']),
    amount: z.string().or(z.number()),
  });

export type HistoricalMonthlyData = typeof historicalMonthlyData.$inferSelect;
export type InsertHistoricalMonthlyData = z.infer<typeof insertHistoricalMonthlyDataSchema>;

// Types
export type RoutingDocument = typeof routingDocuments.$inferSelect;
export type InsertRoutingDocument = z.infer<typeof insertRoutingDocumentSchema>;
export type SpecSheet = typeof specSheets.$inferSelect;
export type InsertSpecSheet = z.infer<typeof insertSpecSheetSchema>;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type TemplateField = typeof templateFields.$inferSelect;
export type InsertTemplateField = z.infer<typeof insertTemplateFieldSchema>;
export type RoutingDocumentLink = typeof routingDocumentLinks.$inferSelect;
export type InsertRoutingDocumentLink = z.infer<typeof insertRoutingDocumentLinkSchema>;
export type CertificationTaskLink = typeof certificationTaskLinks.$inferSelect;
export type InsertCertificationTaskLink = z.infer<typeof insertCertificationTaskLinkSchema>;
export type DocumentDistributionLog = typeof documentDistributionLogs.$inferSelect;
export type InsertDocumentDistributionLog = z.infer<typeof insertDocumentDistributionLogSchema>;

// ============================================================================
// TRAIN-THE-TRAINER - Facility Topics & Training Sessions
// ============================================================================

// Facility Topics - Standard facility training topics (PPE, FOD, ITAR, Chemical, Fire, Counterfeit)
export const facilityTopics = pgTable('facility_topics', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // PPE, FOD, ITAR, CHEM, FIRE, COUNTERFEIT
  title: text('title').notNull(),
  overview: text('overview'),
  contentHtml: text('content_html'), // HTML content for training display
  estimatedMinutes: integer('estimated_minutes').default(30),
  moduleId: integer('module_id').references(() => trainingModules.id), // Link to training module
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Facility Topic Quiz Questions - Questions specific to facility topics
export const facilityTopicQuestions = pgTable('facility_topic_questions', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').references(() => facilityTopics.id).notNull(),
  workInstructionId: integer('work_instruction_id').references(() => workInstructions.id),
  question: text('question').notNull(),
  questionType: text('question_type').notNull().default('MCQ'), // MCQ, TF, SHORT
  options: jsonb('options').$type<string[]>(), // Array of choices for MCQ
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'),
  severity: text('severity').default('major'), // minor, major, critical
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Critical Points - Detailed critical points for work instructions
export const criticalPoints = pgTable('critical_points', {
  id: serial('id').primaryKey(),
  workInstructionId: integer('work_instruction_id').references(() => workInstructions.id).notNull(),
  label: text('label').notNull(), // Short name
  detail: text('detail'), // What/why explanation
  severity: text('severity').default('major'), // minor, major, critical
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Plan Days - 4-day structured training with step focus
export const trainingPlanDays = pgTable('training_plan_days', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id').references(() => trainingAssignments.id).notNull(),
  dayNumber: integer('day_number').notNull(), // 1, 2, 3, or 4
  stepFocus: text('step_focus').notNull(), // "Step 1: Trainer Does/Explains", etc.
  objectives: text('objectives'),
  status: text('status').default('pending'), // pending, in_progress, completed
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Plan Day Topics - Facility topics scheduled for each day
export const trainingPlanDayTopics = pgTable('training_plan_day_topics', {
  id: serial('id').primaryKey(),
  planDayId: integer('plan_day_id').references(() => trainingPlanDays.id).notNull(),
  facilityTopicId: integer('facility_topic_id').references(() => facilityTopics.id).notNull(),
  baselineLevel: text('baseline_level').default('none'), // none, basic, intermediate, advanced
  targetLevel: text('target_level').default('basic'), // basic, intermediate, advanced
  emphasisNotes: text('emphasis_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily Training Sessions - Individual training session records
export const dailyTrainingSessions = pgTable('daily_training_sessions', {
  id: serial('id').primaryKey(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  planDayId: integer('plan_day_id').references(() => trainingPlanDays.id),
  sessionDate: timestamp('session_date').notNull(),
  facilityTopicId: integer('facility_topic_id').references(() => facilityTopics.id),
  traineeSignature: text('trainee_signature'),
  trainerSignature: text('trainer_signature'),
  signedAt: timestamp('signed_at'),
  competencyAttested: boolean('competency_attested').default(false),
  notes: text('notes'),
  // S-O-A Coaching Feedback - saved when session is completed
  soaStrength: text('soa_strength'),
  soaOpportunity: text('soa_opportunity'),
  soaAction: text('soa_action'),
  // Flag to indicate if SOA feedback has been reviewed at start of next day
  soaReviewedAt: timestamp('soa_reviewed_at'),
  status: text('status').default('active'), // active, completed
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily Task Blocks - 4-step method tracking for each task in a session
export const dailyTaskBlocks = pgTable('daily_task_blocks', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => dailyTrainingSessions.id).notNull(),
  taskId: integer('task_id').references(() => trainingProgramTasks.id).notNull(),
  // 4-step method completion flags
  step1Complete: boolean('step1_complete').default(false), // Trainer Does/Explains
  step2Complete: boolean('step2_complete').default(false), // Trainer Does/Trainee Explains
  step3Complete: boolean('step3_complete').default(false), // Trainee Does/Trainer Coaches
  step4Complete: boolean('step4_complete').default(false), // Trainee Does/Trainer Observes
  // S-O-A coaching fields
  strength: text('strength'),
  opportunity: text('opportunity'),
  action: text('action'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily Session Quizzes - Quiz attempts for daily sessions
export const dailySessionQuizzes = pgTable('daily_session_quizzes', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => dailyTrainingSessions.id).notNull(),
  score: integer('score').default(0),
  total: integer('total').default(0),
  passed: boolean('passed').default(false),
  answers: jsonb('answers').$type<{questionId: number; answer: string; correct: boolean}[]>(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Employee Topic Knowledge - Track knowledge levels per facility topic
export const employeeTopicKnowledge = pgTable('employee_topic_knowledge', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  topicId: integer('topic_id').references(() => facilityTopics.id).notNull(),
  currentLevel: text('current_level').default('none'), // none, basic, intermediate, advanced
  assessedAt: timestamp('assessed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Trainer Certifications - Track certified trainers
export const trainerCertifications = pgTable('trainer_certifications', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  certifiedAt: timestamp('certified_at').defaultNow(),
  certifiedBy: integer('certified_by').references(() => employees.id),
  quizScore: integer('quiz_score'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Work Instruction Import Jobs - Track PDF import and AI processing
export const workInstructionImportJobs = pgTable('work_instruction_import_jobs', {
  id: serial('id').primaryKey(),
  workInstructionId: integer('work_instruction_id').references(() => workInstructions.id),
  originalFilename: text('original_filename').notNull(),
  extractedText: text('extracted_text'),
  status: text('status').default('uploaded'), // uploaded, processing, completed, failed
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

// ============================================================================
// TRAINING CONTENT LIBRARY - Central repository for all training materials
// ============================================================================

// Training Content Categories - Organize documents by type (Department, Facility, Custom)
export const trainingContentCategories = pgTable('training_content_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('custom'), // department, facility, custom
  description: text('description'),
  color: text('color').default('#3B82F6'), // UI color for the category
  parentId: integer('parent_id'), // For subcategories
  createdBy: integer('created_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Library Documents - Uploaded documents with extracted content
export const trainingLibraryDocuments = pgTable('training_library_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  originalFilename: text('original_filename').notNull(),
  fileUrl: text('file_url'), // Object storage URL
  fileType: text('file_type'), // pdf, doc, txt, etc.
  fileSize: integer('file_size'),
  extractedContent: text('extracted_content'), // AI-extracted text content
  summary: text('summary'), // AI-generated summary
  keyPoints: text('key_points'), // JSON array of key points
  status: text('status').default('uploaded'), // uploaded, processing, ready, failed
  uploadedBy: integer('uploaded_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Document-Category Assignments - Many-to-many relationship
export const documentCategoryAssignments = pgTable('document_category_assignments', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').references(() => trainingLibraryDocuments.id).notNull(),
  categoryId: integer('category_id').references(() => trainingContentCategories.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Library Topics - AI-generated training topics from documents
export const trainingLibraryTopics = pgTable('training_library_topics', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  objectives: text('objectives'), // JSON array of learning objectives
  prerequisites: text('prerequisites'),
  estimatedDuration: integer('estimated_duration'), // in minutes
  difficultyLevel: text('difficulty_level').default('beginner'), // beginner, intermediate, advanced
  categoryId: integer('category_id').references(() => trainingContentCategories.id),
  createdBy: integer('created_by').references(() => employees.id),
  isAiGenerated: boolean('is_ai_generated').default(false),
  isTrashed: boolean('is_trashed').default(false), // Soft delete - trashed topics are hidden
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Topic-Document Links - Which documents were used to create this topic
export const topicDocumentLinks = pgTable('topic_document_links', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').references(() => trainingLibraryTopics.id).notNull(),
  documentId: integer('document_id').references(() => trainingLibraryDocuments.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4-Step Training Materials - Content for each step of the training process
export const trainingTopicMaterials = pgTable('training_topic_materials', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').references(() => trainingLibraryTopics.id).notNull(),
  stepNumber: integer('step_number').notNull(), // 1-4 for 4-step method
  stepTitle: text('step_title').notNull(), // e.g., "Trainer Does / Trainer Explains"
  trainerInstructions: text('trainer_instructions'), // What the trainer should do
  traineeActivities: text('trainee_activities'), // What the trainee should do
  keyPoints: text('key_points'), // JSON array of key teaching points
  visualAids: text('visual_aids'), // Visual aids and demonstrations
  estimatedDuration: integer('estimated_duration'), // minutes for this step
  facilityModules: text('facility_modules'), // Linked facility training modules
  createdAt: timestamp('created_at').defaultNow(),
});

// Topic Quiz Questions - AI-generated quiz questions for each topic
export const trainingTopicQuizQuestions = pgTable('training_topic_quiz_questions', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').references(() => trainingLibraryTopics.id).notNull(),
  stepNumber: integer('step_number'), // Which training step this relates to
  question: text('question').notNull(),
  questionType: text('question_type').default('multiple_choice'), // multiple_choice, true_false, short_answer
  options: text('options'), // JSON array for multiple choice
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'), // Why this is the correct answer
  points: integer('points').default(10), // Points for this question
  createdAt: timestamp('created_at').defaultNow(),
});

// Trainee Topic Assignments - Assign topics to employees for training
export const traineeTopicAssignments = pgTable('trainee_topic_assignments', {
  id: serial('id').primaryKey(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  topicId: integer('topic_id').references(() => trainingLibraryTopics.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id),
  dayNumber: integer('day_number'), // Which day of 4-day plan (1-4)
  status: text('status').default('assigned'), // assigned, in_progress, completed
  dueDate: timestamp('due_date'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// AI Training Plan - Generated 4-day training plans
export const aiTrainingPlans = pgTable('ai_training_plans', {
  id: serial('id').primaryKey(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  planStructure: text('plan_structure'), // JSON with full 4-day structure
  totalTopics: integer('total_topics'),
  status: text('status').default('draft'), // draft, active, completed
  createdBy: integer('created_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  sourceDocumentIds: text('source_document_ids'), // JSON array of document IDs
  objectives: text('objectives'), // JSON array of learning objectives
  fourStepContent: text('four_step_content'), // JSON with 4-step methodology content
  quizQuestions: text('quiz_questions'), // JSON array of quiz questions
  partNumber: text('part_number'), // Associated part number
  department: text('department'), // Department assignment
  productionLine: text('production_line'), // P1/P2/P3
  assignedTrainers: text('assigned_trainers'), // JSON array of trainer IDs
});

// Insert schemas for Content Library
export const insertTrainingContentCategorySchema = createInsertSchema(trainingContentCategories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingLibraryDocumentSchema = createInsertSchema(trainingLibraryDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentCategoryAssignmentSchema = createInsertSchema(documentCategoryAssignments).omit({ id: true, createdAt: true });
export const insertTrainingLibraryTopicSchema = createInsertSchema(trainingLibraryTopics).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTopicDocumentLinkSchema = createInsertSchema(topicDocumentLinks).omit({ id: true, createdAt: true });
export const insertTrainingTopicMaterialSchema = createInsertSchema(trainingTopicMaterials).omit({ id: true, createdAt: true });
export const insertTrainingTopicQuizQuestionSchema = createInsertSchema(trainingTopicQuizQuestions).omit({ id: true, createdAt: true });
export const insertTraineeTopicAssignmentSchema = createInsertSchema(traineeTopicAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiTrainingPlanSchema = createInsertSchema(aiTrainingPlans).omit({ id: true, createdAt: true, updatedAt: true });

// Types for Content Library
export type TrainingContentCategory = typeof trainingContentCategories.$inferSelect;
export type InsertTrainingContentCategory = z.infer<typeof insertTrainingContentCategorySchema>;
export type TrainingLibraryDocument = typeof trainingLibraryDocuments.$inferSelect;
export type InsertTrainingLibraryDocument = z.infer<typeof insertTrainingLibraryDocumentSchema>;
export type DocumentCategoryAssignment = typeof documentCategoryAssignments.$inferSelect;
export type InsertDocumentCategoryAssignment = z.infer<typeof insertDocumentCategoryAssignmentSchema>;
export type TrainingLibraryTopic = typeof trainingLibraryTopics.$inferSelect;
export type InsertTrainingLibraryTopic = z.infer<typeof insertTrainingLibraryTopicSchema>;
export type TopicDocumentLink = typeof topicDocumentLinks.$inferSelect;
export type InsertTopicDocumentLink = z.infer<typeof insertTopicDocumentLinkSchema>;
export type TrainingTopicMaterial = typeof trainingTopicMaterials.$inferSelect;
export type InsertTrainingTopicMaterial = z.infer<typeof insertTrainingTopicMaterialSchema>;
export type TrainingTopicQuizQuestion = typeof trainingTopicQuizQuestions.$inferSelect;
export type InsertTrainingTopicQuizQuestion = z.infer<typeof insertTrainingTopicQuizQuestionSchema>;
export type TraineeTopicAssignment = typeof traineeTopicAssignments.$inferSelect;
export type InsertTraineeTopicAssignment = z.infer<typeof insertTraineeTopicAssignmentSchema>;
export type AiTrainingPlan = typeof aiTrainingPlans.$inferSelect;
export type InsertAiTrainingPlan = z.infer<typeof insertAiTrainingPlanSchema>;

// Insert schemas for Train-the-Trainer tables
export const insertFacilityTopicSchema = createInsertSchema(facilityTopics).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFacilityTopicQuestionSchema = createInsertSchema(facilityTopicQuestions).omit({ id: true, createdAt: true });
export const insertCriticalPointSchema = createInsertSchema(criticalPoints).omit({ id: true, createdAt: true });
export const insertTrainingPlanDaySchema = createInsertSchema(trainingPlanDays).omit({ id: true, createdAt: true });
export const insertTrainingPlanDayTopicSchema = createInsertSchema(trainingPlanDayTopics).omit({ id: true, createdAt: true });
export const insertDailyTrainingSessionSchema = createInsertSchema(dailyTrainingSessions).omit({ id: true, createdAt: true });
export const insertDailyTaskBlockSchema = createInsertSchema(dailyTaskBlocks).omit({ id: true, createdAt: true });
export const insertDailySessionQuizSchema = createInsertSchema(dailySessionQuizzes).omit({ id: true, createdAt: true });
export const insertEmployeeTopicKnowledgeSchema = createInsertSchema(employeeTopicKnowledge).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainerCertificationSchema = createInsertSchema(trainerCertifications).omit({ id: true, createdAt: true });
export const insertWorkInstructionImportJobSchema = createInsertSchema(workInstructionImportJobs).omit({ id: true, createdAt: true });

// Types for Train-the-Trainer
export type FacilityTopic = typeof facilityTopics.$inferSelect;
export type InsertFacilityTopic = z.infer<typeof insertFacilityTopicSchema>;
export type FacilityTopicQuestion = typeof facilityTopicQuestions.$inferSelect;
export type InsertFacilityTopicQuestion = z.infer<typeof insertFacilityTopicQuestionSchema>;
export type CriticalPoint = typeof criticalPoints.$inferSelect;
export type InsertCriticalPoint = z.infer<typeof insertCriticalPointSchema>;
export type TrainingPlanDay = typeof trainingPlanDays.$inferSelect;
export type InsertTrainingPlanDay = z.infer<typeof insertTrainingPlanDaySchema>;
export type TrainingPlanDayTopic = typeof trainingPlanDayTopics.$inferSelect;
export type InsertTrainingPlanDayTopic = z.infer<typeof insertTrainingPlanDayTopicSchema>;
export type DailyTrainingSession = typeof dailyTrainingSessions.$inferSelect;
export type InsertDailyTrainingSession = z.infer<typeof insertDailyTrainingSessionSchema>;
export type DailyTaskBlock = typeof dailyTaskBlocks.$inferSelect;
export type InsertDailyTaskBlock = z.infer<typeof insertDailyTaskBlockSchema>;
export type DailySessionQuiz = typeof dailySessionQuizzes.$inferSelect;
export type InsertDailySessionQuiz = z.infer<typeof insertDailySessionQuizSchema>;
export type EmployeeTopicKnowledge = typeof employeeTopicKnowledge.$inferSelect;
export type InsertEmployeeTopicKnowledge = z.infer<typeof insertEmployeeTopicKnowledgeSchema>;
export type TrainerCertification = typeof trainerCertifications.$inferSelect;
export type InsertTrainerCertification = z.infer<typeof insertTrainerCertificationSchema>;
export type WorkInstructionImportJob = typeof workInstructionImportJobs.$inferSelect;
export type InsertWorkInstructionImportJob = z.infer<typeof insertWorkInstructionImportJobSchema>;

// ============================================================================
// EPOCH TRAINING SYSTEM ENHANCEMENTS
// ============================================================================

// Training Plan Trainers - Assign one or more trainers to an AI training plan
export const trainingPlanTrainers = pgTable('training_plan_trainers', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  isPrimary: boolean('is_primary').default(false), // Primary vs secondary trainer
  assignedAt: timestamp('assigned_at').defaultNow(),
  assignedBy: integer('assigned_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Plan Production Info - Part #, department, production line for authorization
export const trainingPlanProductionInfo = pgTable('training_plan_production_info', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  partNumber: text('part_number'), // Part # this training authorizes
  department: text('department'), // Department for this training
  productionLine: text('production_line'), // P1, P2, P3, etc.
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Step Quizzes - One quiz per training step (4 quizzes per program)
export const trainingStepQuizzes = pgTable('training_step_quizzes', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  stepNumber: integer('step_number').notNull(), // 1-4 for the 4-step method
  title: text('title').notNull(),
  description: text('description'),
  passingScore: integer('passing_score').default(80), // Percentage required to pass
  isAiGenerated: boolean('is_ai_generated').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Training Step Quiz Questions - Questions for each step quiz
export const trainingStepQuizQuestions = pgTable('training_step_quiz_questions', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => trainingStepQuizzes.id).notNull(),
  question: text('question').notNull(),
  questionType: text('question_type').default('multiple_choice'), // multiple_choice, true_false
  options: jsonb('options').$type<string[]>(), // Array of options for multiple choice
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Step Quiz Attempts - Track trainee quiz attempts per step
export const trainingStepQuizAttempts = pgTable('training_step_quiz_attempts', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => trainingStepQuizzes.id).notNull(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  score: integer('score').notNull(), // Percentage score
  passed: boolean('passed').default(false),
  answers: jsonb('answers').$type<{questionId: number; answer: string; correct: boolean}[]>(),
  attemptNumber: integer('attempt_number').default(1),
  completedAt: timestamp('completed_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Step Facility Modules - Link facility training modules to each step
export const trainingStepFacilityModules = pgTable('training_step_facility_modules', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  stepNumber: integer('step_number').notNull(), // 1-4 for the 4-step method
  moduleId: integer('module_id').references(() => trainingModules.id), // Facility training module
  facilityTopicId: integer('facility_topic_id').references(() => facilityTopics.id), // Or facility topic
  sortOrder: integer('sort_order').default(0),
  isRequired: boolean('is_required').default(true),
  createdBy: integer('created_by').references(() => employees.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Training Step Progress - Track trainee progress through each step
export const trainingStepProgress = pgTable('training_step_progress', {
  id: serial('id').primaryKey(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id).notNull(),
  traineeId: integer('trainee_id').references(() => employees.id).notNull(),
  stepNumber: integer('step_number').notNull(), // 1-4
  status: text('status').default('locked'), // locked, available, in_progress, completed
  quizPassed: boolean('quiz_passed').default(false),
  quizScore: integer('quiz_score'),
  facilityModulesComplete: boolean('facility_modules_complete').default(false),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  trainedBy: integer('trained_by').references(() => employees.id), // Trainer who conducted this step
  trainerNotes: text('trainer_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Trainer Topic Certifications - Which topics/programs a trainer is certified to teach
export const trainerTopicCertifications = pgTable('trainer_topic_certifications', {
  id: serial('id').primaryKey(),
  trainerId: integer('trainer_id').references(() => employees.id).notNull(),
  topicId: integer('topic_id').references(() => trainingLibraryTopics.id), // Topic they can train
  moduleId: integer('module_id').references(() => trainingModules.id), // Or module they can train
  department: text('department'), // Department scope
  certifiedAt: timestamp('certified_at').defaultNow(),
  certifiedBy: integer('certified_by').references(() => employees.id),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Traveler Authorizations - Link training completion to traveler task authorization
export const travelerAuthorizations = pgTable('traveler_authorizations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  planId: integer('plan_id').references(() => aiTrainingPlans.id), // Training plan that granted this authorization
  partNumber: text('part_number').notNull(), // Part # employee is authorized for
  department: text('department'), // Department
  productionLine: text('production_line'), // P1, P2, P3
  authorizedAt: timestamp('authorized_at').defaultNow(),
  authorizedBy: integer('authorized_by').references(() => employees.id),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Insert schemas for Epoch Training System
export const insertTrainingPlanTrainerSchema = createInsertSchema(trainingPlanTrainers).omit({ id: true, createdAt: true });
export const insertTrainingPlanProductionInfoSchema = createInsertSchema(trainingPlanProductionInfo).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingStepQuizSchema = createInsertSchema(trainingStepQuizzes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingStepQuizQuestionSchema = createInsertSchema(trainingStepQuizQuestions).omit({ id: true, createdAt: true });
export const insertTrainingStepQuizAttemptSchema = createInsertSchema(trainingStepQuizAttempts).omit({ id: true, createdAt: true });
export const insertTrainingStepFacilityModuleSchema = createInsertSchema(trainingStepFacilityModules).omit({ id: true, createdAt: true });
export const insertTrainingStepProgressSchema = createInsertSchema(trainingStepProgress).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainerTopicCertificationSchema = createInsertSchema(trainerTopicCertifications).omit({ id: true, createdAt: true });
export const insertTravelerAuthorizationSchema = createInsertSchema(travelerAuthorizations).omit({ id: true, createdAt: true });

// Types for Epoch Training System
export type TrainingPlanTrainer = typeof trainingPlanTrainers.$inferSelect;
export type InsertTrainingPlanTrainer = z.infer<typeof insertTrainingPlanTrainerSchema>;
export type TrainingPlanProductionInfo = typeof trainingPlanProductionInfo.$inferSelect;
export type InsertTrainingPlanProductionInfo = z.infer<typeof insertTrainingPlanProductionInfoSchema>;
export type TrainingStepQuiz = typeof trainingStepQuizzes.$inferSelect;
export type InsertTrainingStepQuiz = z.infer<typeof insertTrainingStepQuizSchema>;
export type TrainingStepQuizQuestion = typeof trainingStepQuizQuestions.$inferSelect;
export type InsertTrainingStepQuizQuestion = z.infer<typeof insertTrainingStepQuizQuestionSchema>;
export type TrainingStepQuizAttempt = typeof trainingStepQuizAttempts.$inferSelect;
export type InsertTrainingStepQuizAttempt = z.infer<typeof insertTrainingStepQuizAttemptSchema>;
export type TrainingStepFacilityModule = typeof trainingStepFacilityModules.$inferSelect;
export type InsertTrainingStepFacilityModule = z.infer<typeof insertTrainingStepFacilityModuleSchema>;
export type TrainingStepProgress = typeof trainingStepProgress.$inferSelect;
export type InsertTrainingStepProgress = z.infer<typeof insertTrainingStepProgressSchema>;
export type TrainerTopicCertification = typeof trainerTopicCertifications.$inferSelect;
export type InsertTrainerTopicCertification = z.infer<typeof insertTrainerTopicCertificationSchema>;
export type TravelerAuthorization = typeof travelerAuthorizations.$inferSelect;
export type InsertTravelerAuthorization = z.infer<typeof insertTravelerAuthorizationSchema>;

// ============================================================================
// FILLABLE PDF TEMPLATES - Customer fill-and-sign workflow
// ============================================================================

// Field definition for fillable PDF forms
export interface FillableFieldDef {
  name: string;           // Field identifier
  label: string;          // Display label for form
  type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'select';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];     // For select type
  // PDF placement (for coordinate-based fallback when no AcroForm fields)
  pdfFieldName?: string;  // AcroForm field name if present
  x?: number;             // X coordinate for text placement
  y?: number;             // Y coordinate for text placement
  page?: number;          // Page number (0-indexed)
  fontSize?: number;
  maxLength?: number;
}

// Fillable PDF Templates - Template library for customer fill-and-sign
export const fillablePdfTemplates = pgTable('fillable_pdf_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  templatePdfPath: text('template_pdf_path').notNull(),
  sourceMediaItemId: uuid('source_media_item_id'), // Reference to media_library item this was scaffolded from
  fieldDefsJson: jsonb('field_defs_json').$type<FillableFieldDef[]>().notNull().default([]),
  requiresSignature: boolean('requires_signature').notNull().default(true),
  employerSignatureRequired: boolean('employer_signature_required').default(false),
  signaturePlacement: jsonb('signature_placement').$type<{
    x: number;
    y: number;
    page: number;
    width: number;
    height: number;
  }>(),
  isActive: boolean('is_active').notNull().default(true),
  pageCount: integer('page_count').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by'),
}, (table) => ({
  nameIdx: index('fillable_pdf_templates_name_idx').on(table.name),
  activeIdx: index('fillable_pdf_templates_active_idx').on(table.isActive),
  sourceMediaItemIdx: index('fillable_pdf_templates_source_media_item_idx').on(table.sourceMediaItemId),
}));

// Fillable PDF Instances - Individual customer fill-and-sign sessions
export const fillablePdfInstances = pgTable('fillable_pdf_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: uuid('template_id').references(() => fillablePdfTemplates.id).notNull(),
  // Optional link to order or other entity
  entityType: text('entity_type'), // 'order', 'customer', 'standalone'
  entityId: text('entity_id'),
  // Public signature link pattern (matches followup_orders)
  publicSignatureId: text('public_signature_id').unique().notNull(),
  signatureToken: text('signature_token').notNull(), // Server-only secret
  // Customer info
  recipientEmail: text('recipient_email'),
  recipientName: text('recipient_name'),
  // Status tracking
  status: text('status').notNull().default('draft'), // draft, sent, viewed, signed, expired
  // Form values and signature
  valuesJson: jsonb('values_json').$type<Record<string, any>>().default({}),
  signatureData: text('signature_data'), // Base64 signature image (employee)
  signedAt: timestamp('signed_at'), // Employee signature timestamp
  signedByIp: text('signed_by_ip'), // Employee IP
  // Employer signature fields (for dual-signer documents)
  employerSignatureRequired: boolean('employer_signature_required').default(false),
  employerSignatureData: text('employer_signature_data'), // Base64 employer signature
  employerSignedAt: timestamp('employer_signed_at'),
  employerSignedByIp: text('employer_signed_by_ip'),
  employerSignerUserId: integer('employer_signer_user_id').references(() => users.id),
  employerSignerName: text('employer_signer_name'), // Display name of employer signer
  // PDF paths
  pdfPath: text('pdf_path'), // Generated PDF with values (before signature)
  signedPdfPath: text('signed_pdf_path'), // Final flattened signed PDF
  // Environment for cross-env safety
  environment: text('environment').notNull().default('dev'), // 'dev' | 'prod'
  // Timestamps
  sentAt: timestamp('sent_at'),
  viewedAt: timestamp('viewed_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('fillable_pdf_instances_template_id_idx').on(table.templateId),
  publicSigIdIdx: index('fillable_pdf_instances_public_sig_id_idx').on(table.publicSignatureId),
  statusIdx: index('fillable_pdf_instances_status_idx').on(table.status),
  entityIdx: index('fillable_pdf_instances_entity_idx').on(table.entityType, table.entityId),
}));

// Insert schemas for Fillable PDF system
export const insertFillablePdfTemplateSchema = createInsertSchema(fillablePdfTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFillablePdfInstanceSchema = createInsertSchema(fillablePdfInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Fillable PDF system
export type FillablePdfTemplate = typeof fillablePdfTemplates.$inferSelect;
export type InsertFillablePdfTemplate = z.infer<typeof insertFillablePdfTemplateSchema>;
export type FillablePdfInstance = typeof fillablePdfInstances.$inferSelect;
export type InsertFillablePdfInstance = z.infer<typeof insertFillablePdfInstanceSchema>;

// ============================================================================
// AUTHORIZED EMPLOYER SIGNERS - Who can sign employer sections on onboarding documents
// ============================================================================

export const authorizedEmployerSigners = pgTable('authorized_employer_signers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  displayNameOverride: text('display_name_override'), // Optional override for signature display
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdById: integer('created_by_id').references(() => users.id),
}, (table) => ({
  userIdIdx: index('authorized_employer_signers_user_id_idx').on(table.userId),
  activeIdx: index('authorized_employer_signers_active_idx').on(table.isActive),
}));

export const insertAuthorizedEmployerSignerSchema = createInsertSchema(authorizedEmployerSigners).omit({
  id: true,
  createdAt: true,
});

export type AuthorizedEmployerSigner = typeof authorizedEmployerSigners.$inferSelect;
export type InsertAuthorizedEmployerSigner = z.infer<typeof insertAuthorizedEmployerSignerSchema>;

// ============================================================================
// ACCOUNTING PREP - Shipment Accounting Snapshots for QuickBooks Journal Entry Prep
// ============================================================================

export const shipmentAccountingSnapshots = pgTable('shipment_accounting_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  shipmentId: uuid('shipment_id').notNull(),
  shipmentDate: timestamp('shipment_date').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name'),
  salesOrderId: text('sales_order_id'),
  arAmount: numeric('ar_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  stockRevenueAmount: numeric('stock_revenue_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  shippingIncomeAmount: numeric('shipping_income_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  netTotal: numeric('net_total', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  originalArAmount: numeric('original_ar_amount', { precision: 12, scale: 2 }),
  originalStockRevenueAmount: numeric('original_stock_revenue_amount', { precision: 12, scale: 2 }),
  originalShippingIncomeAmount: numeric('original_shipping_income_amount', { precision: 12, scale: 2 }),
  originalDiscountAmount: numeric('original_discount_amount', { precision: 12, scale: 2 }),
  originalNetTotal: numeric('original_net_total', { precision: 12, scale: 2 }),
  autoCapturedAt: timestamp('auto_captured_at').defaultNow().notNull(),
  lastAdjustedAt: timestamp('last_adjusted_at'),
  lastAdjustedBy: text('last_adjusted_by'),
  adjustmentReason: text('adjustment_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipmentIdIdx: index('shipment_accounting_snapshots_shipment_id_idx').on(table.shipmentId),
  customerIdIdx: index('shipment_accounting_snapshots_customer_id_idx').on(table.customerId),
  shipmentDateIdx: index('shipment_accounting_snapshots_shipment_date_idx').on(table.shipmentDate),
}));

export const shipmentAccountingAdjustments = pgTable('shipment_accounting_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotId: uuid('snapshot_id').references(() => shipmentAccountingSnapshots.id, { onDelete: 'cascade' }).notNull(),
  fieldName: text('field_name').notNull(),
  oldValue: numeric('old_value', { precision: 12, scale: 2 }).notNull(),
  newValue: numeric('new_value', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  adjustedBy: text('adjusted_by').notNull(),
  adjustedAt: timestamp('adjusted_at').defaultNow().notNull(),
}, (table) => ({
  snapshotIdIdx: index('shipment_accounting_adjustments_snapshot_id_idx').on(table.snapshotId),
}));

export const insertShipmentAccountingSnapshotSchema = createInsertSchema(shipmentAccountingSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  arAmount: z.union([z.string(), z.number()]).transform(v => String(v)),
  stockRevenueAmount: z.union([z.string(), z.number()]).transform(v => String(v)),
  shippingIncomeAmount: z.union([z.string(), z.number()]).transform(v => String(v)),
  discountAmount: z.union([z.string(), z.number()]).transform(v => String(v)),
  netTotal: z.union([z.string(), z.number()]).transform(v => String(v)),
});

export const insertShipmentAccountingAdjustmentSchema = createInsertSchema(shipmentAccountingAdjustments).omit({
  id: true,
  adjustedAt: true,
}).extend({
  oldValue: z.union([z.string(), z.number()]).transform(v => String(v)),
  newValue: z.union([z.string(), z.number()]).transform(v => String(v)),
});

export type ShipmentAccountingSnapshot = typeof shipmentAccountingSnapshots.$inferSelect;

// ============================================================================
// ACCOUNTING CONTROL CENTER - expense reimbursement, petty cash, owner expenses
// ============================================================================

export const accountingExpenseTransactions = pgTable('accounting_expense_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionNumber: text('transaction_number').notNull().unique(),
  transactionType: text('transaction_type').notNull(), // EMPLOYEE_REIMBURSEMENT | PETTY_CASH | OWNER_EXPENSE
  transactionDate: date('transaction_date').notNull(),
  direction: text('direction').notNull().default('OUT'), // IN | OUT
  status: text('status').notNull().default('SUBMITTED'), // SUBMITTED | APPROVED | REJECTED | PAID | CLOSED
  paidByType: text('paid_by_type').notNull(), // EMPLOYEE | OWNER | PETTY_CASH | COMPANY
  paidByName: text('paid_by_name').notNull(),
  employeeId: integer('employee_id'),
  employeeDisplayName: text('employee_display_name'),
  vendorName: text('vendor_name').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text('payment_method'),
  businessPurpose: text('business_purpose').notNull(),
  projectId: text('project_id'),
  projectName: text('project_name'),
  contractNumber: text('contract_number'),
  costObjective: text('cost_objective'),
  directIndirect: text('direct_indirect').notNull().default('DIRECT'), // DIRECT | INDIRECT | UNASSIGNED
  costCategory: text('cost_category').notNull().default('MATERIALS'),
  reimbursementRequired: boolean('reimbursement_required').default(false).notNull(),
  payrollReimbursement: boolean('payroll_reimbursement').default(false).notNull(),
  payrollStatus: text('payroll_status').notNull().default('NOT_APPLICABLE'), // NOT_APPLICABLE | READY | EXPORTED | PAID | BLOCKED
  receiptStatus: text('receipt_status').notNull().default('MISSING'), // MISSING | ATTACHED | EXCEPTION_APPROVED
  receiptUrl: text('receipt_url'),
  glAccountId: integer('gl_account_id').references(() => chartOfAccounts.id),
  glAccountNameSnapshot: text('gl_account_name_snapshot'),
  glPostingStatus: text('gl_posting_status').notNull().default('PENDING_COA'), // PENDING_COA | READY | POSTED | HELD
  allowabilityStatus: text('allowability_status').notNull().default('PENDING_REVIEW'), // PENDING_REVIEW | ALLOWABLE | UNALLOWABLE | NEEDS_REVIEW
  dcaaReviewStatus: text('dcaa_review_status').notNull().default('NEEDS_REVIEW'), // NEEDS_REVIEW | COMPLETE | EXCEPTION
  notes: text('notes'),
  submittedByUserId: integer('submitted_by_user_id'),
  submittedByDisplayName: text('submitted_by_display_name').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  approvedByUserId: integer('approved_by_user_id'),
  approvedByDisplayName: text('approved_by_display_name'),
  approvedAt: timestamp('approved_at'),
  reviewedByUserId: integer('reviewed_by_user_id'),
  reviewedByDisplayName: text('reviewed_by_display_name'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  transactionTypeIdx: index('acct_expense_transactions_type_idx').on(table.transactionType),
  transactionDateIdx: index('acct_expense_transactions_date_idx').on(table.transactionDate),
  statusIdx: index('acct_expense_transactions_status_idx').on(table.status),
  payrollStatusIdx: index('acct_expense_transactions_payroll_status_idx').on(table.payrollStatus),
  glPostingStatusIdx: index('acct_expense_transactions_gl_status_idx').on(table.glPostingStatus),
  dcaaReviewStatusIdx: index('acct_expense_transactions_dcaa_status_idx').on(table.dcaaReviewStatus),
}));

export const insertAccountingExpenseTransactionSchema = createInsertSchema(accountingExpenseTransactions).omit({
  id: true,
  transactionNumber: true,
  submittedAt: true,
  approvedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amount: z.union([z.string(), z.number()]).transform(v => String(v)),
});

export type AccountingExpenseTransaction = typeof accountingExpenseTransactions.$inferSelect;
export type InsertAccountingExpenseTransaction = z.infer<typeof insertAccountingExpenseTransactionSchema>;
export type InsertShipmentAccountingSnapshot = z.infer<typeof insertShipmentAccountingSnapshotSchema>;
export type ShipmentAccountingAdjustment = typeof shipmentAccountingAdjustments.$inferSelect;
export type InsertShipmentAccountingAdjustment = z.infer<typeof insertShipmentAccountingAdjustmentSchema>;

// ============================================================================
// PRODUCTION TIMER MODULE - Native EPOCH production timing system
// ============================================================================

// Enum for production program run status
export const productionProgramRunStatusEnum = pgEnum('production_program_run_status', [
  'running',
  'paused',
  'awaiting_next',
  'completed',
  'stopped',
]);

// Production Programs - defines timed production workflows
export const productionPrograms = pgTable('production_programs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  logType: varchar('log_type', { length: 50 }).default('none').notNull(), // 'none' | 'oven_cure' | 'vacuum_leak_test' | 'final_inspection'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('production_programs_name_idx').on(table.name),
}));

// Production Program Steps - individual timed steps within a program
export const productionProgramSteps = pgTable('production_program_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  programId: uuid('program_id').references(() => productionPrograms.id, { onDelete: 'cascade' }).notNull(),
  stepIndex: integer('step_index').notNull(),
  stepName: text('step_name').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  programIdIdx: index('production_program_steps_program_id_idx').on(table.programId),
  stepOrderIdx: index('production_program_steps_order_idx').on(table.programId, table.stepIndex),
}));

// Production Program Runs - active/historical executions of programs
export const productionProgramRuns = pgTable('production_program_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  programId: uuid('program_id').references(() => productionPrograms.id).notNull(),
  startedByUserId: integer('started_by_user_id').references(() => users.id),
  instanceName: text('instance_name'),
  sku: text('sku'),
  serialNumber: text('serial_number'),
  inventoryItemId: integer('inventory_item_id'),
  mandrelNumber: integer('mandrel_number'),
  ovenNumber: integer('oven_number'),
  ovenSlot: text('oven_slot'),
  status: productionProgramRunStatusEnum('status').default('running').notNull(),
  currentStepIndex: integer('current_step_index').default(0).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  lastPausedAt: timestamp('last_paused_at'),
  totalElapsedSeconds: integer('total_elapsed_seconds').default(0).notNull(),
  travelerId: varchar('traveler_id', { length: 255 }),
  travelerStepId: varchar('traveler_step_id', { length: 255 }),
  travelerTaskId: varchar('traveler_task_id', { length: 255 }),
  departmentName: varchar('department_name', { length: 255 }),
  linkedLogId: uuid('linked_log_id'), // UUID of the auto-created p2OvenCureLog / p2VacuumLeakTest / p2FinalInspectionResult
  linkedLogType: varchar('linked_log_type', { length: 50 }), // 'oven_cure' | 'vacuum_leak_test' | 'final_inspection'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  programIdIdx: index('production_program_runs_program_id_idx').on(table.programId),
  statusIdx: index('production_program_runs_status_idx').on(table.status),
  startedAtIdx: index('production_program_runs_started_at_idx').on(table.startedAt),
  travelerStepStatusIdx: index('idx_runs_traveler_step_status').on(table.travelerStepId, table.status),
}));

// Production Program Run Events - audit trail for run lifecycle
export const productionProgramRunEvents = pgTable('production_program_run_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').references(() => productionProgramRuns.id, { onDelete: 'cascade' }).notNull(),
  eventType: text('event_type').notNull(), // started, step_complete, resumed, paused, advanced, completed
  stepIndex: integer('step_index'),
  userId: integer('user_id').references(() => users.id),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index('production_program_run_events_run_id_idx').on(table.runId),
  eventTypeIdx: index('production_program_run_events_event_type_idx').on(table.eventType),
  occurredAtIdx: index('production_program_run_events_occurred_at_idx').on(table.occurredAt),
}));

// Production Item Audit Records - durable snapshots for reconstructing an item's timer card
export const productionItemAuditRecords = pgTable('production_item_audit_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemIdentifier: text('item_identifier').notNull(),
  serialNumber: text('serial_number'),
  travelerId: varchar('traveler_id', { length: 255 }),
  travelerNumber: varchar('traveler_number', { length: 255 }),
  runId: uuid('run_id').references(() => productionProgramRuns.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  eventAt: timestamp('event_at').defaultNow().notNull(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  cardSnapshot: jsonb('card_snapshot').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  itemIdentifierIdx: index('production_item_audit_item_identifier_idx').on(table.itemIdentifier),
  serialNumberIdx: index('production_item_audit_serial_number_idx').on(table.serialNumber),
  travelerIdIdx: index('production_item_audit_traveler_id_idx').on(table.travelerId),
  runIdIdx: index('production_item_audit_run_id_idx').on(table.runId),
  eventAtIdx: index('production_item_audit_event_at_idx').on(table.eventAt),
}));

// Insert schemas for Production Timer module
export const insertProductionProgramSchema = createInsertSchema(productionPrograms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductionProgramStepSchema = createInsertSchema(productionProgramSteps).omit({
  id: true,
  createdAt: true,
});

export const insertProductionProgramRunSchema = createInsertSchema(productionProgramRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductionProgramRunEventSchema = createInsertSchema(productionProgramRunEvents).omit({
  id: true,
  occurredAt: true,
});

// Types for Production Timer module
export type ProductionProgram = typeof productionPrograms.$inferSelect;
export type InsertProductionProgram = z.infer<typeof insertProductionProgramSchema>;
export type ProductionProgramStep = typeof productionProgramSteps.$inferSelect;
export type InsertProductionProgramStep = z.infer<typeof insertProductionProgramStepSchema>;
export type ProductionProgramRun = typeof productionProgramRuns.$inferSelect;
export type InsertProductionProgramRun = z.infer<typeof insertProductionProgramRunSchema>;
export type ProductionProgramRunEvent = typeof productionProgramRunEvents.$inferSelect;
export type ProductionItemAuditRecord = typeof productionItemAuditRecords.$inferSelect;
export type InsertProductionProgramRunEvent = z.infer<typeof insertProductionProgramRunEventSchema>;

// ============================================================================
// QR CODE REGISTRY - Central QR Code Generation & Resolver System
// ============================================================================

// Entity types that can be referenced by QR codes
export const qrEntityTypeEnum = pgEnum('qr_entity_type', [
  'order',
  'inventory_item',
  'employee',
  'mandrel',
  'oven',
  'timer_program',
  'document',
  'equipment',
  'material_lot',
  'custom',
]);

// QR Codes Registry - Central table for all QR codes in the system
export const qrCodes = pgTable('qr_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicCode: text('public_code').notNull().unique(), // Format: qr_XXXXXXXX
  entityType: qrEntityTypeEnum('entity_type').notNull(),
  entityIdentifier: text('entity_identifier').notNull(), // Stable ID (orderId, agPartNumber, employeeCode, etc.)
  label: text('label'), // Human-readable label for the QR code
  description: text('description'), // Optional description
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at'), // Optional expiration
  environment: text('environment').default('dev').notNull(), // 'dev' or 'prod'
  resolveUrl: text('resolve_url'), // Optional custom resolve URL override
  metadata: jsonb('metadata'), // Additional context data
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  disabledAt: timestamp('disabled_at'), // When the QR code was disabled
  disabledByUserId: integer('disabled_by_user_id').references(() => users.id),
  disabledReason: text('disabled_reason'),
}, (table) => ({
  publicCodeIdx: index('qr_codes_public_code_idx').on(table.publicCode),
  entityTypeIdx: index('qr_codes_entity_type_idx').on(table.entityType),
  entityIdentifierIdx: index('qr_codes_entity_identifier_idx').on(table.entityIdentifier),
  isActiveIdx: index('qr_codes_is_active_idx').on(table.isActive),
  environmentIdx: index('qr_codes_environment_idx').on(table.environment),
}));

// Insert schemas for QR Code module
export const insertQrCodeSchema = createInsertSchema(qrCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  disabledAt: true,
  disabledByUserId: true,
  disabledReason: true,
});

// Types for QR Code module
export type QrCode = typeof qrCodes.$inferSelect;
export type InsertQrCode = z.infer<typeof insertQrCodeSchema>;

// ============================================================================
// EMPLOYEE ONBOARDING SYSTEM - Phase 0 Foundation
// ============================================================================

// Onboarding Paths - Define configurable onboarding workflows
export const onboardingPaths = pgTable('onboarding_paths', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  pathType: text('path_type').notNull().default('FULL_TIME'), // FULL_TIME, CONTRACT
  pathPurpose: text('path_purpose').notNull().default('ONBOARDING'), // ONBOARDING, REHIRE
  intakeFormId: uuid('intake_form_id'),
  documentFolderId: uuid('document_folder_id'), // DEPRECATED: Reference to media_folders (kept for backward compat)
  signatureAuthTemplateId: uuid('signature_auth_template_id'), // Fillable template for e-signature authorization
  documentTemplateIds: uuid('document_template_ids').array(), // Ordered list of fillable template IDs
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertOnboardingPathSchema = createInsertSchema(onboardingPaths).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OnboardingPath = typeof onboardingPaths.$inferSelect;
export type InsertOnboardingPath = z.infer<typeof insertOnboardingPathSchema>;

// Onboarding Forms - Dynamic intake form definitions
export const onboardingForms = pgTable('onboarding_forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  fieldsJson: jsonb('fields_json').$type<Array<{
    name: string;
    label: string;
    type: 'text' | 'date' | 'dropdown' | 'checkbox';
    required?: boolean;
    options?: string[];
    mappedToField?: string; // Maps to employee profile field
  }>>().default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertOnboardingFormSchema = createInsertSchema(onboardingForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type OnboardingForm = typeof onboardingForms.$inferSelect;
export type InsertOnboardingForm = z.infer<typeof insertOnboardingFormSchema>;

// Demographics data type for fixed-schema intake
export interface DemographicsData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  vehicleType: string;
  licensePlate: string;
  driversLicenseNumber: string;
  driversLicenseState: string;
  bankName: string;
  bankRoutingNumber: string;
  bankAccountNumber: string;
}

// Onboarding Sessions - Track in-progress onboarding sessions
export const onboardingSessions = pgTable('onboarding_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id), // Nullable until finalization
  pathId: uuid('path_id').references(() => onboardingPaths.id).notNull(),
  adminId: integer('admin_id').references(() => users.id).notNull(),
  status: text('status').notNull().default('in_progress'), // in_progress, paused, completed
  intakeData: jsonb('intake_data').$type<Record<string, any>>().default({}), // DEPRECATED: Use demographicsData
  demographicsData: jsonb('demographics_data').$type<DemographicsData>(), // Fixed-schema demographics
  currentStep: text('current_step').default('signature_auth'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  pausedAt: timestamp('paused_at'),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  pathIdIdx: index('onboarding_sessions_path_id_idx').on(table.pathId),
  statusIdx: index('onboarding_sessions_status_idx').on(table.status),
  employeeIdIdx: index('onboarding_sessions_employee_id_idx').on(table.employeeId),
}));

export const insertOnboardingSessionSchema = createInsertSchema(onboardingSessions).omit({
  id: true,
  startedAt: true,
});

export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type InsertOnboardingSession = z.infer<typeof insertOnboardingSessionSchema>;

// Onboarding Session Documents - Track documents for each session
export const onboardingSessionDocuments = pgTable('onboarding_session_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => onboardingSessions.id).notNull(),
  mediaItemId: uuid('media_item_id').references(() => mediaLibrary.id), // Source media item from folder
  templateId: uuid('template_id').references(() => fillablePdfTemplates.id), // Fillable template (null = view-only)
  instanceId: uuid('instance_id').references(() => fillablePdfInstances.id), // Instance for this session
  documentName: text('document_name').notNull(), // Display name from media item
  isFillable: boolean('is_fillable').notNull().default(false), // true = signable, false = view-only
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('pending'), // pending, viewed, signed
  signedAt: timestamp('signed_at'),
}, (table) => ({
  sessionIdIdx: index('onboarding_session_docs_session_id_idx').on(table.sessionId),
}));

export const insertOnboardingSessionDocumentSchema = createInsertSchema(onboardingSessionDocuments).omit({
  id: true,
});

export type OnboardingSessionDocument = typeof onboardingSessionDocuments.$inferSelect;
export type InsertOnboardingSessionDocument = z.infer<typeof insertOnboardingSessionDocumentSchema>;

// Onboarding Session Captures - Track camera captures (ID photos, etc.)
export const onboardingSessionCaptures = pgTable('onboarding_session_captures', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => onboardingSessions.id).notNull(),
  captureType: text('capture_type').notNull(), // driver_license, bank_info, other
  mediaItemId: uuid('media_item_id').references(() => mediaLibrary.id),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index('onboarding_session_captures_session_id_idx').on(table.sessionId),
}));

export const insertOnboardingSessionCaptureSchema = createInsertSchema(onboardingSessionCaptures).omit({
  id: true,
  capturedAt: true,
});

export type OnboardingSessionCapture = typeof onboardingSessionCaptures.$inferSelect;
export type InsertOnboardingSessionCapture = z.infer<typeof insertOnboardingSessionCaptureSchema>;

// Onboarding Invitations - short-lived access grants for new-hire paperwork.
export const onboardingInvitations = pgTable('onboarding_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => onboardingSessions.id, { onDelete: 'cascade' }).notNull(),
  employeeId: integer('employee_id').references(() => employees.id),
  tokenHash: text('token_hash').notNull().unique(),
  publicTokenHint: text('public_token_hint'),
  deliveryMode: text('delivery_mode').notNull().default('in_person'),
  status: text('status').notNull().default('active'),
  expiresAt: timestamp('expires_at').notNull(),
  email: text('email'),
  phone: text('phone'),
  emailVerifiedAt: timestamp('email_verified_at'),
  phoneVerifiedAt: timestamp('phone_verified_at'),
  noCellPhoneAvailable: boolean('no_cell_phone_available').notNull().default(false),
  noCellPhoneReason: text('no_cell_phone_reason'),
  noCellPhoneMarkedByUserId: integer('no_cell_phone_marked_by_user_id').references(() => users.id),
  noCellPhoneMarkedAt: timestamp('no_cell_phone_marked_at'),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
  revokedByUserId: integer('revoked_by_user_id').references(() => users.id),
  revokedReason: text('revoked_reason'),
}, (table) => ({
  sessionIdx: index('onboarding_invitations_session_idx').on(table.sessionId),
  employeeIdx: index('onboarding_invitations_employee_idx').on(table.employeeId),
  statusIdx: index('onboarding_invitations_status_idx').on(table.status),
}));

export const onboardingVerificationCodes = pgTable('onboarding_verification_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  invitationId: uuid('invitation_id').references(() => onboardingInvitations.id, { onDelete: 'cascade' }).notNull(),
  channel: text('channel').notNull(),
  codeHash: text('code_hash').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  sentTo: text('sent_to'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  invitationIdx: index('onboarding_verification_codes_invitation_idx').on(table.invitationId),
  channelStatusIdx: index('onboarding_verification_codes_channel_status_idx').on(table.channel, table.status),
}));

export const insertOnboardingInvitationSchema = createInsertSchema(onboardingInvitations).omit({
  id: true,
  createdAt: true,
});
export type OnboardingInvitation = typeof onboardingInvitations.$inferSelect;
export type InsertOnboardingInvitation = z.infer<typeof insertOnboardingInvitationSchema>;

export const insertOnboardingVerificationCodeSchema = createInsertSchema(onboardingVerificationCodes).omit({
  id: true,
  sentAt: true,
  createdAt: true,
});
export type OnboardingVerificationCode = typeof onboardingVerificationCodes.$inferSelect;
export type InsertOnboardingVerificationCode = z.infer<typeof insertOnboardingVerificationCodeSchema>;

// ============================================================
// Asset Management & Work Order System
// ============================================================

export const assetCategories = pgTable('asset_categories', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  parentCategoryId: varchar('parent_category_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertAssetCategorySchema = createInsertSchema(assetCategories).omit({ id: true, createdAt: true });
export type AssetCategory = typeof assetCategories.$inferSelect;
export type InsertAssetCategory = z.infer<typeof insertAssetCategorySchema>;

export const assetLocations = pgTable('asset_locations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertAssetLocationSchema = createInsertSchema(assetLocations).omit({ id: true, createdAt: true });
export type AssetLocation = typeof assetLocations.$inferSelect;
export type InsertAssetLocation = z.infer<typeof insertAssetLocationSchema>;

export const assets = pgTable('assets', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  assetTag: text('asset_tag').notNull().unique(),
  name: text('name').notNull(),
  categoryId: varchar('category_id').references(() => assetCategories.id),
  parentAssetId: varchar('parent_asset_id'),
  physicalLocationId: varchar('physical_location_id').references(() => assetLocations.id),
  status: text('status').notNull().default('active'),
  purchaseDate: date('purchase_date'),
  purchaseCost: numeric('purchase_cost'),
  vendorName: text('vendor_name'),
  warrantyExpiration: date('warranty_expiration'),
  expectedLifeYears: integer('expected_life_years'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  retiredAt: timestamp('retired_at'),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true });
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export const assetLocationHistory = pgTable('asset_location_history', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar('asset_id').references(() => assets.id).notNull(),
  locationId: varchar('location_id').references(() => assetLocations.id).notNull(),
  movedAt: timestamp('moved_at').defaultNow().notNull(),
  movedBy: integer('moved_by').references(() => users.id),
  notes: text('notes'),
});

export const insertAssetLocationHistorySchema = createInsertSchema(assetLocationHistory).omit({ id: true, movedAt: true });
export type AssetLocationHistory = typeof assetLocationHistory.$inferSelect;
export type InsertAssetLocationHistory = z.infer<typeof insertAssetLocationHistorySchema>;

export const workOrders = pgTable('work_orders', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar('asset_id').references(() => assets.id),
  type: text('type').notNull().default('reactive'),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('open'),
  severity: integer('severity'),
  reportedAt: timestamp('reported_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  downtimeStart: timestamp('downtime_start'),
  downtimeEnd: timestamp('downtime_end'),
  createdBy: integer('created_by').references(() => users.id),
  closedBy: integer('closed_by').references(() => users.id),
  maintenanceScheduleId: integer('maintenance_schedule_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true, reportedAt: true, createdAt: true });
export type WorkOrder = typeof workOrders.$inferSelect;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;

export const workOrderParts = pgTable('work_order_parts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar('work_order_id').references(() => workOrders.id).notNull(),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id),
  partName: text('part_name'),
  quantity: numeric('quantity').notNull(),
  costSnapshot: numeric('cost_snapshot'),
});

export const insertWorkOrderPartSchema = createInsertSchema(workOrderParts).omit({ id: true });
export type WorkOrderPart = typeof workOrderParts.$inferSelect;
export type InsertWorkOrderPart = z.infer<typeof insertWorkOrderPartSchema>;

export const workOrderAttachments = pgTable('work_order_attachments', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar('work_order_id').references(() => workOrders.id).notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name'),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export const insertWorkOrderAttachmentSchema = createInsertSchema(workOrderAttachments).omit({ id: true, uploadedAt: true });
export type WorkOrderAttachment = typeof workOrderAttachments.$inferSelect;
export type InsertWorkOrderAttachment = z.infer<typeof insertWorkOrderAttachmentSchema>;

// ============================================================================
// ROUTING TRAINING PACKAGES - AI-generated training & quizzes from work instructions
// ============================================================================

export const routingTrainingPackages = pgTable('routing_training_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  partRoutingId: uuid('part_routing_id'),
  departmentName: varchar('department_name', { length: 255 }).notNull(),
  processName: varchar('process_name', { length: 255 }),

  sourceDocumentIds: jsonb('source_document_ids').$type<string[]>().default([]),
  sourceDocumentTitles: jsonb('source_document_titles').$type<string[]>().default([]),

  trainingContent: jsonb('training_content').$type<{
    title: string;
    objectives: string[];
    keyPoints: { topic: string; details: string[] }[];
    safetyNotes: string[];
    commonMistakes: string[];
  }>(),

  quizQuestions: jsonb('quiz_questions').$type<{
    question: string;
    questionType: 'multiple_choice' | 'true_false';
    options: string[];
    correctAnswer: string;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    sourceDocumentId?: string;
  }[]>().default([]),

  totalQuestions: integer('total_questions').default(0),
  passingScore: integer('passing_score').default(80),
  modelVersion: varchar('model_version', { length: 50 }).default('gpt-4o-mini'),
  status: varchar('status', { length: 50 }).default('generated'),

  generatedBy: varchar('generated_by', { length: 255 }),
  generatedAt: timestamp('generated_at', { withTimezone: true }).default(sql`now()`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  routingIdx: index('routing_training_packages_routing_idx').on(table.partRoutingId),
  deptIdx: index('routing_training_packages_dept_idx').on(table.departmentName),
}));

export const insertRoutingTrainingPackageSchema = createInsertSchema(routingTrainingPackages).omit({ id: true, createdAt: true, updatedAt: true, generatedAt: true });
export type RoutingTrainingPackage = typeof routingTrainingPackages.$inferSelect;
export type InsertRoutingTrainingPackage = z.infer<typeof insertRoutingTrainingPackageSchema>;

export const checklistTemplates = pgTable('checklist_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  frequency: text('frequency').notNull().default('DAILY'),
  department: text('department'),
  isActive: boolean('is_active').notNull().default(true),
  enforceClockOut: boolean('enforce_clock_out').notNull().default(true),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const checklistTemplateItems = pgTable('checklist_template_items', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  type: text('type').notNull().default('checkbox'),
  options: jsonb('options').$type<string[]>(),
  required: boolean('required').notNull().default(false),
  frequency: text('frequency').notNull().default('DAILY'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => ({
  templateIdIdx: index('checklist_template_items_template_id_idx').on(table.templateId),
}));

export const checklistAssignments = pgTable('checklist_assignments', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
  assignmentType: text('assignment_type').notNull().default('employee'),
  departmentName: text('department_name'),
  roleKey: text('role_key'),
  isActive: boolean('is_active').notNull().default(true),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('checklist_assignments_template_id_idx').on(table.templateId),
  employeeIdIdx: index('checklist_assignments_employee_id_idx').on(table.employeeId),
  uniqueEmployee: uniqueIndex('checklist_assignments_unique_employee').on(table.templateId, table.employeeId).where(sql`assignment_type = 'employee' AND employee_id IS NOT NULL`),
  uniqueDepartment: uniqueIndex('checklist_assignments_unique_department').on(table.templateId, table.departmentName).where(sql`assignment_type = 'department' AND department_name IS NOT NULL`),
  uniqueRole: uniqueIndex('checklist_assignments_unique_role').on(table.templateId, table.roleKey).where(sql`assignment_type = 'role' AND role_key IS NOT NULL`),
}));

export const checklistResponses = pgTable('checklist_responses', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => checklistTemplates.id),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  periodDate: date('period_date').notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('checklist_responses_template_id_idx').on(table.templateId),
  employeeIdIdx: index('checklist_responses_employee_id_idx').on(table.employeeId),
  periodIdx: index('checklist_responses_period_idx').on(table.periodDate),
}));

export const checklistResponseItems = pgTable('checklist_response_items', {
  id: serial('id').primaryKey(),
  responseId: integer('response_id').notNull().references(() => checklistResponses.id, { onDelete: 'cascade' }),
  templateItemId: integer('template_item_id').notNull().references(() => checklistTemplateItems.id),
  value: text('value'),
  completed: boolean('completed').notNull().default(false),
}, (table) => ({
  responseIdIdx: index('checklist_response_items_response_id_idx').on(table.responseId),
  templateItemIdIdx: index('checklist_response_items_template_item_id_idx').on(table.templateItemId),
}));

export const insertChecklistTemplateSchema = createInsertSchema(checklistTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type InsertChecklistTemplate = z.infer<typeof insertChecklistTemplateSchema>;

export const insertChecklistTemplateItemSchema = createInsertSchema(checklistTemplateItems).omit({ id: true });
export type ChecklistTemplateItem = typeof checklistTemplateItems.$inferSelect;
export type InsertChecklistTemplateItem = z.infer<typeof insertChecklistTemplateItemSchema>;

export const insertChecklistAssignmentSchema = createInsertSchema(checklistAssignments).omit({ id: true, createdAt: true });
export type ChecklistAssignment = typeof checklistAssignments.$inferSelect;
export type InsertChecklistAssignment = z.infer<typeof insertChecklistAssignmentSchema>;

export const insertChecklistResponseSchema = createInsertSchema(checklistResponses).omit({ id: true, createdAt: true, updatedAt: true });
export type ChecklistResponse = typeof checklistResponses.$inferSelect;
export type InsertChecklistResponse = z.infer<typeof insertChecklistResponseSchema>;

export const insertChecklistResponseItemSchema = createInsertSchema(checklistResponseItems).omit({ id: true });
export type ChecklistResponseItem = typeof checklistResponseItems.$inferSelect;
export type InsertChecklistResponseItem = z.infer<typeof insertChecklistResponseItemSchema>;

// Production Forecast Engine Tables
export const departmentForecastDefaults = pgTable('department_forecast_defaults', {
  id: serial('id').primaryKey(),
  departmentName: text('department_name').unique().notNull(),
  avgDays: real('avg_days').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const modelForecastMultiplier = pgTable('model_forecast_multiplier', {
  id: serial('id').primaryKey(),
  modelId: text('model_id').references(() => stockModels.id).notNull(),
  multiplier: real('multiplier').default(1.0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertDepartmentForecastDefaultSchema = createInsertSchema(departmentForecastDefaults).omit({ id: true, createdAt: true, updatedAt: true });
export type DepartmentForecastDefault = typeof departmentForecastDefaults.$inferSelect;
export type InsertDepartmentForecastDefault = z.infer<typeof insertDepartmentForecastDefaultSchema>;

export const insertModelForecastMultiplierSchema = createInsertSchema(modelForecastMultiplier).omit({ id: true, createdAt: true, updatedAt: true });
export type ModelForecastMultiplier = typeof modelForecastMultiplier.$inferSelect;
export type InsertModelForecastMultiplier = z.infer<typeof insertModelForecastMultiplierSchema>;

export const modelQueueWeights = pgTable('model_queue_weights', {
  id: serial('id').primaryKey(),
  modelId: text('model_id').notNull().unique(),
  queueWeight: real('queue_weight').notNull().default(1.0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const productionForecastVerifications = pgTable('production_forecast_verifications', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  department: text('department').notNull(),
  weekStartDate: timestamp('week_start_date').notNull(),
  verifiedBy: integer('verified_by'),
  verifiedAt: timestamp('verified_at').defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueVerification: unique().on(table.orderId, table.department, table.weekStartDate),
}));

export const insertProductionForecastVerificationSchema = createInsertSchema(productionForecastVerifications).omit({ id: true, verifiedAt: true, createdAt: true });
export type ProductionForecastVerification = typeof productionForecastVerifications.$inferSelect;
export type InsertProductionForecastVerification = z.infer<typeof insertProductionForecastVerificationSchema>;

// Department Capacity for DES Simulation
export const departmentCapacity = pgTable('department_capacity', {
  id: serial('id').primaryKey(),
  department: text('department').unique().notNull(),
  stations: integer('stations').notNull().default(1),
  avgParallelEfficiency: real('avg_parallel_efficiency').notNull().default(0.85),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export const insertDepartmentCapacitySchema = createInsertSchema(departmentCapacity).omit({ id: true, lastUpdated: true });
export type DepartmentCapacity = typeof departmentCapacity.$inferSelect;
export type InsertDepartmentCapacity = z.infer<typeof insertDepartmentCapacitySchema>;

// Model Department Stats — Self-Learning Cycle Times
export const modelDepartmentStats = pgTable('model_department_stats', {
  id: serial('id').primaryKey(),
  modelId: text('model_id').notNull(),
  department: text('department').notNull(),
  avgDurationMinutes: real('avg_duration_minutes').notNull(),
  medianDurationMinutes: real('median_duration_minutes').notNull(),
  p90DurationMinutes: real('p90_duration_minutes').notNull(),
  sampleCount: integer('sample_count').notNull().default(0),
  stdDevMinutes: real('std_dev_minutes').default(0),
  avgDays: real('avg_days').notNull(),
  confidence: text('confidence').notNull().default('LOW'),
  lastRebuilt: timestamp('last_rebuilt').defaultNow(),
}, (table) => ({
  modelDeptUnique: unique().on(table.modelId, table.department),
  modelIdx: index('mds_model_id_idx').on(table.modelId),
  deptIdx: index('mds_department_idx').on(table.department),
  confidenceIdx: index('mds_confidence_idx').on(table.confidence),
}));

export const insertModelDepartmentStatsSchema = createInsertSchema(modelDepartmentStats).omit({ id: true, lastRebuilt: true });
export type ModelDepartmentStats = typeof modelDepartmentStats.$inferSelect;
export type InsertModelDepartmentStats = z.infer<typeof insertModelDepartmentStatsSchema>;

// Cycle Time Drift Log — Anomaly Detection
export const cycleTimeDriftLog = pgTable('cycle_time_drift_log', {
  id: serial('id').primaryKey(),
  modelId: text('model_id').notNull(),
  department: text('department').notNull(),
  previousAvgMinutes: real('previous_avg_minutes').notNull(),
  newAvgMinutes: real('new_avg_minutes').notNull(),
  driftPercent: real('drift_percent').notNull(),
  direction: text('direction').notNull(),
  detectedAt: timestamp('detected_at').defaultNow(),
}, (table) => ({
  detectedAtIdx: index('drift_log_detected_at_idx').on(table.detectedAt),
  modelIdx: index('drift_log_model_id_idx').on(table.modelId),
}));

export const insertCycleTimeDriftLogSchema = createInsertSchema(cycleTimeDriftLog).omit({ id: true, detectedAt: true });
export type CycleTimeDriftLog = typeof cycleTimeDriftLog.$inferSelect;
export type InsertCycleTimeDriftLog = z.infer<typeof insertCycleTimeDriftLogSchema>;

// ============ Executive Rundown System ============

export const executivePriorityEnum = pgEnum('executive_priority', [
  'CRITICAL',
  'HIGH',
  'NORMAL',
  'LOW',
]);

export const executiveRundownGroups = pgTable('executive_rundown_groups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  groupDate: date('group_date').notNull(),
  title: text('title'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userDateIdx: index('exec_rundown_group_user_date_idx').on(table.userId, table.groupDate),
}));

export const insertExecutiveRundownGroupSchema = createInsertSchema(executiveRundownGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ExecutiveRundownGroup = typeof executiveRundownGroups.$inferSelect;
export type InsertExecutiveRundownGroup = z.infer<typeof insertExecutiveRundownGroupSchema>;

export const executiveRundownItems = pgTable('executive_rundown_items', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => executiveRundownGroups.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  priority: executivePriorityEnum('priority').default('NORMAL').notNull(),
  category: text('category'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  completedAt: timestamp('completed_at'),
  completedBy: integer('completed_by').references(() => users.id),
  linkedEntityType: text('linked_entity_type'),
  linkedEntityId: text('linked_entity_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertExecutiveRundownItemSchema = createInsertSchema(executiveRundownItems).omit({
  id: true,
  completedAt: true,
  completedBy: true,
  createdAt: true,
  updatedAt: true,
});
export type ExecutiveRundownItem = typeof executiveRundownItems.$inferSelect;
export type InsertExecutiveRundownItem = z.infer<typeof insertExecutiveRundownItemSchema>;

// ===========================
// ACCOUNTING SHADOW LAYER
// ===========================

// Chart of accounts — canonical account definitions
export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: serial('id').primaryKey(),
  accountNumber: text('account_number').unique(),
  accountName: text('account_name').notNull().unique(),
  accountType: text('account_type').notNull(), // ASSET, LIABILITY, EXPENSE, REVENUE, etc.
  parentAccountId: integer('parent_account_id').references((): AnyPgColumn => chartOfAccounts.id),
  normalBalance: text('normal_balance').notNull().default('DEBIT'), // DEBIT | CREDIT
  financialStatementSection: text('financial_statement_section'),
  costPool: text('cost_pool').notNull().default('NONE'), // NONE | DIRECT | FRINGE | OVERHEAD | G_AND_A | UNALLOWABLE | OTHER
  defaultAllowability: text('default_allowability').notNull().default('ALLOWABLE'), // ALLOWABLE | UNALLOWABLE | NEEDS_REVIEW
  defaultDirectIndirect: text('default_direct_indirect').notNull().default('UNASSIGNED'), // DIRECT | INDIRECT | UNASSIGNED
  billingTreatment: text('billing_treatment').notNull().default('NOT_BILLABLE'), // BILLABLE | NON_BILLABLE | PASS_THROUGH | NOT_BILLABLE
  requiresDocumentation: boolean('requires_documentation').notNull().default(false),
  requiresReview: boolean('requires_review').notNull().default(false),
  systemControlled: boolean('system_controlled').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertChartOfAccountsSchema = createInsertSchema(chartOfAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountsSchema>;

export const productionLineAccountingMap = pgTable('production_line_accounting_map', {
  id: serial('id').primaryKey(),
  productionLine: text('production_line').notNull(),
  revenueAccountId: integer('revenue_account_id').references(() => chartOfAccounts.id),
  revenueAccountNumber: text('revenue_account_number'),
  revenueAccountNameSnapshot: text('revenue_account_name_snapshot'),
  quickbooksClass: text('quickbooks_class'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueProductionLine: unique('production_line_accounting_map_line_unique').on(table.productionLine),
}));

export const insertProductionLineAccountingMapSchema = createInsertSchema(productionLineAccountingMap).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ProductionLineAccountingMap = typeof productionLineAccountingMap.$inferSelect;
export type InsertProductionLineAccountingMap = z.infer<typeof insertProductionLineAccountingMapSchema>;

// Journal entries — one per transaction event (e.g. a wire payment)
export const journalEntries = pgTable('journal_entries', {
  id: serial('id').primaryKey(),
  transactionType: text('transaction_type').notNull(), // WIRE_PAYMENT
  referenceType: text('reference_type').notNull(),     // payment
  referenceId: integer('reference_id').notNull(),      // payments.id
  referenceUuid: uuid('reference_uuid'),
  effectiveDate: timestamp('effective_date').notNull(),
  status: text('status').notNull().default('DRAFT'),   // DRAFT | POSTED | EXPORTED | VOIDED
  memo: text('memo'),
  sourceSystem: text('source_system').notNull().default('EPOCH'),
  sourceDocumentType: text('source_document_type'),
  sourceDocumentNumber: text('source_document_number'),
  migrationBatchId: text('migration_batch_id'),
  postingMode: text('posting_mode').notNull().default('STANDARD'), // STANDARD | HISTORICAL_MIGRATION | ADJUSTMENT | REVERSAL
  postedAt: timestamp('posted_at'),
  postedBy: text('posted_by'),
  reversalOfJournalEntryId: integer('reversal_of_journal_entry_id').references((): AnyPgColumn => journalEntries.id),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  exportedAt: timestamp('exported_at'),
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;

// Journal lines — individual debit/credit lines within an entry
export const journalLines = pgTable('journal_lines', {
  id: serial('id').primaryKey(),
  journalEntryId: integer('journal_entry_id')
    .references(() => journalEntries.id)
    .notNull(),
  accountId: integer('account_id')
    .references(() => chartOfAccounts.id)
    .notNull(),
  debitAmount: real('debit_amount').default(0),
  creditAmount: real('credit_amount').default(0),
  customerId: text('customer_id'),
  customerNameSnapshot: text('customer_name_snapshot'),
  customerType: text('customer_type'),
  projectId: text('project_id'),
  projectNameSnapshot: text('project_name_snapshot'),
  contractNumber: text('contract_number'),
  productionLine: text('production_line'),
  department: text('department'),
  chargeCodeId: integer('charge_code_id').references(() => chargeCodes.id),
  inventoryItemId: text('inventory_item_id'),
  partNumber: text('part_number'),
  salespersonUserId: integer('salesperson_user_id').references(() => users.id),
  salespersonNameSnapshot: text('salesperson_name_snapshot'),
  csrUserId: integer('csr_user_id').references(() => users.id),
  csrNameSnapshot: text('csr_name_snapshot'),
  allowability: text('allowability').notNull().default('ALLOWABLE'),
  directIndirect: text('direct_indirect').notNull().default('UNASSIGNED'),
  costPool: text('cost_pool'),
  dimensionTags: jsonb('dimension_tags').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertJournalLineSchema = createInsertSchema(journalLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type JournalLine = typeof journalLines.$inferSelect;
export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;

export const accountingAdminUsers = pgTable('accounting_admin_users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  active: boolean('active').notNull().default(true),
  grantedBy: text('granted_by'),
  grantedAt: timestamp('granted_at').defaultNow(),
});
export const insertAccountingAdminUserSchema = createInsertSchema(accountingAdminUsers).omit({
  id: true,
  grantedAt: true,
});
export type AccountingAdminUser = typeof accountingAdminUsers.$inferSelect;
export type InsertAccountingAdminUser = z.infer<typeof insertAccountingAdminUserSchema>;

export const accountingPeriods = pgTable('accounting_periods', {
  id: serial('id').primaryKey(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  status: text('status').notNull().default('MIGRATION'), // OPEN | MIGRATION | SOFT_CLOSED | HARD_CLOSED | FINAL_LOCKED
  hardLockEnforcedAt: timestamp('hard_lock_enforced_at'),
  closedBy: text('closed_by'),
  closedAt: timestamp('closed_at'),
  reopenedBy: text('reopened_by'),
  reopenedAt: timestamp('reopened_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniquePeriod: unique('accounting_periods_year_month_unique').on(table.periodYear, table.periodMonth),
}));
export const insertAccountingPeriodSchema = createInsertSchema(accountingPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type InsertAccountingPeriod = z.infer<typeof insertAccountingPeriodSchema>;

// ─── Sign Order Page Settings (singleton) ────────────────────────────────────
export const signOrderPageSettings = pgTable('sign_order_page_settings', {
  id: serial('id').primaryKey(),
  pageTitle: text('page_title').notNull().default('Review & Sign Sales Order'),
  pageDescription: text('page_description').notNull().default('Please review the order details below carefully before signing.'),
  signatureDisclaimer: text('signature_disclaimer').notNull().default('By signing below, you confirm that the order details above are correct and authorize AG Composites to begin production.'),
  successMessage: text('success_message').notNull().default('Order signed successfully! Your order has been moved to the production queue.'),
  alreadySignedTitle: text('already_signed_title').notNull().default('Order Already Signed'),
  alreadySignedMessage: text('already_signed_message').notNull().default('Your order is in production.'),
  invalidLinkMessage: text('invalid_link_message').notNull().default('Invalid or missing signature link. Please use the link from your email to sign your order.'),
  orderNotFoundMessage: text('order_not_found_message').notNull().default('The order link is invalid or has expired. Please contact support.'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
});

export const insertSignOrderPageSettingsSchema = createInsertSchema(signOrderPageSettings).omit({
  id: true,
  updatedAt: true,
});
export type SignOrderPageSettings = typeof signOrderPageSettings.$inferSelect;
export type InsertSignOrderPageSettings = z.infer<typeof insertSignOrderPageSettingsSchema>;

// ─── Metrics Registry ─────────────────────────────────────────────────────────
export const metricsRegistry = pgTable('metrics_registry', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull().default('general'),
  unit: text('unit').notNull().default('count'),
  calculationFunction: text('calculation_function').notNull(),
  defaultVisual: text('default_visual').notNull().default('stat_card'),
  isLive: boolean('is_live').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertMetricsRegistrySchema = createInsertSchema(metricsRegistry).omit({
  id: true,
  createdAt: true,
});
export type MetricsRegistry = typeof metricsRegistry.$inferSelect;
export type InsertMetricsRegistry = z.infer<typeof insertMetricsRegistrySchema>;

// ─── Metric Snapshots ──────────────────────────────────────────────────────────
export const metricSnapshots = pgTable('metric_snapshots', {
  id: serial('id').primaryKey(),
  metricSlug: text('metric_slug').notNull(),
  period: text('period').notNull().default('live'),
  valueJson: jsonb('value_json').notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const insertMetricSnapshotsSchema = createInsertSchema(metricSnapshots).omit({
  id: true,
  computedAt: true,
});
export type MetricSnapshotRow = typeof metricSnapshots.$inferSelect;
export type InsertMetricSnapshot = z.infer<typeof insertMetricSnapshotsSchema>;

// ─── Unit Families ──────────────────────────────────────────────────────────
export const unitFamilies = pgTable('unit_families', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUnitFamilySchema = createInsertSchema(unitFamilies).omit({ id: true, createdAt: true });
export type UnitFamily = typeof unitFamilies.$inferSelect;
export type InsertUnitFamily = z.infer<typeof insertUnitFamilySchema>;

// ─── Units ──────────────────────────────────────────────────────────────────
export const units = pgTable('units', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull().unique(),
  familyId: integer('family_id').notNull().references(() => unitFamilies.id),
  conversionToBase: real('conversion_to_base').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUnitSchema = createInsertSchema(units).omit({ id: true, createdAt: true });
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;

// ─── AR Invoices ────────────────────────────────────────────────────────────
export const arInvoices = pgTable('ar_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: text('customer_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  dueDate: date('due_date'),
  terms: text('terms'),
  poId: text('po_id'),         // kept — free-text PO reference from legacy flow
  poOverride: text('po_override'),
  subtotal: numeric('subtotal').notNull(),
  discountAmount: numeric('discount_amount').notNull().default('0'),
  freightAmount: numeric('freight_amount').notNull().default('0'),
  taxAmount: numeric('tax_amount').notNull().default('0'),
  retainagePercent: numeric('retainage_percent').notNull().default('0'),
  retainageAmount: numeric('retainage_amount').notNull().default('0'),
  totalAmount: numeric('total_amount').notNull(),
  // status valid values: DRAFT, REVIEW, POSTED, SENT, DISPUTED, VOID, PAID
  status: text('status').notNull().default('DRAFT'),
  notes: text('notes'),
  customerVisibleNotes: text('customer_visible_notes'),
  internalNotes: text('internal_notes'),
  // Shipment traceability — populated when invoice is raised against a specific shipment
  lotId: uuid('lot_id').references(() => p2LotNumbers.id),
  packingSlipId: uuid('packing_slip_id').references(() => p2PackingSlips.id),
  wadId: uuid('wad_id'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // ─── Lifecycle fields ───────────────────────────────────────────────────────
  postedAt: timestamp('posted_at'),
  postedBy: text('posted_by'),
  sentAt: timestamp('sent_at'),
  sentBy: text('sent_by'),
  sendgridMessageId: text('sendgrid_message_id'),
  sentTo: text('sent_to'),
  sentCc: text('sent_cc').array(),
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
  isDisputed: boolean('is_disputed').default(false),
  disputeNote: text('dispute_note'),
  // creditMemoId — FK to credit_memos, set when a credit memo is applied/linked
  creditMemoId: integer('credit_memo_id').references(() => creditMemos.id),
  autoCreated: boolean('auto_created').default(false),
  pricingMismatch: boolean('pricing_mismatch').default(false),
  pricingAmbiguous: boolean('pricing_ambiguous').default(false),
}, (table) => ({
  customerIdx: index('ar_invoices_customer_id_idx').on(table.customerId),
  invoiceNumberIdx: index('ar_invoices_invoice_number_idx').on(table.invoiceNumber),
  lotIdIdx: index('ar_invoices_lot_id_idx').on(table.lotId),
  packingSlipIdUniq: uniqueIndex('ar_invoices_packing_slip_id_uniq').on(table.packingSlipId),
}));

export const insertArInvoiceSchema = createInsertSchema(arInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ArInvoice = typeof arInvoices.$inferSelect;
export type InsertArInvoice = z.infer<typeof insertArInvoiceSchema>;

// ─── AR Invoice Lines ───────────────────────────────────────────────────────
export const arInvoiceLines = pgTable('ar_invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').notNull().references(() => arInvoices.id, { onDelete: 'cascade' }),
  inventoryItemId: text('inventory_item_id'),
  poItemId: integer('po_item_id').references(() => p2PurchaseOrderItems.id),
  partNumber: text('part_number'),
  productionLine: text('production_line').notNull().default('MIGRATION_REVIEW'),
  projectId: text('project_id'),
  projectNameSnapshot: text('project_name_snapshot'),
  salespersonUserId: integer('salesperson_user_id').references(() => users.id),
  salespersonNameSnapshot: text('salesperson_name_snapshot'),
  csrUserId: integer('csr_user_id').references(() => users.id),
  csrNameSnapshot: text('csr_name_snapshot'),
  customerType: text('customer_type'),
  dimensionTags: jsonb('dimension_tags').notNull().default(sql`'{}'::jsonb`),
  description: text('description').notNull(),
  qty: numeric('qty').notNull(),
  unitPrice: numeric('unit_price').notNull(),
  lineTotal: numeric('line_total').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertArInvoiceLineSchema = createInsertSchema(arInvoiceLines).omit({
  id: true,
  createdAt: true,
});
export type ArInvoiceLine = typeof arInvoiceLines.$inferSelect;
export type InsertArInvoiceLine = z.infer<typeof insertArInvoiceLineSchema>;

// ─── AR Payments ─────────────────────────────────────────────────────────────
export const arPayments = pgTable('ar_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: text('customer_id').notNull(),
  paymentDate: date('payment_date').notNull(),
  paymentMethod: text('payment_method').notNull(),
  referenceNumber: text('reference_number'),
  amount: numeric('amount').notNull(),
  notes: text('notes'),
  createdBy: text('created_by'),
  status: text('status').default('posted').notNull(), // posted, voided
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  customerIdx: index('ar_payments_customer_id_idx').on(table.customerId),
}));

export const insertArPaymentSchema = createInsertSchema(arPayments).omit({
  id: true,
  createdAt: true,
});
export type ArPayment = typeof arPayments.$inferSelect;
export type InsertArPayment = z.infer<typeof insertArPaymentSchema>;

// ─── AR Payment Allocations ──────────────────────────────────────────────────
export const arPaymentAllocations = pgTable('ar_payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => arPayments.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id').notNull().references(() => arInvoices.id),
  amountApplied: numeric('amount_applied').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  paymentIdx: index('ar_payment_alloc_payment_id_idx').on(table.paymentId),
  invoiceIdx: index('ar_payment_alloc_invoice_id_idx').on(table.invoiceId),
}));

export const insertArPaymentAllocationSchema = createInsertSchema(arPaymentAllocations).omit({
  id: true,
  createdAt: true,
});
export type ArPaymentAllocation = typeof arPaymentAllocations.$inferSelect;
export type InsertArPaymentAllocation = z.infer<typeof insertArPaymentAllocationSchema>;

// ─── AR Relations (declared after all AR tables) ─────────────────────────────
export const arInvoicesRelations = relations(arInvoices, ({ many }) => ({
  lines: many(arInvoiceLines),
  allocations: many(arPaymentAllocations),
}));

export const arInvoiceLinesRelations = relations(arInvoiceLines, ({ one }) => ({
  invoice: one(arInvoices, {
    fields: [arInvoiceLines.invoiceId],
    references: [arInvoices.id],
  }),
}));

export const arPaymentsRelations = relations(arPayments, ({ many }) => ({
  allocations: many(arPaymentAllocations),
}));

export const arPaymentAllocationsRelations = relations(arPaymentAllocations, ({ one }) => ({
  payment: one(arPayments, {
    fields: [arPaymentAllocations.paymentId],
    references: [arPayments.id],
  }),
  invoice: one(arInvoices, {
    fields: [arPaymentAllocations.invoiceId],
    references: [arInvoices.id],
  }),
}));

// ─── AR Payment Attachments ───────────────────────────────────────────────────
export const arPaymentAttachments = pgTable('ar_payment_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => arPayments.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export const insertArPaymentAttachmentSchema = createInsertSchema(arPaymentAttachments).omit({
  id: true,
  uploadedAt: true,
});
export type InsertArPaymentAttachment = z.infer<typeof insertArPaymentAttachmentSchema>;
export type ArPaymentAttachment = typeof arPaymentAttachments.$inferSelect;

export const arPaymentAttachmentsRelations = relations(arPaymentAttachments, ({ one }) => ({
  payment: one(arPayments, {
    fields: [arPaymentAttachments.paymentId],
    references: [arPayments.id],
  }),
}));

// ─── Capability-Based Permission System ───────────────────────────────────────
// Distinct from the employee-capability system (capabilities / employeeCapabilities).
// This drives page access, button visibility, and API enforcement for web users.

export const permCapabilities = pgTable('perm_capabilities', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),          // e.g. "finance.ar.view"
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('general'), // e.g. "finance", "orders"
});

export const permRoles = pgTable('perm_roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),         // e.g. "ADMIN", "OWNER", "EMPLOYEE"
  description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(false), // system roles can't be deleted
});

export const permRoleCapabilities = pgTable('perm_role_capabilities', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').notNull().references(() => permRoles.id, { onDelete: 'cascade' }),
  capabilityId: integer('capability_id').notNull().references(() => permCapabilities.id, { onDelete: 'cascade' }),
}, (table) => ({
  uniq: unique().on(table.roleId, table.capabilityId),
}));

export const permUserOverrides = pgTable('perm_user_overrides', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  capabilityId: integer('capability_id').notNull().references(() => permCapabilities.id, { onDelete: 'cascade' }),
  effect: text('effect').notNull(), // 'allow' | 'deny'
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  uniq: unique().on(table.userId, table.capabilityId),
}));

export const permUserCapabilityScopes = pgTable('perm_user_capability_scopes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  capabilityId: integer('capability_id').notNull().references(() => permCapabilities.id, { onDelete: 'cascade' }),
  scopeType: text('scope_type').notNull(), // 'GLOBAL' | 'DEPARTMENT' | 'PROJECT'
  department: text('department'),    // non-null when scopeType = 'DEPARTMENT'
  projectId: text('project_id'),     // non-null when scopeType = 'PROJECT'
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertPermUserCapabilityScopeSchema = createInsertSchema(permUserCapabilityScopes)
  .omit({ id: true, createdAt: true })
  .extend({
    scopeType: z.enum(['GLOBAL', 'DEPARTMENT', 'PROJECT']),
    department: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  });

export type PermUserCapabilityScope = typeof permUserCapabilityScopes.$inferSelect;
export type InsertPermUserCapabilityScope = z.infer<typeof insertPermUserCapabilityScopeSchema>;

// ─── P2 Nonconforming Dispositions ────────────────────────────────────────────
// Disposition reports filed for P2 serialized items that have been flagged as
// nonconforming (status = SCRAPPED on p2_serialized_items). A disposition must
// be filed before the item can be considered resolved.

export const p2NonconformingDispositions = pgTable('p2_nonconforming_dispositions', {
  id: serial('id').primaryKey(),
  serializedItemId: uuid('serialized_item_id')
    .notNull()
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' }),
  // Disposition type drives downstream outcome
  dispositionType: text('disposition_type').notNull(), // Scrap | Repair | Use as Is | Use for Reference | Return to Vendor
  // Project / PO linkage
  poId: integer('po_id').references(() => p2PurchaseOrders.id),
  poNumber: text('po_number'), // Denormalized for display
  // Authorization
  authorization: text('auth_person').notNull(),
  // Part identifiers (pre-filled from serialized item, stored as snapshot)
  partNumber: text('part_number').notNull(),
  serialNumber: text('serial_number').notNull(),
  // Date
  dispositionDate: date('disposition_date').notNull(),
  // Reason
  reasonType: text('reason_type').notNull(), // quality | other
  reasonOther: text('reason_other'), // free text when reasonType = 'other'
  // Notes
  notes: text('notes'),
  // Resolution status
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertP2NonconformingDispositionSchema = createInsertSchema(p2NonconformingDispositions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dispositionType: z.enum(['Scrap', 'Repair', 'Use as Is', 'Use for Reference', 'Return to Vendor']),
  reasonType: z.enum(['quality', 'other']),
  reasonOther: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  poId: z.number().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().optional().nullable(),
});

export type P2NonconformingDisposition = typeof p2NonconformingDispositions.$inferSelect;
export type InsertP2NonconformingDisposition = z.infer<typeof insertP2NonconformingDispositionSchema>;

// ─── P2 RMAs ──────────────────────────────────────────────────────────────────
// RMA records created when a disposition type is "Repair". Linked to the
// disposition record. Tracks traceable materials and shipment.

export const p2Rmas = pgTable('p2_rmas', {
  id: serial('id').primaryKey(),
  dispositionId: integer('disposition_id')
    .notNull()
    .references(() => p2NonconformingDispositions.id, { onDelete: 'cascade' }),
  serializedItemId: uuid('serialized_item_id')
    .notNull()
    .references(() => p2SerializedItems.id, { onDelete: 'cascade' }),
  rmaNumber: text('rma_number').notNull().unique(), // Auto-generated e.g. RMA-P2-20260324-1
  status: text('status').notNull().default('open'), // open | shipped | complete
  // Traceable materials used in repair (JSONB array: [{name, lot, qty}])
  traceableMaterials: jsonb('traceable_materials').$type<{ name: string; lot: string; qty: string }[]>().notNull().default(sql`'[]'::jsonb`),
  shippedAt: timestamp('shipped_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertP2RmaSchema = createInsertSchema(p2Rmas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(['open', 'shipped', 'complete']).default('open'),
  traceableMaterials: z.array(z.object({
    name: z.string(),
    lot: z.string(),
    qty: z.string(),
  })).optional().default([]),
  notes: z.string().optional().nullable(),
  shippedAt: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
});

export type P2Rma = typeof p2Rmas.$inferSelect;
export type InsertP2Rma = z.infer<typeof insertP2RmaSchema>;

// ─── P2 Shipping RMAs ─────────────────────────────────────────────────────────
// Structured Return Merchandise Authorization for P2 customer shipments.
// Created when a customer returns goods after a packing slip has been issued.
export const p2ShippingRmas = pgTable('p2_shipping_rmas', {
  id: uuid('id').defaultRandom().primaryKey(),
  rmaNumber: text('rma_number').notNull().unique(),
  packingSlipId: uuid('packing_slip_id').notNull().references(() => p2PackingSlips.id),
  invoiceId: uuid('invoice_id').references(() => arInvoices.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN | RECEIVED | CLOSED
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').notNull(),
});

export const insertP2ShippingRmaSchema = createInsertSchema(p2ShippingRmas).omit({
  id: true,
  rmaNumber: true,
  createdAt: true,
}).extend({
  status: z.enum(['OPEN', 'RECEIVED', 'CLOSED']).default('OPEN').optional(),
});

export type P2ShippingRma = typeof p2ShippingRmas.$inferSelect;
export type InsertP2ShippingRma = z.infer<typeof insertP2ShippingRmaSchema>;

// ─── QuickNotes ───────────────────────────────────────────────────────────────
export const quickNotes = pgTable('quick_notes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  format: text('format').notNull().default('text'), // 'text' | 'spreadsheet'
  tags: text('tags').array(),
  createdByUserId: integer('created_by_user_id').notNull(),
  createdByDisplayName: text('created_by_display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertQuickNoteSchema = createInsertSchema(quickNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type QuickNote = typeof quickNotes.$inferSelect;
export type InsertQuickNote = z.infer<typeof insertQuickNoteSchema>;

export const quickNoteShares = pgTable('quick_note_shares', {
  id: serial('id').primaryKey(),
  noteId: integer('note_id').notNull().references(() => quickNotes.id, { onDelete: 'cascade' }),
  sharedWithUserId: integer('shared_with_user_id').notNull(),
  sharedWithDisplayName: text('shared_with_display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertQuickNoteShareSchema = createInsertSchema(quickNoteShares).omit({
  id: true,
  createdAt: true,
});
export type QuickNoteShare = typeof quickNoteShares.$inferSelect;
export type InsertQuickNoteShare = z.infer<typeof insertQuickNoteShareSchema>;

// ─── Improvement Notes ──────────────────────────────────────────────────────
// Workflow improvement suggestions captured from any page in EPOCH.
// Promoted from localStorage prototype to a real backed table in 0104.
export const improvementNotes = pgTable('improvement_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  role: text('role').notNull().default('Other'),
  workflow: text('workflow').notNull().default('Other'),
  type: text('type').notNull().default('idea'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('new'),
  pagePath: text('page_path').notNull().default(''),
  pageTitle: text('page_title').notNull().default(''),
  pageUrl: text('page_url').notNull().default(''),
  source: text('source').notNull().default('context-capture'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name').notNull().default('unknown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertImprovementNoteSchema = createInsertSchema(improvementNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ImprovementNote = typeof improvementNotes.$inferSelect;
export type InsertImprovementNote = z.infer<typeof insertImprovementNoteSchema>;

// ─── Schema Governance Audit Log ────────────────────────────────────────────

// Draft Builder BOM drafts shared across users with Draft Builder access.
export const draftBomDrafts = pgTable('draft_bom_drafts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  revision: text('revision').notNull().default('Draft A'),
  project: text('project').notNull().default(''),
  projectId: text('project_id'),
  projectCode: text('project_code'),
  projectName: text('project_name'),
  projectType: text('project_type'),
  data: jsonb('data').notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  visibility: text('visibility').notNull().default('public'),
  allowPublicEdit: boolean('allow_public_edit').notNull().default(false),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByDisplayName: text('created_by_display_name').notNull().default('unknown'),
  updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByDisplayName: text('updated_by_display_name').notNull().default('unknown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertDraftBomDraftSchema = createInsertSchema(draftBomDrafts).omit({
  createdAt: true,
  updatedAt: true,
});
export type DraftBomDraft = typeof draftBomDrafts.$inferSelect;
export type InsertDraftBomDraft = z.infer<typeof insertDraftBomDraftSchema>;

// R&D projects created from the Design tab. These are shared for every user
// with access to the Design / R&D Projects page.
export const rdProjects = pgTable('rd_projects', {
  id: text('id').primaryKey(),
  projectName: text('project_name').notNull(),
  owner: text('owner').notNull().default(''),
  status: text('status').notNull().default('draft'),
  engineeringStatus: text('engineering_status').notNull().default('DRAFT'),
  signoffRequired: boolean('signoff_required').notNull().default(false),
  signoffUserId: text('signoff_user_id').notNull().default(''),
  draftTabIds: jsonb('draft_tab_ids').notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  description: text('description').notNull().default(''),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByDisplayName: text('created_by_display_name').notNull().default('unknown'),
  updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByDisplayName: text('updated_by_display_name').notNull().default('unknown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const insertRdProjectSchema = createInsertSchema(rdProjects).omit({
  createdAt: true,
  updatedAt: true,
});
export type RdProject = typeof rdProjects.$inferSelect;
export type InsertRdProject = z.infer<typeof insertRdProjectSchema>;

export const schemaChangeLog = pgTable('schema_change_log', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  actor: text('actor').notNull(),
  actionType: text('action_type').notNull(), // ADD_COLUMN | DROP_COLUMN | ALTER | RAW_SQL | OVERRIDE
  tableName: text('table_name').notNull(),
  columnName: text('column_name'),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  approvedBy: text('approved_by'),
  overrideReason: text('override_reason'),
});

export const insertSchemaChangeLogSchema = createInsertSchema(schemaChangeLog).omit({ id: true });
export type SchemaChangeLog = typeof schemaChangeLog.$inferSelect;
export type InsertSchemaChangeLog = z.infer<typeof insertSchemaChangeLogSchema>;

// ─── Order Activity Events — canonical append-only audit ledger ──────────────
//
// Every meaningful mutation to an order writes a row here atomically.
// If the insert fails the outer DB transaction rolls back — no silent logging.
//
// Shadow tables (admin_audit_log, badge_scan_audit_log, departmentHistory,
// order_department_transitions) remain intact for backward compatibility;
// new writes additionally land here.

export const orderActivityEvents = pgTable(
  'order_activity_events',
  {
    id: serial('id').primaryKey(),
    orderId: text('order_id').notNull(),

    // Event classification
    eventType: text('event_type').notNull(),     // e.g. DEPARTMENT_MOVE, STATUS_TRANSITION, SHIPPING_UPDATE
    eventCategory: text('event_category').notNull(), // production | shipping | finance | spec | admin

    // When
    occurredAt: timestamp('occurred_at').notNull().defaultNow(),

    // Who
    actorId: integer('actor_id'),
    actorType: text('actor_type'),          // user | employee | system | offline_replay
    actorDisplayName: text('actor_display_name'),

    // Where / origin
    source: text('source').notNull().default('server'), // server | badge_scan | offline_replay | admin | ncr | rts | shipping
    sourceRoute: text('source_route'),       // e.g. /api/orders/:id/field
    correlationId: text('correlation_id'),   // idempotency / batch grouping key

    // Why
    reasonCode: text('reason_code'),
    reasonText: text('reason_text'),

    // What changed (snapshots & diffs)
    beforeSnapshot: jsonb('before_snapshot'), // full order row before mutation
    afterSnapshot: jsonb('after_snapshot'),   // full order row after mutation
    fieldDiff: jsonb('field_diff'),           // { fieldName: { before, after, label } }

    // Transition helpers (denormalized for fast queries)
    statusFrom: text('status_from'),
    statusTo: text('status_to'),
    departmentFrom: text('department_from'),
    departmentTo: text('department_to'),

    // Related entity (e.g. NCR record, RTS sale, badge action)
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),

    // Catch-all extension bag
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    orderIdIdx: index('oae_order_id_idx').on(table.orderId),
    eventTypeIdx: index('oae_event_type_idx').on(table.eventType),
    eventCategoryIdx: index('oae_event_category_idx').on(table.eventCategory),
    occurredAtIdx: index('oae_occurred_at_idx').on(table.occurredAt),
    actorIdIdx: index('oae_actor_id_idx').on(table.actorId),
    sourceIdx: index('oae_source_idx').on(table.source),
    orderOccurredIdx: index('oae_order_occurred_idx').on(table.orderId, table.occurredAt),
    correlationIdx: index('oae_correlation_id_idx').on(table.correlationId),
  })
);

export const insertOrderActivityEventSchema = createInsertSchema(orderActivityEvents).omit({
  id: true,
  createdAt: true,
});

export type OrderActivityEvent = typeof orderActivityEvents.$inferSelect;
export type InsertOrderActivityEvent = z.infer<typeof insertOrderActivityEventSchema>;

export const p1FulfillmentAttempts = pgTable(
  'p1_fulfillment_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: text('order_id').notNull(),
    status: text('status').notNull().default('IN_PROGRESS'),
    currentStep: text('current_step').notNull().default('READINESS'),
    failedStep: text('failed_step'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    remediationHint: text('remediation_hint'),
    source: text('source').notNull().default('shipping'),
    sourceRoute: text('source_route'),
    trackingNumber: text('tracking_number'),
    shipmentRecordId: uuid('shipment_record_id'),
    journalEntryId: integer('journal_entry_id').references(() => journalEntries.id),
    notificationStatus: text('notification_status').default('NOT_ATTEMPTED'),
    actorUserId: integer('actor_user_id'),
    actorDisplayName: text('actor_display_name'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    orderIdIdx: index('p1_fulfillment_attempts_order_id_idx').on(table.orderId),
    statusIdx: index('p1_fulfillment_attempts_status_idx').on(table.status),
    failedStepIdx: index('p1_fulfillment_attempts_failed_step_idx').on(table.failedStep),
    updatedAtIdx: index('p1_fulfillment_attempts_updated_at_idx').on(table.updatedAt),
  })
);

export const insertP1FulfillmentAttemptSchema = createInsertSchema(p1FulfillmentAttempts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type P1FulfillmentAttempt = typeof p1FulfillmentAttempts.$inferSelect;
export type InsertP1FulfillmentAttempt = z.infer<typeof insertP1FulfillmentAttemptSchema>;

// ─── CNC Dashboard ────────────────────────────────────────────────────────────

export const cncScheduleSettings = pgTable('cnc_schedule_settings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  scheduleType: text('schedule_type').notNull().default('FOUR_TEN'), // FOUR_TEN | FIVE_EIGHT | CUSTOM
  daysPerWeek: real('days_per_week').notNull().default(4),
  hoursPerDay: real('hours_per_day').notNull().default(10),
  weeklyCapacityHours: real('weekly_capacity_hours').notNull().default(40),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncScheduleSettingsSchema = createInsertSchema(cncScheduleSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type CncScheduleSettings = typeof cncScheduleSettings.$inferSelect;
export type InsertCncScheduleSettings = z.infer<typeof insertCncScheduleSettingsSchema>;

export const cncMachines = pgTable('cnc_machines', {
  id: serial('id').primaryKey(),
  machineName: text('machine_name').notNull(),
  machineNumber: text('machine_number'),
  workCenter: text('work_center'),
  capabilities: jsonb('capabilities'),
  axisCapabilities: text('axis_capabilities').array(),
  machineType: text('machine_type'),
  maxLengthIn: real('max_length_in'),
  maxHeightIn: real('max_height_in'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  // Schedule override fields
  useDefaultSchedule: boolean('use_default_schedule').notNull().default(true),
  customDaysPerWeek: real('custom_days_per_week'),
  customHoursPerDay: real('custom_hours_per_day'),
  customWeeklyCapacityHours: real('custom_weekly_capacity_hours'),
});

export const insertCncMachineSchema = createInsertSchema(cncMachines).omit({ id: true, createdAt: true });
export type CncMachine = typeof cncMachines.$inferSelect;
export type InsertCncMachine = z.infer<typeof insertCncMachineSchema>;

// ── Machined Part Routing Tables ──────────────────────────────────────────────

export const machinedPartRoutings = pgTable('machined_part_routings', {
  id: serial('id').primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull(),
  routingName: text('routing_name').notNull(),
  partNumber: text('part_number'),
  partName: text('part_name'),
  notes: text('notes'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertMachinedPartRoutingSchema = createInsertSchema(machinedPartRoutings).omit({ id: true, createdAt: true, updatedAt: true });
export type MachinedPartRouting = typeof machinedPartRoutings.$inferSelect;
export type InsertMachinedPartRouting = z.infer<typeof insertMachinedPartRoutingSchema>;

export const machinedPartRoutingOps = pgTable('machined_part_routing_ops', {
  id: serial('id').primaryKey(),
  routingId: integer('routing_id').references(() => machinedPartRoutings.id).notNull(),
  opNumber: integer('op_number').notNull(),
  opName: text('op_name').notNull(),
  machineType: text('machine_type'),
  preferredMachineId: integer('preferred_machine_id'),
  programNames: jsonb('program_names').$type<string[]>().default([]),
  toolList: jsonb('tool_list').$type<{ toolNumber: string; pocket: string; description: string; diameter: string; offsetNotes: string }[]>().default([]),
  fixtureInstructions: text('fixture_instructions'),
  workOriginNotes: text('work_origin_notes'),
  qcTolerances: jsonb('qc_tolerances').$type<{ characteristic: string; nominal: string; tolerance: string; method: string }[]>().default([]),
  referencePhotoLinks: jsonb('reference_photo_links').$type<{ url: string; caption: string }[]>().default([]),
  tips: text('tips'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertMachinedPartRoutingOpSchema = createInsertSchema(machinedPartRoutingOps).omit({ id: true, createdAt: true });
export type MachinedPartRoutingOp = typeof machinedPartRoutingOps.$inferSelect;
export type InsertMachinedPartRoutingOp = z.infer<typeof insertMachinedPartRoutingOpSchema>;

export const cncJobs = pgTable('cnc_jobs', {
  id: serial('id').primaryKey(),
  workOrder: text('work_order').notNull(),
  partNumber: text('part_number').notNull(),
  partName: text('part_name').notNull(),
  revision: text('revision'),
  qty: integer('qty').notNull().default(1),
  machine: text('machine'),
  programmerUserId: integer('programmer_user_id'),
  programmerDisplayName: text('programmer_display_name'),
  assignedOperatorUserId: integer('assigned_operator_user_id'),
  assignedOperatorDisplayName: text('assigned_operator_display_name'),
  dueDate: date('due_date'),
  estimatedHours: real('estimated_hours'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('queued'),
  linkedTravelerId: text('linked_traveler_id'),
  linkedTravelerStepId: text('linked_traveler_step_id'),
  customerPo: text('customer_po'),
  materialReady: boolean('material_ready').default(false),
  qcHold: boolean('qc_hold').default(false),
  notes: text('notes'),
  forwardDestination: text('forward_destination'),
  completedAt: timestamp('completed_at'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
});

// ─── Receiving Control Center ─────────────────────────────────────────────────
// Aerospace-grade receiving traceability: receipts → receipt_lines → received_units
// Each unit carries its own barcode, disposition, and links to material_lots.

export const receipts = pgTable('receipts', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(), // RCV-YYYYMMDD-NNN
  receiptDate: timestamp('receipt_date').defaultNow().notNull(),
  vendorId: integer('vendor_id'),
  vendorName: text('vendor_name'), // Denormalized snapshot
  vendorPoId: integer('vendor_po_id'), // Link to vendor_pos.id (nullable for manual receipts)
  vendorPoNumber: text('vendor_po_number'), // Denormalized snapshot
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  packingSlipNumber: text('packing_slip_number'),
  conditionOnArrival: text('condition_on_arrival').default('good'), // good | damaged | partial | refused
  status: text('status').default('in_progress').notNull(), // in_progress | complete | cancelled
  notes: text('notes'),
  // Receiver (EPOCH identity standard)
  receiverUserId: integer('receiver_user_id'),
  receiverDisplayName: text('receiver_display_name'),
  // Explicit physical-receipt timestamp (separate from DB createdAt — set by receiver during Step 1)
  receivedAt: timestamp('received_at'),
  // Department association (drives auto-fill of location/freezer defaults in putaway)
  departmentId: integer('department_id').references(() => inventoryDepartments.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncJobSchema = createInsertSchema(cncJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CncJob = typeof cncJobs.$inferSelect;
export type InsertCncJob = z.infer<typeof insertCncJobSchema>;

export const cncJobOperations = pgTable('cnc_job_operations', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull().references(() => cncJobs.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  opName: text('op_name').notNull(),
  opDescription: text('op_description'),
  standardLaborMinutes: integer('standard_labor_minutes'),
  machine: text('machine'),
  estimatedSetupMinutes: real('estimated_setup_minutes'),
  estimatedCycleMinutes: real('estimated_cycle_minutes'),
  status: text('status').notNull().default('pending'),
  ncProgramRef: text('nc_program_ref'),
  qcPlan: text('qc_plan'),
  fixture: text('fixture'),
  workRefPoint: text('work_ref_point'),
  rawStockOrientation: text('raw_stock_orientation'),
  datumNotes: text('datum_notes'),
  warmupNotes: text('warmup_notes'),
  tribalKnowledge: text('tribal_knowledge'),
  actualSetupStartAt: timestamp('actual_setup_start_at'),
  actualSetupEndAt: timestamp('actual_setup_end_at'),
  actualRunStartAt: timestamp('actual_run_start_at'),
  actualRunEndAt: timestamp('actual_run_end_at'),
  partCount: integer('part_count').default(0),
  scrapQty: integer('scrap_qty').default(0),
  pauseReason: text('pause_reason'),
  proveoutCompleted: boolean('proveout_completed').default(false),
  claimedByUserId: integer('claimed_by_user_id'),
  claimedByDisplayName: text('claimed_by_display_name'),
  signedOffByUserId: integer('signed_off_by_user_id'),
  signedOffByDisplayName: text('signed_off_by_display_name'),
  operatorNotes: text('operator_notes'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncJobOperationSchema = createInsertSchema(cncJobOperations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CncJobOperation = typeof cncJobOperations.$inferSelect;
export type InsertCncJobOperation = z.infer<typeof insertCncJobOperationSchema>;

export const cncOperationBatches = pgTable('cnc_operation_batches', {
  id: serial('id').primaryKey(),
  workOrderId: uuid('work_order_id').notNull().references((): AnyPgColumn => productionWorkOrders.id, { onDelete: 'cascade' }),
  travelerStepId: varchar('traveler_step_id', { length: 255 }).notNull().references(() => travelerSteps.id, { onDelete: 'cascade' }),
  operationId: integer('operation_id').references(() => cncJobOperations.id, { onDelete: 'set null' }),
  batchCode: text('batch_code').notNull().unique(),
  batchNumber: integer('batch_number').notNull(),
  batchQty: integer('batch_qty').notNull(),
  qtyCompleted: integer('qty_completed').notNull().default(0),
  qtyScrapped: integer('qty_scrapped').notNull().default(0),
  assignedMachineId: integer('assigned_machine_id').references(() => cncMachines.id, { onDelete: 'set null' }),
  assignedMachineName: text('assigned_machine_name'),
  assignedEmployeeId: integer('assigned_employee_id').references(() => employees.id, { onDelete: 'set null' }),
  assignedEmployeeDisplayName: text('assigned_employee_display_name'),
  status: text('status').notNull().default('queued'),
  barcodeValue: text('barcode_value').notNull().unique(),
  priority: text('priority').notNull().default('medium'),
  dueDate: date('due_date'),
  notes: text('notes'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  workOrderStepIdx: index('cnc_operation_batches_work_order_step_idx').on(table.workOrderId, table.travelerStepId),
  statusIdx: index('cnc_operation_batches_status_idx').on(table.status),
  barcodeIdx: uniqueIndex('cnc_operation_batches_barcode_idx').on(table.barcodeValue),
  batchCodeIdx: uniqueIndex('cnc_operation_batches_batch_code_idx').on(table.batchCode),
}));

export const insertCncOperationBatchSchema = createInsertSchema(cncOperationBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CncOperationBatch = typeof cncOperationBatches.$inferSelect;
export type InsertCncOperationBatch = z.infer<typeof insertCncOperationBatchSchema>;

export const cncPrograms = pgTable('cnc_programs', {
  id: serial('id').primaryKey(),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  programName: text('program_name').notNull(),
  programNumber: text('program_number'),
  version: text('version'),
  machine: text('machine'),
  estimatedCycleMinutes: real('estimated_cycle_minutes'),
  proveOutRequired: boolean('prove_out_required').default(false),
  approvedByUserId: integer('approved_by_user_id'),
  approvedByDisplayName: text('approved_by_display_name'),
  approvedAt: timestamp('approved_at'),
});

export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;

export const receiptLines = pgTable('receipt_lines', {
  id: serial('id').primaryKey(),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  vendorPoItemId: integer('vendor_po_item_id'), // Link to vendor_po_items.id
  agPartNumber: text('ag_part_number'),
  description: text('description'),
  orderedQty: numeric('ordered_qty'),
  receivedQty: numeric('received_qty').default('0').notNull(),
  uom: text('uom').default('EA'),
  isPartial: boolean('is_partial').default(false),
  isOver: boolean('is_over').default(false), // received > ordered
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncProgramSchema = createInsertSchema(cncPrograms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReceiptLineSchema = createInsertSchema(receiptLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CncProgram = typeof cncPrograms.$inferSelect;
export type InsertCncProgram = z.infer<typeof insertCncProgramSchema>;

export const cncToolLists = pgTable('cnc_tool_lists', {
  id: serial('id').primaryKey(),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  toolNumber: text('tool_number').notNull(),
  holderPosition: text('holder_position'),
  toolName: text('tool_name').notNull(),
  diameter: real('diameter'),
  offsetNotes: text('offset_notes'),
  replacementNotes: text('replacement_notes'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncToolListSchema = createInsertSchema(cncToolLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ReceiptLine = typeof receiptLines.$inferSelect;
export type InsertReceiptLine = z.infer<typeof insertReceiptLineSchema>;

export const receivedUnits = pgTable('received_units', {
  id: serial('id').primaryKey(),
  receiptLineId: integer('receipt_line_id').notNull().references(() => receiptLines.id, { onDelete: 'cascade' }),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  unitSequence: integer('unit_sequence').notNull(), // 1-based within receipt
  barcode: text('barcode').notNull().unique(), // RCV-{receiptNumber}-{sequence}
  unitType: text('unit_type').default('other'), // roll | box | bar | tube | serialized_piece | other
  quantity: numeric('quantity').notNull(),
  uom: text('uom').default('EA'),
  // Traceability fields
  lotNumber: text('lot_number'),
  batchNumber: text('batch_number'),
  serialNumber: text('serial_number'),
  internalControlNumber: text('internal_control_number'),
  rollNumber: text('roll_number'),
  heatLot: text('heat_lot'),
  manufactureDate: date('manufacture_date'),
  expirationDate: date('expiration_date'),
  shelfLifeDays: integer('shelf_life_days'),
  certReference: text('cert_reference'),
  // Disposition
  disposition: text('disposition').default('pending_inspection').notNull(), // pending_inspection | accepted | quarantine | rejected
  dispositionNotes: text('disposition_notes'),
  dispositionByUserId: integer('disposition_by_user_id'),
  dispositionByDisplayName: text('disposition_by_display_name'),
  dispositionAt: timestamp('disposition_at'),
  // Location / allocation
  location: text('location'),
  freezerNumber: integer('freezer_number'),
  allocatedToType: text('allocated_to_type'), // work_order | po_demand | stock | quarantine
  allocatedToId: integer('allocated_to_id'),
  targetProjectId: uuid('target_project_id').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  // Link to material_lots when accepted
  materialLotId: uuid('material_lot_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  receiptLineIdx: index('received_units_receipt_line_idx').on(table.receiptLineId),
  receiptIdx: index('received_units_receipt_idx').on(table.receiptId),
  barcodeIdx: uniqueIndex('received_units_barcode_idx').on(table.barcode),
  targetProjectIdx: index('received_units_target_project_idx').on(table.targetProjectId),
}));

export const insertReceivedUnitSchema = createInsertSchema(receivedUnits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CncToolList = typeof cncToolLists.$inferSelect;
export type InsertCncToolList = z.infer<typeof insertCncToolListSchema>;

export const cncSetupPhotos = pgTable('cnc_setup_photos', {
  id: serial('id').primaryKey(),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  url: text('url').notNull(),
  storageKey: text('storage_key'),
  caption: text('caption'),
  uploadedByUserId: integer('uploaded_by_user_id'),
  uploadedByDisplayName: text('uploaded_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type ReceivedUnit = typeof receivedUnits.$inferSelect;
export type InsertReceivedUnit = z.infer<typeof insertReceivedUnitSchema>;

export const projectReceivedMaterials = pgTable('project_received_materials', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references((): AnyPgColumn => projects.id, { onDelete: 'cascade' }),
  receivedUnitId: integer('received_unit_id').notNull().references(() => receivedUnits.id, { onDelete: 'cascade' }),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  materialLotId: uuid('material_lot_id').references(() => materialLots.id, { onDelete: 'set null' }),
  quantity: numeric('quantity').notNull(),
  unitCost: numeric('unit_cost').notNull().default('0'),
  extendedCost: numeric('extended_cost').notNull().default('0'),
  status: text('status').notNull().default('pending_pm_acceptance'),
  acceptedByUserId: integer('accepted_by_user_id'),
  acceptedByDisplayName: text('accepted_by_display_name'),
  acceptedAt: timestamp('accepted_at'),
  rejectedByUserId: integer('rejected_by_user_id'),
  rejectedByDisplayName: text('rejected_by_display_name'),
  rejectedAt: timestamp('rejected_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdx: index('project_received_materials_project_idx').on(table.projectId),
  receiptIdx: index('project_received_materials_receipt_idx').on(table.receiptId),
  statusIdx: index('project_received_materials_status_idx').on(table.status),
  unitUnique: unique('project_received_materials_received_unit_unique').on(table.receivedUnitId),
}));

export const insertProjectReceivedMaterialSchema = createInsertSchema(projectReceivedMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectReceivedMaterial = typeof projectReceivedMaterials.$inferSelect;
export type InsertProjectReceivedMaterial = z.infer<typeof insertProjectReceivedMaterialSchema>;

export const receiptDocuments = pgTable('receipt_documents', {
  id: serial('id').primaryKey(),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  receivedUnitId: integer('received_unit_id').references(() => receivedUnits.id, { onDelete: 'set null' }),
  mediaId: uuid('media_id').references(() => mediaLibrary.id, { onDelete: 'cascade' }),
  docType: text('doc_type').default('other'), // SDS | TDS | CoC | packing_slip | test_report | supplier_label_photo | damage_photo | other
  filename: text('filename'),
  storagePath: text('storage_path'),
  mimeType: text('mime_type'),
  notes: text('notes'),
  uploadedByUserId: integer('uploaded_by_user_id'),
  uploadedByDisplayName: text('uploaded_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const receivingInspectionPlans = pgTable('receiving_inspection_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(100),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
  agPartNumber: text('ag_part_number'),
  materialType: text('material_type'),
  riskLevel: text('risk_level'), // LOW | MEDIUM | HIGH | CRITICAL
  supplierName: text('supplier_name'),
  supplierStatus: text('supplier_status'), // APPROVED | PROBATION | CONDITIONAL | BLOCKED
  flightCritical: boolean('flight_critical'),
  sampleSizePercent: integer('sample_size_percent').notNull().default(100),
  requiredCheckpoints: jsonb('required_checkpoints').notNull().default([]),
  requiredDocuments: jsonb('required_documents').notNull().default([]),
  autoDisposition: text('auto_disposition').notNull().default('pending_inspection'),
  requiresQualitySignature: boolean('requires_quality_signature').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByDisplayName: text('created_by_display_name'),
  updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByDisplayName: text('updated_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  activeIdx: index('receiving_inspection_plans_active_idx').on(table.isActive),
  itemIdx: index('receiving_inspection_plans_item_idx').on(table.inventoryItemId),
  partIdx: index('receiving_inspection_plans_part_idx').on(table.agPartNumber),
  supplierIdx: index('receiving_inspection_plans_supplier_idx').on(table.supplierName),
  priorityIdx: index('receiving_inspection_plans_priority_idx').on(table.priority),
}));

export const insertReceivingInspectionPlanSchema = createInsertSchema(receivingInspectionPlans)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().min(1, 'Plan name is required'),
    priority: z.number().int().min(0).max(1000).default(100),
    inventoryItemId: z.number().int().positive().optional().nullable(),
    agPartNumber: z.string().optional().nullable(),
    materialType: z.string().optional().nullable(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
    supplierName: z.string().optional().nullable(),
    supplierStatus: z.enum(['APPROVED', 'PROBATION', 'CONDITIONAL', 'BLOCKED']).optional().nullable(),
    flightCritical: z.boolean().optional().nullable(),
    sampleSizePercent: z.number().int().min(0).max(100).default(100),
    requiredCheckpoints: z.array(z.string()).default([]),
    requiredDocuments: z.array(z.string()).default([]),
    autoDisposition: z.enum(['pending_inspection', 'document_hold', 'quarantine']).default('pending_inspection'),
    requiresQualitySignature: z.boolean().default(false),
    isActive: z.boolean().default(true),
  });

export const updateReceivingInspectionPlanSchema = insertReceivingInspectionPlanSchema.partial();
export type ReceivingInspectionPlan = typeof receivingInspectionPlans.$inferSelect;
export type InsertReceivingInspectionPlan = z.infer<typeof insertReceivingInspectionPlanSchema>;

export const insertCncSetupPhotoSchema = createInsertSchema(cncSetupPhotos).omit({
  id: true,
  createdAt: true,
});
export type CncSetupPhoto = typeof cncSetupPhotos.$inferSelect;
export type InsertCncSetupPhoto = z.infer<typeof insertCncSetupPhotoSchema>;

export const cncQcCheckpoints = pgTable('cnc_qc_checkpoints', {
  id: serial('id').primaryKey(),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  characteristic: text('characteristic'),
  nominal: text('nominal'),
  tolerance: text('tolerance'),
  method: text('method'),
  frequency: text('frequency'),
  required: boolean('required').default(true),
  photoRequired: boolean('photo_required').default(false),
  signatureRequired: boolean('signature_required').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCncQcCheckpointSchema = createInsertSchema(cncQcCheckpoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CncQcCheckpoint = typeof cncQcCheckpoints.$inferSelect;
export type InsertCncQcCheckpoint = z.infer<typeof insertCncQcCheckpointSchema>;

export const cncQcResults = pgTable('cnc_qc_results', {
  id: serial('id').primaryKey(),
  checkpointId: integer('checkpoint_id').notNull().references(() => cncQcCheckpoints.id, { onDelete: 'cascade' }),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  result: text('result').notNull(),
  measuredValue: text('measured_value'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  recordedByUserId: integer('recorded_by_user_id'),
  recordedByDisplayName: text('recorded_by_display_name'),
  recordedAt: timestamp('recorded_at').defaultNow(),
});

export const insertCncQcResultSchema = createInsertSchema(cncQcResults).omit({
  id: true,
  recordedAt: true,
});
export type CncQcResult = typeof cncQcResults.$inferSelect;
export type InsertCncQcResult = z.infer<typeof insertCncQcResultSchema>;

// ─── CNC Time Logs (pause/resume event ledger) ────────────────────────────────

export const cncTimeLogs = pgTable('cnc_time_logs', {
  id: serial('id').primaryKey(),
  operationId: integer('operation_id').notNull().references(() => cncJobOperations.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // setup_start | setup_end | run_start | run_end | pause | resume
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  reason: text('reason'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertCncTimeLogSchema = createInsertSchema(cncTimeLogs).omit({
  id: true,
  createdAt: true,
});
export type CncTimeLog = typeof cncTimeLogs.$inferSelect;
export type InsertCncTimeLog = z.infer<typeof insertCncTimeLogSchema>;

export const insertReceiptDocumentSchema = createInsertSchema(receiptDocuments).omit({
  id: true,
  createdAt: true,
});
export type ReceiptDocument = typeof receiptDocuments.$inferSelect;
export type InsertReceiptDocument = z.infer<typeof insertReceiptDocumentSchema>;

export const receiptAuditLog = pgTable('receipt_audit_log', {
  id: serial('id').primaryKey(),
  receiptId: integer('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // receipt_created | unit_added | disposition_set | document_uploaded | label_printed | note_added
  actorUserId: integer('actor_user_id'),
  actorDisplayName: text('actor_display_name'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  receiptIdx: index('receipt_audit_log_receipt_idx').on(table.receiptId),
}));

export const insertReceiptAuditLogSchema = createInsertSchema(receiptAuditLog).omit({
  id: true,
  createdAt: true,
});
export type ReceiptAuditLog = typeof receiptAuditLog.$inferSelect;
export type InsertReceiptAuditLog = z.infer<typeof insertReceiptAuditLogSchema>;

// ─── KENTRO-pattern checklist instance engine ──────────────────────────────────

export const checklistInstances = pgTable('checklist_instances', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => checklistTemplates.id),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  contextType: text('context_type').notNull().default('daily'),
  contextDate: date('context_date').notNull(),
  status: text('status').notNull().default('pending'),
  completedAt: timestamp('completed_at'),
  reviewedAt: timestamp('reviewed_at'),
  reviewedByUserId: integer('reviewed_by_user_id'),
  reviewedByDisplayName: text('reviewed_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  templateIdIdx: index('checklist_instances_template_id_idx').on(table.templateId),
  employeeIdIdx: index('checklist_instances_employee_id_idx').on(table.employeeId),
  contextDateIdx: index('checklist_instances_context_date_idx').on(table.contextDate),
  uniqueInstanceIdx: unique('checklist_instances_template_id_employee_id_context_type_co_key').on(table.templateId, table.employeeId, table.contextType, table.contextDate),
}));

export const checklistInstanceItems = pgTable('checklist_instance_items', {
  id: serial('id').primaryKey(),
  instanceId: integer('instance_id').notNull().references(() => checklistInstances.id, { onDelete: 'cascade' }),
  templateItemId: integer('template_item_id').notNull().references(() => checklistTemplateItems.id),
  label: text('label').notNull(),
  type: text('type').notNull().default('checkbox'),
  options: jsonb('options').$type<string[]>(),
  required: boolean('required').notNull().default(false),
  frequency: text('frequency').notNull().default('DAILY'),
  sortOrder: integer('sort_order').notNull().default(0),
  value: text('value'),
  completed: boolean('completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
  completedByUserId: integer('completed_by_user_id'),
  completedByDisplayName: text('completed_by_display_name'),
}, (table) => ({
  instanceIdIdx: index('checklist_instance_items_instance_id_idx').on(table.instanceId),
}));

export const checklistInstanceEvents = pgTable('checklist_instance_events', {
  id: serial('id').primaryKey(),
  instanceId: integer('instance_id').notNull().references(() => checklistInstances.id, { onDelete: 'cascade' }),
  instanceItemId: integer('instance_item_id').references(() => checklistInstanceItems.id),
  eventType: text('event_type').notNull(),
  actorUserId: integer('actor_user_id'),
  actorDisplayName: text('actor_display_name'),
  previousValue: text('previous_value'),
  newValue: text('new_value'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  instanceIdIdx: index('checklist_instance_events_instance_id_idx').on(table.instanceId),
}));

export const insertChecklistInstanceSchema = createInsertSchema(checklistInstances).omit({ id: true, createdAt: true, updatedAt: true });
export type ChecklistInstance = typeof checklistInstances.$inferSelect;
export type InsertChecklistInstance = z.infer<typeof insertChecklistInstanceSchema>;

export const insertChecklistInstanceItemSchema = createInsertSchema(checklistInstanceItems).omit({ id: true });
export type ChecklistInstanceItem = typeof checklistInstanceItems.$inferSelect;
export type InsertChecklistInstanceItem = z.infer<typeof insertChecklistInstanceItemSchema>;

export const insertChecklistInstanceEventSchema = createInsertSchema(checklistInstanceEvents).omit({ id: true, createdAt: true });
export type ChecklistInstanceEvent = typeof checklistInstanceEvents.$inferSelect;
export type InsertChecklistInstanceEvent = z.infer<typeof insertChecklistInstanceEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// EPOCH v9 Production Work Order (WAD) — spine linking Project → Traveler → Time
// ─────────────────────────────────────────────────────────────────────────────

export const productionWorkOrders = pgTable('production_work_orders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workOrderNumber: text('work_order_number').notNull().unique(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  partNumber: text('part_number').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(1).notNull(),
  status: text('status').notNull().default('PLANNED'),
  departmentBudgets: jsonb('department_budgets').default({}).notNull(),
  totalBudgetHours: numeric('total_budget_hours'),
  materialBudgetAmount: numeric('material_budget_amount').default('0').notNull(),
  startDate: date('start_date'),
  dueDate: date('due_date'),
  warningThreshold: numeric('warning_threshold'),
  blockedThreshold: numeric('blocked_threshold'),
  defaultChargeCodeId: integer('default_charge_code_id').references(() => chargeCodes.id, { onDelete: 'set null' }),
  dashboardType: text('dashboard_type'),
  queueType: text('queue_type'),
  assignedDepartment: text('assigned_department'),
  assignedDashboardRoute: text('assigned_dashboard_route'),
  manufacturingQueueId: integer('manufacturing_queue_id').references(() => manufacturingQueue.id, { onDelete: 'set null' }),
  wadStatus: text('wad_status').notNull().default('DRAFT'),
  wizardData: jsonb('wizard_data'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  workOrderNumberIdx: index('production_work_orders_number_idx').on(table.workOrderNumber),
  projectIdIdx: index('production_work_orders_project_id_idx').on(table.projectId),
  statusIdx: index('production_work_orders_status_idx').on(table.status),
}));

export const insertProductionWorkOrderSchema = createInsertSchema(productionWorkOrders)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    workOrderNumber: z.string().min(1, 'Work order number is required'),
    projectId: z.string().uuid('projectId must be a valid UUID'),
    partNumber: z.string().min(1, 'Part number is required'),
    quantity: z.number().int().positive().default(1),
    status: z.enum(['PLANNED', 'READY', 'RELEASED', 'IN_PROGRESS', 'COMPLETE', 'CLOSED']).default('PLANNED'),
    description: z.string().optional().nullable(),
    totalBudgetHours: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    departmentBudgets: z.record(z.any()).optional(),
    warningThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').optional().nullable(),
    blockedThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').optional().nullable(),
    dashboardType: z.string().optional().nullable(),
    queueType: z.string().optional().nullable(),
    assignedDepartment: z.string().optional().nullable(),
    assignedDashboardRoute: z.string().optional().nullable(),
    manufacturingQueueId: z.number().int().optional().nullable(),
    wadStatus: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED']).optional().default('DRAFT'),
    wizardData: z.record(z.any()).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasWarning = data.warningThreshold != null;
    const hasBlocked = data.blockedThreshold != null;
    if (hasWarning !== hasBlocked) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'warningThreshold and blockedThreshold must be provided together', path: ['warningThreshold'] });
    }
    if (hasWarning && hasBlocked) {
      const w = parseFloat(String(data.warningThreshold));
      const b = parseFloat(String(data.blockedThreshold));
      if (w <= 0 || w >= b) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'warningThreshold must be positive and less than blockedThreshold', path: ['warningThreshold'] });
      }
    }
  });

export type ProductionWorkOrder = typeof productionWorkOrders.$inferSelect;
export type InsertProductionWorkOrder = z.infer<typeof insertProductionWorkOrderSchema>;

export const designControlRecords = pgTable('design_control_records', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordNumber: text('record_number'),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  rdProjectId: text('rd_project_id').references(() => rdProjects.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  productionWorkOrderId: uuid('production_work_order_id').references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  p2PurchaseOrderId: integer('p2_purchase_order_id').references(() => p2PurchaseOrders.id, { onDelete: 'set null' }),
  formData: jsonb('form_data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  checklist: jsonb('checklist').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  approvals: jsonb('approvals').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  attachments: jsonb('attachments').$type<unknown[]>().default(sql`'[]'::jsonb`).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  submittedAt: timestamp('submitted_at'),
  releasedAt: timestamp('released_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdx: index('design_control_records_project_id_idx').on(table.projectId),
  rdProjectIdx: index('design_control_records_rd_project_id_idx').on(table.rdProjectId),
  productionWorkOrderIdx: index('design_control_records_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_records_p2_po_id_idx').on(table.p2PurchaseOrderId),
  statusIdx: index('design_control_records_status_idx').on(table.status),
}));

const designControlTraceabilityColumns = () => ({
  rdProjectId: text('rd_project_id').references(() => rdProjects.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  productionWorkOrderId: uuid('production_work_order_id').references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  p2PurchaseOrderId: integer('p2_purchase_order_id').references(() => p2PurchaseOrders.id, { onDelete: 'set null' }),
});

const designControlJsonColumns = () => ({
  formData: jsonb('form_data').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  checklist: jsonb('checklist').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  approvals: jsonb('approvals').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  attachments: jsonb('attachments').$type<unknown[]>().default(sql`'[]'::jsonb`).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
});

export const designControlSteps = pgTable('design_control_steps', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('incomplete'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordStepUnique: uniqueIndex('design_control_steps_record_step_unique').on(table.recordId, table.stepKey),
  recordIdx: index('design_control_steps_record_id_idx').on(table.recordId),
  statusIdx: index('design_control_steps_status_idx').on(table.status),
  rdProjectIdx: index('design_control_steps_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_steps_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_steps_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_steps_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlRequirements = pgTable('design_control_requirements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  requirementKey: text('requirement_key'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_requirements_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_requirements_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_requirements_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_requirements_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_requirements_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlRisks = pgTable('design_control_risks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  riskKey: text('risk_key'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_risks_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_risks_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_risks_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_risks_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_risks_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlReviews = pgTable('design_control_reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  reviewType: text('review_type'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_reviews_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_reviews_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_reviews_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_reviews_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_reviews_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlVerification = pgTable('design_control_verification', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  verificationKey: text('verification_key'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_verification_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_verification_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_verification_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_verification_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_verification_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlValidation = pgTable('design_control_validation', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  validationKey: text('validation_key'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  validatedAt: timestamp('validated_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_validation_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_validation_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_validation_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_validation_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_validation_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlChanges = pgTable('design_control_changes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  changeKey: text('change_key'),
  title: text('title'),
  status: text('status').notNull().default('draft'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordIdx: index('design_control_changes_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_changes_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_changes_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_changes_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_changes_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlReleaseGate = pgTable('design_control_release_gate', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  gateStatus: text('gate_status').notNull().default('not_ready'),
  ...designControlTraceabilityColumns(),
  ...designControlJsonColumns(),
  submittedAt: timestamp('submitted_at'),
  releasedAt: timestamp('released_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordUnique: uniqueIndex('design_control_release_gate_record_unique').on(table.recordId),
  recordIdx: index('design_control_release_gate_record_id_idx').on(table.recordId),
  gateStatusIdx: index('design_control_release_gate_status_idx').on(table.gateStatus),
  rdProjectIdx: index('design_control_release_gate_rd_project_id_idx').on(table.rdProjectId),
  projectIdx: index('design_control_release_gate_project_id_idx').on(table.projectId),
  productionWorkOrderIdx: index('design_control_release_gate_pwo_id_idx').on(table.productionWorkOrderId),
  p2PurchaseOrderIdx: index('design_control_release_gate_p2_po_id_idx').on(table.p2PurchaseOrderId),
}));

export const designControlRequirementApplicability = pgTable('design_control_requirement_applicability', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  recordId: uuid('record_id').notNull().references(() => designControlRecords.id, { onDelete: 'cascade' }),
  rdProjectId: text('rd_project_id').references(() => rdProjects.id, { onDelete: 'set null' }),
  requirementKey: text('requirement_key').notNull(),
  applicable: boolean('applicable').notNull().default(true),
  justification: text('justification'),
  approvedBy: text('approved_by'),
  approvedRole: text('approved_role'),
  approvedAt: timestamp('approved_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordRequirementUnique: uniqueIndex('design_control_requirement_applicability_record_requirement_unique').on(table.recordId, table.requirementKey),
  recordIdx: index('design_control_req_app_record_id_idx').on(table.recordId),
  rdProjectIdx: index('design_control_req_app_rd_project_id_idx').on(table.rdProjectId),
  requirementKeyIdx: index('design_control_req_app_requirement_key_idx').on(table.requirementKey),
  applicableIdx: index('design_control_req_app_applicable_idx').on(table.applicable),
}));

export const engineeringReleases = pgTable('engineering_releases', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  rdProjectId: text('rd_project_id').notNull().references(() => rdProjects.id, { onDelete: 'restrict' }),
  designControlRecordId: uuid('design_control_record_id').notNull().references(() => designControlRecords.id, { onDelete: 'restrict' }),
  releaseNumber: text('release_number').notNull(),
  releaseRevision: text('release_revision').notNull(),
  releaseStatus: text('release_status').notNull().default('RELEASED'),
  productName: text('product_name').notNull(),
  effectiveDate: date('effective_date'),
  releasedBy: text('released_by'),
  releasedAt: timestamp('released_at'),
  readinessSnapshot: jsonb('readiness_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  sourceEvidenceSnapshot: jsonb('source_evidence_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  approvalSnapshot: jsonb('approval_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  recordRevisionUnique: uniqueIndex('engineering_releases_record_revision_unique').on(table.rdProjectId, table.designControlRecordId, table.releaseRevision),
  rdProjectIdx: index('engineering_releases_rd_project_id_idx').on(table.rdProjectId),
  designControlRecordIdx: index('engineering_releases_design_control_record_id_idx').on(table.designControlRecordId),
  releaseStatusIdx: index('engineering_releases_release_status_idx').on(table.releaseStatus),
}));

export const engineeringReleaseBaselines = pgTable('engineering_release_baselines', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineeringReleaseId: uuid('engineering_release_id').notNull().references(() => engineeringReleases.id, { onDelete: 'cascade' }),
  rdProjectId: text('rd_project_id').notNull().references(() => rdProjects.id, { onDelete: 'restrict' }),
  designControlRecordId: uuid('design_control_record_id').notNull().references(() => designControlRecords.id, { onDelete: 'restrict' }),
  baselineStatus: text('baseline_status').notNull().default('LOCKED'),
  baselineRevision: text('baseline_revision').notNull(),
  lockedAt: timestamp('locked_at'),
  lockedBy: text('locked_by'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  releaseUnique: uniqueIndex('engineering_release_baselines_release_unique').on(table.engineeringReleaseId),
  rdProjectIdx: index('engineering_release_baselines_rd_project_id_idx').on(table.rdProjectId),
  designControlRecordIdx: index('engineering_release_baselines_design_control_record_id_idx').on(table.designControlRecordId),
}));

export const engineeringReleaseBaselineItems = pgTable('engineering_release_baseline_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineeringReleaseId: uuid('engineering_release_id').notNull().references(() => engineeringReleases.id, { onDelete: 'cascade' }),
  baselineId: uuid('baseline_id').notNull().references(() => engineeringReleaseBaselines.id, { onDelete: 'cascade' }),
  baselineCategory: text('baseline_category').notNull(),
  sourceTable: text('source_table'),
  sourceModule: text('source_module'),
  sourceRecordId: text('source_record_id'),
  sourceRevision: text('source_revision'),
  sourceStatus: text('source_status'),
  capturedAt: timestamp('captured_at').defaultNow(),
  immutableSnapshot: jsonb('immutable_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  sourceChecksum: text('source_checksum'),
  immutableSnapshotId: text('immutable_snapshot_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  releaseIdx: index('engineering_release_baseline_items_release_id_idx').on(table.engineeringReleaseId),
  baselineIdx: index('engineering_release_baseline_items_baseline_id_idx').on(table.baselineId),
  sourceIdx: index('engineering_release_baseline_items_source_idx').on(table.sourceTable, table.sourceRecordId),
}));

export const engineeringReleaseApprovals = pgTable('engineering_release_approvals', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineeringReleaseId: uuid('engineering_release_id').notNull().references(() => engineeringReleases.id, { onDelete: 'cascade' }),
  approvalRole: text('approval_role').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  approvalStatus: text('approval_status').notNull().default('APPROVED'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  releaseRoleUnique: uniqueIndex('engineering_release_approvals_release_role_unique').on(table.engineeringReleaseId, table.approvalRole),
  releaseIdx: index('engineering_release_approvals_release_id_idx').on(table.engineeringReleaseId),
}));

export const engineeringPackages = pgTable('engineering_packages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineeringReleaseId: uuid('engineering_release_id').notNull().references(() => engineeringReleases.id, { onDelete: 'restrict' }),
  engineeringBaselineId: uuid('engineering_baseline_id').notNull().references(() => engineeringReleaseBaselines.id, { onDelete: 'restrict' }),
  rdProjectId: text('rd_project_id').notNull().references(() => rdProjects.id, { onDelete: 'restrict' }),
  designControlRecordId: uuid('design_control_record_id').notNull().references(() => designControlRecords.id, { onDelete: 'restrict' }),
  packageNumber: text('package_number').notNull(),
  packageRevision: text('package_revision').notNull(),
  packageStatus: text('package_status').notNull().default('LOCKED'),
  productName: text('product_name').notNull(),
  lockedAt: timestamp('locked_at'),
  lockedBy: text('locked_by'),
  packageSnapshot: jsonb('package_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  completenessSnapshot: jsonb('completeness_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  contentsSummary: jsonb('contents_summary').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  releaseUnique: uniqueIndex('engineering_packages_release_unique').on(table.engineeringReleaseId),
  numberUnique: uniqueIndex('engineering_packages_number_unique').on(table.packageNumber),
  rdProjectIdx: index('engineering_packages_rd_project_id_idx').on(table.rdProjectId),
  designControlRecordIdx: index('engineering_packages_design_control_record_id_idx').on(table.designControlRecordId),
  baselineIdx: index('engineering_packages_baseline_id_idx').on(table.engineeringBaselineId),
  statusIdx: index('engineering_packages_status_idx').on(table.packageStatus),
}));

export const engineeringPackageItems = pgTable('engineering_package_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  engineeringPackageId: uuid('engineering_package_id').notNull().references(() => engineeringPackages.id, { onDelete: 'cascade' }),
  engineeringReleaseId: uuid('engineering_release_id').notNull().references(() => engineeringReleases.id, { onDelete: 'restrict' }),
  engineeringBaselineItemId: uuid('engineering_baseline_item_id').references(() => engineeringReleaseBaselineItems.id, { onDelete: 'set null' }),
  packageCategory: text('package_category').notNull(),
  sourceTable: text('source_table'),
  sourceModule: text('source_module'),
  sourceRecordId: text('source_record_id'),
  sourceRevision: text('source_revision'),
  sourceStatus: text('source_status'),
  referenceSnapshot: jsonb('reference_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  sourceChecksum: text('source_checksum'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  packageIdx: index('engineering_package_items_package_id_idx').on(table.engineeringPackageId),
  releaseIdx: index('engineering_package_items_release_id_idx').on(table.engineeringReleaseId),
  baselineItemIdx: index('engineering_package_items_baseline_item_id_idx').on(table.engineeringBaselineItemId),
  sourceIdx: index('engineering_package_items_source_idx').on(table.sourceTable, table.sourceRecordId),
}));

export const insertDesignControlRecordSchema = createInsertSchema(designControlRecords).omit({
  id: true,
  submittedAt: true,
  releasedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type DesignControlRecord = typeof designControlRecords.$inferSelect;
export type InsertDesignControlRecord = z.infer<typeof insertDesignControlRecordSchema>;
export type DesignControlStep = typeof designControlSteps.$inferSelect;

export const wadRevisions = pgTable('wad_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  wadId: uuid('wad_id').notNull().references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  revisionCode: text('revision_code').notNull(),
  status: text('status').notNull().default('draft'),
  revisionReason: text('revision_reason').notNull(),
  reasonNotes: text('reason_notes'),
  impactProduction: boolean('impact_production').notNull().default(false),
  impactReleasedTravelers: boolean('impact_released_travelers').notNull().default(false),
  impactCompletedWork: boolean('impact_completed_work').notNull().default(false),
  impactMaterialIssued: boolean('impact_material_issued').notNull().default(false),
  impactInspection: boolean('impact_inspection').notNull().default(false),
  impactLaborBudget: boolean('impact_labor_budget').notNull().default(false),
  impactDeliveryDate: boolean('impact_delivery_date').notNull().default(false),
  impactCustomerApproval: boolean('impact_customer_approval').notNull().default(false),
  requiresProductionHold: boolean('requires_production_hold').notNull().default(false),
  effectiveDate: date('effective_date'),
  wadSnapshot: jsonb('wad_snapshot').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdByDisplayName: text('created_by_display_name'),
  approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedByDisplayName: text('approved_by_display_name'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  wadIdIdx: index('wad_revisions_wad_id_idx').on(table.wadId),
  statusIdx: index('wad_revisions_status_idx').on(table.status),
  wadRevisionUnique: uniqueIndex('wad_revisions_wad_revision_unique').on(table.wadId, table.revisionCode),
}));

export const wadRevisionApprovalHistory = pgTable('wad_revision_approval_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  wadRevisionId: uuid('wad_revision_id').notNull().references(() => wadRevisions.id, { onDelete: 'cascade' }),
  approverRole: text('approver_role').notNull(),
  approverUserId: integer('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  comments: text('comments'),
  signedAt: timestamp('signed_at'),
}, (table) => ({
  revisionIdx: index('wad_revision_approval_history_revision_idx').on(table.wadRevisionId),
  approverIdx: index('wad_revision_approval_history_approver_idx').on(table.approverRole, table.approverUserId),
}));

export const insertWadRevisionSchema = createInsertSchema(wadRevisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
}).extend({
  revisionReason: z.string().min(1, 'revisionReason is required'),
  reasonNotes: z.string().optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
});

export type WadRevision = typeof wadRevisions.$inferSelect;
export type InsertWadRevision = z.infer<typeof insertWadRevisionSchema>;
export type WadRevisionApprovalHistory = typeof wadRevisionApprovalHistory.$inferSelect;

// Program Manufacturing Orchestration - additive layer above P2 queues/WADs.
export const programBuilds = pgTable('program_builds', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  p2PurchaseOrderId: integer('p2_purchase_order_id').references(() => p2PurchaseOrders.id, { onDelete: 'set null' }),
  programCode: text('program_code').notNull().unique(),
  programName: text('program_name').notNull(),
  buildName: text('build_name').notNull(),
  buildType: text('build_type').notNull().default('program'),
  status: text('status').notNull().default('PLANNED'),
  priority: integer('priority').notNull().default(50),
  targetShipDate: date('target_ship_date'),
  customerName: text('customer_name'),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  projectIdIdx: index('program_builds_project_id_idx').on(table.projectId),
  poIdIdx: index('program_builds_po_id_idx').on(table.p2PurchaseOrderId),
  statusIdx: index('program_builds_status_idx').on(table.status),
}));

export const programAssemblies = pgTable('program_assemblies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  programBuildId: uuid('program_build_id').notNull().references(() => programBuilds.id, { onDelete: 'cascade' }),
  parentAssemblyId: uuid('parent_assembly_id').references((): AnyPgColumn => programAssemblies.id, { onDelete: 'cascade' }),
  assemblyCode: text('assembly_code').notNull(),
  assemblyName: text('assembly_name').notNull(),
  level: integer('level').notNull().default(0),
  sequence: integer('sequence').notNull().default(0),
  assemblyType: text('assembly_type').notNull().default('assembly'),
  partNumber: text('part_number'),
  requiredQuantity: integer('required_quantity').notNull().default(1),
  status: text('status').notNull().default('PLANNED'),
  plannedStartDate: date('planned_start_date'),
  plannedFinishDate: date('planned_finish_date'),
  targetShipDate: date('target_ship_date'),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  buildIdx: index('program_assemblies_build_idx').on(table.programBuildId),
  parentIdx: index('program_assemblies_parent_idx').on(table.parentAssemblyId),
  codeUnique: uniqueIndex('program_assemblies_build_code_unique').on(table.programBuildId, table.assemblyCode),
}));

export const programAssemblyLinks = pgTable('program_assembly_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assemblyId: uuid('assembly_id').notNull().references(() => programAssemblies.id, { onDelete: 'cascade' }),
  manufacturingQueueId: integer('manufacturing_queue_id').references(() => manufacturingQueue.id, { onDelete: 'set null' }),
  productionWorkOrderId: uuid('production_work_order_id').references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  travelerId: varchar('traveler_id', { length: 255 }).references(() => travelers.id, { onDelete: 'set null' }),
  p2SerializedItemId: uuid('p2_serialized_item_id').references(() => p2SerializedItems.id, { onDelete: 'set null' }),
  linkType: text('link_type').notNull().default('queue_item'),
  requiredQuantity: integer('required_quantity').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  assemblyIdx: index('program_assembly_links_assembly_idx').on(table.assemblyId),
  queueIdx: index('program_assembly_links_queue_idx').on(table.manufacturingQueueId),
  travelerIdx: index('program_assembly_links_traveler_idx').on(table.travelerId),
}));

export const programAssemblyDependencies = pgTable('program_assembly_dependencies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assemblyId: uuid('assembly_id').notNull().references(() => programAssemblies.id, { onDelete: 'cascade' }),
  dependsOnAssemblyId: uuid('depends_on_assembly_id').notNull().references(() => programAssemblies.id, { onDelete: 'cascade' }),
  dependencyType: text('dependency_type').notNull().default('finish_to_start'),
  isBlocking: boolean('is_blocking').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  assemblyIdx: index('program_assembly_dependencies_assembly_idx').on(table.assemblyId),
  dependsOnIdx: index('program_assembly_dependencies_depends_on_idx').on(table.dependsOnAssemblyId),
  uniqueDependency: uniqueIndex('program_assembly_dependencies_unique').on(table.assemblyId, table.dependsOnAssemblyId),
}));

export const insertProgramBuildSchema = createInsertSchema(programBuilds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProgramAssemblySchema = createInsertSchema(programAssemblies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProgramAssemblyLinkSchema = createInsertSchema(programAssemblyLinks).omit({
  id: true,
  createdAt: true,
});
export const insertProgramAssemblyDependencySchema = createInsertSchema(programAssemblyDependencies).omit({
  id: true,
  createdAt: true,
});

export type ProgramBuild = typeof programBuilds.$inferSelect;
export type ProgramAssembly = typeof programAssemblies.$inferSelect;
export type ProgramAssemblyLink = typeof programAssemblyLinks.$inferSelect;
export type ProgramAssemblyDependency = typeof programAssemblyDependencies.$inferSelect;
export type InsertProgramBuild = z.infer<typeof insertProgramBuildSchema>;
export type InsertProgramAssembly = z.infer<typeof insertProgramAssemblySchema>;
export type InsertProgramAssemblyLink = z.infer<typeof insertProgramAssemblyLinkSchema>;
export type InsertProgramAssemblyDependency = z.infer<typeof insertProgramAssemblyDependencySchema>;

// ─── LABOR THRESHOLD SETTINGS (system-wide singleton) ─────────────────────────

export const laborThresholdSettings = pgTable('labor_threshold_settings', {
  id: integer('id').primaryKey().default(1),
  warningThreshold: numeric('warning_threshold').notNull().default('0.8'),
  blockedThreshold: numeric('blocked_threshold').notNull().default('1.0'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertLaborThresholdSettingsSchema = createInsertSchema(laborThresholdSettings)
  .omit({ id: true, updatedAt: true })
  .extend({
    warningThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal'),
    blockedThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal'),
  });

export type LaborThresholdSettings = typeof laborThresholdSettings.$inferSelect;
export type InsertLaborThresholdSettings = z.infer<typeof insertLaborThresholdSettingsSchema>;

// ─── ESTIMATING / RFQ BUILDER ─────────────────────────────────────────────────

export const estimatingRfqs = pgTable('estimating_rfqs', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqNumber: text('rfq_number').notNull(),
  customerId: integer('customer_id'),
  customerNameSnapshot: text('customer_name_snapshot'),
  quoteId: uuid('quote_id'),
  source: text('source').default('RFQ_BUILDER').notNull(),
  revision: text('revision'),
  requestedDueDate: timestamp('requested_due_date'),
  quoteDueDate: timestamp('quote_due_date'),
  notes: text('notes'),
  assumptions: text('assumptions'),
  status: text('status').default('DRAFT').notNull(),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertEstimatingRfqSchema = createInsertSchema(estimatingRfqs)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    requestedDueDate: z.coerce.date().nullable().optional(),
    quoteDueDate: z.coerce.date().nullable().optional(),
  });
export type EstimatingRfq = typeof estimatingRfqs.$inferSelect;
export type InsertEstimatingRfq = z.infer<typeof insertEstimatingRfqSchema>;

export const estimatingRfqParts = pgTable('estimating_rfq_parts', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  inventoryItemId: integer('inventory_item_id'),
  agPartNumber: text('ag_part_number'),
  partNumber: text('part_number').notNull(),
  partDescription: text('part_description'),
  revision: text('revision'),
  quantity: integer('quantity').notNull(),
  uom: text('uom').default('EA'),
  partType: text('part_type'),
  processFamily: text('process_family'),
  materialSpec: text('material_spec'),
  makeBuyType: text('make_buy_type'),
  isDraftInventoryItem: boolean('is_draft_inventory_item').default(false).notNull(),
  draftStatus: text('draft_status').default('ESTIMATING'),
  drawingAttached: boolean('drawing_attached').default(false).notNull(),
  complianceFlags: jsonb('compliance_flags').default([]).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertEstimatingRfqPartSchema = createInsertSchema(estimatingRfqParts).omit({ id: true, createdAt: true, updatedAt: true });
export type EstimatingRfqPart = typeof estimatingRfqParts.$inferSelect;
export type InsertEstimatingRfqPart = z.infer<typeof insertEstimatingRfqPartSchema>;

export const estimatingTooling = pgTable('estimating_tooling', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  description: text('description').notNull(),
  toolingType: text('tooling_type').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).default('0').notNull(),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).default('0').notNull(),
  appliesToScope: text('applies_to_scope').notNull(),
  rfqPartIds: jsonb('rfq_part_ids').default([]).notNull(),
  pricingTreatment: text('pricing_treatment').notNull(),
  amortizationQty: integer('amortization_qty'),
  chargeTiming: text('charge_timing').default('ONE_TIME').notNull(),
  customerOwnedTooling: boolean('customer_owned_tooling').default(false).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingToolingSchema = createInsertSchema(estimatingTooling).omit({ id: true, createdAt: true });
export type EstimatingTooling = typeof estimatingTooling.$inferSelect;
export type InsertEstimatingTooling = z.infer<typeof insertEstimatingToolingSchema>;

export const estimatingBomLines = pgTable('estimating_bom_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  rfqPartId: uuid('rfq_part_id').notNull(),
  inventoryItemId: integer('inventory_item_id'),
  childPartAgNumber: text('child_part_ag_number'),
  description: text('description').notNull(),
  category: text('category'),
  quantityPerPart: numeric('quantity_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  uom: text('uom').default('EA'),
  estimatedUnitCost: numeric('estimated_unit_cost', { precision: 12, scale: 4 }).default('0').notNull(),
  scrapPercent: numeric('scrap_percent', { precision: 8, scale: 2 }).default('0').notNull(),
  isEstimated: boolean('is_estimated').default(true).notNull(),
  isDraftInventoryItem: boolean('is_draft_inventory_item').default(false).notNull(),
  vendorNameSnapshot: text('vendor_name_snapshot'),
  materialSpec: text('material_spec'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingBomLineSchema = createInsertSchema(estimatingBomLines).omit({ id: true, createdAt: true });
export type EstimatingBomLine = typeof estimatingBomLines.$inferSelect;
export type InsertEstimatingBomLine = z.infer<typeof insertEstimatingBomLineSchema>;

export const estimatingProcessRows = pgTable('estimating_process_rows', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  rfqPartId: uuid('rfq_part_id').notNull(),
  departmentName: text('department_name').notNull(),
  sourceType: text('source_type').default('MANUAL').notNull(),
  setupHours: numeric('setup_hours', { precision: 10, scale: 2 }).default('0').notNull(),
  hoursPerPart: numeric('hours_per_part', { precision: 10, scale: 4 }).default('0').notNull(),
  hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 }).default('0').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingProcessRowSchema = createInsertSchema(estimatingProcessRows).omit({ id: true, createdAt: true });
export type EstimatingProcessRow = typeof estimatingProcessRows.$inferSelect;
export type InsertEstimatingProcessRow = z.infer<typeof insertEstimatingProcessRowSchema>;

export const estimatingAdjustments = pgTable('estimating_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  rfqPartId: uuid('rfq_part_id'),
  adjustmentType: text('adjustment_type').notNull(),
  description: text('description').notNull(),
  pricingMode: text('pricing_mode').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).default('0').notNull(),
  percentValue: numeric('percent_value', { precision: 8, scale: 4 }),
  appliesToScope: text('applies_to_scope').default('RFQ').notNull(),
  includeInCustomerPrice: boolean('include_in_customer_price').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingAdjustmentSchema = createInsertSchema(estimatingAdjustments).omit({ id: true, createdAt: true });
export type EstimatingAdjustment = typeof estimatingAdjustments.$inferSelect;
export type InsertEstimatingAdjustment = z.infer<typeof insertEstimatingAdjustmentSchema>;

export const estimatingShipping = pgTable('estimating_shipping', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  rfqPartId: uuid('rfq_part_id'),
  shippingMode: text('shipping_mode').notNull(),
  description: text('description'),
  method: text('method'),
  amount: numeric('amount', { precision: 12, scale: 2 }).default('0').notNull(),
  allocationMethod: text('allocation_method'),
  includeInCustomerPrice: boolean('include_in_customer_price').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingShippingSchema = createInsertSchema(estimatingShipping).omit({ id: true, createdAt: true });
export type EstimatingShipping = typeof estimatingShipping.$inferSelect;
export type InsertEstimatingShipping = z.infer<typeof insertEstimatingShippingSchema>;

export const estimatingQuantityBreaks = pgTable('estimating_quantity_breaks', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  label: text('label').notNull(),
  quantity: integer('quantity').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertEstimatingQuantityBreakSchema = createInsertSchema(estimatingQuantityBreaks).omit({ id: true, createdAt: true });
export type EstimatingQuantityBreak = typeof estimatingQuantityBreaks.$inferSelect;
export type InsertEstimatingQuantityBreak = z.infer<typeof insertEstimatingQuantityBreakSchema>;

export const estimatingPricingSnapshots = pgTable('estimating_pricing_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull(),
  rfqPartId: uuid('rfq_part_id').notNull(),
  quantityBreakId: uuid('quantity_break_id').notNull(),
  materialCostPerPart: numeric('material_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  laborCostPerPart: numeric('labor_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  overheadCostPerPart: numeric('overhead_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  shippingCostPerPart: numeric('shipping_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  toolingCostPerPart: numeric('tooling_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  totalCostPerPart: numeric('total_cost_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  marginPercent: numeric('margin_percent', { precision: 8, scale: 4 }).default('0').notNull(),
  sellPricePerPart: numeric('sell_price_per_part', { precision: 12, scale: 4 }).default('0').notNull(),
  extendedPrice: numeric('extended_price', { precision: 14, scale: 2 }).default('0').notNull(),
  leadTimeDays: integer('lead_time_days'),
  calculationVersion: text('calculation_version').default('v1').notNull(),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
});

export const insertEstimatingPricingSnapshotSchema = createInsertSchema(estimatingPricingSnapshots).omit({ id: true, calculatedAt: true });
export type EstimatingPricingSnapshot = typeof estimatingPricingSnapshots.$inferSelect;
export type InsertEstimatingPricingSnapshot = z.infer<typeof insertEstimatingPricingSnapshotSchema>;

export const estimateVersions = pgTable('estimate_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull().references(() => estimatingRfqs.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  supersededBy: uuid('superseded_by'),
  changeSummary: text('change_summary'),
  status: text('status').default('DRAFT').notNull(),
  marginSummary: jsonb('margin_summary').default({}).notNull(),
  pricingSnapshot: jsonb('pricing_snapshot').default({}).notNull(),
}, (table) => ({
  rfqVersionIdx: uniqueIndex('estimate_versions_rfq_version_idx').on(table.rfqId, table.versionNumber),
  rfqIdx: index('estimate_versions_rfq_id_idx').on(table.rfqId),
}));

export const insertEstimateVersionSchema = createInsertSchema(estimateVersions)
  .omit({ id: true, createdAt: true, supersededBy: true })
  .extend({
    versionNumber: z.number().int().positive().optional(),
  });
export type EstimateVersion = typeof estimateVersions.$inferSelect;
export type InsertEstimateVersion = z.infer<typeof insertEstimateVersionSchema>;

export const estimateLineVersions = pgTable('estimate_line_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  estimateVersionId: uuid('estimate_version_id').notNull().references(() => estimateVersions.id, { onDelete: 'cascade' }),
  rfqPartId: uuid('rfq_part_id').references(() => estimatingRfqParts.id, { onDelete: 'set null' }),
  sourceTable: text('source_table').notNull(),
  sourceId: uuid('source_id'),
  lineNumber: integer('line_number'),
  lineCategory: text('line_category').notNull(),
  lineSummary: text('line_summary'),
  quantity: numeric('quantity', { precision: 12, scale: 4 }),
  unitCost: numeric('unit_cost', { precision: 12, scale: 4 }),
  totalCost: numeric('total_cost', { precision: 14, scale: 4 }),
  marginPercent: numeric('margin_percent', { precision: 8, scale: 4 }),
  sellPrice: numeric('sell_price', { precision: 14, scale: 4 }),
  sourcePayload: jsonb('source_payload').default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  versionIdx: index('estimate_line_versions_version_id_idx').on(table.estimateVersionId),
  partIdx: index('estimate_line_versions_rfq_part_id_idx').on(table.rfqPartId),
}));

export const insertEstimateLineVersionSchema = createInsertSchema(estimateLineVersions).omit({ id: true, createdAt: true });
export type EstimateLineVersion = typeof estimateLineVersions.$inferSelect;
export type InsertEstimateLineVersion = z.infer<typeof insertEstimateLineVersionSchema>;

export const estimateAssumptions = pgTable('estimate_assumptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull().references(() => estimatingRfqs.id, { onDelete: 'cascade' }),
  rfqPartId: uuid('rfq_part_id').references(() => estimatingRfqParts.id, { onDelete: 'cascade' }),
  assumptionType: text('assumption_type').notNull(),
  assumptionText: text('assumption_text').notNull(),
  numericValue: numeric('numeric_value', { precision: 14, scale: 4 }),
  uom: text('uom'),
  confidenceLevel: text('confidence_level').default('MEDIUM').notNull(),
  sourceReference: text('source_reference'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  rfqIdx: index('estimate_assumptions_rfq_id_idx').on(table.rfqId),
  typeIdx: index('estimate_assumptions_type_idx').on(table.assumptionType),
}));

export const insertEstimateAssumptionSchema = createInsertSchema(estimateAssumptions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    assumptionType: z.enum(['LABOR', 'SCRAP', 'MATERIAL_YIELD', 'TOOLING_LIFE', 'SETUP_TIME']),
    confidenceLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  });
export type EstimateAssumption = typeof estimateAssumptions.$inferSelect;
export type InsertEstimateAssumption = z.infer<typeof insertEstimateAssumptionSchema>;

export const estimatingApprovals = pgTable('estimating_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull().references(() => estimatingRfqs.id, { onDelete: 'cascade' }),
  estimateVersionId: uuid('estimate_version_id').references(() => estimateVersions.id, { onDelete: 'set null' }),
  approvalRole: text('approval_role').notNull(),
  approvalStatus: text('approval_status').default('PENDING').notNull(),
  approvalThreshold: numeric('approval_threshold', { precision: 14, scale: 2 }),
  signerUserId: integer('signer_user_id'),
  signerDisplayName: text('signer_display_name'),
  digitalSignature: text('digital_signature'),
  approvalComments: text('approval_comments'),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  signedAt: timestamp('signed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  rfqRoleIdx: uniqueIndex('estimating_approvals_rfq_role_idx').on(table.rfqId, table.approvalRole),
  rfqIdx: index('estimating_approvals_rfq_id_idx').on(table.rfqId),
}));

export const insertEstimatingApprovalSchema = createInsertSchema(estimatingApprovals)
  .omit({ id: true, requestedAt: true, createdAt: true, updatedAt: true })
  .extend({
    approvalRole: z.enum(['ESTIMATOR', 'ENGINEERING', 'FINANCE', 'EXECUTIVE']),
    approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).optional(),
    signedAt: z.coerce.date().nullable().optional(),
  });
export type EstimatingApproval = typeof estimatingApprovals.$inferSelect;
export type InsertEstimatingApproval = z.infer<typeof insertEstimatingApprovalSchema>;

export const riskAssessments = pgTable('risk_assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  rfqId: uuid('rfq_id').notNull().references(() => estimatingRfqs.id, { onDelete: 'cascade' }),
  estimateVersionId: uuid('estimate_version_id').references(() => estimateVersions.id, { onDelete: 'set null' }),
  status: text('status').default('DRAFT').notNull(),
  overallScore: integer('overall_score').default(0).notNull(),
  overallLevel: text('overall_level').default('LOW').notNull(),
  approvalRouting: jsonb('approval_routing').default([]).notNull(),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  rfqIdx: index('risk_assessments_rfq_id_idx').on(table.rfqId),
}));

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;

export const riskItems = pgTable('risk_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  riskAssessmentId: uuid('risk_assessment_id').notNull().references(() => riskAssessments.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  severity: integer('severity').notNull(),
  probability: integer('probability').notNull(),
  score: integer('score').notNull(),
  ownerUserId: integer('owner_user_id'),
  ownerDisplayName: text('owner_display_name'),
  status: text('status').default('OPEN').notNull(),
  requiresApproval: boolean('requires_approval').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  assessmentIdx: index('risk_items_assessment_id_idx').on(table.riskAssessmentId),
  categoryIdx: index('risk_items_category_idx').on(table.category),
}));

export const insertRiskItemSchema = createInsertSchema(riskItems)
  .omit({ id: true, score: true, createdAt: true, updatedAt: true })
  .extend({
    category: z.enum(['TECHNICAL', 'SUPPLY_CHAIN', 'FINANCIAL', 'SCHEDULE', 'COMPLIANCE', 'QUALITY']),
    severity: z.number().int().min(1).max(5),
    probability: z.number().int().min(1).max(5),
  });
export type RiskItem = typeof riskItems.$inferSelect;
export type InsertRiskItem = z.infer<typeof insertRiskItemSchema>;

export const mitigationActions = pgTable('mitigation_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  riskItemId: uuid('risk_item_id').notNull().references(() => riskItems.id, { onDelete: 'cascade' }),
  actionDescription: text('action_description').notNull(),
  assignedToUserId: integer('assigned_to_user_id'),
  assignedToDisplayName: text('assigned_to_display_name'),
  dueDate: timestamp('due_date'),
  status: text('status').default('OPEN').notNull(),
  completedAt: timestamp('completed_at'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  riskItemIdx: index('mitigation_actions_risk_item_id_idx').on(table.riskItemId),
}));

export const insertMitigationActionSchema = createInsertSchema(mitigationActions)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    dueDate: z.coerce.date().nullable().optional(),
    completedAt: z.coerce.date().nullable().optional(),
  });
export type MitigationAction = typeof mitigationActions.$inferSelect;
export type InsertMitigationAction = z.infer<typeof insertMitigationActionSchema>;

export const estimatingDefaults = pgTable('estimating_defaults', {
  id: uuid('id').defaultRandom().primaryKey(),
  defaultLaborRate: numeric('default_labor_rate', { precision: 12, scale: 2 }).default('0').notNull(),
  defaultOverheadPercent: numeric('default_overhead_percent', { precision: 8, scale: 4 }).default('0').notNull(),
  defaultMarginPercent: numeric('default_margin_percent', { precision: 8, scale: 4 }).default('0').notNull(),
  defaultQuoteValidityDays: integer('default_quote_validity_days').default(30).notNull(),
  defaultShippingMethod: text('default_shipping_method'),
  defaultShippingCarrier: text('default_shipping_carrier'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertEstimatingDefaultsSchema = createInsertSchema(estimatingDefaults).omit({ id: true, createdAt: true, updatedAt: true });
export type EstimatingDefaults = typeof estimatingDefaults.$inferSelect;
export type InsertEstimatingDefaults = z.infer<typeof insertEstimatingDefaultsSchema>;

// ===========================
// LABOR → GL POSTING ENGINE
// ===========================

// labor_posting_runs — one row per (year, month) calculation or posting run
export const laborPostingRuns = pgTable('labor_posting_runs', {
  id: serial('id').primaryKey(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  status: text('status').notNull().default('CALCULATED'), // CALCULATED | POSTED
  postedBy: text('posted_by'),
  postedAt: timestamp('posted_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertLaborPostingRunSchema = createInsertSchema(laborPostingRuns).omit({ id: true, createdAt: true });
export type LaborPostingRun = typeof laborPostingRuns.$inferSelect;
export type InsertLaborPostingRun = z.infer<typeof insertLaborPostingRunSchema>;

// labor_cost_records — individual cost lines per employee per interval
export const laborCostRecords = pgTable('labor_cost_records', {
  id: serial('id').primaryKey(),
  postingRunId: integer('posting_run_id').references(() => laborPostingRuns.id),
  journalEntryId: integer('journal_entry_id').references(() => journalEntries.id),
  epochEmployeeId: integer('epoch_employee_id').references(() => employees.id),
  canonicalId: text('canonical_id'),
  jobCode: text('job_code'),
  departmentCode: text('department_code'),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  sourcePunchCanonicalId: text('source_punch_canonical_id'),
  clockIn: timestamp('clock_in').notNull(),
  clockOut: timestamp('clock_out').notNull(),
  hoursWorked: numeric('hours_worked', { precision: 10, scale: 4 }).notNull(),
  rateUsed: numeric('rate_used', { precision: 12, scale: 2 }).notNull(),
  dollarCost: numeric('dollar_cost', { precision: 12, scale: 2 }).notNull(),
  costType: text('cost_type').notNull(), // DIRECT | OVERHEAD | G_AND_A
  rateSource: text('rate_source').notNull(), // HOURLY_RATE | SALARY | DEFAULT_LABOR_RATE
  // WAD attribution — nullable; populated when punch session carries a work-order assignment
  productionWorkOrderId: uuid('production_work_order_id'),
  projectId: uuid('project_id'),
  clinId: integer('clin_id').references((): AnyPgColumn => projectClins.id, { onDelete: 'set null' }),
  travelerId: text('traveler_id'),
  chargeCodeId: integer('charge_code_id'),
  costObjectivePolicy: text('cost_objective_policy'),
  costObjectiveSnapshot: text('cost_objective_snapshot'),
  productionLine: text('production_line'),
  activityCategory: text('activity_category'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertLaborCostRecordSchema = createInsertSchema(laborCostRecords).omit({ id: true, createdAt: true });
export type LaborCostRecord = typeof laborCostRecords.$inferSelect;
export type InsertLaborCostRecord = z.infer<typeof insertLaborCostRecordSchema>;

// labor_account_config — singleton config mapping cost types to chart_of_accounts ids
export const laborAccountConfig = pgTable('labor_account_config', {
  id: serial('id').primaryKey(),
  directLaborAccountId: integer('direct_labor_account_id').references(() => chartOfAccounts.id).notNull(),
  overheadLaborAccountId: integer('overhead_labor_account_id').references(() => chartOfAccounts.id).notNull(),
  gaLaborAccountId: integer('ga_labor_account_id').references(() => chartOfAccounts.id).notNull(),
  accruedPayrollAccountId: integer('accrued_payroll_account_id').references(() => chartOfAccounts.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertLaborAccountConfigSchema = createInsertSchema(laborAccountConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type LaborAccountConfig = typeof laborAccountConfig.$inferSelect;
export type InsertLaborAccountConfig = z.infer<typeof insertLaborAccountConfigSchema>;

// ============================================================================
// LABOR BURDEN RATES — DCAA indirect cost rate configuration
// Required for FAR 42.703-2 adequate indirect cost rate structure.
// Each row is a named, dated burden rate applied by cost type.
// The rateType mirrors costType on labor_cost_records (OVERHEAD, G_AND_A, FRINGE, IR_AND_D, B_AND_P).
// rates are expressed as a multiplier (e.g., 0.35 = 35%).
// Effective date allows rate changes without losing historical accuracy.
// ============================================================================
export const laborBurdenRates = pgTable('labor_burden_rates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  rateType: text('rate_type').notNull(), // OVERHEAD | G_AND_A | FRINGE | IR_AND_D | B_AND_P
  rate: numeric('rate', { precision: 8, scale: 4 }).notNull(), // multiplier e.g. 0.3500
  effectiveDate: date('effective_date').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertLaborBurdenRateSchema = createInsertSchema(laborBurdenRates).omit({ id: true, createdAt: true, updatedAt: true });
export type LaborBurdenRate = typeof laborBurdenRates.$inferSelect;
export type InsertLaborBurdenRate = z.infer<typeof insertLaborBurdenRateSchema>;

// ============================================================================
// BURDEN RATES ENGINE — DCAA indirect cost pools, bases, rates, applications
// See migration 0100_burden_rates_engine.sql for the canonical DDL.
// ============================================================================

export const allocationBases = pgTable('allocation_bases', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  resolverKind: text('resolver_kind').notNull(), // DIRECT_LABOR_DOLLARS | DIRECT_LABOR_HOURS | TOTAL_COST_INPUT
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertAllocationBaseSchema = createInsertSchema(allocationBases).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type AllocationBase = typeof allocationBases.$inferSelect;
export type InsertAllocationBase = z.infer<typeof insertAllocationBaseSchema>;

export const indirectCostPools = pgTable('indirect_cost_pools', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  poolType: text('pool_type').notNull(), // FRINGE | OVERHEAD | G_AND_A | CUSTOM
  allocationBaseId: integer('allocation_base_id').notNull().references(() => allocationBases.id),
  description: text('description'),
  applyOrder: integer('apply_order').notNull().default(100),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertIndirectCostPoolSchema = createInsertSchema(indirectCostPools).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type IndirectCostPool = typeof indirectCostPools.$inferSelect;
export type InsertIndirectCostPool = z.infer<typeof insertIndirectCostPoolSchema>;

export const indirectRates = pgTable('indirect_rates', {
  id: serial('id').primaryKey(),
  poolId: integer('pool_id').notNull().references(() => indirectCostPools.id, { onDelete: 'cascade' }),
  rateType: text('rate_type').notNull(), // PROVISIONAL | BILLING | FINAL
  rate: numeric('rate', { precision: 10, scale: 6 }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertIndirectRateSchema = createInsertSchema(indirectRates).omit({
  id: true, createdAt: true,
});
export type IndirectRate = typeof indirectRates.$inferSelect;
export type InsertIndirectRate = z.infer<typeof insertIndirectRateSchema>;

export const burdenApplicationRuns = pgTable('burden_application_runs', {
  id: serial('id').primaryKey(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  runType: text('run_type').notNull().default('INITIAL'), // INITIAL | TRUE_UP
  rateType: text('rate_type').notNull(),                  // PROVISIONAL | BILLING | FINAL
  status: text('status').notNull().default('PENDING'),    // PENDING | COMPLETED | FAILED
  supersedesRunId: integer('supersedes_run_id'),
  appliedBy: text('applied_by').notNull(),
  recordCount: integer('record_count').notNull().default(0),
  totalBurden: numeric('total_burden', { precision: 14, scale: 2 }).notNull().default('0'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
export const insertBurdenApplicationRunSchema = createInsertSchema(burdenApplicationRuns).omit({
  id: true, startedAt: true, completedAt: true,
});
export type BurdenApplicationRun = typeof burdenApplicationRuns.$inferSelect;
export type InsertBurdenApplicationRun = z.infer<typeof insertBurdenApplicationRunSchema>;

export const appliedBurdenAmounts = pgTable('applied_burden_amounts', {
  id: serial('id').primaryKey(),
  applicationRunId: integer('application_run_id').notNull().references(() => burdenApplicationRuns.id, { onDelete: 'cascade' }),
  sourceTable: text('source_table').notNull(), // 'labor_cost_records'
  sourceRecordId: integer('source_record_id').notNull(),
  poolId: integer('pool_id').notNull().references(() => indirectCostPools.id),
  rateId: integer('rate_id').notNull().references(() => indirectRates.id),
  baseAmount: numeric('base_amount', { precision: 14, scale: 4 }).notNull(),
  rateUsed: numeric('rate_used', { precision: 10, scale: 6 }).notNull(),
  burdenAmount: numeric('burden_amount', { precision: 14, scale: 4 }).notNull(),
  isTrueUp: boolean('is_true_up').notNull().default(false),
  priorAmount: numeric('prior_amount', { precision: 14, scale: 4 }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertAppliedBurdenAmountSchema = createInsertSchema(appliedBurdenAmounts).omit({
  id: true, appliedAt: true,
});
export type AppliedBurdenAmount = typeof appliedBurdenAmounts.$inferSelect;
export type InsertAppliedBurdenAmount = z.infer<typeof insertAppliedBurdenAmountSchema>;

export const burdenRateAccumulations = pgTable('burden_rate_accumulations', {
  id: serial('id').primaryKey(),
  calculationYear: integer('calculation_year').notNull(),
  lookbackStart: date('lookback_start').notNull(),
  lookbackEnd: date('lookback_end').notNull(),
  rateType: text('rate_type').notNull().default('PROVISIONAL'), // PROVISIONAL | BILLING | FINAL
  effectiveFrom: date('effective_from').notNull(),
  status: text('status').notNull().default('DRAFT'), // DRAFT | POSTED
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
});
export const insertBurdenRateAccumulationSchema = createInsertSchema(burdenRateAccumulations).omit({
  id: true, createdAt: true, postedAt: true,
});
export type BurdenRateAccumulation = typeof burdenRateAccumulations.$inferSelect;
export type InsertBurdenRateAccumulation = z.infer<typeof insertBurdenRateAccumulationSchema>;

export const burdenRateAccumulationExpenseLines = pgTable('burden_rate_accumulation_expense_lines', {
  id: serial('id').primaryKey(),
  accumulationId: integer('accumulation_id').notNull().references(() => burdenRateAccumulations.id, { onDelete: 'cascade' }),
  poolId: integer('pool_id').notNull().references(() => indirectCostPools.id),
  lineItem: text('line_item').notNull(),
  monthlyAmounts: jsonb('monthly_amounts').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertBurdenRateAccumulationExpenseLineSchema = createInsertSchema(burdenRateAccumulationExpenseLines).omit({
  id: true, createdAt: true,
});
export type BurdenRateAccumulationExpenseLine = typeof burdenRateAccumulationExpenseLines.$inferSelect;
export type InsertBurdenRateAccumulationExpenseLine = z.infer<typeof insertBurdenRateAccumulationExpenseLineSchema>;

export const burdenRateAccumulationBases = pgTable('burden_rate_accumulation_bases', {
  id: serial('id').primaryKey(),
  accumulationId: integer('accumulation_id').notNull().references(() => burdenRateAccumulations.id, { onDelete: 'cascade' }),
  poolId: integer('pool_id').notNull().references(() => indirectCostPools.id),
  baseAmount: numeric('base_amount', { precision: 14, scale: 4 }).notNull().default('0'),
  baseSource: text('base_source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const insertBurdenRateAccumulationBaseSchema = createInsertSchema(burdenRateAccumulationBases).omit({
  id: true, createdAt: true,
});
export type BurdenRateAccumulationBase = typeof burdenRateAccumulationBases.$inferSelect;
export type InsertBurdenRateAccumulationBase = z.infer<typeof insertBurdenRateAccumulationBaseSchema>;

// ============================================================================
// CYCLE COUNT SESSIONS — AS9100 Physical Inventory Verification Workflow
// ============================================================================

// Variance tolerance policies — used by Task #142 cycle count subsystem to
// determine whether a line variance is auto-approved or requires reviewer sign-off.
export const cycleCountVariancePolicies = pgTable('cycle_count_variance_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  qtyTolerance: numeric('qty_tolerance', { precision: 14, scale: 4 }).default('0').notNull(),
  percentTolerance: numeric('percent_tolerance', { precision: 6, scale: 3 }).default('0').notNull(),
  autoApproveWithinTolerance: boolean('auto_approve_within_tolerance').default(true).notNull(),
  requiresDualApproval: boolean('requires_dual_approval').default(false).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCycleCountVariancePolicySchema = createInsertSchema(cycleCountVariancePolicies).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CycleCountVariancePolicy = typeof cycleCountVariancePolicies.$inferSelect;
export type InsertCycleCountVariancePolicy = z.infer<typeof insertCycleCountVariancePolicySchema>;

export const cycleCountSessions = pgTable('cycle_count_sessions', {
  id: serial('id').primaryKey(),
  // Status: SCHEDULED | IN_PROGRESS | PENDING_REVIEW | APPROVED | POSTED | CANCELLED
  // (Legacy COMPLETED rows are treated as PENDING_REVIEW.)
  status: text('status').default('SCHEDULED').notNull(),
  sessionNumber: text('session_number'),
  countType: text('count_type').default('CYCLE').notNull(), // CYCLE | FULL | SPOT | ABC
  location: text('location').notNull(),
  partFilter: text('part_filter'),
  scheduledFor: timestamp('scheduled_for'),
  blindCount: boolean('blind_count').default(true).notNull(),
  variancePolicyId: uuid('variance_policy_id').references(() => cycleCountVariancePolicies.id),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  performedByUserId: integer('performed_by_user_id').references(() => users.id),
  performedByDisplayName: text('performed_by_display_name'),
  performedAt: timestamp('performed_at'),
  approvedByUserId: integer('approved_by_user_id').references(() => users.id),
  approvedByDisplayName: text('approved_by_display_name'),
  approvedAt: timestamp('approved_at'),
  postedByUserId: integer('posted_by_user_id').references(() => users.id),
  postedByDisplayName: text('posted_by_display_name'),
  postedAt: timestamp('posted_at'),
});

export const insertCycleCountSessionSchema = createInsertSchema(cycleCountSessions).omit({ id: true, createdAt: true, postedAt: true });
export type CycleCountSession = typeof cycleCountSessions.$inferSelect;
export type InsertCycleCountSession = z.infer<typeof insertCycleCountSessionSchema>;

export const cycleCountLines = pgTable('cycle_count_lines', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => cycleCountSessions.id, { onDelete: 'cascade' }).notNull(),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id),
  lotId: uuid('lot_id'),
  agPartNumber: text('ag_part_number').notNull(),
  materialName: text('material_name'),
  expectedQty: numeric('expected_qty').notNull(),
  countedQty: numeric('counted_qty'),
  varianceQty: numeric('variance_qty'),
  varianceWithinTolerance: boolean('variance_within_tolerance'),
  recountRequired: boolean('recount_required').default(false).notNull(),
  approvalStatus: text('approval_status'), // AUTO_APPROVED | PENDING | APPROVED | REJECTED
  countedByUserId: integer('counted_by_user_id').references(() => users.id),
  countedByDisplayName: text('counted_by_display_name'),
  countedAt: timestamp('counted_at'),
  ledgerEntryId: uuid('ledger_entry_id'),
  notes: text('notes'),
});

export const insertCycleCountLineSchema = createInsertSchema(cycleCountLines).omit({ id: true });
export type CycleCountLine = typeof cycleCountLines.$inferSelect;
export type InsertCycleCountLine = z.infer<typeof insertCycleCountLineSchema>;

// ============================================================================
// QUOTE EXECUTION FEEDBACK — Quote vs Actual Feedback Loop
// Stores a computed snapshot comparing quoted estimates to actual execution
// outcomes for a completed project. Used to close the feedback loop between
// estimating and production, enabling better future quoting decisions.
// ============================================================================

export const quoteExecutionFeedback = pgTable('quote_execution_feedback', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // Nullable: not all projects originate from a quote
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  // Not null: every feedback record belongs to exactly one project
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  // Nullable: may not have a formal closing at generation time
  projectClosingId: integer('project_closing_id').references(() => projectClosings.id, { onDelete: 'set null' }),
  // When the feedback snapshot was last computed
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  // Labor hours comparison
  quotedLaborHours: real('quoted_labor_hours'),
  actualLaborHours: real('actual_labor_hours'),
  laborHoursVariance: real('labor_hours_variance'),
  laborHoursVariancePct: real('labor_hours_variance_pct'),
  // Departments (JSONB arrays of department name strings)
  quotedDepartments: jsonb('quoted_departments').$type<string[]>(),
  actualDepartments: jsonb('actual_departments').$type<string[]>(),
  // Lead time comparison in calendar days
  quotedLeadTimeDays: integer('quoted_lead_time_days'),
  actualLeadTimeDays: integer('actual_lead_time_days'),
  scheduleVarianceDays: integer('schedule_variance_days'),
  // True when actual hours OR actual lead time exceeds quoted values
  isOverrun: boolean('is_overrun'),
  // Human-readable summary generated at compute time
  summary: text('summary'),
  // Lessons from project closing (JSONB array of risk description strings)
  keyRisks: jsonb('key_risks').$type<string[]>(),
  keyStrengths: text('key_strengths'),
  keyOpportunities: text('key_opportunities'),
  // Forward-looking quoting guidance derived from this project
  recommendedQuotingNotes: text('recommended_quoting_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  // Enforce one feedback record per project (upsert target)
  projectIdUnique: unique('quote_execution_feedback_project_id_unique').on(table.projectId),
  projectIdIdx: index('quote_execution_feedback_project_id_idx').on(table.projectId),
  quoteIdIdx: index('quote_execution_feedback_quote_id_idx').on(table.quoteId),
}));

export const insertQuoteExecutionFeedbackSchema = createInsertSchema(quoteExecutionFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type QuoteExecutionFeedback = typeof quoteExecutionFeedback.$inferSelect;
export type InsertQuoteExecutionFeedback = z.infer<typeof insertQuoteExecutionFeedbackSchema>;

// ============================================================================
// EDRI — EPOCH DCAA Readiness Index
// ============================================================================

export const edriScoreSnapshots = pgTable('edri_score_snapshots', {
  id: serial('id').primaryKey(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
  computedByUserId: integer('computed_by_user_id'),
  computedByDisplayName: text('computed_by_display_name'),
  subcontractorScore: numeric('subcontractor_score'),
  primeScore: numeric('prime_score'),
  compositeScore: numeric('composite_score'),
  scoringBand: text('scoring_band'), // AUDIT_DEFENSIBLE | CONDITIONALLY_PASSABLE | HIGH_RISK | MATERIAL_DEFICIENCY | AUDIT_FAILURE
  failureProbability: numeric('failure_probability'),
  futureStateScore: numeric('future_state_score'),
  domainScores: jsonb('domain_scores'),
  domainWeights: jsonb('domain_weights'),
  notes: text('notes'),
  isOverride: boolean('is_override').default(false),
});

export const insertEdriScoreSnapshotSchema = createInsertSchema(edriScoreSnapshots).omit({ id: true, computedAt: true });
export type EdriScoreSnapshot = typeof edriScoreSnapshots.$inferSelect;
export type InsertEdriScoreSnapshot = z.infer<typeof insertEdriScoreSnapshotSchema>;

export const edriDomainScores = pgTable('edri_domain_scores', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'cascade' }).notNull(),
  domainKey: text('domain_key').notNull(), // TIMEKEEPING | CHARGE_CODE | ACCOUNTING | PROCUREMENT | INVENTORY | POLICY | GOVT_PROPERTY
  rawScore: numeric('raw_score'),
  weight: numeric('weight'),
  weightedContribution: numeric('weighted_contribution'),
  evidenceCount: integer('evidence_count').default(0),
  gapCount: integer('gap_count').default(0),
  redFlagCount: integer('red_flag_count').default(0),
  subScores: jsonb('sub_scores'), // map of check key -> 0 | 0.5 | 1
  evidenceItems: jsonb('evidence_items').default([]), // array of {label, value} evidence items per domain
});

export const insertEdriDomainScoreSchema = createInsertSchema(edriDomainScores).omit({ id: true });
export type EdriDomainScore = typeof edriDomainScores.$inferSelect;
export type InsertEdriDomainScore = z.infer<typeof insertEdriDomainScoreSchema>;

export const edriRedFlags = pgTable('edri_red_flags', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'cascade' }),
  domainKey: text('domain_key').notNull(),
  flagKey: text('flag_key').notNull(),
  severity: text('severity').notNull(), // CRITICAL | HIGH | MEDIUM | LOW
  title: text('title').notNull(),
  description: text('description').notNull(),
  farCitation: text('far_citation'),
  potentialScoreRecovery: numeric('potential_score_recovery').default('0'),
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
  resolvedByUserId: integer('resolved_by_user_id'),
  resolvedByDisplayName: text('resolved_by_display_name'),
  resolutionNote: text('resolution_note'),
  isActive: boolean('is_active').default(true),
});

export const insertEdriRedFlagSchema = createInsertSchema(edriRedFlags).omit({ id: true, detectedAt: true });
export type EdriRedFlag = typeof edriRedFlags.$inferSelect;
export type InsertEdriRedFlag = z.infer<typeof insertEdriRedFlagSchema>;

export const edriRemediationItems = pgTable('edri_remediation_items', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'cascade' }),
  redFlagId: integer('red_flag_id').references(() => edriRedFlags.id, { onDelete: 'set null' }),
  domainKey: text('domain_key').notNull(),
  flagKey: text('flag_key'), // stable condition identity for carry-over across recomputes
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull(), // P1_CRITICAL | P2_HIGH | P3_MEDIUM | P4_LOW
  potentialScoreRecovery: numeric('potential_score_recovery').default('0'),
  assignedToUserId: integer('assigned_to_user_id'),
  assignedToDisplayName: text('assigned_to_display_name'),
  dueDate: date('due_date'),
  status: text('status').default('OPEN').notNull(), // OPEN | IN_PROGRESS | RESOLVED | WAIVED
  statusChangedAt: timestamp('status_changed_at').defaultNow(),
  statusChangedByUserId: integer('status_changed_by_user_id'),
  statusChangedByDisplayName: text('status_changed_by_display_name'),
  waiverJustification: text('waiver_justification'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertEdriRemediationItemSchema = createInsertSchema(edriRemediationItems).omit({ id: true, createdAt: true, updatedAt: true, statusChangedAt: true });
export type EdriRemediationItem = typeof edriRemediationItems.$inferSelect;
export type InsertEdriRemediationItem = z.infer<typeof insertEdriRemediationItemSchema>;

export const edriEvidencePackets = pgTable('edri_evidence_packets', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'cascade' }),
  domainKey: text('domain_key'), // null = all domains
  requestedByUserId: integer('requested_by_user_id'),
  requestedByDisplayName: text('requested_by_display_name'),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  storagePath: text('storage_path'),
  status: text('status').default('PENDING').notNull(), // PENDING | GENERATING | READY | FAILED
  errorMessage: text('error_message'),
});

export const insertEdriEvidencePacketSchema = createInsertSchema(edriEvidencePackets).omit({ id: true, requestedAt: true });
export type EdriEvidencePacket = typeof edriEvidencePackets.$inferSelect;
export type InsertEdriEvidencePacket = z.infer<typeof insertEdriEvidencePacketSchema>;

export const edriAdminOverrides = pgTable('edri_admin_overrides', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'cascade' }),
  overridingUserId: integer('overriding_user_id'),
  overridingDisplayName: text('overriding_display_name'),
  domainKey: text('domain_key'), // null = composite override
  originalScore: numeric('original_score').notNull(),
  overrideScore: numeric('override_score').notNull(),
  justification: text('justification').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertEdriAdminOverrideSchema = createInsertSchema(edriAdminOverrides).omit({ id: true, createdAt: true });
export type EdriAdminOverride = typeof edriAdminOverrides.$inferSelect;
export type InsertEdriAdminOverride = z.infer<typeof insertEdriAdminOverrideSchema>;

export const edriNotifications = pgTable('edri_notifications', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id').references(() => edriScoreSnapshots.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(), // SCORE_DROPPED | NEW_CRITICAL_FLAG | REMEDIATION_OVERDUE | BAND_CHANGE
  recipientUserId: integer('recipient_user_id'),
  channel: text('channel').notNull(), // EMAIL | IN_APP
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  payload: jsonb('payload'),
});

export const insertEdriNotificationSchema = createInsertSchema(edriNotifications).omit({ id: true, sentAt: true });
export type EdriNotification = typeof edriNotifications.$inferSelect;
export type InsertEdriNotification = z.infer<typeof insertEdriNotificationSchema>;

// ============================================================================
// DCAA FORENSIC AUDIT FINDINGS
// Evidence-driven violation detection for DCAA compliance.
// Each record represents a confirmed rule violation against live data.
// Status check constraint: open | acknowledged | resolved
// ============================================================================

export const dcaaAuditFindings = pgTable('dcaa_audit_findings', {
  id: serial('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  domain: text('domain').notNull(),
  severity: text('severity').notNull(), // critical | high | medium | low
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  description: text('description').notNull(),
  evidence: jsonb('evidence').notNull().default({}), // structured evidence payload
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  status: text('status').notNull().default('open'), // open | acknowledged | resolved
  resolutionNotes: text('resolution_notes'),
}, (table) => ({
  ruleEntityIdx: index('dcaa_findings_rule_entity_idx').on(table.ruleId, table.entityId),
  statusIdx: index('dcaa_findings_status_idx').on(table.status),
  domainIdx: index('dcaa_findings_domain_idx').on(table.domain),
  severityIdx: index('dcaa_findings_severity_idx').on(table.severity),
}));

export const insertDcaaAuditFindingSchema = createInsertSchema(dcaaAuditFindings).omit({
  id: true,
  detectedAt: true,
});
export type DcaaAuditFinding = typeof dcaaAuditFindings.$inferSelect;
export type InsertDcaaAuditFinding = z.infer<typeof insertDcaaAuditFindingSchema>;

export const dcaaSchedulerState = pgTable('dcaa_scheduler_state', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  ranAt: text('ran_at').notNull(),
  triggeredBy: text('triggered_by').notNull().default('scheduled'),
  summary: jsonb('summary').notNull().default({}),
});
export type DcaaSchedulerState = typeof dcaaSchedulerState.$inferSelect;

// ============================================================================
// DCAA SCAN HISTORY
// Append-only log of every completed nightly (or manually triggered) scan.
// The dcaa_scheduler_state upsert is kept for fast "last run" access; this
// table provides the full rolling history for trend analysis.
// ============================================================================

export const dcaaScanHistory = pgTable('dcaa_scan_history', {
  id: serial('id').primaryKey(),
  ranAt: text('ran_at').notNull(),
  triggeredBy: text('triggered_by').notNull().default('scheduled'),
  newFindings: integer('new_findings').notNull().default(0),
  violationsClosed: integer('violations_closed').notNull().default(0),
  rulesRun: integer('rules_run').notNull().default(0),
  rulesFailed: integer('rules_failed').notNull().default(0),
  summary: jsonb('summary').notNull().default({}),
}, (table) => ({
  ranAtIdx: index('dcaa_scan_history_ran_at_idx').on(table.ranAt),
}));

export const insertDcaaScanHistorySchema = createInsertSchema(dcaaScanHistory).omit({ id: true });
export type DcaaScanHistory = typeof dcaaScanHistory.$inferSelect;
export type InsertDcaaScanHistory = z.infer<typeof insertDcaaScanHistorySchema>;

// ============================================================================
// DOCUMENT VAULT — CUI Classification
// Secure document storage with classification labels and access control.
// ============================================================================

export const vaultDocuments = pgTable('vault_documents', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  objectPath: text('object_path').notNull(),
  classification: text('classification').notNull().default('internal'), // public | internal | cui | itar
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  documentCategory: text('document_category').notNull().default('controlled_document'), // cad | drawing | spec | customer_file | controlled_document | policy
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  contractArtifactType: text('contract_artifact_type'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: text('source_entity_id'),
  scopeType: text('scope_type').notNull().default('global'), // global | project | department
  scopeValue: text('scope_value'), // projectId or department name when scoped
  contentType: text('content_type').notNull().default('application/octet-stream'),
  fileSizeBytes: integer('file_size_bytes'),
  checksumSha256: text('checksum_sha256'),
  encryptionAtRestPolicy: text('encryption_at_rest_policy').notNull().default('object_storage_managed'),
  accessRule: text('access_rule').notNull().default('authenticated'), // authenticated | explicit_grant | admin_only
  mfaRequired: boolean('mfa_required').notNull().default(false),
  deviceTrackingRequired: boolean('device_tracking_required').notNull().default(true),
  downloadTrackingRequired: boolean('download_tracking_required').notNull().default(true),
  expiringLinksRequired: boolean('expiring_links_required').notNull().default(true),
  linkExpiresInSeconds: integer('link_expires_in_seconds').notNull().default(900),
  sessionTimeoutMinutes: integer('session_timeout_minutes').notNull().default(30),
  uploaderUserId: integer('uploader_user_id').notNull(),
  uploaderDisplayName: text('uploader_display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  classificationIdx: index('vault_documents_classification_idx').on(table.classification),
  documentCategoryIdx: index('vault_documents_document_category_idx').on(table.documentCategory),
  customerIdIdx: index('vault_documents_customer_id_idx').on(table.customerId),
  sourceEntityIdx: index('vault_documents_source_entity_idx').on(table.sourceEntityType, table.sourceEntityId),
  scopeTypeIdx: index('vault_documents_scope_type_idx').on(table.scopeType),
  uploaderIdx: index('vault_documents_uploader_idx').on(table.uploaderUserId),
}));

export const insertVaultDocumentSchema = createInsertSchema(vaultDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type VaultDocument = typeof vaultDocuments.$inferSelect;
export type InsertVaultDocument = z.infer<typeof insertVaultDocumentSchema>;

export const vaultDocumentGrants = pgTable('vault_access_grants', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').notNull().references(() => vaultDocuments.id, { onDelete: 'cascade' }),
  grantedToUserId: integer('granted_to_user_id').notNull(),
  grantedToDisplayName: text('granted_to_display_name').notNull(),
  grantedByUserId: integer('granted_by_user_id').notNull(),
  grantedByDisplayName: text('granted_by_display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  documentIdx: index('vault_grants_document_idx').on(table.documentId),
  grantedToIdx: index('vault_grants_granted_to_idx').on(table.grantedToUserId),
  uniqueGrant: unique('vault_grants_unique').on(table.documentId, table.grantedToUserId),
}));

export const insertVaultDocumentGrantSchema = createInsertSchema(vaultDocumentGrants).omit({
  id: true,
  createdAt: true,
});
export type VaultDocumentGrant = typeof vaultDocumentGrants.$inferSelect;
export type InsertVaultDocumentGrant = z.infer<typeof insertVaultDocumentGrantSchema>;

// ============================================================================
// EMPLOYEE MACHINE / PROCESS / DEPARTMENT QUALIFICATIONS
// Links an employee to a machine class, operation type, or department that
// they are trained and authorized to work on.  Used by the traveler start
// gate to block unqualified operators from starting restricted steps.
// ============================================================================

export const employeeMachineQualifications = pgTable('employee_machine_qualifications', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  // Exactly one of the three dimension columns must be set per record.
  machineClass: text('machine_class'),     // e.g. '3-Axis Mill', 'Lathe'
  operationType: text('operation_type'),   // e.g. 'SETUP', 'RUN', 'INSPECT'
  department: text('department'),          // e.g. 'CNC', 'Finish'
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at'),      // null = never expires
  grantedBy: text('granted_by').notNull(), // display name of the admin who granted
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  employeeIdIdx: index('emq_employee_id_idx').on(table.employeeId),
}));

export const insertEmployeeMachineQualificationSchema = createInsertSchema(employeeMachineQualifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployeeMachineQualification = z.infer<typeof insertEmployeeMachineQualificationSchema>;
export type EmployeeMachineQualification = typeof employeeMachineQualifications.$inferSelect;

// ============================================================================
// CMMC 2.0 LEVEL 2 — CONTROL STATUS
// Per-practice status tracking for NIST SP 800-171 Rev 2 (110 practices).
// Seeded automatically from the evidence mapping; admins can update status,
// notes, and attach a vault policy document for procedural controls.
// ============================================================================

export const cmmcControlStatus = pgTable('cmmc_control_status', {
  id: serial('id').primaryKey(),
  practiceId: text('practice_id').notNull().unique(),   // e.g. "3.1.1"
  family: text('family').notNull(),                     // e.g. "AC"
  /** implemented | partial | planned | not_applicable */
  status: text('status').notNull().default('planned'),
  notes: text('notes'),
  /** Vault document ID referencing an attached policy/procedure document (FK to vault_documents) */
  policyDocumentId: integer('policy_document_id').references(() => vaultDocuments.id, { onDelete: 'set null' }),
  /** Display name of the vault document (snapshot) */
  policyDocumentName: text('policy_document_name'),
  attestedAt: timestamp('attested_at'),
  attestedByUserId: integer('attested_by_user_id'),
  attestedByDisplayName: text('attested_by_display_name'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  practiceIdIdx: uniqueIndex('cmmc_control_status_practice_id_idx').on(table.practiceId),
  familyIdx: index('cmmc_control_status_family_idx').on(table.family),
}));

export const insertCmmcControlStatusSchema = createInsertSchema(cmmcControlStatus).omit({
  id: true,
  updatedAt: true,
});
export type CmmcControlStatus = typeof cmmcControlStatus.$inferSelect;
export type InsertCmmcControlStatus = z.infer<typeof insertCmmcControlStatusSchema>;

// ============================================================================
// PDF FORM TEMPLATES - General-purpose fillable PDF forms module
// ============================================================================

export const pdfFormTemplates = pgTable('pdf_form_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  storagePath: text('storage_path').notNull(),
  pageCount: integer('page_count').default(1),
  pageDimensions: jsonb('page_dimensions').$type<Array<{ width: number; height: number }>>().default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const pdfFormFields = pgTable('pdf_form_fields', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => pdfFormTemplates.id, { onDelete: 'cascade' }).notNull(),
  pageIndex: integer('page_index').notNull().default(0),
  xPercent: real('x_percent').notNull(),
  yPercent: real('y_percent').notNull(),
  widthPercent: real('width_percent').notNull(),
  heightPercent: real('height_percent').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertPdfFormTemplateSchema = createInsertSchema(pdfFormTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPdfFormFieldSchema = createInsertSchema(pdfFormFields).omit({
  id: true,
  createdAt: true,
});

export type PdfFormTemplate = typeof pdfFormTemplates.$inferSelect;
export type InsertPdfFormTemplate = z.infer<typeof insertPdfFormTemplateSchema>;
export type PdfFormField = typeof pdfFormFields.$inferSelect;
export type InsertPdfFormField = z.infer<typeof insertPdfFormFieldSchema>;

// ── Personal & Shared Calendars ──────────────────────────────────────────────

export const userCalendars = pgTable('user_calendars', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3174ad'),
  ownerUserId: integer('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  isPrivate: boolean('is_private').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const calendarShares = pgTable('calendar_shares', {
  id: serial('id').primaryKey(),
  calendarId: integer('calendar_id').notNull().references(() => userCalendars.id, { onDelete: 'cascade' }),
  sharedWithUserId: integer('shared_with_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const localCalendarEvents = pgTable('local_calendar_events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  location: text('location'),
  allDay: boolean('all_day').notNull().default(false),
  isPublic: boolean('is_public').notNull().default(true),
  eventType: text('event_type').notNull().default('meeting'),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id),
  calendarId: integer('calendar_id').references(() => userCalendars.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertUserCalendarSchema = createInsertSchema(userCalendars).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCalendarShareSchema = createInsertSchema(calendarShares).omit({
  id: true,
  createdAt: true,
});

export const insertLocalCalendarEventSchema = createInsertSchema(localCalendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserCalendar = typeof userCalendars.$inferSelect;
export type InsertUserCalendar = z.infer<typeof insertUserCalendarSchema>;
export type CalendarShare = typeof calendarShares.$inferSelect;
export type InsertCalendarShare = z.infer<typeof insertCalendarShareSchema>;
export type LocalCalendarEvent = typeof localCalendarEvents.$inferSelect;
export type InsertLocalCalendarEvent = z.infer<typeof insertLocalCalendarEventSchema>;

// ============================================================
// BUSINESS CONTINUITY DASHBOARD
// ============================================================

// Editable content for each dashboard section
export const continuitySections = pgTable('continuity_sections', {
  id: serial('id').primaryKey(),
  sectionKey: text('section_key').notNull().unique(),
  title: text('title').notNull(),
  content: jsonb('content').notNull().default('{}'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByUserId: integer('updated_by_user_id'),
  updatedByDisplayName: text('updated_by_display_name'),
});

// Documentation roadmap items (Section 10)
export const continuityDocItems = pgTable('continuity_doc_items', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('not_started'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedByUserId: integer('updated_by_user_id'),
  updatedByDisplayName: text('updated_by_display_name'),
});

// Support roles matrix (Section 8)
export const continuityRoles = pgTable('continuity_roles', {
  id: serial('id').primaryKey(),
  roleName: text('role_name').notNull(),
  responsibility: text('responsibility').notNull(),
  whenNeeded: text('when_needed').notNull(),
  skillsRequired: text('skills_required').notNull(),
  costRange: text('cost_range').notNull(),
  emergencyPriority: text('emergency_priority').notNull().default('medium'),
  engagementType: text('engagement_type').notNull().default('fractional'),
  sortOrder: integer('sort_order').notNull().default(0),
});

// System/vendor dependencies (Sections 2, 4, 5, 6, 7)
export const continuityDependencies = pgTable('continuity_dependencies', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  currentState: text('current_state'),
  continuityOption: text('continuity_option'),
  owner: text('owner'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
});

// AI-assisted update audit trail (Section 11)
export const continuityAiUpdates = pgTable('continuity_ai_updates', {
  id: serial('id').primaryKey(),
  sectionKey: text('section_key').notNull(),
  prompt: text('prompt').notNull(),
  priorVersion: jsonb('prior_version'),
  newVersion: jsonb('new_version'),
  status: text('status').notNull().default('draft_generated'),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow(),
  reviewedByUserId: integer('reviewed_by_user_id'),
  reviewedByDisplayName: text('reviewed_by_display_name'),
  reviewedAt: timestamp('reviewed_at'),
});

export const insertContinuityDocItemSchema = createInsertSchema(continuityDocItems).omit({ id: true, updatedAt: true });
export const insertContinuityRoleSchema = createInsertSchema(continuityRoles).omit({ id: true });
export const insertContinuityDependencySchema = createInsertSchema(continuityDependencies).omit({ id: true });
export const insertContinuityAiUpdateSchema = createInsertSchema(continuityAiUpdates).omit({ id: true, createdAt: true });
export const insertContinuitySectionSchema = createInsertSchema(continuitySections).omit({ id: true, updatedAt: true });

export type ContinuitySection = typeof continuitySections.$inferSelect;
export type InsertContinuitySection = z.infer<typeof insertContinuitySectionSchema>;
export type ContinuityDocItem = typeof continuityDocItems.$inferSelect;
export type InsertContinuityDocItem = z.infer<typeof insertContinuityDocItemSchema>;
export type ContinuityRole = typeof continuityRoles.$inferSelect;
export type InsertContinuityRole = z.infer<typeof insertContinuityRoleSchema>;
export type ContinuityDependency = typeof continuityDependencies.$inferSelect;
export type InsertContinuityDependency = z.infer<typeof insertContinuityDependencySchema>;
export type ContinuityAiUpdate = typeof continuityAiUpdates.$inferSelect;
export type InsertContinuityAiUpdate = z.infer<typeof insertContinuityAiUpdateSchema>;

// ─── Proteus Labs — Prompt Library ────────────────────────────────────────────

export const proteusPromptCategoryEnum = pgEnum('proteus_prompt_category', [
  'small',
  'feature',
  'large_architecture',
  'audit',
  'emergency',
  'deployment',
  'skill_builder',
]);

export const proteusExecutionStatusEnum = pgEnum('proteus_execution_status', [
  'pending',
  'success',
  'failure',
  'noted',
]);

export const proteusPrompts = pgTable('proteus_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  category: proteusPromptCategoryEnum('category').notNull(),
  body: text('body').notNull(),
  description: text('description'),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: timestamp('last_used_at'),
  createdByUserId: integer('created_by_user_id').notNull(),
  createdByDisplayName: text('created_by_display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const proteusPromptVariables = pgTable('proteus_prompt_variables', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => proteusPrompts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  label: text('label').notNull(),
  defaultValue: text('default_value'),
  required: boolean('required').default(true),
  sortOrder: integer('sort_order').default(0),
});

export const proteusPromptExecutions = pgTable('proteus_prompt_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => proteusPrompts.id, { onDelete: 'cascade' }),
  promptTitle: text('prompt_title').notNull(),
  resolvedBody: text('resolved_body').notNull(),
  variableValues: jsonb('variable_values'),
  executedByUserId: integer('executed_by_user_id').notNull(),
  executedByDisplayName: text('executed_by_display_name').notNull(),
  executedAt: timestamp('executed_at').defaultNow(),
  status: proteusExecutionStatusEnum('status').default('pending'),
  notes: text('notes'),
});

export const proteusPromptResults = pgTable('proteus_prompt_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').notNull().unique().references(() => proteusPromptExecutions.id, { onDelete: 'cascade' }),
  output: text('output').notNull(),
  implementationNotes: text('implementation_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const proteusPromptTags = pgTable('proteus_prompt_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id').notNull().references(() => proteusPrompts.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
});

// ---------------------------------------------------------------------------
// Kiosk PIN rate-limit state — persisted so lockouts survive server restarts.
// ---------------------------------------------------------------------------
export const kioskPinRateLimits = pgTable('kiosk_pin_rate_limits', {
  ip: text('ip').primaryKey(),
  failures: integer('failures').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

export const insertProteusPromptSchema = createInsertSchema(proteusPrompts).omit({
  id: true,
  usageCount: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProteusPromptVariableSchema = createInsertSchema(proteusPromptVariables).omit({
  id: true,
});

export const insertProteusPromptExecutionSchema = createInsertSchema(proteusPromptExecutions).omit({
  id: true,
  executedAt: true,
});

export const insertProteusPromptResultSchema = createInsertSchema(proteusPromptResults).omit({
  id: true,
  createdAt: true,
});

export const insertProteusPromptTagSchema = createInsertSchema(proteusPromptTags).omit({
  id: true,
});

export type ProteusPrompt = typeof proteusPrompts.$inferSelect;
export type InsertProteusPrompt = z.infer<typeof insertProteusPromptSchema>;
export type ProteusPromptVariable = typeof proteusPromptVariables.$inferSelect;
export type InsertProteusPromptVariable = z.infer<typeof insertProteusPromptVariableSchema>;
export type ProteusPromptExecution = typeof proteusPromptExecutions.$inferSelect;
export type InsertProteusPromptExecution = z.infer<typeof insertProteusPromptExecutionSchema>;
export type ProteusPromptResult = typeof proteusPromptResults.$inferSelect;
export type InsertProteusPromptResult = z.infer<typeof insertProteusPromptResultSchema>;
export type ProteusPromptTag = typeof proteusPromptTags.$inferSelect;
export type InsertProteusPromptTag = z.infer<typeof insertProteusPromptTagSchema>;

// ---------------------------------------------------------------------------
// Inventory Audit — Cutting Table packet cycle-count scheduling & records
// ---------------------------------------------------------------------------

export const auditFrequencyEnum = pgEnum('audit_frequency', ['daily', 'weekly', 'bi_weekly', 'monthly']);

export const inventoryAuditSettings = pgTable('inventory_audit_settings', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  frequency: auditFrequencyEnum('frequency').notNull().default('weekly'),
  nextAuditDate: timestamp('next_audit_date'),
  lastAuditDate: timestamp('last_audit_date'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventoryAuditRecords = pgTable('inventory_audit_records', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  packetId: integer('packet_id').notNull().references(() => inventoryItems.id),
  auditDate: timestamp('audit_date').defaultNow().notNull(),
  systemQty: integer('system_qty').notNull(),
  actualQty: integer('actual_qty').notNull(),
  variance: integer('variance').notNull(),
  auditedBy: text('audited_by'),
  notes: text('notes'),
});

export const insertInventoryAuditSettingsSchema = createInsertSchema(inventoryAuditSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertInventoryAuditRecordSchema = createInsertSchema(inventoryAuditRecords).omit({
  id: true,
  auditDate: true,
});

export type InventoryAuditSettings = typeof inventoryAuditSettings.$inferSelect;
export type InsertInventoryAuditSettings = z.infer<typeof insertInventoryAuditSettingsSchema>;
export type InventoryAuditRecord = typeof inventoryAuditRecords.$inferSelect;
export type InsertInventoryAuditRecord = z.infer<typeof insertInventoryAuditRecordSchema>;

// ---------------------------------------------------------------------------
// Production Control Templates — WAD Step 6
// ---------------------------------------------------------------------------

export const productionControlTemplateTypeEnum = pgEnum('production_control_template_type', [
  'ROUTING', 'TRAVELER', 'QC', 'WORK_INSTRUCTION', 'SPEC_SHEET',
]);

export const productionControlApprovalStatusEnum = pgEnum('production_control_approval_status', [
  'DRAFT', 'APPROVED', 'OBSOLETE',
]);

export const wadRiskLevelEnum = pgEnum('wad_risk_level', ['LOW', 'MEDIUM', 'HIGH']);

export const productionControlTemplates = pgTable('production_control_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  templateType: productionControlTemplateTypeEnum('template_type').notNull(),
  routingType: text('routing_type'),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  approvalStatus: productionControlApprovalStatusEnum('approval_status').notNull().default('DRAFT'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedByUserId: integer('approved_by_user_id'),
  data: jsonb('data'),
  fileUrl: text('file_url'),
  createdBy: text('created_by').notNull(),
  createdByUserId: integer('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  typeStatusIdx: index('pct_type_status_idx').on(table.templateType, table.approvalStatus),
  approvalStatusIdx: index('pct_approval_status_idx').on(table.approvalStatus),
}));

export const insertProductionControlTemplateSchema = createInsertSchema(productionControlTemplates).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
}).extend({
  name: z.string().min(1, 'Name is required'),
  templateType: z.enum(['ROUTING', 'TRAVELER', 'QC', 'WORK_INSTRUCTION', 'SPEC_SHEET']),
  routingType: z.string().optional().nullable(),
  version: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  approvalStatus: z.enum(['DRAFT', 'APPROVED', 'OBSOLETE']).default('DRAFT'),
  approvedBy: z.string().optional().nullable(),
  approvedByUserId: z.number().int().optional().nullable(),
  data: z.any().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  createdBy: z.string().min(1),
  createdByUserId: z.number().int().optional().nullable(),
});

export type ProductionControlTemplate = typeof productionControlTemplates.$inferSelect;
export type InsertProductionControlTemplate = z.infer<typeof insertProductionControlTemplateSchema>;

// ---------------------------------------------------------------------------
// Engineering Control - reusable revision, effectivity, and ECO framework
// ---------------------------------------------------------------------------

export const engineeringControlledArtifactTypeEnum = pgEnum('engineering_controlled_artifact_type', [
  'BOM',
  'ROUTING',
  'TRAVELER_TEMPLATE',
  'WORK_INSTRUCTION',
  'SPEC',
  'QC_FORM',
]);

export const engineeringReleaseStateEnum = pgEnum('engineering_release_state', [
  'draft',
  'review',
  'approved',
  'released',
  'obsolete',
]);

export const engineeringEcoStatusEnum = pgEnum('engineering_eco_status', [
  'draft',
  'impact_review',
  'approval',
  'approved',
  'rejected',
  'implemented',
  'released',
  'closed',
]);

export const engineeringControlledRevisions = pgTable('engineering_controlled_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  artifactType: engineeringControlledArtifactTypeEnum('artifact_type').notNull(),
  artifactId: text('artifact_id').notNull(),
  artifactNumber: text('artifact_number'),
  title: text('title').notNull(),
  revision: text('revision').notNull(),
  releaseState: engineeringReleaseStateEnum('release_state').notNull().default('draft'),
  description: text('description'),
  sourceModule: text('source_module'),
  sourceVersionId: text('source_version_id'),
  changeSummary: text('change_summary'),
  effectivitySerialStart: text('effectivity_serial_start'),
  effectivitySerialEnd: text('effectivity_serial_end'),
  effectivityStartDate: date('effectivity_start_date'),
  effectivityEndDate: date('effectivity_end_date'),
  effectivityCustomerId: text('effectivity_customer_id'),
  effectivityCustomerName: text('effectivity_customer_name'),
  effectivityProjectId: uuid('effectivity_project_id'),
  effectivityProjectNumber: text('effectivity_project_number'),
  createdBy: text('created_by').notNull().default('system'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  releasedBy: text('released_by'),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  obsoleteBy: text('obsolete_by'),
  obsoleteAt: timestamp('obsolete_at', { withTimezone: true }),
  releaseNotes: text('release_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  artifactIdx: index('ecr_artifact_idx').on(table.artifactType, table.artifactId),
  releaseStateIdx: index('ecr_release_state_idx').on(table.releaseState),
  effectivityDateIdx: index('ecr_effectivity_date_idx').on(table.effectivityStartDate, table.effectivityEndDate),
  effectivityCustomerIdx: index('ecr_effectivity_customer_idx').on(table.effectivityCustomerId),
  effectivityProjectIdx: index('ecr_effectivity_project_idx').on(table.effectivityProjectId),
  revisionUniqueIdx: uniqueIndex('ecr_artifact_revision_unique').on(table.artifactType, table.artifactId, table.revision),
}));

export const engineeringChangeOrders = pgTable('engineering_change_orders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ecoNumber: text('eco_number').notNull().unique(),
  title: text('title').notNull(),
  reason: text('reason').notNull(),
  changeDescription: text('change_description').notNull(),
  status: engineeringEcoStatusEnum('status').notNull().default('draft'),
  requestedBy: text('requested_by').notNull().default('system'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).default(sql`now()`),
  impactReview: jsonb('impact_review').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  impactReviewedBy: text('impact_reviewed_by'),
  impactReviewedAt: timestamp('impact_reviewed_at', { withTimezone: true }),
  approvalPlan: jsonb('approval_plan').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: text('rejected_by'),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  implementationDate: date('implementation_date'),
  implementedBy: text('implemented_by'),
  implementedAt: timestamp('implemented_at', { withTimezone: true }),
  releaseLinkage: jsonb('release_linkage').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  releasedBy: text('released_by'),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  closedBy: text('closed_by'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  statusIdx: index('eco_status_idx').on(table.status),
  implementationDateIdx: index('eco_implementation_date_idx').on(table.implementationDate),
}));

export const engineeringEcoRevisionLinks = pgTable('engineering_eco_revision_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ecoId: uuid('eco_id').notNull().references(() => engineeringChangeOrders.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull().references(() => engineeringControlledRevisions.id, { onDelete: 'cascade' }),
  linkType: text('link_type').notNull().default('release'),
  notes: text('notes'),
  createdBy: text('created_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  ecoIdx: index('eco_revision_links_eco_idx').on(table.ecoId),
  revisionIdx: index('eco_revision_links_revision_idx').on(table.revisionId),
  ecoRevisionUniqueIdx: uniqueIndex('eco_revision_links_unique').on(table.ecoId, table.revisionId, table.linkType),
}));

export const insertEngineeringControlledRevisionSchema = createInsertSchema(engineeringControlledRevisions).omit({
  id: true,
  reviewedAt: true,
  approvedAt: true,
  releasedAt: true,
  obsoleteAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  artifactType: z.enum(['BOM', 'ROUTING', 'TRAVELER_TEMPLATE', 'WORK_INSTRUCTION', 'SPEC', 'QC_FORM']),
  artifactId: z.string().min(1),
  title: z.string().min(1),
  revision: z.string().min(1),
  releaseState: z.enum(['draft', 'review', 'approved', 'released', 'obsolete']).default('draft'),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const insertEngineeringChangeOrderSchema = createInsertSchema(engineeringChangeOrders).omit({
  id: true,
  requestedAt: true,
  impactReviewedAt: true,
  approvedAt: true,
  rejectedAt: true,
  implementedAt: true,
  releasedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  ecoNumber: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  changeDescription: z.string().min(1),
  status: z.enum(['draft', 'impact_review', 'approval', 'approved', 'rejected', 'implemented', 'released', 'closed']).default('draft'),
  impactReview: z.record(z.unknown()).optional().nullable(),
  approvalPlan: z.record(z.unknown()).optional().nullable(),
  releaseLinkage: z.record(z.unknown()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const insertEngineeringEcoRevisionLinkSchema = createInsertSchema(engineeringEcoRevisionLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  ecoId: z.string().uuid(),
  revisionId: z.string().uuid(),
  linkType: z.string().min(1).default('release'),
});

export type EngineeringControlledRevision = typeof engineeringControlledRevisions.$inferSelect;
export type InsertEngineeringControlledRevision = z.infer<typeof insertEngineeringControlledRevisionSchema>;
export type EngineeringChangeOrder = typeof engineeringChangeOrders.$inferSelect;
export type InsertEngineeringChangeOrder = z.infer<typeof insertEngineeringChangeOrderSchema>;
export type EngineeringEcoRevisionLink = typeof engineeringEcoRevisionLinks.$inferSelect;
export type InsertEngineeringEcoRevisionLink = z.infer<typeof insertEngineeringEcoRevisionLinkSchema>;

// ---------------------------------------------------------------------------
// WAD Production Controls — persisted controls + provision record per WAD
// ---------------------------------------------------------------------------

export const wadProductionControls = pgTable('wad_production_controls', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: uuid('work_order_id').notNull().references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  partType: text('part_type').notNull(),
  productionType: text('production_type').notNull(),
  routingRequired: boolean('routing_required').notNull().default(false),
  travelerRequired: boolean('traveler_required').notNull().default(false),
  workInstructionRequired: boolean('work_instruction_required').notNull().default(false),
  specSheetRequired: boolean('spec_sheet_required').notNull().default(false),
  finalQcOnly: boolean('final_qc_only').notNull().default(false),
  inProcessInspectionRequired: boolean('in_process_inspection_required').notNull().default(false),
  spotCheckPlanRequired: boolean('spot_check_plan_required').notNull().default(false),
  certRequired: boolean('cert_required').notNull().default(false),
  aiReason: text('ai_reason'),
  aiConfidenceScore: numeric('ai_confidence_score', { precision: 3, scale: 2 }),
  aiRiskLevel: wadRiskLevelEnum('ai_risk_level'),
  selectedTemplateIds: jsonb('selected_template_ids'),
  provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
  provisionSummary: jsonb('provision_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  workOrderUniqueIdx: uniqueIndex('wad_production_controls_work_order_unique').on(table.workOrderId),
}));

export const insertWadProductionControlsSchema = createInsertSchema(wadProductionControls).omit({
  id: true,
  createdAt: true,
  provisionedAt: true,
}).extend({
  workOrderId: z.string().uuid(),
  partType: z.string().min(1),
  productionType: z.string().min(1),
  routingRequired: z.boolean().default(false),
  travelerRequired: z.boolean().default(false),
  workInstructionRequired: z.boolean().default(false),
  specSheetRequired: z.boolean().default(false),
  finalQcOnly: z.boolean().default(false),
  inProcessInspectionRequired: z.boolean().default(false),
  spotCheckPlanRequired: z.boolean().default(false),
  certRequired: z.boolean().default(false),
  aiReason: z.string().optional().nullable(),
  aiConfidenceScore: z.string().optional().nullable(),
  aiRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().nullable(),
  selectedTemplateIds: z.any().optional().nullable(),
});

export type WadProductionControls = typeof wadProductionControls.$inferSelect;
export type InsertWadProductionControls = z.infer<typeof insertWadProductionControlsSchema>;

// ---------------------------------------------------------------------------
// WAD Document Links — per-artifact traceability for WI, spec sheets, QC, etc.
// ---------------------------------------------------------------------------

export const wadDocumentLinks = pgTable('wad_document_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: uuid('work_order_id').notNull().references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull(),
  templateVersion: integer('template_version').notNull().default(1),
  templateType: text('template_type').notNull(),
  templateName: text('template_name').notNull(),
  fileUrl: text('file_url'),
  linkedAt: timestamp('linked_at', { withTimezone: true }).default(sql`now()`),
});

export type WadDocumentLink = typeof wadDocumentLinks.$inferSelect;

// ---------------------------------------------------------------------------
// Written Policies Library — DCAA-aligned policy versioning + acknowledgments
// ---------------------------------------------------------------------------

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  source: text('source').notNull().default('in-repo'), // 'in-repo' | 'external-upload'
  owner: text('owner'),
  effectiveDate: date('effective_date'),
  requiresAcknowledgment: boolean('requires_acknowledgment').notNull().default(true),
  acknowledgmentRoles: text('acknowledgment_roles').array().notNull().default(sql`ARRAY[]::text[]`),
  currentVersionId: uuid('current_version_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  body: text('body'),
  sourcePath: text('source_path'),
  uploadedFileUrl: text('uploaded_file_url'),
  uploadedFileName: text('uploaded_file_name'),
  uploadedFileMime: text('uploaded_file_mime'),
  contentHash: text('content_hash').notNull(),
  changeSummary: text('change_summary'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(sql`now()`),
  publishedByUserId: integer('published_by_user_id').references(() => users.id),
  publishedByDisplayName: text('published_by_display_name'),
}, (table) => ({
  policyVersionUnique: unique('policy_versions_policy_version_unique').on(table.policyId, table.versionNumber),
}));

export const policyAcknowledgments = pgTable('policy_acknowledgments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersions.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  userDisplayName: text('user_display_name').notNull(),
  userRole: text('user_role'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  ackVersionUserUnique: unique('policy_acks_version_user_unique').on(table.policyVersionId, table.userId),
}));

export type Policy = typeof policies.$inferSelect;
export type PolicyVersion = typeof policyVersions.$inferSelect;
export type PolicyAcknowledgment = typeof policyAcknowledgments.$inferSelect;

// ─── Purchasing Controls: Requisitions, FAR Flowdowns, Debarment Checks ─────
// Task #83 — auditable purchasing chain for government-contracting compliance.
// Pipeline: purchase_requisitions → approvals → vendor_pos (link via requisitionId)
//   + FAR flowdown evidence per PO
//   + Vendor debarment-check events at requisition approval and PO issuance.

export const purchaseRequisitions = pgTable('purchase_requisitions', {
  id: serial('id').primaryKey(),
  reqNumber: text('req_number').notNull().unique(),
  status: text('status').notNull().default('DRAFT'),
  projectId: text('project_id'),
  chargeCodeId: integer('charge_code_id'),
  category: text('category').notNull().default('default'),
  vendorId: integer('vendor_id').references(() => vendors.id),
  estimatedTotal: numeric('estimated_total').notNull().default('0'),
  needByDate: date('need_by_date'),
  justification: text('justification').notNull(),
  competitionMethod: text('competition_method').notNull().default('competed'),
  soleSourceJustification: text('sole_source_justification'),
  requestedByUserId: integer('requested_by_user_id'),
  requestedByDisplayName: text('requested_by_display_name'),
  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  rejectionReason: text('rejection_reason'),
  convertedToPoId: integer('converted_to_po_id'),
  convertedAt: timestamp('converted_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchaseRequisitionLines = pgTable('purchase_requisition_lines', {
  id: serial('id').primaryKey(),
  requisitionId: integer('requisition_id').notNull().references(() => purchaseRequisitions.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  description: text('description').notNull(),
  partNumber: text('part_number'),
  quantity: real('quantity').notNull(),
  unit: text('unit'),
  unitPrice: real('unit_price').notNull().default(0),
  lineTotal: real('line_total').notNull().default(0),
  notes: text('notes'),
});

export const purchaseRequisitionApprovals = pgTable('purchase_requisition_approvals', {
  id: serial('id').primaryKey(),
  requisitionId: integer('requisition_id').notNull().references(() => purchaseRequisitions.id, { onDelete: 'cascade' }),
  stage: integer('stage').notNull(),
  capability: text('capability').notNull(),
  decision: text('decision'),
  decidedByUserId: integer('decided_by_user_id'),
  decidedByDisplayName: text('decided_by_display_name'),
  decidedAt: timestamp('decided_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseRequisitionApprovalChain = pgTable('purchase_requisition_approval_chain', {
  id: serial('id').primaryKey(),
  category: text('category').notNull().default('default'),
  minAmount: numeric('min_amount').notNull().default('0'),
  maxAmount: numeric('max_amount'),
  stage: integer('stage').notNull(),
  capability: text('capability').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
});

export const farFlowdownClauses = pgTable('far_flowdown_clauses', {
  id: serial('id').primaryKey(),
  clauseNumber: text('clause_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  applicabilityRule: jsonb('applicability_rule'),
  defaultApplicable: boolean('default_applicable').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vendorPoFarFlowdowns = pgTable('vendor_po_far_flowdowns', {
  id: serial('id').primaryKey(),
  vendorPoId: integer('vendor_po_id').notNull().references(() => vendorPOs.id, { onDelete: 'cascade' }),
  clauseId: integer('clause_id').notNull().references(() => farFlowdownClauses.id),
  applicable: boolean('applicable').notNull(),
  reasoning: text('reasoning').notNull(),
  recordedByUserId: integer('recorded_by_user_id'),
  recordedByDisplayName: text('recorded_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.vendorPoId, t.clauseId) }));

export const projectFarFlowdowns = pgTable('project_far_flowdowns', {
  id: serial('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  purchaseReviewChecklistId: integer('purchase_review_checklist_id').references(() => purchaseReviewChecklists.id, { onDelete: 'set null' }),
  clauseId: integer('clause_id').notNull().references(() => farFlowdownClauses.id),
  applicable: boolean('applicable').notNull().default(true),
  reasoning: text('reasoning').notNull(),
  source: text('source').notNull().default('purchase_review_checklist'),
  status: text('status').notNull().default('open'),
  recordedByUserId: integer('recorded_by_user_id'),
  recordedByDisplayName: text('recorded_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.projectId, t.clauseId),
  projectIdx: index('idx_project_far_flowdowns_project_id').on(t.projectId),
  checklistIdx: index('idx_project_far_flowdowns_checklist_id').on(t.purchaseReviewChecklistId),
}));

export const contractReviewChecklistTemplates = pgTable('contract_review_checklist_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  reviewAreas: text('review_areas').array().notNull().default(sql`ARRAY['engineering','quality','procurement','scheduling','finance']::text[]`),
  checklistItems: jsonb('checklist_items').$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
  applicabilityRule: jsonb('applicability_rule').$type<Record<string, unknown> | null>(),
  status: text('status').notNull().default('draft'),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  activeIdx: index('idx_contract_review_templates_active').on(t.isActive),
  nameVersionUnique: unique().on(t.name, t.version),
}));

export const contractClauses = pgTable('contract_clauses', {
  id: serial('id').primaryKey(),
  clauseNumber: text('clause_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  clauseType: text('clause_type').notNull().default('CUSTOMER'), // FAR | DFARS | CUSTOMER | QUALITY | INTERNAL
  source: text('source').notNull().default('contract_review'),
  defaultFlowTargets: text('default_flow_targets').array().notNull().default(sql`ARRAY['po','traveler','qc','supplier_po','cert_package']::text[]`),
  isActive: boolean('is_active').notNull().default(true),
  effectiveDate: timestamp('effective_date'),
  retiredAt: timestamp('retired_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  activeIdx: index('idx_contract_clauses_active').on(t.isActive),
  typeIdx: index('idx_contract_clauses_type').on(t.clauseType),
}));

export const clauseTemplates = pgTable('clause_templates', {
  id: serial('id').primaryKey(),
  checklistTemplateId: integer('checklist_template_id').notNull().references(() => contractReviewChecklistTemplates.id, { onDelete: 'cascade' }),
  contractClauseId: integer('contract_clause_id').notNull().references(() => contractClauses.id, { onDelete: 'cascade' }),
  reviewArea: text('review_area').notNull(),
  requirementText: text('requirement_text').notNull(),
  requiredArtifacts: text('required_artifacts').array().notNull().default(sql`ARRAY[]::text[]`),
  flowTargets: text('flow_targets').array().notNull().default(sql`ARRAY['po','traveler','qc','supplier_po','cert_package']::text[]`),
  applicabilityRule: jsonb('applicability_rule').$type<Record<string, unknown> | null>(),
  required: boolean('required').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  templateClauseUnique: unique().on(t.checklistTemplateId, t.contractClauseId, t.reviewArea),
  templateIdx: index('idx_clause_templates_template_id').on(t.checklistTemplateId),
  clauseIdx: index('idx_clause_templates_clause_id').on(t.contractClauseId),
}));

export const contractReviewChecklistInstances = pgTable('contract_review_checklist_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  checklistTemplateId: integer('checklist_template_id').notNull().references(() => contractReviewChecklistTemplates.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  purchaseReviewChecklistId: integer('purchase_review_checklist_id').references(() => purchaseReviewChecklists.id, { onDelete: 'set null' }),
  p2PurchaseOrderId: integer('p2_purchase_order_id').references(() => p2PurchaseOrders.id, { onDelete: 'set null' }),
  vendorPoId: integer('vendor_po_id').references(() => vendorPOs.id, { onDelete: 'set null' }),
  travelerId: varchar('traveler_id', { length: 255 }).references(() => travelers.id, { onDelete: 'set null' }),
  securityClassification: text('security_classification').notNull().default('internal'), // public | internal | cui | itar
  cuiCategory: text('cui_category'),
  itarCategory: text('itar_category'),
  exportControlJurisdiction: text('export_control_jurisdiction'),
  status: text('status').notNull().default('draft'),
  reviewAreaStatus: jsonb('review_area_status').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  responses: jsonb('responses').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  missingReviewAreas: text('missing_review_areas').array().notNull().default(sql`ARRAY[]::text[]`),
  createdByUserId: integer('created_by_user_id'),
  createdByDisplayName: text('created_by_display_name'),
  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  projectIdx: index('idx_contract_review_instances_project_id').on(t.projectId),
  templateIdx: index('idx_contract_review_instances_template_id').on(t.checklistTemplateId),
  vendorPoIdx: index('idx_contract_review_instances_vendor_po_id').on(t.vendorPoId),
}));

export const flowedRequirements = pgTable('flowed_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractReviewInstanceId: uuid('contract_review_instance_id').references(() => contractReviewChecklistInstances.id, { onDelete: 'cascade' }),
  contractClauseId: integer('contract_clause_id').notNull().references(() => contractClauses.id, { onDelete: 'restrict' }),
  clauseTemplateId: integer('clause_template_id').references(() => clauseTemplates.id, { onDelete: 'set null' }),
  targetType: text('target_type').notNull(), // po | traveler | qc | supplier_po | cert_package
  targetId: text('target_id').notNull(),
  requirementText: text('requirement_text').notNull(),
  requiredArtifacts: text('required_artifacts').array().notNull().default(sql`ARRAY[]::text[]`),
  status: text('status').notNull().default('open'),
  source: text('source').notNull().default('contract_review'),
  flowedAt: timestamp('flowed_at').defaultNow().notNull(),
  satisfiedAt: timestamp('satisfied_at'),
  satisfiedByUserId: integer('satisfied_by_user_id'),
  satisfiedByDisplayName: text('satisfied_by_display_name'),
  evidence: jsonb('evidence').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  targetIdx: index('idx_flowed_requirements_target').on(t.targetType, t.targetId),
  instanceIdx: index('idx_flowed_requirements_instance_id').on(t.contractReviewInstanceId),
  clauseIdx: index('idx_flowed_requirements_clause_id').on(t.contractClauseId),
  targetClauseUnique: unique().on(t.contractReviewInstanceId, t.contractClauseId, t.targetType, t.targetId),
}));

export const vendorDebarmentChecks = pgTable('vendor_debarment_checks', {
  id: serial('id').primaryKey(),
  vendorId: integer('vendor_id').notNull().references(() => vendors.id),
  context: text('context').notNull(),
  contextRefId: integer('context_ref_id'),
  source: text('source').notNull(),
  result: text('result').notNull(),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
  checkedByUserId: integer('checked_by_user_id'),
  checkedByDisplayName: text('checked_by_display_name'),
  evidenceUrl: text('evidence_url'),
  attestationText: text('attestation_text'),
  notes: text('notes'),
});

export const procurementSettings = pgTable('procurement_settings', {
  id: serial('id').primaryKey(),
  debarmentCheckFreshnessDays: integer('debarment_check_freshness_days').notNull().default(30),
  allowDirectPo: boolean('allow_direct_po').notNull().default(false),
  directPoExceptionCapability: text('direct_po_exception_capability').notNull().default('purchasing.direct_po_exception'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertPurchaseRequisitionSchema = createInsertSchema(purchaseRequisitions).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true, approvedAt: true,
  rejectedAt: true, rejectionReason: true, convertedToPoId: true, convertedAt: true,
  cancelledAt: true, cancellationReason: true, reqNumber: true, status: true,
}).extend({
  justification: z.string().min(10, 'Justification must be at least 10 characters'),
  competitionMethod: z.enum(['competed', 'sole-source', 'small-purchase', 'exception']).default('competed'),
  estimatedTotal: z.union([z.number(), z.string()]).transform(v => String(v)),
  needByDate: z.string().optional().nullable(),
  vendorId: z.number().int().positive().optional().nullable(),
  category: z.string().default('default'),
});

export const insertPurchaseRequisitionLineSchema = createInsertSchema(purchaseRequisitionLines).omit({
  id: true,
}).extend({
  description: z.string().min(1, 'Description required'),
  quantity: z.number().positive('Quantity must be > 0'),
  unitPrice: z.number().min(0).default(0),
});

export const insertFarFlowdownClauseSchema = createInsertSchema(farFlowdownClauses).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  clauseNumber: z.string().min(1),
  title: z.string().min(1),
});

export const REQUIRED_CONTRACT_REVIEW_AREAS = ['engineering', 'quality', 'procurement', 'scheduling', 'finance'] as const;

export const insertContractReviewChecklistTemplateSchema = createInsertSchema(contractReviewChecklistTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  name: z.string().min(1),
  reviewAreas: z.array(z.string()).default([...REQUIRED_CONTRACT_REVIEW_AREAS]),
});

export const insertContractClauseSchema = createInsertSchema(contractClauses).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  clauseNumber: z.string().min(1),
  title: z.string().min(1),
});

export const insertClauseTemplateSchema = createInsertSchema(clauseTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  reviewArea: z.enum(REQUIRED_CONTRACT_REVIEW_AREAS),
  requirementText: z.string().min(5),
});

export const insertContractReviewChecklistInstanceSchema = createInsertSchema(contractReviewChecklistInstances).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true, approvedAt: true,
}).extend({
  checklistTemplateId: z.number().int().positive(),
});

export const insertFlowedRequirementSchema = createInsertSchema(flowedRequirements).omit({
  id: true, flowedAt: true, createdAt: true, updatedAt: true,
}).extend({
  targetType: z.enum(['po', 'traveler', 'qc', 'supplier_po', 'cert_package']),
  targetId: z.string().min(1),
  requirementText: z.string().min(5),
});

export const insertVendorDebarmentCheckSchema = createInsertSchema(vendorDebarmentChecks).omit({
  id: true, checkedAt: true,
}).extend({
  vendorId: z.number().int().positive(),
  context: z.enum(['requisition_approval', 'po_issuance', 'periodic']),
  source: z.enum(['sam.gov', 'manual_attestation', 'document_upload']),
  result: z.enum(['pass', 'fail', 'inconclusive']),
});

export const insertSupplierScopeSchema = createInsertSchema(supplierScopes).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  vendorId: z.number().int().positive(),
  scopeCode: z.string().min(1),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

export const insertSupplierAuditSchema = createInsertSchema(supplierAudits).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  vendorId: z.number().int().positive(),
  auditType: z.enum(['qualification', 'surveillance', 'corrective_action', 'renewal']).default('qualification'),
  status: z.enum(['open', 'passed', 'failed', 'conditional']).default('open'),
  auditDate: z.string().min(1),
});

export const insertSupplierScorecardSchema = createInsertSchema(supplierScorecards).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  vendorId: z.number().int().positive(),
  qualityScore: z.number().int().min(1).max(5),
  deliveryScore: z.number().int().min(1).max(5),
  costScore: z.number().int().min(1).max(5),
  responsivenessScore: z.number().int().min(1).max(5),
  status: z.enum(['preferred', 'acceptable', 'conditional', 'disqualified']).default('acceptable'),
});

export type PurchaseRequisition = typeof purchaseRequisitions.$inferSelect;
export type InsertPurchaseRequisition = z.infer<typeof insertPurchaseRequisitionSchema>;
export type PurchaseRequisitionLine = typeof purchaseRequisitionLines.$inferSelect;
export type InsertPurchaseRequisitionLine = z.infer<typeof insertPurchaseRequisitionLineSchema>;
export type PurchaseRequisitionApproval = typeof purchaseRequisitionApprovals.$inferSelect;
export type PurchaseRequisitionApprovalChain = typeof purchaseRequisitionApprovalChain.$inferSelect;
export type FarFlowdownClause = typeof farFlowdownClauses.$inferSelect;
export type InsertFarFlowdownClause = z.infer<typeof insertFarFlowdownClauseSchema>;
export type VendorPoFarFlowdown = typeof vendorPoFarFlowdowns.$inferSelect;
export type ProjectFarFlowdown = typeof projectFarFlowdowns.$inferSelect;
export type ContractReviewChecklistTemplate = typeof contractReviewChecklistTemplates.$inferSelect;
export type InsertContractReviewChecklistTemplate = z.infer<typeof insertContractReviewChecklistTemplateSchema>;
export type ContractClause = typeof contractClauses.$inferSelect;
export type InsertContractClause = z.infer<typeof insertContractClauseSchema>;
export type ClauseTemplate = typeof clauseTemplates.$inferSelect;
export type InsertClauseTemplate = z.infer<typeof insertClauseTemplateSchema>;
export type ContractReviewChecklistInstance = typeof contractReviewChecklistInstances.$inferSelect;
export type InsertContractReviewChecklistInstance = z.infer<typeof insertContractReviewChecklistInstanceSchema>;
export type FlowedRequirement = typeof flowedRequirements.$inferSelect;
export type InsertFlowedRequirement = z.infer<typeof insertFlowedRequirementSchema>;
export type VendorDebarmentCheck = typeof vendorDebarmentChecks.$inferSelect;
export type InsertVendorDebarmentCheck = z.infer<typeof insertVendorDebarmentCheckSchema>;
export type ProcurementSettings = typeof procurementSettings.$inferSelect;
export type SupplierScope = typeof supplierScopes.$inferSelect;
export type InsertSupplierScope = z.infer<typeof insertSupplierScopeSchema>;
export type SupplierAudit = typeof supplierAudits.$inferSelect;
export type InsertSupplierAudit = z.infer<typeof insertSupplierAuditSchema>;
export type SupplierScorecard = typeof supplierScorecards.$inferSelect;
export type InsertSupplierScorecard = z.infer<typeof insertSupplierScorecardSchema>;

// ---------------------------------------------------------------------------
// Task #85 — Audit Evidence Hardening
// Hash-chain extension columns on `audit_events` (the unified ledger),
// plus `audit_anchors` (periodic chain-head checkpoints) and
// `audit_retention_policies` (per-event-type retention floor).
// ---------------------------------------------------------------------------

export const auditAnchors = pgTable('audit_anchors', {
  id: serial('id').primaryKey(),
  anchoredAt: timestamp('anchored_at', { withTimezone: true }).notNull().defaultNow(),
  headEventId: integer('head_event_id').references(() => auditEvents.id),
  headRowHash: text('head_row_hash'),
  headSequence: bigint('head_sequence', { mode: 'number' }),
  eventCount: bigint('event_count', { mode: 'number' }),
  notes: text('notes'),
  exportedTo: text('exported_to'),
  createdBy: text('created_by'),
}, (table) => ({
  anchoredAtIdx: index('audit_anchors_anchored_at_idx').on(table.anchoredAt),
}));

export type AuditAnchor = typeof auditAnchors.$inferSelect;
export const insertAuditAnchorSchema = createInsertSchema(auditAnchors).omit({ id: true, anchoredAt: true });
export type InsertAuditAnchor = z.infer<typeof insertAuditAnchorSchema>;

export const auditRetentionPolicies = pgTable('audit_retention_policies', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull().unique(),
  minRetentionDays: integer('min_retention_days').notNull().default(2555),
  archiveAfterDays: integer('archive_after_days'),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditRetentionPolicy = typeof auditRetentionPolicies.$inferSelect;
export const insertAuditRetentionPolicySchema = createInsertSchema(auditRetentionPolicies).omit({ id: true, updatedAt: true });
export type InsertAuditRetentionPolicy = z.infer<typeof insertAuditRetentionPolicySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Task #146 — Inventory Anomaly Detection (Phase 3)
// ─────────────────────────────────────────────────────────────────────────

export const inventoryAnomalies = pgTable('inventory_anomalies', {
  id: uuid('id').defaultRandom().primaryKey(),
  detectorKey: text('detector_key').notNull(),
  severity: text('severity').notNull(), // LOW | MEDIUM | HIGH | CRITICAL
  status: text('status').notNull().default('OPEN'), // OPEN | ACKNOWLEDGED | DISMISSED | ESCALATED
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  windowStart: timestamp('window_start', { withTimezone: true }),
  windowEnd: timestamp('window_end', { withTimezone: true }),
  dedupKey: text('dedup_key').notNull(),
  summary: text('summary').notNull(),
  contextJson: jsonb('context_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ledgerEntryIds: uuid('ledger_entry_ids').array().notNull().default(sql`ARRAY[]::uuid[]`),
  agPartNumber: text('ag_part_number'),
  lotId: uuid('lot_id'),
  performedByUserId: integer('performed_by_user_id'),
  performedByDisplayName: text('performed_by_display_name'),
  approvedByUserId: integer('approved_by_user_id'),
  approvedByDisplayName: text('approved_by_display_name'),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id),
  assignedToDisplayName: text('assigned_to_display_name'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedByUserId: integer('acknowledged_by_user_id').references(() => users.id),
  acknowledgedByDisplayName: text('acknowledged_by_display_name'),
  acknowledgmentNote: text('acknowledgment_note'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  dismissedByUserId: integer('dismissed_by_user_id').references(() => users.id),
  dismissedByDisplayName: text('dismissed_by_display_name'),
  dismissalReason: text('dismissal_reason'),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  escalatedByUserId: integer('escalated_by_user_id').references(() => users.id),
  escalatedByDisplayName: text('escalated_by_display_name'),
  escalationNote: text('escalation_note'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  notificationSentAt: timestamp('notification_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  detectorKeyIdx: index('inventory_anomalies_detector_key_idx').on(table.detectorKey),
  statusIdx: index('inventory_anomalies_status_idx').on(table.status),
  severityIdx: index('inventory_anomalies_severity_idx').on(table.severity),
  detectedAtIdx: index('inventory_anomalies_detected_at_idx').on(table.detectedAt),
  dedupUnique: uniqueIndex('inventory_anomalies_dedup_open_uniq')
    .on(table.detectorKey, table.dedupKey)
    .where(sql`status = 'OPEN'`),
}));

export type InventoryAnomaly = typeof inventoryAnomalies.$inferSelect;

export const anomalyDetectorConfig = pgTable('anomaly_detector_config', {
  id: serial('id').primaryKey(),
  detectorKey: text('detector_key').notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  notificationRecipientUserIds: integer('notification_recipient_user_ids').array().notNull().default(sql`ARRAY[]::int[]`),
  notifyOnHigh: boolean('notify_on_high').notNull().default(true),
  updatedByUserId: integer('updated_by_user_id'),
  updatedByDisplayName: text('updated_by_display_name'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AnomalyDetectorConfig = typeof anomalyDetectorConfig.$inferSelect;

// ─── Task #148 — Approval Escalation Engine ──────────────────────────────────
// Generalized cross-domain approval pipeline. Override approvals, NCR
// dispositions, scrap-over-threshold, quarantine release, and high-severity
// anomalies all open an `approval_requests` row instead of (or in addition to)
// their bespoke pending state. A scheduled job advances the request through
// the configured `escalation_policies` chain, notifying the new approver at
// each level, and ultimately rejects the originating operation if the backstop
// also fails to act. Migration: 0111_approval_escalation_engine.sql.

export const escalationPolicies = pgTable('escalation_policies', {
  id: serial('id').primaryKey(),
  requestType: text('request_type').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  // chain is a jsonb array of `{ role: string, slaSeconds: number, isBackstop?: boolean }`.
  chain: jsonb('chain').notNull().default(sql`'[]'::jsonb`),
  requiresSignature: boolean('requires_signature').notNull().default(false),
  reasonCodes: jsonb('reason_codes').notNull().default(sql`'[]'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestType: text('request_type').notNull(),
  requestPayload: jsonb('request_payload').notNull().default(sql`'{}'::jsonb`),
  subjectType: text('subject_type'),
  subjectId: text('subject_id'),
  requestedByUserId: integer('requested_by_user_id'),
  requestedByDisplayName: text('requested_by_display_name').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING|APPROVED|REJECTED|EXPIRED|ESCALATED|CANCELLED
  currentApproverRole: text('current_approver_role'),
  currentApproverUserId: integer('current_approver_user_id'),
  escalationLevel: integer('escalation_level').notNull().default(0),
  currentLevelDeadline: timestamp('current_level_deadline'),
  resolvedAt: timestamp('resolved_at'),
  resolvedByUserId: integer('resolved_by_user_id'),
  resolvedByDisplayName: text('resolved_by_display_name'),
  resolutionNotes: text('resolution_notes'),
  resolutionSignature: text('resolution_signature'),
  signatureMeaning: text('signature_meaning'),
  signatureReason: text('signature_reason'),
  signerUsername: text('signer_username'),
  signerRole: text('signer_role'),
  signatureLinkedObjectType: text('signature_linked_object_type'),
  signatureLinkedObjectId: text('signature_linked_object_id'),
  digitalSignatureId: uuid('digital_signature_id').references(() => digitalSignatures.id),
  resolutionReasonCode: text('resolution_reason_code'),
  policyId: integer('policy_id').references(() => escalationPolicies.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  statusUserIdx: index('approval_requests_status_user_idx').on(t.status, t.currentApproverUserId),
  statusRoleIdx: index('approval_requests_status_role_idx').on(t.status, t.currentApproverRole),
  statusDeadlineIdx: index('approval_requests_status_deadline_idx').on(t.status, t.currentLevelDeadline),
  typeIdx: index('approval_requests_request_type_idx').on(t.requestType),
  subjectIdx: index('approval_requests_subject_idx').on(t.subjectType, t.subjectId),
  signatureLinkedObjectIdx: index('approval_requests_signature_linked_object_idx').on(t.signatureLinkedObjectType, t.signatureLinkedObjectId),
}));

export const approvalSignatureEvidence = pgTable('approval_signature_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  approvalRequestId: uuid('approval_request_id').notNull().references(() => approvalRequests.id, { onDelete: 'cascade' }),
  decisionStatus: text('decision_status').notNull(),
  signatureMeaning: text('signature_meaning').notNull(),
  signatureReason: text('signature_reason').notNull(),
  signerUserId: integer('signer_user_id'),
  signerUsername: text('signer_username').notNull(),
  signerRole: text('signer_role').notNull(),
  linkedObjectType: text('linked_object_type').notNull(),
  linkedObjectId: text('linked_object_id').notNull(),
  digitalSignatureId: uuid('digital_signature_id').references(() => digitalSignatures.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  approvalRequestIdx: index('approval_signature_evidence_request_idx').on(t.approvalRequestId),
  linkedObjectIdx: index('approval_signature_evidence_linked_object_idx').on(t.linkedObjectType, t.linkedObjectId),
  signerIdx: index('approval_signature_evidence_signer_idx').on(t.signerUserId),
}));

export const auditRequiredEventCoverage = pgTable('audit_required_event_coverage', {
  id: serial('id').primaryKey(),
  domainKey: text('domain_key').notNull(),
  objectType: text('object_type').notNull(),
  lifecycleStage: text('lifecycle_stage').notNull(),
  requiredEventType: text('required_event_type').notNull(),
  requiredSourceService: text('required_source_service').notNull(),
  evidenceRequirement: text('evidence_requirement').notNull(),
  requiredActorRole: text('required_actor_role'),
  signatureRequired: boolean('signature_required').notNull().default(false),
  retentionObjectType: text('retention_object_type').notNull(),
  complianceBasis: text('compliance_basis').notNull().default('DCAA audit evidence'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  domainIdx: index('audit_required_event_coverage_domain_idx').on(t.domainKey),
  objectIdx: index('audit_required_event_coverage_object_idx').on(t.objectType),
  eventUidx: uniqueIndex('audit_required_event_coverage_event_uidx').on(t.domainKey, t.objectType, t.requiredEventType),
}));

export const auditObjectRetentionPolicies = pgTable('audit_object_retention_policies', {
  id: serial('id').primaryKey(),
  objectType: text('object_type').notNull().unique(),
  minRetentionDays: integer('min_retention_days').notNull().default(2555),
  archiveAfterDays: integer('archive_after_days'),
  legalHoldSupported: boolean('legal_hold_supported').notNull().default(true),
  description: text('description').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvalRequestHistory = pgTable('approval_request_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  approvalRequestId: uuid('approval_request_id').notNull().references(() => approvalRequests.id, { onDelete: 'cascade' }),
  event: text('event').notNull(), // OPENED|ESCALATED|APPROVED|REJECTED|EXPIRED|NOTIFIED|CANCELLED
  fromLevel: integer('from_level'),
  toLevel: integer('to_level'),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  actorUserId: integer('actor_user_id'),
  actorDisplayName: text('actor_display_name'),
  notes: text('notes'),
  metadata: jsonb('metadata'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
}, (t) => ({
  requestIdx: index('approval_request_history_request_idx').on(t.approvalRequestId, t.occurredAt),
}));

export type EscalationPolicy = typeof escalationPolicies.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type ApprovalRequestHistory = typeof approvalRequestHistory.$inferSelect;

export const insertEscalationPolicySchema = createInsertSchema(escalationPolicies)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    requestType: z.string().min(1),
    displayName: z.string().min(1),
    chain: z.array(z.object({
      role: z.string().min(1),
      slaSeconds: z.number().int().positive(),
      isBackstop: z.boolean().optional(),
    })).min(1),
    reasonCodes: z.array(z.string()).default([]),
  });
export type InsertEscalationPolicy = z.infer<typeof insertEscalationPolicySchema>;

export type EscalationChainLevel = {
  role: string;
  slaSeconds: number;
  isBackstop?: boolean;
};
// ---------------------------------------------------------------------------
// Task #143 — Operator badge authentication on material issues (Phase 2)
//
// Short-lived authenticated operator sessions, distinct from the web user
// session, that prove WHO is physically scanning material at a shop-floor
// workstation. A session is created by a badge scan or PIN entry and
// presented as an opaque HMAC-signed token on every subsequent material
// reserve / issue / consume / scrap / override call so the inventory
// ledger captures the real operator (not just whoever is logged into the
// shared tablet's web session).
// ---------------------------------------------------------------------------
export const operatorAuthSessions = pgTable('operator_auth_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: integer('employee_id').notNull().references(() => employees.id),
  // Snapshot of the employee's display name at the moment of authentication;
  // immutable for the life of the session so the ledger stamp doesn't drift
  // if HR later edits the employee row.
  employeeDisplayName: text('employee_display_name').notNull(),
  authMethod: text('auth_method').notNull(), // 'BADGE' | 'PIN' | 'SSO'
  workstationId: text('workstation_id'),
  deviceFingerprint: text('device_fingerprint'),
  ipAddress: text('ip_address'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  // Bumped on every successful validation. Idle timeout fires when
  // (now - lastActivityAt) > idleTimeoutSeconds.
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  // Bumped on every fresh badge/PIN entry. High-risk actions require
  // (now - lastReauthAt) <= reauthMaxAgeSeconds.
  lastReauthAt: timestamp('last_reauth_at', { withTimezone: true }).notNull().defaultNow(),
  // Absolute hard expiry — even with continuous activity, the session dies
  // here so an unattended badge can't authorize material draws indefinitely.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  idleTimeoutSeconds: integer('idle_timeout_seconds').notNull().default(900), // 15 min
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by'),
  revokeReason: text('revoke_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  employeeIdx: index('operator_auth_sessions_employee_idx').on(table.employeeId),
  expiresIdx: index('operator_auth_sessions_expires_idx').on(table.expiresAt),
  activeIdx: index('operator_auth_sessions_active_idx').on(table.revokedAt, table.expiresAt),
}));

export type OperatorAuthSession = typeof operatorAuthSessions.$inferSelect;
export type InsertOperatorAuthSession = typeof operatorAuthSessions.$inferInsert;
