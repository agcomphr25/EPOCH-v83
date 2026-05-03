import { db } from "../../../db";
import { policySettingsTable } from "../../schema/timekeeping";
import { eq } from "drizzle-orm";
import type { PolicySettings } from "../../schema/timekeeping";
import { logAction, type AuditActor } from "./audit.service";

export type { PolicySettings };

/**
 * Returns the single policy settings row, creating it with defaults if none exists.
 * Mirrors the pattern from settings.service.ts — always call this instead of
 * querying the table directly so the default row is guaranteed to exist.
 */
export async function getOrCreatePolicySettings(): Promise<PolicySettings> {
  const rows = await db.select().from(policySettingsTable).limit(1);
  if (rows.length > 0) return rows[0]!;
  const [created] = await db.insert(policySettingsTable).values({}).returning();
  return created!;
}

export async function updatePolicySettings(
  data: Partial<Omit<PolicySettings, "id" | "createdAt" | "updatedAt">>,
  actor: AuditActor
): Promise<PolicySettings | { error: string }> {
  if (data.minimumHoursPerWeek != null) {
    if (data.minimumHoursPerWeek < 0 || data.minimumHoursPerWeek > 168) {
      return { error: "minimumHoursPerWeek must be between 0 and 168" };
    }
  }
  if (data.lateSubmissionGraceDays != null) {
    if (
      !Number.isInteger(data.lateSubmissionGraceDays) ||
      data.lateSubmissionGraceDays < 0
    ) {
      return { error: "lateSubmissionGraceDays must be a non-negative integer" };
    }
  }
  if (
    data.certificationVersion != null &&
    (!Number.isInteger(data.certificationVersion) || data.certificationVersion < 1)
  ) {
    return { error: "certificationVersion must be a positive integer" };
  }
  if (
    data.certificationStatement != null &&
    data.certificationStatement.trim().length < 10
  ) {
    return { error: "certificationStatement must be at least 10 characters" };
  }

  const current = await getOrCreatePolicySettings();
  const [updated] = await db
    .update(policySettingsTable)
    .set(data)
    .where(eq(policySettingsTable.id, current.id))
    .returning();

  await logAction({
    tableName: "policy_settings",
    recordId: current.id,
    action: "UPDATE",
    oldValues: current as Record<string, unknown>,
    newValues: updated as Record<string, unknown>,
    actor,
  });

  return updated!;
}
