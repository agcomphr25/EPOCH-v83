import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const costCodesTable = pgTable("cost_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCostCodeSchema = createInsertSchema(costCodesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCostCode = z.infer<typeof insertCostCodeSchema>;
export type CostCode = typeof costCodesTable.$inferSelect;
