import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { laborWorkSessionsTable } from "./labor-work-sessions";

export const laborTimeClockPunchesTable = pgTable("labor_time_clock_punches", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  sessionId: integer("session_id").references(() => laborWorkSessionsTable.id),
  type: text("type").notNull(), // clock_in | clock_out
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull().defaultNow(),
  timezone: text("timezone").notNull().default("UTC"),
  source: text("source").notNull().default("web"), // web | kiosk | api
  note: text("note"),
  isEdited: boolean("is_edited").notNull().default(false),
  editNote: text("edit_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborTimeClockPunchSchema = createInsertSchema(laborTimeClockPunchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLaborTimeClockPunch = z.infer<typeof insertLaborTimeClockPunchSchema>;
export type LaborTimeClockPunch = typeof laborTimeClockPunchesTable.$inferSelect;
