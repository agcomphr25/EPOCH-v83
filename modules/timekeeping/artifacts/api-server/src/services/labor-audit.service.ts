import { db, laborEntryAuditTable } from "@workspace/db";
import type { AuditActor } from "./audit.service";

export interface LaborLogParams {
  tableName: string;
  recordId: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  actor: AuditActor;
}

/** Accepts the root db or a transaction client (both expose `.insert()`). */
type AuditClient = Pick<typeof db, "insert">;

export async function logLaborAction(params: LaborLogParams, client: AuditClient = db): Promise<void> {
  await client.insert(laborEntryAuditTable).values({
    tableName: params.tableName,
    recordId: params.recordId,
    action: params.action,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    actorId: params.actor.id,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    ipAddress: params.actor.ip,
  });
}
