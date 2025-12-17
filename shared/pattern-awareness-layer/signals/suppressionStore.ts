interface SuppressionRecord {
  patternType: string;
  entityId: string;
  dismissedAt: string;
  expiresAt: string;
}

const suppressionMemory = new Map<string, SuppressionRecord>();

const SUPPRESSION_DAYS = 7;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function isSuppressed(stepId: string, patternType = 'cycle-time-drift'): boolean {
  const key = `${stepId}|${patternType}`;
  const record = suppressionMemory.get(key);

  if (!record) return false;

  const now = Date.now();
  return now < new Date(record.expiresAt).getTime();
}

export function suppress(stepId: string, patternType = 'cycle-time-drift'): void {
  const key = `${stepId}|${patternType}`;
  const now = new Date();
  const expires = new Date(now.getTime() + SUPPRESSION_DAYS * MS_IN_DAY);

  suppressionMemory.set(key, {
    patternType,
    entityId: stepId,
    dismissedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
}

export function clearSuppression(stepId: string, patternType = 'cycle-time-drift'): void {
  const key = `${stepId}|${patternType}`;
  suppressionMemory.delete(key);
}

export function getSuppressionRecord(stepId: string, patternType = 'cycle-time-drift'): SuppressionRecord | null {
  const key = `${stepId}|${patternType}`;
  return suppressionMemory.get(key) || null;
}
