import { pgTable, text, serial, integer, timestamp, jsonb, boolean, json, real, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  canOverridePrices: boolean("can_override_prices").default(false),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
  date: timestamp("date").notNull(),
  // Department progression fields
  currentDepartment: text("current_department").default("Layup").notNull(),
  isOnSchedule: boolean("is_on_schedule").default(true),
  priorityScore: integer("priority_score").default(50), // Lower = higher priority
  rushTier: text("rush_tier"), // e.g., "STANDARD", "RUSH", "EXPEDITE"
  poId: text("po_id"), // Reference to purchase order
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
  isCustomOrder: text("is_custom_order"), // "yes", "no", or null
  modelId: text("model_id"),
  handedness: text("handedness"),
  shankLength: text("shank_length"),
  features: jsonb("features"),
  featureQuantities: jsonb("feature_quantities"),
  discountCode: text("discount_code"),
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

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  department: text("department"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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
  modelId: z.string().optional().nullable(),
  handedness: z.string().optional().nullable(),
  features: z.record(z.any()).optional().nullable(),
  featureQuantities: z.record(z.any()).optional().nullable(),
  discountCode: z.string().optional().nullable(),
  shipping: z.number().min(0).default(0),
  tikkaOption: z.string().optional().nullable(),
  status: z.string().default("DRAFT"),
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
}).extend({
  name: z.string().min(1, "Employee name is required"),
  role: z.string().min(1, "Employee role is required"),
  department: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
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

// Layup Scheduler Tables
export const molds = pgTable("molds", {
  id: serial("id").primaryKey(),
  moldId: text("mold_id").notNull().unique(),
  modelName: text("model_name").notNull(),
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

export const layupOrders = pgTable("layup_orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  priorityScore: integer("priority_score").notNull(), // Lower numbers = higher priority
  department: text("department").default("Layup").notNull(),
  status: text("status").default("FINALIZED").notNull(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const layupSchedule = pgTable("layup_schedule", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").references(() => layupOrders.orderId).notNull(),
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

export const insertLayupOrderSchema = createInsertSchema(layupOrders).omit({
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
export type InsertLayupOrder = z.infer<typeof insertLayupOrderSchema>;
export type LayupOrder = typeof layupOrders.$inferSelect;
export type InsertLayupSchedule = z.infer<typeof insertLayupScheduleSchema>;
export type LayupSchedule = typeof layupSchedule.$inferSelect;

// Module 8: API Integrations & Communications
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  customerType: text("customer_type").default("standard"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customerAddresses = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  street: text("street").notNull(),
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
  orderId: text("order_id").notNull(),
  customerId: text("customer_id").notNull(),
  type: text("type").notNull(), // order-confirmation, shipping-notification, quality-alert
  method: text("method").notNull(), // email, sms
  recipient: text("recipient").notNull(), // email address or phone number
  subject: text("subject"),
  message: text("message"),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

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
  orderId: z.string().min(1, "Order ID is required"),
  customerId: z.string().min(1, "Customer ID is required"),
  type: z.enum(['order-confirmation', 'shipping-notification', 'quality-alert']),
  method: z.enum(['email', 'sms']),
  recipient: z.string().min(1, "Recipient is required"),
  subject: z.string().optional(),
  message: z.string().optional(),
  status: z.enum(['pending', 'sent', 'failed']).default('pending'),
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

// Types for Module 8
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type InsertCommunicationLog = z.infer<typeof insertCommunicationLogSchema>;
export type CommunicationLog = typeof communicationLogs.$inferSelect;
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
  updatedAt: timestamp('updated_at').defaultNow()
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
  itemType: text('item_type').notNull(), // 'stock_model', 'custom_model', 'feature_item'
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
  updatedAt: timestamp('updated_at').defaultNow()
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
  isActive: z.boolean().default(true),
});

// BOM Types
export type InsertBomDefinition = z.infer<typeof insertBomDefinitionSchema>;
export type BomDefinition = typeof bomDefinitions.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
export type BomItem = typeof bomItems.$inferSelect;