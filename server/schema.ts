import { pgTable, text, serial, integer, timestamp, jsonb, boolean, json, real, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

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
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionToken: text("session_token").notNull().unique(),
  employeeId: integer("employee_id").references(() => employees.id),
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
  finalizedBy: z.string().optional().nullable(),
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
  quantityMultiplier: integer('quantity_multiplier').default(1), // Multiplies quantities when used as sub-assembly
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
  quantityMultiplier: z.number().min(1).default(1),
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
  kickbackDept: z.enum(['Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping']),
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

// Gateway Reports table for daily activity tracking
export const gatewayReports = pgTable("gateway_reports", {
  id: serial("id").primaryKey(),
  reportDate: date("report_date").notNull(), // The specific date for this report (YYYY-MM-DD)
  buttpadsUnits: integer("buttpads_units").notNull().default(0), // Units processed in Buttpads area
  duratecUnits: integer("duratec_units").notNull().default(0), // Units processed in Duratec area
  sandblastingUnits: integer("sandblasting_units").notNull().default(0), // Units processed in Sandblasting area
  textureUnits: integer("texture_units").notNull().default(0), // Units processed in Texture area
  notes: text("notes"), // Optional notes for the day
  createdBy: integer("created_by").references(() => users.id), // User who created this report
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schema for Gateway Reports
export const insertGatewayReportSchema = createInsertSchema(gatewayReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  buttpadsUnits: z.number().int().min(0, "Buttpads units must be 0 or greater"),
  duratecUnits: z.number().int().min(0, "Duratec units must be 0 or greater"),
  sandblastingUnits: z.number().int().min(0, "Sandblasting units must be 0 or greater"),
  textureUnits: z.number().int().min(0, "Texture units must be 0 or greater"),
  notes: z.string().optional().nullable(),
  createdBy: z.number().optional().nullable(),
});

// Types for Gateway Reports
export type InsertGatewayReport = z.infer<typeof insertGatewayReportSchema>;
export type GatewayReport = typeof gatewayReports.$inferSelect;