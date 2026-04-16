import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";

export const punchesTable = pgTable("punches", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull().defaultNow(),
  timezone: text("timezone").notNull().default("UTC"),
  note: text("note"),
  source: text("source").notNull().default("web"),
  isEdited: boolean("is_edited").notNull().default(false),
  editNote: text("edit_note"),
  costCode: text("cost_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPunchSchema = createInsertSchema(punchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPunch = z.infer<typeof insertPunchSchema>;
export type Punch = typeof punchesTable.$inferSelect;
