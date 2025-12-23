type HumanUpsertedPayload = {
  event: "HUMAN_UPSERTED";
  source: "epoch";
  canonicalId: string;
  externalRef: { epochEmployeeId: number };
  displayName: string;
  email: string | null;
  status: "active" | "inactive";
  occurredAt: string;
};

const recentEmissions = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function generateDedupeKey(canonicalId: string, employeeId: number): string {
  return `${canonicalId}:${employeeId}`;
}

function isDuplicate(dedupeKey: string): boolean {
  const lastEmission = recentEmissions.get(dedupeKey);
  if (!lastEmission) return false;
  return Date.now() - lastEmission < DEDUP_WINDOW_MS;
}

function recordEmission(dedupeKey: string): void {
  recentEmissions.set(dedupeKey, Date.now());
  if (recentEmissions.size > 1000) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    recentEmissions.forEach((timestamp, key) => {
      if (now - timestamp > DEDUP_WINDOW_MS * 2) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => recentEmissions.delete(key));
  }
}

export function emitHumanUpserted(params: {
  canonicalId: string;
  epochEmployeeId: number;
  displayName: string;
  email: string | null;
  isActive: boolean;
}): void {
  const { canonicalId, epochEmployeeId, displayName, email, isActive } = params;
  
  const dedupeKey = generateDedupeKey(canonicalId, epochEmployeeId);
  if (isDuplicate(dedupeKey)) {
    console.log(`[IC-3] Skipping duplicate HUMAN_UPSERTED for ${canonicalId}`);
    return;
  }
  
  recordEmission(dedupeKey);
  
  const payload: HumanUpsertedPayload = {
    event: "HUMAN_UPSERTED",
    source: "epoch",
    canonicalId,
    externalRef: { epochEmployeeId },
    displayName,
    email,
    status: isActive ? "active" : "inactive",
    occurredAt: new Date().toISOString(),
  };

  setImmediate(() => {
    try {
      console.log(`[IC-3] HUMAN_UPSERTED emitted:`, JSON.stringify(payload));
    } catch (error) {
      console.error(`[IC-3] Failed to emit HUMAN_UPSERTED:`, error);
    }
  });
}
