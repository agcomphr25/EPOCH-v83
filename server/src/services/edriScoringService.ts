import { db } from '../../db';
import {
  edriScoreSnapshots,
  edriDomainScores,
  edriRedFlags,
  edriRemediationItems,
  edriAdminOverrides,
  dcaaAuditFindings,
  EdriScoreSnapshot,
  EdriDomainScore,
  EdriRedFlag,
  EdriRemediationItem,
  InsertEdriScoreSnapshot,
  InsertEdriDomainScore,
  InsertEdriRedFlag,
  InsertEdriRemediationItem,
  InsertEdriAdminOverride,
} from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  scoreTimekeeping,
  scoreChargeCode,
  scoreAccounting,
  scoreProcurement,
  scoreInventory,
  scorePolicy,
  scoreGovtProperty,
  DomainScorerResult,
} from './edriDomainScorers';
import { auditService } from './auditService';

const DOMAIN_WEIGHTS: Record<string, number> = {
  TIMEKEEPING: 0.30,
  CHARGE_CODE: 0.20,
  ACCOUNTING: 0.20,
  PROCUREMENT: 0.10,
  INVENTORY: 0.10,
  POLICY: 0.10,
  GOVT_PROPERTY: 0.00,
};

const SUBCONTRACTOR_WEIGHTS: Record<string, number> = {
  TIMEKEEPING: 0.35,
  PROCUREMENT: 0.20,
  INVENTORY: 0.20,
  POLICY: 0.15,
  ACCOUNTING: 0.10,
};

const PRIME_WEIGHTS: Record<string, number> = {
  ACCOUNTING: 0.30,
  CHARGE_CODE: 0.25,
  TIMEKEEPING: 0.25,
  POLICY: 0.10,
  PROCUREMENT: 0.10,
};

export function getScoringBand(score: number): string {
  if (score >= 95) return 'AUDIT_DEFENSIBLE';
  if (score >= 85) return 'CONDITIONALLY_PASSABLE';
  if (score >= 70) return 'HIGH_RISK';
  if (score >= 55) return 'MATERIAL_DEFICIENCY';
  return 'AUDIT_FAILURE';
}

export function computeFailureProbability(
  compositeScore: number,
  criticalFlagCount: number,
  highFlagCount: number,
  resolvedRemediationCount: number,
  forensicCriticalCount: number = 0,
  forensicHighCount: number = 0,
): number {
  let prob = 100 - compositeScore
    + (criticalFlagCount * 5)
    + (highFlagCount * 2)
    - (resolvedRemediationCount * 1)
    + (forensicCriticalCount * 5)
    + (forensicHighCount * 2);
  return Math.max(0, Math.min(100, prob));
}

export interface SnapshotWithChildren {
  snapshot: EdriScoreSnapshot;
  domainScores: EdriDomainScore[];
  redFlags: EdriRedFlag[];
  remediationItems: EdriRemediationItem[];
}

export async function computeEdriSnapshot(userId?: number, userDisplayName?: string): Promise<SnapshotWithChildren> {
  const scorers: Record<string, () => Promise<DomainScorerResult>> = {
    TIMEKEEPING: scoreTimekeeping,
    CHARGE_CODE: scoreChargeCode,
    ACCOUNTING: scoreAccounting,
    PROCUREMENT: scoreProcurement,
    INVENTORY: scoreInventory,
    POLICY: scorePolicy,
    GOVT_PROPERTY: scoreGovtProperty,
  };

  const domainResults: Record<string, DomainScorerResult> = {};
  for (const [key, scorer] of Object.entries(scorers)) {
    try {
      domainResults[key] = await scorer();
    } catch (err) {
      console.error(`EDRI scorer failed for ${key}:`, err);
      domainResults[key] = {
        rawScore: 50, checks: {}, redFlags: [], remediationItems: [],
        evidenceItems: [{ label: 'Error', value: 'Scorer failed — default 50' }],
      };
    }
  }

  // Build normalized weights — GOVT_PROPERTY=0, redistribute proportionally
  const activeWeights: Record<string, number> = {};
  for (const [k, w] of Object.entries(DOMAIN_WEIGHTS)) {
    if (w > 0) activeWeights[k] = w;
  }
  const activeTotal = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  const normalizedWeights: Record<string, number> = {};
  for (const [k, w] of Object.entries(activeWeights)) {
    normalizedWeights[k] = w / activeTotal;
  }

  let compositeScore = 0;
  for (const [key, weight] of Object.entries(normalizedWeights)) {
    compositeScore += (domainResults[key]?.rawScore ?? 50) * weight;
  }
  compositeScore = Math.max(0, Math.min(100, compositeScore));

  // Dual scores
  let subcontractorScore = 0;
  for (const [key, weight] of Object.entries(SUBCONTRACTOR_WEIGHTS)) {
    subcontractorScore += (domainResults[key]?.rawScore ?? 50) * weight;
  }
  subcontractorScore = Math.max(0, Math.min(100, subcontractorScore));

  let primeScore = 0;
  for (const [key, weight] of Object.entries(PRIME_WEIGHTS)) {
    primeScore += (domainResults[key]?.rawScore ?? 50) * weight;
  }
  primeScore = Math.max(0, Math.min(100, primeScore));

  const allRedFlags = Object.values(domainResults).flatMap(r => r.redFlags);
  const criticalCount = allRedFlags.filter(f => f.severity === 'CRITICAL').length;
  const highCount = allRedFlags.filter(f => f.severity === 'HIGH').length;

  // Count resolved remediation items from the last 30 days (current-state scope only)
  const resolvedCountRows = await db.select({ cnt: sql<number>`count(*)::int` }).from(edriRemediationItems)
    .where(sql`status = 'RESOLVED' AND snapshot_id IN (
      SELECT id FROM edri_score_snapshots
      WHERE computed_at >= NOW() - INTERVAL '30 days'
    )`);
  const resolvedRemediationCount = resolvedCountRows[0]?.cnt ?? 0;

  // Query forensic findings for open critical and high violations
  let forensicCriticalCount = 0;
  let forensicHighCount = 0;
  try {
    const forensicRows = await db
      .select({
        severity: dcaaAuditFindings.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(dcaaAuditFindings)
      .where(sql`status = 'open' AND severity IN ('critical', 'high')`)
      .groupBy(dcaaAuditFindings.severity);
    for (const row of forensicRows) {
      if (row.severity === 'critical') forensicCriticalCount = row.count;
      if (row.severity === 'high') forensicHighCount = row.count;
    }
  } catch {
    // Table may not exist yet — skip silently
  }

  const failureProbability = computeFailureProbability(compositeScore, criticalCount, highCount, resolvedRemediationCount, forensicCriticalCount, forensicHighCount);
  const scoringBand = getScoringBand(compositeScore);

  const domainScoresMap: Record<string, number> = {};
  const domainWeightsMap: Record<string, number> = {};
  for (const key of Object.keys(normalizedWeights)) {
    domainScoresMap[key] = domainResults[key]?.rawScore ?? 50;
    domainWeightsMap[key] = normalizedWeights[key];
  }

  // Create snapshot — use explicit types, no `as any`
  const snapshotInsert: InsertEdriScoreSnapshot = {
    computedByUserId: userId ?? null,
    computedByDisplayName: userDisplayName ?? 'System',
    subcontractorScore: subcontractorScore.toFixed(2),
    primeScore: primeScore.toFixed(2),
    compositeScore: compositeScore.toFixed(2),
    scoringBand,
    failureProbability: failureProbability.toFixed(2),
    futureStateScore: compositeScore.toFixed(2),
    domainScores: domainScoresMap,
    domainWeights: domainWeightsMap,
    isOverride: false,
  };

  const [snapshot] = await db.insert(edriScoreSnapshots).values(snapshotInsert).returning();

  // Insert domain scores
  const domainScoreRows: InsertEdriDomainScore[] = Object.entries(normalizedWeights).map(([key, weight]) => {
    const result = domainResults[key];
    const contribution = (result?.rawScore ?? 50) * weight;
    return {
      snapshotId: snapshot.id,
      domainKey: key,
      rawScore: (result?.rawScore ?? 50).toFixed(2),
      weight: weight.toFixed(4),
      weightedContribution: contribution.toFixed(2),
      evidenceCount: result?.evidenceItems?.length ?? 0,
      gapCount: result?.redFlags?.length ?? 0,
      redFlagCount: result?.redFlags?.length ?? 0,
      subScores: result?.checks ?? {},
      evidenceItems: result?.evidenceItems ?? [],
    };
  });

  const insertedDomainScores = domainScoreRows.length > 0
    ? await db.insert(edriDomainScores).values(domainScoreRows).returning()
    : [];

  // ─── Remediation reconciliation ──────────────────────────────────────────
  // Stable-identity upsert approach:
  //   - Identity = (domainKey, flagKey) — a persistent violation condition
  //   - If condition existed in a previous snapshot, carry over status/assignment from that item
  //   - If condition cleared (not in new compute), mark previous item resolved
  //   - If condition is new or was manually RESOLVED/WAIVED but condition returned → reopen

  // Load the previous non-derived (non-override) snapshot for carry-over lookup
  const prevSnapshots = await db.select().from(edriScoreSnapshots)
    .orderBy(desc(edriScoreSnapshots.computedAt))
    .limit(10);
  const prevSnapshot = prevSnapshots.find(s => s.id !== snapshot.id && !s.isOverride);

  // Load all flags+items from previous snapshot for carry-over
  interface PrevItem { flagKey: string; domainKey: string; status: string; assignedToUserId: number | null; assignedToDisplayName: string | null; dueDate: string | null; waiverJustification: string | null; }
  const prevRemItems: PrevItem[] = prevSnapshot
    ? (await db.select({
        flagKey: sql<string>`COALESCE(flag_key, '')`,
        domainKey: edriRemediationItems.domainKey,
        status: edriRemediationItems.status,
        assignedToUserId: edriRemediationItems.assignedToUserId,
        assignedToDisplayName: edriRemediationItems.assignedToDisplayName,
        dueDate: edriRemediationItems.dueDate,
        waiverJustification: edriRemediationItems.waiverJustification,
      }).from(edriRemediationItems).where(eq(edriRemediationItems.snapshotId, prevSnapshot.id)))
    : [];

  // Build a lookup map: (domainKey+flagKey) → previous item
  const prevItemMap = new Map<string, PrevItem>();
  for (const item of prevRemItems) {
    prevItemMap.set(`${item.domainKey}:${item.flagKey}`, item);
  }

  const prevActiveFlags: EdriRedFlag[] = prevSnapshot
    ? await db.select().from(edriRedFlags).where(
        and(eq(edriRedFlags.snapshotId, prevSnapshot.id), sql`is_active = true`)
      )
    : [];

  // Keys of conditions that are STILL triggering in this new compute
  const newFlagKeys = new Set(allRedFlags.map(f => f.flagKey));

  // Auto-resolve previous active flags whose condition has cleared
  const autoResolvedFlagKeys: string[] = [];
  const flagsToAutoResolve = prevActiveFlags.filter(f => !newFlagKeys.has(f.flagKey));
  if (flagsToAutoResolve.length > 0) {
    for (const flag of flagsToAutoResolve) {
      await db.update(edriRedFlags)
        .set({ isActive: false, resolvedAt: new Date(), resolutionNote: 'Auto-resolved: condition cleared on recompute' })
        .where(eq(edriRedFlags.id, flag.id));
      autoResolvedFlagKeys.push(flag.flagKey);
    }
    console.log(`[EDRI] Auto-resolved ${flagsToAutoResolve.length} flags whose conditions cleared: ${autoResolvedFlagKeys.join(', ')}`);
  }

  // Insert red flags for NEW snapshot — all conditions still active
  const allRedFlagRows: InsertEdriRedFlag[] = allRedFlags.map(f => ({
    snapshotId: snapshot.id,
    domainKey: f.domainKey,
    flagKey: f.flagKey,
    severity: f.severity,
    title: f.title,
    description: f.description,
    farCitation: f.farCitation ?? null,
    potentialScoreRecovery: (f.potentialScoreRecovery ?? 0).toString(),
    isActive: true,
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedByDisplayName: null,
    resolutionNote: null,
  }));

  const insertedFlags = allRedFlagRows.length > 0
    ? await db.insert(edriRedFlags).values(allRedFlagRows).returning()
    : [];

  // Build remediation items — carry over status/assignment from previous snapshot item
  // when the condition identity (domainKey+flagKey) matches.
  const allRemItems = Object.values(domainResults).flatMap(r => r.remediationItems);
  const remediationRows: InsertEdriRemediationItem[] = allRemItems.map(item => {
    const matchingFlag = insertedFlags.find(f => f.flagKey === item.flagKey);
    const prevItem = prevItemMap.get(`${item.domainKey}:${item.flagKey}`);

    // Determine status: carry over IN_PROGRESS; reopen RESOLVED/WAIVED since condition returned
    let status: string = 'OPEN';
    if (prevItem) {
      if (prevItem.status === 'IN_PROGRESS') {
        status = 'IN_PROGRESS'; // Condition still active — keep in-progress
      }
      // RESOLVED or WAIVED but condition returned → reopen (OPEN)
      // OPEN stays OPEN
    }

    return {
      snapshotId: snapshot.id,
      redFlagId: matchingFlag?.id ?? null,
      domainKey: item.domainKey,
      flagKey: item.flagKey,
      title: item.title,
      description: item.description,
      priority: item.priority,
      potentialScoreRecovery: (item.potentialScoreRecovery ?? 0).toString(),
      status,
      // Carry over assignment from previous item for same condition
      assignedToUserId: prevItem?.assignedToUserId ?? null,
      assignedToDisplayName: prevItem?.assignedToDisplayName ?? null,
      dueDate: prevItem?.dueDate ?? null,
      statusChangedByUserId: null,
      statusChangedByDisplayName: null,
      waiverJustification: null,
    };
  });

  const insertedRemItems = remediationRows.length > 0
    ? await db.insert(edriRemediationItems).values(remediationRows).returning()
    : [];

  // Audit log for auto-created remediation items
  if (insertedRemItems.length > 0) {
    try {
      await auditService.logEvent({
        entityType: 'edri_snapshot',
        entityId: `edri-snapshot-${snapshot.id}`,
        action: 'EDRI_REMEDIATION_ITEMS_CREATED',
        actor: { id: userId, username: userDisplayName ?? 'system', role: 'SYSTEM' },
        meta: {
          resource_type: 'EDRI',
          snapshotId: snapshot.id,
          itemCount: insertedRemItems.length,
          autoResolvedFlagCount: flagsToAutoResolve.length,
          autoResolvedFlagKeys,
        },
      });
    } catch (auditErr) {
      console.error('[EDRI] Failed to write remediation audit log:', auditErr instanceof Error ? auditErr.message : auditErr);
    }
  }

  // Compute future state score
  const totalRecovery = allRemItems.reduce((sum, item) => sum + (item.potentialScoreRecovery ?? 0), 0);
  const futureStateScore = Math.min(100, compositeScore + totalRecovery);

  await db.update(edriScoreSnapshots)
    .set({ futureStateScore: futureStateScore.toFixed(2) })
    .where(eq(edriScoreSnapshots.id, snapshot.id));

  const finalSnapshot = { ...snapshot, futureStateScore: futureStateScore.toFixed(2) };

  return {
    snapshot: finalSnapshot,
    domainScores: insertedDomainScores,
    redFlags: insertedFlags,
    remediationItems: insertedRemItems,
  };
}

export async function getLatestSnapshot(): Promise<SnapshotWithChildren | null> {
  const snapshots = await db.select().from(edriScoreSnapshots)
    .orderBy(desc(edriScoreSnapshots.computedAt))
    .limit(1);

  if (snapshots.length === 0) return null;
  const snapshot = snapshots[0];

  const [domainScoresArr, redFlagsArr, remItemsArr] = await Promise.all([
    db.select().from(edriDomainScores).where(eq(edriDomainScores.snapshotId, snapshot.id)),
    db.select().from(edriRedFlags).where(eq(edriRedFlags.snapshotId, snapshot.id)),
    db.select().from(edriRemediationItems).where(eq(edriRemediationItems.snapshotId, snapshot.id)),
  ]);

  return { snapshot, domainScores: domainScoresArr, redFlags: redFlagsArr, remediationItems: remItemsArr };
}

export async function getSnapshotById(id: number): Promise<SnapshotWithChildren | null> {
  const snapshots = await db.select().from(edriScoreSnapshots).where(eq(edriScoreSnapshots.id, id)).limit(1);
  if (snapshots.length === 0) return null;
  const snapshot = snapshots[0];

  const [domainScoresArr, redFlagsArr, remItemsArr] = await Promise.all([
    db.select().from(edriDomainScores).where(eq(edriDomainScores.snapshotId, id)),
    db.select().from(edriRedFlags).where(eq(edriRedFlags.snapshotId, id)),
    db.select().from(edriRemediationItems).where(eq(edriRemediationItems.snapshotId, id)),
  ]);

  return { snapshot, domainScores: domainScoresArr, redFlags: redFlagsArr, remediationItems: remItemsArr };
}

export async function getSnapshotHistory(limit = 20, offset = 0): Promise<EdriScoreSnapshot[]> {
  return db.select().from(edriScoreSnapshots)
    .orderBy(desc(edriScoreSnapshots.computedAt))
    .limit(limit)
    .offset(offset);
}

export async function applyAdminOverride(
  snapshotId: number,
  domainKey: string | null,
  overrideScore: number,
  justification: string,
  userId: number,
  userDisplayName: string,
): Promise<void> {
  // Snapshots are IMMUTABLE once written. Overrides produce a new derived snapshot record
  // with isOverride=true, preserving the original computed record unchanged.
  const snapshots = await db.select().from(edriScoreSnapshots).where(eq(edriScoreSnapshots.id, snapshotId)).limit(1);
  if (snapshots.length === 0) throw new Error('Snapshot not found');
  const snapshot = snapshots[0];

  const domainScoresObj: Record<string, number> = { ...((snapshot.domainScores as Record<string, number>) ?? {}) };
  const originalScore = domainKey
    ? (domainScoresObj[domainKey] ?? Number(snapshot.compositeScore))
    : Number(snapshot.compositeScore);

  // Record override in audit table
  const overrideInsert: InsertEdriAdminOverride = {
    snapshotId,
    overridingUserId: userId,
    overridingDisplayName: userDisplayName,
    domainKey: domainKey ?? null,
    originalScore: originalScore.toString(),
    overrideScore: overrideScore.toString(),
    justification,
  };
  await db.insert(edriAdminOverrides).values(overrideInsert);

  // Compute the derived composite score
  let newComposite: number;
  if (domainKey) {
    domainScoresObj[domainKey] = overrideScore;
    const weights = (snapshot.domainWeights as Record<string, number>) ?? {};
    newComposite = 0;
    for (const [k, w] of Object.entries(weights)) {
      newComposite += (domainScoresObj[k] ?? 50) * w;
    }
    newComposite = Math.max(0, Math.min(100, newComposite));
  } else {
    newComposite = Math.max(0, Math.min(100, overrideScore));
  }

  // Write a NEW derived snapshot (append-only, never mutate existing)
  const derivedInsert: InsertEdriScoreSnapshot = {
    computedByUserId: userId,
    computedByDisplayName: userDisplayName,
    subcontractorScore: snapshot.subcontractorScore,
    primeScore: snapshot.primeScore,
    compositeScore: newComposite.toFixed(2),
    scoringBand: getScoringBand(newComposite),
    failureProbability: snapshot.failureProbability,
    futureStateScore: snapshot.futureStateScore,
    domainScores: domainScoresObj,
    domainWeights: snapshot.domainWeights,
    isOverride: true,
  };
  const [derivedSnapshot] = await db.insert(edriScoreSnapshots).values(derivedInsert).returning();

  // Replicate child records from the base snapshot into the derived snapshot so that
  // getLatestSnapshot() returns a fully functional snapshot with children intact.
  // Domain scores are copied with the updated domain scores map applied.
  const baseDomainScores = await db.select().from(edriDomainScores).where(eq(edriDomainScores.snapshotId, snapshotId));
  if (baseDomainScores.length > 0) {
    const derivedDomainRows: InsertEdriDomainScore[] = baseDomainScores.map(ds => ({
      snapshotId: derivedSnapshot.id,
      domainKey: ds.domainKey,
      rawScore: domainKey === ds.domainKey ? overrideScore.toFixed(2) : ds.rawScore,
      weight: ds.weight,
      weightedContribution: domainKey === ds.domainKey
        ? (overrideScore * Number(ds.weight)).toFixed(2)
        : ds.weightedContribution,
      evidenceCount: ds.evidenceCount,
      gapCount: ds.gapCount,
      redFlagCount: ds.redFlagCount,
      subScores: (ds.subScores ?? {}) as Record<string, number>,
      evidenceItems: (ds.evidenceItems ?? []) as Array<{ label: string; value: unknown }>,
    }));
    await db.insert(edriDomainScores).values(derivedDomainRows);
  }

  // Copy ALL red flags from base snapshot to derived snapshot (active and resolved)
  const baseRedFlags = await db.select().from(edriRedFlags)
    .where(eq(edriRedFlags.snapshotId, snapshotId));
  if (baseRedFlags.length > 0) {
    const derivedFlagRows: InsertEdriRedFlag[] = baseRedFlags.map(f => ({
      snapshotId: derivedSnapshot.id,
      domainKey: f.domainKey,
      flagKey: f.flagKey,
      severity: f.severity,
      title: f.title,
      description: f.description,
      farCitation: f.farCitation,
      potentialScoreRecovery: f.potentialScoreRecovery,
      isActive: true,
      resolvedAt: null,
      resolvedByUserId: null,
      resolvedByDisplayName: null,
      resolutionNote: null,
    }));
    const insertedDerivedFlags = await db.insert(edriRedFlags).values(derivedFlagRows).returning();

    // Copy ALL remediation items (all statuses) from base snapshot to preserve complete history
    const baseRemItems = await db.select().from(edriRemediationItems)
      .where(eq(edriRemediationItems.snapshotId, snapshotId));
    if (baseRemItems.length > 0) {
      const derivedRemRows: InsertEdriRemediationItem[] = baseRemItems.map(item => {
        const matchingFlag = insertedDerivedFlags.find(f => f.flagKey === item.flagKey);
        return {
          snapshotId: derivedSnapshot.id,
          redFlagId: matchingFlag?.id ?? null,
          domainKey: item.domainKey,
          flagKey: item.flagKey,
          title: item.title,
          description: item.description,
          priority: item.priority,
          potentialScoreRecovery: item.potentialScoreRecovery,
          status: item.status,
          assignedToUserId: item.assignedToUserId,
          assignedToDisplayName: item.assignedToDisplayName,
          dueDate: item.dueDate,
          statusChangedByUserId: null,
          statusChangedByDisplayName: null,
          waiverJustification: item.waiverJustification,
        };
      });
      await db.insert(edriRemediationItems).values(derivedRemRows);
    }
  }
}

export async function computeFutureStateScore(snapshotId: number): Promise<number> {
  const snapshots = await db.select().from(edriScoreSnapshots).where(eq(edriScoreSnapshots.id, snapshotId)).limit(1);
  if (snapshots.length === 0) return 0;
  const snapshot = snapshots[0];

  const openItems = await db.select().from(edriRemediationItems)
    .where(and(eq(edriRemediationItems.snapshotId, snapshotId), eq(edriRemediationItems.status, 'OPEN')));

  const totalRecovery = openItems.reduce((sum, item) => sum + Number(item.potentialScoreRecovery ?? 0), 0);
  return Math.min(100, Number(snapshot.compositeScore) + totalRecovery);
}
