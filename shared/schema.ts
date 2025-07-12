import { pgTable, text, serial, integer, timestamp, jsonb, boolean, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
  date: timestamp("date").notNull(),
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
  type: text("type").notNull(), // 'dropdown', 'text', 'number', 'checkbox', 'textarea'
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
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
  type: z.enum(['dropdown', 'text', 'number', 'checkbox', 'textarea']),
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
