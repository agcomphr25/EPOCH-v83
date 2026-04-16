import { pgTable, serial, integer, text, timestamp, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const timesheetsTable = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("draft"),
  totalHours: doublePrecision("total_hours").notNull().default(0),
  regularHours: doublePrecision("regular_hours").notNull().default(0),
  overtimeHours: doublePrecision("overtime_hours").notNull().default(0),
  rejectionNote: text("rejection_note"),

  employeeAttested: boolean("employee_attested").notNull().default(false),
  attestedAt: timestamp("attested_at", { withTimezone: true }),

  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: integer("submitted_by"),

  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
  reviewerEmail: text("reviewer_email"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTimesheetSchema = createInsertSchema(timesheetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Timesheet = typeof timesheetsTable.$inferSelect;
