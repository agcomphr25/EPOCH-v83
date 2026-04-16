import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Settings } from "@workspace/db";
import { logAction, type AuditActor } from "./audit.service";

export type { Settings };

/**
 * Returns the single settings row, creating it with defaults if none exists.
 * This is the canonical entry point for reading company configuration.
 */
export async function getOrCreateSettings(): Promise<Settings> {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length > 0) return rows[0]!;
  const [created] = await db.insert(settingsTable).values({}).returning();
  return created!;
}

export async function updateSettings(
  data: Partial<Omit<Settings, "id" | "createdAt" | "updatedAt">>,
  actor: AuditActor
): Promise<Settings | { error: string }> {
  if (data.kioskTimeoutSeconds != null) {
    const v = data.kioskTimeoutSeconds;
    if (!Number.isInteger(v) || v < 10 || v > 600) {
      return { error: "kioskTimeoutSeconds must be an integer between 10 and 600" };
    }
  }

  const current = await getOrCreateSettings();
  const [updated] = await db
    .update(settingsTable)
    .set(data)
    .where(eq(settingsTable.id, current.id))
    .returning();

  await logAction({
    tableName: "settings",
    recordId: current.id,
    action: "UPDATE",
    oldValues: current as Record<string, unknown>,
    newValues: updated as Record<string, unknown>,
    actor,
  });

  return updated!;
}
