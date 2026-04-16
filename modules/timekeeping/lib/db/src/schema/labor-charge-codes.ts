import { pgTable, serial, text, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const laborChargeCodesTable = pgTable("labor_charge_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  type: text("type").notNull().default("direct"), // direct | indirect | overhead | g_and_a
  department: text("department"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  maxHoursPerDay: doublePrecision("max_hours_per_day"),
  billable: boolean("billable").notNull().default(true),
  wadChargeCode: text("wad_charge_code"),
  wadDepartment: text("wad_department"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborChargeCodeSchema = createInsertSchema(laborChargeCodesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLaborChargeCode = z.infer<typeof insertLaborChargeCodeSchema>;
export type LaborChargeCode = typeof laborChargeCodesTable.$inferSelect;
