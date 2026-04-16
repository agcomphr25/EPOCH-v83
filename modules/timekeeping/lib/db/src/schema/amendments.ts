import { pgTable, serial, integer, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { timesheetsTable } from "./timesheets";

export const amendmentsTable = pgTable("amendments", {
  id: serial("id").primaryKey(),
  timesheetId: integer("timesheet_id").notNull().references(() => timesheetsTable.id, { onDelete: "cascade" }),
  justification: text("justification").notNull(),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  status: text("status").notNull().default("pending"),
  createdBy: integer("created_by"),
  createdByEmail: text("created_by_email"),
  approvedBy: integer("approved_by"),
  approvedByEmail: text("approved_by_email"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAmendmentSchema = createInsertSchema(amendmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAmendment = z.infer<typeof insertAmendmentSchema>;
export type Amendment = typeof amendmentsTable.$inferSelect;
