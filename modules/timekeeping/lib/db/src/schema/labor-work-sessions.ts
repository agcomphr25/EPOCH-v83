import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { laborChargeCodesTable } from "./labor-charge-codes";
import { laborAuthorizationsTable } from "./labor-authorizations";

export const laborWorkSessionsTable = pgTable("labor_work_sessions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  chargeCodeId: integer("charge_code_id").notNull().references(() => laborChargeCodesTable.id),
  laborAuthorizationId: integer("labor_authorization_id").references(() => laborAuthorizationsTable.id),
  projectId: text("project_id"),
  workOrderId: text("work_order_id"),
  travelerId: text("traveler_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  totalHours: doublePrecision("total_hours"),
  status: text("status").notNull().default("open"), // open | closed | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborWorkSessionSchema = createInsertSchema(laborWorkSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLaborWorkSession = z.infer<typeof insertLaborWorkSessionSchema>;
export type LaborWorkSession = typeof laborWorkSessionsTable.$inferSelect;
