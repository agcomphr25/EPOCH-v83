import { pgTable, text, serial, integer, timestamp, jsonb, boolean, json, real, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("EMPLOYEE"), // ADMIN, HR, MANAGER, EMPLOYEE
  canOverridePrices: boolean("can_override_prices").default(false),
  employeeId: integer("employee_id").references(() => employees.id),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  passwordChangedAt: timestamp("password_changed_at").defaultNow(),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  accountLockedUntil: timestamp("account_locked_until"),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// All finalized orders - production table
export const allOrders = pgTable("all_orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  customerId: text("customer_id"),
  customerPO: text("customer_po"),
  fbOrderNumber: text("fb_order_number"),
  agrOrderDetails: text("agr_order_details"),
  isFlattop: boolean("is_flattop").default(false),
  isCustomOrder: text("is_custom_order"), // "yes", "no", or null
  modelId: text("model_id"),
  handedness: text("handedness"),
  shankLength: text("shank_length"),
  features: jsonb("features"),
  featureQuantities: jsonb("feature_quantities"),
  discountCode: text("discount_code"),
  notes: text("notes"), // Order notes/special instructions
  customDiscountType: text("custom_discount_type").default("percent"),
  customDiscountValue: real("custom_discount_value").default(0),
  showCustomDiscount: boolean("show_custom_discount").default(false),
  priceOverride: real("price_override"), // Manual price override for stock model
  shipping: real("shipping").default(0),
  tikkaOption: text("tikka_option"),
  status: text("status").default("FINALIZED"),
  barcode: text("barcode").unique(), // Code 39 barcode for order identification
  // Department Progression Fields
  currentDepartment: text("current_department").default("Layup"),
  departmentHistory: jsonb("department_history").default('[]'),
  scrappedQuantity: integer("scrapped_quantity").default(0),
  totalProduced: integer("total_produced").default(0),
  // Department Completion Timestamps
  layupCompletedAt: timestamp("layup_completed_at"),
  pluggingCompletedAt: timestamp("plugging_completed_at"),
  cncCompletedAt: timestamp("cnc_completed_at"),
  finishCompletedAt: timestamp("finish_completed_at"),
  gunsmithCompletedAt: timestamp("gunsmith_completed_at"),
  paintCompletedAt: timestamp("paint_completed_at"),
  qcCompletedAt: timestamp("qc_completed_at"),
  shippingCompletedAt: timestamp("shipping_completed_at"),
  // Scrap Information
  scrapDate: timestamp("scrap_date"),
  scrapReason: text("scrap_reason"),
  scrapDisposition: text("scrap_disposition"),
  scrapAuthorization: text("scrap_authorization"),
  // Replacement Information
  isReplacement: boolean("is_replacement").default(false),
  replacedOrderId: text("replaced_order_id"),
  // Payment Information
  isPaid: boolean("is_paid").default(false),
  paymentType: text("payment_type"), // cash, credit, check, etc.
  paymentAmount: real("payment_amount"),
  paymentDate: timestamp("payment_date"),
  paymentTimestamp: timestamp("payment_timestamp"),
  // Shipping and Tracking Information
  trackingNumber: text("tracking_number"),
  shippingCarrier: text("shipping_carrier").default("UPS"),
  shippingMethod: text("shipping_method").default("Ground"),
  shippedDate: timestamp("shipped_date"),
  estimatedDelivery: timestamp("estimated_delivery"),
  shippingLabelGenerated: boolean("shipping_label_generated").default(false),
  customerNotified: boolean("customer_notified").default(false),
  notificationMethod: text("notification_method"), // email, sms, both
  notificationSentAt: timestamp("notification_sent_at"),
  deliveryConfirmed: boolean("delivery_confirmed").default(false),
  deliveryConfirmedAt: timestamp("delivery_confirmed_at"),
  // Cancellation Information
  isCancelled: boolean("is_cancelled").default(false),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  // Verification Information
  isVerified: boolean("is_verified").default(false),
  // Date Tracking Information  
  isManualDueDate: boolean("is_manual_due_date").default(false),
  isManualOrderDate: boolean("is_manual_order_date").default(false),
  // Alt Ship To Address Information
  hasAltShipTo: boolean("has_alt_ship_to").default(false),
  altShipToCustomerId: text("alt_ship_to_customer_id"), // Reference to existing customer
  altShipToName: text("alt_ship_to_name"), // Manual entry name
  altShipToCompany: text("alt_ship_to_company"), // Manual entry company
  altShipToEmail: text("alt_ship_to_email"), // Manual entry email
  altShipToPhone: text("alt_ship_to_phone"), // Manual entry phone
  altShipToAddress: jsonb("alt_ship_to_address"), // Manual entry address object
  // Special Shipping Instructions
  specialShippingInternational: boolean("special_shipping_international").default(false),
  specialShippingNextDayAir: boolean("special_shipping_next_day_air").default(false),
  specialShippingBillToReceiver: boolean("special_shipping_bill_to_receiver").default(false),
  // Technician Assignment
  assignedTechnician: text("assigned_technician"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Legacy orders table - keeping for compatibility
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
  date: timestamp("date").notNull(),
  orderDate: timestamp("order_date"),
  // Department progression fields
  currentDepartment: text("current_department").default("Layup").notNull(),
  isOnSchedule: boolean("is_on_schedule").default(true),
  priorityScore: integer("priority_score").default(50), // Lower = higher priority
  rushTier: text("rush_tier"), // e.g., "STANDARD", "RUSH", "EXPEDITE"
  poId: integer("po_id"), // Reference to purchase order
  itemId: text("item_id"), // Item identifier
  stockModelId: text("stock_model_id"), // Stock model reference
  customerId: text("customer_id"), // Customer identifier
  notes: text("notes"), // Order notes
  shippedAt: timestamp("shipped_at"), // Shipping timestamp
  dueDate: timestamp("due_date"),
  // Track department completion timestamps
  layupCompletedAt: timestamp("layup_completed_at"),
  pluggingCompletedAt: timestamp("plugging_completed_at"),
  cncCompletedAt: timestamp("cnc_completed_at"),
  finishCompletedAt: timestamp("finish_completed_at"),
  gunsmithCompletedAt: timestamp("gunsmith_completed_at"),
  paintCompletedAt: timestamp("paint_completed_at"),
  qcCompletedAt: timestamp("qc_completed_at"),
  shippingCompletedAt: timestamp("shipping_completed_at"),
  // Scrapping fields
  scrapDate: timestamp("scrap_date"),
  scrapReason: text("scrap_reason"),
  scrapDisposition: text("scrap_disposition"), // REPAIR, USE_AS_IS, SCRAP
  scrapAuthorization: text("scrap_authorization"), // CUSTOMER, AG, MATT, GLENN, LAURIE
  isReplacement: boolean("is_replacement").default(false),
  replacedOrderId: text("replaced_order_id"), // Reference to original order if this is a replacement
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dedicated cancelled orders table - stores archived cancelled orders
export const cancelledOrders = pgTable("cancelled_orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  customerId: text("customer_id"),
  customerPO: text("customer_po"),
  fbOrderNumber: text("fb_order_number"),
  agrOrderDetails: text("agr_order_details"),
  isFlattop: boolean("is_flattop").default(false),
  isCustomOrder: text("is_custom_order"), // "yes", "no", or null
  modelId: text("model_id"),
  handedness: text("handedness"),
  shankLength: text("shank_length"),
  features: jsonb("features"),
  featureQuantities: jsonb("feature_quantities"),
  discountCode: text("discount_code"),
  notes: text("notes"), // Order notes/special instructions
  customDiscountType: text("custom_discount_type").default("percent"),
  customDiscountValue: real("custom_discount_value").default(0),
  showCustomDiscount: boolean("show_custom_discount").default(false),
  priceOverride: real("price_override"), // Manual price override for stock model
  shipping: real("shipping").default(0),
  tikkaOption: text("tikka_option"),
  status: text("status").default("CANCELLED"),
  barcode: text("barcode"), // Code 39 barcode for order identification
  // Department Progression Fields at time of cancellation
  currentDepartment: text("current_department"),
  departmentHistory: jsonb("department_history").default('[]'),
  scrappedQuantity: integer("scrapped_quantity").default(0),
  totalProduced: integer("total_produced").default(0),
  // Payment Information at time of cancellation
  isPaid: boolean("is_paid").default(false),
  paymentType: text("payment_type"),
  paymentAmount: real("payment_amount"),
  paymentDate: timestamp("payment_date"),
  paymentTimestamp: timestamp("payment_timestamp"),
  // Cancellation Information
  cancelledAt: timestamp("cancelled_at").notNull(),
  cancelReason: text("cancel_reason").notNull(),
  cancelledBy: text("cancelled_by"), // User who cancelled the order
  // Original Order Information
  originalCreatedAt: timestamp("original_created_at"),
  originalUpdatedAt: timestamp("original_updated_at"),
  // Archive Information
  archivedAt: timestamp("archived_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const csvData = pgTable("csv_data", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  data: jsonb("data").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const customerTypes = pgTable("customer_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const persistentDiscounts = pgTable("persistent_discounts", {
  id: serial("id").primaryKey(),
  customerTypeId: integer("customer_type_id").references(() => customerTypes.id).notNull(),
  name: text("name").notNull(), // e.g., "GB-20", "GB-25", "GB-30", "MIL/LEO"
  percent: integer("percent"), // null for fixed amount discounts
  fixedAmount: integer("fixed_amount"), // amount in cents for fixed discounts like MIL/LEO
  description: text("description"), // Optional description for the discount tier
  appliesTo: text("applies_to").default("stock_model").notNull(), // "total" or "stock_model"
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const shortTermSales = pgTable("short_term_sales", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  percent: integer("percent").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  appliesTo: text("applies_to").default("total").notNull(), // "total" or "stock_model"
  isActive: integer("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const featureCategories = pgTable("feature_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const featureSubCategories = pgTable("feature_sub_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  categoryId: text("category_id").references(() => featureCategories.id),
  price: real("price").default(0),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const features = pgTable("features", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  type: text("type").notNull(), // 'dropdown', 'combobox', 'text', 'number', 'checkbox', 'textarea'
  required: boolean("required").default(false),
  placeholder: text("placeholder"),
  options: json("options"), // JSON array for dropdown options
  validation: json("validation"), // JSON object for validation rules
  category: text("category").references(() => featureCategories.id),
  subCategory: text("sub_category").references(() => featureSubCategories.id),
  price: real("price").default(0),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const stockModels = pgTable("stock_models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  price: real("price").notNull(),
  description: text("description"),
  handedness: text("handedness"), // "LH", "RH", null for ambidextrous
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer-specific pricing overrides (for future use)
export const customerStockModelPrices = pgTable("customer_stock_model_prices", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(), // Customer identifier
  stockModelId: text("stock_model_id").references(() => stockModels.id).notNull(),
  customPrice: real("custom_price").notNull(),
  notes: text("notes"), // Optional notes about why this customer has special pricing
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orderDrafts = pgTable("order_drafts", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  customerId: text("customer_id"),
  customerPO: text("customer_po"),
  fbOrderNumber: text("fb_order_number"),
  agrOrderDetails: text("agr_order_details"),
  isFlattop: boolean("is_flattop").default(false),
  isCustomOrder: text("is_custom_order"), // "yes", "no", or null
  modelId: text("model_id"),
  handedness: text("handedness"),
  shankLength: text("shank_length"),
  features: jsonb("features"),
  featureQuantities: jsonb("feature_quantities"),
  discountCode: text("discount_code"),
  notes: text("notes"), // Order notes/special instructions
  customDiscountType: text("custom_discount_type").default("percent"),
  customDiscountValue: real("custom_discount_value").default(0),
  showCustomDiscount: boolean("show_custom_discount").default(false),
  priceOverride: real("price_override"), // Manual price override for stock model
  shipping: real("shipping").default(0),
  tikkaOption: text("tikka_option"),
  status: text("status").default("DRAFT"),
  barcode: text("barcode").unique(), // Code 39 barcode for order identification
  // Department Progression Fields
  currentDepartment: text("current_department").default("Layup"),
  departmentHistory: jsonb("department_history").default('[]'),
  scrappedQuantity: integer("scrapped_quantity").default(0),
  totalProduced: integer("total_produced").default(0),
  // Department Completion Timestamps
  layupCompletedAt: timestamp("layup_completed_at"),
  pluggingCompletedAt: timestamp("plugging_completed_at"),
  cncCompletedAt: timestamp("cnc_completed_at"),
  finishCompletedAt: timestamp("finish_completed_at"),
  gunsmithCompletedAt: timestamp("gunsmith_completed_at"),
  paintCompletedAt: timestamp("paint_completed_at"),
  qcCompletedAt: timestamp("qc_completed_at"),
  shippingCompletedAt: timestamp("shipping_completed_at"),
  // Scrap Information
  scrapDate: timestamp("scrap_date"),
  scrapReason: text("scrap_reason"),
  scrapDisposition: text("scrap_disposition"),
  scrapAuthorization: text("scrap_authorization"),
  // Replacement Information
  isReplacement: boolean("is_replacement").default(false),
  replacedOrderId: text("replaced_order_id"),
  // Payment Information
  isPaid: boolean("is_paid").default(false),
  paymentType: text("payment_type"), // cash, credit, check, etc.
  paymentAmount: real("payment_amount"),
  paymentDate: timestamp("payment_date"),
  paymentTimestamp: timestamp("payment_timestamp"),
  // Shipping and Tracking Information
  trackingNumber: text("tracking_number"),
  shippingCarrier: text("shipping_carrier").default("UPS"),
  shippingMethod: text("shipping_method").default("Ground"),
  shippedDate: timestamp("shipped_date"),
  estimatedDelivery: timestamp("estimated_delivery"),
  shippingLabelGenerated: boolean("shipping_label_generated").default(false),
  customerNotified: boolean("customer_notified").default(false),
  notificationMethod: text("notification_method"), // email, sms, both
  notificationSentAt: timestamp("notification_sent_at"),
  deliveryConfirmed: boolean("delivery_confirmed").default(false),
  deliveryConfirmedAt: timestamp("delivery_confirmed_at"),
  // Verification Information
  isVerified: boolean("is_verified").default(false),
  // Date Tracking Information  
  isManualDueDate: boolean("is_manual_due_date").default(false),
  isManualOrderDate: boolean("is_manual_order_date").default(false),
  // Alt Ship To Address Information
  hasAltShipTo: boolean("has_alt_ship_to").default(false),
  altShipToCustomerId: text("alt_ship_to_customer_id"), // Reference to existing customer
  altShipToName: text("alt_ship_to_name"), // Manual entry name
  altShipToCompany: text("alt_ship_to_company"), // Manual entry company
  altShipToEmail: text("alt_ship_to_email"), // Manual entry email
  altShipToPhone: text("alt_ship_to_phone"), // Manual entry phone
  altShipToAddress: jsonb("alt_ship_to_address"), // Manual entry address object
  // Special Shipping Instructions
  specialShippingInternational: boolean("special_shipping_international").default(false),
  specialShippingNextDayAir: boolean("special_shipping_next_day_air").default(false),
  specialShippingBillToReceiver: boolean("special_shipping_bill_to_receiver").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table for multiple payments per order
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").references(() => orderDrafts.orderId).notNull(),
  paymentType: text("payment_type").notNull(), // credit_card, agr, check, cash, ach
  paymentAmount: real("payment_amount").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  notes: text("notes"), // Optional notes for the payment
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credit card transactions table for Authorize.Net integration
export const creditCardTransactions = pgTable("credit_card_transactions", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").references(() => payments.id).notNull(),
  orderId: text("order_id").notNull(),
  transactionId: text("transaction_id").notNull().unique(), // Authorize.Net transaction ID
  authCode: text("auth_code"), // Authorization code from Authorize.Net
  responseCode: text("response_code"), // 1 = Approved, 2 = Declined, 3 = Error, 4 = Held for Review (nullable for auth failures)
  responseReasonCode: text("response_reason_code"), // Detailed reason code
  responseReasonText: text("response_reason_text"), // Human readable response
  avsResult: text("avs_result"), // Address Verification Service result
  cvvResult: text("cvv_result"), // Card Verification Value result
  cardType: text("card_type"), // Visa, MasterCard, etc.
  lastFourDigits: text("last_four_digits"), // Last 4 digits of card number
  amount: real("amount").notNull(),
  taxAmount: real("tax_amount").default(0),
  shippingAmount: real("shipping_amount").default(0),
  customerEmail: text("customer_email"),
  billingFirstName: text("billing_first_name"),
  billingLastName: text("billing_last_name"),
  billingAddress: text("billing_address"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingZip: text("billing_zip"),
  billingCountry: text("billing_country").default("US"),
  isTest: boolean("is_test").default(false), // Track if this was a test transaction
  rawResponse: jsonb("raw_response"), // Store full Authorize.Net response for debugging
  status: text("status").default("pending"), // pending, completed, failed, refunded, voided
  refundedAmount: real("refunded_amount").default(0),
  voidedAt: timestamp("voided_at"),
  refundedAt: timestamp("refunded_at"),
  processedAt: timestamp("processed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Refund requests table for two-tiered refund system
export const refundRequests = pgTable("refund_requests", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(), // Reference to order
  refundType: text("refund_type"), // ORDER_TIME or POST_DELIVERY
  amount: real("amount"), // Alternative amount field
  reason: text("reason").notNull(), // Free-form reason for refund
  notes: text("notes"), // Additional notes
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, REJECTED, PROCESSED
  requestedBy: text("requested_by").notNull(), // CSR username who requested refund
  requestedAt: timestamp("requested_at").defaultNow(), // When request was made
  approvedBy: text("approved_by"), // Manager username who approved/rejected
  approvedAt: timestamp("approved_at"), // When approved/rejected
  processedBy: text("processed_by"), // Who processed the refund
  processedAt: timestamp("processed_at"), // When refund was processed
  transactionId: text("transaction_id"), // Transaction ID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  customerId: text("customer_id"), // Reference to customer (nullable for compatibility)
  refundAmount: real("refund_amount"), // Amount to be refunded
  rejectionReason: text("rejection_reason"), // Reason for rejection if applicable
  authNetTransactionId: text("auth_net_transaction_id"), // Authorize.Net refund transaction ID
  authNetRefundId: text("auth_net_refund_id"), // Authorize.Net refund reference
  originalTransactionId: text("original_transaction_id"), // Original transaction being refunded
});

export const forms = pgTable("forms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().default('[]'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => forms.id).notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory Management Tables
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  agPartNumber: text("ag_part_number").notNull().unique(), // AG Part#
  name: text("name").notNull(), // Name
  source: text("source"), // Source
  supplierPartNumber: text("supplier_part_number"), // Supplier Part #
  costPer: real("cost_per"), // Cost per
  orderDate: date("order_date"), // Order Date
  department: text("department"), // Dept.
  secondarySource: text("secondary_source"), // Secondary Source
  notes: text("notes"), // Notes
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ENHANCED INVENTORY SYSTEM - Completely Separate Tables
// =====================================================

export const enhancedInventoryItems = pgTable("enhanced_inventory_items", {
  id: serial("id").primaryKey(),
  agPartNumber: text("ag_part_number").notNull().unique(), // AG Part#
  name: text("name").notNull(), // Name
  source: text("source"), // Source
  supplierPartNumber: text("supplier_part_number"), // Supplier Part #
  costPer: real("cost_per"), // Cost per
  orderDate: date("order_date"), // Order Date
  department: text("department"), // Dept.
  secondarySource: text("secondary_source"), // Secondary Source
  notes: text("notes"), // Notes
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const enhancedInventoryBalances = pgTable('enhanced_inventory_balances', {
  id: serial('id').primaryKey(),
  partId: text('part_id').notNull().references(() => enhancedInventoryItems.agPartNumber),
  locationId: text('location_id').notNull().default('MAIN'), // MAIN, VENDOR_{vendor_id}, etc.
  
  // Quantity tracking
  onHandQty: real('on_hand_qty').notNull().default(0),
  committedQty: real('committed_qty').notNull().default(0), // Committed to customer orders
  allocatedQty: real('allocated_qty').notNull().default(0), // Allocated to production
  availableQty: real('available_qty').notNull().default(0), // Available = OnHand - Committed - Allocated
  
  // Cost tracking
  unitCost: real('unit_cost').notNull().default(0),
  totalValue: real('total_value').notNull().default(0),
  
  // Safety stock and ordering
  safetyStock: real('safety_stock').default(0),
  minOrderQty: real('min_order_qty').default(1),
  leadTimeDays: integer('lead_time_days').default(14),
  
  // Tracking
  lastTransactionAt: timestamp('last_transaction_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const enhancedInventoryTransactions = pgTable('enhanced_inventory_transactions', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id').notNull().unique(), // Auto-generated unique ID
  
  // Part and location
  partId: text('part_id').notNull().references(() => enhancedInventoryItems.agPartNumber),
  locationId: text('location_id').notNull().default('MAIN'),
  
  // Transaction details
  transactionType: text('transaction_type').notNull(), // 'RECEIPT', 'ISSUE', 'CONSUMPTION', 'ADJUSTMENT', 'SCRAP', etc.
  quantity: real('quantity').notNull(),
  unitCost: real('unit_cost').notNull().default(0),
  totalCost: real('total_cost').notNull().default(0),
  
  // Reference information
  orderId: text('order_id'), // Customer order reference
  bomId: text('bom_id'), // BOM reference for consumption tracking
  employeeId: text('employee_id'), // Who performed the transaction
  
  // Additional information
  notes: text('notes'),
  referenceNumber: text('reference_number'), // PO, RMA, etc.
  
  // Tracking
  transactionDate: timestamp('transaction_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventoryScans = pgTable("inventory_scans", {
  id: serial("id").primaryKey(),
  itemCode: text("item_code").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  expirationDate: date("expiration_date"),
  manufactureDate: date("manufacture_date"),
  lotNumber: text("lot_number"),
  batchNumber: text("batch_number"),
  aluminumHeatNumber: text("aluminum_heat_number"), // New field for P2 products
  barcode: text("barcode").unique(), // 39-line barcode for P2 products
  receivingDate: date("receiving_date"), // Date when received
  technicianId: text("technician_id"),
  scannedAt: timestamp("scanned_at").defaultNow(),
});

export const partsRequests = pgTable("parts_requests", {
  id: serial("id").primaryKey(),
  partNumber: text("part_number").notNull(),
  partName: text("part_name").notNull(),
  requestedBy: text("requested_by").notNull(),
  department: text("department"),
  quantity: integer("quantity").notNull(),
  urgency: text("urgency").notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  supplier: text("supplier"),
  estimatedCost: real("estimated_cost"),
  reason: text("reason"), // Why the part is needed
  status: text("status").default("PENDING").notNull(), // PENDING, APPROVED, ORDERED, RECEIVED, REJECTED
  requestDate: timestamp("request_date").defaultNow().notNull(),
  approvedBy: text("approved_by"),
  approvedDate: timestamp("approved_date"),
  orderDate: timestamp("order_date"),
  expectedDelivery: date("expected_delivery"),
  actualDelivery: date("actual_delivery"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enhanced Employee Management System
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").unique(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  role: text("role").notNull(),
  department: text("department"),
  hireDate: date("hire_date"),
  dateOfBirth: date("date_of_birth"),
  address: text("address"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  gateCardNumber: text("gate_card_number"),
  vehicleType: text("vehicle_type"),
  buildingKeyAccess: boolean("building_key_access").default(false),
  tciAccess: boolean("tci_access").default(false),
  employmentType: text("employment_type").default("FULL_TIME"), // FULL_TIME, PART_TIME, CONTRACT
  portalToken: text("portal_token").unique(), // UUID for employee portal access
  portalTokenExpiry: timestamp("portal_token_expiry"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee Certifications Management
export const certifications = pgTable("certifications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  issuingOrganization: text("issuing_organization"),
  validityPeriod: integer("validity_period"), // months
  category: text("category"), // SAFETY, TECHNICAL, REGULATORY, etc.
  requirements: text("requirements"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee-Certification Junction Table
export const employeeCertifications = pgTable("employee_certifications", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  certificationId: integer("certification_id").references(() => certifications.id).notNull(),
  dateObtained: date("date_obtained").notNull(),
  expiryDate: date("expiry_date"),
  certificateNumber: text("certificate_number"),
  documentUrl: text("document_url"), // Link to certificate document
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employee Evaluations
export const evaluations = pgTable("evaluations", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  evaluatorId: integer("evaluator_id").references(() => employees.id).notNull(),
  evaluationType: text("evaluation_type").notNull(), // ANNUAL, QUARTERLY, PROBATIONARY, PROJECT_BASED
  evaluationPeriodStart: date("evaluation_period_start").notNull(),
  evaluationPeriodEnd: date("evaluation_period_end").notNull(),
  overallRating: integer("overall_rating"), // 1-5 scale
  performanceGoals: jsonb("performance_goals"), // JSON array of goals
  achievements: text("achievements"),
  areasForImprovement: text("areas_for_improvement"),
  developmentPlan: text("development_plan"),
  comments: text("comments"),
  employeeComments: text("employee_comments"),
  status: text("status").default("DRAFT"), // DRAFT, SUBMITTED, REVIEWED, COMPLETED
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User Sessions for Authentication
export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  employeeId: integer("employee_id"),
  userType: text("user_type").notNull(), // ADMIN, EMPLOYEE, MANAGER
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document Storage for Employee Files
export const employeeDocuments = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  documentType: text("document_type").notNull(), // CERTIFICATE, HANDBOOK, CONTRACT, ID, etc.
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  filePath: text("file_path").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  isConfidential: boolean("is_confidential").default(false),
  tags: text("tags").array(), // Array of tags for organization
  description: text("description"),
  expiryDate: date("expiry_date"), // For documents that expire
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Trail for Employee Actions
export const employeeAuditLog = pgTable("employee_audit_log", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  action: text("action").notNull(), // LOGIN, LOGOUT, DOCUMENT_VIEW, DOCUMENT_UPLOAD, etc.
  resourceType: text("resource_type"), // DOCUMENT, EVALUATION, CERTIFICATION
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// QC and Preventive Maintenance Tables
export const qcDefinitions = pgTable("qc_definitions", {
  id: serial("id").primaryKey(),
  line: text("line").notNull(), // P1, P2
  department: text("department").notNull(),
  final: boolean("final").default(false),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(), // checkbox, number, text
  required: boolean("required").default(false),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const qcSubmissions = pgTable("qc_submissions", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  line: text("line").notNull(),
  department: text("department").notNull(),
  sku: text("sku").notNull(),
  final: boolean("final").default(false),
  data: jsonb("data").notNull(),
  signature: text("signature"), // base64 encoded signature
  summary: text("summary"), // PASS, FAIL
  status: text("status").default("pending"), // pending, completed
  dueDate: timestamp("due_date"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  submittedBy: text("submitted_by"),
});

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: serial("id").primaryKey(),
  equipment: text("equipment").notNull(),
  frequency: text("frequency").notNull(), // ANNUAL, SEMIANNUAL, QUARTERLY, BIWEEKLY
  startDate: timestamp("start_date").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const maintenanceLogs = pgTable("maintenance_logs", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").references(() => maintenanceSchedules.id).notNull(),
  completedAt: timestamp("completed_at").notNull(),
  completedBy: text("completed_by"),
  notes: text("notes"),
  nextDueDate: timestamp("next_due_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Employee Portal & Time Keeping Tables
export const timeClockEntries = pgTable("time_clock_entries", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  clockIn: timestamp("clock_in"),
  clockOut: timestamp("clock_out"),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  date: date("date").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull(), // "checkbox", "dropdown", "text"
  options: json("options"), // for dropdown options
  value: text("value"), // stored value
  required: boolean("required").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const onboardingDocs = pgTable("onboarding_docs", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(), // PDF URL
  signed: boolean("signed").default(false),
  signatureDataURL: text("signature_data_url"), // base64 signature image
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  failedLoginAttempts: true,
  accountLockedUntil: true,
  lockedUntil: true,
}).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
  employeeId: z.number().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  customer: z.string().min(1, "Customer is required"),
  product: z.string().min(1, "Product is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  status: z.string().min(1, "Status is required"),
  date: z.coerce.date(),
  currentDepartment: z.string().default("Layup"),
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

export const insertPersistentDiscountSchema = createInsertSchema(persistentDiscounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  percent: z.number().min(0).max(100).optional(),
  fixedAmount: z.number().min(0).optional(),
});

export const insertShortTermSaleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  percent: z.number().min(0).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.number().default(1),
});

export const insertCancelledOrderSchema = createInsertSchema(cancelledOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  orderDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  cancelledAt: z.coerce.date(),
  cancelReason: z.string().min(1, "Cancellation reason is required"),
});

export const insertFeatureCategorySchema = createInsertSchema(featureCategories).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(), // Allow client to provide ID or we'll generate one
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  sortOrder: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const insertFeatureSubCategorySchema = createInsertSchema(featureSubCategories).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(), // Allow client to provide ID or we'll generate one
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  categoryId: z.string().min(1, "Category is required"),
  price: z.number().min(0).default(0),
  sortOrder: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const insertFeatureSchema = createInsertSchema(features).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(), // Allow client to provide ID or we'll generate one
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  type: z.enum(['dropdown', 'text', 'number', 'checkbox', 'textarea', 'multiselect']),
  required: z.boolean().default(false),
  placeholder: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  price: z.number().min(0).default(0),
  sortOrder: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().optional(),
    price: z.number().optional(),
  })).optional().nullable(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional().nullable(),
});

export const insertStockModelSchema = createInsertSchema(stockModels).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(), // Allow client to provide ID or we'll generate one
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  price: z.number().min(0, "Price must be positive"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().min(0).default(0),
});

export const insertOrderDraftSchema = createInsertSchema(orderDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
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
  shipping: z.number().min(0).default(0),
  tikkaOption: z.string().optional().nullable(),
  status: z.string().default("DRAFT"),
  // Payment fields
  isPaid: z.boolean().default(false),
  paymentType: z.string().optional().nullable(),
  paymentAmount: z.number().min(0).optional().nullable(),
  paymentDate: z.coerce.date().optional().nullable(),
  paymentTimestamp: z.coerce.date().optional().nullable(),
  // Verification field
  isVerified: z.boolean().default(false),
});

export const insertAllOrderSchema = createInsertSchema(allOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
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
  shipping: z.number().min(0).default(0),
  tikkaOption: z.string().optional().nullable(),
  status: z.string().default("FINALIZED"),
  // Payment fields
  isPaid: z.boolean().default(false),
  paymentType: z.string().optional().nullable(),
  paymentAmount: z.number().min(0).optional().nullable(),
  paymentDate: z.coerce.date().optional().nullable(),
  paymentTimestamp: z.coerce.date().optional().nullable(),
  // Verification field
  isVerified: z.boolean().default(false),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  paymentType: z.enum(['credit_card', 'agr', 'check', 'cash', 'ach', 'aaaa']),
  paymentAmount: z.number().min(0.01, "Payment amount must be greater than 0"),
  paymentDate: z.coerce.date(),
  notes: z.string().optional().nullable(),
});

export const insertCreditCardTransactionSchema = createInsertSchema(creditCardTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  processedAt: true,
}).extend({
  paymentId: z.number().min(1, "Payment ID is required"),
  orderId: z.string().min(1, "Order ID is required"),
  transactionId: z.string().min(1, "Transaction ID is required"),
  responseCode: z.string().min(1, "Response code is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  customerEmail: z.string().email().optional().nullable(),
  billingFirstName: z.string().min(1, "First name is required"),
  billingLastName: z.string().min(1, "Last name is required"),
  billingAddress: z.string().min(1, "Address is required"),
  billingCity: z.string().min(1, "City is required"),
  billingState: z.string().min(1, "State is required"),
  billingZip: z.string().min(1, "ZIP code is required"),
});

export const insertFormSchema = createInsertSchema(forms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  fields: z.array(z.object({
    id: z.string().optional(),
    label: z.string().min(1, "Label is required"),
    key: z.string().min(1, "Key is required"),
    type: z.enum(['text', 'number', 'date', 'dropdown', 'autocomplete', 'textarea', 'checkbox']),
    required: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    options: z.array(z.string()).optional(),
  })).default([]),
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({
  id: true,
  createdAt: true,
}).extend({
  formId: z.number().min(1, "Form ID is required"),
  data: z.record(z.any()),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  agPartNumber: z.string().min(1, "AG Part# is required"),
  name: z.string().min(1, "Name is required"),
  source: z.string().optional().nullable(),
  supplierPartNumber: z.string().optional().nullable(),
  costPer: z.number().min(0).optional().nullable(),
  orderDate: z.coerce.date().optional().nullable(),
  department: z.string().optional().nullable(),
  secondarySource: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const insertInventoryScanSchema = createInsertSchema(inventoryScans).omit({
  id: true,
  scannedAt: true,
}).extend({
  itemCode: z.string().min(1, "Item code is required"),
  quantity: z.number().min(1, "Quantity must be at least 1").default(1),
  expirationDate: z.coerce.date().optional().nullable(),
  manufactureDate: z.coerce.date().optional().nullable(),
  lotNumber: z.string().optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  aluminumHeatNumber: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  receivingDate: z.coerce.date().optional().nullable(),
  technicianId: z.string().optional().nullable(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  portalToken: true,
  portalTokenExpiry: true,
}).extend({
  name: z.string().min(1, "Employee name is required"),
  email: z.string().email("Valid email is required").optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.string().min(1, "Employee role is required"),
  department: z.string().optional().nullable(),
  hireDate: z.coerce.date().optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  salary: z.number().min(0).optional().nullable(),
  hourlyRate: z.number().min(0).optional().nullable(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'),
  isActive: z.boolean().default(true),
});

// Certifications schemas
export const insertCertificationSchema = createInsertSchema(certifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Certification name is required"),
  description: z.string().optional().nullable(),
  issuingOrganization: z.string().optional().nullable(),
  validityPeriod: z.number().min(0).optional().nullable(),
  category: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const insertEmployeeCertificationSchema = createInsertSchema(employeeCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  employeeId: z.number().min(1, "Employee ID is required"),
  certificationId: z.number().min(1, "Certification ID is required"),
  dateObtained: z.coerce.date(),
  expiryDate: z.coerce.date().optional().nullable(),
  certificateNumber: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// Evaluations schemas
export const insertEvaluationSchema = createInsertSchema(evaluations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  reviewedAt: true,
}).extend({
  employeeId: z.number().min(1, "Employee ID is required"),
  evaluatorId: z.number().min(1, "Evaluator ID is required"),
  evaluationType: z.enum(['ANNUAL', 'QUARTERLY', 'PROBATIONARY', 'PROJECT_BASED']),
  evaluationPeriodStart: z.coerce.date(),
  evaluationPeriodEnd: z.coerce.date(),
  overallRating: z.number().min(1).max(5).optional().nullable(),
  performanceGoals: z.array(z.any()).optional().nullable(),
  achievements: z.string().optional().nullable(),
  areasForImprovement: z.string().optional().nullable(),
  developmentPlan: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  employeeComments: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'COMPLETED']).default('DRAFT'),
});

// User session schema
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
}).extend({
  userId: z.number().min(1, "User ID is required"),
  sessionToken: z.string().min(1, "Session token is required"),
  employeeId: z.number().optional().nullable(),
  userType: z.enum(['ADMIN', 'EMPLOYEE', 'MANAGER']),
  expiresAt: z.coerce.date(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// Employee documents schema
export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  employeeId: z.number().min(1, "Employee ID is required"),
  documentType: z.string().min(1, "Document type is required"),
  fileName: z.string().min(1, "File name is required"),
  originalFileName: z.string().min(1, "Original file name is required"),
  fileSize: z.number().min(0, "File size must be positive"),
  mimeType: z.string().min(1, "MIME type is required"),
  filePath: z.string().min(1, "File path is required"),
  uploadedBy: z.number().optional().nullable(),
  isConfidential: z.boolean().default(false),
  tags: z.array(z.string()).optional().nullable(),
  description: z.string().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});

// Audit log schema
export const insertEmployeeAuditLogSchema = createInsertSchema(employeeAuditLog).omit({
  id: true,
  timestamp: true,
}).extend({
  employeeId: z.number().min(1, "Employee ID is required"),
  action: z.string().min(1, "Action is required"),
  resourceType: z.string().optional().nullable(),
  resourceId: z.string().optional().nullable(),
  details: z.record(z.any()).optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
});

export const insertQcDefinitionSchema = createInsertSchema(qcDefinitions).omit({
  id: true,
  createdAt: true,
}).extend({
  line: z.enum(['P1', 'P2']),
  department: z.string().min(1, "Department is required"),
  final: z.boolean().default(false),
  key: z.string().min(1, "Key is required"),
  label: z.string().min(1, "Label is required"),
  type: z.enum(['checkbox', 'number', 'text']),
  required: z.boolean().default(false),
  sortOrder: z.number().default(0),
  isActive: z.boolean().default(true),
});

export const insertQcSubmissionSchema = createInsertSchema(qcSubmissions).omit({
  id: true,
  submittedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  line: z.enum(['P1', 'P2']),
  department: z.string().min(1, "Department is required"),
  sku: z.string().min(1, "SKU is required"),
  final: z.boolean().default(false),
  data: z.record(z.any()),
  signature: z.string().optional().nullable(),
  summary: z.enum(['PASS', 'FAIL']).optional().nullable(),
  status: z.string().default("pending"),
  dueDate: z.coerce.date().optional().nullable(),
  submittedBy: z.string().optional().nullable(),
});

export const insertMaintenanceScheduleSchema = createInsertSchema(maintenanceSchedules).omit({
  id: true,
  createdAt: true,
}).extend({
  equipment: z.string().min(1, "Equipment is required"),
  frequency: z.enum(['ANNUAL', 'SEMIANNUAL', 'QUARTERLY', 'BIWEEKLY']),
  startDate: z.coerce.date(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  scheduleId: z.number().positive("Schedule ID is required"),
  completedAt: z.coerce.date(),
  completedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextDueDate: z.coerce.date().optional().nullable(),
});

export const insertTimeClockEntrySchema = createInsertSchema(timeClockEntries).omit({
  id: true,
  createdAt: true,
}).extend({
  employeeId: z.string().min(1, "Employee ID is required"),
  clockIn: z.coerce.date().optional().nullable(),
  clockOut: z.coerce.date().optional().nullable(),
  date: z.coerce.date(),
});

export const insertChecklistItemSchema = createInsertSchema(checklistItems).omit({
  id: true,
  createdAt: true,
}).extend({
  employeeId: z.string().min(1, "Employee ID is required"),
  date: z.coerce.date(),
  label: z.string().min(1, "Label is required"),
  type: z.enum(['checkbox', 'dropdown', 'text']),
  options: z.array(z.string()).optional().nullable(),
  value: z.string().optional().nullable(),
  required: z.boolean().default(false),
});

export const insertOnboardingDocSchema = createInsertSchema(onboardingDocs).omit({
  id: true,
  createdAt: true,
  signedAt: true,
}).extend({
  employeeId: z.string().min(1, "Employee ID is required"),
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Must be a valid URL"),
  signed: z.boolean().default(false),
  signatureDataURL: z.string().optional().nullable(),
});

export const insertPartsRequestSchema = createInsertSchema(partsRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  requestDate: true,
}).extend({
  partNumber: z.string().min(1, "Part number is required"),
  partName: z.string().min(1, "Part name is required"),
  requestedBy: z.string().min(1, "Requested by is required"),
  department: z.string().optional().nullable(),
  quantity: z.number().positive("Quantity must be positive"),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  supplier: z.string().optional().nullable(),
  estimatedCost: z.number().min(0).optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'REJECTED']).default('PENDING'),
  approvedBy: z.string().optional().nullable(),
  approvedDate: z.coerce.date().optional().nullable(),
  orderDate: z.coerce.date().optional().nullable(),
  expectedDelivery: z.coerce.date().optional().nullable(),
  actualDelivery: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});



export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertCSVData = z.infer<typeof insertCSVDataSchema>;
export type CSVData = typeof csvData.$inferSelect;

export type InsertCustomerType = z.infer<typeof insertCustomerTypeSchema>;
export type CustomerType = typeof customerTypes.$inferSelect;
export type InsertPersistentDiscount = z.infer<typeof insertPersistentDiscountSchema>;
export type PersistentDiscount = typeof persistentDiscounts.$inferSelect;
export type InsertShortTermSale = z.infer<typeof insertShortTermSaleSchema>;
export type ShortTermSale = typeof shortTermSales.$inferSelect;
export type InsertFeatureCategory = z.infer<typeof insertFeatureCategorySchema>;
export type FeatureCategory = typeof featureCategories.$inferSelect;
export type InsertFeatureSubCategory = z.infer<typeof insertFeatureSubCategorySchema>;
export type FeatureSubCategory = typeof featureSubCategories.$inferSelect;
export type InsertFeature = z.infer<typeof insertFeatureSchema>;
export type Feature = typeof features.$inferSelect;
export type InsertStockModel = z.infer<typeof insertStockModelSchema>;
export type StockModel = typeof stockModels.$inferSelect;
export type InsertOrderDraft = z.infer<typeof insertOrderDraftSchema>;
export type OrderDraft = typeof orderDrafts.$inferSelect;
export type InsertAllOrder = z.infer<typeof insertAllOrderSchema>;
export type AllOrder = typeof allOrders.$inferSelect;
export type InsertCancelledOrder = z.infer<typeof insertCancelledOrderSchema>;
export type CancelledOrder = typeof cancelledOrders.$inferSelect;
export type InsertForm = z.infer<typeof insertFormSchema>;
export type Form = typeof forms.$inferSelect;
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryScan = z.infer<typeof insertInventoryScanSchema>;
export type InventoryScan = typeof inventoryScans.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// New employee-related types
export type InsertCertification = z.infer<typeof insertCertificationSchema>;
export type Certification = typeof certifications.$inferSelect;
export type InsertEmployeeCertification = z.infer<typeof insertEmployeeCertificationSchema>;
export type EmployeeCertification = typeof employeeCertifications.$inferSelect;
export type InsertEvaluation = z.infer<typeof insertEvaluationSchema>;
export type Evaluation = typeof evaluations.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeAuditLog = z.infer<typeof insertEmployeeAuditLogSchema>;
export type EmployeeAuditLog = typeof employeeAuditLog.$inferSelect;
export type InsertQcDefinition = z.infer<typeof insertQcDefinitionSchema>;
export type QcDefinition = typeof qcDefinitions.$inferSelect;
export type InsertQcSubmission = z.infer<typeof insertQcSubmissionSchema>;
export type QcSubmission = typeof qcSubmissions.$inferSelect;
export type InsertMaintenanceSchedule = z.infer<typeof insertMaintenanceScheduleSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type InsertTimeClockEntry = z.infer<typeof insertTimeClockEntrySchema>;
export type TimeClockEntry = typeof timeClockEntries.$inferSelect;
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type InsertOnboardingDoc = z.infer<typeof insertOnboardingDocSchema>;
export type OnboardingDoc = typeof onboardingDocs.$inferSelect;
export type InsertPartsRequest = z.infer<typeof insertPartsRequestSchema>;
export type PartsRequest = typeof partsRequests.$inferSelect;

// Purchase Review Checklist Table
export const purchaseReviewChecklists = pgTable("purchase_review_checklists", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id"),
  formData: jsonb("form_data").notNull(),
  createdBy: text("created_by"),
  status: text("status").default("DRAFT").notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseReviewChecklistSchema = createInsertSchema(purchaseReviewChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerId: z.string().optional().nullable(),
  formData: z.record(z.any()),
  createdBy: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).default('DRAFT'),
});

export type InsertPurchaseReviewChecklist = z.infer<typeof insertPurchaseReviewChecklistSchema>;
export type PurchaseReviewChecklist = typeof purchaseReviewChecklists.$inferSelect;

// Manufacturer's Certificate of Conformance Table
export const manufacturersCertificates = pgTable("manufacturers_certificates", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  customerAddress: text("customer_address"),
  poNumber: text("po_number"),
  partNumber: text("part_number"),
  lotNumber: text("lot_number"),
  formData: jsonb("form_data").notNull(),
  createdBy: text("created_by"),
  status: text("status").default("DRAFT").notNull(), // DRAFT, SUBMITTED, APPROVED, REJECTED
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertManufacturersCertificateSchema = createInsertSchema(manufacturersCertificates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerAddress: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  partNumber: z.string().optional().nullable(),
  lotNumber: z.string().optional().nullable(),
  formData: z.record(z.any()),
  createdBy: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).default('DRAFT'),
});

export type InsertManufacturersCertificate = z.infer<typeof insertManufacturersCertificateSchema>;
export type ManufacturersCertificate = typeof manufacturersCertificates.$inferSelect;

// Layup Scheduler Tables
export const molds = pgTable("molds", {
  id: serial("id").primaryKey(),
  moldId: text("mold_id").notNull().unique(),
  modelName: text("model_name").notNull(),
  stockModels: text("stock_models").array().default([]), // Array of associated stock model IDs
  instanceNumber: integer("instance_number").notNull(),
  enabled: boolean("enabled").default(true),
  multiplier: integer("multiplier").default(1).notNull(), // Daily capacity multiplier
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeLayupSettings = pgTable("employee_layup_settings", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").references(() => employees.employeeCode).notNull(),
  rate: real("rate").default(1).notNull(), // Molds per hour
  hours: real("hours").default(8).notNull(), // Working hours per day
  department: text("department").default("Layup").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productionQueue = pgTable("production_queue", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  priorityScore: integer("priority_score").notNull(), // Lower numbers = higher priority
  department: text("department").default("Layup").notNull(),
  status: text("status").default("FINALIZED").notNull(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  // LOP Adjustment fields
  needsLOPAdjustment: boolean("needs_lop_adjustment").default(false),
  priority: integer("priority").default(50), // 1-100 priority level
  priorityChangedAt: timestamp("priority_changed_at"),
  lastScheduledLOPAdjustmentDate: timestamp("last_scheduled_lop_adjustment_date"),
  scheduledLOPAdjustmentDate: timestamp("scheduled_lop_adjustment_date"),
  lopAdjustmentOverrideReason: text("lop_adjustment_override_reason"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const layupSchedule = pgTable("layup_schedule", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").references(() => productionQueue.orderId).notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  moldId: text("mold_id").references(() => molds.moldId).notNull(),
  employeeAssignments: jsonb("employee_assignments").notNull().default('[]'), // Array of {employeeId, workload}
  isOverride: boolean("is_override").default(false), // Manual override flag
  overriddenAt: timestamp("overridden_at"),
  overriddenBy: text("overridden_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for Layup Scheduler
export const insertMoldSchema = createInsertSchema(molds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  moldId: z.string().min(1, "Mold ID is required"),
  modelName: z.string().min(1, "Model name is required"),
  instanceNumber: z.number().min(1, "Instance number must be positive"),
  enabled: z.boolean().default(true),
  multiplier: z.number().min(1, "Multiplier must be at least 1"),
  isActive: z.boolean().default(true),
});

export const insertEmployeeLayupSettingsSchema = createInsertSchema(employeeLayupSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  employeeId: z.string().min(1, "Employee ID is required"),
  rate: z.number().min(0, "Rate must be positive"),
  hours: z.number().min(0, "Hours must be positive"),
  department: z.string().default("Layup"),
  isActive: z.boolean().default(true),
});

export const insertProductionQueueSchema = createInsertSchema(productionQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  orderDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  priorityScore: z.number().min(1, "Priority score must be positive"),
  department: z.string().default("Layup"),
  status: z.string().default("FINALIZED"),
  customer: z.string().min(1, "Customer is required"),
  product: z.string().min(1, "Product is required"),
  // LOP Adjustment fields
  needsLOPAdjustment: z.boolean().default(false),
  priority: z.number().min(1).max(100).default(50),
  priorityChangedAt: z.coerce.date().optional().nullable(),
  lastScheduledLOPAdjustmentDate: z.coerce.date().optional().nullable(),
  scheduledLOPAdjustmentDate: z.coerce.date().optional().nullable(),
  lopAdjustmentOverrideReason: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const insertLayupScheduleSchema = createInsertSchema(layupSchedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  scheduledDate: z.coerce.date(),
  moldId: z.string().min(1, "Mold ID is required"),
  employeeAssignments: z.array(z.object({
    employeeId: z.string(),
    workload: z.number().min(0),
  })).default([]),
  isOverride: z.boolean().default(false),
  overriddenBy: z.string().optional().nullable(),
});

// Type exports for Layup Scheduler
export type InsertMold = z.infer<typeof insertMoldSchema>;
export type Mold = typeof molds.$inferSelect;
export type InsertEmployeeLayupSettings = z.infer<typeof insertEmployeeLayupSettingsSchema>;
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerAddresses = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  street: text("street").notNull(),
  street2: text("street2"), // Suite, Apt, Unit number
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  country: text("country").notNull().default("United States"),
  type: text("type").notNull().default("shipping"), // shipping, billing, both
  isDefault: boolean("is_default").default(false),
  isValidated: boolean("is_validated").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const communicationLogs = pgTable("communication_logs", {
  id: serial("id").primaryKey(),
  orderId: text("order_id"), // Made nullable for general communications
  customerId: text("customer_id").notNull(),
  type: text("type").notNull(), // order-confirmation, shipping-notification, quality-alert
  method: text("method").notNull(), // email, sms
  recipient: text("recipient").notNull(), // email address or phone number
  sender: text("sender"), // sender email/phone for inbound messages
  subject: text("subject"),
  message: text("message"),
  status: text("status").notNull().default("pending"), // pending, sent, failed, received
  error: text("error"),
  direction: text("direction").default("outbound"), // inbound, outbound
  externalId: text("external_id"), // External message ID from Twilio/SendGrid
  isRead: boolean("is_read").default(false), // Whether message has been read
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"), // For inbound messages
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// New table for customer communications to record both incoming and outgoing messages
export const customerCommunications = pgTable("customer_communications", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  communicationLogId: integer("communication_log_id").references(() => communicationLogs.id), // Link to the actual log entry
  threadId: text("thread_id"), // For grouping related messages
  direction: text("direction").notNull(), // 'inbound' or 'outbound'
  type: text("type").notNull(), // e.g., 'inquiry', 'response', 'support-ticket', 'feedback'
  subject: text("subject"),
  message: text("message").notNull(),
  priority: text("priority").default("normal").notNull(), // 'low', 'normal', 'high', 'urgent'
  assignedTo: text("assigned_to"), // User responsible for handling the communication
  status: text("status").default("open").notNull(), // 'open', 'in-progress', 'resolved', 'closed'
  externalId: text("external_id"), // ID from external communication system (e.g., email thread ID)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export const pdfDocuments = pgTable("pdf_documents", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  type: text("type").notNull(), // order-confirmation, packing-slip, invoice
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  size: integer("size").notNull(),
  path: text("path").notNull(), // file storage path
  isGenerated: boolean("is_generated").default(false),
  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for Module 8
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Customer name is required"),
  email: z.string().optional().transform((val) => val === "" ? undefined : val).refine(
    (email) => !email || z.string().email().safeParse(email).success,
    { message: "Invalid email format" }
  ),
  phone: z.string().optional(),
  company: z.string().optional(),
  customerType: z.string().default("standard"),
  preferredCommunicationMethod: z.array(z.enum(["email", "sms"])).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Order Attachments Table
export const orderAttachments = pgTable("order_attachments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(), // References orders.id
  fileName: text("file_name").notNull(), // Stored filename (unique)
  originalFileName: text("original_file_name").notNull(), // User's original filename
  fileSize: integer("file_size").notNull(), // File size in bytes
  mimeType: text("mime_type").notNull(), // MIME type (image/jpeg, application/pdf, etc.)
  filePath: text("file_path").notNull(), // Full path to file
  uploadedBy: text("uploaded_by"), // User who uploaded (optional for now)
  notes: text("notes"), // Optional notes about the attachment
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderAttachmentSchema = createInsertSchema(orderAttachments).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderAttachment = z.infer<typeof insertOrderAttachmentSchema>;
export type OrderAttachment = typeof orderAttachments.$inferSelect;

export const insertCustomerAddressSchema = createInsertSchema(customerAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerId: z.string().min(1, "Customer ID is required"),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "ZIP code is required"),
  country: z.string().min(1, "Country is required"),
  type: z.enum(['shipping', 'billing', 'both']).default('shipping'),
  isDefault: z.boolean().default(false),
});

export const insertCommunicationLogSchema = createInsertSchema(communicationLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  orderId: z.string().optional(),
  customerId: z.string().min(1, "Customer ID is required"),
  type: z.enum(['order-confirmation', 'shipping-notification', 'quality-alert', 'customer-inquiry', 'customer-response', 'general']),
  method: z.enum(['email', 'sms']),
  direction: z.enum(['inbound', 'outbound']),
  recipient: z.string().min(1, "Recipient is required"),
  sender: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1, "Message is required"),
  status: z.enum(['pending', 'sent', 'failed', 'received']).default('pending'),
  externalId: z.string().optional(),
});

export const insertPdfDocumentSchema = createInsertSchema(pdfDocuments).omit({
  id: true,
  createdAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  type: z.enum(['order-confirmation', 'packing-slip', 'invoice']),
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().default("application/pdf"),
  size: z.number().min(0),
  path: z.string().min(1, "Path is required"),
});

// Nonconformance Tracking - Module 17
export const nonconformanceRecords = pgTable("nonconformance_records", {
  id: serial("id").primaryKey(),
  orderId: text("order_id"),
  serialNumber: text("serial_number"),
  customerName: text("customer_name"),
  poNumber: text("po_number"),
  stockModel: text("stock_model"),
  quantity: integer("quantity").default(1),
  issueCause: text("issue_cause").notNull(),
  manufacturerDefect: boolean("manufacturer_defect").default(false),
  disposition: text("disposition").notNull(),
  authorization: text("auth_person").notNull(),
  dispositionDate: date("disposition_date").notNull(),
  notes: text("notes"),
  status: text("status").default("Open"), // Open, Resolved
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNonconformanceRecordSchema = createInsertSchema(nonconformanceRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().optional(),
  serialNumber: z.string().optional(),
  customerName: z.string().optional(),
  poNumber: z.string().optional(),
  stockModel: z.string().optional(),
  quantity: z.number().min(1).default(1),
  issueCause: z.string().min(1, "Issue cause is required"),
  manufacturerDefect: z.boolean().default(false),
  disposition: z.string().min(1, "Disposition is required"),
  authorization: z.string().min(1, "Authorization is required"),
  dispositionDate: z.string().min(1, "Disposition date is required"),
  notes: z.string().optional(),
  status: z.enum(['Open', 'Resolved']).default('Open'),
});

// Types for Module 8
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type InsertCommunicationLog = z.infer<typeof insertCommunicationLogSchema>;
export type CommunicationLog = typeof communicationLogs.$inferSelect;

// Types for Module 17 - Nonconformance
export type InsertNonconformanceRecord = z.infer<typeof insertNonconformanceRecordSchema>;
export type NonconformanceRecord = typeof nonconformanceRecords.$inferSelect;
export type InsertPdfDocument = z.infer<typeof insertPdfDocumentSchema>;
export type PdfDocument = typeof pdfDocuments.$inferSelect;

// Enhanced Forms Schema
export const enhancedFormCategories = pgTable('enhanced_form_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const enhancedForms = pgTable('enhanced_forms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => enhancedFormCategories.id),
  tableName: text('table_name'),
  layout: jsonb('layout').notNull(),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const enhancedFormVersions = pgTable('enhanced_form_versions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id').references(() => enhancedForms.id).notNull(),
  version: integer('version').notNull(),
  layout: jsonb('layout').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const enhancedFormSubmissions = pgTable('enhanced_form_submissions', {
  id: serial('id').primaryKey(),
  formId: integer('form_id').references(() => enhancedForms.id).notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
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
  updatedAt: timestamp('updated_at').defaultNow()
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id').references(() => purchaseOrders.id).notNull(),
  itemType: text('item_type').notNull(), // 'stock_model', 'custom_model', 'feature_item'
  itemId: text('item_id').notNull(), // References stockModels.id, features.id, or custom identifier
  itemName: text('item_name').notNull(), // Display name for the item
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').default(0), // Price per unit
  totalPrice: real('total_price').default(0), // quantity * unitPrice
  specifications: jsonb('specifications'), // Custom specifications for custom models
  notes: text('notes'),
  orderCount: integer('order_count').default(0), // Number of orders generated from this item
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// P2 Customer Management - separate customer database for P2 operations
export const p2Customers = pgTable('p2_customers', {
  id: serial('id').primaryKey(),
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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// P2 Purchase Order Management Tables
export const p2PurchaseOrders = pgTable('p2_purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  customerId: text('customer_id').references(() => p2Customers.customerId).notNull(),
  customerName: text('customer_name').notNull(), // Denormalized for performance
  poDate: date('po_date').notNull(),
  expectedDelivery: date('expected_delivery').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, CANCELED
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const p2PurchaseOrderItems = pgTable('p2_purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id').references(() => p2PurchaseOrders.id).notNull(),
  partNumber: text('part_number').notNull(), // P2-specific part number
  partName: text('part_name').notNull(), // Display name for the part
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').default(0), // Price per unit
  totalPrice: real('total_price').default(0), // quantity * unitPrice
  dueDate: date('due_date'), // Due date for this item
  p2ProductId: integer('p2_product_id').references(() => poProducts.id), // Optional P2 product reference
  specifications: text('specifications'), // Part specifications
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Production Orders - separate from regular orders for PO tracking
export const productionOrders = pgTable('production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(), // Customer-based format: ABC00199-0001
  poId: integer('po_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  poItemId: integer('po_item_id').references(() => purchaseOrderItems.id, { onDelete: 'cascade' }).notNull(),
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
  laidUpAt: timestamp('laid_up_at'),
  shippedAt: timestamp('shipped_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Enhanced Form Insert Schemas
export const insertEnhancedFormCategorySchema = createInsertSchema(enhancedFormCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Category name is required"),
  description: z.string().optional(),
});

export const insertEnhancedFormSchema = createInsertSchema(enhancedForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Form name is required"),
  description: z.string().optional(),
  categoryId: z.number().optional(),
  tableName: z.string().optional(),
  layout: z.any(),
  version: z.number().default(1),
});

export const insertEnhancedFormVersionSchema = createInsertSchema(enhancedFormVersions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  formId: z.number().min(1, "Form ID is required"),
  version: z.number().min(1, "Version is required"),
  layout: z.any(),
});

export const insertEnhancedFormSubmissionSchema = createInsertSchema(enhancedFormSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  formId: z.number().min(1, "Form ID is required"),
  data: z.any(),
});

// Purchase Order Insert Schemas
export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  poNumber: z.string().min(1, "PO Number is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  itemType: z.enum(['single', 'multiple']).default('single'),
  poDate: z.coerce.date(),
  expectedDelivery: z.coerce.date(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).default('OPEN'),
  notes: z.string().optional().nullable(),
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  poId: z.number().min(1, "PO ID is required"),
  itemType: z.enum(['stock_model', 'custom_model', 'feature_item']),
  itemId: z.string().min(1, "Item ID is required"),
  itemName: z.string().min(1, "Item Name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0).default(0),
  totalPrice: z.number().min(0).default(0),
  specifications: z.any().optional().nullable(),
  notes: z.string().optional().nullable(),
  orderCount: z.number().min(0).default(0),
});

// P2 Customer Insert Schema
export const insertP2CustomerSchema = createInsertSchema(p2Customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  shipToAddress: z.string().optional().nullable(),
  paymentTerms: z.string().default('NET_30'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  notes: z.string().optional().nullable(),
});

// P2 Purchase Order Insert Schemas
export const insertP2PurchaseOrderSchema = createInsertSchema(p2PurchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  poNumber: z.string().min(1, "PO Number is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  poDate: z.coerce.date(),
  expectedDelivery: z.coerce.date(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).default('OPEN'),
  notes: z.string().optional().nullable(),
});

export const insertP2PurchaseOrderItemSchema = createInsertSchema(p2PurchaseOrderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  poId: z.number().min(1, "PO ID is required"),
  partNumber: z.string().min(1, "Part Number is required"),
  partName: z.string().min(1, "Part Name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0).default(0),
  totalPrice: z.number().min(0).default(0),
  dueDate: z.string().optional().nullable(),
  p2ProductId: z.number().optional().nullable(),
  specifications: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Production Order Schema
export const insertProductionOrderSchema = createInsertSchema(productionOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  poId: z.number().min(1, "PO ID is required"),
  poItemId: z.number().min(1, "PO Item ID is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  poNumber: z.string().min(1, "PO Number is required"),
  itemType: z.enum(['stock_model', 'custom_model', 'feature_item']),
  itemId: z.string().min(1, "Item ID is required"),
  itemName: z.string().min(1, "Item Name is required"),
  specifications: z.any().optional().nullable(),
  orderDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  productionStatus: z.enum(['PENDING', 'LAID_UP', 'SHIPPED']).default('PENDING'),
  laidUpAt: z.coerce.date().optional().nullable(),
  shippedAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Enhanced Form Types
export type InsertEnhancedFormCategory = z.infer<typeof insertEnhancedFormCategorySchema>;
export type EnhancedFormCategory = typeof enhancedFormCategories.$inferSelect;
export type InsertEnhancedForm = z.infer<typeof insertEnhancedFormSchema>;
export type EnhancedForm = typeof enhancedForms.$inferSelect;
export type InsertEnhancedFormVersion = z.infer<typeof insertEnhancedFormVersionSchema>;
export type EnhancedFormVersion = typeof enhancedFormVersions.$inferSelect;
export type InsertEnhancedFormSubmission = z.infer<typeof insertEnhancedFormSubmissionSchema>;
export type EnhancedFormSubmission = typeof enhancedFormSubmissions.$inferSelect;

// Purchase Order Types
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

// P2 Purchase Order Types
export type InsertP2Customer = z.infer<typeof insertP2CustomerSchema>;
export type P2Customer = typeof p2Customers.$inferSelect;
export type InsertP2PurchaseOrder = z.infer<typeof insertP2PurchaseOrderSchema>;
export type P2PurchaseOrder = typeof p2PurchaseOrders.$inferSelect;
export type InsertP2PurchaseOrderItem = z.infer<typeof insertP2PurchaseOrderItemSchema>;
export type P2PurchaseOrderItem = typeof p2PurchaseOrderItems.$inferSelect;

// Production Order Types
export type InsertProductionOrder = z.infer<typeof insertProductionOrderSchema>;
export type ProductionOrder = typeof productionOrders.$inferSelect;

export const orderStatusEnum = pgEnum('order_status', ['DRAFT', 'CONFIRMED', 'FINALIZED', 'CANCELLED', 'RESERVED']);

// BOM (Bill of Materials) Management Tables for P2
export const bomDefinitions = pgTable('bom_definitions', {
  id: serial('id').primaryKey(),
  sku: text('sku'),
  modelName: text('model_name').notNull(),
  revision: text('revision').notNull().default('A'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const bomItems = pgTable('bom_items', {
  id: serial('id').primaryKey(),
  bomId: integer('bom_id').references(() => bomDefinitions.id).notNull(),
  partName: text('part_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  firstDept: text('first_dept').notNull().default('Layup'),
  itemType: text('item_type').notNull().default('manufactured'), // 'manufactured', 'material', or 'sub_assembly'
  // Multi-Level Hierarchy Support
  referenceBomId: integer('reference_bom_id').references(() => bomDefinitions.id), // Points to another BOM if this item is a sub-assembly
  assemblyLevel: integer('assembly_level').default(0), // 0=top level, 1=sub-assembly, 2=component, etc.
  // Component Library Support
  quantityMultiplier: real('quantity_multiplier').default(1), // Multiplies quantities when used as sub-assembly
  notes: text('notes'), // Manufacturing notes or special instructions
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas for BOM
export const insertBomDefinitionSchema = createInsertSchema(bomDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  sku: z.string().optional(),
  modelName: z.string().min(1, "Model name is required"),
  revision: z.string().min(1, "Revision is required").default('A'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const insertBomItemSchema = createInsertSchema(bomItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  bomId: z.number().min(1, "BOM ID is required"),
  partName: z.string().min(1, "Part name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1").default(1),
  firstDept: z.enum(['Layup', 'Assembly/Disassembly', 'Finish', 'Paint', 'QC', 'Shipping']).default('Layup'),
  itemType: z.enum(['manufactured', 'material', 'sub_assembly']).default('manufactured'),
  referenceBomId: z.number().optional(), // Optional reference to another BOM
  assemblyLevel: z.number().default(0),
  quantityMultiplier: z.number().min(0.001, "Quantity multiplier must be greater than 0").default(1),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

// BOM Types
export type InsertBomDefinition = z.infer<typeof insertBomDefinitionSchema>;
export type BomDefinition = typeof bomDefinitions.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
export type BomItem = typeof bomItems.$inferSelect;

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

export const insertOrderIdReservationSchema = createInsertSchema(orderIdReservations).omit({
  id: true,
  createdAt: true,
});

export type InsertOrderIdReservation = z.infer<typeof insertOrderIdReservationSchema>;
export type OrderIdReservation = typeof orderIdReservations.$inferSelect;

// P2 Production Orders - Generated from P2 Purchase Orders based on BOM
export const p2ProductionOrders = pgTable('p2_production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull().unique(), // P2-PO123-001, P2-PO123-002, etc.
  p2PoId: integer('p2_po_id').references(() => p2PurchaseOrders.id).notNull(),
  p2PoItemId: integer('p2_po_item_id').references(() => p2PurchaseOrderItems.id).notNull(),
  bomDefinitionId: integer('bom_definition_id').references(() => bomDefinitions.id).notNull(),
  bomItemId: integer('bom_item_id').references(() => bomItems.id).notNull(),
  sku: text('sku').notNull(), // From BOM definition
  partName: text('part_name').notNull(), // From BOM item
  quantity: integer('quantity').notNull(), // BOM item quantity * PO quantity
  department: text('department').notNull(), // From BOM item firstDept
  status: text('status').default('PENDING').notNull(), // PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  priority: integer('priority').default(50), // 1-100, lower = higher priority
  dueDate: timestamp('due_date'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertP2ProductionOrderSchema = createInsertSchema(p2ProductionOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  p2PoId: z.number().min(1, "P2 PO ID is required"),
  p2PoItemId: z.number().min(1, "P2 PO Item ID is required"),
  bomDefinitionId: z.number().min(1, "BOM Definition ID is required"),
  bomItemId: z.number().min(1, "BOM Item ID is required"),
  sku: z.string().min(1, "SKU is required"),
  partName: z.string().min(1, "Part name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  department: z.enum(['Layup', 'Assembly/Disassembly', 'Finish', 'Paint', 'QC', 'Shipping']),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  priority: z.number().min(1).max(100).default(50),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type InsertP2ProductionOrder = z.infer<typeof insertP2ProductionOrderSchema>;
export type P2ProductionOrder = typeof p2ProductionOrders.$inferSelect;

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

export const insertTaskItemSchema = createInsertSchema(taskItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "Title is required").max(255, "Title must be less than 255 characters"),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional(),
  category: z.string().max(100, "Category must be less than 100 characters").optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  dueDate: z.string().datetime().optional(),
  assignedTo: z.string().max(100, "Assigned to must be less than 100 characters").optional(),
  createdBy: z.string().min(1, "Created by is required").max(100, "Created by must be less than 100 characters"),
  notes: z.string().max(2000, "Notes must be less than 2000 characters").optional(),
});

export type InsertTaskItem = z.infer<typeof insertTaskItemSchema>;
export type TaskItem = typeof taskItems.$inferSelect;

// Kickback Tracking Table
export const kickbacks = pgTable("kickbacks", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  kickbackDept: text("kickback_dept").notNull(), // Department where kickback occurred
  reasonCode: text("reason_code").notNull(), // MATERIAL_DEFECT, OPERATOR_ERROR, MACHINE_FAILURE, etc.
  reasonText: text("reason_text"), // Detailed description
  kickbackDate: timestamp("kickback_date").notNull(),
  reportedBy: text("reported_by").notNull(), // User who reported the kickback
  resolvedAt: timestamp("resolved_at"), // When the kickback was resolved
  resolvedBy: text("resolved_by"), // User who resolved the kickback
  resolutionNotes: text("resolution_notes"), // Notes about the resolution
  status: text("status").default("OPEN").notNull(), // OPEN, IN_PROGRESS, RESOLVED, CLOSED
  priority: text("priority").default("MEDIUM").notNull(), // LOW, MEDIUM, HIGH, CRITICAL
  impactedDepartments: text("impacted_departments").array().default(["?"]), // Other departments affected
  rootCause: text("root_cause"), // Identified root cause
  correctiveAction: text("corrective_action"), // Actions taken to prevent recurrence
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKickbackSchema = createInsertSchema(kickbacks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  kickbackDept: z.enum(['CNC', 'Finish', 'Gunsmith', 'Paint']),
  reasonCode: z.enum(['MATERIAL_DEFECT', 'OPERATOR_ERROR', 'MACHINE_FAILURE', 'DESIGN_ISSUE', 'QUALITY_ISSUE', 'PROCESS_ISSUE', 'SUPPLIER_ISSUE', 'OTHER']),
  reasonText: z.string().optional().nullable(),
  kickbackDate: z.coerce.date(),
  reportedBy: z.string().min(1, "Reporter is required"),
  resolvedAt: z.coerce.date().optional().nullable(),
  resolvedBy: z.string().optional().nullable(),
  resolutionNotes: z.string().optional().nullable(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).default('OPEN'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  impactedDepartments: z.array(z.string()).default([]),
  rootCause: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
});

export type InsertKickback = z.infer<typeof insertKickbackSchema>;
export type Kickback = typeof kickbacks.$inferSelect;

// Document Management System Tables
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  documentType: text("document_type").notNull(), // 'RFQ', 'QUOTE', 'PO', 'PACKING_SLIP', 'RISK_ASSESSMENT', 'FORM_SUBMISSION'
  uploadDate: timestamp("upload_date").defaultNow(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentTags = pgTable("document_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"), // 'project', 'customer', 'po_number', 'status', 'document_type'
  color: text("color").default("#3B82F6"), // Hex color for UI
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const documentTagRelations = pgTable("document_tag_relations", {
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  tagId: integer("tag_id").references(() => documentTags.id, { onDelete: "cascade" }).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  pk: { primaryKey: table.documentId, tagId: table.tagId },
}));

export const documentCollections = pgTable("document_collections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  collectionType: text("collection_type").notNull(), // 'purchase_order', 'customer_project', 'quote_process', 'form_workflow'
  primaryIdentifier: text("primary_identifier"), // PO number, customer ID, quote number
  status: text("status").default("active"), // 'active', 'completed', 'archived', 'cancelled'
  metadata: jsonb("metadata"), // Additional flexible data
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentCollectionRelations = pgTable("document_collection_relations", {
  collectionId: integer("collection_id").references(() => documentCollections.id, { onDelete: "cascade" }).notNull(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  relationshipType: text("relationship_type").default("primary"), // 'primary', 'supporting', 'revision', 'reference'
  displayOrder: integer("display_order").default(0),
  addedAt: timestamp("added_at").defaultNow(),
  addedBy: integer("added_by").references(() => users.id),
}, (table) => ({
  pk: { primaryKey: table.collectionId, documentId: table.documentId },
}));

// Document Management Insert Schemas
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadDate: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "Title is required"),
  fileName: z.string().min(1, "File name is required"),
  originalFileName: z.string().min(1, "Original file name is required"),
  filePath: z.string().min(1, "File path is required"),
  fileSize: z.number().positive("File size must be positive"),
  mimeType: z.string().min(1, "MIME type is required"),
  documentType: z.enum(['RFQ', 'QUOTE', 'PO', 'PACKING_SLIP', 'RISK_ASSESSMENT', 'FORM_SUBMISSION', 'SPECIFICATION', 'CONTRACT', 'INVOICE', 'OTHER']),
  uploadedBy: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const insertDocumentTagSchema = createInsertSchema(documentTags).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Tag name is required"),
  category: z.enum(['project', 'customer', 'po_number', 'status', 'document_type', 'priority', 'department', 'other']).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color").default("#3B82F6"),
  description: z.string().optional().nullable(),
});

export const insertDocumentCollectionSchema = createInsertSchema(documentCollections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Collection name is required"),
  collectionType: z.enum(['purchase_order', 'customer_project', 'quote_process', 'form_workflow', 'general']),
  primaryIdentifier: z.string().optional().nullable(),
  status: z.enum(['active', 'completed', 'archived', 'cancelled']).default('active'),
  description: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  createdBy: z.number().optional().nullable(),
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocumentTag = z.infer<typeof insertDocumentTagSchema>;
export type DocumentTag = typeof documentTags.$inferSelect;
export type InsertDocumentCollection = z.infer<typeof insertDocumentCollectionSchema>;
export type DocumentCollection = typeof documentCollections.$inferSelect;

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// New validation schema for Customer Communications
export const insertCustomerCommunicationSchema = createInsertSchema(customerCommunications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerId: z.string().min(1, "Customer ID is required"),
  communicationLogId: z.number().optional(),
  threadId: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.string().optional(),
  // Include fields from communicationLogs that might be relevant here, if needed
  // This depends on how customerCommunications is intended to be used alongside communicationLogs
  // For now, assuming it augments communicationLogs with customer-specific context
});

export const orderAttachmentsRelations = relations(orderAttachments, ({ one }) => ({
  order: one(orderDrafts, { fields: [orderAttachments.orderId], references: [orderDrafts.orderId] })
}));

// Gateway Reports temporarily removed for deployment - will be re-added later

// Customer Satisfaction Survey tables
export const customerSatisfactionSurveys = pgTable("customer_satisfaction_surveys", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  // Survey questions stored as JSON
  questions: jsonb("questions").notNull().default('[]'),
  // Survey configuration settings
  settings: jsonb("settings").default('{}'),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customerSatisfactionResponses = pgTable("customer_satisfaction_responses", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => customerSatisfactionSurveys.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  orderId: text("order_id"), // Optional - link to specific order
  // Survey responses stored as JSON
  responses: jsonb("responses").notNull().default('{}'),
  // Calculated scores
  overallSatisfaction: integer("overall_satisfaction"), // 1-5 scale
  npsScore: integer("nps_score"), // 0-10 scale for Net Promoter Score
  // Additional metadata
  responseTimeSeconds: integer("response_time_seconds"), // Time to complete survey
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  csrName: text("csr_name"), // Customer Service Representative name
  // Status tracking
  isComplete: boolean("is_complete").default(false),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for Customer Satisfaction
export const insertCustomerSatisfactionSurveySchema = createInsertSchema(customerSatisfactionSurveys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "Survey title is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(['rating', 'multiple_choice', 'text', 'textarea', 'yes_no', 'nps']),
    question: z.string().min(1, "Question text is required"),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(), // For multiple choice questions
    scale: z.object({
      min: z.number(),
      max: z.number(),
      minLabel: z.string().optional(),
      maxLabel: z.string().optional(),
    }).optional(), // For rating questions
  })).default([]),
  settings: z.object({
    allowAnonymous: z.boolean().default(false),
    sendEmailReminders: z.boolean().default(true),
    showProgressBar: z.boolean().default(true),
    autoSave: z.boolean().default(true),
  }).default({}),
  createdBy: z.number().optional().nullable(),
});

export const insertCustomerSatisfactionResponseSchema = createInsertSchema(customerSatisfactionResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  surveyId: z.number().min(1, "Survey ID is required"),
  customerId: z.number().min(1, "Customer ID is required"),
  orderId: z.string().optional().nullable(),
  responses: z.record(z.any()).default({}), // Question ID to response mapping
  overallSatisfaction: z.number().min(1).max(5).optional().nullable(),
  npsScore: z.number().min(0).max(10).optional().nullable(),
  responseTimeSeconds: z.number().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  csrName: z.string().optional().nullable(), // Customer Service Representative name
  isComplete: z.boolean().default(false),
  submittedAt: z.string().optional().nullable(), // ISO date string
});

// Types for Customer Satisfaction
export type InsertCustomerSatisfactionSurvey = z.infer<typeof insertCustomerSatisfactionSurveySchema>;
export type CustomerSatisfactionSurvey = typeof customerSatisfactionSurveys.$inferSelect;
export type InsertCustomerSatisfactionResponse = z.infer<typeof insertCustomerSatisfactionResponseSchema>;
export type CustomerSatisfactionResponse = typeof customerSatisfactionResponses.$inferSelect;

// PO Products table for Purchase Order product configurations
export const poProducts = pgTable("po_products", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  productName: text("product_name").notNull(),
  productType: text("product_type"), // stock, AG-M5-SA, AG-M5-LA, etc.
  material: text("material"), // carbon_fiber, fiberglass
  handedness: text("handedness"), // right, left
  stockModel: text("stock_model"),
  actionLength: text("action_length"),
  actionInlet: text("action_inlet"),
  bottomMetal: text("bottom_metal"),
  barrelInlet: text("barrel_inlet"),
  qds: text("qds"), // none, 2_on_left, 2_on_right
  swivelStuds: text("swivel_studs"), // none, 3_ah, 2_privateer
  paintOptions: text("paint_options"),
  texture: text("texture"), // none, grip_forend
  flatTop: boolean("flat_top").default(false),
  price: real("price"),
  notes: text("notes"), // Optional notes field
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schema for PO Products
export const insertPOProductSchema = createInsertSchema(poProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  customerName: z.string().min(1, "Customer name is required"),
  productName: z.string().min(1, "Product name is required"),
  material: z.string().optional().nullable(),
  handedness: z.string().optional().nullable(),
  stockModel: z.string().optional().nullable(),
  actionLength: z.string().optional().nullable(),
  actionInlet: z.string().optional().nullable(),
  bottomMetal: z.string().optional().nullable(),
  barrelInlet: z.string().optional().nullable(),
  qds: z.string().optional().nullable(),
  swivelStuds: z.string().optional().nullable(),
  paintOptions: z.string().optional().nullable(),
  texture: z.string().optional().nullable(),
  flatTop: z.boolean().default(false),
  price: z.number().min(0, "Price must be positive").optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// Types for PO Products
export type InsertPOProduct = z.infer<typeof insertPOProductSchema>;
export type POProduct = typeof poProducts.$inferSelect;

// Insert schema for Refund Requests
export const insertRefundRequestSchema = createInsertSchema(refundRequests).omit({
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
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  requestedBy: z.string().min(1, "Requested by is required"),
  refundAmount: z.number().min(0.01, "Refund amount must be greater than 0"),
  reason: z.string().min(1, "Reason is required"),
  originalTransactionId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Types for Refund Requests
export type InsertRefundRequest = z.infer<typeof insertRefundRequestSchema>;
export type RefundRequest = typeof refundRequests.$inferSelect;

// ============================================================================
// CUTTING TABLE MANAGEMENT SYSTEM
// ============================================================================

// Cutting Materials - Different materials used for stock production
export const cuttingMaterials = pgTable("cutting_materials", {
  id: serial("id").primaryKey(),
  materialName: text("material_name").notNull().unique(),
  materialType: text("material_type").notNull(), // Carbon Fiber, Fiberglass, Primtex
  yieldPerCut: integer("yield_per_cut").notNull(), // How many pieces per cutting operation
  wasteFactor: real("waste_factor").notNull(), // Decimal waste factor (e.g., 0.12 = 12%)
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Categories for cutting - Fiberglass Stock Packets, Carbon Stock Packets, etc.
export const cuttingProductCategories = pgTable("cutting_product_categories", {
  id: serial("id").primaryKey(),
  categoryName: text("category_name").notNull().unique(),
  description: text("description"),
  isP1: boolean("is_p1").default(true), // P1 (regular) or P2 (OEM/supplier)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Components needed for each product category
export const cuttingComponents = pgTable("cutting_components", {
  id: serial("id").primaryKey(),
  productCategoryId: integer("product_category_id").references(() => cuttingProductCategories.id),
  materialId: integer("material_id").references(() => cuttingMaterials.id),
  componentName: text("component_name").notNull(),
  quantityRequired: integer("quantity_required").notNull(), // Pieces needed per stock packet
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cutting requirements for specific orders
export const cuttingRequirements = pgTable("cutting_requirements", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => allOrders.orderId),
  materialId: integer("material_id").references(() => cuttingMaterials.id),
  componentId: integer("component_id").references(() => cuttingComponents.id),
  cutsRequired: integer("cuts_required").notNull(),
  cutsCompleted: integer("cuts_completed").default(0),
  isCompleted: boolean("is_completed").default(false),
  assignedTo: text("assigned_to"), // Employee assigned to cutting task
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Weekly cutting progress summary
export const cuttingProgress = pgTable("cutting_progress", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").references(() => cuttingMaterials.id),
  totalCutsRequired: integer("total_cuts_required").notNull(),
  totalCutsCompleted: integer("total_cuts_completed").default(0),
  pendingOrders: integer("pending_orders").default(0), // Number of orders waiting for this material
  weekDate: date("week_date").notNull(), // Week of production planning
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// ============================================================================
// CUTTING TABLE RELATIONS
// ============================================================================

export const cuttingMaterialsRelations = relations(cuttingMaterials, ({ many }) => ({
  components: many(cuttingComponents),
  requirements: many(cuttingRequirements),
  progress: many(cuttingProgress),
}));

export const cuttingProductCategoriesRelations = relations(cuttingProductCategories, ({ many }) => ({
  components: many(cuttingComponents),
}));

export const cuttingComponentsRelations = relations(cuttingComponents, ({ one, many }) => ({
  productCategory: one(cuttingProductCategories, {
    fields: [cuttingComponents.productCategoryId],
    references: [cuttingProductCategories.id],
  }),
  material: one(cuttingMaterials, {
    fields: [cuttingComponents.materialId],
    references: [cuttingMaterials.id],
  }),
  requirements: many(cuttingRequirements),
}));

export const cuttingRequirementsRelations = relations(cuttingRequirements, ({ one }) => ({
  order: one(allOrders, {
    fields: [cuttingRequirements.orderId],
    references: [allOrders.orderId],
  }),
  material: one(cuttingMaterials, {
    fields: [cuttingRequirements.materialId],
    references: [cuttingMaterials.id],
  }),
  component: one(cuttingComponents, {
    fields: [cuttingRequirements.componentId],
    references: [cuttingComponents.id],
  }),
}));

export const cuttingProgressRelations = relations(cuttingProgress, ({ one }) => ({
  material: one(cuttingMaterials, {
    fields: [cuttingProgress.materialId],
    references: [cuttingMaterials.id],
  }),
}));

// ============================================================================
// CUTTING TABLE INSERT SCHEMAS AND TYPES
// ============================================================================

export const insertCuttingMaterialSchema = createInsertSchema(cuttingMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  materialName: z.string().min(1, "Material name is required"),
  materialType: z.string().min(1, "Material type is required"),
  yieldPerCut: z.number().min(1, "Yield per cut must be at least 1"),
  wasteFactor: z.number().min(0).max(1, "Waste factor must be between 0 and 1"),
});

export const insertCuttingProductCategorySchema = createInsertSchema(cuttingProductCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  categoryName: z.string().min(1, "Category name is required"),
});

export const insertCuttingComponentSchema = createInsertSchema(cuttingComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  componentName: z.string().min(1, "Component name is required"),
  quantityRequired: z.number().min(1, "Quantity required must be at least 1"),
});

export const insertCuttingRequirementSchema = createInsertSchema(cuttingRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  orderId: z.string().min(1, "Order ID is required"),
  cutsRequired: z.number().min(1, "Cuts required must be at least 1"),
});

// Types for cutting tables
export type InsertCuttingMaterial = z.infer<typeof insertCuttingMaterialSchema>;
export type CuttingMaterial = typeof cuttingMaterials.$inferSelect;

export type InsertCuttingProductCategory = z.infer<typeof insertCuttingProductCategorySchema>;
export type CuttingProductCategory = typeof cuttingProductCategories.$inferSelect;

export type InsertCuttingComponent = z.infer<typeof insertCuttingComponentSchema>;
export type CuttingComponent = typeof cuttingComponents.$inferSelect;

export type InsertCuttingRequirement = z.infer<typeof insertCuttingRequirementSchema>;
export type CuttingRequirement = typeof cuttingRequirements.$inferSelect;

export type CuttingProgress = typeof cuttingProgress.$inferSelect;

// ============================================================================
// PACKET-BASED CUTTING TABLES (New Approach)
// ============================================================================

// Packet Types - CF Stock Packets, FG Stock Packets, etc.
export const packetTypes = pgTable("packet_types", {
  id: serial("id").primaryKey(),
  packetName: text("packet_name").notNull().unique(),
  materialType: text("material_type").notNull(), // 'Carbon Fiber', 'Fiberglass', 'Primtex'
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stock Model to Packet Type Mapping - which stock models need which packets
export const stockPacketMapping = pgTable("stock_packet_mapping", {
  id: serial("id").primaryKey(),
  stockModelPrefix: text("stock_model_prefix").notNull(), // 'cf_', 'fg_', etc.
  packetTypeId: integer("packet_type_id").references(() => packetTypes.id),
  packetsPerStock: integer("packets_per_stock").default(1), // Usually 1 packet per stock
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Packet Cutting Queue - tracks packet cutting needs
export const packetCuttingQueue = pgTable("packet_cutting_queue", {
  id: serial("id").primaryKey(),
  packetTypeId: integer("packet_type_id").references(() => packetTypes.id),
  materialId: integer("material_id").references(() => cuttingMaterials.id),
  packetsNeeded: integer("packets_needed").notNull(),
  packetsCut: integer("packets_cut").default(0),
  priorityLevel: integer("priority_level").default(1), // 1-5 priority scale
  requestedBy: text("requested_by"),
  assignedTo: text("assigned_to"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  isCompleted: boolean("is_completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for packet tables
export const packetTypesRelations = relations(packetTypes, ({ many }) => ({
  stockMappings: many(stockPacketMapping),
  cuttingQueue: many(packetCuttingQueue),
}));

export const stockPacketMappingRelations = relations(stockPacketMapping, ({ one }) => ({
  packetType: one(packetTypes, {
    fields: [stockPacketMapping.packetTypeId],
    references: [packetTypes.id],
  }),
}));

export const packetCuttingQueueRelations = relations(packetCuttingQueue, ({ one }) => ({
  packetType: one(packetTypes, {
    fields: [packetCuttingQueue.packetTypeId],
    references: [packetTypes.id],
  }),
  material: one(cuttingMaterials, {
    fields: [packetCuttingQueue.materialId],
    references: [cuttingMaterials.id],
  }),
}));

// Insert schemas for packet tables
export const insertPacketTypeSchema = createInsertSchema(packetTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStockPacketMappingSchema = createInsertSchema(stockPacketMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPacketCuttingQueueSchema = createInsertSchema(packetCuttingQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for packet tables
export type PacketType = typeof packetTypes.$inferSelect;
export type InsertPacketType = z.infer<typeof insertPacketTypeSchema>;

export type StockPacketMapping = typeof stockPacketMapping.$inferSelect;
export type InsertStockPacketMapping = z.infer<typeof insertStockPacketMappingSchema>;

export type PacketCuttingQueue = typeof packetCuttingQueue.$inferSelect;
export type InsertPacketCuttingQueue = z.infer<typeof insertPacketCuttingQueueSchema>;

// ============================================================================
// VENDOR MANAGEMENT
// ============================================================================

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  evaluationNotes: text("evaluation_notes"),
  approvalNotes: text("approval_notes"),
  approved: boolean("is_approved"),
  evaluated: boolean("is_evaluated"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Vendor contact schema - simplified to match current database structure
export const vendorContactSchema = z.object({
  name: z.string().min(1, "Contact name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
});

// Vendor insert schema
export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Vendor name is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  contacts: z.array(vendorContactSchema).optional(),
});

// Vendor types
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;

// ============================================================================
// ROBUST BOM MANAGEMENT SYSTEM (P2 Enhanced)
// ============================================================================

// Lifecycle status enum for parts
export const partLifecycleStatusEnum = pgEnum('part_lifecycle_status', [
  'ACTIVE', 
  'OBSOLETE', 
  'DISCONTINUED', 
  'PHASE_OUT'
]);

// Enhanced Parts Master Table with lifecycle management
export const robustParts = pgTable('robust_parts', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(), // PURCHASED, MANUFACTURED, PHANTOM
  uom: text('uom').notNull().default('ea'), // Unit of measure
  purchaseUom: text('purchase_uom').notNull().default('ea'), // Purchase UoM (can differ from usage UoM)
  conversionFactor: real('conversion_factor').notNull().default(1), // Conversion from purchase to usage UoM
  stdCost: real('std_cost').notNull().default(0),
  revision: text('revision'),
  description: text('description'),
  notes: text('notes'),
  
  // Lifecycle Management
  lifecycleStatus: partLifecycleStatusEnum('lifecycle_status').notNull().default('ACTIVE'),
  obsoleteDate: timestamp('obsolete_date'),
  replacementPartId: text('replacement_part_id'),
  
  // Validation constraints
  minQuantity: real('min_quantity').default(0.001),
  maxQuantity: real('max_quantity').default(999999),
  decimalPrecision: integer('decimal_precision').default(3),
  
  // Status and tracking
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

// Enhanced BOM Lines Table with hierarchical structure
export const robustBomLines = pgTable('robust_bom_lines', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  parentPartId: text('parent_part_id').notNull().references(() => robustParts.id, { onDelete: 'cascade' }),
  childPartId: text('child_part_id').notNull().references(() => robustParts.id, { onDelete: 'restrict' }),
  qtyPer: real('qty_per').notNull().default(1),
  uom: text('uom').notNull().default('ea'),
  scrapPct: real('scrap_pct').notNull().default(0), // Scrap percentage (0-100)
  notes: text('notes'),
  
  // Hierarchical support with depth limit
  level: integer('level').notNull().default(0), // Tree depth (max 4 levels)
  sortOrder: integer('sort_order').default(0), // Sort order within parent
  
  // Effectivity dating for version control
  effectiveFrom: timestamp('effective_from'),
  effectiveTo: timestamp('effective_to'),
  
  // Status and tracking
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

// Cost History Table for audit trail
export const partCostHistory = pgTable('part_cost_history', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  partId: text('part_id').notNull().references(() => robustParts.id, { onDelete: 'cascade' }),
  oldCost: real('old_cost'),
  newCost: real('new_cost').notNull(),
  changeReason: text('change_reason'), // PURCHASE_ORDER, MANUAL_UPDATE, ROLLUP_CALCULATION
  sourceReference: text('source_reference'), // PO number, user action, etc.
  notes: text('notes'),
  effectiveDate: timestamp('effective_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});

// Part Change Audit Trail
export const partAuditLog = pgTable('part_audit_log', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  partId: text('part_id').notNull().references(() => robustParts.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // CREATE, UPDATE, DELETE, LIFECYCLE_CHANGE
  fieldName: text('field_name'), // Which field was changed
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});

// BOM Audit Trail
export const bomAuditLog = pgTable('bom_audit_log', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  bomLineId: text('bom_line_id').references(() => robustBomLines.id, { onDelete: 'cascade' }),
  parentPartId: text('parent_part_id').notNull().references(() => robustParts.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // ADD_LINE, UPDATE_LINE, DELETE_LINE, CLONE_BOM
  details: jsonb('details'), // Detailed change information
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});

// Robust Parts Relations
export const robustPartsRelations = relations(robustParts, ({ many, one }) => ({
  asParentLines: many(robustBomLines, { relationName: 'parentPart' }),
  asChildLines: many(robustBomLines, { relationName: 'childPart' }),
  costHistory: many(partCostHistory),
  auditLog: many(partAuditLog),
  replacementPart: one(robustParts, { 
    fields: [robustParts.replacementPartId], 
    references: [robustParts.id] 
  }),
}));

// Robust BOM Lines Relations
export const robustBomLinesRelations = relations(robustBomLines, ({ one }) => ({
  parentPart: one(robustParts, { 
    fields: [robustBomLines.parentPartId], 
    references: [robustParts.id], 
    relationName: 'parentPart' 
  }),
  childPart: one(robustParts, { 
    fields: [robustBomLines.childPartId], 
    references: [robustParts.id], 
    relationName: 'childPart' 
  }),
}));

// Cost History Relations
export const partCostHistoryRelations = relations(partCostHistory, ({ one }) => ({
  part: one(robustParts, { 
    fields: [partCostHistory.partId], 
    references: [robustParts.id] 
  }),
}));

// Audit Log Relations
export const partAuditLogRelations = relations(partAuditLog, ({ one }) => ({
  part: one(robustParts, { 
    fields: [partAuditLog.partId], 
    references: [robustParts.id] 
  }),
}));

export const bomAuditLogRelations = relations(bomAuditLog, ({ one }) => ({
  bomLine: one(robustBomLines, { 
    fields: [bomAuditLog.bomLineId], 
    references: [robustBomLines.id] 
  }),
  parentPart: one(robustParts, { 
    fields: [bomAuditLog.parentPartId], 
    references: [robustParts.id] 
  }),
}));

// Insert Schemas for Robust BOM System
export const insertRobustPartSchema = createInsertSchema(robustParts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Part name is required"),
  type: z.enum(['PURCHASED', 'MANUFACTURED', 'PHANTOM']),
  uom: z.string().min(1, "Unit of measure is required"),
  purchaseUom: z.string().min(1, "Purchase UoM is required"),
  conversionFactor: z.number().positive("Conversion factor must be positive").default(1),
  stdCost: z.number().min(0, "Standard cost must be non-negative"),
  lifecycleStatus: z.enum(['ACTIVE', 'OBSOLETE', 'DISCONTINUED', 'PHASE_OUT']).default('ACTIVE'),
  minQuantity: z.number().positive("Minimum quantity must be positive").optional(),
  maxQuantity: z.number().positive("Maximum quantity must be positive").optional(),
  decimalPrecision: z.number().int().min(0).max(6).default(3),
});

export const insertRobustBomLineSchema = createInsertSchema(robustBomLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  parentPartId: z.string().min(1, "Parent part ID is required"),
  childPartId: z.string().min(1, "Child part ID is required"),
  qtyPer: z.number().positive("Quantity per must be positive"),
  uom: z.string().min(1, "Unit of measure is required"),
  scrapPct: z.number().min(0).max(100, "Scrap percentage must be between 0 and 100").default(0),
  level: z.number().int().min(0).max(4, "Maximum BOM depth is 4 levels").default(0),
});

export const insertPartCostHistorySchema = createInsertSchema(partCostHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  newCost: z.number().min(0, "New cost must be non-negative"),
  changeReason: z.string().min(1, "Change reason is required"),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertPartAuditLogSchema = createInsertSchema(partAuditLog).omit({
  id: true,
  createdAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  action: z.string().min(1, "Action is required"),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertBomAuditLogSchema = createInsertSchema(bomAuditLog).omit({
  id: true,
  createdAt: true,
}).extend({
  parentPartId: z.string().min(1, "Parent part ID is required"),
  action: z.string().min(1, "Action is required"),
  createdBy: z.string().min(1, "Created by is required"),
});

// Types for Robust BOM System
export type RobustPart = typeof robustParts.$inferSelect;
export type InsertRobustPart = z.infer<typeof insertRobustPartSchema>;

export type RobustBomLine = typeof robustBomLines.$inferSelect;
export type InsertRobustBomLine = z.infer<typeof insertRobustBomLineSchema>;

export type PartCostHistory = typeof partCostHistory.$inferSelect;
export type InsertPartCostHistory = z.infer<typeof insertPartCostHistorySchema>;

export type PartAuditLog = typeof partAuditLog.$inferSelect;
export type InsertPartAuditLog = z.infer<typeof insertPartAuditLogSchema>;

export type BomAuditLog = typeof bomAuditLog.$inferSelect;
export type InsertBomAuditLog = z.infer<typeof insertBomAuditLogSchema>;

// ============================================================================
// INVENTORY MANAGEMENT & MRP SYSTEM
// ============================================================================

// Inventory transaction types for parts
export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', [
  'RECEIPT',           // Parts received from vendor
  'ISSUE',            // Parts issued to production
  'CONSUMPTION',      // Parts consumed in production
  'ADJUSTMENT',       // Inventory adjustments
  'SCRAP',           // Parts scrapped/wasted
  'RETURN_TO_VENDOR', // Parts returned to vendor
  'TRANSFER_OUT',     // Parts sent for outside processing
  'TRANSFER_IN'       // Parts received back from outside processing
]);

// Inventory status for progressive allocation
export const inventoryStatusEnum = pgEnum('inventory_status', [
  'AVAILABLE',   // Available for allocation
  'COMMITTED',   // Committed to customer orders
  'ALLOCATED',   // Allocated to production orders
  'CONSUMED'     // Consumed in production
]);

// Inventory Balances - Real-time inventory tracking per part
export const inventoryBalances = pgTable('inventory_balances', {
  id: serial('id').primaryKey(),
  partId: text('part_id').notNull().references(() => robustParts.id),
  locationId: text('location_id').notNull().default('MAIN'), // MAIN, VENDOR_{vendor_id}, etc.
  
  // Quantity tracking
  onHandQty: real('on_hand_qty').notNull().default(0),
  committedQty: real('committed_qty').notNull().default(0), // Committed to customer orders
  allocatedQty: real('allocated_qty').notNull().default(0), // Allocated to production
  availableQty: real('available_qty').notNull().default(0), // Available = OnHand - Committed - Allocated
  
  // Cost tracking
  unitCost: real('unit_cost').notNull().default(0),
  totalValue: real('total_value').notNull().default(0),
  
  // Safety stock and ordering
  safetyStock: real('safety_stock').default(0),
  minOrderQty: real('min_order_qty').default(1),
  leadTimeDays: integer('lead_time_days').default(7),
  
  // Tracking
  lastTransactionAt: timestamp('last_transaction_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Inventory Transactions - All inventory movements
export const inventoryTransactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  transactionId: text('transaction_id').notNull().unique(), // Auto-generated unique ID
  
  // Part and location
  partId: text('part_id').notNull().references(() => robustParts.id),
  locationId: text('location_id').notNull().default('MAIN'),
  
  // Transaction details
  transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
  quantity: real('quantity').notNull(),
  unitCost: real('unit_cost').notNull().default(0),
  totalCost: real('total_cost').notNull().default(0),
  
  // Reference information
  orderId: text('order_id'), // Customer order reference
  poNumber: text('po_number'), // Purchase order reference
  vendorId: text('vendor_id'), // Vendor reference
  employeeId: text('employee_id'), // Employee who performed transaction
  
  // Progressive allocation tracking
  allocationStatus: inventoryStatusEnum('allocation_status').default('AVAILABLE'),
  customerOrderId: text('customer_order_id'), // Specific customer order for allocation
  productionOrderId: text('production_order_id'), // Production order reference
  
  // Outside processing
  outsideProcessorId: text('outside_processor_id'), // Vendor doing outside processing
  processingJobId: text('processing_job_id'), // Batch/job number at processor
  expectedReturnDate: timestamp('expected_return_date'),
  actualReturnDate: timestamp('actual_return_date'),
  
  // Documentation
  notes: text('notes'),
  documentUrl: text('document_url'), // Link to supporting documents
  
  // Tracking
  transactionDate: timestamp('transaction_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').notNull(),
});

// MRP Material Requirements - Calculated material needs
export const mrpRequirements = pgTable('mrp_requirements', {
  id: serial('id').primaryKey(),
  requirementId: text('requirement_id').notNull().unique(), // Auto-generated unique ID
  
  // Part information
  partId: text('part_id').notNull().references(() => robustParts.id),
  
  // Requirement details
  requiredQty: real('required_qty').notNull(),
  availableQty: real('available_qty').notNull().default(0),
  shortageQty: real('shortage_qty').notNull().default(0), // Required - Available
  
  // Timing
  needDate: timestamp('need_date').notNull(),
  plannedOrderDate: timestamp('planned_order_date'), // When to place order
  
  // Source information - what's driving this requirement
  sourceType: text('source_type').notNull(), // CUSTOMER_ORDER, FORECAST, SAFETY_STOCK
  sourceOrderId: text('source_order_id'), // Driving customer order
  sourceCustomerId: text('source_customer_id'), // Customer driving requirement
  
  // BOM explosion details
  bomId: text('bom_id'), // BOM line that created this requirement
  parentPartId: text('parent_part_id'), // Parent part if from BOM explosion
  qtyPer: real('qty_per').default(1), // Quantity per parent part
  
  // Planning information
  planningGroup: text('planning_group').default('WEEKLY'), // WEEKLY, MONTHLY
  priority: integer('priority').default(50), // 1-100, lower = higher priority
  
  // Purchase recommendations
  suggestedPoQty: real('suggested_po_qty').default(0),
  suggestedVendorId: text('suggested_vendor_id'),
  estimatedCost: real('estimated_cost').default(0),
  
  // Status tracking
  status: text('status').default('OPEN').notNull(), // OPEN, PO_CREATED, RECEIVED, CLOSED
  
  // Tracking
  calculatedAt: timestamp('calculated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Outside Processing Locations - Vendor-specific processing locations
export const outsideProcessingLocations = pgTable('outside_processing_locations', {
  id: serial('id').primaryKey(),
  locationId: text('location_id').notNull().unique(), // VENDOR_{vendor_id}_{location_name}
  
  // Vendor information
  vendorId: text('vendor_id').notNull(), // Reference to vendor
  vendorName: text('vendor_name').notNull(),
  locationName: text('location_name').notNull().default('Main'), // Main, Secondary, etc.
  
  // Processing capabilities
  processTypes: text('process_types').array().default([]), // ['ANODIZING', 'PLATING', 'HEAT_TREAT']
  capacity: text('capacity'), // Description of capacity
  leadTimeDays: integer('lead_time_days').default(7),
  
  // Contact information
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),
  contactEmail: text('contact_email'),
  
  // Address
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  
  // Status
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Outside Processing Jobs - Track batches at external processors
export const outsideProcessingJobs = pgTable('outside_processing_jobs', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').notNull().unique(), // Auto-generated job ID
  
  // Location and vendor
  locationId: text('location_id').notNull().references(() => outsideProcessingLocations.locationId),
  vendorId: text('vendor_id').notNull(),
  
  // Job details
  processType: text('process_type').notNull(), // ANODIZING, PLATING, etc.
  jobDescription: text('job_description'),
  
  // Quantities
  totalPartsOut: integer('total_parts_out').notNull().default(0), // Parts sent out
  totalPartsBack: integer('total_parts_back').default(0), // Parts received back
  scrapQty: integer('scrap_qty').default(0), // Parts scrapped at vendor
  
  // Timing
  dateShipped: timestamp('date_shipped').notNull(),
  expectedReturn: timestamp('expected_return').notNull(),
  actualReturn: timestamp('actual_return'),
  
  // Cost
  estimatedCost: real('estimated_cost').default(0),
  actualCost: real('actual_cost').default(0),
  
  // References
  poNumber: text('po_number'), // PO to vendor for processing
  packingSlip: text('packing_slip'), // Packing slip reference
  
  // Status
  status: text('status').default('SHIPPED').notNull(), // SHIPPED, IN_PROCESS, COMPLETED, RETURNED
  
  // Notes and tracking
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by').notNull(),
});

// MRP Calculations History - Track MRP runs and changes
export const mrpCalculationHistory = pgTable('mrp_calculation_history', {
  id: serial('id').primaryKey(),
  calculationId: text('calculation_id').notNull().unique(),
  
  // Calculation details
  calculationType: text('calculation_type').notNull(), // FULL_RUN, INCREMENTAL, ORDER_CHANGE
  triggeredBy: text('triggered_by').notNull(), // AUTO, USER, ORDER_CHANGE
  scope: text('scope').default('ALL'), // ALL, SPECIFIC_PART, SPECIFIC_ORDER
  
  // Timing
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  duration: integer('duration'), // Duration in seconds
  
  // Results
  partsProcessed: integer('parts_processed').default(0),
  requirementsGenerated: integer('requirements_generated').default(0),
  shortagesIdentified: integer('shortages_identified').default(0),
  poSuggestionsCreated: integer('po_suggestions_created').default(0),
  
  // Status
  status: text('status').default('RUNNING').notNull(), // RUNNING, COMPLETED, FAILED
  errorMessage: text('error_message'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow(),
});

// Vendor Part Mapping - Link parts to vendors with pricing
export const vendorParts = pgTable('vendor_parts', {
  id: serial('id').primaryKey(),
  
  // Part and vendor
  partId: text('part_id').notNull().references(() => robustParts.id),
  vendorId: text('vendor_id').notNull(),
  
  // Vendor-specific information
  vendorPartNumber: text('vendor_part_number').notNull(),
  vendorPartName: text('vendor_part_name'),
  
  // Pricing and ordering
  unitPrice: real('unit_price').notNull().default(0),
  minOrderQty: real('min_order_qty').default(1),
  packSize: real('pack_size').default(1), // Vendor's package size
  leadTimeDays: integer('lead_time_days').default(7),
  
  // Vendor metrics
  isPreferred: boolean('is_preferred').default(false),
  qualityRating: integer('quality_rating').default(5), // 1-5 scale
  deliveryRating: integer('delivery_rating').default(5), // 1-5 scale
  
  // Price history
  lastPriceUpdate: timestamp('last_price_update'),
  priceValidUntil: timestamp('price_valid_until'),
  
  // Status
  isActive: boolean('is_active').default(true),
  discontinuedDate: timestamp('discontinued_date'),
  notes: text('notes'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schemas for Inventory & MRP
export const insertInventoryBalanceSchema = createInsertSchema(inventoryBalances).omit({
  id: true,
  availableQty: true, // Calculated field
  totalValue: true, // Calculated field
  createdAt: true,
  updatedAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  locationId: z.string().min(1, "Location ID is required"),
  onHandQty: z.number().min(0, "On-hand quantity must be non-negative"),
  committedQty: z.number().min(0, "Committed quantity must be non-negative"),
  allocatedQty: z.number().min(0, "Allocated quantity must be non-negative"),
  unitCost: z.number().min(0, "Unit cost must be non-negative"),
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactions).omit({
  id: true,
  transactionId: true, // Auto-generated
  createdAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  locationId: z.string().min(1, "Location ID is required"),
  transactionType: z.enum(['RECEIPT', 'ISSUE', 'CONSUMPTION', 'ADJUSTMENT', 'SCRAP', 'RETURN_TO_VENDOR', 'TRANSFER_OUT', 'TRANSFER_IN']),
  quantity: z.number().refine(val => val !== 0, "Quantity cannot be zero"),
  unitCost: z.number().min(0, "Unit cost must be non-negative"),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertMrpRequirementSchema = createInsertSchema(mrpRequirements).omit({
  id: true,
  requirementId: true, // Auto-generated
  calculatedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  requiredQty: z.number().positive("Required quantity must be positive"),
  needDate: z.coerce.date(),
  sourceType: z.enum(['CUSTOMER_ORDER', 'FORECAST', 'SAFETY_STOCK']),
});

export const insertOutsideProcessingLocationSchema = createInsertSchema(outsideProcessingLocations).omit({
  id: true,
  locationId: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
}).extend({
  vendorId: z.string().min(1, "Vendor ID is required"),
  vendorName: z.string().min(1, "Vendor name is required"),
  locationName: z.string().min(1, "Location name is required"),
});

export const insertOutsideProcessingJobSchema = createInsertSchema(outsideProcessingJobs).omit({
  id: true,
  jobId: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
}).extend({
  locationId: z.string().min(1, "Location ID is required"),
  vendorId: z.string().min(1, "Vendor ID is required"),
  processType: z.string().min(1, "Process type is required"),
  totalPartsOut: z.number().min(1, "Total parts out must be at least 1"),
  dateShipped: z.coerce.date(),
  expectedReturn: z.coerce.date(),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertVendorPartSchema = createInsertSchema(vendorParts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  vendorId: z.string().min(1, "Vendor ID is required"),
  vendorPartNumber: z.string().min(1, "Vendor part number is required"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  minOrderQty: z.number().positive("Minimum order quantity must be positive"),
  leadTimeDays: z.number().min(0, "Lead time must be non-negative"),
});

// ============================================================================
// UPDATE SCHEMAS FOR SECURITY VALIDATION
// ============================================================================

// Update schema for inventory items - allows partial updates while validating types
export const updateInventoryItemSchema = insertInventoryItemSchema.partial();

// Update schema for inventory balances - partial validation for updateable fields
export const updateInventoryBalanceSchema = insertInventoryBalanceSchema.partial().omit({
  partId: true, // Cannot change part ID in updates
  locationId: true, // Cannot change location ID in updates
});

// Update schema for inventory transactions - partial validation
export const updateInventoryTransactionSchema = insertInventoryTransactionSchema.partial().omit({
  partId: true, // Cannot change part ID in updates
  transactionType: true, // Cannot change transaction type in updates
  quantity: true, // Cannot change quantity in updates
  createdBy: true, // Cannot change creator in updates
});

// Update schema for parts requests - partial validation for updateable fields
export const updatePartsRequestSchema = insertPartsRequestSchema.partial();

// Update schema for MRP requirements - partial validation for updateable fields
export const updateMrpRequirementSchema = insertMrpRequirementSchema.partial().omit({
  partId: true, // Cannot change part ID in updates
  requiredQty: true, // Cannot change required quantity in updates
  sourceType: true, // Cannot change source type in updates
});

// Update schema for outside processing locations - partial validation
export const updateOutsideProcessingLocationSchema = insertOutsideProcessingLocationSchema.partial().omit({
  vendorId: true, // Cannot change vendor ID in updates
});

// Update schema for outside processing jobs - partial validation for updateable fields
export const updateOutsideProcessingJobSchema = insertOutsideProcessingJobSchema.partial().omit({
  locationId: true, // Cannot change location ID in updates
  vendorId: true, // Cannot change vendor ID in updates
  createdBy: true, // Cannot change creator in updates
});

// Update schema for vendor parts - partial validation for updateable fields
export const updateVendorPartSchema = insertVendorPartSchema.partial().omit({
  partId: true, // Cannot change part ID in updates
  vendorId: true, // Cannot change vendor ID in updates
});

// Types for Inventory & MRP
export type InventoryBalance = typeof inventoryBalances.$inferSelect;
export type InsertInventoryBalance = z.infer<typeof insertInventoryBalanceSchema>;

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;

export type MrpRequirement = typeof mrpRequirements.$inferSelect;
export type InsertMrpRequirement = z.infer<typeof insertMrpRequirementSchema>;

export type OutsideProcessingLocation = typeof outsideProcessingLocations.$inferSelect;
export type InsertOutsideProcessingLocation = z.infer<typeof insertOutsideProcessingLocationSchema>;

export type OutsideProcessingJob = typeof outsideProcessingJobs.$inferSelect;
export type InsertOutsideProcessingJob = z.infer<typeof insertOutsideProcessingJobSchema>;

export type MrpCalculationHistory = typeof mrpCalculationHistory.$inferSelect;

export type VendorPart = typeof vendorParts.$inferSelect;
export type InsertVendorPart = z.infer<typeof insertVendorPartSchema>;

// Update schema types for security validation
export type UpdateInventoryItem = z.infer<typeof updateInventoryItemSchema>;
export type UpdateInventoryBalance = z.infer<typeof updateInventoryBalanceSchema>;
export type UpdateInventoryTransaction = z.infer<typeof updateInventoryTransactionSchema>;
export type UpdatePartsRequest = z.infer<typeof updatePartsRequestSchema>;
export type UpdateMrpRequirement = z.infer<typeof updateMrpRequirementSchema>;
export type UpdateOutsideProcessingLocation = z.infer<typeof updateOutsideProcessingLocationSchema>;
export type UpdateOutsideProcessingJob = z.infer<typeof updateOutsideProcessingJobSchema>;
export type UpdateVendorPart = z.infer<typeof updateVendorPartSchema>;

// ============================================================================
// ENHANCED INVENTORY MANAGEMENT & MRP SYSTEM EXTENSIONS
// ============================================================================

// Allocation Details - Track specific demand-to-supply pegging
export const allocationDetails = pgTable('allocation_details', {
  id: serial('id').primaryKey(),
  allocationId: text('allocation_id').notNull().unique(), // Auto-generated unique ID
  
  // Part and location
  partId: text('part_id').notNull().references(() => robustParts.id),
  locationId: text('location_id').notNull().default('MAIN'),
  
  // Allocation details
  allocatedQty: real('allocated_qty').notNull(),
  consumedQty: real('consumed_qty').notNull().default(0),
  remainingQty: real('remaining_qty').notNull(), // Calculated field: allocated - consumed
  
  // Demand source (what's requesting this allocation)
  demandType: text('demand_type').notNull(), // CUSTOMER_ORDER, PRODUCTION_ORDER, FORECAST, SAFETY_STOCK
  demandOrderId: text('demand_order_id'), // Customer order ID driving this demand
  demandCustomerId: text('demand_customer_id'), // Customer ID for traceability
  demandDueDate: timestamp('demand_due_date'), // When this allocation is needed
  demandPriority: integer('demand_priority').default(50), // 1-100, lower = higher priority
  
  // Supply source (what's fulfilling this allocation)
  supplyType: text('supply_type').notNull(), // ON_HAND, PURCHASE_ORDER, PRODUCTION_ORDER, TRANSFER
  supplyOrderId: text('supply_order_id'), // PO or production order fulfilling this
  supplyVendorId: text('supply_vendor_id'), // Vendor if from PO
  supplyAvailableDate: timestamp('supply_available_date'), // When supply becomes available
  
  // Lot/Batch tracking for traceability
  lotNumber: text('lot_number'), // Lot/batch number for tracking
  serialNumbers: text('serial_numbers').array(), // Array of serial numbers if applicable
  expirationDate: timestamp('expiration_date'), // For materials with shelf life
  
  // Status and lifecycle
  allocationStatus: text('allocation_status').default('ALLOCATED').notNull(), // ALLOCATED, RESERVED, CONSUMED, RELEASED
  reservationDate: timestamp('reservation_date'), // When allocation was first reserved
  consumptionStartDate: timestamp('consumption_start_date'), // When consumption began
  fullyConsumedDate: timestamp('fully_consumed_date'), // When allocation was fully consumed
  
  // Atomicity protection
  lockVersion: integer('lock_version').default(0).notNull(), // Optimistic locking
  isLocked: boolean('is_locked').default(false), // Pessimistic locking for critical operations
  lockedBy: text('locked_by'), // User/process that locked this allocation
  lockedAt: timestamp('locked_at'), // When the lock was acquired
  
  // Audit and tracking
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
  notes: text('notes'),
});

// Vendor Price Breaks - Volume-based pricing from vendors
export const vendorPriceBreaks = pgTable('vendor_price_breaks', {
  id: serial('id').primaryKey(),
  vendorPartId: integer('vendor_part_id').notNull().references(() => vendorParts.id),
  
  // Price break tiers
  minQty: real('min_qty').notNull(), // Minimum quantity for this price
  maxQty: real('max_qty'), // Maximum quantity (null = unlimited)
  unitPrice: real('unit_price').notNull(),
  
  // Pricing terms
  currencyCode: text('currency_code').default('USD').notNull(),
  paymentTerms: text('payment_terms'), // NET30, 2/10 NET30, etc.
  validFrom: timestamp('valid_from').notNull(),
  validUntil: timestamp('valid_until'),
  
  // Status
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Outside Processing Batches - Enhanced batch management
export const outsideProcessingBatches = pgTable('outside_processing_batches', {
  id: serial('id').primaryKey(),
  batchId: text('batch_id').notNull().unique(), // Auto-generated batch ID
  
  // Batch information
  jobId: text('job_id').notNull().references(() => outsideProcessingJobs.jobId),
  batchName: text('batch_name').notNull(),
  processType: text('process_type').notNull(),
  
  // Part tracking
  partId: text('part_id').notNull().references(() => robustParts.id),
  lotNumber: text('lot_number'),
  
  // Quantities
  plannedQty: integer('planned_qty').notNull(),
  shippedQty: integer('shipped_qty').default(0),
  receivedQty: integer('received_qty').default(0),
  scrapQty: integer('scrap_qty').default(0),
  
  // Timing
  plannedShipDate: timestamp('planned_ship_date').notNull(),
  actualShipDate: timestamp('actual_ship_date'),
  plannedReceiveDate: timestamp('planned_receive_date').notNull(),
  actualReceiveDate: timestamp('actual_receive_date'),
  
  // Cost tracking
  estimatedCostPerPart: real('estimated_cost_per_part').default(0),
  actualCostPerPart: real('actual_cost_per_part').default(0),
  setupCost: real('setup_cost').default(0),
  
  // Status and tracking
  status: text('status').default('PLANNED').notNull(), // PLANNED, SHIPPED, IN_PROCESS, PARTIAL_RECEIPT, COMPLETED
  packingSlipNumber: text('packing_slip_number'),
  receivingNotes: text('receiving_notes'),
  
  // Integration with production
  wipLocationId: text('wip_location_id'), // Work-in-process location at vendor
  returnLocationId: text('return_location_id').default('MAIN'), // Where parts return to
  
  // Tracking
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// MRP Planning Parameters - Enhanced MRP configuration
export const mrpPlanningParameters = pgTable('mrp_planning_parameters', {
  id: serial('id').primaryKey(),
  parameterId: text('parameter_id').notNull().unique(),
  
  // Planning scope
  partId: text('part_id'), // null = global parameters
  planningGroup: text('planning_group').default('WEEKLY').notNull(), // DAILY, WEEKLY, MONTHLY
  
  // Time fencing
  demandTimeFenceDays: integer('demand_time_fence_days').default(7), // Frozen demand period
  planningTimeFenceDays: integer('planning_time_fence_days').default(30), // Planning horizon
  
  // Lot sizing
  lotSizingMethod: text('lot_sizing_method').default('LOT_FOR_LOT').notNull(), // LOT_FOR_LOT, EOQ, FIXED_LOT_SIZE, MIN_MAX
  fixedLotSize: real('fixed_lot_size'), // For FIXED_LOT_SIZE method
  lotSizeMultiple: real('lot_size_multiple').default(1), // Round lot sizes to multiples
  
  // Safety stock
  safetyStockMethod: text('safety_stock_method').default('FIXED').notNull(), // FIXED, PERCENTAGE, DYNAMIC
  safetyStockDays: integer('safety_stock_days').default(0),
  safetyStockPercent: real('safety_stock_percent').default(0),
  
  // Planning frequency
  planningFrequency: text('planning_frequency').default('WEEKLY').notNull(), // DAILY, WEEKLY, MONTHLY
  lastPlanningRun: timestamp('last_planning_run'),
  nextPlanningRun: timestamp('next_planning_run'),
  
  // Status
  isActive: boolean('is_active').default(true),
  effectiveDate: timestamp('effective_date').notNull().defaultNow(),
  expirationDate: timestamp('expiration_date'),
  
  // Tracking
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert Schemas for Enhanced System
export const insertAllocationDetailSchema = createInsertSchema(allocationDetails).omit({
  id: true,
  allocationId: true, // Auto-generated
  remainingQty: true, // Calculated field
  createdAt: true,
  updatedAt: true,
}).extend({
  partId: z.string().min(1, "Part ID is required"),
  locationId: z.string().min(1, "Location ID is required"),
  allocatedQty: z.number().positive("Allocated quantity must be positive"),
  demandType: z.enum(['CUSTOMER_ORDER', 'PRODUCTION_ORDER', 'FORECAST', 'SAFETY_STOCK']),
  supplyType: z.enum(['ON_HAND', 'PURCHASE_ORDER', 'PRODUCTION_ORDER', 'TRANSFER']),
  allocationStatus: z.enum(['ALLOCATED', 'RESERVED', 'CONSUMED', 'RELEASED']).default('ALLOCATED'),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertVendorPriceBreakSchema = createInsertSchema(vendorPriceBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  vendorPartId: z.number().min(1, "Vendor part ID is required"),
  minQty: z.number().positive("Minimum quantity must be positive"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  validFrom: z.coerce.date(),
});

export const insertOutsideProcessingBatchSchema = createInsertSchema(outsideProcessingBatches).omit({
  id: true,
  batchId: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
}).extend({
  jobId: z.string().min(1, "Job ID is required"),
  batchName: z.string().min(1, "Batch name is required"),
  processType: z.string().min(1, "Process type is required"),
  partId: z.string().min(1, "Part ID is required"),
  plannedQty: z.number().min(1, "Planned quantity must be at least 1"),
  plannedShipDate: z.coerce.date(),
  plannedReceiveDate: z.coerce.date(),
  createdBy: z.string().min(1, "Created by is required"),
});

export const insertMrpPlanningParametersSchema = createInsertSchema(mrpPlanningParameters).omit({
  id: true,
  parameterId: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
}).extend({
  planningGroup: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  lotSizingMethod: z.enum(['LOT_FOR_LOT', 'EOQ', 'FIXED_LOT_SIZE', 'MIN_MAX']).default('LOT_FOR_LOT'),
  safetyStockMethod: z.enum(['FIXED', 'PERCENTAGE', 'DYNAMIC']).default('FIXED'),
  planningFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  effectiveDate: z.coerce.date(),
});

// Enhanced Types
export type AllocationDetail = typeof allocationDetails.$inferSelect;
export type InsertAllocationDetail = z.infer<typeof insertAllocationDetailSchema>;

export type VendorPriceBreak = typeof vendorPriceBreaks.$inferSelect;
export type InsertVendorPriceBreak = z.infer<typeof insertVendorPriceBreakSchema>;

export type OutsideProcessingBatch = typeof outsideProcessingBatches.$inferSelect;
export type InsertOutsideProcessingBatch = z.infer<typeof insertOutsideProcessingBatchSchema>;

export type MrpPlanningParameters = typeof mrpPlanningParameters.$inferSelect;
export type InsertMrpPlanningParameters = z.infer<typeof insertMrpPlanningParametersSchema>;