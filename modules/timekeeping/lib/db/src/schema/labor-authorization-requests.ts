import { pgTable, serial, integer, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { laborAuthorizationsTable } from "./labor-authorizations";

export const laborAuthorizationRequestsTable = pgTable("labor_authorization_requests", {
  id: serial("id").primaryKey(),
  laborAuthorizationId: integer("labor_authorization_id").notNull().references(() => laborAuthorizationsTable.id),
  requestedBy: integer("requested_by").notNull().references(() => employeesTable.id),
  requestedHours: doublePrecision("requested_hours").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  reviewedBy: integer("reviewed_by").references(() => employeesTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLaborAuthorizationRequestSchema = createInsertSchema(laborAuthorizationRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLaborAuthorizationRequest = z.infer<typeof insertLaborAuthorizationRequestSchema>;
export type LaborAuthorizationRequest = typeof laborAuthorizationRequestsTable.$inferSelect;
