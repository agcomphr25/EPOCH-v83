import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const dailyTimesheetsTable = pgTable("daily_timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  date: text("date").notNull(), // YYYY-MM-DD
  status: text("status").notNull().default("draft"), // draft | certified | approved
  totalHours: doublePrecision("total_hours").notNull().default(0),
  certifiedAt: timestamp("certified_at", { withTimezone: true }),
  certifiedBy: integer("certified_by").references(() => employeesTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: integer("approved_by").references(() => employeesTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyTimesheetSchema = createInsertSchema(dailyTimesheetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDailyTimesheet = z.infer<typeof insertDailyTimesheetSchema>;
export type DailyTimesheet = typeof dailyTimesheetsTable.$inferSelect;
