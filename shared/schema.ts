import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  percent: integer("percent").notNull(),
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
});

export const insertShortTermSaleSchema = createInsertSchema(shortTermSales).omit({
  id: true,
  createdAt: true,
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
