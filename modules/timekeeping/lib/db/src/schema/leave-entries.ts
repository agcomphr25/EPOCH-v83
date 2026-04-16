import { pgTable, serial, integer, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const leaveEntriesTable = pgTable("leave_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  leaveType: text("leave_type").notNull(),
  hours: doublePrecision("hours").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeaveEntrySchema = createInsertSchema(leaveEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveEntry = z.infer<typeof insertLeaveEntrySchema>;
export type LeaveEntry = typeof leaveEntriesTable.$inferSelect;
