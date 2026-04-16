import { pgTable, serial, text, integer, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("My Company"),
  timezone: text("timezone").notNull().default("America/New_York"),
  overtimeThresholdDaily: doublePrecision("overtime_threshold_daily").notNull().default(8),
  overtimeThresholdWeekly: doublePrecision("overtime_threshold_weekly").notNull().default(40),
  roundingRuleMinutes: integer("rounding_rule_minutes").notNull().default(0),
  breakDurationMinutes: integer("break_duration_minutes").notNull().default(30),
  requireBreakAfterHours: doublePrecision("require_break_after_hours").notNull().default(6),
  workweekStartDay: integer("workweek_start_day").notNull().default(1),
  kioskRequirePin: boolean("kiosk_require_pin").notNull().default(false),
  kioskTimeoutSeconds: integer("kiosk_timeout_seconds").notNull().default(60),
  standardWorkWeekHours: doublePrecision("standard_work_week_hours").notNull().default(40),
  kioskMessage: text("kiosk_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
