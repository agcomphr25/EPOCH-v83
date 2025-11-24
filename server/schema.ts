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
  serial,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Order Department Types Reference Table (separate from order_departments tracking table)
export const orderDepartmentTypes = pgTable('order_department_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Order Status Types Reference Table
export const orderStatusTypes = pgTable('order_status_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// All finalized orders - production table
export const allOrders = pgTable('all_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
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
  customDiscountType: text('custom_discount_type').default('percent'),
  customDiscountValue: real('custom_discount_value').default(0),
  showCustomDiscount: boolean('show_custom_discount').default(false),
  priceOverride: real('price_override'), // Manual price override for stock model
  flattopPriceOverride: real('flattop_price_override'), // Manual price override for flattop stocks
  shipping: real('shipping').default(0),
  tikkaOption: text('tikka_option'),
  status: text('status').default('FINALIZED'), // Legacy - will be removed after migration
  statusId: integer('status_id').references(() => orderStatusTypes.id), // New FK reference
  barcode: text('barcode').unique(), // Code 39 barcode for order identification
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
  priorityScore: integer('priority_score').default(50), // Lower = higher priority
  isManualUrgency: boolean('is_manual_urgency').default(false), // True if manually set by user
  // Customer Signature Data
  signatureData: text('signature_data'), // Base64 signature image from customer
  signedAt: timestamp('signed_at'), // When customer signed the order
  // RTS Order Tracking
  isRtsOrder: boolean('is_rts_order').default(false), // True if this order was created from RTS inventory sale
  rtsSaleId: uuid('rts_sale_id'), // Reference to RTS sale if applicable
  // BOM Reference for Costing and MRP
  bomDefinitionId: uuid('bom_definition_id').references(() => bomDefinitions.id), // Links order to BOM for costing/MRP
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Legacy orders table - keeping for compatibility
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
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
  priorityScore: integer('priority_score').default(50),
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
  shippingCompletedAt: timestamp('shipping_completed_at'),
  // Scrapping fields
  scrapDate: timestamp('scrap_date'),
  scrapReason: text('scrap_reason'),
  scrapDisposition: text('scrap_disposition'),
  scrapAuthorization: text('scrap_authorization'),
  isReplacement: boolean('is_replacement').default(false),
  replacedOrderId: text('replaced_order_id'),
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
  orderId: text('order_id').notNull().unique(),
  customerId: text('customer_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  // Email Tracking
  emailSent: boolean('email_sent').default(false),
  emailSentAt: timestamp('email_sent_at'),
  emailError: text('email_error'),
  // PDF Generation
  pdfGenerated: boolean('pdf_generated').default(false),
  pdfPath: text('pdf_path'),
  pdfGeneratedAt: timestamp('pdf_generated_at'),
  // Signature Tracking
  signatureToken: text('signature_token').unique(), // Unique token for signature link
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
  // Order Summary for Email Display
  orderSummary: jsonb('order_summary'), // Contains order details for email body
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

// Payments table for multiple payments per order
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: text('order_id')
    .references(() => allOrders.orderId)
    .notNull(),
  paymentType: text('payment_type').notNull(), // credit_card, agr, check, cash, ach
  paymentAmount: real('payment_amount').notNull(),
  paymentDate: timestamp('payment_date').notNull(),
  notes: text('notes'), // Optional notes for the payment
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
  transactionId: text('transaction_id').notNull().unique(), // Authorize.Net transaction ID
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

// Inventory Management Tables
export const inventoryItems = pgTable('inventory_items', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  agPartNumber: text('ag_part_number').notNull().unique(), // AG Part#
  name: text('name').notNull(), // Name
  source: text('source'), // Source
  supplierPartNumber: text('supplier_part_number'), // Supplier Part #
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
  traceabilityRequired: boolean('traceability_required').default(false), // Traceability required for P2 items
  utilizedInFacilities: boolean('utilized_in_facilities').default(false), // Used in Facilities
  utilizedInAdmin: boolean('utilized_in_admin').default(false), // Used in Admin
  utilizedInServices: boolean('utilized_in_services').default(false), // Used in Services
  isPacketPart: boolean('is_packet_part').default(false), // Part of cutting table packet
  isFabric: boolean('is_fabric').default(false), // Fabric for cutting table
  type: text('type'), // Type: Purchased or Manufactured
  vendorId: integer('vendor_id').references(() => vendors.id), // Primary vendor for this part
  hasSds: boolean('has_sds').default(false), // Has Safety Data Sheet
  sdsFilePath: text('sds_file_path'), // Path to uploaded SDS PDF file
  hasTds: boolean('has_tds').default(false), // Has Technical Data Sheet
  tdsFilePath: text('tds_file_path'), // Path to uploaded TDS PDF file
  hasOtherDocs: boolean('has_other_docs').default(false), // Has Other Documents
  otherDocsFilePath: text('other_docs_file_path'), // Path to uploaded Other Docs PDF file
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
  barcode: text('barcode').unique(), // 39-line barcode for P2 products
  receivingDate: date('receiving_date'), // Date when received
  technicianId: text('technician_id'),
  scannedAt: timestamp('scanned_at').defaultNow(),
});

// Department-specific consumption rates for parts
export const departmentConsumptionRates = pgTable('department_consumption_rates', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' })
    .notNull(),
  departmentId: integer('department_id')
    .references(() => departments.id, { onDelete: 'cascade' })
    .notNull(),
  consumptionRate: real('consumption_rate').notNull(), // Units consumed per time period
  ratePeriod: text('rate_period').default('weekly'), // daily, weekly, monthly
  usageUnit: text('usage_unit'), // Unit of measurement (ea, lbs, oz, etc.)
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniquePartDepartment: unique().on(table.agPartNumber, table.departmentId),
}));

export const partsRequests = pgTable('parts_requests', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number').references(() => inventoryItems.agPartNumber), // Link to inventory item (nullable for ad-hoc requests)
  partNumber: text('part_number').notNull(), // Part number (can be AG part or external)
  partName: text('part_name').notNull(),
  requestedBy: text('requested_by').notNull(),
  department: text('department'), // Department name (legacy text field)
  departmentId: integer('department_id').references(() => departments.id), // FK to departments table
  quantity: integer('quantity').notNull(),
  urgency: text('urgency').notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  supplier: text('supplier'),
  estimatedCost: real('estimated_cost'),
  reason: text('reason'), // Why the part is needed
  status: text('status').default('PENDING').notNull(), // PENDING, APPROVED, ORDERED, RECEIVED, DELIVERED_TO_DEPT, REJECTED
  requestDate: timestamp('request_date').defaultNow().notNull(),
  approvedBy: text('approved_by'),
  approvedDate: timestamp('approved_date'),
  orderDate: timestamp('order_date'),
  expectedDelivery: date('expected_delivery'),
  actualDelivery: date('actual_delivery'),
  deliveredToDepartment: timestamp('delivered_to_department'), // When parts were turned over to requesting department
  receivedByDepartment: text('received_by_department'), // Who in the department received the parts
  vendorPoId: integer('vendor_po_id').references(() => vendorPOs.id), // Link to vendor PO if ordered
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Ready to Ship (RTS) Inventory - Finished products on hand
export const rtsInventory = pgTable('rts_inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  stockModel: text('stock_model').notNull(),
  actionLength: text('action_length'),
  action: text('action'),
  barrel: text('barrel'),
  bottomMetal: text('bottom_metal'),
  color: text('color'),
  extras: text('extras'), // Order/identifier codes
  price: real('price'), // Sale price for this item
  status: text('status').notNull().default('AVAILABLE'), // AVAILABLE, SHIPPED, IN_PRODUCTION, SOLD
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
  saleNumber: text('sale_number').notNull().unique(), // e.g., RTS-2024-001
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

// Enhanced Employee Management System
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  employeeCode: text('employee_code').unique(),
  name: text('name').notNull(),
  email: text('email').unique(),
  phone: text('phone'),
  jobTitle: text('job_title'), // Informational only - e.g., "Department Manager", "HR Specialist"
  userRole: text('user_role').notNull().default('EMPLOYEE'), // ADMIN, EMPLOYEE, OWNER - system access level
  department: text('department'),
  hireDate: date('hire_date'),
  dateOfBirth: date('date_of_birth'),
  address: text('address'),
  emergencyContact: text('emergency_contact'),
  emergencyPhone: text('emergency_phone'),
  gateCardNumber: text('gate_card_number'),
  vehicleType: text('vehicle_type'),
  buildingKeyAccess: boolean('building_key_access').default(false),
  tciAccess: boolean('tci_access').default(false),
  employmentType: text('employment_type').default('FULL_TIME'), // FULL_TIME, PART_TIME, CONTRACT
  portalToken: text('portal_token').unique(), // UUID for employee portal access
  portalTokenExpiry: timestamp('portal_token_expiry'),
  isFinishTechnician: boolean('is_finish_technician').default(false), // Mark employee as Finish technician for department assignments
  isActive: boolean('is_active').default(true),
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

// Employee-Certification Junction Table
export const employeeCertifications = pgTable('employee_certifications', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  employeeId: integer('employee_id')
    .references(() => employees.id)
    .notNull(),
  certificationId: integer('certification_id')
    .references(() => certifications.id)
    .notNull(),
  dateObtained: date('date_obtained').notNull(),
  expiryDate: date('expiry_date'),
  certificateNumber: varchar('certificate_number'),
  issuingAuthority: varchar('issuing_authority'),
  status: varchar('status'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  dateExpiry: date('date_expiry'),
  documentUrl: text('document_url'),
  isActive: boolean('is_active'),
  notes: text('notes'),
  trainerName: varchar('trainer_name'),
  trainerSignature: varchar('trainer_signature'),
  trainingDate: date('training_date'),
  criticalPointsCompleted: jsonb('critical_points_completed'),
  completedByUserId: integer('completed_by_user_id'),
  formCompletedAt: timestamp('form_completed_at'),
  workInstructionsCompleted: jsonb('work_instructions_completed'),
  uploadedFiles: jsonb('uploaded_files').default(sql`'[]'::jsonb`),
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
  isActive: boolean('is_active').default(true),
  lastLogin: timestamp('last_login'),
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  accountLockedUntil: timestamp('account_locked_until'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User Sessions Table
export const userSessions = pgTable('user_sessions', {
  id: serial('id').primaryKey(),
  sessionToken: text('session_token').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  username: text('username').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: timestamp('last_activity_at'),
  isActive: boolean('is_active').default(true),
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
  name: text('name').notNull().unique(), // e.g., "VIEW_ORDERS", "EDIT_INVENTORY", "APPROVE_PARTS_REQUESTS"
  displayName: text('display_name').notNull(), // e.g., "View Orders", "Edit Inventory"
  category: text('category').notNull(), // e.g., "ORDERS", "INVENTORY", "EMPLOYEES", "REPORTS"
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee-Capability Junction Table with toggle for hardcoded capabilities
export const employeeCapabilities = pgTable(
  'employee_capabilities',
  {
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
  },
  (table) => ({
    // Unique constraint to prevent duplicate capability grants
    uniqueEmployeeCapability: unique().on(table.employeeId, table.capabilityId),
  })
);

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

// Employee Portal & Time Keeping Tables
export const timeClockEntries = pgTable('time_clock_entries', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  clockIn: timestamp('clock_in'),
  clockOut: timestamp('clock_out'),
  date: date('date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

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
    priorityScore: z.number().default(50),
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
    bomDefinitionId: z.string().uuid().optional().nullable(),
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
    paymentType: z.enum(['credit_card', 'agr', 'check', 'cash', 'ach', 'aaaa']),
    paymentAmount: z
      .number()
      .min(0.01, 'Payment amount must be greater than 0'),
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
    secondarySupplierPartNumber: z.string().optional().nullable(),
    costPer: z.number().min(0).optional().nullable(),
    purchaseUnit: z.string().optional().nullable(),
    usageQuantityPerUnit: z.number().min(0).optional().nullable(),
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
    utilizedInFacilities: z.boolean().default(false),
    utilizedInAdmin: z.boolean().default(false),
    utilizedInServices: z.boolean().default(false),
    isActive: z.boolean().default(true),
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
    hireDate: z.coerce.date().optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    address: z.string().optional().nullable(),
    emergencyContact: z.string().optional().nullable(),
    emergencyPhone: z.string().optional().nullable(),
    salary: z.number().min(0).optional().nullable(),
    hourlyRate: z.number().min(0).optional().nullable(),
    employmentType: z
      .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT'])
      .default('FULL_TIME'),
    isActive: z.boolean().default(true),
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

export const insertEmployeeCertificationSchema = createInsertSchema(
  employeeCertifications
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.number().min(1, 'Employee ID is required'),
    certificationId: z.number().min(1, 'Certification ID is required'),
    dateObtained: z.coerce.date(),
    expiryDate: z.coerce.date().optional().nullable(),
    certificateNumber: z.string().optional().nullable(),
    documentUrl: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
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

export const insertDepartmentConsumptionRateSchema = createInsertSchema(departmentConsumptionRates)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    agPartNumber: z.string().min(1, 'Part number is required'),
    departmentId: z.number().positive('Department ID is required'),
    consumptionRate: z.number().positive('Consumption rate must be positive'),
    ratePeriod: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    usageUnit: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
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
    department: z.string().optional().nullable(),
    departmentId: z.number().optional().nullable(),
    quantity: z.number().positive('Quantity must be positive'),
    urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    supplier: z.string().optional().nullable(),
    estimatedCost: z.number().min(0).optional().nullable(),
    reason: z.string().optional().nullable(),
    status: z
      .enum(['PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'DELIVERED_TO_DEPT', 'REJECTED'])
      .default('PENDING'),
    approvedBy: z.string().optional().nullable(),
    approvedDate: z.coerce.date().optional().nullable(),
    orderDate: z.coerce.date().optional().nullable(),
    expectedDelivery: z.coerce.date().optional().nullable(),
    actualDelivery: z.coerce.date().optional().nullable(),
    deliveredToDepartment: z.coerce.date().optional().nullable(),
    receivedByDepartment: z.string().optional().nullable(),
    vendorPoId: z.number().optional().nullable(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
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

// Backward compatibility aliases (order_drafts table removed, now using all_orders with PENDING_SIGNATURE status)
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
export type InsertEmployeeCertification = z.infer<
  typeof insertEmployeeCertificationSchema
>;
export type EmployeeCertification = typeof employeeCertifications.$inferSelect;
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
export type InsertTimeClockEntry = z.infer<typeof insertTimeClockEntrySchema>;
export type TimeClockEntry = typeof timeClockEntries.$inferSelect;
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type InsertOnboardingDoc = z.infer<typeof insertOnboardingDocSchema>;
export type OnboardingDoc = typeof onboardingDocs.$inferSelect;
export type InsertDepartmentConsumptionRate = z.infer<typeof insertDepartmentConsumptionRateSchema>;
export type DepartmentConsumptionRate = typeof departmentConsumptionRates.$inferSelect;
export type InsertPartsRequest = z.infer<typeof insertPartsRequestSchema>;
export type PartsRequest = typeof partsRequests.$inferSelect;

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
  moldId: text('mold_id').notNull().unique(),
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
    priorityScore: z.number().min(1, 'Priority score must be positive'),
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
  customerId: text('customer_id').notNull(),
  street: text('street').notNull(),
  street2: text('street2'), // Suite, Apt, Unit number
  city: text('city').notNull(),
  state: text('state').notNull(),
  zipCode: text('zip_code').notNull(),
  country: text('country').notNull().default('United States'),
  type: text('type').notNull().default('shipping'), // shipping, billing, both
  isDefault: boolean('is_default').default(false),
  isValidated: boolean('is_validated').default(false),
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
  scope: text('scope'), // Materials/products vendor is approved to supply
  approvalLevel: text('approval_level'), // A, B, or C - vendor approval level
  approvalSource: text('approval_source'), // "Certification" or "Supplier Approval Form"
  approvalPdfUrl: text('approval_pdf_url'), // Path to uploaded PDF document
  startRenewalDate: date('start_renewal_date'), // Date when vendor approval started or was renewed
  approvalExpiration: date('approval_expiration'), // Date when vendor approval expires
  approved: boolean('approved').notNull().default(false),
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
}, (table) => ({
  uniqueVendorMonthYear: unique().on(table.vendorId, table.month, table.year),
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
}, (table) => ({
  uniquePartLocation: unique().on(table.agPartNumber, table.locationId),
}));

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

export type EnrichedInventoryBalance = typeof inventoryBalances.$inferSelect & {
  partName?: string;
  departmentMeta?: DepartmentBalanceMeta;
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
  poNumber: text('po_number').notNull().unique(),
  vendorId: integer('vendor_id')
    .references(() => vendors.id)
    .notNull(),
  status: text('status').notNull().default('Draft'), // Draft, Sent, Partially Received, Fully Received, Cancelled
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
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  lineTotal: real('line_total').notNull(),
  receivedQuantity: integer('received_quantity').default(0),
  receivedDate: date('received_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniquePoLine: unique().on(table.vendorPoId, table.lineNumber),
}));

// Central Company Settings (singleton table for company-wide information)
export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name'),
  companyAddress: text('company_address'),
  companyPhone: text('company_phone'),
  companyEmail: text('company_email'),
  companyWebsite: text('company_website'),
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
}, (table) => ({
  uniquePoSetting: unique().on(table.vendorPoId, table.optionalSettingId),
}));

export const communicationLogs = pgTable('communication_logs', {
  id: serial('id').primaryKey(),
  orderId: text('order_id'), // Made nullable for general communications
  messageType: text('message_type').notNull().default('transactional'), // transactional, marketing, notification
  customerId: text('customer_id').notNull(),
  type: text('type').notNull(), // order-confirmation, shipping-notification, quality-alert
  method: text('method').notNull(), // email, sms
  recipient: text('recipient').notNull(), // email address or phone number
  sender: text('sender'), // sender email/phone for inbound messages
  subject: text('subject'),
  message: text('message'),
  status: text('status').notNull().default('pending'), // pending, sent, failed, received
  error: text('error'),
  direction: text('direction').default('outbound'), // inbound, outbound
  externalId: text('external_id'), // External message ID from Twilio/SendGrid
  isRead: boolean('is_read').default(false), // Whether message has been read
  sentAt: timestamp('sent_at'),
  receivedAt: timestamp('received_at'), // For inbound messages
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
    scope: z.string().optional(),
    approvalSource: z.string().optional(),
    approvalPdfUrl: z.string().optional(),
    startRenewalDate: z.string().optional().nullable(),
    approvalExpiration: z.string().optional().nullable(),
    approved: z.boolean().default(false),
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
    poNumber: z.string().min(1, 'PO number is required').optional(),
    vendorId: z.number().int().positive('Vendor ID is required'),
    status: z.enum(['Draft', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled']).default('Draft'),
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
    lineNumber: z.number().int().positive('Line number is required'),
    agPartNumber: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    quantity: z.number().int().positive('Quantity must be greater than 0'),
    unitPrice: z.number().positive('Unit price must be greater than 0'),
    lineTotal: z.number(),
    receivedQuantity: z.number().int().default(0),
    receivedDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
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
  orderId: text('order_id'),
  serialNumber: text('serial_number'),
  customerName: text('customer_name'),
  poNumber: text('po_number'),
  stockModel: text('stock_model'),
  quantity: integer('quantity').default(1),
  issueCause: text('issue_cause').notNull(),
  manufacturerDefect: boolean('manufacturer_defect').default(false),
  disposition: text('disposition').notNull(),
  authorization: text('auth_person').notNull(),
  dispositionDate: date('disposition_date').notNull(),
  notes: text('notes'),
  status: text('status').default('Open'), // Open, Resolved
  resolvedAt: timestamp('resolved_at'),
  repairDepartment: text('repair_department'),
  repairNotes: text('repair_notes'),
  hasCustomerPartsToReturn: boolean('has_customer_parts_to_return').default(false),
  addedToRts: boolean('added_to_rts').default(false),
  rtsAddedAt: timestamp('rts_added_at'),
  useOrderAddress: boolean('use_order_address').default(false),
  repairAddress: jsonb('repair_address'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertNonconformanceRecordSchema = createInsertSchema(
  nonconformanceRecords
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    orderId: z.string().optional(),
    serialNumber: z.string().optional(),
    customerName: z.string().optional(),
    poNumber: z.string().optional(),
    stockModel: z.string().optional(),
    quantity: z.number().min(1).default(1),
    issueCause: z.string().min(1, 'Issue cause is required'),
    manufacturerDefect: z.boolean().default(false),
    disposition: z.string().min(1, 'Disposition is required'),
    authorization: z.string().min(1, 'Authorization is required'),
    dispositionDate: z.string().min(1, 'Disposition date is required'),
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
  });

// Types for Module 8
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
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

// Purchase Order Management Tables
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(), // Denormalized for performance
  itemType: text('item_type').notNull().default('single'), // single, multiple
  poDate: date('po_date').notNull(),
  expectedDelivery: date('expected_delivery').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, CANCELED
  notes: text('notes'),
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
  customerId: text('customer_id').notNull().unique(),
  customerName: text('customer_name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  billingAddress: text('billing_address'),
  shippingAddress: text('shipping_address'),
  shipToAddress: text('ship_to_address'), // New field for ship-to information
  paymentTerms: text('payment_terms').default('NET_30'),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE, SUSPENDED
  notes: text('notes'),
  rfqPrefix: text('rfq_prefix'), // 3-letter prefix for RFQ numbers (e.g., "STR" for Strata-G)
  rfqSequences: jsonb('rfq_sequences').default('{}'), // Tracks RFQ sequence by year: {"2025": 15, "2024": 50}
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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const p2PurchaseOrderItems = pgTable('p2_purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id')
    .references(() => p2PurchaseOrders.id)
    .notNull(),
  partNumber: text('part_number').notNull(), // P2-specific part number
  partName: text('part_name').notNull(), // Display name for the part
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').default(0), // Price per unit
  totalPrice: real('total_price').default(0), // quantity * unitPrice
  specifications: text('specifications'), // Part specifications
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// RFQ Risk Assessments - stores RFQ risk assessment records
export const rfqRiskAssessments = pgTable('rfq_risk_assessments', {
  id: serial('id').primaryKey(),
  rfqNumber: text('rfq_number').notNull().unique(),
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
  submittedBy: text('submitted_by'), // Username who submitted
  submittedAt: timestamp('submitted_at'), // When it was submitted
  attachments: text('attachments').array(), // PDF file paths
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
    .references(() => p2PartCertifications.id, { onDelete: 'cascade' })
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
  serialNumber: text('serial_number').notNull().unique(), // Unique serial for this item
  barcode: text('barcode').notNull().unique(), // Format: {PONumber}-{PartNumber}-{Sequence}
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
  // Hold and scrap tracking
  holdReason: text('hold_reason'),
  holdBy: text('hold_by'), // Username who placed hold
  holdAt: timestamp('hold_at'),
  scrapReason: text('scrap_reason'),
  scrapBy: text('scrap_by'), // Username who scrapped item
  scrapAt: timestamp('scrap_at'),
  notes: text('notes'),
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

// Part Routing Definitions - Custom department sequences and traceability requirements per inventory item
export const partRoutings = pgTable('part_routings', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull(), // Reference to inventory item
  partNumber: text('part_number').notNull(), // Denormalized for display
  partName: text('part_name').notNull(), // Denormalized for display
  departmentSequence: jsonb('department_sequence').notNull(), // Array of department names in order: ["Layup", "CNC", "Finish"]
  traceabilityConfig: jsonb('traceability_config').notNull(), // Requirements per department: { "Layup": ["lot_number", "batch_number", "expiration"], "CNC": ["custom_1"] }
  departmentConfig: jsonb('department_config'), // Full department configuration: { "Layup": { materials: [{partId, partNumber, partName, requiredFields, entryMethod}], technicianRequired: bool, qcStandards: [{standard, tolerance, requirement}] } }
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: text('created_by').notNull(), // Username who created routing
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  inventoryItemIdx: index('part_routings_inventory_item_idx').on(table.inventoryItemId),
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
}));

// Production Orders - separate from regular orders for PO tracking
export const productionOrders = pgTable('production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(), // Customer-based format: ABC00199-0001
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
  productionStatus: text('production_status').notNull().default('PENDING'), // PENDING, LAID_UP, SHIPPED
  currentDepartment: text('current_department').default('Barcode'), // Department progression tracking
  departmentHistory: jsonb('department_history').default('[]'), // History of department movements
  barcodeCompletedAt: timestamp('barcode_completed_at'),
  layupCompletedAt: timestamp('layup_completed_at'),
  cncCompletedAt: timestamp('cnc_completed_at'),
  finishCompletedAt: timestamp('finish_completed_at'),
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
    shippingAddress: z.string().optional().nullable(),
    shipToAddress: z.string().optional().nullable(),
    paymentTerms: z.string().default('NET_30'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
    notes: z.string().optional().nullable(),
    rfqPrefix: z.string().length(3).optional().nullable(),
    rfqSequences: z.any().optional().nullable(),
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
      .enum(['PENDING', 'LAID_UP', 'SHIPPED'])
      .default('PENDING'),
    laidUpAt: z.coerce.date().optional().nullable(),
    shippedAt: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
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
    startedAt: true,
    startedBy: true,
    completedAt: true,
    completedBy: true,
    cancelledAt: true,
    cancelledBy: true,
  })
  .extend({
    serializedItemId: z.string().uuid('Invalid serialized item ID'),
    barcode: z.string().min(1, 'Barcode is required'),
    poNumber: z.string().optional(),
    partNumber: z.string().optional(),
    partName: z.string().optional(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    scheduledDate: z.string().min(1, 'Scheduled date is required'),
    scheduledBy: z.string().optional(),
    assignedTechnician: z.string().optional(),
    notes: z.string().optional(),
    cuttingPacketId: z.string().optional(),
    status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
    partNumber: z.string().min(1, 'Part number is required'),
    partName: z.string().min(1, 'Part name is required'),
    department: z.string().min(1, 'Department is required'),
    employeeId: z.number().min(1, 'Employee ID is required'),
    employeeCode: z.string().min(1, 'Employee code is required'),
    employeeName: z.string().min(1, 'Employee name is required'),
    certificationId: z.number().optional().nullable(),
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'PAUSED']).default('IN_PROGRESS'),
    startedAt: z.coerce.date().optional(),
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
export type InsertP2SerializedItemTraceability = z.infer<typeof insertP2SerializedItemTraceabilitySchema>;
export type P2SerializedItemTraceability = typeof p2SerializedItemTraceability.$inferSelect;
export type InsertP2SerializedItemCustomData = z.infer<typeof insertP2SerializedItemCustomDataSchema>;
export type P2SerializedItemCustomData = typeof p2SerializedItemCustomData.$inferSelect;
export type InsertP2LayupSchedule = z.infer<typeof insertP2LayupScheduleSchema>;
export type P2LayupSchedule = typeof p2LayupSchedules.$inferSelect;
export type InsertP2WorkTask = z.infer<typeof insertP2WorkTaskSchema>;
export type P2WorkTask = typeof p2WorkTasks.$inferSelect;

// Production Order Types
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionOrder = typeof productionOrders.$inferSelect;

// P1 Purchase Order Queue Types (from po_products table)
export interface P1POQueueItem {
  id: number;
  poNumber: string;
  productName: string;
  stockModel: string | null;
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
]);

// BOM (Bill of Materials) Management Tables for P2
export const bomDefinitions = pgTable('bom_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku'),
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
  quantity: integer('quantity').notNull().default(1),
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
    quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
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
  orderId: text('order_id').notNull().unique(), // The reserved Order ID (e.g., AG003)
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
  yearMonthPrefix: text('year_month_prefix').notNull().unique(), // Year-month prefix (e.g., EH for Aug 2025)
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

export type InsertOrderIdSequence = z.infer<typeof insertOrderIdSequenceSchema>;
export type OrderIdSequence = typeof orderIdSequences.$inferSelect;

// P2 Production Orders - Generated from P2 Purchase Orders based on BOM
export const p2ProductionOrders = pgTable('p2_production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(), // P2-PO123-001, P2-PO123-002, etc.
  p2PoId: integer('p2_po_id')
    .references(() => p2PurchaseOrders.id)
    .notNull(),
  p2PoItemId: integer('p2_po_item_id')
    .references(() => p2PurchaseOrderItems.id)
    .notNull(),
  bomDefinitionId: uuid('bom_definition_id')
    .references(() => boms.id)
    .notNull(),
  bomItemId: uuid('bom_item_id')
    .references(() => bomLines.id)
    .notNull(),
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
    bomDefinitionId: z.string().uuid('BOM Definition ID must be a valid UUID'),
    bomItemId: z.string().uuid('BOM Item ID must be a valid UUID'),
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
    createdBy: z.string().min(1, 'Created by is required'),
  });

export type InsertShipmentRecord = z.infer<typeof insertShipmentRecordSchema>;
export type ShipmentRecord = typeof shipmentRecords.$inferSelect;

// Shipment Items - Join table linking shipments to PO items and production orders
export const shipmentItems = pgTable(
  'shipment_items',
  {
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
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueShipmentItem: unique().on(table.shipmentId, table.orderId),
  })
);

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
    kickbackDept: z.enum(['CNC', 'Finish', 'Gunsmith', 'Paint']),
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
  name: text('name').notNull().unique(),
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
  otherOptions: text('other_options').array(),
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
  name: text('name').notNull().unique(),
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
  senderId: integer('sender_id').notNull(),
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
});

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
  token: text('token').notNull().unique(), // Unique cryptographic token
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

// OAuth State Tokens - Secure OAuth CSRF protection
export const oauthStates = pgTable('oauth_states', {
  id: serial('id').primaryKey(),
  state: text('state').notNull().unique(), // Cryptographically random state token
  userId: integer('user_id').references(() => users.id).notNull(),
  integrationType: text('integration_type').notNull(), // e.g., 'google-gmail', 'google-calendar'
  expiresAt: timestamp('expires_at').notNull(), // State token expiration (5 minutes)
  used: boolean('used').default(false), // Prevent state reuse
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertOAuthStateSchema = createInsertSchema(oauthStates).omit({
  id: true,
  createdAt: true,
});

export type OAuthState = typeof oauthStates.$inferSelect;
export type InsertOAuthState = z.infer<typeof insertOAuthStateSchema>;

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

// Cutting Table - Production Lines
export const cuttingProductionLines = pgTable('cutting_production_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  lineName: text('line_name').notNull().unique(), // "Production Line 1", "Production Line 2"
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
  source: text('source'), // Fabric source/manufacturer
  fabric: text('fabric'), // Fabric type/description
  batchNumber: text('batch_number'), // Batch/lot number
  internalControlNumber: text('internal_control_number'), // Part number/internal control
  manufactureDate: date('manufacture_date'),
  receivedDate: date('received_date'),
  expirationDate: date('expiration_date'),
  location: text('location'), // Storage location/freezer #
  conformanceDocumentLink: text('conformance_document_link'), // Link to conformance/traceability paperwork
  quantityInStock: integer('quantity_in_stock').notNull().default(0),
  squareMeters: numeric('square_meters', { precision: 10, scale: 2 }), // Total square meters of fabric
  lowStockThreshold: integer('low_stock_threshold').default(10),
  barcode: text('barcode').unique(), // Auto-generated for P2 items
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  expirationIdx: index('cutting_fabric_inventory_expiration_idx').on(table.expirationDate),
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

// Cutting Table Insert Schemas
export const insertCuttingMaterialSchema = createInsertSchema(cuttingMaterials).omit({
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

// Cutting Table Types
export type CuttingMaterial = typeof cuttingMaterials.$inferSelect;
export type InsertCuttingMaterial = z.infer<typeof insertCuttingMaterialSchema>;

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

export type CuttingPacketSession = typeof cuttingPacketSessions.$inferSelect;
export type InsertCuttingPacketSession = z.infer<typeof insertCuttingPacketSessionSchema>;

export type CuttingPacketSessionLot = typeof cuttingPacketSessionLots.$inferSelect;
export type InsertCuttingPacketSessionLot = z.infer<typeof insertCuttingPacketSessionLotSchema>;

export type CuttingFabricInventoryTransaction = typeof cuttingFabricInventoryTransactions.$inferSelect;
export type InsertCuttingFabricInventoryTransaction = z.infer<typeof insertCuttingFabricInventoryTransactionSchema>;

// Controlled Documents - Master Document Register
export const controlledDocuments = pgTable('controlled_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: text('document_number').notNull().unique(), // e.g., DOC-001
  documentName: text('document_name').notNull(),
  documentType: text('document_type').notNull(), // SOP, Work Instruction, Form, etc.
  department: text('department').notNull(), // P1, P2, Quality, etc.
  category: text('category'), // Optional additional categorization
  description: text('description'),
  currentVersion: text('current_version').notNull().default('1.0'), // Major.Minor format
  status: text('status').notNull().default('draft'), // draft, pending, approved, expired
  effectiveDate: date('effective_date'),
  expirationDate: date('expiration_date'),
  retentionLength: text('retention_length'), // Optional: e.g., "7 years", "permanent"
  documentOwner: text('document_owner'), // Employee responsible
  filePath: text('file_path'), // Path to current version file
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
  quoteNumber: text('quote_number').notNull().unique(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  description: text('description'),
  totalAmount: real('total_amount').notNull().default(0),
  status: text('status').notNull().default('DRAFT'), // DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED
  validUntil: timestamp('valid_until'),
  quotedBy: text('quoted_by'),
  notes: text('notes'),
  attachments: text('attachments').array(), // PDF file paths
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

// Cost Centers - Track business units, departments, and projects for expense allocation
export const costCenters = pgTable('cost_centers', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(), // Short identifier (e.g., LAYUP, ADMIN)
  name: text('name').notNull(), // Full name (e.g., Layup Department)
  type: text('type').notNull(), // DEPARTMENT, PROJECT, OVERHEAD, ADMINISTRATIVE
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
  type: z.enum(['DEPARTMENT', 'PROJECT', 'OVERHEAD', 'ADMINISTRATIVE']),
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
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(), // e.g., 'Assets', 'Liabilities', 'Revenue', 'COGS', 'Operating Expenses'
  code: text('code').notNull().unique(), // e.g., '1000', '2000', '3000', '4000', '5000'
  type: text('type').notNull(), // 'asset', 'liability', 'equity', 'revenue', 'expense', 'cogs'
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  id: uuid('id').defaultRandom().primaryKey(),
  accountNumber: text('account_number').notNull().unique(), // Auto-generated (e.g., '5100-001')
  name: text('name').notNull(), // e.g., 'Direct Materials - Carbon Fiber'
  categoryId: uuid('category_id').references(() => accountCategories.id).notNull(),
  description: text('description'),
  isAllocated: boolean('is_allocated').default(false), // True for items like overhead, indirect materials
  allocationBasis: text('allocation_basis'), // 'direct_labor_hours', 'machine_hours', 'direct_materials', etc.
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 1-12
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  source: text('source').default('manual'), // 'manual', 'quickbooks', 'imported'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // e.g., 'Manufacturing Overhead Allocation'
  sourceAccountId: uuid('source_account_id').references(() => accounts.id).notNull(), // Account to allocate from
  allocationBasis: text('allocation_basis').notNull(), // 'direct_labor_hours', 'machine_hours', 'direct_materials', etc.
  targetAccountIds: uuid('target_account_ids').array(), // Accounts to allocate to
  allocationMethod: text('allocation_method').notNull(), // 'proportional', 'equal', 'custom'
  customRatios: jsonb('custom_ratios'), // Custom allocation ratios if method is 'custom'
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  id: uuid('id').defaultRandom().primaryKey(),
  ruleId: uuid('rule_id').references(() => allocationRules.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  allocations: jsonb('allocations').notNull(), // { accountId: amount, ... }
  calculatedAt: timestamp('calculated_at').defaultNow(),
}, (table) => ({
  ruleIdIdx: index('allocation_results_rule_id_idx').on(table.ruleId),
  yearMonthIdx: index('allocation_results_year_month_idx').on(table.year, table.month),
  uniqueRuleYearMonth: unique('unique_rule_year_month').on(table.ruleId, table.year, table.month),
}));

export const insertAllocationResultSchema = createInsertSchema(allocationResults).omit({
  id: true,
  calculatedAt: true,
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

export * from './calendar.schema';
