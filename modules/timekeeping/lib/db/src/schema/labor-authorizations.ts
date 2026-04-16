import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { laborChargeCodesTable } from "./labor-charge-codes";

export const laborAuthorizationsTable = pgTable("labor_authorizations", {
  id: serial("id").primaryKey(),
  chargeCodeId: integer("charge_code_id").notNull().references(() => laborChargeCodesTable.id),
  projectId: text("project_id"),
  workOrderId: text("work_order_id"),
  travelerId: text("traveler_id"),
  description: text("description"),
  authorizedHours: doublePrecision("authorized_hours").notNull(),
  approvedExtraHours: doublePrecision("approved_extra_hours").notNull().default(0),
  consumedHours: doublePrecision("consumed_hours").notNull().default(0),
  status: text("status").notNull().default("active"), // active | closed | cancelled
  createdBy: integer("created_by").references(() => employeesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborAuthorizationSchema = createInsertSchema(laborAuthorizationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLaborAuthorization = z.infer<typeof insertLaborAuthorizationSchema>;
export type LaborAuthorization = typeof laborAuthorizationsTable.$inferSelect;
