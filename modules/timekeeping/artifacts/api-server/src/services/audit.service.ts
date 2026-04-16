import { db, auditLogTable } from "@workspace/db";
import type { SafeUser } from "./auth.service";

export interface AuditActor {
  id: number | null;
  email: string | null;
  role: string | null;
  ip: string | null;
}

export interface LogActionParams {
  tableName: string;
  recordId: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  actor: AuditActor;
}

export async function logAction(params: LogActionParams): Promise<void> {
  await db.insert(auditLogTable).values({
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

export function actorFromUser(user: SafeUser | null, ip: string | null): AuditActor {
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    role: user?.role ?? null,
    ip,
  };
}
