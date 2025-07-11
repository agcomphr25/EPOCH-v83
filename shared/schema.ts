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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertCSVData = z.infer<typeof insertCSVDataSchema>;
export type CSVData = typeof csvData.$inferSelect;
