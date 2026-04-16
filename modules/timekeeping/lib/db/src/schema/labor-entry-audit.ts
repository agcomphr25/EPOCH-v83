import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const laborEntryAuditTable = pgTable("labor_entry_audit", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(), // INSERT | UPDATE | DELETE
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  actorId: integer("actor_id"),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LaborEntryAudit = typeof laborEntryAuditTable.$inferSelect;
